import assert from 'node:assert/strict';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { CodexProvider } from '../dist/providers/codex.js';

function createPolicy() {
  return {
    allowedCommandPrefixes: ['npm run build', 'npm run test', 'tsc --noemit', 'node dist/cli.js --help'],
    blockedCommandPatterns: ['\\brm\\s+-rf\\b', '\\bcurl\\b'],
  };
}

async function createFakeCodexBinary(tempDir, scriptBody) {
  const scriptPath = join(tempDir, `fake-codex-${Date.now()}-${Math.random().toString(16).slice(2)}.mjs`);
  const script = `#!/usr/bin/env node\nimport { writeFileSync } from 'node:fs';\n${scriptBody}\n`;
  await writeFile(scriptPath, script, 'utf-8');
  await chmod(scriptPath, 0o755);
  return scriptPath;
}

test('high-trust mode enforces command policy on direct executed commands', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'adt-codex-test-'));

  try {
    const codexPath = await createFakeCodexBinary(tempDir, `
const args = process.argv.slice(2);
const outputIndex = args.indexOf('-o');
if (outputIndex >= 0 && args[outputIndex + 1]) {
  writeFileSync(args[outputIndex + 1], 'ok', 'utf-8');
}
console.log(JSON.stringify({ type: 'command_execution', command: 'tsc --noEmit' }));
process.exit(0);
`);

    const provider = new CodexProvider(undefined, {
      codexPath,
      defaultTimeoutMs: 5000,
      allowUntrustedCodexPath: true,
    });
    const output = await provider.execute('test', {
      trustMode: 'high',
      sandbox: 'workspace-write',
      commandPolicy: createPolicy(),
    });

    assert.equal(output, 'ok');
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('high-trust mode fails closed when executed command violates policy', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'adt-codex-test-'));

  try {
    const codexPath = await createFakeCodexBinary(tempDir, `
const args = process.argv.slice(2);
const outputIndex = args.indexOf('-o');
if (outputIndex >= 0 && args[outputIndex + 1]) {
  writeFileSync(args[outputIndex + 1], 'ok', 'utf-8');
}
console.log(JSON.stringify({ type: 'command_execution', command: 'rm -rf /tmp/data' }));
process.exit(0);
`);

    const provider = new CodexProvider(undefined, {
      codexPath,
      defaultTimeoutMs: 5000,
      allowUntrustedCodexPath: true,
    });

    await assert.rejects(
      () => provider.execute('test', {
        trustMode: 'high',
        sandbox: 'workspace-write',
        commandPolicy: createPolicy(),
      }),
      (error) => error && error.code === 'COMMAND_POLICY_VIOLATION',
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('high-trust mode rejects commands not in allowed prefixes', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'adt-codex-test-'));

  try {
    const codexPath = await createFakeCodexBinary(tempDir, `
const args = process.argv.slice(2);
const outputIndex = args.indexOf('-o');
if (outputIndex >= 0 && args[outputIndex + 1]) {
  writeFileSync(args[outputIndex + 1], 'ok', 'utf-8');
}
console.log(JSON.stringify({ type: 'command_execution', command: 'python setup.py install' }));
process.exit(0);
`);

    const provider = new CodexProvider(undefined, {
      codexPath,
      defaultTimeoutMs: 5000,
      allowUntrustedCodexPath: true,
    });

    await assert.rejects(
      () => provider.execute('test', {
        trustMode: 'high',
        sandbox: 'workspace-write',
        commandPolicy: createPolicy(),
      }),
      (error) => error && error.code === 'COMMAND_POLICY_VIOLATION',
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('high-trust mode fails closed when command telemetry is unavailable', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'adt-codex-test-'));

  try {
    const codexPath = await createFakeCodexBinary(tempDir, `
const args = process.argv.slice(2);
const outputIndex = args.indexOf('-o');
if (outputIndex >= 0 && args[outputIndex + 1]) {
  writeFileSync(args[outputIndex + 1], 'ok', 'utf-8');
}
console.log('non-json telemetry line');
process.exit(0);
`);

    const provider = new CodexProvider(undefined, {
      codexPath,
      defaultTimeoutMs: 5000,
      allowUntrustedCodexPath: true,
    });

    await assert.rejects(
      () => provider.execute('test', {
        trustMode: 'high',
        sandbox: 'workspace-write',
        commandPolicy: createPolicy(),
      }),
      (error) => error && error.code === 'COMMAND_POLICY_VIOLATION',
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('high-trust mode fails closed when telemetry has no commands and no explicit no-command event', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'adt-codex-test-'));

  try {
    const codexPath = await createFakeCodexBinary(tempDir, `
const args = process.argv.slice(2);
const outputIndex = args.indexOf('-o');
if (outputIndex >= 0 && args[outputIndex + 1]) {
  writeFileSync(args[outputIndex + 1], 'ok', 'utf-8');
}
console.log(JSON.stringify({ type: 'session_summary', status: 'completed' }));
process.exit(0);
`);

    const provider = new CodexProvider(undefined, {
      codexPath,
      defaultTimeoutMs: 5000,
      allowUntrustedCodexPath: true,
    });

    await assert.rejects(
      () => provider.execute('test', {
        trustMode: 'high',
        sandbox: 'workspace-write',
        commandPolicy: createPolicy(),
      }),
      (error) => error && error.code === 'COMMAND_POLICY_VIOLATION',
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('high-trust mode accepts explicit no-command execution telemetry', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'adt-codex-test-'));

  try {
    const codexPath = await createFakeCodexBinary(tempDir, `
const args = process.argv.slice(2);
const outputIndex = args.indexOf('-o');
if (outputIndex >= 0 && args[outputIndex + 1]) {
  writeFileSync(args[outputIndex + 1], 'ok', 'utf-8');
}
console.log(JSON.stringify({ type: 'session_summary', no_commands_executed: true }));
process.exit(0);
`);

    const provider = new CodexProvider(undefined, {
      codexPath,
      defaultTimeoutMs: 5000,
      allowUntrustedCodexPath: true,
    });
    const output = await provider.execute('test', {
      trustMode: 'high',
      sandbox: 'workspace-write',
      commandPolicy: createPolicy(),
    });

    assert.equal(output, 'ok');
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('secret-like heuristic strings are redacted instead of hard-failing', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'adt-codex-test-'));

  try {
    const codexPath = await createFakeCodexBinary(tempDir, `
const args = process.argv.slice(2);
const outputIndex = args.indexOf('-o');
if (outputIndex >= 0 && args[outputIndex + 1]) {
  writeFileSync(args[outputIndex + 1], 'example token sk-abcdefghijklmnopqrstuv123456', 'utf-8');
}
process.exit(0);
`);

    const provider = new CodexProvider(undefined, {
      codexPath,
      defaultTimeoutMs: 5000,
      allowUntrustedCodexPath: true,
    });
    const output = await provider.execute('test', { sandbox: 'read-only' });

    assert.match(output, /\[REDACTED_TOKEN\]/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('exact environment secret leaks still hard-fail', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'adt-codex-test-'));
  const originalKey = process.env.OPENAI_API_KEY;
  const leakedSecret = 'sk-real-secret-12345678901234567890';

  process.env.OPENAI_API_KEY = leakedSecret;

  try {
    const codexPath = await createFakeCodexBinary(tempDir, `
const args = process.argv.slice(2);
const outputIndex = args.indexOf('-o');
if (outputIndex >= 0 && args[outputIndex + 1]) {
  writeFileSync(args[outputIndex + 1], ${JSON.stringify(leakedSecret)}, 'utf-8');
}
process.exit(0);
`);

    const provider = new CodexProvider(undefined, {
      codexPath,
      defaultTimeoutMs: 5000,
      allowUntrustedCodexPath: true,
    });

    await assert.rejects(
      () => provider.execute('test', { sandbox: 'read-only' }),
      (error) => error && error.code === 'SECRET_LEAK_DETECTED',
    );
  } finally {
    if (originalKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalKey;
    }
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('OPENAI_API_KEY is not forwarded unless allowSecretEnv is true', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'adt-codex-test-'));
  const originalKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'sk-env-secret-12345678901234567890';

  try {
    const codexPath = await createFakeCodexBinary(tempDir, `
const args = process.argv.slice(2);
const outputIndex = args.indexOf('-o');
if (outputIndex >= 0 && args[outputIndex + 1]) {
  writeFileSync(args[outputIndex + 1], process.env.OPENAI_API_KEY ? 'present' : 'missing', 'utf-8');
}
process.exit(0);
`);

    const provider = new CodexProvider(undefined, {
      codexPath,
      defaultTimeoutMs: 5000,
      allowUntrustedCodexPath: true,
    });
    const missingByDefault = await provider.execute('test', { sandbox: 'read-only' });
    const presentWhenAllowed = await provider.execute('test', {
      sandbox: 'read-only',
      allowSecretEnv: true,
    });

    assert.equal(missingByDefault, 'missing');
    assert.equal(presentWhenAllowed, 'present');
  } finally {
    if (originalKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalKey;
    }
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('explicit codexPath requires trusted install dir unless insecure override is enabled', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'adt-codex-test-'));

  try {
    const codexPath = await createFakeCodexBinary(tempDir, 'process.exit(0);');
    await assert.rejects(
      () => new CodexProvider(undefined, { codexPath }).execute('test', { sandbox: 'read-only' }),
      (error) => error && error.code === 'BINARY_VALIDATION_FAILED',
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
