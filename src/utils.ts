import * as readline from 'node:readline';
import * as path from 'node:path';

interface PathApi {
  relative(from: string, to: string): string;
  isAbsolute(path: string): boolean;
  parse(path: string): { root: string };
  sep: string;
}

export function createReadlineInterface(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

export async function askQuestion(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

export async function askYesNo(rl: readline.Interface, question: string): Promise<boolean> {
  const answer = await askQuestion(rl, `${question} (Y/n): `);
  return answer.toLowerCase() !== 'n';
}

export function extractJsonBlock(text: string): string | null {
  const jsonBlockMatch = text.match(/```json\s*\n([\s\S]*?)\n\s*```/);
  if (jsonBlockMatch) {
    return jsonBlockMatch[1].trim();
  }

  const braceMatch = text.match(/\{[\s\S]*\}/);
  if (braceMatch) {
    try {
      JSON.parse(braceMatch[0]);
      return braceMatch[0];
    } catch {
      // Not valid JSON
    }
  }

  return null;
}

export function parseAgentJson(text: string): Record<string, unknown> | null {
  const jsonStr = extractJsonBlock(text);
  if (!jsonStr) return null;

  try {
    return JSON.parse(jsonStr) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function toUntrustedDataBlock(content: string): string {
  const escaped = content
    .replaceAll('<<<BEGIN_UNTRUSTED_DATA>>>', '<BEGIN_UNTRUSTED_DATA_ESCAPED>')
    .replaceAll('<<<END_UNTRUSTED_DATA>>>', '<END_UNTRUSTED_DATA_ESCAPED>')
    .replaceAll('```', '` ` `');
  return `<<<BEGIN_UNTRUSTED_DATA>>>\n${escaped}\n<<<END_UNTRUSTED_DATA>>>`;
}

export function stripTerminalControlChars(value: string): string {
  return value
    .replace(/\u001B\][^\u0007\u001B]*(?:\u0007|\u001B\\)/g, '')
    .replace(/\u001B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '')
    .replace(/[\u0000-\u0008\u000B-\u000D\u000E-\u001F\u007F-\u009F]/g, '');
}

export function sanitizeForTerminal(value: string): string {
  return stripTerminalControlChars(value);
}

export function isPathInside(baseDir: string, targetPath: string, pathApi: PathApi = path): boolean {
  const baseRoot = normalizePathRoot(baseDir, pathApi);
  const targetRoot = normalizePathRoot(targetPath, pathApi);

  if (baseRoot !== targetRoot) {
    return false;
  }

  const rel = pathApi.relative(baseDir, targetPath);
  if (rel === '') {
    return true;
  }

  if (pathApi.isAbsolute(rel)) {
    return false;
  }

  return rel !== '..' && !rel.startsWith(`..${pathApi.sep}`);
}

function normalizePathRoot(value: string, pathApi: PathApi): string {
  const root = pathApi.parse(value).root;
  return pathApi.sep === '\\' ? root.toLowerCase() : root;
}

export function log(icon: string, message: string): void {
  console.log(`${icon} ${sanitizeForTerminal(message)}`);
}

export function logStep(message: string): void {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  ${sanitizeForTerminal(message)}`);
  console.log(`${'─'.repeat(60)}`);
}

export function logDetail(message: string): void {
  console.log(`   ${sanitizeForTerminal(message)}`);
}
