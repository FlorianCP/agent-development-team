import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { DocumentationWriter } from '../dist/agents/documentation-writer.js';

class FakeProvider {
  name = 'fake';

  constructor(responseFn) {
    this.responseFn = responseFn;
  }

  async execute(prompt, options) {
    return this.responseFn(prompt, options);
  }
}

function createContext(workspaceDir) {
  return {
    requirement: 'Create docs',
    workspaceDir,
    docsDir: join(workspaceDir, 'docs'),
    iteration: 1,
    maxIterations: 1,
    feedback: [],
    prd: '# PRD',
    architecture: '# ARCH',
  };
}

test('documentation writer persists markdown output', async () => {
  const workspaceDir = await mkdtemp(join(tmpdir(), 'adt-doc-test-'));

  try {
    const provider = new FakeProvider(async () => '```markdown\n# Customer Guide\n\nUse it.\n```');
    const writer = new DocumentationWriter(provider);
    const result = await writer.execute(createContext(workspaceDir));

    assert.equal(result.success, true);
    const outputPath = join(workspaceDir, 'docs', 'CUSTOMER_GUIDE.md');
    const content = await readFile(outputPath, 'utf-8');
    assert.equal(content, '# Customer Guide\n\nUse it.');
  } finally {
    await rm(workspaceDir, { recursive: true, force: true });
  }
});

test('documentation writer returns failure when provider throws', async () => {
  const workspaceDir = await mkdtemp(join(tmpdir(), 'adt-doc-test-'));

  try {
    const provider = new FakeProvider(async () => {
      throw new Error('provider failed');
    });
    const writer = new DocumentationWriter(provider);
    const result = await writer.execute(createContext(workspaceDir));

    assert.equal(result.success, false);
    assert.match(result.output, /Failed to generate customer documentation/);
  } finally {
    await rm(workspaceDir, { recursive: true, force: true });
  }
});
