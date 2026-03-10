import type { Provider, ProviderOptions } from '../providers/provider.js';
import type { AgentResult, ProjectContext } from '../types.js';
import { parseAgentJson } from '../utils.js';

export abstract class Agent {
  constructor(
    protected provider: Provider,
    protected role: string,
  ) {}

  abstract execute(context: ProjectContext): Promise<AgentResult>;

  protected async callProvider(prompt: string, options?: ProviderOptions): Promise<string> {
    return this.provider.execute(prompt, options);
  }

  protected parseResult(output: string): AgentResult {
    const parsed = parseAgentJson(output);

    if (parsed) {
      return {
        success: (parsed['success'] as boolean) ?? true,
        output: (parsed['summary'] as string) ?? (parsed['output'] as string) ?? output,
        score: parsed['score'] as number | undefined,
        issues: parsed['issues'] as AgentResult['issues'],
      };
    }

    return {
      success: true,
      output,
    };
  }
}
