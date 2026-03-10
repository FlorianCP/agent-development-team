#!/usr/bin/env node

import { parseArgs } from 'node:util';
import { readFile, realpath } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
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
  --provider-timeout-ms <n> Timeout per provider call in milliseconds (default: 600000)
  --output-dir <dir>   Output directory (default: ./output)
  --allow-external-prd Allow --prd files outside the current workspace
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
      'provider-timeout-ms': { type: 'string', default: String(DEFAULT_CONFIG.providerTimeoutMs) },
      'output-dir': { type: 'string', default: './output' },
      'allow-external-prd': { type: 'boolean', default: false },
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

  const maxIterations = parseIntegerOption('max-iterations', values['max-iterations'] ?? '5', 1);
  const threshold = parseNumberOption('threshold', values.threshold ?? '80', 0, 100);
  const providerTimeoutMs = parseIntegerOption(
    'provider-timeout-ms',
    values['provider-timeout-ms'] ?? String(DEFAULT_CONFIG.providerTimeoutMs),
    1,
  );

  const config: ADTConfig = {
    ...DEFAULT_CONFIG,
    provider: values.provider ?? DEFAULT_CONFIG.provider,
    model: values.model,
    maxIterations,
    scoreThreshold: threshold,
    outputDir: values['output-dir'] ?? DEFAULT_CONFIG.outputDir,
    providerTimeoutMs,
  };

  const provider = createProvider(config);
  const orchestrator = new Orchestrator(provider, config);

  switch (command) {
    case 'start': {
      let requirement: string;

      if (values.prd) {
        requirement = await readPrdFile(values.prd, values['allow-external-prd'] ?? false);
      } else {
        requirement = positionals.slice(1).join(' ');
      }

      if (!requirement) {
        console.error('Error: Please provide a requirement or --prd file.\n');
        console.log('Usage: adt start "your requirement here"');
        console.log('       adt start --prd path/to/prd.md');
        process.exit(1);
      }

      const success = await orchestrator.start(requirement);
      process.exit(success ? 0 : 1);
      break;
    }

    case 'self-improve': {
      const requirement = positionals.slice(1).join(' ');

      if (!requirement) {
        console.error('Error: Please describe the improvement.\n');
        console.log('Usage: adt self-improve "add feature X"');
        process.exit(1);
      }

      const success = await orchestrator.selfImprove(requirement);
      process.exit(success ? 0 : 1);
      break;
    }

    default:
      console.error(`Unknown command: ${command}\n`);
      console.log(HELP);
      process.exit(1);
  }
}

class CliInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CliInputError';
  }
}

async function readPrdFile(inputPath: string, allowExternalPrd: boolean): Promise<string> {
  const cwd = await resolveRealpath(process.cwd());
  const requestedPath = resolve(inputPath);
  const canonicalPath = await resolveRealpath(requestedPath).catch((error) => {
    if (isNodeErrno(error, 'ENOENT')) {
      throw new CliInputError(`Error: PRD file not found: ${requestedPath}`);
    }
    if (isNodeErrno(error, 'EACCES') || isNodeErrno(error, 'EPERM')) {
      throw new CliInputError(`Error: PRD file is not readable: ${requestedPath}`);
    }
    throw error;
  });

  if (!allowExternalPrd && !isWithinDirectory(cwd, canonicalPath)) {
    throw new CliInputError(
      `Error: PRD file must be inside the current workspace (${cwd}). Use --allow-external-prd to override.`,
    );
  }

  try {
    return await readFile(canonicalPath, 'utf-8');
  } catch (error) {
    if (isNodeErrno(error, 'ENOENT')) {
      throw new CliInputError(`Error: PRD file not found: ${canonicalPath}`);
    }
    if (isNodeErrno(error, 'EACCES') || isNodeErrno(error, 'EPERM')) {
      throw new CliInputError(`Error: PRD file is not readable: ${canonicalPath}`);
    }
    throw error;
  }
}

async function resolveRealpath(path: string): Promise<string> {
  return realpath(path);
}

function isWithinDirectory(baseDir: string, targetPath: string): boolean {
  const rel = relative(baseDir, targetPath);
  return rel === '' || (!rel.startsWith('..') && !rel.startsWith('../') && rel !== '..');
}

function isNodeErrno(error: unknown, code: string): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === code);
}

function createProvider(config: ADTConfig) {
  switch (config.provider) {
    case 'codex':
      return new CodexProvider(config.model, { defaultTimeoutMs: config.providerTimeoutMs });
    default:
      console.error(`Unknown provider: ${config.provider}`);
      console.error('Available providers: codex');
      process.exit(1);
  }
}

function parseIntegerOption(name: string, rawValue: string, min: number): number {
  const value = Number(rawValue);
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < min) {
    console.error(
      `Error: Invalid value for --${name}: "${rawValue}". Expected an integer >= ${min}.`,
    );
    process.exit(1);
  }

  return value;
}

function parseNumberOption(name: string, rawValue: string, min: number, max: number): number {
  const value = Number(rawValue);
  if (!Number.isFinite(value) || value < min || value > max) {
    console.error(
      `Error: Invalid value for --${name}: "${rawValue}". Expected a number between ${min} and ${max}.`,
    );
    process.exit(1);
  }

  return value;
}

main().catch((err) => {
  if (err instanceof CliInputError) {
    console.error(err.message);
    process.exit(1);
  }
  console.error('\n❌ Fatal error:', err.message);
  process.exit(1);
});
