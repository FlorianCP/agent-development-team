import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createReadStream, constants as fsConstants } from 'node:fs';
import {
  access,
  mkdtemp,
  readFile,
  realpath,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { delimiter, dirname, join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import type { Provider, ProviderOptions } from './provider.js';

interface CodexProviderConfig {
  codexPath?: string;
  defaultTimeoutMs?: number;
  trustedInstallDirs?: string[];
}

type CodexErrorCode =
  | 'BINARY_NOT_FOUND'
  | 'BINARY_VALIDATION_FAILED'
  | 'SPAWN_FAILED'
  | 'NON_ZERO_EXIT'
  | 'TIMEOUT'
  | 'COMMAND_POLICY_VIOLATION'
  | 'SECRET_LEAK_DETECTED';

interface EffectiveCommandPolicy {
  allowedPrefixes: string[];
  blockedPatterns: RegExp[];
}

interface CommandTelemetryAudit {
  telemetrySeen: boolean;
  ambiguousCommandEvents: number;
  executedCommands: string[];
}

class CodexExecutionError extends Error {
  code: CodexErrorCode;
  details?: Record<string, unknown>;

  constructor(message: string, code: CodexErrorCode, details?: Record<string, unknown>) {
    super(message);
    this.name = 'CodexExecutionError';
    this.code = code;
    this.details = details;
  }
}

export class CodexProvider implements Provider {
  name = 'codex';

  private static readonly DEFAULT_TRUSTED_INSTALL_DIRS = process.platform === 'win32'
    ? [
        'C:\\Program Files\\Codex',
        'C:\\Program Files\\nodejs',
      ]
    : [
        '/usr/local/bin',
        '/opt/homebrew/bin',
        '/usr/bin',
        '/bin',
      ];

  private model?: string;
  private readonly codexBinaryPathPromise: Promise<string>;
  private readonly defaultTimeoutMs: number;
  private readonly debugOutput: boolean;
  private readonly trustedInstallDirs: string[];

  constructor(model?: string, config?: CodexProviderConfig) {
    this.model = model;
    this.defaultTimeoutMs = config?.defaultTimeoutMs ?? 3600000;
    this.debugOutput = process.env['ADT_DEBUG'] === '1';
    this.trustedInstallDirs = (config?.trustedInstallDirs ?? CodexProvider.DEFAULT_TRUSTED_INSTALL_DIRS)
      .map(dir => resolve(dir));

    const explicitPath = config?.codexPath ?? process.env['ADT_CODEX_PATH'];
    this.codexBinaryPathPromise = explicitPath
      ? this.validateCodexBinary(explicitPath, false)
      : this.resolveCodexBinaryPath();
  }

  async execute(prompt: string, options?: ProviderOptions): Promise<string> {
    const tmpDir = await mkdtemp(join(tmpdir(), 'adt-'));
    const outputFile = join(tmpDir, `output-${randomBytes(4).toString('hex')}.md`);
    const promptFile = join(tmpDir, `prompt-${randomBytes(4).toString('hex')}.md`);

    const isHighTrust = options?.trustMode === 'high';
    const commandPolicy = isHighTrust
      ? this.prepareCommandPolicy(options?.commandPolicy)
      : undefined;

    try {
      await writeFile(promptFile, prompt, 'utf-8');

      const args = ['exec'];
      const sandbox = options?.sandbox ?? 'read-only';
      args.push('-s', sandbox);

      if (isHighTrust) {
        args.push('--full-auto', '--json');
      }

      if (options?.workingDir) {
        args.push('-C', options.workingDir);
      }

      const model = options?.model ?? this.model;
      if (model) {
        args.push('-m', model);
      }

      args.push('-o', outputFile);
      args.push('--ephemeral');

      const timeoutMs = options?.timeoutMs ?? this.defaultTimeoutMs;
      const codexBinaryPath = await this.codexBinaryPathPromise;

      const output = await this.spawnCodex({
        codexBinaryPath,
        args,
        promptFile,
        timeoutMs,
        workingDir: options?.workingDir,
        providerOptions: options,
        commandPolicy,
      });

      let finalOutput: string;
      try {
        finalOutput = await readFile(outputFile, 'utf-8');
      } catch {
        // If no output file was created, use stdout.
        finalOutput = output;
      }

      return this.guardAgainstSecretLeak(finalOutput);
    } finally {
      await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  private async spawnCodex(params: {
    codexBinaryPath: string;
    args: string[];
    promptFile: string;
    timeoutMs: number;
    workingDir?: string;
    providerOptions?: ProviderOptions;
    commandPolicy?: EffectiveCommandPolicy;
  }): Promise<string> {
    const {
      codexBinaryPath,
      args,
      promptFile,
      timeoutMs,
      workingDir,
      providerOptions,
      commandPolicy,
    } = params;

    return new Promise((resolvePromise, rejectPromise) => {
      const child = spawn(codexBinaryPath, args, {
        cwd: workingDir,
        env: this.createSpawnEnv(codexBinaryPath, providerOptions),
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';
      let timedOut = false;
      let exited = false;
      let killTimeoutHandle: NodeJS.Timeout | null = null;
      const telemetryCollector = commandPolicy ? new CommandTelemetryCollector() : null;

      const timeoutHandle = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
        killTimeoutHandle = setTimeout(() => {
          if (!exited) {
            child.kill('SIGKILL');
          }
        }, 1500);
        killTimeoutHandle.unref();
      }, timeoutMs);

      child.stdout.on('data', (data: Buffer) => {
        const chunk = data.toString();
        stdout = this.appendOutput(stdout, chunk);
        telemetryCollector?.ingest(chunk);
      });

      child.stderr.on('data', (data: Buffer) => {
        stderr = this.appendOutput(stderr, data.toString());
      });

      const readStream = createReadStream(promptFile);
      child.stdin.on('error', () => {
        // Child process can close stdin early; ignore pipe shutdown errors.
      });
      readStream.on('error', () => {
        // Prompt file was created by this process and should be readable.
      });
      readStream.pipe(child.stdin);

      child.on('exit', () => {
        exited = true;
      });

      child.on('close', (code) => {
        clearTimeout(timeoutHandle);
        if (killTimeoutHandle) {
          clearTimeout(killTimeoutHandle);
        }
        readStream.destroy();

        if (timedOut) {
          rejectPromise(
            new CodexExecutionError(
              `codex exec timed out after ${timeoutMs}ms`,
              'TIMEOUT',
              { timeoutMs },
            ),
          );
          return;
        }

        if (code !== 0) {
          rejectPromise(
            new CodexExecutionError(
              `codex exec exited with code ${code}. ${this.formatOutputSummary(stdout, stderr)}`,
              'NON_ZERO_EXIT',
              {
                exitCode: code,
                ...(this.debugOutput
                  ? {
                      stdout: this.redactAndTruncate(stdout),
                      stderr: this.redactAndTruncate(stderr),
                    }
                  : {}),
              },
            ),
          );
          return;
        }

        if (commandPolicy && telemetryCollector) {
          telemetryCollector.finalize();
          try {
            this.enforceHighTrustCommandPolicy(
              telemetryCollector.buildAudit(),
              commandPolicy,
            );
          } catch (error) {
            rejectPromise(error);
            return;
          }
        }

        resolvePromise(stdout);
      });

      child.on('error', (error) => {
        clearTimeout(timeoutHandle);
        readStream.destroy();
        rejectPromise(
          new CodexExecutionError(
            `Failed to spawn codex: ${error.message}`,
            'SPAWN_FAILED',
          ),
        );
      });
    });
  }

  private appendOutput(existing: string, next: string): string {
    const combined = existing + next;
    const maxChars = this.debugOutput ? 200000 : 20000;
    if (combined.length <= maxChars) {
      return combined;
    }
    return combined.slice(0, maxChars);
  }

  private formatOutputSummary(stdout: string, stderr: string): string {
    if (this.debugOutput) {
      const safeStdout = this.redactAndTruncate(stdout, 2000);
      const safeStderr = this.redactAndTruncate(stderr, 2000);
      return `stderr: ${safeStderr || '(empty)'} stdout: ${safeStdout || '(empty)'}`;
    }

    return 'Detailed subprocess output is hidden by default. Set ADT_DEBUG=1 to inspect it.';
  }

  private redactAndTruncate(value: string, maxChars = 1200): string {
    if (!value) return '';

    let sanitized = this.sanitizeSecrets(value);

    if (sanitized.length > maxChars) {
      sanitized = `${sanitized.slice(0, maxChars)}... [truncated]`;
    }

    return sanitized.replace(/\s+/g, ' ').trim();
  }

  private sanitizeSecrets(value: string): string {
    return value
      .replace(/-----BEGIN [A-Z ]+PRIVATE KEY-----[\s\S]*?-----END [A-Z ]+PRIVATE KEY-----/g, '[REDACTED_PRIVATE_KEY]')
      .replace(/\bsk-[a-zA-Z0-9_-]{20,}\b/g, '[REDACTED_TOKEN]')
      .replace(/\b(gh[pousr]_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16})\b/g, '[REDACTED_TOKEN]')
      .replace(/\bBearer\s+[A-Za-z0-9\-._~+/=]{20,}\b/gi, 'Bearer [REDACTED]')
      .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9._-]{10,}\.[A-Za-z0-9._-]{10,}\b/g, '[REDACTED_JWT]')
      .replace(/(api[_-]?key|access[_-]?token|refresh[_-]?token|session[_-]?token|password|secret)\s*[:=]\s*(['"]?)[^\s'"]{12,}\2/gi, '$1=[REDACTED]');
  }

  private guardAgainstSecretLeak(value: string): string {
    const leakedSecretKey = this.findLeakedEnvironmentSecretKey(value);
    if (leakedSecretKey) {
      throw new CodexExecutionError(
        `Provider output leaked exact value for environment secret ${leakedSecretKey}.`,
        'SECRET_LEAK_DETECTED',
        this.debugOutput
          ? { redactedExcerpt: this.redactAndTruncate(value, 400) }
          : undefined,
      );
    }

    if (/-----BEGIN [A-Z ]+PRIVATE KEY-----[\s\S]*?-----END [A-Z ]+PRIVATE KEY-----/.test(value)) {
      throw new CodexExecutionError(
        'Provider output leaked private key material.',
        'SECRET_LEAK_DETECTED',
        this.debugOutput
          ? { redactedExcerpt: this.redactAndTruncate(value, 400) }
          : undefined,
      );
    }

    return this.sanitizeSecrets(value);
  }

  private findLeakedEnvironmentSecretKey(output: string): string | null {
    for (const [envKey, envValue] of Object.entries(process.env)) {
      if (!envValue || envValue.length < 12 || /\s/.test(envValue)) {
        continue;
      }

      if (!/(key|token|secret|password)/i.test(envKey)) {
        continue;
      }

      if (output.includes(envValue)) {
        return envKey;
      }
    }

    return null;
  }

  private createSpawnEnv(codexBinaryPath: string, options?: ProviderOptions): NodeJS.ProcessEnv {
    const allowedKeys = [
      'HOME',
      'USER',
      'LOGNAME',
      'SHELL',
      'LANG',
      'LC_ALL',
      'TERM',
      'TMPDIR',
      'TMP',
      'TEMP',
      'XDG_CONFIG_HOME',
      'XDG_CACHE_HOME',
      'OPENAI_BASE_URL',
      'HTTP_PROXY',
      'HTTPS_PROXY',
      'NO_PROXY',
    ];

    const env: NodeJS.ProcessEnv = {
      PATH: this.restrictedPath(codexBinaryPath),
    };

    for (const key of allowedKeys) {
      const value = process.env[key];
      if (value !== undefined) {
        env[key] = value;
      }
    }

    const exposeSecrets = options?.allowSecretEnv ?? false;
    if (exposeSecrets) {
      const openAiKey = process.env['OPENAI_API_KEY'];
      if (openAiKey !== undefined) {
        env['OPENAI_API_KEY'] = openAiKey;
      }
    }

    return env;
  }

  private prepareCommandPolicy(policy?: ProviderOptions['commandPolicy']): EffectiveCommandPolicy {
    if (!policy) {
      throw new CodexExecutionError(
        'High-trust execution requires an explicit command policy.',
        'COMMAND_POLICY_VIOLATION',
      );
    }

    const allowedPrefixes = policy.allowedCommandPrefixes
      .map(prefix => this.normalizeCommand(prefix))
      .filter(prefix => prefix.length > 0);

    if (allowedPrefixes.length === 0) {
      throw new CodexExecutionError(
        'High-trust execution requires at least one allowed command prefix.',
        'COMMAND_POLICY_VIOLATION',
      );
    }

    const blockedPatterns = policy.blockedCommandPatterns.map((pattern) => {
      try {
        return new RegExp(pattern, 'i');
      } catch {
        throw new CodexExecutionError(
          `Invalid blocked command policy pattern: ${pattern}`,
          'COMMAND_POLICY_VIOLATION',
        );
      }
    });

    return {
      allowedPrefixes,
      blockedPatterns,
    };
  }

  private enforceHighTrustCommandPolicy(
    audit: CommandTelemetryAudit,
    policy: EffectiveCommandPolicy,
  ): void {
    if (!audit.telemetrySeen) {
      throw new CodexExecutionError(
        'High-trust execution failed: command telemetry was unavailable. Failing closed.',
        'COMMAND_POLICY_VIOLATION',
      );
    }

    if (audit.ambiguousCommandEvents > 0) {
      throw new CodexExecutionError(
        'High-trust execution failed: command telemetry was incomplete for one or more command events.',
        'COMMAND_POLICY_VIOLATION',
        { ambiguousCommandEvents: audit.ambiguousCommandEvents },
      );
    }

    for (const command of audit.executedCommands) {
      const normalized = this.normalizeCommand(command);

      for (const blockedPattern of policy.blockedPatterns) {
        if (blockedPattern.test(normalized)) {
          throw new CodexExecutionError(
            `Blocked command policy matched executed command: ${command}`,
            'COMMAND_POLICY_VIOLATION',
          );
        }
      }

      const allowed = policy.allowedPrefixes.some(
        prefix => normalized === prefix || normalized.startsWith(`${prefix} `),
      );

      if (!allowed) {
        throw new CodexExecutionError(
          `Command policy rejected executed command: ${command}`,
          'COMMAND_POLICY_VIOLATION',
        );
      }
    }
  }

  private normalizeCommand(command: string): string {
    return command.trim().replace(/\s+/g, ' ').toLowerCase();
  }

  private restrictedPath(codexBinaryPath: string): string {
    const codexDir = dirname(codexBinaryPath);

    if (process.platform === 'win32') {
      return [codexDir, process.env['SystemRoot'], process.env['System32']]
        .filter((value): value is string => typeof value === 'string' && value.length > 0)
        .join(delimiter);
    }

    const safeDirs = [
      codexDir,
      '/usr/bin',
      '/bin',
      '/usr/sbin',
      '/sbin',
      '/usr/local/bin',
      '/opt/homebrew/bin',
    ];

    return Array.from(new Set(safeDirs)).join(delimiter);
  }

  private async resolveCodexBinaryPath(): Promise<string> {
    const commandNames = process.platform === 'win32'
      ? ['codex.exe', 'codex.cmd', 'codex.bat', 'codex']
      : ['codex'];

    const pathEntries = (process.env['PATH'] ?? '')
      .split(delimiter)
      .map(entry => entry.trim())
      .filter(entry => entry.length > 0)
      .filter(entry => this.isTrustedInstallDirectory(entry));

    for (const entry of pathEntries) {
      for (const commandName of commandNames) {
        const candidate = resolve(entry, commandName);
        try {
          const validated = await this.validateCodexBinary(candidate, true);
          return validated;
        } catch (error) {
          if (error instanceof CodexExecutionError) {
            if (error.code === 'BINARY_NOT_FOUND') {
              continue;
            }
            throw error;
          }
          throw error;
        }
      }
    }

    throw new CodexExecutionError(
      'Unable to locate a trusted codex executable in PATH. Set ADT_CODEX_PATH to a pinned binary path.',
      'BINARY_NOT_FOUND',
    );
  }

  private isTrustedInstallDirectory(pathEntry: string): boolean {
    const normalized = resolve(pathEntry);
    return this.trustedInstallDirs.some((trustedDir) => (
      normalized === trustedDir || normalized.startsWith(`${trustedDir}${sep}`)
    ));
  }

  private isTrustedInstallPath(binaryPath: string): boolean {
    const normalized = resolve(binaryPath);
    return this.trustedInstallDirs.some((trustedDir) => (
      normalized === trustedDir || normalized.startsWith(`${trustedDir}${sep}`)
    ));
  }

  private async validateCodexBinary(
    candidatePath: string,
    requireTrustedInstallPath: boolean,
  ): Promise<string> {
    try {
      await access(candidatePath, fsConstants.X_OK);
    } catch {
      throw new CodexExecutionError(
        `Codex binary is not executable: ${candidatePath}`,
        'BINARY_NOT_FOUND',
      );
    }

    const resolvedPath = await realpath(candidatePath);
    const fileStats = await stat(resolvedPath);

    if (!fileStats.isFile()) {
      throw new CodexExecutionError(
        `Codex path is not a file: ${resolvedPath}`,
        'BINARY_VALIDATION_FAILED',
      );
    }

    if (requireTrustedInstallPath && !this.isTrustedInstallPath(resolvedPath)) {
      throw new CodexExecutionError(
        `Refusing codex binary outside trusted install directories: ${resolvedPath}`,
        'BINARY_VALIDATION_FAILED',
      );
    }

    if (process.platform !== 'win32') {
      const mode = fileStats.mode & 0o777;
      if ((mode & 0o002) !== 0) {
        throw new CodexExecutionError(
          `Refusing world-writable codex binary: ${resolvedPath}`,
          'BINARY_VALIDATION_FAILED',
        );
      }

      const currentUid = process.getuid?.();
      if (currentUid !== undefined && fileStats.uid !== currentUid && fileStats.uid !== 0) {
        throw new CodexExecutionError(
          `Refusing codex binary not owned by current user/root: ${resolvedPath}`,
          'BINARY_VALIDATION_FAILED',
        );
      }
    }

    return resolvedPath;
  }
}

class CommandTelemetryCollector {
  private buffer = '';
  private telemetrySeen = false;
  private ambiguousCommandEvents = 0;
  private readonly commands = new Set<string>();

  ingest(chunk: string): void {
    this.buffer += chunk;

    let newlineIndex = this.buffer.indexOf('\n');
    while (newlineIndex >= 0) {
      const line = this.buffer.slice(0, newlineIndex);
      this.buffer = this.buffer.slice(newlineIndex + 1);
      this.processTelemetryLine(line);
      newlineIndex = this.buffer.indexOf('\n');
    }
  }

  finalize(): void {
    const trailing = this.buffer.trim();
    if (trailing.length > 0) {
      this.processTelemetryLine(trailing);
    }
    this.buffer = '';
  }

  buildAudit(): CommandTelemetryAudit {
    return {
      telemetrySeen: this.telemetrySeen,
      ambiguousCommandEvents: this.ambiguousCommandEvents,
      executedCommands: Array.from(this.commands),
    };
  }

  private processTelemetryLine(line: string): void {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{')) {
      return;
    }

    let payload: unknown;
    try {
      payload = JSON.parse(trimmed);
    } catch {
      return;
    }

    this.telemetrySeen = true;
    const commands = this.extractCommands(payload);
    for (const command of commands) {
      this.commands.add(command);
    }

    if (this.looksLikeCommandExecutionEvent(payload) && commands.length === 0) {
      this.ambiguousCommandEvents++;
    }
  }

  private extractCommands(payload: unknown): string[] {
    const extracted: string[] = [];
    this.walkForCommands(payload, [], extracted);

    const deduped = new Set<string>();
    for (const command of extracted) {
      const normalized = command.trim().replace(/\s+/g, ' ');
      if (normalized.length > 0) {
        deduped.add(normalized);
      }
    }

    return Array.from(deduped);
  }

  private walkForCommands(value: unknown, path: string[], out: string[]): void {
    if (Array.isArray(value)) {
      for (const item of value) {
        this.walkForCommands(item, path, out);
      }
      return;
    }

    if (!value || typeof value !== 'object') {
      return;
    }

    const record = value as Record<string, unknown>;
    for (const [key, child] of Object.entries(record)) {
      const lowerKey = key.toLowerCase();
      const nextPath = [...path, lowerKey];

      if (lowerKey === 'argv' && Array.isArray(child) && child.every(part => typeof part === 'string')) {
        const command = (child as string[]).join(' ').trim();
        if (this.looksLikeShellCommand(command)) {
          out.push(command);
        }
      }

      if (typeof child === 'string') {
        if (this.isDirectCommandField(lowerKey)) {
          this.collectCommandLines(child, out);
        }

        if (lowerKey === 'arguments' || lowerKey === 'input') {
          this.collectCommandsFromSerializedArguments(child, out);
        }
      }

      this.walkForCommands(child, nextPath, out);
    }
  }

  private isDirectCommandField(fieldName: string): boolean {
    return fieldName === 'command'
      || fieldName === 'cmd'
      || fieldName === 'raw_command'
      || fieldName === 'shell_command';
  }

  private collectCommandsFromSerializedArguments(raw: string, out: string[]): void {
    const trimmed = raw.trim();
    if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
      return;
    }

    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      for (const key of ['command', 'cmd', 'raw_command', 'shell_command']) {
        const candidate = parsed[key];
        if (typeof candidate === 'string') {
          this.collectCommandLines(candidate, out);
        }
      }
      const argv = parsed['argv'];
      if (Array.isArray(argv) && argv.every(part => typeof part === 'string')) {
        this.collectCommandLines((argv as string[]).join(' '), out);
      }
    } catch {
      // Ignore non-JSON argument payloads.
    }
  }

  private collectCommandLines(raw: string, out: string[]): void {
    for (const line of raw.split(/\r?\n/)) {
      const candidate = line.trim().replace(/^\$\s+/, '');
      if (!candidate || candidate.startsWith('#')) {
        continue;
      }
      if (this.looksLikeShellCommand(candidate)) {
        out.push(candidate);
      }
    }
  }

  private looksLikeShellCommand(value: string): boolean {
    const [firstToken] = value.trim().split(/\s+/, 1);
    if (!firstToken) {
      return false;
    }
    return /^[a-zA-Z0-9._/-]+$/.test(firstToken);
  }

  private looksLikeCommandExecutionEvent(payload: unknown): boolean {
    if (!payload || typeof payload !== 'object') {
      return false;
    }

    const record = payload as Record<string, unknown>;
    const typeHints = [
      record['type'],
      record['name'],
      this.readNestedString(record, 'item', 'type'),
      this.readNestedString(record, 'item', 'name'),
      this.readNestedString(record, 'item', 'tool_name'),
    ].filter((value): value is string => typeof value === 'string');

    if (typeHints.some(value => /(shell|command|exec|tool_call|run)/i.test(value))) {
      return true;
    }

    return 'command' in record || 'cmd' in record || 'argv' in record;
  }

  private readNestedString(record: Record<string, unknown>, ...path: string[]): string | undefined {
    let current: unknown = record;
    for (const key of path) {
      if (!current || typeof current !== 'object') {
        return undefined;
      }
      current = (current as Record<string, unknown>)[key];
    }

    return typeof current === 'string' ? current : undefined;
  }
}
