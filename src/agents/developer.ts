import { Agent } from './agent.js';
import type { AgentResult, ProjectContext } from '../types.js';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export class Developer extends Agent {
  constructor(provider: import('../providers/provider.js').Provider) {
    super(provider, 'Developer');
  }

  async execute(context: ProjectContext): Promise<AgentResult> {
    // Write PRD and architecture docs to the workspace so codex can reference them
    const { writeFile, mkdir } = await import('node:fs/promises');
    const docsDir = join(context.workspaceDir, 'docs');

    await mkdir(docsDir, { recursive: true });

    if (context.prd) {
      await writeFile(join(docsDir, 'PRD.md'), context.prd, 'utf-8');
    }
    if (context.architecture) {
      await writeFile(join(docsDir, 'ARCHITECTURE.md'), context.architecture, 'utf-8');
    }

    let feedbackSection = '';
    if (context.feedback.length > 0) {
      feedbackSection = `\n## Feedback from Previous Iteration\nAddress the following issues:\n\n${context.feedback[context.feedback.length - 1]}`;
    }

    const prompt = `You are a senior Software Developer. ${context.iteration === 1
      ? 'Implement the software described in docs/PRD.md following the architecture in docs/ARCHITECTURE.md.'
      : `This is iteration ${context.iteration}. Read the existing code, the PRD in docs/PRD.md, and the architecture in docs/ARCHITECTURE.md. Fix the issues identified and improve the code.`
    }
${feedbackSection}

Requirements:
- Write clean, readable, well-structured code
- Include error handling where appropriate
- Add a README.md with setup and usage instructions if one doesn't exist
- Follow the technology choices from the architecture document
- Make sure the code compiles/runs without errors
- Include basic tests if the architecture calls for them

Implement the complete solution. Create all necessary files.`;

    const output = await this.callProvider(prompt, {
      workingDir: context.workspaceDir,
      sandbox: 'workspace-write',
    });

    return {
      success: true,
      output,
    };
  }
}
