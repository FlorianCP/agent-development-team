# Agent Development Team (ADT)

An autonomous software development team powered by AI agents. Give it a requirement, and the team will clarify, design, build, review, test, secure, and deliver working software.

> **⚠️ Use at your own risk.** ADT operates autonomously — agents make tool calls, execute shell commands, read and write files, and run build/test scripts **without human approval**. Review the generated code before deploying it. Do not run ADT on systems containing sensitive data or in production environments without appropriate sandboxing.

## How It Works

```
Human provides requirement
        ↓
📋 Requirements Engineer — clarifies requirements, creates PRD
        ↓
🏗️  Architect — designs system architecture
        ↓
📄 Human approves PRD + Architecture
        ↓
🔄 Development Loop:
   👨‍💻 Developer → 🔍 Reviewer + 🧪 QA + 🔒 Security (in parallel)
   (loops until quality thresholds are met)
        ↓
👔 Product Owner — verifies against requirements
        ↓
📝 Documentation Writer — creates customer documentation
        ↓
✅ Delivered software
```

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) 20 or later
- [Codex CLI](https://github.com/openai/codex) installed and authenticated

### Install

```bash
git clone https://github.com/FlorianCP/agent-development-team.git
cd agent-development-team
npm install
npm run build
```

### Start a Project

```bash
# Local repository usage (recommended while developing this repo)
npm run start -- start "create a CLI snake game in Python"
npm run start -- start --prd path/to/requirements.md

# Alternative local invocation after build
node dist/cli.js --help

# Published/global install usage
npx adt --help
```

The team will:
1. Ask you clarifying questions about your requirement
2. Generate a PRD and architecture document
3. Ask for your approval before building
4. Develop, review, test, and secure the code in iterative loops
5. Have the Product Owner verify against requirements
6. Generate customer-facing documentation
7. Deliver the finished software to `./output/`

### Self-Improvement

ADT can work on its own codebase:

```bash
npm run start -- self-improve "add support for parallel agent execution"
```

For non-interactive runs, pass `--yes-self-improve` to explicitly allow repository edits.

Use `npm run start -- ...` (or `node dist/cli.js ...`) when running from this repository.
Use `adt ...` / `npx adt ...` only for published or globally installed versions.

## Configuration

### CLI Options

| Option | Default | Description |
|--------|---------|-------------|
| `--provider <name>` | `codex` | AI provider to use |
| `--model <model>` | (from config file) | Model for the provider (overrides config file) |
| `--max-iterations <n>` | `5` | Max development loop iterations |
| `--threshold <n>` | `75` | Minimum quality score (0-100) |
| `--provider-timeout-ms <n>` | `3600000` | Timeout per provider call in milliseconds |
| `--output-dir <dir>` | `./output` | Where to create projects |
| `--full-auto` | `false` | Opt into autonomous developer execution (`--full-auto`) |
| `--yes-self-improve` | `false` | Required for non-interactive self-improvement runs |
| `--no-git-checkpoints` | `false` | Disable git checkpoints during self-improvement iterations |
| `--allow-external-prd` | `false` | Allow `--prd` paths outside current workspace |

### Configuration File

ADT reads provider settings from `.adt.config.json` in the working directory. CLI flags override config file values.

```json
{
  "provider": {
    "codex": {
      "model": "gpt-5.3-codex",
      "reasoningEffort": "medium"
    }
  }
}
```

| Key | Values | Description |
|-----|--------|-------------|
| `provider.codex.model` | Any model name | Default model for the Codex CLI provider |
| `provider.codex.reasoningEffort` | `low`, `medium`, `high` | Reasoning effort passed to Codex CLI |

## Agent Roles

| Agent | Role |
|-------|------|
| **Requirements Engineer** | Clarifies requirements, creates PRD |
| **Architect** | Designs technology stack and system structure |
| **Developer** | Writes and iterates on code |
| **Reviewer** | Reviews code quality and correctness |
| **QA Engineer** | Tests functionality and finds defects |
| **Security Engineer** | Scans for vulnerabilities (OWASP Top 10) |
| **Product Owner** | Verifies product meets all requirements |
| **Documentation Writer** | Creates brief, high-quality customer documentation |

## Architecture

```
src/
  cli.ts              — CLI entry point
  orchestrator.ts     — Workflow: requirements → architecture → dev loop → PO → docs
  types.ts            — Shared type definitions
  utils.ts            — Helpers (user input, JSON parsing, logging)
  agents/
    agent.ts          — Base Agent class
    requirements-engineer.ts
    architect.ts
    developer.ts
    reviewer.ts
    qa.ts
    security.ts
    product-owner.ts
    documentation-writer.ts
  providers/
    provider.ts       — Provider interface
    codex.ts          — Codex CLI provider
```

### Key Design Decisions

- **Provider abstraction**: All AI interaction goes through a `Provider` interface. Currently ships with Codex CLI; other providers can be added by implementing the interface.
- **Agent independence**: Each agent is self-contained with its own prompt. Agents don't reference each other.
- **Orchestrator ownership**: Only the orchestrator sequences agents and manages data flow.
- **File-based context**: Agents share context through files in the workspace directory (PRD, architecture doc, code), not in-memory state.
- **Zero runtime dependencies**: Uses only Node.js built-in modules.

## Runtime Metrics

During each run, ADT logs:
- Per-agent execution time (`Developer completed in ...`)
- Iteration progress (`Development Iteration 2/5`)
- Score trends across iterations (`Review: 60→75→88`)
- Parallel evaluator wall-clock time
- End-of-run summary (`Iterations: ...`, `Total time: ...`)

Example console output:

```text
🔄 Development Iteration 3/5
   Developer completed in 8.2s.
   Started: Code Reviewer
   Started: QA Engineer
   Started: Security Engineer
   Code Reviewer completed in 2.3s.
   QA Engineer completed in 1.9s.
   Security Engineer completed in 2.5s.
   Parallel evaluator wall-clock time: 2.5s.
   Score trends -> Review: 60→75→88 | QA: 70→82→90 | Security: 64→78→86
📊 Iterations: 3
⏱️ Total time: 1m 12.4s
```

## Review Reports

After each development loop iteration, structured Markdown reports are saved for the Developer, Code Reviewer, QA Engineer, and Security Engineer.

- **Normal runs:** Reports are saved to `docs/reviews/` inside the project workspace.
- **Self-improvement runs:** Reports are saved inside the `.adt-self-improve/<run-id>/docs/reviews/` directory.

File naming: `iteration-N-developer.md`, `iteration-N-reviewer.md`, `iteration-N-qa.md`, `iteration-N-security.md`.

Each report contains the agent name, iteration number, score, a summary, and issues grouped by severity (critical, major, minor, info). Reports accumulate across iterations, providing a full audit trail of the development process.

### Adding a Provider

1. Create `src/providers/your-provider.ts` implementing the `Provider` interface
2. Add a case in `createProvider()` in `src/cli.ts`
3. The interface is simple: `execute(prompt: string, options?: ProviderOptions) => Promise<string>`

### Adding an Agent

1. Create `src/agents/your-agent.ts` extending the `Agent` base class
2. Implement the `execute(context: ProjectContext)` method
3. Add the agent to the orchestrator pipeline in `src/orchestrator.ts`

## Development

```bash
npm install          # Install dependencies
npm run build        # Compile TypeScript
npm run dev          # Watch mode compilation
npm run start -- --help  # Verify CLI works locally
```

## Vision

See [docs/vision/](docs/vision/) for the full vision, workflow design, agent specifications, and extensibility plan.

## License

MIT
