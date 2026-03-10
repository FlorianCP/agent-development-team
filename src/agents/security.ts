import { Agent } from './agent.js';
import type { AgentResult, ProjectContext } from '../types.js';

export class SecurityEngineer extends Agent {
  constructor(provider: import('../providers/provider.js').Provider) {
    super(provider, 'Security Engineer');
  }

  async execute(context: ProjectContext): Promise<AgentResult> {
    const prompt = `You are a senior Security Engineer. Perform a security audit of the code in the current workspace directory.

Check for:
1. **Injection Vulnerabilities** — SQL injection, XSS, command injection, path traversal
2. **Authentication & Authorization** — Broken access controls, weak authentication
3. **Data Exposure** — Sensitive data leaks, insecure storage, hardcoded secrets
4. **Cryptographic Issues** — Weak algorithms, improper key management
5. **Dependency Risks** — Known vulnerable dependencies
6. **Configuration** — Security misconfigurations, debug modes, permissive CORS
7. **Input Validation** — Insufficient validation at system boundaries
8. **OWASP Top 10** — Any other OWASP Top 10 vulnerabilities

Respond with a JSON object in a \`\`\`json code block:
{
  "score": <number 0-100, where 100 means no issues found>,
  "summary": "<overall security assessment>",
  "issues": [
    {
      "severity": "critical|major|minor|info",
      "description": "<vulnerability description>",
      "file": "<filename>",
      "suggestion": "<remediation>"
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
