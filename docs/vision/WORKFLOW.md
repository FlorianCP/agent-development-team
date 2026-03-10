# Agent Team Workflow

## Overview

The workflow is a pipeline with feedback loops. It moves forward through distinct phases, but can loop back when quality gates are not met.

## Phases

### 1. Requirements Engineering

**Trigger:** Human provides a goal or requirement.

- If the input is brief or ambiguous, the Requirements Engineer generates clarifying questions.
- The human answers the questions.
- The Requirements Engineer produces a Product Requirements Document (PRD).

**Output:** A structured PRD with clear, measurable requirements.

### 2. Architecture

**Trigger:** PRD is ready.

- The Architect reviews the PRD and proposes technology choices, system structure, and key design decisions.
- Produces an Architecture Document.

**Output:** Architecture document with technology choices and system design.

### 3. Human Approval

**Trigger:** PRD and Architecture Document are ready.

- The human reviews both documents.
- The human can approve, request changes, or reject.
- If changes are requested, the relevant agent revises the document.

**Output:** Approved PRD and Architecture Document.

### 4. Development Loop

**Trigger:** Human approves the PRD and architecture.

This is an iterative loop that continues until quality thresholds are met or the maximum number of iterations is reached.

Each iteration:

1. **Develop** — The Developer writes or modifies code based on the PRD, architecture, and any feedback from previous iterations.
2. **Review** — The Reviewer examines code quality, patterns, and adherence to best practices.
3. **Score** — The code is scored against each requirement in the PRD.
4. **QA** — The QA agent tests the software from a user perspective and checks for defects.
5. **Security** — The Security agent scans for vulnerabilities and security issues.

If any stage produces critical issues or scores below the threshold, the feedback is aggregated and the loop repeats from the Development step.

**Output:** Code that passes all quality gates.

### 5. Product Owner Review

**Trigger:** Code passes all quality gates in the development loop.

- The Product Owner reviews the final product against every requirement in the PRD.
- Each requirement is scored for completeness and correctness.
- If all requirements score above the threshold, the product is approved.
- If any requirement scores below the threshold, the PO flags it and sends feedback back to the Development Loop.

**Output:** Approved product or specific feedback for improvement.

### 6. Documentation

**Trigger:** PO approves the product.

- The Documentation Writer creates concise customer-facing documentation.
- The documentation is based on the implemented code and PRD.
- The output includes quick setup, usage, and key feature guidance.

**Output:** Customer documentation ready to ship with the software.

### 7. Delivery

**Trigger:** Product and documentation are ready.

- The completed software is in the output directory, ready for the human.
- A summary of what was built, decisions made, and quality scores is provided.

## Feedback Flow

```
Requirements → Architecture → [Human Approval] → Development Loop → PO Review → Documentation → Done
                                      ↑                    ↑              |
                                      |                    |              |
                                      |                    └──────────────┘
                                      |                    (PO flags issues)
                                      |
                                      └── (Human requests changes)
```

## Iteration Limits

The development loop has a configurable maximum number of iterations to prevent infinite loops. If the maximum is reached without meeting quality thresholds, the system reports the current state and asks the human for guidance.
