export interface ProviderOptions {
  workingDir?: string;
  model?: string;
  sandbox?: 'read-only' | 'workspace-write';
}

export interface Provider {
  name: string;
  execute(prompt: string, options?: ProviderOptions): Promise<string>;
}

export interface AgentResult {
  success: boolean;
  output: string;
  score?: number;
  issues?: Issue[];
}

export interface Issue {
  severity: 'critical' | 'major' | 'minor' | 'info';
  description: string;
  file?: string;
  suggestion?: string;
}

export interface ProjectContext {
  requirement: string;
  prd?: string;
  architecture?: string;
  workspaceDir: string;
  iteration: number;
  maxIterations: number;
  feedback: string[];
}

export interface ADTConfig {
  provider: string;
  model?: string;
  maxIterations: number;
  scoreThreshold: number;
  outputDir: string;
}

export const DEFAULT_CONFIG: ADTConfig = {
  provider: 'codex',
  maxIterations: 5,
  scoreThreshold: 80,
  outputDir: './output',
};
