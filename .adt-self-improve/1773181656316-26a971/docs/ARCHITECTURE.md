# ADT Architecture (Self-Improvement Baseline)

## Core Boundaries
- `src/orchestrator.ts` is the single coordinator for agent sequencing and quality gates.
- All model calls must flow through the `Provider` interface in `src/providers/provider.ts`.
- Agents remain independent modules under `src/agents/` with no cross-agent imports.

## Agent Responsibilities
- Requirements Engineer: clarifies requirement and produces PRD.
- Architect: produces architecture guidance from PRD.
- Developer: implements code changes in workspace-write mode.
- Reviewer/QA/Security/Product Owner: evaluator gates with strict JSON scoring outputs.
- Documentation Writer: produces customer-facing docs after approval.

## Data Flow
- Runtime documents are written to `docs/` (PRD, ARCHITECTURE, CUSTOMER_GUIDE).
- Iteration feedback is aggregated by orchestrator and provided back to Developer.
- Approval requires evaluator scores meeting configured threshold and no critical issues.

## Invariants
- Quality scores must be valid numbers in range 0-100.
- Product Owner approval requires explicit boolean `approved`.
- Self-improvement in non-interactive mode requires explicit consent.
- Full-auto execution is opt-in and guarded by command policy checks.