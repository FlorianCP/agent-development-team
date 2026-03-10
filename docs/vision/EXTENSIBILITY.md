# Extensibility

## Design for Extension

The system is designed to be extended in several dimensions without requiring fundamental changes to the core workflow.

## Extension Points

### Providers

The system communicates with AI models through a provider abstraction. Each provider implements a standard interface for sending prompts and receiving responses.

**Current:** The system ships with one provider implementation.

**Future:** Additional providers can be added by implementing the same interface. The system should support any provider that can:
- Accept a text prompt
- Optionally operate on files in a workspace directory
- Return a text response

Examples of future providers: different AI model APIs, local model servers, specialized coding agents.

### Agents

Each agent is a self-contained unit with a role, prompt, and execution logic. New agents can be added to the pipeline, and existing agents can be modified or replaced.

**Possible future agents:**
- Performance Analyst — profiles and optimizes code
- UX Reviewer — evaluates user interface quality
- Deployment Engineer — handles CI/CD and infrastructure
- Test Writer — generates comprehensive test suites
- Release Manager — prepares release notes and packaging

### Workflow

The orchestrator manages the agent pipeline. The workflow itself can be extended:
- Add new stages to the pipeline
- Add parallel execution of independent agents
- Add conditional stages based on project type
- Add custom quality gates

### Self-Improvement

The system can work on its own codebase. This means:
- Agents can add new agents to the system
- Agents can improve their own prompts
- Agents can add new providers
- Agents can improve the orchestration logic

The human directs these improvements, and the same quality loop applies — the changes are reviewed, tested, and approved before being merged.

## Constraints on Extension

To keep the system coherent while extending it:

1. **All agents must communicate through the orchestrator.** No direct agent-to-agent communication.
2. **All providers must implement the same interface.** Provider-specific features are exposed through configuration, not interface changes.
3. **The core workflow (requirements → development → review → approval → documentation) should remain stable.** Extensions add to it, not replace it.
4. **Self-improvement changes go through the same quality loop as any other project.** The system does not modify itself without review.
