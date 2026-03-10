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

function createConfig(outputDir) {
  return {
    provider: 'fake',
    maxIterations: 3,
    scoreThreshold: 80,
    outputDir,
    providerTimeoutMs: 1000,
  };
}

function createPreparedContext(workspaceDir) {
  return {
    requirement: 'Improve ADT',
    prd: '# PRD',
    architecture: '# ARCHITECTURE',
    docsDir: join(workspaceDir, '.test-docs'),
    workspaceDir,
    iteration: 0,
    maxIterations: 3,
    feedback: [],
    developerTrustMode: 'safe',
  };
}

test('logs score trends, agent timings, and total runtime summary', async () => {
  const outputDir = await mkdtemp(join(tmpdir(), 'adt-orch-metrics-test-'));
  const reviewScores = [60, 75, 88];
  let reviewCall = 0;

  try {
    const provider = new FakeProvider(async (prompt) => {
      if (prompt.includes('senior Software Developer')) return 'Implemented changes.';
      if (prompt.includes('senior Code Reviewer')) {
        const score = reviewScores[reviewCall] ?? 88;
        reviewCall++;
        return jsonBlock({ score, summary: 'Review done.', issues: [] });
      }
      if (prompt.includes('senior QA Engineer')) {
        return jsonBlock({ score: 92, summary: 'QA done.', issues: [] });
      }
      if (prompt.includes('senior Security Engineer')) {
        return jsonBlock({ score: 94, summary: 'Security done.', issues: [] });
      }
      if (prompt.includes('You are a Product Owner')) {
        return jsonBlock({ score: 96, approved: true, summary: 'Approved.', issues: [] });
      }
      if (prompt.includes('senior Documentation Writer')) {
        return '# Customer Guide\n\nUse it.';
      }
      throw new Error(`Unexpected prompt: ${prompt.slice(0, 80)}`);
    });

    const orchestrator = new Orchestrator(provider, createConfig(outputDir));
    const context = createPreparedContext(outputDir);

    const logs = [];
    const originalConsoleLog = console.log;
    console.log = (...args) => {
      logs.push(args.join(' '));
    };

    try {
      const success = await orchestrator.runApprovedWorkflow(
        context,
        undefined,
        'Self-Improvement',
        Date.now() - 1200,
      );
      assert.equal(success, true);
    } finally {
      console.log = originalConsoleLog;
    }

    const output = logs.join('\n');
    assert.match(output, /Score trends -> Review: 60→75→88/);
    assert.match(output, /QA: 92→92→92/);
    assert.match(output, /Security: 94→94→94/);
    assert.match(output, /PO: 96/);
    assert.match(output, /Developer completed in /);
    assert.match(output, /Code Reviewer completed in /);
    assert.match(output, /QA Engineer completed in /);
    assert.match(output, /Security Engineer completed in /);
    assert.match(output, /Product Owner completed in /);
    assert.match(output, /Documentation Writer completed in /);
    assert.match(output, /Iterations: 3/);
    assert.match(output, /Total time: /);
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});
