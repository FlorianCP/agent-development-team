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
  agentName: string;
  timestamp: string;
  promptHash: string;
  output: string;
  score: number | string | null;
  issues: LoggedIssue[];
  durationMs: number;
  error?: string;
}

export class RunLogger {
  readonly filePath: string;
  private writeChain: Promise<void> = Promise.resolve();

  private constructor(filePath: string) {
    this.filePath = filePath;
  }

  static async create(baseDir: string, now = new Date()): Promise<RunLogger> {
    const logsDir = join(baseDir, 'logs');
    await mkdir(logsDir, { recursive: true });
    return new RunLogger(join(logsDir, `run-${RunLogger.formatFileTimestamp(now)}.jsonl`));
  }

  async logInvocation(input: RunLoggerEntryInput): Promise<void> {
    const entry = this.createEntry(input);
    const line = `${JSON.stringify(entry)}\n`;
    this.writeChain = this.writeChain.then(() => appendFile(this.filePath, line, 'utf-8'));
    await this.writeChain;
  }

  private createEntry(input: RunLoggerEntryInput): LoggedInvocationEntry {
    const parsed = parseAgentJson(input.output);
    return {
      agentName: input.agentName,
      timestamp: input.timestamp ?? new Date().toISOString(),
      promptHash: createHash('sha256').update(input.prompt).digest('hex'),
      output: input.output,
      score: this.extractScore(parsed, input.output),
      issues: this.extractIssues(parsed),
      durationMs: input.durationMs,
      ...(input.error ? { error: input.error } : {}),
    };
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
