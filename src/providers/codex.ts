import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { writeFile, readFile, unlink, mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import type { Provider, ProviderOptions } from './provider.js';

export class CodexProvider implements Provider {
  name = 'codex';

  private model?: string;

  constructor(model?: string) {
    this.model = model;
  }

  async execute(prompt: string, options?: ProviderOptions): Promise<string> {
    const tmpDir = await mkdtemp(join(tmpdir(), 'adt-'));
    const outputFile = join(tmpDir, `output-${randomBytes(4).toString('hex')}.md`);
    const promptFile = join(tmpDir, `prompt-${randomBytes(4).toString('hex')}.md`);

    await writeFile(promptFile, prompt, 'utf-8');

    const args = ['exec'];

    const sandbox = options?.sandbox ?? 'workspace-write';
    args.push('-s', sandbox);
    args.push('-a', 'never');

    if (options?.workingDir) {
      args.push('-C', options.workingDir);
    }

    const model = options?.model ?? this.model;
    if (model) {
      args.push('-m', model);
    }

    args.push('-o', outputFile);
    args.push('--ephemeral');

    const output = await this.spawnCodex(args, promptFile);

    let result: string;
    try {
      result = await readFile(outputFile, 'utf-8');
    } catch {
      // If no output file was created, use stdout
      result = output;
    }

    // Cleanup temp files
    await unlink(promptFile).catch(() => {});
    await unlink(outputFile).catch(() => {});

    return result;
  }

  private spawnCodex(args: string[], promptFile: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn('codex', args, {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      // Pipe the prompt file content to stdin
      const readStream = createReadStream(promptFile);
      readStream.pipe(child.stdin);

      child.on('close', (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(
            `codex exec exited with code ${code}\nstderr: ${stderr}\nstdout: ${stdout}`
          ));
        }
      });

      child.on('error', (err) => {
        reject(new Error(`Failed to spawn codex: ${err.message}`));
      });
    });
  }
}
