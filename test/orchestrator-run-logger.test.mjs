import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
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
    maxIterations: 1,
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
    maxIterations: 1,
    feedback: [],
    developerTrustMode: 'safe',
  };
}

test('writes structured jsonl run logs for each agent invocation', async () => {
  const outputDir = await mkdtemp(join(tmpdir(), 'adt-run-logger-test-'));

  try {
    const provider = new FakeProvider(async (prompt) => {
      if (prompt.includes('senior Software Developer')) {
        return 'Implemented changes.\nConfidence: 88';
      }
      if (prompt.includes('senior Code Reviewer')) {
        return jsonBlock({
          score: 91,
          summary: 'Review passed.',
          issues: [{ severity: 'minor', description: 'Small note.', suggestion: 'Tidy naming.' }],
        });
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

    const orchestrator = new Orchestrator(provider, createConfig(outputDir));
    const context = createPreparedContext(outputDir);

    const originalConsoleLog = console.log;
    console.log = () => {};
    try {
      const success = await orchestrator.runApprovedWorkflow(
        context,
        undefined,
        'Self-Improvement',
      );
      assert.equal(success, true);
    } finally {
      console.log = originalConsoleLog;
    }

    const logsDir = join(outputDir, 'logs');
    const logFiles = await readdir(logsDir);
    assert.equal(logFiles.length, 1);

    const content = await readFile(join(logsDir, logFiles[0]), 'utf-8');
    const entries = content
      .trim()
      .split('\n')
      .map(line => JSON.parse(line));

    assert.equal(entries.length, 6);
    assert.deepEqual(
      entries.map(entry => entry.agentName),
      ['Developer', 'Code Reviewer', 'QA Engineer', 'Security Engineer', 'Product Owner', 'Documentation Writer'],
    );

    for (const entry of entries) {
      assert.match(entry.timestamp, /^\d{4}-\d{2}-\d{2}T/);
      assert.match(entry.promptHash, /^[a-f0-9]{64}$/);
      assert.equal(typeof entry.output, 'string');
      assert.equal(typeof entry.durationMs, 'number');
    }

    const developerEntry = entries.find(entry => entry.agentName === 'Developer');
    assert.equal(developerEntry.score, 88);
    assert.equal(developerEntry.output, 'Implemented changes.\nConfidence: 88');

    const reviewerEntry = entries.find(entry => entry.agentName === 'Code Reviewer');
    assert.equal(reviewerEntry.score, 91);
    assert.deepEqual(reviewerEntry.issues, [
      {
        severity: 'minor',
        description: 'Small note.',
        suggestion: 'Tidy naming.',
      },
    ]);
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});
