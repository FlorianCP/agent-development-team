import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { access, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import type { Interface } from 'node:readline';
import type { Provider } from './providers/provider.js';
import type {
  ADTConfig,
  AgentResult,
  CommandPolicy,
  Issue,
  IterationTiming,
  ProjectContext,
  RunMetrics,
  ScoreHistory,
} from './types.js';
import { RequirementsEngineer } from './agents/requirements-engineer.js';
import { Architect } from './agents/architect.js';
import { Developer } from './agents/developer.js';
import { Reviewer } from './agents/reviewer.js';
import { QAEngineer } from './agents/qa.js';
import { SecurityEngineer } from './agents/security.js';
import { ProductOwner } from './agents/product-owner.js';
import { DocumentationWriter } from './agents/documentation-writer.js';
import { RunLogger } from './run-logger.js';
import { createReadlineInterface, askQuestion, askYesNo, log, logStep, logDetail } from './utils.js';

interface VerificationCheck {
  label: string;
  command: string;
  args: string[];
}

type ReviewReportAgentKey = 'developer' | 'reviewer' | 'qa' | 'security';

interface ReviewReportEntry {
  agentName: string;
  agentKey: ReviewReportAgentKey;
  iteration: number;
  score: string;
  summary: string;
  issues?: Issue[];
}

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
    const runLogger = await RunLogger.create(workspaceDir);

    const context: ProjectContext = {
      requirement,
      docsDir,
      workspaceDir,
      iteration: 0,
      maxIterations: this.config.maxIterations,
      feedback: [],
      developerTrustMode: this.config.allowFullAuto ? 'high' : 'safe',
      developerCommandPolicy: this.createDefaultCommandPolicy(),
      metrics: this.createRunMetrics(),
      runLogger,
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

      return await this.runApprovedWorkflow(context, rl, 'Development', runStartedAtMs);

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
    await mkdir(runtimeDir, { recursive: true });
    const runLogger = await RunLogger.create(runtimeDir);
    const rl = createReadlineInterface();

    const context: ProjectContext = {
      requirement: `Improve the Agent Development Team (ADT) codebase. The codebase is a TypeScript project in the current directory. ${requirement}`,
      docsDir,
      workspaceDir,
      iteration: 0,
      maxIterations: this.config.maxIterations,
      feedback: [],
      developerTrustMode: this.config.allowFullAuto ? 'high' : 'safe',
      developerCommandPolicy: this.createDefaultCommandPolicy(),
      isSelfImprove: true,
      metrics: this.createRunMetrics(),
      runLogger,
    };

    console.log('\n🤖 Agent Development Team — Self-Improvement Mode');
    console.log('═'.repeat(60));
    log('📁', `Working on: ${workspaceDir}`);
    log('📄', `Using runtime docs: ${docsDir}`);

    // Skip requirements/architecture for self-improvement — go straight to development
    context.prd = `# Self-Improvement PRD\n\n## Requirement\n${requirement}\n\n## Context\nThis is the ADT codebase itself. Make the requested improvements while maintaining the existing architecture and conventions.\n\n## Acceptance Criteria\n- The requested improvement is implemented\n- Existing functionality is not broken\n- Code follows project conventions\n- npm run build succeeds`;
    context.architecture = `# ADT Architecture (Self-Improvement Baseline)

## Core Boundaries
- \`src/orchestrator.ts\` is the single coordinator for agent sequencing and quality gates.
- All model calls must flow through the \`Provider\` interface in \`src/providers/provider.ts\`.
- Agents remain independent modules under \`src/agents/\` with no cross-agent imports.

## Agent Responsibilities
- Requirements Engineer: clarifies requirement and produces PRD.
- Architect: produces architecture guidance from PRD.
- Developer: implements code changes in workspace-write mode.
- Reviewer/QA/Security/Product Owner: evaluator gates with strict JSON scoring outputs.
- Documentation Writer: produces customer-facing docs after approval.

## Data Flow
- Runtime documents are written to \`docs/\` (PRD, ARCHITECTURE, CUSTOMER_GUIDE).
- Iteration feedback is aggregated by orchestrator and provided back to Developer.
- Approval requires evaluator scores meeting configured threshold and no critical issues.

## Invariants
- Quality scores must be valid numbers in range 0-100.
- Product Owner approval requires explicit boolean \`approved\`.
- Self-improvement in non-interactive mode requires explicit consent.
- Full-auto execution is opt-in and guarded by command policy checks.`;

    try {
      const trustLabel = context.developerTrustMode === 'high' ? 'full-auto trust mode' : 'safe trust mode';
      const approved = await this.resolveSelfImproveApproval(rl, trustLabel);
      if (!approved) {
        log('🛑', 'Self-improvement cancelled by user.');
        return false;
      }

      return await this.runApprovedWorkflow(context, rl, 'Self-Improvement', runStartedAtMs);
    } finally {
      rl.close();
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
    const iterationDurations = this.ensureIterationDurations(context);
    const devAgent = new Developer(this.provider);
    const reviewAgent = new Reviewer(this.provider);
    const qaAgent = new QAEngineer(this.provider);
    const securityAgent = new SecurityEngineer(this.provider);
    const poAgent = new ProductOwner(this.provider);

    while (context.iteration < context.maxIterations) {
      context.iteration++;
      const iterationStartedAtMs = Date.now();
      logStep(`🔄 Development Iteration ${context.iteration}/${context.maxIterations}`);

      // Git checkpoint before developer modifies code (self-improve only)
      if (this.config.gitCheckpoints && context.isSelfImprove) {
        await this.createGitCheckpoint(context);
      }

      // Develop
      log('👨‍💻', 'Developing...');
      const devResult = await this.runTimedAgent('Developer', () => devAgent.execute(context));
      await this.writeReviewReport(
        context,
        this.createDeveloperReviewReport(context, devResult),
      );
      log('✅', 'Code written.');

      const approvalReason = this.extractHumanApprovalRequest(devResult.output);
      if (approvalReason) {
        log('🛑', 'Developer requested explicit human approval before continuing.');
        logDetail(approvalReason);
        if (!rl || !process.stdin.isTTY) {
          this.completeIteration(
            iterationDurations,
            context.iteration,
            iterationStartedAtMs,
            'halted',
          );
          return false;
        }
        const continueAutomatedChecks = await askYesNo(
          rl,
          '   Complete the manual step, then continue automated review gates?',
        );
        if (!continueAutomatedChecks) {
          this.completeIteration(
            iterationDurations,
            context.iteration,
            iterationStartedAtMs,
            'halted',
          );
          return false;
        }
      }

      // Review
      log('🔍', 'Starting parallel evaluation gates...');
      logDetail('Started: Code Reviewer');
      logDetail('Started: QA Engineer');
      logDetail('Started: Security Engineer');
      const evaluatorPhaseStartedAtMs = Date.now();
      const reviewTask = this.runEvaluatorSafely(
        'Code Reviewer',
        () => this.runTimedAgent(
          'Code Reviewer',
          () => this.runEvaluatorWithRetry(
            'Code Reviewer',
            () => reviewAgent.execute(context),
          ),
        ),
      ).then((result) => {
        this.logEvaluatorCompletion('Code Reviewer', result);
        this.recordScore(scoreHistory.review, result.score);
        return this.writeReviewReport(
          context,
          this.createEvaluatorReviewReport(context, 'Code Reviewer', 'reviewer', result),
        ).then(() => result);
      });
      const qaTask = this.runEvaluatorSafely(
        'QA Engineer',
        () => this.runTimedAgent(
          'QA Engineer',
          () => this.runEvaluatorWithRetry(
            'QA Engineer',
            () => qaAgent.execute(context),
          ),
        ),
      ).then((result) => {
        this.logEvaluatorCompletion('QA Engineer', result);
        this.recordScore(scoreHistory.qa, result.score);
        return this.writeReviewReport(
          context,
          this.createEvaluatorReviewReport(context, 'QA Engineer', 'qa', result),
        ).then(() => result);
      });
      const securityTask = this.runEvaluatorSafely(
        'Security Engineer',
        () => this.runTimedAgent(
          'Security Engineer',
          () => this.runEvaluatorWithRetry(
            'Security Engineer',
            () => securityAgent.execute(context),
          ),
        ),
      ).then((result) => {
        this.logEvaluatorCompletion('Security Engineer', result);
        this.recordScore(scoreHistory.security, result.score);
        return this.writeReviewReport(
          context,
          this.createEvaluatorReviewReport(context, 'Security Engineer', 'security', result),
        ).then(() => result);
      });
      const [review, qa, security] = await Promise.all([reviewTask, qaTask, securityTask]);
      logDetail(
        `Parallel evaluator wall-clock time: ${this.formatDuration(Date.now() - evaluatorPhaseStartedAtMs)}.`,
      );

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
          this.completeIteration(
            iterationDurations,
            context.iteration,
            iterationStartedAtMs,
            'retry',
          );
          log('⚠️', `Issues found. Starting iteration ${context.iteration + 1}...`);
          continue;
        } else {
          this.logScoreTrends(scoreHistory);
          log('🛑', 'Max iterations reached with unresolved critical/quality issues. Failing run.');
          logDetail('Product Owner review skipped because quality gate was not met.');
          await this.publishIterationReport(
            context,
            scoreHistory,
            [
              { name: 'Code Reviewer', result: review },
              { name: 'QA Engineer', result: qa },
              { name: 'Security Engineer', result: security },
            ],
          );
          this.completeIteration(
            iterationDurations,
            context.iteration,
            iterationStartedAtMs,
            'max-iterations',
          );
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
        this.completeIteration(
          iterationDurations,
          context.iteration,
          iterationStartedAtMs,
          'approved',
        );
        return true;
      }

      if (context.iteration < context.maxIterations) {
        context.feedback.push(poResult.output);
        this.completeIteration(
          iterationDurations,
          context.iteration,
          iterationStartedAtMs,
          'retry',
        );
        log('🔄', 'PO requested changes. Continuing development...');
      } else {
        log('⚠️', 'Max iterations reached. Review output manually.');
        logDetail(`PO feedback: ${poResult.output}`);
        await this.publishIterationReport(
          context,
          scoreHistory,
          [
            { name: 'Code Reviewer', result: review },
            { name: 'QA Engineer', result: qa },
            { name: 'Security Engineer', result: security },
            { name: 'Product Owner', result: poResult },
          ],
        );
        this.completeIteration(
          iterationDurations,
          context.iteration,
          iterationStartedAtMs,
          'max-iterations',
        );
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

  private async postApprovalVerificationPhase(context: ProjectContext): Promise<boolean> {
    const verificationPlan = await this.resolveVerificationChecks(context.workspaceDir);
    if (verificationPlan.error) {
      logStep('🧪 Post-Approval Verification');
      log('🛑', 'Deterministic verification setup failed.');
      logDetail(verificationPlan.error);
      return false;
    }

    const checks = verificationPlan.checks;
    if (checks.length === 0) {
      logDetail('No deterministic post-approval verification checks found. Skipping.');
      return true;
    }

    logStep('🧪 Post-Approval Verification');
    for (const check of checks) {
      log('🔧', `Running ${check.label}...`);
      const result = await this.runVerificationCommand(
        check.command,
        check.args,
        context.workspaceDir,
      );

      if (!result.success) {
        log('🛑', `${check.label} failed.`);
        if (result.details) {
          logDetail(result.details);
        }
        return false;
      }

      logDetail(
        `${check.label} passed in ${this.formatDuration(result.durationMs)}.`,
      );
    }

    return true;
  }

  private async resolveVerificationChecks(
    workspaceDir: string,
  ): Promise<{ checks: VerificationCheck[]; error?: string }> {
    const packageJsonPath = join(workspaceDir, 'package.json');
    let packageJsonRaw: string;

    try {
      packageJsonRaw = await readFile(packageJsonPath, 'utf-8');
    } catch {
      return { checks: [] };
    }

    let parsedPackage: Record<string, unknown>;
    try {
      parsedPackage = JSON.parse(packageJsonRaw) as Record<string, unknown>;
    } catch {
      return { checks: [], error: `Invalid JSON in ${packageJsonPath}.` };
    }

    const checks: VerificationCheck[] = [];
    const scripts = parsedPackage['scripts'];
    const buildScript = scripts && typeof scripts === 'object'
      ? (scripts as Record<string, unknown>)['build']
      : undefined;

    if (typeof buildScript === 'string' && buildScript.trim().length > 0) {
      checks.push({
        label: 'npm run build',
        command: this.getNpmCommand(),
        args: ['run', 'build'],
      });
    }

    const cliPath = await this.resolveCliSmokeTarget(parsedPackage, workspaceDir);
    if (cliPath) {
      checks.push({
        label: 'CLI smoke check (node dist/cli.js --help)',
        command: process.execPath,
        args: [cliPath, '--help'],
      });
    }

    return { checks };
  }

  private async runVerificationCommand(
    command: string,
    args: string[],
    cwd: string,
  ): Promise<{ success: boolean; durationMs: number; details?: string }> {
    return new Promise((resolvePromise) => {
      const startedAt = Date.now();
      const child = spawn(command, args, {
        cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';
      const maxOutputChars = 4000;

      child.stdout.on('data', (chunk: Buffer) => {
        stdout = this.appendVerificationOutput(stdout, chunk.toString(), maxOutputChars);
      });

      child.stderr.on('data', (chunk: Buffer) => {
        stderr = this.appendVerificationOutput(stderr, chunk.toString(), maxOutputChars);
      });

      child.on('error', (error) => {
        const details = `Failed to start "${command} ${args.join(' ')}": ${error.message}`;
        resolvePromise({
          success: false,
          durationMs: Date.now() - startedAt,
          details,
        });
      });

      child.on('close', (code) => {
        const durationMs = Date.now() - startedAt;
        if (code === 0) {
          resolvePromise({ success: true, durationMs });
          return;
        }

        const renderedOutput = [stderr.trim(), stdout.trim()]
          .filter(part => part.length > 0)
          .join(' | ');
        const details = renderedOutput.length > 0
          ? `Exit code ${code}. ${renderedOutput}`
          : `Exit code ${code}.`;

        resolvePromise({
          success: false,
          durationMs,
          details,
        });
      });
    });
  }

  private appendVerificationOutput(current: string, next: string, maxChars: number): string {
    const combined = current + next;
    if (combined.length <= maxChars) {
      return combined;
    }
    return combined.slice(0, maxChars);
  }

  private getNpmCommand(): string {
    return process.platform === 'win32' ? 'npm.cmd' : 'npm';
  }

  private async resolveCliSmokeTarget(
    parsedPackage: Record<string, unknown>,
    workspaceDir: string,
  ): Promise<string | null> {
    const workspaceRealPath = await this.resolveRealPathSafe(workspaceDir);
    const bin = parsedPackage['bin'];
    if (typeof bin === 'string') {
      return this.resolveWorkspaceCommandPath(workspaceDir, workspaceRealPath, bin);
    }

    if (bin && typeof bin === 'object') {
      const entries = Object.values(bin as Record<string, unknown>);
      for (const entry of entries) {
        if (typeof entry === 'string') {
          const resolvedBin = await this.resolveWorkspaceCommandPath(
            workspaceDir,
            workspaceRealPath,
            entry,
          );
          if (resolvedBin) {
            return resolvedBin;
          }
        }
      }
    }

    return this.resolveWorkspaceCommandPath(
      workspaceDir,
      workspaceRealPath,
      join('dist', 'cli.js'),
    );
  }

  private async pathExists(path: string): Promise<boolean> {
    try {
      await access(path);
      return true;
    } catch {
      return false;
    }
  }

  async runApprovedWorkflow(
    context: ProjectContext,
    rl: Interface | undefined,
    modeLabel: 'Development' | 'Self-Improvement',
    runStartedAtMs = Date.now(),
  ): Promise<boolean> {
    if (!context.runLogger) {
      context.runLogger = await RunLogger.create(resolve(context.docsDir, '..'));
    }

    const poApproved = await this.developmentLoop(context, rl);
    let verificationSuccess = true;
    let documentationSuccess = true;

    if (poApproved) {
      verificationSuccess = await this.postApprovalVerificationPhase(context);
      if (verificationSuccess) {
        documentationSuccess = await this.documentationPhase(context);
      }

      if (verificationSuccess && documentationSuccess) {
        logStep(`✅ ${modeLabel} Complete`);
      } else if (!verificationSuccess) {
        logStep(`⚠️ ${modeLabel} Failed During Verification`);
      } else {
        logStep(`⚠️ ${modeLabel} Failed During Documentation`);
      }
    } else {
      logStep(`⚠️ ${modeLabel} Finished With Outstanding Issues`);
    }

    this.logRunSummary(context, runStartedAtMs);

    return poApproved && verificationSuccess && documentationSuccess;
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

    return this.normalizedInvalidEvaluationResult(evaluatorName, lastResult);
  }

  private async runEvaluatorSafely(
    evaluatorName: string,
    evaluate: () => Promise<AgentResult>,
  ): Promise<AgentResult> {
    try {
      return await evaluate();
    } catch (error) {
      return this.normalizedFailedEvaluatorResult(evaluatorName, error);
    }
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
    return results.some(r => {
      if (!this.isValidEvaluationResult(r)) {
        return true;
      }

      return (r.score ?? 0) < this.config.scoreThreshold;
    });
  }

  private normalizedInvalidEvaluationResult(
    evaluatorName: string,
    lastResult: AgentResult | null,
  ): AgentResult {
    const reasons: string[] = [];

    if (!lastResult) {
      reasons.push('no result was returned');
    } else {
      if (lastResult.evaluationValid === false) {
        reasons.push('evaluator marked output as invalid');
      }
      if (typeof lastResult.score !== 'number' || !Number.isFinite(lastResult.score)) {
        reasons.push('score is missing or non-finite');
      } else if (lastResult.score < 0 || lastResult.score > 100) {
        reasons.push(`score ${lastResult.score} is outside 0-100`);
      }
    }

    return {
      success: false,
      score: 0,
      output: `${evaluatorName} produced invalid evaluation data after retries. ${reasons.join('; ') || 'Validation failed.'}`,
      evaluationValid: false,
      issues: [
        {
          severity: 'critical',
          description: `${evaluatorName} produced invalid evaluation data after retries.`,
          suggestion: 'Return strict JSON with score in range 0-100 and required fields.',
        },
      ],
    };
  }

  private normalizedFailedEvaluatorResult(
    evaluatorName: string,
    error: unknown,
  ): AgentResult {
    const message = error instanceof Error ? error.message : String(error);

    log(
      '⚠️',
      `${evaluatorName} failed unexpectedly. Capturing failure as critical feedback.`,
    );
    logDetail(`${evaluatorName} error: ${message}`);

    return {
      success: false,
      score: 0,
      output: `${evaluatorName} failed unexpectedly: ${message}`,
      evaluationValid: false,
      issues: [
        {
          severity: 'critical',
          description: `${evaluatorName} failed unexpectedly during evaluation.`,
          suggestion: 'Fix evaluator runtime failure and re-run the quality gates.',
        },
      ],
    };
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

  private createDeveloperReviewReport(
    context: ProjectContext,
    result: AgentResult,
  ): ReviewReportEntry {
    return {
      agentName: 'Developer',
      agentKey: 'developer',
      iteration: context.iteration,
      score: this.extractDeveloperConfidenceScore(result.output) ?? 'N/A',
      summary: this.renderFullReportSummary(result.output),
    };
  }

  private createEvaluatorReviewReport(
    context: ProjectContext,
    agentName: string,
    agentKey: Exclude<ReviewReportAgentKey, 'developer'>,
    result: AgentResult,
  ): ReviewReportEntry {
    return {
      agentName,
      agentKey,
      iteration: context.iteration,
      score: this.formatOptionalScore(result.score),
      summary: this.renderFullReportSummary(result.output),
      issues: result.issues ?? [],
    };
  }

  private async writeReviewReport(
    context: ProjectContext,
    entry: ReviewReportEntry,
  ): Promise<void> {
    const reviewsDir = join(context.docsDir, 'reviews');
    const reportPath = join(reviewsDir, `iteration-${entry.iteration}-${entry.agentKey}.md`);
    const content = this.renderReviewReport(entry);

    await mkdir(reviewsDir, { recursive: true });
    await writeFile(reportPath, content, 'utf-8');
    logDetail(`Review report written: ${reportPath}`);
  }

  private renderReviewReport(entry: ReviewReportEntry): string {
    return [
      `# ${entry.agentName} Report`,
      '',
      `- Agent: ${entry.agentName}`,
      `- Iteration: ${entry.iteration}`,
      `- Score: ${entry.score}`,
      '',
      '## Summary',
      entry.summary,
      '',
      '## Issues By Severity',
      this.renderReportIssueGroups(entry.issues ?? []),
    ].join('\n');
  }

  private renderReportIssueGroups(issues: Issue[]): string {
    return [
      '### Critical',
      ...this.renderReportIssueList(issues, 'critical'),
      '',
      '### Major',
      ...this.renderReportIssueList(issues, 'major'),
      '',
      '### Minor',
      ...this.renderReportIssueList(issues, 'minor'),
      '',
      '### Info',
      ...this.renderReportIssueList(issues, 'info'),
    ].join('\n');
  }

  private renderReportIssueList(
    issues: Issue[],
    severity: Issue['severity'],
  ): string[] {
    const matchingIssues = issues.filter(issue => issue.severity === severity);
    if (matchingIssues.length === 0) {
      return ['- None'];
    }

    return matchingIssues.flatMap(issue => this.renderReportIssue(issue));
  }

  private renderReportIssue(issue: Issue): string[] {
    const location = issue.file ? ` (${issue.file})` : '';
    const suggestion = issue.suggestion ? ` -> ${issue.suggestion}` : '';
    const prompt = this.createSelfImprovePrompt(issue);
    return [
      `- ${issue.description}${location}${suggestion}`,
      `  Suggested self-improve command: \`npm run start -- self-improve "${this.escapeShellDoubleQuotes(prompt)}"\``,
    ];
  }

  private createSelfImprovePrompt(issue: Issue): string {
    const location = issue.file ? ` in ${issue.file}` : '';
    const suggestion = issue.suggestion ? ` Suggested fix: ${issue.suggestion}` : '';
    return `Fix this ${issue.severity} issue${location}: ${issue.description}${suggestion}`
      .replace(/\s+/g, ' ')
      .trim();
  }

  private escapeShellDoubleQuotes(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  private async publishIterationReport(
    context: ProjectContext,
    scoreHistory: ScoreHistory,
    evaluations: Array<{ name: string; result: AgentResult }>,
  ): Promise<void> {
    const report = this.renderIterationReport(context, scoreHistory, evaluations);
    const reportPath = join(context.docsDir, 'ITERATION_REPORT.md');

    await mkdir(context.docsDir, { recursive: true });
    await writeFile(reportPath, report, 'utf-8');

    log('📄', 'Iteration report generated (max iterations reached).');
    logDetail(`Report: ${reportPath}`);
    console.log(`\n${report}\n`);
  }

  private renderIterationReport(
    context: ProjectContext,
    scoreHistory: ScoreHistory,
    evaluations: Array<{ name: string; result: AgentResult }>,
  ): string {
    const finalScores = [
      this.formatFinalScoreLine('Code Reviewer', evaluations),
      this.formatFinalScoreLine('QA Engineer', evaluations),
      this.formatFinalScoreLine('Security Engineer', evaluations),
      this.formatFinalScoreLine('Product Owner', evaluations),
    ];

    const trends = [
      `- Code Reviewer: ${this.formatScoreTrend(scoreHistory.review)}`,
      `- QA Engineer: ${this.formatScoreTrend(scoreHistory.qa)}`,
      `- Security Engineer: ${this.formatScoreTrend(scoreHistory.security)}`,
      `- Product Owner: ${this.formatScoreTrend(scoreHistory.productOwner)}`,
    ];

    const groupedIssues = this.groupIssuesBySeverity(evaluations);
    const unresolvedIssueSection = this.renderGroupedIssues(groupedIssues);
    const recommendation = this.recommendNextFocus(evaluations);

    return [
      '# Iteration Report',
      '',
      `- Status: Max iterations reached (${context.iteration}/${context.maxIterations})`,
      `- Threshold: ${this.config.scoreThreshold}/100`,
      '',
      '## Final Scores',
      ...finalScores,
      '',
      '## Score Trends',
      ...trends,
      '',
      '## Remaining Unresolved Issues By Severity',
      unresolvedIssueSection,
      '',
      '## Recommendation',
      recommendation,
    ].join('\n');
  }

  private formatFinalScoreLine(
    evaluatorName: string,
    evaluations: Array<{ name: string; result: AgentResult }>,
  ): string {
    const evaluation = evaluations.find(item => item.name === evaluatorName);
    const score = evaluation?.result.score;
    if (typeof score !== 'number' || !Number.isFinite(score)) {
      return `- ${evaluatorName}: N/A`;
    }

    return `- ${evaluatorName}: ${this.formatScore(score)}/100`;
  }

  private groupIssuesBySeverity(
    evaluations: Array<{ name: string; result: AgentResult }>,
    includeAgentPrefix = true,
  ): Record<'critical' | 'major' | 'minor' | 'info', string[]> {
    const grouped: Record<'critical' | 'major' | 'minor' | 'info', string[]> = {
      critical: [],
      major: [],
      minor: [],
      info: [],
    };

    for (const { name, result } of evaluations) {
      for (const issue of result.issues ?? []) {
        const location = issue.file ? ` (${issue.file})` : '';
        const suggestion = issue.suggestion ? ` -> ${issue.suggestion}` : '';
        const prefix = includeAgentPrefix ? `[${name}] ` : '';
        grouped[issue.severity].push(`${prefix}${issue.description}${location}${suggestion}`);
      }
    }

    return grouped;
  }

  private renderGroupedIssues(
    grouped: Record<'critical' | 'major' | 'minor' | 'info', string[]>,
  ): string {
    const labels: Array<{ severity: 'critical' | 'major' | 'minor' | 'info'; label: string }> = [
      { severity: 'critical', label: '### Critical' },
      { severity: 'major', label: '### Major' },
      { severity: 'minor', label: '### Minor' },
      { severity: 'info', label: '### Info' },
    ];

    const sections: string[] = [];
    for (const { severity, label } of labels) {
      sections.push(label);
      if (grouped[severity].length === 0) {
        sections.push('- None');
      } else {
        sections.push(...grouped[severity].map(issue => `- ${issue}`));
      }
      sections.push('');
    }

    return sections.join('\n').trimEnd();
  }

  private recommendNextFocus(
    evaluations: Array<{ name: string; result: AgentResult }>,
  ): string {
    const hasCritical = evaluations.some(
      ({ result }) => result.issues?.some(issue => issue.severity === 'critical') ?? false,
    );
    if (hasCritical) {
      return 'Resolve all critical issues first, then re-run quality gates.';
    }

    const scored = evaluations
      .filter(({ result }) => typeof result.score === 'number' && Number.isFinite(result.score))
      .sort((a, b) => (a.result.score ?? 100) - (b.result.score ?? 100));

    if (scored.length > 0 && (scored[0].result.score ?? 100) < this.config.scoreThreshold) {
      const weakest = scored[0];
      return `Improve ${weakest.name} outcomes first (${this.formatScore(weakest.result.score ?? 0)}/100 vs threshold ${this.config.scoreThreshold}/100).`;
    }

    const poResult = evaluations.find(item => item.name === 'Product Owner')?.result;
    if (poResult && !poResult.success) {
      return 'Address Product Owner feedback and acceptance criteria gaps before requesting approval again.';
    }

    return 'Focus on remaining major and minor issues, then run another full validation pass.';
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

  private logEvaluatorCompletion(evaluatorName: string, result: AgentResult): void {
    logDetail(`${evaluatorName} score: ${result.score ?? 'N/A'}/100`);
    this.logIssueCount(result);
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

  private createRunMetrics(): RunMetrics {
    return {
      scoreHistory: this.createScoreHistory(),
      iterationDurations: [],
    };
  }

  private createDefaultCommandPolicy(): CommandPolicy {
    return {
      allowedCommandPrefixes: [
        'npm run build',
        'npm run test',
        'npm test',
        'npm run lint',
        'npm run typecheck',
        'npx adt --help',
        'node dist/cli.js --help',
        'node --test',
        'tsc --noemit',
        'tsc',
      ],
      blockedCommandPatterns: [
        '\\brm\\s+-rf\\b',
        '\\bsudo\\b',
        '\\bchown\\b',
        '\\bchmod\\s+[0-7]{3,4}\\b',
        '\\bgit\\s+reset\\s+--hard\\b',
        '\\bgit\\s+push\\s+--force\\b',
        '\\bgit\\s+rebase\\b',
        '\\bcurl\\b',
        '\\bwget\\b',
        '\\bnc\\b',
        '\\bscp\\b',
        '\\brsync\\b',
      ],
    };
  }

  private async resolveSelfImproveApproval(rl: Interface, trustLabel: string): Promise<boolean> {
    if (process.stdin.isTTY) {
      return askYesNo(
        rl,
        `   Self-improvement can edit repository files. Continue in ${trustLabel}?`,
      );
    }

    if (this.config.yesSelfImprove) {
      logDetail('Non-interactive approval granted by --yes-self-improve.');
      return true;
    }

    logDetail('Non-interactive self-improvement requires --yes-self-improve.');
    return false;
  }

  private ensureMetrics(context: ProjectContext): RunMetrics {
    if (!context.metrics) {
      context.metrics = this.createRunMetrics();
    } else if (!context.metrics.scoreHistory) {
      context.metrics.scoreHistory = this.createScoreHistory();
    }

    if (!Array.isArray(context.metrics.iterationDurations)) {
      context.metrics.iterationDurations = [];
    }

    return context.metrics;
  }

  private ensureScoreHistory(context: ProjectContext): ScoreHistory {
    return this.ensureMetrics(context).scoreHistory;
  }

  private ensureIterationDurations(context: ProjectContext): IterationTiming[] {
    return this.ensureMetrics(context).iterationDurations;
  }

  private recordScore(history: number[], score: number | undefined): void {
    if (typeof score === 'number' && Number.isFinite(score)) {
      history.push(score);
    }
  }

  private completeIteration(
    iterationDurations: IterationTiming[],
    iteration: number,
    iterationStartedAtMs: number,
    outcome: IterationTiming['outcome'],
  ): void {
    const durationMs = Date.now() - iterationStartedAtMs;
    iterationDurations.push({
      iteration,
      durationMs,
      outcome,
    });
    logDetail(`Iteration ${iteration} completed in ${this.formatDuration(durationMs)} (${outcome}).`);
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

  private formatOptionalScore(score: number | undefined): string {
    if (typeof score !== 'number' || !Number.isFinite(score)) {
      return 'N/A';
    }

    return this.formatScore(score);
  }

  private extractDeveloperConfidenceScore(output: string): string | null {
    const match = output.match(/Confidence:\s*(100|[1-9]?\d)(?:\b|\/100)/i);
    if (!match) {
      return null;
    }

    return match[1];
  }

  private renderFullReportSummary(content: string): string {
    const normalized = content.replace(/\r\n/g, '\n').trim();
    if (normalized.length === 0) {
      return 'No summary provided.';
    }

    return normalized;
  }

  private logRunSummary(context: ProjectContext, runStartedAtMs: number): void {
    const metrics = this.ensureMetrics(context);
    const scoreHistory = metrics.scoreHistory;
    log('📁', `Output: ${context.workspaceDir}`);
    log('📊', `Iterations: ${context.iteration}`);
    log('⏱️', `Total time: ${this.formatDuration(Date.now() - runStartedAtMs)}`);
    if (metrics.iterationDurations.length > 0) {
      log('⏱️', `Iteration times: ${this.formatIterationDurations(metrics.iterationDurations)}`);
    }

    if (scoreHistory.review.length > 0 || scoreHistory.qa.length > 0 || scoreHistory.security.length > 0) {
      this.logScoreTrends(scoreHistory);
    }
  }

  private formatIterationDurations(iterationDurations: IterationTiming[]): string {
    return iterationDurations
      .map(({ iteration, durationMs, outcome }) =>
        `#${iteration}: ${this.formatDuration(durationMs)} (${outcome})`,
      )
      .join(' | ');
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

  private async createGitCheckpoint(context: ProjectContext): Promise<void> {
    const tag = `adt-checkpoint-iter-${context.iteration}`;
    try {
      const execFileAsync = promisify(execFile);
      // Stage all changes and commit
      await execFileAsync('git', ['add', '-A'], { cwd: context.workspaceDir });
      await execFileAsync(
        'git',
        ['commit', '-m', `adt: checkpoint before iteration ${context.iteration}`, '--allow-empty'],
        { cwd: context.workspaceDir },
      );
      await execFileAsync('git', ['tag', '-f', tag], { cwd: context.workspaceDir });
      logDetail(`Git checkpoint created (${tag}).`);
    } catch {
      logDetail('Git checkpoint skipped (not a git repo or nothing to commit).');
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

  private async resolveWorkspaceCommandPath(
    workspaceDir: string,
    workspaceRealPath: string,
    candidatePath: string,
  ): Promise<string | null> {
    const normalized = candidatePath.trim();
    if (normalized.length === 0 || normalized.includes('\0') || isAbsolute(normalized)) {
      return null;
    }

    const resolvedPath = resolve(workspaceDir, normalized);
    const relativeToWorkspace = relative(workspaceDir, resolvedPath);
    if (relativeToWorkspace === '..' || relativeToWorkspace.startsWith(`..${sep}`)) {
      return null;
    }

    if (!(await this.pathExists(resolvedPath))) {
      return null;
    }

    let canonicalPath: string;
    try {
      canonicalPath = await realpath(resolvedPath);
    } catch {
      return null;
    }

    if (!this.isPathInside(workspaceRealPath, canonicalPath)) {
      return null;
    }

    return canonicalPath;
  }

  private async resolveRealPathSafe(path: string): Promise<string> {
    try {
      return await realpath(path);
    } catch {
      return resolve(path);
    }
  }

  private isPathInside(baseDir: string, targetPath: string): boolean {
    const rel = relative(baseDir, targetPath);
    return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`));
  }
}
