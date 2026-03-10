# Backlog

Impact scores: **Critical** = foundational / unlocks many things, **High** = significant user or quality improvement, **Medium** = nice to have, clear value, **Low** = polish or future-facing.

---

## Observability & Reporting

- ✅ **Runtime Info** — Run output on console shows how many iterations were needed and how long it took to complete the project. `Impact: Medium`

- ✅ **Structured Score Tracking** — Track and display score trends across iterations (e.g. "Review: 60→75→88") so the human can see convergence or stalling. `Impact: Medium`

- 🏗️ **Runtime per Iteration** — Track and display how long each complete iteration takes (dev -> review -> QA -> security -> done or next iteration). `Impact: Low`

- **Customer Brief** — PO creates a customer brief with a summary of the final product, decisions made, quality scores, the number of iterations it took, how long it took to complete the project, and any known issues or limitations. `Impact: High`

- **Logs / Auditability** — Trace logs are kept for all agent interactions, including prompts, outputs, and decisions made at each step. This allows for auditing and understanding the development process. `Impact: High`

- **Reports** — Reports of each agent for each run are saved in a Markdown file in the output directory, so the customer can review the PRD, architecture, code quality feedback, QA results, security findings, and final approval notes. `Impact: High`

- **Progress Events / Callbacks** — Emit structured events (agent-started, agent-completed, iteration-started, etc.) that a future dashboard, web UI, or CI integration could consume. `Impact: High`

- **Cost Tracking** — Track and display token usage / API cost per run if the provider exposes that information. `Impact: Low`

---

## Provider Ecosystem

- **Provider: Claude Code** — Implement the Provider interface for Anthropic's Claude via the claude CLI, expanding model choice beyond Codex. `Impact: High`

- **Provider: OpenRouter** — Implement the Provider interface for OpenRouter, enabling access to many models through one API. `Impact: Medium`

- **Provider Auto-Detection** — Auto-detect available CLIs (codex, claude, etc.) and let the user pick, or fall back gracefully if one isn't installed. `Impact: Medium`

---

## Workflow Improvements

- **Project Git Repository Management** — Define how `start` projects interact with git: should ADT init a git repo in the output directory? Should it support targeting an existing repo? How to handle checkpoints, branching, and state recovery for new projects (git checkpoints are currently only used for self-improve). `Impact: High`

- **Max Iterations Handling** — Decide what happens when max-iterations is reached without meeting quality thresholds (e.g. fail with a report of what was achieved and what issues remain). `Impact: High`

- **Parallel Agent Execution** — Run independent agents (Reviewer, QA, Security) in parallel during the development loop instead of sequentially, reducing wall-clock time. `Impact: High`

- **Conditional Architecture Phase** — Skip the Architect when the requirement is trivial (e.g. a small script) or when the human provides a PRD that already includes architecture decisions. `Impact: Low`

- **Human Feedback on PRD/Architecture** — Allow the human to provide revision notes on the PRD or Architecture that get fed back to the Requirements Engineer or Architect for a redo, instead of binary approve/reject. `Impact: Medium`

---

## Quality & Reliability

- **Agent Output Validation** — Validate that agent JSON responses parse correctly; retry the agent once if output is malformed instead of failing the run. `Impact: High`

- **Timeout Handling** — Add configurable timeouts per agent call so a stuck provider call doesn't hang forever. `Impact: Medium`

---

## Self-Improvement

- **Full Pipeline for Self-Improve** — Currently self-improve skips requirements/architecture. Add an option to run the full pipeline (with PRD + architecture) for larger self-improvement tasks. `Impact: Medium`

- **Prompt Versioning** — Store agent prompt templates as external files so they can be iterated on, diffed, and improved by the team itself. `Impact: Medium`

---

## New Agents

- **Test Writer Agent** — Generates comprehensive test suites from the PRD before code review, giving QA concrete tests to run. `Impact: High`

- **Performance Analyst Agent** — Profiles code for efficiency issues, large bundle sizes, or algorithmic concerns. `Impact: Low`

- **Release Manager Agent** — Prepares release notes, changelog entries, and packaging after PO approval. `Impact: Low`

---

## Web Interface & Task Management

- **Web UI Foundation** — Replace CLI-only interaction with a web interface. The human interacts through a browser: submitting requirements, reviewing documents, approving stages, and viewing results. The CLI remains available as an alternative. `Impact: Critical`

- **Kanban Board** — The team has its own kanban board in the web UI. Tasks move through columns matching the workflow phases (Backlog → Requirements → Architecture → Development → Review → Done). Adding a card to the board triggers the agent pipeline. `Impact: Critical`

- **Task Artifacts** — When a task finishes, all artifacts (PRD, architecture doc, agent reports, customer brief, code output) are attached to the task card so the human can review everything in one place. `Impact: High`

- **Task Queue & Continuous Execution** — The team processes tasks from the board sequentially. When one task completes, it picks up the next. If no tasks remain, it idles and waits. `Impact: High`

- **Live Progress View** — While a task is running, the web UI shows real-time progress: which agent is active, current iteration, scores, and a live log stream. `Impact: Medium`

- **Multi-Project Support** — The web UI supports multiple projects, each with its own board and workspace. The team can switch between projects or run multiple projects if resources allow. `Impact: Medium`

