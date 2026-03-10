import { Agent } from './agent.js';
import type { AgentResult, ProjectContext } from '../types.js';

export class Reviewer extends Agent {
  constructor(provider: import('../providers/provider.js').Provider) {
    super(provider, 'Reviewer');
  }

  async execute(context: ProjectContext): Promise<AgentResult> {
    const prompt = `You are a senior Code Reviewer. Review all code in the current workspace directory.

The code should implement the requirements from docs/PRD.md following the architecture in docs/ARCHITECTURE.md.

Evaluate:
1. **Code Quality** — Is the code clean, readable, and well-structured?
2. **Correctness** — Does the code correctly implement the requirements?
3. **Architecture Adherence** — Does the code follow the architecture document?
4. **Error Handling** — Are errors handled appropriately?
5. **Best Practices** — Does the code follow language/framework best practices?
6. **Maintainability** — Is the code easy to maintain and extend?

Respond with a JSON object in a \`\`\`json code block:
{
  "score": <number 0-100>,
  "summary": "<brief overall assessment>",
  "issues": [
    {
      "severity": "critical|major|minor|info",
      "description": "<what's wrong>",
      "file": "<filename>",
      "suggestion": "<how to fix>"
    }
  ]
}`;

    const output = await this.callProvider(prompt, {
      workingDir: context.workspaceDir,
      sandbox: 'read-only',
    });

    return this.parseResult(output);
  }
}
