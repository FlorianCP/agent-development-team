import type { Provider, ProviderOptions } from '../providers/provider.js';
import type { AgentResult, ProjectContext } from '../types.js';
import { parseAgentJson } from '../utils.js';

interface ParseResultOptions {
  requireJson?: boolean;
  requireNumericScore?: boolean;
  evaluatorName?: string;
}

interface JsonCallResult {
  output: string;
  parsed: Record<string, unknown> | null;
}

export abstract class Agent {
  constructor(
    protected provider: Provider,
    protected role: string,
  ) {}

  abstract execute(context: ProjectContext): Promise<AgentResult>;

  protected async callProvider(
    context: ProjectContext,
    prompt: string,
    options?: ProviderOptions,
  ): Promise<string> {
    const startedAtMs = Date.now();

    try {
      const output = await this.provider.execute(prompt, options);
      await this.logInvocation(context, prompt, output, Date.now() - startedAtMs);
      return output;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.logInvocation(context, prompt, '', Date.now() - startedAtMs, message);
      throw error;
    }
  }

  protected async callProviderForJson(
    context: ProjectContext,
    prompt: string,
    options?: ProviderOptions,
  ): Promise<JsonCallResult> {
    const maxAttempts = 2;
    let currentPrompt = prompt;
    let lastOutput = '';

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const output = await this.callProvider(context, currentPrompt, options);
      lastOutput = output;
      const parsed = parseAgentJson(output);

      if (parsed) {
        return { output, parsed };
      }

      if (attempt < maxAttempts) {
        currentPrompt = `${prompt}

IMPORTANT: Your previous response was malformed. Respond with valid JSON in a \`\`\`json code block.`;
      }
    }

    return {
      output: lastOutput,
      parsed: null,
    };
  }

  protected parseResult(output: string, options: ParseResultOptions = {}): AgentResult {
    const { requireJson = false, requireNumericScore = false, evaluatorName = this.role } = options;
    const parsed = parseAgentJson(output);

    if (!parsed) {
      if (requireJson) {
        return this.invalidEvaluationResult(
          evaluatorName,
          'Response was not valid JSON in a ```json code block.',
          output,
        );
      }

      return {
        success: true,
        output,
        evaluationValid: true,
      };
    }

    const score = parsed['score'];
    if (requireNumericScore && (typeof score !== 'number' || !Number.isFinite(score))) {
      return this.invalidEvaluationResult(
        evaluatorName,
        'Missing or non-numeric `score` field.',
        output,
      );
    }

    const issues = this.parseIssues(parsed['issues']);

    return {
      success: (parsed['success'] as boolean) ?? true,
      output: (parsed['summary'] as string) ?? (parsed['output'] as string) ?? output,
      score: typeof score === 'number' && Number.isFinite(score) ? score : undefined,
      issues,
      evaluationValid: true,
    };
  }

  protected invalidEvaluationResult(evaluatorName: string, reason: string, output: string): AgentResult {
    return {
      success: false,
      score: 0,
      output: `${evaluatorName} produced invalid evaluation data. ${reason}`,
      evaluationValid: false,
      issues: [
        {
          severity: 'critical',
          description: `${evaluatorName} output could not be validated.`,
          suggestion: 'Return valid JSON with a numeric score so the quality gate can evaluate reliably.',
        },
        {
          severity: 'info',
          description: `Raw output excerpt: ${this.excerpt(output)}`,
        },
      ],
    };
  }

  private parseIssues(rawIssues: unknown): AgentResult['issues'] {
    if (!Array.isArray(rawIssues)) {
      return [];
    }

    const validSeverities = new Set(['critical', 'major', 'minor', 'info']);
    const parsedIssues: NonNullable<AgentResult['issues']> = [];

    for (const issue of rawIssues) {
      if (!issue || typeof issue !== 'object') {
        continue;
      }

      const candidate = issue as Record<string, unknown>;
      const severity = candidate['severity'];
      const description = candidate['description'];
      if (!validSeverities.has(String(severity)) || typeof description !== 'string') {
        continue;
      }

      parsedIssues.push({
        severity: severity as 'critical' | 'major' | 'minor' | 'info',
        description,
        file: typeof candidate['file'] === 'string' ? candidate['file'] : undefined,
        suggestion: typeof candidate['suggestion'] === 'string' ? candidate['suggestion'] : undefined,
      });
    }

    return parsedIssues;
  }

  protected toUntrustedDataBlock(content: string): string {
    const escaped = content
      .replaceAll('<<<BEGIN_UNTRUSTED_DATA>>>', '<BEGIN_UNTRUSTED_DATA_ESCAPED>')
      .replaceAll('<<<END_UNTRUSTED_DATA>>>', '<END_UNTRUSTED_DATA_ESCAPED>')
      .replaceAll('```', '` ` `');
    return `<<<BEGIN_UNTRUSTED_DATA>>>\n${escaped}\n<<<END_UNTRUSTED_DATA>>>`;
  }

  private excerpt(content: string): string {
    const normalized = content.replace(/\s+/g, ' ').trim();
    if (normalized.length <= 240) {
      return normalized;
    }
    return `${normalized.slice(0, 240)}...`;
  }

  private async logInvocation(
    context: ProjectContext,
    prompt: string,
    output: string,
    durationMs: number,
    error?: string,
  ): Promise<void> {
    if (!context.runLogger) {
      return;
    }

    try {
      await context.runLogger.logInvocation({
        agentName: this.role,
        prompt,
        output,
        durationMs,
        ...(error ? { error } : {}),
      });
    } catch {
      // Observability failures should not block agent execution.
    }
  }
}
