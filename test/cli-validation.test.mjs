import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(testDir, '..');
const cliPath = resolve(projectRoot, 'dist/cli.js');

function runCli(args) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd: projectRoot,
    encoding: 'utf-8',
  });
}

test('rejects non-numeric --max-iterations', () => {
  const result = runCli(['self-improve', 'test improvement', '--max-iterations', 'foo']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Invalid value for --max-iterations/);
});

test('rejects out-of-range --threshold', () => {
  const result = runCli(['self-improve', 'test improvement', '--threshold', '200']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Invalid value for --threshold/);
});

test('rejects non-positive --provider-timeout-ms', () => {
  const result = runCli(['self-improve', 'test improvement', '--provider-timeout-ms', '0']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Invalid value for --provider-timeout-ms/);
});

test('shows clear error for missing --prd file', () => {
  const missingPath = resolve(projectRoot, 'does-not-exist-prd.md');
  const result = runCli(['start', '--prd', missingPath]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /PRD file not found/i);
});

test('rejects external --prd file unless explicitly allowed', async () => {
  const externalDir = await mkdtemp(join(tmpdir(), 'adt-cli-prd-'));
  const externalPrdPath = join(externalDir, 'prd.md');

  try {
    await writeFile(externalPrdPath, '# External PRD', 'utf-8');
    const result = runCli(['start', '--prd', externalPrdPath]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /must be inside the current workspace/i);
    assert.match(result.stderr, /--allow-external-prd/);
  } finally {
    await rm(externalDir, { recursive: true, force: true });
  }
});
