# CLAUDE.md

## Project

Agent Development Team (ADT) — an autonomous software development system. Multiple AI agents collaborate through an orchestrated pipeline to build software from requirements to reviewed, tested, and approved code.

## Quick Reference

```bash
npm install          # Install dependencies
npm run build        # Compile TypeScript
npx adt --help       # Show CLI usage
npx adt start "..."  # Start a new project
```

## Source Layout

- `src/cli.ts` — CLI entry point, argument parsing
- `src/orchestrator.ts` — Main workflow: requirements → architecture → dev loop → PO review
- `src/agents/agent.ts` — Base Agent class
- `src/agents/*.ts` — One file per agent role (requirements-engineer, architect, developer, reviewer, qa, security, product-owner)
- `src/providers/provider.ts` — Provider interface
- `src/providers/codex.ts` — Codex CLI provider implementation
- `src/types.ts` — Shared types
- `src/utils.ts` — Helpers (process spawning, user input, JSON extraction)

## Conventions

- TypeScript strict mode, ES modules, `node:` prefix for builtins
- Zero runtime dependencies — only Node.js built-ins
- Named exports only
- camelCase for functions/variables, PascalCase for types/classes, kebab-case for files
- Provider interface is the only way to interact with AI models
- Agents are self-contained — no cross-agent imports
- Orchestrator is the only place that sequences agents

## Architecture Decisions

- Agents share context via filesystem artifacts in the workspace directory (PRD, architecture doc, code files), not in-memory state
- The codex provider uses `codex exec` for non-interactive agent execution
- Each agent constructs a prompt from its template + context and sends it through the provider
- The development loop iterates until quality thresholds are met or max iterations reached
- In self-improve mode, git checkpoints are created before each iteration (disable with `--no-git-checkpoints`)

## Important Patterns

- Provider.execute() takes a prompt and options, returns the model's text response
- Agent.execute() takes ProjectContext, returns AgentResult with success, output, score, and issues
- The orchestrator passes feedback from review/QA/security agents back to the developer agent in subsequent iterations
- The CLI supports `start` (new project) and `self-improve` (work on ADT's own codebase)
