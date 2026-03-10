import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
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
  return orchestrator.executeApprovedWorkflow(context, undefined, modeLabel);
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
