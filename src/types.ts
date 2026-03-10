export interface ProviderOptions {
  workingDir?: string;
  model?: string;
  sandbox?: 'read-only' | 'workspace-write';
  timeoutMs?: number;
  trustMode?: 'safe' | 'high';
  commandPolicy?: CommandPolicy;
  allowSecretEnv?: boolean;
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
  evaluationValid?: boolean;
}

export interface Issue {
  severity: 'critical' | 'major' | 'minor' | 'info';
  description: string;
  file?: string;
  suggestion?: string;
}

export interface CommandPolicy {
  allowedCommandPrefixes: string[];
  blockedCommandPatterns: string[];
}

export interface ProjectContext {
  requirement: string;
  prd?: string;
  architecture?: string;
  docsDir: string;
  workspaceDir: string;
  iteration: number;
  maxIterations: number;
  feedback: string[];
  developerTrustMode?: ProviderOptions['trustMode'];
  developerCommandPolicy?: CommandPolicy;
  metrics?: RunMetrics;
}

export interface ADTConfig {
  provider: string;
  model?: string;
  maxIterations: number;
  scoreThreshold: number;
  outputDir: string;
  providerTimeoutMs: number;
  allowFullAuto: boolean;
  yesSelfImprove: boolean;
}

export interface RunMetrics {
  scoreHistory: ScoreHistory;
}

export interface ScoreHistory {
  review: number[];
  qa: number[];
  security: number[];
  productOwner: number[];
}

export const DEFAULT_CONFIG: ADTConfig = {
  provider: 'codex',
  maxIterations: 5,
  scoreThreshold: 80,
  outputDir: './output',
  providerTimeoutMs: 3600000,
  allowFullAuto: false,
  yesSelfImprove: false,
};
