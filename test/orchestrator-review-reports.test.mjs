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
    const developerReport = await readFile(join(reviewsDir, 'iteration-1-developer.md'), 'utf-8');
    const reviewerReport = await readFile(join(reviewsDir, 'iteration-1-reviewer.md'), 'utf-8');
    const qaReport = await readFile(join(reviewsDir, 'iteration-1-qa.md'), 'utf-8');
    const securityReport = await readFile(join(reviewsDir, 'iteration-1-security.md'), 'utf-8');

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

    assert.match(qaReport, /# QA Engineer Report/);
    assert.match(qaReport, /- Score: 93/);

    assert.match(securityReport, /# Security Engineer Report/);
    assert.match(securityReport, /- Score: 96/);
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
