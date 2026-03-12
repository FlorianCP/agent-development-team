import { createHash } from 'node:crypto';
import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { parseAgentJson } from './utils.js';

interface RunLoggerEntryInput {
  agentName: string;
  prompt: string;
  output: string;
  durationMs: number;
  timestamp?: string;
  error?: string;
}

interface LoggedIssue {
  severity: string;
  description: string;
  file?: string;
  suggestion?: string;
}

interface LoggedInvocationEntry {
  eventType: 'provider_invocation';
  agentName: string;
  timestamp: string;
  promptHash: string;
  outputHash: string;
  outputLength: number;
  outputStored: boolean;
  output?: string;
  score: number | string | null;
  issues: LoggedIssue[];
  durationMs: number;
  error?: string;
}

interface RunLoggerEventInput {
  eventType: string;
  agentName?: string;
  phase?: string;
  iteration?: number;
  durationMs?: number;
  details?: Record<string, unknown>;
  timestamp?: string;
  error?: string;
}

interface LoggedEventEntry {
  eventType: string;
  timestamp: string;
  agentName?: string;
  phase?: string;
  iteration?: number;
  durationMs?: number;
  details?: Record<string, unknown>;
  error?: string;
}

export class RunLogger {
  readonly filePath: string;
  private writeChain: Promise<void> = Promise.resolve();
  private readonly logProviderOutput: boolean;

  private constructor(filePath: string) {
    this.filePath = filePath;
    this.logProviderOutput = process.env['ADT_LOG_PROVIDER_OUTPUT'] === '1';
  }

  static async create(baseDir: string, now = new Date()): Promise<RunLogger> {
    const logsDir = join(baseDir, 'logs');
    await mkdir(logsDir, { recursive: true });
    return new RunLogger(join(logsDir, `run-${RunLogger.formatFileTimestamp(now)}.jsonl`));
  }

  async logInvocation(input: RunLoggerEntryInput): Promise<void> {
    const entry = this.createEntry(input);
    await this.writeEntry(entry);
  }

  async logEvent(input: RunLoggerEventInput): Promise<void> {
    const entry: LoggedEventEntry = {
      eventType: input.eventType,
      timestamp: input.timestamp ?? new Date().toISOString(),
      ...(input.agentName ? { agentName: input.agentName } : {}),
      ...(input.phase ? { phase: input.phase } : {}),
      ...(typeof input.iteration === 'number' ? { iteration: input.iteration } : {}),
      ...(typeof input.durationMs === 'number' ? { durationMs: input.durationMs } : {}),
      ...(input.details ? { details: input.details } : {}),
      ...(input.error ? { error: input.error } : {}),
    };

    await this.writeEntry(entry);
  }

  private createEntry(input: RunLoggerEntryInput): LoggedInvocationEntry {
    const parsed = parseAgentJson(input.output);
    const sanitizedOutput = this.sanitizeOutput(input.output);
    return {
      eventType: 'provider_invocation',
      agentName: input.agentName,
      timestamp: input.timestamp ?? new Date().toISOString(),
      promptHash: createHash('sha256').update(input.prompt).digest('hex'),
      outputHash: createHash('sha256').update(input.output).digest('hex'),
      outputLength: input.output.length,
      outputStored: this.logProviderOutput,
      ...(this.logProviderOutput ? { output: sanitizedOutput } : {}),
      score: this.extractScore(parsed, input.output),
      issues: this.extractIssues(parsed),
      durationMs: input.durationMs,
      ...(input.error ? { error: input.error } : {}),
    };
  }

  private async writeEntry(entry: LoggedInvocationEntry | LoggedEventEntry): Promise<void> {
    const line = `${JSON.stringify(entry)}\n`;
    this.writeChain = this.writeChain
      .catch(() => undefined)
      .then(() => appendFile(this.filePath, line, 'utf-8'));
    await this.writeChain;
  }

  private sanitizeOutput(output: string): string {
    return output
      .replace(/-----BEGIN [A-Z ]+PRIVATE KEY-----[\s\S]*?-----END [A-Z ]+PRIVATE KEY-----/g, '[REDACTED_PRIVATE_KEY]')
      .replace(/\bsk-[a-zA-Z0-9_-]{20,}\b/g, '[REDACTED_TOKEN]')
      .replace(/\b(gh[pousr]_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16})\b/g, '[REDACTED_TOKEN]')
      .replace(/\bBearer\s+[A-Za-z0-9\-._~+/=]{20,}\b/gi, 'Bearer [REDACTED]')
      .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9._-]{10,}\.[A-Za-z0-9._-]{10,}\b/g, '[REDACTED_JWT]')
      .replace(/(api[_-]?key|access[_-]?token|refresh[_-]?token|session[_-]?token|password|secret)\s*[:=]\s*(['"]?)[^\s'"]{12,}\2/gi, '$1=[REDACTED]');
  }

  private extractScore(parsed: Record<string, unknown> | null, output: string): number | string | null {
    const rawScore = parsed?.['score'];
    if (typeof rawScore === 'number' && Number.isFinite(rawScore)) {
      return rawScore;
    }

    const confidenceMatch = output.match(/Confidence:\s*(100|[1-9]?\d)(?:\b|\/100)/i);
    if (confidenceMatch) {
      return Number(confidenceMatch[1]);
    }

    return null;
  }

  private extractIssues(parsed: Record<string, unknown> | null): LoggedIssue[] {
    const rawIssues = parsed?.['issues'];
    if (!Array.isArray(rawIssues)) {
      return [];
    }

    const issues: LoggedIssue[] = [];
    for (const issue of rawIssues) {
      if (!issue || typeof issue !== 'object') {
        continue;
      }

      const candidate = issue as Record<string, unknown>;
      if (typeof candidate['severity'] !== 'string' || typeof candidate['description'] !== 'string') {
        continue;
      }

      issues.push({
        severity: candidate['severity'],
        description: candidate['description'],
        file: typeof candidate['file'] === 'string' ? candidate['file'] : undefined,
        suggestion: typeof candidate['suggestion'] === 'string' ? candidate['suggestion'] : undefined,
      });
    }

    return issues;
  }

  private static formatFileTimestamp(now: Date): string {
    return now.toISOString().replace(/:/g, '-').replace(/\.\d{3}Z$/, '');
  }
}
