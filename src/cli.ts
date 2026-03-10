#!/usr/bin/env node

import { parseArgs } from 'node:util';
import { readFile } from 'node:fs/promises';
import { CodexProvider } from './providers/codex.js';
import { Orchestrator } from './orchestrator.js';
import type { ADTConfig } from './types.js';
import { DEFAULT_CONFIG } from './types.js';

const HELP = `
Agent Development Team (ADT) v0.1.0
Autonomous AI agent team for software development.

Usage:
  adt start <requirement>        Start a new project from a requirement
  adt start --prd <file>         Start from an existing PRD file
  adt self-improve <requirement> Improve the ADT codebase itself

Options:
  --provider <name>    AI provider to use (default: codex)
  --model <model>      Model to use with the provider
  --max-iterations <n> Max development iterations (default: 5)
  --threshold <n>      Minimum quality score 0-100 (default: 80)
  --output-dir <dir>   Output directory (default: ./output)
  --help, -h           Show this help message
  --version, -v        Show version

Examples:
  adt start "create a CLI snake game in Python"
  adt start --prd requirements.md
  adt self-improve "add support for parallel agent execution"
`;

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      help: { type: 'boolean', short: 'h', default: false },
      version: { type: 'boolean', short: 'v', default: false },
      provider: { type: 'string', default: 'codex' },
      model: { type: 'string' },
      'max-iterations': { type: 'string', default: '5' },
      threshold: { type: 'string', default: '80' },
      'output-dir': { type: 'string', default: './output' },
      prd: { type: 'string' },
    },
  });

  if (values.help) {
    console.log(HELP);
    process.exit(0);
  }

  if (values.version) {
    console.log('0.1.0');
    process.exit(0);
  }

  const command = positionals[0];

  if (!command) {
    console.log(HELP);
    process.exit(1);
  }

  const config: ADTConfig = {
    ...DEFAULT_CONFIG,
    provider: values.provider ?? DEFAULT_CONFIG.provider,
    model: values.model,
    maxIterations: parseInt(values['max-iterations'] ?? '5', 10),
    scoreThreshold: parseInt(values.threshold ?? '80', 10),
    outputDir: values['output-dir'] ?? DEFAULT_CONFIG.outputDir,
  };

  const provider = createProvider(config);
  const orchestrator = new Orchestrator(provider, config);

  switch (command) {
    case 'start': {
      let requirement: string;

      if (values.prd) {
        requirement = await readFile(values.prd, 'utf-8');
      } else {
        requirement = positionals.slice(1).join(' ');
      }

      if (!requirement) {
        console.error('Error: Please provide a requirement or --prd file.\n');
        console.log('Usage: adt start "your requirement here"');
        console.log('       adt start --prd path/to/prd.md');
        process.exit(1);
      }

      await orchestrator.start(requirement);
      break;
    }

    case 'self-improve': {
      const requirement = positionals.slice(1).join(' ');

      if (!requirement) {
        console.error('Error: Please describe the improvement.\n');
        console.log('Usage: adt self-improve "add feature X"');
        process.exit(1);
      }

      await orchestrator.selfImprove(requirement);
      break;
    }

    default:
      console.error(`Unknown command: ${command}\n`);
      console.log(HELP);
      process.exit(1);
  }
}

function createProvider(config: ADTConfig) {
  switch (config.provider) {
    case 'codex':
      return new CodexProvider(config.model);
    default:
      console.error(`Unknown provider: ${config.provider}`);
      console.error('Available providers: codex');
      process.exit(1);
  }
}

main().catch((err) => {
  console.error('\n❌ Fatal error:', err.message);
  process.exit(1);
});
