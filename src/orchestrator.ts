import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { Provider } from './providers/provider.js';
import type { ADTConfig, AgentResult, ProjectContext } from './types.js';
import { RequirementsEngineer } from './agents/requirements-engineer.js';
import { Architect } from './agents/architect.js';
import { Developer } from './agents/developer.js';
import { Reviewer } from './agents/reviewer.js';
import { QAEngineer } from './agents/qa.js';
import { SecurityEngineer } from './agents/security.js';
import { ProductOwner } from './agents/product-owner.js';
import { createReadlineInterface, askQuestion, askYesNo, log, logStep, logDetail } from './utils.js';

export class Orchestrator {
  private provider: Provider;
  private config: ADTConfig;

  constructor(provider: Provider, config: ADTConfig) {
    this.provider = provider;
    this.config = config;
  }

  async start(requirement: string): Promise<void> {
    const projectName = this.generateProjectName(requirement);
    const workspaceDir = resolve(this.config.outputDir, projectName);

    await mkdir(workspaceDir, { recursive: true });

    const context: ProjectContext = {
      requirement,
      workspaceDir,
      iteration: 0,
      maxIterations: this.config.maxIterations,
      feedback: [],
    };

    console.log('\n🤖 Agent Development Team v0.1.0');
    console.log('═'.repeat(60));
    log('📁', `Workspace: ${workspaceDir}`);

    const rl = createReadlineInterface();

    try {
      // Phase 1: Requirements Engineering
      await this.requirementsPhase(context, rl);

      // Phase 2: Architecture
      await this.architecturePhase(context);

      // Phase 3: Human Approval
      const approved = await this.approvalPhase(context, rl);
      if (!approved) {
        log('🛑', 'Development cancelled by user.');
        rl.close();
        return;
      }

      // Phase 4: Development Loop
      await this.developmentLoop(context);

      // Done
      logStep('✅ Development Complete');
      log('📁', `Output: ${workspaceDir}`);
      log('📊', `Iterations: ${context.iteration}`);

    } finally {
      rl.close();
    }
  }

  async selfImprove(requirement: string): Promise<void> {
    const workspaceDir = resolve('.');

    const context: ProjectContext = {
      requirement: `Improve the Agent Development Team (ADT) codebase. The codebase is a TypeScript project in the current directory. ${requirement}`,
      workspaceDir,
      iteration: 0,
      maxIterations: this.config.maxIterations,
      feedback: [],
    };

    console.log('\n🤖 Agent Development Team — Self-Improvement Mode');
    console.log('═'.repeat(60));
    log('📁', `Working on: ${workspaceDir}`);

    // Skip requirements/architecture for self-improvement — go straight to development
    context.prd = `# Self-Improvement PRD\n\n## Requirement\n${requirement}\n\n## Context\nThis is the ADT codebase itself. Make the requested improvements while maintaining the existing architecture and conventions.\n\n## Acceptance Criteria\n- The requested improvement is implemented\n- Existing functionality is not broken\n- Code follows project conventions\n- npm run build succeeds`;
    context.architecture = 'See existing codebase structure. Maintain current architecture patterns.';

    await this.developmentLoop(context);

    logStep('✅ Self-Improvement Complete');
  }

  private async requirementsPhase(context: ProjectContext, rl: import('node:readline').Interface): Promise<void> {
    logStep('📋 Requirements Engineering');

    const reAgent = new RequirementsEngineer(this.provider);

    log('🔍', 'Analyzing requirement and generating questions...');
    const questions = await reAgent.generateQuestions(context);

    console.log('\n   I have some clarifying questions:\n');
    const answers = new Map<string, string>();

    for (let i = 0; i < questions.length; i++) {
      const question = questions[i];
      console.log(`   ${i + 1}. ${question}`);
      const answer = await askQuestion(rl, `      > `);
      if (answer) {
        answers.set(question, answer);
      } else {
        answers.set(question, '(no preference, use your best judgment)');
      }
    }

    log('\n🔨', 'Creating Product Requirements Document...');
    context.prd = await reAgent.createPRD(context, answers);
    log('✅', 'PRD created.');
  }

  private async architecturePhase(context: ProjectContext): Promise<void> {
    logStep('🏗️  Architecture');

    const archAgent = new Architect(this.provider);
    log('🔍', 'Designing system architecture...');

    const result = await archAgent.execute(context);
    context.architecture = result.output;

    log('✅', 'Architecture document created.');
  }

  private async approvalPhase(context: ProjectContext, rl: import('node:readline').Interface): Promise<boolean> {
    logStep('📄 Review Documents');

    // Write documents for human review
    const docsDir = join(context.workspaceDir, 'docs');
    await mkdir(docsDir, { recursive: true });

    if (context.prd) {
      const prdPath = join(docsDir, 'PRD.md');
      await writeFile(prdPath, context.prd, 'utf-8');
      logDetail(`PRD: ${prdPath}`);
    }

    if (context.architecture) {
      const archPath = join(docsDir, 'ARCHITECTURE.md');
      await writeFile(archPath, context.architecture, 'utf-8');
      logDetail(`Architecture: ${archPath}`);
    }

    console.log('');
    return askYesNo(rl, '   Approve and begin development?');
  }

  private async developmentLoop(context: ProjectContext): Promise<void> {
    const devAgent = new Developer(this.provider);
    const reviewAgent = new Reviewer(this.provider);
    const qaAgent = new QAEngineer(this.provider);
    const securityAgent = new SecurityEngineer(this.provider);
    const poAgent = new ProductOwner(this.provider);

    while (context.iteration < context.maxIterations) {
      context.iteration++;
      logStep(`🔄 Development Iteration ${context.iteration}/${context.maxIterations}`);

      // Develop
      log('👨‍💻', 'Developing...');
      await devAgent.execute(context);
      log('✅', 'Code written.');

      // Review
      log('🔍', 'Reviewing code...');
      const review = await reviewAgent.execute(context);
      logDetail(`Review score: ${review.score ?? 'N/A'}/100`);
      this.logIssueCount(review);

      // QA
      log('🧪', 'Running QA checks...');
      const qa = await qaAgent.execute(context);
      logDetail(`QA score: ${qa.score ?? 'N/A'}/100`);
      this.logIssueCount(qa);

      // Security
      log('🔒', 'Security scanning...');
      const security = await securityAgent.execute(context);
      logDetail(`Security score: ${security.score ?? 'N/A'}/100`);
      this.logIssueCount(security);

      // Check for critical issues
      const hasCritical = this.hasCriticalIssues(review, qa, security);
      const belowThreshold = this.belowThreshold(review, qa, security);

      if (hasCritical || belowThreshold) {
        if (context.iteration < context.maxIterations) {
          const feedback = this.aggregateFeedback(review, qa, security);
          context.feedback.push(feedback);
          log('⚠️', `Issues found. Starting iteration ${context.iteration + 1}...`);
          continue;
        } else {
          log('⚠️', 'Max iterations reached with remaining issues.');
        }
      }

      // PO Review
      log('👔', 'Product Owner review...');
      const poResult = await poAgent.execute(context);
      logDetail(`PO score: ${poResult.score ?? 'N/A'}/100`);

      if (poResult.success) {
        log('✅', 'Product Owner approved!');
        return;
      }

      if (context.iteration < context.maxIterations) {
        context.feedback.push(poResult.output);
        log('🔄', 'PO requested changes. Continuing development...');
      } else {
        log('⚠️', 'Max iterations reached. Review output manually.');
        logDetail(`PO feedback: ${poResult.output}`);
      }
    }
  }

  private hasCriticalIssues(...results: AgentResult[]): boolean {
    return results.some(r =>
      r.issues?.some(i => i.severity === 'critical') ?? false
    );
  }

  private belowThreshold(...results: AgentResult[]): boolean {
    return results.some(r =>
      r.score !== undefined && r.score < this.config.scoreThreshold
    );
  }

  private aggregateFeedback(...results: AgentResult[]): string {
    const sections: string[] = [];

    for (const result of results) {
      if (result.issues && result.issues.length > 0) {
        const issueList = result.issues
          .map(i => `- [${i.severity.toUpperCase()}] ${i.description}${i.file ? ` (${i.file})` : ''}${i.suggestion ? ` → ${i.suggestion}` : ''}`)
          .join('\n');
        sections.push(issueList);
      }
      if (result.output) {
        sections.push(result.output);
      }
    }

    return sections.join('\n\n');
  }

  private logIssueCount(result: AgentResult): void {
    if (result.issues && result.issues.length > 0) {
      const counts = { critical: 0, major: 0, minor: 0, info: 0 };
      for (const issue of result.issues) {
        counts[issue.severity]++;
      }
      const parts: string[] = [];
      if (counts.critical > 0) parts.push(`${counts.critical} critical`);
      if (counts.major > 0) parts.push(`${counts.major} major`);
      if (counts.minor > 0) parts.push(`${counts.minor} minor`);
      if (counts.info > 0) parts.push(`${counts.info} info`);
      logDetail(`Issues: ${parts.join(', ')}`);
    }
  }

  private generateProjectName(requirement: string): string {
    return requirement
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .slice(0, 4)
      .join('-') || 'project';
  }
}
