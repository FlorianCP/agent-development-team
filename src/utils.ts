import * as readline from 'node:readline';

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

export function log(icon: string, message: string): void {
  console.log(`${icon} ${message}`);
}

export function logStep(message: string): void {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  ${message}`);
  console.log(`${'─'.repeat(60)}`);
}

export function logDetail(message: string): void {
  console.log(`   ${message}`);
}
