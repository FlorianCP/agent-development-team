# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in this project, please report it responsibly.

**Email:** florian@rath.space

**Please do NOT open a public GitHub issue for security vulnerabilities.**

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

You should receive a response within 7 days. Critical vulnerabilities will be prioritized.

## Security Model

ADT is an autonomous agent system that **intentionally executes shell commands, reads/writes files, and runs build/test scripts without human approval**. This is by design — see the [README](README.md) safety warning.

### Built-in Safeguards

- **Binary validation**: the Codex provider validates that the codex binary comes from a trusted installation directory
- **Command policy enforcement**: in high-trust mode, executed commands are checked against an allowlist and blocklist
- **Secret redaction**: provider output is scanned and redacted for API keys, tokens, private keys, and JWTs
- **Environment isolation**: only a curated set of environment variables are forwarded to child processes
- **Sandbox modes**: agents run with configurable sandbox levels (`read-only`, `workspace-write`)
- **Input sanitization**: untrusted data (requirements, PRD content) is wrapped in clearly delimited blocks to resist prompt injection

### What Is NOT Protected

- ADT does not sandbox the underlying AI provider (Codex CLI) beyond command policy checks
- Generated code is not automatically scanned for vulnerabilities at deploy time
- The `--full-auto` flag grants the developer agent write access to the workspace

### Recommendations for Users

- Review generated code before deploying to production
- Run ADT in an isolated environment (container, VM) for untrusted requirements
- Do not expose your API keys in requirement text or PRD documents
