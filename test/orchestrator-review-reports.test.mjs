import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { Orchestrator } from '../dist/orchestrator.js';

class FakeProvider {
  name = 'fake';

  constructor(handler) {
    this.handler = handler;
  }

  async execute(prompt, options) {
    return this.handler(prompt, options);
  }
}

function jsonBlock(obj) {
  return `\`\`\`json\n${JSON.stringify(obj)}\n\`\`\``;
}

function createConfig(outputDir, maxIterations = 1) {
  return {
    provider: 'fake',
    maxIterations,
    scoreThreshold: 80,
    outputDir,
    providerTimeoutMs: 1000,
  };
}

function createPreparedContext(workspaceDir, maxIterations = 1) {
  return {
    requirement: 'Improve ADT',
    prd: '# PRD',
    architecture: '# ARCHITECTURE',
    docsDir: join(workspaceDir, '.test-docs'),
    workspaceDir,
    iteration: 0,
    maxIterations,
    feedback: [],
    developerTrustMode: 'safe',
  };
}

async function runApprovedWorkflow(orchestrator, context, modeLabel = 'Self-Improvement') {
  const originalConsoleLog = console.log;
  console.log = () => {};
  try {
    return await orchestrator.runApprovedWorkflow(context, undefined, modeLabel);
  } finally {
    console.log = originalConsoleLog;
  }
}

test('writes developer and evaluator review reports to workspace docs/reviews', async () => {
  const outputDir = await mkdtemp(join(tmpdir(), 'adt-review-reports-test-'));

  try {
    const provider = new FakeProvider(async (prompt) => {
      if (prompt.includes('senior Software Developer')) {
        return 'Implemented iteration changes.\nConfidence: 87';
      }
      if (prompt.includes('senior Code Reviewer')) {
        return jsonBlock({
          score: 91,
          summary: 'Review passed with one note.',
          issues: [{ severity: 'minor', description: 'Tighten naming.', file: 'src/orchestrator.ts', suggestion: 'Use a clearer helper name.' }],
        });
      }
      if (prompt.includes('senior QA Engineer')) {
        return jsonBlock({ score: 93, summary: 'QA passed.', issues: [] });
      }
      if (prompt.includes('senior Security Engineer')) {
        return jsonBlock({ score: 96, summary: 'Security passed.', issues: [] });
      }
      if (prompt.includes('You are a Product Owner')) {
        return jsonBlock({ score: 95, approved: true, summary: 'Approved.', issues: [] });
      }
      if (prompt.includes('senior Documentation Writer')) {
        return '# Customer Guide\n\nUse it.';
      }
      throw new Error(`Unexpected prompt: ${prompt.slice(0, 80)}`);
    });

    const orchestrator = new Orchestrator(provider, createConfig(outputDir));
    const success = await runApprovedWorkflow(orchestrator, createPreparedContext(outputDir));

    assert.equal(success, true);

    const reviewsDir = join(outputDir, '.test-docs', 'reviews');
    const requirementsReport = await readFile(join(reviewsDir, 'iteration-0-requirements-engineer.md'), 'utf-8');
    const architectReport = await readFile(join(reviewsDir, 'iteration-0-architect.md'), 'utf-8');
    const developerReport = await readFile(join(reviewsDir, 'iteration-1-developer.md'), 'utf-8');
    const reviewerReport = await readFile(join(reviewsDir, 'iteration-1-reviewer.md'), 'utf-8');
    const qaReport = await readFile(join(reviewsDir, 'iteration-1-qa.md'), 'utf-8');
    const securityReport = await readFile(join(reviewsDir, 'iteration-1-security.md'), 'utf-8');
    const productOwnerReport = await readFile(join(reviewsDir, 'iteration-1-product-owner.md'), 'utf-8');

    assert.match(requirementsReport, /# Requirements Engineer Report/);
    assert.match(requirementsReport, /- Iteration: 0/);
    assert.match(requirementsReport, /## Summary/);

    assert.match(architectReport, /# Architect Report/);
    assert.match(architectReport, /- Iteration: 0/);
    assert.match(architectReport, /## Summary/);

    assert.match(developerReport, /# Developer Report/);
    assert.match(developerReport, /- Iteration: 1/);
    assert.match(developerReport, /- Score: 87/);
    assert.match(developerReport, /Implemented iteration changes\./);
    assert.match(developerReport, /### Critical/);
    assert.match(developerReport, /- None/);

    assert.match(reviewerReport, /# Code Reviewer Report/);
    assert.match(reviewerReport, /- Score: 91/);
    assert.match(reviewerReport, /### Minor/);
    assert.match(reviewerReport, /Tighten naming\. \(src\/orchestrator\.ts\) -> Use a clearer helper name\./);
    assert.match(
      reviewerReport,
      /Suggested self-improve prompt: Fix this minor issue in src\/orchestrator\.ts: Tighten naming\. Suggested fix: Use a clearer helper name\./,
    );
    assert.match(
      reviewerReport,
      /Suggested self-improve command:\n  ```sh\n  npm run start -- self-improve 'Fix this minor issue in src\/orchestrator\.ts: Tighten naming\. Suggested fix: Use a clearer helper name\.'\n  ```/,
    );

    assert.match(qaReport, /# QA Engineer Report/);
    assert.match(qaReport, /- Score: 93/);

    assert.match(securityReport, /# Security Engineer Report/);
    assert.match(securityReport, /- Score: 96/);

    assert.match(productOwnerReport, /# Product Owner Report/);
    assert.match(productOwnerReport, /- Score: 95/);
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});

test('preserves full multiline summaries in review reports', async () => {
  const outputDir = await mkdtemp(join(tmpdir(), 'adt-review-full-summary-test-'));

  try {
    const fullDeveloperSummary = [
      'Implemented the audit logging system.',
      '',
      'Added JSONL output per run.',
      'Threaded logging through agent calls.',
      'Kept reports untruncated.',
      '',
      'Confidence: 92',
    ].join('\n');
    const reviewerSummary = [
      'Review completed.',
      '',
      'Detailed findings were addressed.',
      'No remaining structural concerns.',
      'Long-form summary should remain intact in the report.',
    ].join('\n');

    const provider = new FakeProvider(async (prompt) => {
      if (prompt.includes('senior Software Developer')) {
        return fullDeveloperSummary;
      }
      if (prompt.includes('senior Code Reviewer')) {
        return jsonBlock({
          score: 91,
          summary: reviewerSummary,
          issues: [],
        });
      }
      if (prompt.includes('senior QA Engineer')) {
        return jsonBlock({ score: 93, summary: 'QA passed.', issues: [] });
      }
      if (prompt.includes('senior Security Engineer')) {
        return jsonBlock({ score: 94, summary: 'Security passed.', issues: [] });
      }
      if (prompt.includes('You are a Product Owner')) {
        return jsonBlock({ score: 95, approved: true, summary: 'Approved.', issues: [] });
      }
      if (prompt.includes('senior Documentation Writer')) {
        return '# Customer Guide\n\nUse it.';
      }
      throw new Error(`Unexpected prompt: ${prompt.slice(0, 80)}`);
    });

    const orchestrator = new Orchestrator(provider, createConfig(outputDir));
    const success = await runApprovedWorkflow(orchestrator, createPreparedContext(outputDir));

    assert.equal(success, true);

    const reviewsDir = join(outputDir, '.test-docs', 'reviews');
    const developerReport = await readFile(join(reviewsDir, 'iteration-1-developer.md'), 'utf-8');
    const reviewerReport = await readFile(join(reviewsDir, 'iteration-1-reviewer.md'), 'utf-8');

    assert.match(developerReport, /Implemented the audit logging system\.\n\nAdded JSONL output per run\./);
    assert.match(developerReport, /Threaded logging through agent calls\./);
    assert.match(developerReport, /Kept reports untruncated\./);
    assert.match(reviewerReport, /Review completed\.\n\nDetailed findings were addressed\./);
    assert.match(reviewerReport, /Long-form summary should remain intact in the report\./);
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});

test('accumulates iteration review reports across retries', async () => {
  const outputDir = await mkdtemp(join(tmpdir(), 'adt-review-reports-retry-test-'));
  let reviewCalls = 0;

  try {
    const provider = new FakeProvider(async (prompt) => {
      if (prompt.includes('senior Software Developer')) {
        return `Implemented changes for pass ${reviewCalls + 1}.`;
      }
      if (prompt.includes('senior Code Reviewer')) {
        reviewCalls++;
        if (reviewCalls === 1) {
          return jsonBlock({
            score: 70,
            summary: 'Below threshold.',
            issues: [{ severity: 'major', description: 'Missing retry fix.', suggestion: 'Address the evaluator feedback.' }],
          });
        }
        return jsonBlock({ score: 90, summary: 'Review passed.', issues: [] });
      }
      if (prompt.includes('senior QA Engineer')) {
        return jsonBlock({ score: 92, summary: 'QA passed.', issues: [] });
      }
      if (prompt.includes('senior Security Engineer')) {
        return jsonBlock({ score: 94, summary: 'Security passed.', issues: [] });
      }
      if (prompt.includes('You are a Product Owner')) {
        return jsonBlock({ score: 95, approved: true, summary: 'Approved.', issues: [] });
      }
      if (prompt.includes('senior Documentation Writer')) {
        return '# Customer Guide\n\nUse it.';
      }
      throw new Error(`Unexpected prompt: ${prompt.slice(0, 80)}`);
    });

    const orchestrator = new Orchestrator(provider, createConfig(outputDir, 2));
    const success = await runApprovedWorkflow(orchestrator, createPreparedContext(outputDir, 2));

    assert.equal(success, true);

    const reviewsDir = join(outputDir, '.test-docs', 'reviews');
    const iterationOneReviewer = await readFile(join(reviewsDir, 'iteration-1-reviewer.md'), 'utf-8');
    const iterationTwoReviewer = await readFile(join(reviewsDir, 'iteration-2-reviewer.md'), 'utf-8');
    const iterationOneDeveloper = await readFile(join(reviewsDir, 'iteration-1-developer.md'), 'utf-8');
    const iterationTwoDeveloper = await readFile(join(reviewsDir, 'iteration-2-developer.md'), 'utf-8');

    assert.match(iterationOneReviewer, /- Iteration: 1/);
    assert.match(iterationOneReviewer, /- Score: 70/);
    assert.match(iterationTwoReviewer, /- Iteration: 2/);
    assert.match(iterationTwoReviewer, /- Score: 90/);
    assert.match(iterationOneDeveloper, /- Iteration: 1/);
    assert.match(iterationTwoDeveloper, /- Iteration: 2/);
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});

test('includes suggested self-improve commands for issues across all severities', async () => {
  const outputDir = await mkdtemp(join(tmpdir(), 'adt-review-reports-prompts-test-'));
  let reviewCalls = 0;

  try {
    const provider = new FakeProvider(async (prompt) => {
      if (prompt.includes('senior Software Developer')) {
        return 'Implemented changes.\nConfidence: 89';
      }
      if (prompt.includes('senior Code Reviewer')) {
        reviewCalls++;
        if (reviewCalls > 1) {
          return jsonBlock({ score: 92, summary: 'Review passed.', issues: [] });
        }
        return jsonBlock({
          score: 88,
          summary: 'Review found issues.',
          issues: [
            { severity: 'critical', description: 'Handle null parser result.', file: 'src/agents/agent.ts', suggestion: 'Add a null guard before reading score.' },
            { severity: 'major', description: 'Retry flow lacks assertion coverage.', suggestion: 'Add a retry-path test.' },
            { severity: 'minor', description: 'Rename helper for clarity.' },
            { severity: 'info', description: 'Document the report artifact location.', file: 'README.md' },
          ],
        });
      }
      if (prompt.includes('senior QA Engineer')) {
        return jsonBlock({ score: 93, summary: 'QA passed.', issues: [] });
      }
      if (prompt.includes('senior Security Engineer')) {
        return jsonBlock({ score: 96, summary: 'Security passed.', issues: [] });
      }
      if (prompt.includes('You are a Product Owner')) {
        return jsonBlock({ score: 95, approved: true, summary: 'Approved.', issues: [] });
      }
      if (prompt.includes('senior Documentation Writer')) {
        return '# Customer Guide\n\nUse it.';
      }
      throw new Error(`Unexpected prompt: ${prompt.slice(0, 80)}`);
    });

    const orchestrator = new Orchestrator(provider, createConfig(outputDir, 2));
    const success = await runApprovedWorkflow(orchestrator, createPreparedContext(outputDir, 2));

    assert.equal(success, true);

    const reviewerReport = await readFile(
      join(outputDir, '.test-docs', 'reviews', 'iteration-1-reviewer.md'),
      'utf-8',
    );

    assert.match(
      reviewerReport,
      /Suggested self-improve command:\n  ```sh\n  npm run start -- self-improve 'Fix this critical issue in src\/agents\/agent\.ts: Handle null parser result\. Suggested fix: Add a null guard before reading score\.'\n  ```/,
    );
    assert.match(
      reviewerReport,
      /Suggested self-improve command:\n  ```sh\n  npm run start -- self-improve 'Fix this major issue: Retry flow lacks assertion coverage\. Suggested fix: Add a retry-path test\.'\n  ```/,
    );
    assert.match(
      reviewerReport,
      /Suggested self-improve command:\n  ```sh\n  npm run start -- self-improve 'Fix this minor issue: Rename helper for clarity\.'\n  ```/,
    );
    assert.match(
      reviewerReport,
      /Suggested self-improve command:\n  ```sh\n  npm run start -- self-improve 'Fix this info issue in README\.md: Document the report artifact location\.'\n  ```/,
    );
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});

test('shell-escapes metacharacters in suggested self-improve commands', async () => {
  const outputDir = await mkdtemp(join(tmpdir(), 'adt-review-reports-shell-escape-test-'));

  try {
    const provider = new FakeProvider(async (prompt) => {
      if (prompt.includes('senior Software Developer')) {
        return 'Implemented changes.\nConfidence: 90';
      }
      if (prompt.includes('senior Code Reviewer')) {
        return jsonBlock({
          score: 91,
          summary: 'Review found one issue.',
          issues: [
            {
              severity: 'major',
              description: "Escape $HOME, `whoami`, $(uname), and teammate's note safely.",
              file: 'src/orchestrator.ts',
              suggestion: "Wrap it's prompt without running `echo $HOME` or $(uname).",
            },
          ],
        });
      }
      if (prompt.includes('senior QA Engineer')) {
        return jsonBlock({ score: 93, summary: 'QA passed.', issues: [] });
      }
      if (prompt.includes('senior Security Engineer')) {
        return jsonBlock({ score: 96, summary: 'Security passed.', issues: [] });
      }
      if (prompt.includes('You are a Product Owner')) {
        return jsonBlock({ score: 95, approved: true, summary: 'Approved.', issues: [] });
      }
      if (prompt.includes('senior Documentation Writer')) {
        return '# Customer Guide\n\nUse it.';
      }
      throw new Error(`Unexpected prompt: ${prompt.slice(0, 80)}`);
    });

    const orchestrator = new Orchestrator(provider, createConfig(outputDir));
    const success = await runApprovedWorkflow(orchestrator, createPreparedContext(outputDir));

    assert.equal(success, true);

    const reviewerReport = await readFile(
      join(outputDir, '.test-docs', 'reviews', 'iteration-1-reviewer.md'),
      'utf-8',
    );
    const expectedCommand =
      "npm run start -- self-improve 'Fix this major issue in src/orchestrator.ts: Escape $HOME, `whoami`, $(uname), and teammate'\"'\"'s note safely. Suggested fix: Wrap it'\"'\"'s prompt without running `echo $HOME` or $(uname).'";

    assert.match(
      reviewerReport,
      /Suggested self-improve prompt: Fix this major issue in src\/orchestrator\.ts: Escape \$HOME, `whoami`, \$\(uname\), and teammate's note safely\. Suggested fix: Wrap it's prompt without running `echo \$HOME` or \$\(uname\)\./,
    );
    assert.equal(reviewerReport.includes(expectedCommand), true);
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});

test('sanitizes terminal control characters in human-facing review reports', async () => {
  const outputDir = await mkdtemp(join(tmpdir(), 'adt-review-sanitize-test-'));

  try {
    const provider = new FakeProvider(async (prompt) => {
      if (prompt.includes('senior Software Developer')) {
        return 'Implemented changes.\u001B[31m hidden\u001B[0m\nConfidence: 90';
      }
      if (prompt.includes('senior Code Reviewer')) {
        return jsonBlock({
          score: 91,
          summary: 'Review\u001B]52;c;Zm9v\u0007 passed.',
          issues: [
            {
              severity: 'major',
              description: 'Strip \u001B[2J terminal clears.',
              suggestion: 'Avoid \u0008 control chars.',
            },
          ],
        });
      }
      if (prompt.includes('senior QA Engineer')) {
        return jsonBlock({ score: 93, summary: 'QA passed.', issues: [] });
      }
      if (prompt.includes('senior Security Engineer')) {
        return jsonBlock({ score: 96, summary: 'Security passed.', issues: [] });
      }
      if (prompt.includes('You are a Product Owner')) {
        return jsonBlock({ score: 95, approved: true, summary: 'Approved.', issues: [] });
      }
      if (prompt.includes('senior Documentation Writer')) {
        return '# Customer Guide\n\nUse it.';
      }
      throw new Error(`Unexpected prompt: ${prompt.slice(0, 80)}`);
    });

    const orchestrator = new Orchestrator(provider, createConfig(outputDir));
    const success = await runApprovedWorkflow(orchestrator, createPreparedContext(outputDir));

    assert.equal(success, true);

    const reviewsDir = join(outputDir, '.test-docs', 'reviews');
    const developerReport = await readFile(join(reviewsDir, 'iteration-1-developer.md'), 'utf-8');
    const reviewerReport = await readFile(join(reviewsDir, 'iteration-1-reviewer.md'), 'utf-8');

    assert.equal(developerReport.includes('\u001B['), false);
    assert.equal(reviewerReport.includes('\u001B['), false);
    assert.equal(reviewerReport.includes('\u001B]52'), false);
    assert.equal(reviewerReport.includes('\u0008'), false);
    assert.match(reviewerReport, /Review passed\./);
    assert.match(reviewerReport, /Strip\s+terminal clears\./);
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});
