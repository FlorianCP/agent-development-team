# Agent Development Team (ADT) — Copilot Instructions

## Project Overview

This is the Agent Development Team (ADT) — an autonomous software development system where multiple specialized AI agents collaborate to build software. The system orchestrates agents through a pipeline: requirements → architecture → development → review → QA → security → product owner approval.

## Codebase Structure

- `src/` — TypeScript source code
  - `src/cli.ts` — CLI entry point
  - `src/orchestrator.ts` — Workflow orchestrator
  - `src/agents/` — Agent implementations (one file per agent role)
  - `src/providers/` — AI provider abstractions (codex, future providers)
  - `src/types.ts` — Shared type definitions
  - `src/utils.ts` — Utility functions
- `docs/vision/` — Vision and design documents
- `dist/` — Compiled output (do not edit directly)

## Coding Conventions

- **Language:** TypeScript with strict mode, targeting ESNext with NodeNext module resolution
- **Module system:** ES modules (`"type": "module"` in package.json)
- **Runtime:** Node.js (use `node:` prefix for built-in modules)
- **Dependencies:** Minimize external dependencies. Prefer Node.js built-in modules
- **Error handling:** Throw descriptive errors at boundaries. Don't over-defend internal code
- **Naming:** camelCase for variables/functions, PascalCase for types/classes, kebab-case for filenames
- **Exports:** Named exports only, no default exports

## Architecture Principles

- **Provider abstraction:** All AI model interaction goes through the Provider interface in `src/providers/provider.ts`. Never call an AI provider directly
- **Agent independence:** Each agent class is self-contained with its own prompt template. Agents do not reference or depend on other agents
- **Orchestrator ownership:** Only the orchestrator manages agent execution order and data flow between agents
- **File-based context:** Agents operating on project code work through the filesystem (workspace directory), not through in-memory data passing

## Testing

- Run `npm run build` to compile
- Run `npx adt --help` to verify the CLI works
- Test the full pipeline with a simple requirement to verify end-to-end flow

## When Modifying

- When adding a new agent: create the agent file in `src/agents/`, add it to the orchestrator's pipeline
- When adding a new provider: implement the Provider interface in `src/providers/`, register it in the config
- When changing the workflow: modify `src/orchestrator.ts` and update `docs/vision/WORKFLOW.md`
