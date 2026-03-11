# Backlog

Impact scores:
**Critical** = foundational / unlocks many things
**High** = significant user or quality improvement
**Medium** = nice to have, clear value
**Low** = polish or future-facing

Legend:
- ✅ = completed
- 🏗️ = in progress
- ➡️ = planned next

---

## Observability & Reporting

- ✅ **Runtime Info** — Run output on console shows how many iterations were needed and how long it took to complete the project. `Impact: Medium`

- ✅ **Structured Score Tracking** — Track and display score trends across iterations (e.g. "Review: 60→75→88") so the human can see convergence or stalling. `Impact: Medium`

- ✅ **Runtime per Iteration** — Track and display how long each complete iteration takes (dev -> review -> QA -> security -> done or next iteration). `Impact: Low`

- ✅ **Console Output for All Pipeline Agents** — Requirements Engineer, Architect, and Product Owner display the same status + time-taken style output as Developer, Reviewer, QA, and Security. `Impact: Medium`

- **Customer Brief** — PO creates a customer brief with a summary of the final product, decisions made, quality scores, the number of iterations it took, how long it took to complete the project, and any known issues or limitations. `Impact: High`
  - `npm run start -- self-improve "Add a Customer Brief phase after PO approval. The Product Owner agent should generate a structured Markdown summary document (docs/CUSTOMER_BRIEF.md) that includes: what was built, key architectural decisions, final quality scores from all reviewers, number of iterations and total time, and any known issues or limitations flagged during review. The orchestrator should call this after PO approval and before documentation."`

- **Logs / Auditability** — Trace logs are kept for all agent interactions, including prompts, outputs, and decisions made at each step. This allows for auditing and understanding the development process. `Impact: High`
  - `npm run start -- self-improve "Add an audit logging system. Create a RunLogger utility that writes structured log entries (JSON lines) to a logs/ directory in the workspace. Log each agent invocation with: agent name, timestamp, prompt hash, full output, parsed score, issues found, and duration. The orchestrator should create the logger at run start and pass it through agent calls. Each run gets its own timestamped log file (e.g. logs/run-2026-03-11T10-30-00.jsonl)."`

- 🏗️ **Agent Reports** — After each iteration, the Code Reviewer, QA Engineer, and Security Engineer each write a structured Markdown report of their findings (grouped by severity: critical, major, minor, info) to a persistent artifacts directory (e.g. `docs/reviews/iteration-N-reviewer.md`). The developer should also report his changes. Reports accumulate across iterations so the developer, PO, and human can trace how issues were found and resolved. `Impact: High`
  - `npm run start -- self-improve "After each development loop iteration, save the work of the developer and the findings from Code Reviewer, QA Engineer, and Security Engineer as structured Markdown reports to a docs/reviews/ directory in the workspace. File naming: iteration-N-developer.md, iteration-N-reviewer.md, iteration-N-qa.md, iteration-N-security.md. Each report should contain: agent name, iteration number, score (developer can include confidence score how confident he is that he successfully implemented the necessary changes for the requirements), and issues grouped by severity if applicable (critical, major, minor, info) with descriptions and suggestions. The orchestrator should write these files after each evaluator completes. Reports accumulate across iterations."`

- **Reports** — Reports of each agent for each run are saved in a Markdown file in the output directory, so the customer can review the PRD, architecture, code quality feedback, QA results, security findings, and final approval notes. `Impact: High`
  - `npm run start -- self-improve "At the end of a successful run, generate a comprehensive run report as docs/RUN_REPORT.md. The report should include: the original requirement, PRD summary, architecture summary, per-iteration scores from all evaluators, final quality scores, PO approval status, total iterations and runtime, and a consolidated list of all issues found and resolved. The orchestrator should collect this data throughout the run using the existing RunMetrics and write the report after the documentation phase."`

- **Progress Events / Callbacks** — Emit structured events (agent-started, agent-completed, iteration-started, etc.) that a future dashboard, web UI, or CI integration could consume. `Impact: High`
  - `npm run start -- self-improve "Add a progress event system to the orchestrator. Create an EventBus class (src/events.ts) that emits typed events: run-started, agent-started, agent-completed (with agent name, duration, score), iteration-started, iteration-completed (with scores and timing), run-completed. The orchestrator should emit events at each phase transition. Events are delivered to registered listeners synchronously. Export the EventBus from the package so external consumers can subscribe. Include event type definitions in types.ts."`

- ➡️ **Cost Tracking** — Track and display token usage / API cost per run if the provider exposes that information. Also include that information in the final report. `Impact: Low`
  - `npm run start -- self-improve "Add optional cost tracking to the Provider interface. Extend the Provider interface with an optional getLastCallMetrics() method that returns { tokensIn, tokensOut, durationMs } or null. The orchestrator should accumulate these metrics across all agent calls and display a cost summary at the end of the run (total tokens in, total tokens out, total provider time). If the provider does not support metrics, skip tracking gracefully. Update the Codex provider to return null (codex CLI does not currently expose token counts)."`

---

## Provider Ecosystem

- ✅ **Provider: Codex CLI** — Configure the used model and reasoning effort for Codex CLI via a local configuration file (.adt.config.json). `Impact: High`

- **Provider: Claude Code** — Implement the Provider interface for Anthropic's Claude via the claude CLI, expanding model choice beyond Codex. `Impact: High`
  - `npm run start -- self-improve "Implement a Claude Code provider in src/providers/claude.ts. It should implement the Provider interface by invoking the 'claude' CLI (similar to how codex.ts invokes 'codex exec'). Support: prompt via stdin, output capture, working directory, timeout with SIGTERM/SIGKILL, sandbox modes, and model configuration via .adt.config.json under provider.claude.model. Register the provider in src/cli.ts so --provider claude selects it. Validate the claude binary exists before execution. Update README with Claude provider documentation."`

- **Provider: OpenCode** — Implement the Provider interface for OpenCode, enabling use of models from various providers through one CLI. `Impact: Medium`
  - `npm run start -- self-improve "Implement an OpenCode provider in src/providers/opencode.ts. It should implement the Provider interface by invoking the 'opencode' CLI. Support prompt via stdin, output capture, working directory, timeout handling, and model configuration via .adt.config.json under provider.opencode. Register the provider in src/cli.ts. Update README."`

- **Provider: OpenRouter** — Implement the Provider interface for OpenRouter, enabling access to many models through one API. `Impact: Medium`
  - `npm run start -- self-improve "Implement an OpenRouter provider in src/providers/openrouter.ts. It should implement the Provider interface using the OpenRouter HTTP API (https://openrouter.ai/api/v1/chat/completions). Use Node.js built-in fetch. Requires OPENROUTER_API_KEY environment variable. Support model selection via .adt.config.json under provider.openrouter.model. Register in cli.ts. Include timeout handling and error response parsing. Update README."`

- **Provider Auto-Detection** — Auto-detect available CLIs (codex, claude, etc.) and let the user pick, or fall back gracefully if one isn't installed. `Impact: Medium`
  - `npm run start -- self-improve "Add provider auto-detection to src/cli.ts. When no --provider flag is specified, check for available provider CLIs on the system PATH using 'which' (codex, claude, opencode) in order of preference. If exactly one is found, use it automatically. If multiple are found, list them and ask the user to pick (or use the first one in non-interactive mode). If none are found, show a clear error message listing supported providers and installation links. Update README."`

---

## Workflow Improvements

- **Project Git Repository Management** — Define how `start` projects interact with git: should ADT init a git repo in the output directory? Should it support targeting an existing repo? How to handle checkpoints, branching, and state recovery for new projects (git checkpoints are currently only used for self-improve). `Impact: High`
  - `npm run start -- self-improve "Add git repository management for start mode projects. When creating a new project, init a git repo in the output directory. Create an initial commit after the PRD and architecture docs are written. Create git checkpoints (like self-improve mode) before each development iteration. Add a --no-git-init flag to opt out. Support an --existing-repo flag that lets users point to an existing git repository instead of creating a new output directory. Update README with the new git workflow options."`

- ✅ **Max Iterations Handling** — When max-iterations is reached without meeting quality thresholds, produce a clear summary report of what was achieved and what issues remain. `Impact: High`

- ✅ **Parallel Agent Execution** — Run independent agents (Reviewer, QA, Security) in parallel during the development loop instead of sequentially, reducing wall-clock time. `Impact: High`
  - `npm run start -- self-improve "In the development loop in src/orchestrator.ts, run the Code Reviewer, QA Engineer, and Security Engineer in parallel using Promise.all instead of sequentially. Each agent is independent and reads the workspace files without modification, so they can safely run concurrently. Collect all three results after they complete, then aggregate feedback as before. Update the timing output to show parallel execution time (wall-clock, not sum). Ensure error handling works correctly — if one agent fails, the others should still complete and their results should be captured. Update the console output to reflect parallel execution (e.g. show all three as started, then report results as they complete)."`

- **Conditional Architecture Phase** — Skip the Architect when the requirement is trivial (e.g. a small script) or when the human provides a PRD that already includes architecture decisions. `Impact: Low`
  - `npm run start -- self-improve "Add a --skip-architecture CLI flag to bypass the architecture phase. When set, the orchestrator should skip the Architect agent and proceed directly to approval with just the PRD. Also add heuristic detection: if the PRD is shorter than 500 words or the original requirement is under 100 characters, ask the user whether to skip architecture. Update README with the new flag."`

- **Human Feedback on PRD/Architecture** — Allow the human to provide revision notes on the PRD or Architecture that get fed back to the Requirements Engineer or Architect for a redo, instead of binary approve/reject. `Impact: Medium`
  - `npm run start -- self-improve "Change the approval phase in src/orchestrator.ts from binary yes/no to three options: approve, reject, or revise. When the user chooses 'revise', prompt them for revision notes (free text). Pass the revision notes back to the Requirements Engineer or Architect (depending on what needs revision) as additional context, asking them to update their document. Then re-display the updated document and ask for approval again. Allow up to 3 revision rounds before forcing approve/reject."`

- **Custom Quality Gates** — Allow users to define per-agent quality thresholds (e.g. security must score ≥90 while QA only needs ≥70) instead of a single global threshold. `Impact: Medium`
  - `npm run start -- self-improve "Add support for per-agent quality thresholds. Extend ADTConfig and CLI to accept --threshold-review, --threshold-qa, and --threshold-security flags (each 0-100, defaulting to the global --threshold value). In the development loop, check each evaluator's score against its specific threshold instead of the global one. Also support configuration via .adt.config.json under thresholds.review, thresholds.qa, thresholds.security. Update README with the new options."`

---

## Quality & Reliability

- ✅ **Agent Output Validation** — Validate that agent JSON responses parse correctly; retry the agent once if output is malformed instead of failing the run. `Impact: High`

- **Timeout Handling** — Add configurable per-agent timeouts so that different agent roles can have different time limits. Currently there is one global timeout for all provider calls. `Impact: Medium`
  - `npm run start -- self-improve "Add per-agent timeout configuration. Extend ADTConfig to accept agentTimeouts: { developer, reviewer, qa, security, architect, requirementsEngineer, productOwner, documentationWriter } where each is an optional number (milliseconds). Add CLI flags --timeout-developer, --timeout-reviewer, etc. When an agent calls the provider, pass the agent-specific timeout if configured, otherwise fall back to the global providerTimeoutMs. Also support configuration via .adt.config.json under agentTimeouts. Update README."`

- **Error Recovery** — When a single agent fails (provider error, timeout, malformed output after retries), the orchestrator should handle it gracefully instead of crashing the entire run. Options: skip the failed agent for this iteration with a warning, retry the iteration, or prompt the human. `Impact: High`
  - `npm run start -- self-improve "Add error recovery to the development loop in src/orchestrator.ts. When an evaluator agent (Reviewer, QA, or Security) fails with a provider error or timeout, catch the error and log a warning instead of crashing the run. Assign the failed agent a score of 0 and add a synthetic critical issue noting the failure. The development loop should continue with the remaining agents. If the Developer agent fails, that is fatal — log the error and abort the run with a clear message. Add a --strict flag that restores the current behavior (crash on any agent failure). Update README."`

---

## Self-Improvement

- **Full Pipeline for Self-Improve** — Currently self-improve skips requirements/architecture. Add an option to run the full pipeline (with PRD + architecture) for larger self-improvement tasks. `Impact: Medium`
  - `npm run start -- self-improve "Add a --full-pipeline flag to the self-improve command. When set, run the complete pipeline including Requirements Engineer (to create a PRD from the improvement requirement) and Architect (to design the approach) before entering the development loop. The current behavior (skipping directly to development) should remain the default. Update the orchestrator's selfImprove method to support both paths. Update README and CLI help text."`

- **Prompt Versioning** — Store agent prompt templates as external files so they can be iterated on, diffed, and improved by the team itself. `Impact: Medium`
  - `npm run start -- self-improve "Extract all agent prompt templates from inline strings in src/agents/*.ts into external Markdown files under src/prompts/ (e.g. src/prompts/developer.md, src/prompts/reviewer.md). Each agent should load its prompt template at construction time using readFileSync. Templates should support {{variable}} placeholders that the agent fills in at execution time. This makes prompts diffable, versionable, and improvable by the agent team itself. Update the build process to copy prompt files to dist/prompts/."`

---

## Backlog & Task Management

- **Backlog Self-Management** — The agent team can work from BACKLOG.md directly. When given a task, the orchestrator reads the backlog, marks the item as 🏗️ (in progress), and marks it ✅ when complete. The Product Owner selects the next ➡️ item if none is currently planned. Agents can propose new backlog items that bring the project closer to the vision. `Impact: High`
  - `npm run start -- self-improve "Add backlog integration to the orchestrator. When running self-improve, if the requirement matches a backlog item title (fuzzy match), automatically update BACKLOG.md to mark that item as 🏗️ at the start and ✅ on successful completion. Add a 'backlog' CLI command: 'npm run start -- backlog' that reads BACKLOG.md, shows the current state, and lets the user pick an item to work on (or auto-selects the ➡️ item). The PO agent should evaluate whether to suggest a next ➡️ item from the backlog after completing a task. Read BACKLOG.md, parse the Markdown structure, and update item prefixes in place."`

---

## New Agents

- **Test Writer Agent** — Generates comprehensive test suites from the PRD before code review, giving QA concrete tests to run. `Impact: High`
  - `npm run start -- self-improve "Add a Test Writer agent (src/agents/test-writer.ts). It runs after the Developer in the development loop (before Reviewer). It reads the PRD and the current code, then generates or updates test files in the workspace. It should produce tests that cover the key requirements from the PRD. The agent does not score — it only produces test code. Register it in the orchestrator's development loop. The Developer in subsequent iterations should be aware that tests exist and should make them pass."`

- **Performance Analyst Agent** — Profiles code for efficiency issues, large bundle sizes, or algorithmic concerns. `Impact: Low`
  - `npm run start -- self-improve "Add a Performance Analyst agent (src/agents/performance-analyst.ts). It runs as an optional evaluator in the development loop alongside Reviewer, QA, and Security. It analyzes code for algorithmic complexity issues, unnecessary allocations, large dependency trees, and performance anti-patterns. It returns a score and issues like other evaluators. Add a --enable-performance-analysis flag to opt in (disabled by default since not all projects need it). Register in the orchestrator. Update README."`

- **Release Manager Agent** — Prepares release notes, changelog entries, and packaging after PO approval. `Impact: Low`
  - `npm run start -- self-improve "Add a Release Manager agent (src/agents/release-manager.ts). It runs after PO approval and documentation. It generates: CHANGELOG.md entries based on what was built, a release summary suitable for GitHub Releases, and verifies package.json version is set. The agent writes its output to docs/RELEASE_NOTES.md. Register it in the orchestrator after the documentation phase. Update README."`

---

## Web Interface & Task Management

- **Web UI Foundation** — Replace CLI-only interaction with a web interface. The human interacts through a browser: submitting requirements, reviewing documents, approving stages, and viewing results. The CLI remains available as an alternative. `Impact: Critical`
  - `npm run start -- self-improve "Add a web server mode to ADT. Create src/server.ts that starts an HTTP server (Node.js built-in http module) serving a simple web interface. Add a 'serve' CLI command: 'npm run start -- serve' that starts the server on port 3000. The web UI should have: a form to submit requirements, a page to view and approve PRD/architecture, a live view of development loop progress, and a results page showing the final output. Use server-sent events (SSE) for real-time updates. The backend reuses the existing orchestrator. No external UI frameworks — use inline HTML/CSS/JS served from the TypeScript server."`

- **Kanban Board** — The team has its own kanban board in the web UI. Tasks move through columns matching the workflow phases (Backlog → Requirements → Architecture → Development → Review → Done). Adding a card to the board triggers the agent pipeline. `Impact: Critical`
  - `npm run start -- self-improve "Add a kanban board to the web UI. Create a board view with columns: Backlog, Requirements, Architecture, In Development, Review, Done. Each task is a card with a title, status, and metadata (scores, timing). Adding a new card to the Backlog column and moving it to Requirements triggers the agent pipeline. Cards move through columns automatically as the pipeline progresses. Store board state in a JSON file (data/board.json). Expose REST API endpoints for board CRUD operations. Update the web UI to render the board."`

- **Task Artifacts** — When a task finishes, all artifacts (PRD, architecture doc, agent reports, customer brief, code output) are attached to the task card so the human can review everything in one place. `Impact: High`
  - `npm run start -- self-improve "Attach run artifacts to kanban board task cards. When a pipeline run completes, collect all generated artifacts (PRD.md, ARCHITECTURE.md, CUSTOMER_GUIDE.md, review reports, iteration reports) and link them to the task card in board.json. Add a task detail view in the web UI that displays all attached artifacts. Each artifact should be viewable inline (rendered Markdown) or downloadable. Store artifacts in data/tasks/{task-id}/artifacts/."`

- **Task Queue & Continuous Execution** — The team processes tasks from the board sequentially. When one task completes, it picks up the next. If no tasks remain, it idles and waits. `Impact: High`
  - `npm run start -- self-improve "Add a task queue to the web server. Tasks in the Requirements column of the kanban board are queued for processing. The server processes one task at a time: picks the oldest queued task, runs the full pipeline, moves the card through columns as it progresses, and picks the next task when done. If no tasks are queued, the server idles and polls every 10 seconds. Add a status endpoint (GET /api/status) showing current task, queue depth, and idle state. Show queue status in the web UI header."`

- **Live Progress View** — While a task is running, the web UI shows real-time progress: which agent is active, current iteration, scores, and a live log stream. `Impact: Medium`
  - `npm run start -- self-improve "Add real-time progress streaming to the web UI. Use the Progress Events system (EventBus) to stream updates to connected browser clients via Server-Sent Events (SSE). The live view should show: current pipeline phase, active agent name and elapsed time, iteration number and scores, and a scrolling log of agent outputs. The view updates in real-time without page refreshes. Add a GET /api/events SSE endpoint. Create a progress panel component in the web UI."`

- **Multi-Project Support** — The web UI supports multiple projects, each with its own board and workspace. The team can switch between projects or run multiple projects if resources allow. `Impact: Medium`
  - `npm run start -- self-improve "Add multi-project support to the web server. Each project has its own kanban board, workspace directory, and configuration. Add a project selector in the web UI navigation. Store project metadata in data/projects.json. Add REST API endpoints for project CRUD (GET/POST/DELETE /api/projects). Each project's board is stored at data/projects/{id}/board.json. The task queue processes tasks across all projects in FIFO order. Add a --project flag to the CLI for project-scoped operations."`

