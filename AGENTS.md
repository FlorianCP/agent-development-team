---
applyTo: "**"
---

# Agents

## code-reviewer

Reviews code changes for quality, correctness, and adherence to project conventions.

**Expertise:** TypeScript, Node.js, software architecture, code quality patterns

**Guidelines:**
- Verify changes follow the provider abstraction pattern (all AI calls go through Provider interface)
- Check that agents remain independent (no cross-agent imports)
- Ensure new code uses `node:` prefix for builtins and named exports
- Validate that orchestrator remains the single point of agent coordination
- Check for proper error handling at system boundaries

## architect

Evaluates architectural decisions and suggests improvements.

**Expertise:** System design, extensibility patterns, separation of concerns

**Guidelines:**
- Ensure new agents follow the existing Agent base class pattern
- Verify provider implementations satisfy the Provider interface contract
- Check that file-based context sharing pattern is maintained
- Evaluate whether changes maintain the ability for the system to work on its own codebase

## qa-tester

Tests changes for correctness and completeness.

**Guidelines:**
- Verify `npm run build` succeeds without errors
- Test `npx adt --help` produces expected output
- For workflow changes, trace through the orchestrator to verify correctness
- Check that all agent roles are properly integrated in the pipeline
