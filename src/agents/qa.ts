import { Agent } from './agent.js';
import type { AgentResult, ProjectContext } from '../types.js';

export class QAEngineer extends Agent {
  constructor(provider: import('../providers/provider.js').Provider) {
    super(provider, 'QA Engineer');
  }

  async execute(context: ProjectContext): Promise<AgentResult> {
    const prompt = `You are a senior QA Engineer. Test the software in the current workspace directory.

The software should satisfy all requirements in docs/PRD.md.

Perform the following checks:
1. **Build/Compile Check** — Can the software be built without errors?
2. **Functional Testing** — Verify each functional requirement from the PRD
3. **Edge Cases** — Check boundary conditions and error scenarios
4. **Usability** — Is the software usable as described?
5. **Documentation** — Is there adequate documentation for users?

If possible, run the tests or try to build/run the project.

Respond with a JSON object in a \`\`\`json code block:
{
  "score": <number 0-100>,
  "summary": "<overall QA assessment>",
  "issues": [
    {
      "severity": "critical|major|minor|info",
      "description": "<defect description>",
      "file": "<filename if applicable>",
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
