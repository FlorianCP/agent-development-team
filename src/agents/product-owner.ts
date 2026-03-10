import { Agent } from './agent.js';
import type { AgentResult, ProjectContext } from '../types.js';
import { join } from 'node:path';

export class ProductOwner extends Agent {
  constructor(provider: import('../providers/provider.js').Provider) {
    super(provider, 'Product Owner');
  }

  async execute(context: ProjectContext): Promise<AgentResult> {
    const prdPath = join(context.docsDir, 'PRD.md');
    const prompt = `You are a Product Owner. Review the software in the current workspace directory against the requirements in ${prdPath}.

For EACH functional requirement listed in the PRD:
1. Check if it has been implemented
2. Rate its completeness (0-100%)
3. Note any deviations from the requirement

Also evaluate:
- Overall product quality and polish
- Whether the product delivers customer value as described
- Any gaps between what was requested and what was built

Respond with a JSON object in a \`\`\`json code block:
{
  "score": <number 0-100, overall product score>,
  "approved": <boolean>,
  "summary": "<overall product assessment>",
  "requirements": [
    {
      "id": "<requirement ID, e.g. FR-001>",
      "description": "<brief description>",
      "score": <0-100>,
      "status": "met|partially-met|not-met",
      "notes": "<details>"
    }
  ],
  "issues": [
    {
      "severity": "critical|major|minor|info",
      "description": "<what needs improvement>",
      "suggestion": "<how to address>"
    }
  ]
}`;

    const output = await this.callProvider(prompt, {
      workingDir: context.workspaceDir,
      sandbox: 'read-only',
    });

    const result = this.parseResult(output, {
      requireJson: true,
      requireNumericScore: true,
      evaluatorName: 'Product Owner',
    });

    // Check approval from parsed data
    const parsed = (await import('../utils.js')).parseAgentJson(output);
    if (parsed && typeof parsed['approved'] === 'boolean') {
      result.success = parsed['approved'] as boolean;
    } else {
      // Infer approval from score
      result.success = (result.score ?? 0) >= 80;
    }

    return result;
  }
}
