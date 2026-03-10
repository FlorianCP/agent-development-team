import assert from 'node:assert/strict';
import test from 'node:test';
import { ProductOwner } from '../dist/agents/product-owner.js';

class FakeProvider {
  name = 'fake';

  constructor(response) {
    this.response = response;
  }

  async execute() {
    return this.response;
  }
}

function createContext() {
  return {
    requirement: 'Build a secure CLI.',
    prd: '# PRD',
    workspaceDir: '.',
    docsDir: './docs',
    iteration: 0,
    maxIterations: 1,
    feedback: [],
  };
}

test('execute preserves invalid evaluation result even when approved is true', async () => {
  const provider = new FakeProvider(
    '```json\n{"approved":true,"summary":"Looks good."}\n```',
  );
  const agent = new ProductOwner(provider);

  const result = await agent.execute(createContext());
  assert.equal(result.evaluationValid, false);
  assert.equal(result.success, false);
});
