import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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

test('fails run when max iterations reached with critical/below-threshold issues', async () => {
  const outputDir = await mkdtemp(join(tmpdir(), 'adt-orch-test-'));
  let poCalled = false;

  try {
    const provider = new FakeProvider(async (prompt) => {
      if (prompt.includes('senior Software Developer')) return 'Implemented changes.';
      if (prompt.includes('senior Code Reviewer')) {
        return jsonBlock({
          score: 92,
          summary: 'Critical issue present.',
          issues: [{ severity: 'critical', description: 'Unsafe behavior.' }],
        });
      }
      if (prompt.includes('senior QA Engineer')) {
        return jsonBlock({ score: 95, summary: 'QA passed.', issues: [] });
      }
      if (prompt.includes('senior Security Engineer')) {
        return jsonBlock({ score: 95, summary: 'Security passed.', issues: [] });
      }
      if (prompt.includes('You are a Product Owner')) {
        poCalled = true;
        return jsonBlock({ score: 100, approved: true, summary: 'Approved.' });
      }
      throw new Error(`Unexpected prompt: ${prompt.slice(0, 80)}`);
    });

    const orchestrator = new Orchestrator(provider, createConfig(outputDir));
    const success = await runApprovedWorkflow(orchestrator, createPreparedContext(outputDir));

    assert.equal(success, false);
    assert.equal(poCalled, false);
    const reportPath = join(outputDir, '.test-docs', 'ITERATION_REPORT.md');
    const report = await readFile(reportPath, 'utf-8');
    assert.match(report, /# Iteration Report/);
    assert.match(report, /Max iterations reached \(1\/1\)/);
    assert.match(report, /## Final Scores/);
    assert.match(report, /Code Reviewer: 92\/100/);
    assert.match(report, /QA Engineer: 95\/100/);
    assert.match(report, /Security Engineer: 95\/100/);
    assert.match(report, /Product Owner: N\/A/);
    assert.match(report, /## Score Trends/);
    assert.match(report, /Code Reviewer: 92/);
    assert.match(report, /QA Engineer: 95/);
    assert.match(report, /Security Engineer: 95/);
    assert.match(report, /### Critical/);
    assert.match(report, /\[Code Reviewer\] Unsafe behavior\./);
    assert.match(report, /## Recommendation/);
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});

test('fails run when documentation phase fails after PO approval', async () => {
  const outputDir = await mkdtemp(join(tmpdir(), 'adt-orch-test-'));

  try {
    const provider = new FakeProvider(async (prompt) => {
      if (prompt.includes('senior Software Developer')) return 'Implemented changes.';
      if (prompt.includes('senior Code Reviewer')) {
        return jsonBlock({ score: 95, summary: 'Review passed.', issues: [] });
      }
      if (prompt.includes('senior QA Engineer')) {
        return jsonBlock({ score: 95, summary: 'QA passed.', issues: [] });
      }
      if (prompt.includes('senior Security Engineer')) {
        return jsonBlock({ score: 95, summary: 'Security passed.', issues: [] });
      }
      if (prompt.includes('You are a Product Owner')) {
        return jsonBlock({ score: 95, approved: true, summary: 'PO approved.', issues: [] });
      }
      if (prompt.includes('senior Documentation Writer')) {
        throw new Error('Documentation generation failed.');
      }
      throw new Error(`Unexpected prompt: ${prompt.slice(0, 80)}`);
    });

    const orchestrator = new Orchestrator(provider, createConfig(outputDir));
    const success = await runApprovedWorkflow(orchestrator, createPreparedContext(outputDir));

    assert.equal(success, false);
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});

test('fails quality gate when evaluator output is malformed JSON', async () => {
  const outputDir = await mkdtemp(join(tmpdir(), 'adt-orch-test-'));
  let reviewerCalls = 0;
  let poCalled = false;

  try {
    const provider = new FakeProvider(async (prompt) => {
      if (prompt.includes('senior Software Developer')) return 'Implemented changes.';
      if (prompt.includes('senior Code Reviewer')) {
        reviewerCalls++;
        return 'Looks good overall.';
      }
      if (prompt.includes('senior QA Engineer')) {
        return jsonBlock({ score: 95, summary: 'QA passed.', issues: [] });
      }
      if (prompt.includes('senior Security Engineer')) {
        return jsonBlock({ score: 95, summary: 'Security passed.', issues: [] });
      }
      if (prompt.includes('You are a Product Owner')) {
        poCalled = true;
        return jsonBlock({ score: 95, approved: true, summary: 'PO approved.', issues: [] });
      }
      throw new Error(`Unexpected prompt: ${prompt.slice(0, 80)}`);
    });

    const orchestrator = new Orchestrator(provider, createConfig(outputDir));
    const success = await runApprovedWorkflow(orchestrator, createPreparedContext(outputDir));

    assert.equal(success, false);
    assert.equal(reviewerCalls, 2);
    assert.equal(poCalled, false);
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});

test('captures evaluator failures without cancelling parallel evaluator peers', async () => {
  const outputDir = await mkdtemp(join(tmpdir(), 'adt-orch-test-'));
  let qaCalled = false;
  let securityCalled = false;
  let poCalled = false;

  try {
    const provider = new FakeProvider(async (prompt) => {
      if (prompt.includes('senior Software Developer')) return 'Implemented changes.';
      if (prompt.includes('senior Code Reviewer')) {
        throw new Error('Reviewer crashed.');
      }
      if (prompt.includes('senior QA Engineer')) {
        qaCalled = true;
        return jsonBlock({ score: 95, summary: 'QA passed.', issues: [] });
      }
      if (prompt.includes('senior Security Engineer')) {
        securityCalled = true;
        return jsonBlock({ score: 95, summary: 'Security passed.', issues: [] });
      }
      if (prompt.includes('You are a Product Owner')) {
        poCalled = true;
        return jsonBlock({ score: 95, approved: true, summary: 'PO approved.', issues: [] });
      }
      throw new Error(`Unexpected prompt: ${prompt.slice(0, 80)}`);
    });

    const orchestrator = new Orchestrator(provider, createConfig(outputDir));
    const success = await runApprovedWorkflow(orchestrator, createPreparedContext(outputDir));

    assert.equal(success, false);
    assert.equal(qaCalled, true);
    assert.equal(securityCalled, true);
    assert.equal(poCalled, false);
    const reportPath = join(outputDir, '.test-docs', 'ITERATION_REPORT.md');
    const report = await readFile(reportPath, 'utf-8');
    assert.match(report, /Code Reviewer: 0\/100/);
    assert.match(report, /QA Engineer: 95\/100/);
    assert.match(report, /Security Engineer: 95\/100/);
    assert.match(report, /\[Code Reviewer\] Code Reviewer failed unexpectedly during evaluation\./);
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});

test('fails quality gate when evaluator score is out of range across retries', async () => {
  const outputDir = await mkdtemp(join(tmpdir(), 'adt-orch-test-'));
  let reviewerCalls = 0;
  let poCalled = false;

  try {
    const provider = new FakeProvider(async (prompt) => {
      if (prompt.includes('senior Software Developer')) return 'Implemented changes.';
      if (prompt.includes('senior Code Reviewer')) {
        reviewerCalls++;
        return jsonBlock({ score: 150, summary: 'Out-of-range score.', issues: [] });
      }
      if (prompt.includes('senior QA Engineer')) {
        return jsonBlock({ score: 95, summary: 'QA passed.', issues: [] });
      }
      if (prompt.includes('senior Security Engineer')) {
        return jsonBlock({ score: 95, summary: 'Security passed.', issues: [] });
      }
      if (prompt.includes('You are a Product Owner')) {
        poCalled = true;
        return jsonBlock({ score: 95, approved: true, summary: 'PO approved.', issues: [] });
      }
      throw new Error(`Unexpected prompt: ${prompt.slice(0, 80)}`);
    });

    const orchestrator = new Orchestrator(provider, createConfig(outputDir));
    const success = await runApprovedWorkflow(orchestrator, createPreparedContext(outputDir));

    assert.equal(success, false);
    assert.equal(reviewerCalls, 2);
    assert.equal(poCalled, false);
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});

test('halts iteration when developer requests human approval marker', async () => {
  const outputDir = await mkdtemp(join(tmpdir(), 'adt-orch-test-'));
  let reviewCalled = false;

  try {
    const provider = new FakeProvider(async (prompt) => {
      if (prompt.includes('senior Software Developer')) {
        return 'HUMAN_APPROVAL_REQUIRED: Need to run deployment command.';
      }
      if (prompt.includes('senior Code Reviewer')) {
        reviewCalled = true;
        return jsonBlock({ score: 95, summary: 'Review passed.', issues: [] });
      }
      throw new Error(`Unexpected prompt: ${prompt.slice(0, 80)}`);
    });

    const orchestrator = new Orchestrator(provider, createConfig(outputDir));
    const success = await runApprovedWorkflow(orchestrator, createPreparedContext(outputDir));

    assert.equal(success, false);
    assert.equal(reviewCalled, false);
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});

test('treats missing product-owner approved flag as invalid evaluation', async () => {
  const outputDir = await mkdtemp(join(tmpdir(), 'adt-orch-test-'));

  try {
    const provider = new FakeProvider(async (prompt) => {
      if (prompt.includes('senior Software Developer')) return 'Implemented changes.';
      if (prompt.includes('senior Code Reviewer')) {
        return jsonBlock({ score: 95, summary: 'Review passed.', issues: [] });
      }
      if (prompt.includes('senior QA Engineer')) {
        return jsonBlock({ score: 95, summary: 'QA passed.', issues: [] });
      }
      if (prompt.includes('senior Security Engineer')) {
        return jsonBlock({ score: 95, summary: 'Security passed.', issues: [] });
      }
      if (prompt.includes('You are a Product Owner')) {
        return jsonBlock({ score: 99, summary: 'Looks good but no explicit approval.', issues: [] });
      }
      throw new Error(`Unexpected prompt: ${prompt.slice(0, 80)}`);
    });

    const orchestrator = new Orchestrator(provider, createConfig(outputDir));
    const success = await runApprovedWorkflow(orchestrator, createPreparedContext(outputDir));

    assert.equal(success, false);
    const reportPath = join(outputDir, '.test-docs', 'ITERATION_REPORT.md');
    const report = await readFile(reportPath, 'utf-8');
    assert.match(report, /Product Owner: 0\/100/);
    assert.match(report, /### Critical/);
    assert.match(report, /\[Product Owner\] Product Owner produced invalid evaluation data after retries\./);
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});

test('shared development wrapper propagates documentation failure in development mode', async () => {
  const outputDir = await mkdtemp(join(tmpdir(), 'adt-orch-test-'));

  try {
    const provider = new FakeProvider(async (prompt) => {
      if (prompt.includes('senior Software Developer')) return 'Implemented changes.';
      if (prompt.includes('senior Code Reviewer')) {
        return jsonBlock({ score: 95, summary: 'Review passed.', issues: [] });
      }
      if (prompt.includes('senior QA Engineer')) {
        return jsonBlock({ score: 95, summary: 'QA passed.', issues: [] });
      }
      if (prompt.includes('senior Security Engineer')) {
        return jsonBlock({ score: 95, summary: 'Security passed.', issues: [] });
      }
      if (prompt.includes('You are a Product Owner')) {
        return jsonBlock({ score: 95, approved: true, summary: 'PO approved.', issues: [] });
      }
      if (prompt.includes('senior Documentation Writer')) {
        throw new Error('Documentation generation failed.');
      }
      throw new Error(`Unexpected prompt: ${prompt.slice(0, 80)}`);
    });

    const orchestrator = new Orchestrator(provider, createConfig(outputDir));
    const success = await runApprovedWorkflow(
      orchestrator,
      createPreparedContext(outputDir),
      'Development',
    );
    assert.equal(success, false);
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});

test('passes run when build verification succeeds without requiring human approval', async () => {
  const outputDir = await mkdtemp(join(tmpdir(), 'adt-orch-test-'));
  let docsCalled = false;

  try {
    await writeFile(
      join(outputDir, 'package.json'),
      JSON.stringify({
        name: 'verification-fail-fixture',
        version: '1.0.0',
        scripts: {
          build: 'node -e "process.exit(0)"',
        },
      }, null, 2),
      'utf-8',
    );

    const provider = new FakeProvider(async (prompt) => {
      if (prompt.includes('senior Software Developer')) return 'Implemented changes.';
      if (prompt.includes('senior Code Reviewer')) {
        return jsonBlock({ score: 95, summary: 'Review passed.', issues: [] });
      }
      if (prompt.includes('senior QA Engineer')) {
        return jsonBlock({ score: 95, summary: 'QA passed.', issues: [] });
      }
      if (prompt.includes('senior Security Engineer')) {
        return jsonBlock({ score: 95, summary: 'Security passed.', issues: [] });
      }
      if (prompt.includes('You are a Product Owner')) {
        return jsonBlock({ score: 95, approved: true, summary: 'PO approved.', issues: [] });
      }
      if (prompt.includes('senior Documentation Writer')) {
        docsCalled = true;
        return '# Customer Guide';
      }
      throw new Error(`Unexpected prompt: ${prompt.slice(0, 80)}`);
    });

    const orchestrator = new Orchestrator(provider, createConfig(outputDir));
    const success = await runApprovedWorkflow(orchestrator, createPreparedContext(outputDir), 'Development');

    assert.equal(success, true);
    assert.equal(docsCalled, true);
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});

test('passes run when post-approval build and smoke checks succeed', async () => {
  const outputDir = await mkdtemp(join(tmpdir(), 'adt-orch-test-'));

  try {
    await writeFile(
      join(outputDir, 'package.json'),
      JSON.stringify({
        name: 'verification-pass-fixture',
        version: '1.0.0',
        bin: {
          adt: './dist/cli.js',
        },
      }, null, 2),
      'utf-8',
    );

    await mkdir(join(outputDir, 'dist'), { recursive: true });
    await writeFile(
      join(outputDir, 'dist', 'cli.js'),
      '#!/usr/bin/env node\nprocess.exit(process.argv.includes(\"--help\") ? 0 : 1);\n',
      'utf-8',
    );

    const provider = new FakeProvider(async (prompt) => {
      if (prompt.includes('senior Software Developer')) return 'Implemented changes.';
      if (prompt.includes('senior Code Reviewer')) {
        return jsonBlock({ score: 95, summary: 'Review passed.', issues: [] });
      }
      if (prompt.includes('senior QA Engineer')) {
        return jsonBlock({ score: 95, summary: 'QA passed.', issues: [] });
      }
      if (prompt.includes('senior Security Engineer')) {
        return jsonBlock({ score: 95, summary: 'Security passed.', issues: [] });
      }
      if (prompt.includes('You are a Product Owner')) {
        return jsonBlock({ score: 95, approved: true, summary: 'PO approved.', issues: [] });
      }
      if (prompt.includes('senior Documentation Writer')) {
        return '# Customer Guide';
      }
      throw new Error(`Unexpected prompt: ${prompt.slice(0, 80)}`);
    });

    const orchestrator = new Orchestrator(provider, createConfig(outputDir));
    const success = await runApprovedWorkflow(orchestrator, createPreparedContext(outputDir), 'Development');

    assert.equal(success, true);
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});

test('ignores package bin paths that escape workspace during CLI smoke resolution', async () => {
  const outputDir = await mkdtemp(join(tmpdir(), 'adt-orch-test-'));

  try {
    await writeFile(
      join(outputDir, 'package.json'),
      JSON.stringify({
        name: 'verification-traversal-fixture',
        version: '1.0.0',
        bin: {
          adt: '../../tmp/evil.js',
        },
      }, null, 2),
      'utf-8',
    );

    const provider = new FakeProvider(async (prompt) => {
      if (prompt.includes('senior Software Developer')) return 'Implemented changes.';
      if (prompt.includes('senior Code Reviewer')) {
        return jsonBlock({ score: 95, summary: 'Review passed.', issues: [] });
      }
      if (prompt.includes('senior QA Engineer')) {
        return jsonBlock({ score: 95, summary: 'QA passed.', issues: [] });
      }
      if (prompt.includes('senior Security Engineer')) {
        return jsonBlock({ score: 95, summary: 'Security passed.', issues: [] });
      }
      if (prompt.includes('You are a Product Owner')) {
        return jsonBlock({ score: 95, approved: true, summary: 'PO approved.', issues: [] });
      }
      if (prompt.includes('senior Documentation Writer')) {
        return '# Customer Guide';
      }
      throw new Error(`Unexpected prompt: ${prompt.slice(0, 80)}`);
    });

    const orchestrator = new Orchestrator(provider, createConfig(outputDir));
    const success = await runApprovedWorkflow(orchestrator, createPreparedContext(outputDir), 'Development');

    assert.equal(success, true);
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});
