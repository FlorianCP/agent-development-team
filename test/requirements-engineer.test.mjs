import assert from 'node:assert/strict';
import test from 'node:test';
import { RequirementsEngineer } from '../dist/agents/requirements-engineer.js';

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
    requirement: 'Build a CLI tool.',
    workspaceDir: '.',
    docsDir: './docs',
    iteration: 0,
    maxIterations: 1,
    feedback: [],
  };
}

test('generateQuestions returns parsed string array when JSON schema is valid', async () => {
  const provider = new FakeProvider(
    '```json\n{"questions":["What platform?","Any auth requirements?"]}\n```',
  );
  const agent = new RequirementsEngineer(provider);

  const questions = await agent.generateQuestions(createContext());
  assert.deepEqual(questions, ['What platform?', 'Any auth requirements?']);
});

test('generateQuestions ignores malformed questions arrays and falls back safely', async () => {
  const provider = new FakeProvider(
    '```json\n{"questions":["Valid question", 42, {"oops":true}]}\n```',
  );
  const agent = new RequirementsEngineer(provider);

  const questions = await agent.generateQuestions(createContext());
  assert.deepEqual(questions, [
    'What is the primary use case for this software?',
    'Are there any specific technology preferences or constraints?',
    'What is the target platform (web, desktop, mobile, CLI)?',
  ]);
});
