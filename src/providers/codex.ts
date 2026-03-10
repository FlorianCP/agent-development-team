import { spawn } from 'node:child_process';
import { createReadStream, constants as fsConstants } from 'node:fs';
import {
  access,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
  realpath,
} from 'node:fs/promises';
import { dirname, delimiter, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import type { Provider, ProviderOptions } from './provider.js';

interface CodexProviderConfig {
  codexPath?: string;
  defaultTimeoutMs?: number;
}

type CodexErrorCode =
  | 'BINARY_NOT_FOUND'
  | 'BINARY_VALIDATION_FAILED'
  | 'SPAWN_FAILED'
  | 'NON_ZERO_EXIT'
  | 'TIMEOUT';

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

  private model?: string;
  private readonly codexBinaryPathPromise: Promise<string>;
  private readonly defaultTimeoutMs: number;
  private readonly debugOutput: boolean;

  constructor(model?: string, config?: CodexProviderConfig) {
    this.model = model;
    this.defaultTimeoutMs = config?.defaultTimeoutMs ?? 300000;
    this.debugOutput = process.env['ADT_DEBUG'] === '1';
    this.codexBinaryPathPromise = config?.codexPath
      ? this.validateCodexBinary(config.codexPath)
      : this.resolveCodexBinaryPath();
  }

  async execute(prompt: string, options?: ProviderOptions): Promise<string> {
    const tmpDir = await mkdtemp(join(tmpdir(), 'adt-'));
    const outputFile = join(tmpDir, `output-${randomBytes(4).toString('hex')}.md`);
    const promptFile = join(tmpDir, `prompt-${randomBytes(4).toString('hex')}.md`);

    try {
      await writeFile(promptFile, prompt, 'utf-8');

      const args = ['exec'];
      const sandbox = options?.sandbox ?? 'read-only';
      args.push('-s', sandbox);

      if (options?.trustMode === 'high') {
        args.push('--full-auto');
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
      });

      try {
        return await readFile(outputFile, 'utf-8');
      } catch {
        // If no output file was created, use stdout.
        return output;
      }
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
  }): Promise<string> {
    const { codexBinaryPath, args, promptFile, timeoutMs, workingDir } = params;

    return new Promise((resolvePromise, rejectPromise) => {
      const child = spawn(codexBinaryPath, args, {
        cwd: workingDir,
        env: this.createSpawnEnv(codexBinaryPath),
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';
      let timedOut = false;
      let exited = false;
      let killTimeoutHandle: NodeJS.Timeout | null = null;

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
        stdout = this.appendOutput(stdout, data.toString());
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

        if (code === 0) {
          resolvePromise(stdout);
          return;
        }

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

    let sanitized = value
      .replace(/sk-[a-zA-Z0-9_-]{12,}/g, '[REDACTED_TOKEN]')
      .replace(/(api[_-]?key\s*[:=]\s*)([^\s]+)/gi, '$1[REDACTED]');

    if (sanitized.length > maxChars) {
      sanitized = `${sanitized.slice(0, maxChars)}... [truncated]`;
    }

    return sanitized.replace(/\s+/g, ' ').trim();
  }

  private createSpawnEnv(codexBinaryPath: string): NodeJS.ProcessEnv {
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
      'OPENAI_API_KEY',
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

    return env;
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
      .filter(entry => entry.trim().length > 0);

    for (const entry of pathEntries) {
      for (const commandName of commandNames) {
        const candidate = resolve(entry, commandName);
        try {
          const validated = await this.validateCodexBinary(candidate);
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
      'Unable to locate codex executable in PATH.',
      'BINARY_NOT_FOUND',
    );
  }

  private async validateCodexBinary(candidatePath: string): Promise<string> {
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
