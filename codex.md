# Codex Instructions

## Project

Agent Development Team (ADT) — autonomous AI agent orchestration for software development.

## Setup

```bash
npm install && npm run build
```

## Source Structure

TypeScript ES modules in `src/`. Compiled output in `dist/`. Zero runtime dependencies.

Key files:
- `src/cli.ts` — CLI entry point (`adt start "..."` and `adt self-improve "..."`)
- `src/orchestrator.ts` — Pipeline: requirements → architecture → dev loop → PO review
- `src/agents/` — One class per agent role, each extending base Agent class
- `src/providers/` — Provider interface + Codex CLI implementation
- `src/types.ts` — ProjectContext, AgentResult, ProviderOptions, etc.

## Conventions

- TypeScript strict, ESNext target, NodeNext modules
- `node:` prefix for all Node.js built-in imports
- Named exports only, no default exports
- camelCase functions/variables, PascalCase types/classes, kebab-case filenames
- All AI interactions go through the Provider interface
- Agents are independent — no cross-agent dependencies
- Context flows through filesystem artifacts in workspace directories

## Adding an Agent

1. Create `src/agents/new-agent.ts` extending Agent base class
2. Define the agent's prompt template and result parsing
3. Register the agent in the orchestrator pipeline in `src/orchestrator.ts`

## Adding a Provider

1. Create `src/providers/new-provider.ts` implementing the Provider interface
2. Register it in `src/config.ts`
