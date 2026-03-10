# Contributing to Agent Development Team

Thank you for your interest in contributing! This project was created by **Florian Rath** (florian@rath.space) with **OpenAI Codex** and **GitHub Copilot** as co-authors.

## Getting Started

```bash
git clone https://github.com/FlorianCP/agent-development-team.git
cd agent-development-team
npm install
npm run build
```

Verify everything works:

```bash
node --test test/*.test.mjs
npx adt --help
```

## Development Workflow

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Make your changes
4. Run the build: `npm run build`
5. Run the tests: `node --test test/*.test.mjs`
6. Commit and push your branch
7. Open a Pull Request

## Coding Conventions

- **TypeScript** strict mode, ES modules, `node:` prefix for built-in modules
- **Zero runtime dependencies** — only Node.js built-ins
- **Named exports only** — no default exports
- **Naming**: `camelCase` for functions/variables, `PascalCase` for types/classes, `kebab-case` for filenames
- **Agent independence**: agents don't import or reference other agents
- **Provider abstraction**: all AI model interaction goes through the `Provider` interface

See [CLAUDE.md](CLAUDE.md) for detailed architecture notes.

## Adding a New Agent

1. Create the agent file in `src/agents/` (extend the `Agent` base class)
2. Register it in `src/orchestrator.ts`
3. Add tests in `test/`

## Adding a New Provider

1. Implement the `Provider` interface in `src/providers/`
2. Register it in the CLI config handling in `src/cli.ts`
3. Update `README.md` with configuration details

## Reporting Issues

- Use GitHub Issues for bug reports and feature requests
- For security vulnerabilities, see [SECURITY.md](SECURITY.md)

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md).
