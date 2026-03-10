import { randomBytes } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { Interface } from 'node:readline';
import type { Provider } from './providers/provider.js';
import type { ADTConfig, AgentResult, ProjectContext, ScoreHistory } from './types.js';
import { RequirementsEngineer } from './agents/requirements-engineer.js';
import { Architect } from './agents/architect.js';
import { Developer } from './agents/developer.js';
import { Reviewer } from './agents/reviewer.js';
import { QAEngineer } from './agents/qa.js';
import { SecurityEngineer } from './agents/security.js';
import { ProductOwner } from './agents/product-owner.js';
import { DocumentationWriter } from './agents/documentation-writer.js';
import { createReadlineInterface, askQuestion, askYesNo, log, logStep, logDetail } from './utils.js';

export class Orchestrator {
  private provider: Provider;
  private config: ADTConfig;

  constructor(provider: Provider, config: ADTConfig) {
    this.provider = provider;
    this.config = config;
  }

  async start(requirement: string): Promise<boolean> {
    const runStartedAtMs = Date.now();
    const projectName = this.generateProjectName(requirement);
    const workspaceDir = resolve(this.config.outputDir, projectName);
    const docsDir = join(workspaceDir, 'docs');

    await mkdir(workspaceDir, { recursive: true });

    const context: ProjectContext = {
      requirement,
      docsDir,
      workspaceDir,
      iteration: 0,
      maxIterations: this.config.maxIterations,
      feedback: [],
      developerTrustMode: 'high',
      metrics: {
        scoreHistory: this.createScoreHistory(),
      },
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
        return false;
      }

      return await this.executeApprovedWorkflow(context, rl, 'Development', runStartedAtMs);

    } finally {
      rl.close();
    }
  }

  async selfImprove(requirement: string): Promise<boolean> {
    const runStartedAtMs = Date.now();
    const workspaceDir = resolve('.');
    const runtimeDir = join(
      workspaceDir,
      '.adt-self-improve',
      `${Date.now()}-${randomBytes(3).toString('hex')}`,
    );
    const docsDir = join(runtimeDir, 'docs');
    const rl = createReadlineInterface();

    const context: ProjectContext = {
      requirement: `Improve the Agent Development Team (ADT) codebase. The codebase is a TypeScript project in the current directory. ${requirement}`,
      docsDir,
      workspaceDir,
      iteration: 0,
      maxIterations: this.config.maxIterations,
      feedback: [],
      developerTrustMode: 'safe',
      metrics: {
        scoreHistory: this.createScoreHistory(),
      },
    };

    console.log('\n🤖 Agent Development Team — Self-Improvement Mode');
    console.log('═'.repeat(60));
    log('📁', `Working on: ${workspaceDir}`);
    log('📄', `Using runtime docs: ${docsDir}`);

    // Skip requirements/architecture for self-improvement — go straight to development
    context.prd = `# Self-Improvement PRD\n\n## Requirement\n${requirement}\n\n## Context\nThis is the ADT codebase itself. Make the requested improvements while maintaining the existing architecture and conventions.\n\n## Acceptance Criteria\n- The requested improvement is implemented\n- Existing functionality is not broken\n- Code follows project conventions\n- npm run build succeeds`;
    context.architecture = 'See existing codebase structure. Maintain current architecture patterns.';

    try {
      const approved = process.stdin.isTTY
        ? await askYesNo(
            rl,
            '   Self-improvement can edit repository files. Continue in safe trust mode?',
          )
        : true;
      if (!approved) {
        log('🛑', 'Self-improvement cancelled by user.');
        return false;
      }

      return await this.executeApprovedWorkflow(context, rl, 'Self-Improvement', runStartedAtMs);
    } finally {
      rl.close();
      await rm(runtimeDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  private async requirementsPhase(context: ProjectContext, rl: import('node:readline').Interface): Promise<void> {
    logStep('📋 Requirements Engineering');

    const reAgent = new RequirementsEngineer(this.provider);

    log('🔍', 'Analyzing requirement and generating questions...');
    const questions = await this.runTimedAgent(
      'Requirements Engineer (question analysis)',
      () => reAgent.generateQuestions(context),
    );

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
    context.prd = await this.runTimedAgent(
      'Requirements Engineer (PRD generation)',
      () => reAgent.createPRD(context, answers),
    );
    log('✅', 'PRD created.');
  }

  private async architecturePhase(context: ProjectContext): Promise<void> {
    logStep('🏗️  Architecture');

    const archAgent = new Architect(this.provider);
    log('🔍', 'Designing system architecture...');

    const result = await this.runTimedAgent('Architect', () => archAgent.execute(context));
    context.architecture = result.output;

    log('✅', 'Architecture document created.');
  }

  private async approvalPhase(context: ProjectContext, rl: import('node:readline').Interface): Promise<boolean> {
    logStep('📄 Review Documents');
    await this.writeSpecDocuments(context);
    logDetail(`PRD: ${join(context.docsDir, 'PRD.md')}`);
    logDetail(`Architecture: ${join(context.docsDir, 'ARCHITECTURE.md')}`);

    console.log('');
    return askYesNo(rl, '   Approve and begin development?');
  }

  private async developmentLoop(context: ProjectContext, rl?: Interface): Promise<boolean> {
    const scoreHistory = this.ensureScoreHistory(context);
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
      const devResult = await this.runTimedAgent('Developer', () => devAgent.execute(context));
      log('✅', 'Code written.');

      const approvalReason = this.extractHumanApprovalRequest(devResult.output);
      if (approvalReason) {
        log('🛑', 'Developer requested explicit human approval before continuing.');
        logDetail(approvalReason);
        if (!rl || !process.stdin.isTTY) {
          return false;
        }
        const continueAutomatedChecks = await askYesNo(
          rl,
          '   Complete the manual step, then continue automated review gates?',
        );
        if (!continueAutomatedChecks) {
          return false;
        }
      }

      // Review
      log('🔍', 'Reviewing code...');
      const review = await this.runTimedAgent(
        'Code Reviewer',
        () => this.runEvaluatorWithRetry(
          'Code Reviewer',
          () => reviewAgent.execute(context),
        ),
      );
      logDetail(`Review score: ${review.score ?? 'N/A'}/100`);
      this.recordScore(scoreHistory.review, review.score);
      this.logIssueCount(review);

      // QA
      log('🧪', 'Running QA checks...');
      const qa = await this.runTimedAgent(
        'QA Engineer',
        () => this.runEvaluatorWithRetry(
          'QA Engineer',
          () => qaAgent.execute(context),
        ),
      );
      logDetail(`QA score: ${qa.score ?? 'N/A'}/100`);
      this.recordScore(scoreHistory.qa, qa.score);
      this.logIssueCount(qa);

      // Security
      log('🔒', 'Security scanning...');
      const security = await this.runTimedAgent(
        'Security Engineer',
        () => this.runEvaluatorWithRetry(
          'Security Engineer',
          () => securityAgent.execute(context),
        ),
      );
      logDetail(`Security score: ${security.score ?? 'N/A'}/100`);
      this.recordScore(scoreHistory.security, security.score);
      this.logIssueCount(security);

      // Check for critical issues
      const hasCritical = this.hasCriticalIssues(review, qa, security);
      const belowThreshold = this.belowThreshold(review, qa, security);

      if (hasCritical || belowThreshold) {
        if (context.iteration < context.maxIterations) {
          const feedback = this.aggregateFeedback(
            { name: 'Code Reviewer', result: review },
            { name: 'QA Engineer', result: qa },
            { name: 'Security Engineer', result: security },
          );
          context.feedback.push(feedback);
          this.logScoreTrends(scoreHistory);
          log('⚠️', `Issues found. Starting iteration ${context.iteration + 1}...`);
          continue;
        } else {
          this.logScoreTrends(scoreHistory);
          log('🛑', 'Max iterations reached with unresolved critical/quality issues. Failing run.');
          logDetail('Product Owner review skipped because quality gate was not met.');
          return false;
        }
      }

      // PO Review
      log('👔', 'Product Owner review...');
      const poResult = await this.runTimedAgent(
        'Product Owner',
        () => this.runEvaluatorWithRetry(
          'Product Owner',
          () => poAgent.execute(context),
        ),
      );
      logDetail(`PO score: ${poResult.score ?? 'N/A'}/100`);
      this.recordScore(scoreHistory.productOwner, poResult.score);
      this.logScoreTrends(scoreHistory);

      if (poResult.success) {
        log('✅', 'Product Owner approved!');
        return true;
      }

      if (context.iteration < context.maxIterations) {
        context.feedback.push(poResult.output);
        log('🔄', 'PO requested changes. Continuing development...');
      } else {
        log('⚠️', 'Max iterations reached. Review output manually.');
        logDetail(`PO feedback: ${poResult.output}`);
      }
    }

    return false;
  }

  private async documentationPhase(context: ProjectContext): Promise<boolean> {
    logStep('📝 Documentation');

    const documentationWriter = new DocumentationWriter(this.provider);
    log('📝', 'Generating customer documentation...');

    const result = await this.runTimedAgent(
      'Documentation Writer',
      () => documentationWriter.execute(context),
    );
    if (result.success) {
      log('✅', 'Customer documentation created.');
      logDetail(result.output);
      return true;
    }

    log('🛑', 'Customer documentation generation failed.');
    logDetail(result.output);
    return false;
  }

  private async executeApprovedWorkflow(
    context: ProjectContext,
    rl: Interface | undefined,
    modeLabel: 'Development' | 'Self-Improvement',
    runStartedAtMs = Date.now(),
  ): Promise<boolean> {
    const poApproved = await this.developmentLoop(context, rl);
    let documentationSuccess = true;

    if (poApproved) {
      documentationSuccess = await this.documentationPhase(context);
      if (documentationSuccess) {
        logStep(`✅ ${modeLabel} Complete`);
      } else {
        logStep(`⚠️ ${modeLabel} Failed During Documentation`);
      }
    } else {
      logStep(`⚠️ ${modeLabel} Finished With Outstanding Issues`);
    }

    this.logRunSummary(context, runStartedAtMs);

    return poApproved && documentationSuccess;
  }

  private async writeSpecDocuments(context: ProjectContext): Promise<void> {
    await mkdir(context.docsDir, { recursive: true });

    if (context.prd) {
      await writeFile(join(context.docsDir, 'PRD.md'), context.prd, 'utf-8');
    }

    if (context.architecture) {
      await writeFile(join(context.docsDir, 'ARCHITECTURE.md'), context.architecture, 'utf-8');
    }
  }

  private async runEvaluatorWithRetry(
    evaluatorName: string,
    evaluate: () => Promise<AgentResult>,
  ): Promise<AgentResult> {
    const maxAttempts = 2;
    let lastResult: AgentResult | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const result = await evaluate();
      lastResult = result;

      if (this.isValidEvaluationResult(result)) {
        return result;
      }

      log(
        '⚠️',
        `${evaluatorName} returned invalid evaluation data (attempt ${attempt}/${maxAttempts}).`,
      );
      if (attempt < maxAttempts) {
        logDetail('Retrying evaluator once...');
      }
    }

    return lastResult ?? {
      success: false,
      score: 0,
      output: `${evaluatorName} did not produce an evaluation result.`,
      evaluationValid: false,
      issues: [
        {
          severity: 'critical',
          description: `${evaluatorName} did not produce an evaluation result.`,
        },
      ],
    };
  }

  private isValidEvaluationResult(result: AgentResult): boolean {
    if (result.evaluationValid === false) {
      return false;
    }

    if (typeof result.score !== 'number' || !Number.isFinite(result.score)) {
      return false;
    }

    return result.score >= 0 && result.score <= 100;
  }

  private extractHumanApprovalRequest(output: string): string | null {
    const markerMatch = output.match(/HUMAN_APPROVAL_REQUIRED\s*:\s*(.+)/i);
    if (!markerMatch) {
      return null;
    }

    return markerMatch[1].trim() || 'Developer requested a restricted operation.';
  }

  private hasCriticalIssues(...results: AgentResult[]): boolean {
    return results.some(r =>
      r.issues?.some(i => i.severity === 'critical') ?? false
    );
  }

  private belowThreshold(...results: AgentResult[]): boolean {
    return results.some(r =>
      typeof r.score !== 'number'
      || !Number.isFinite(r.score)
      || r.score < this.config.scoreThreshold
    );
  }

  private aggregateFeedback(
    ...evaluations: Array<{ name: string; result: AgentResult }>
  ): string {
    const severityOrder = { critical: 0, major: 1, minor: 2, info: 3 };
    const sections: string[] = [];

    // Find the weakest area to highlight
    const scored = evaluations
      .filter(e => typeof e.result.score === 'number')
      .sort((a, b) => (a.result.score ?? 100) - (b.result.score ?? 100));
    if (scored.length > 0) {
      const weakest = scored[0];
      sections.push(
        `## Priority\nWeakest area: ${weakest.name} (${weakest.result.score}/100, threshold: ${this.config.scoreThreshold}). Focus here first.`,
      );
    }

    for (const { name, result } of evaluations) {
      const issues = result.issues ?? [];
      if (issues.length === 0 && !result.output) continue;

      const header = `## ${name} — Score: ${result.score ?? 'N/A'}/100`;
      const sorted = [...issues].sort(
        (a, b) => severityOrder[a.severity] - severityOrder[b.severity],
      );
      const issueLines = sorted.map(
        i => `- [${i.severity.toUpperCase()}] ${i.description}${i.file ? ` (${i.file})` : ''}${i.suggestion ? ` → ${i.suggestion}` : ''}`,
      );

      sections.push([header, ...issueLines].join('\n'));
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

  private async runTimedAgent<T>(agentName: string, run: () => Promise<T>): Promise<T> {
    const startedAtMs = Date.now();

    try {
      const result = await run();
      logDetail(`${agentName} completed in ${this.formatDuration(Date.now() - startedAtMs)}.`);
      return result;
    } catch (error) {
      logDetail(`${agentName} failed after ${this.formatDuration(Date.now() - startedAtMs)}.`);
      throw error;
    }
  }

  private createScoreHistory(): ScoreHistory {
    return {
      review: [],
      qa: [],
      security: [],
      productOwner: [],
    };
  }

  private ensureScoreHistory(context: ProjectContext): ScoreHistory {
    if (!context.metrics) {
      context.metrics = {
        scoreHistory: this.createScoreHistory(),
      };
    } else if (!context.metrics.scoreHistory) {
      context.metrics.scoreHistory = this.createScoreHistory();
    }

    return context.metrics.scoreHistory;
  }

  private recordScore(history: number[], score: number | undefined): void {
    if (typeof score === 'number' && Number.isFinite(score)) {
      history.push(score);
    }
  }

  private logScoreTrends(scoreHistory: ScoreHistory): void {
    const trendParts = [
      `Review: ${this.formatScoreTrend(scoreHistory.review)}`,
      `QA: ${this.formatScoreTrend(scoreHistory.qa)}`,
      `Security: ${this.formatScoreTrend(scoreHistory.security)}`,
    ];

    if (scoreHistory.productOwner.length > 0) {
      trendParts.push(`PO: ${this.formatScoreTrend(scoreHistory.productOwner)}`);
    }

    logDetail(`Score trends -> ${trendParts.join(' | ')}`);
  }

  private formatScoreTrend(scores: number[]): string {
    if (scores.length === 0) {
      return 'N/A';
    }

    return scores.map(score => this.formatScore(score)).join('→');
  }

  private formatScore(score: number): string {
    if (Number.isInteger(score)) {
      return String(score);
    }

    const rounded = score.toFixed(1);
    return rounded.endsWith('.0') ? rounded.slice(0, -2) : rounded;
  }

  private logRunSummary(context: ProjectContext, runStartedAtMs: number): void {
    const scoreHistory = this.ensureScoreHistory(context);
    log('📁', `Output: ${context.workspaceDir}`);
    log('📊', `Iterations: ${context.iteration}`);
    log('⏱️', `Total time: ${this.formatDuration(Date.now() - runStartedAtMs)}`);

    if (scoreHistory.review.length > 0 || scoreHistory.qa.length > 0 || scoreHistory.security.length > 0) {
      this.logScoreTrends(scoreHistory);
    }
  }

  private formatDuration(durationMs: number): string {
    if (durationMs < 1000) {
      return `${Math.round(durationMs)}ms`;
    }

    const totalSeconds = durationMs / 1000;
    if (totalSeconds < 60) {
      return `${totalSeconds.toFixed(1)}s`;
    }

    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds - minutes * 60;
    return `${minutes}m ${seconds.toFixed(1)}s`;
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
