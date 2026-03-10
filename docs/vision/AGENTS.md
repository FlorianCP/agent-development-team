# Agent Roles

## Overview

Each agent has a specific role, expertise, and set of responsibilities. Agents communicate through shared artifacts (documents, code, feedback) rather than directly with each other. The orchestrator manages the flow between agents.

## Agents

### Requirements Engineer

**Role:** Translate human intent into clear, structured requirements.

**Responsibilities:**
- Analyze the initial requirement for completeness and ambiguity
- Generate clarifying questions for the human
- Incorporate answers into a comprehensive PRD
- Ensure requirements are specific, measurable, and testable

**Input:** Raw requirement from the human, answers to clarifying questions.
**Output:** Product Requirements Document (PRD).

### Architect

**Role:** Design the technical foundation for the product.

**Responsibilities:**
- Analyze the PRD and determine appropriate technologies
- Design system structure and component relationships
- Identify key technical decisions and trade-offs
- Document the architecture clearly enough for the Developer to implement

**Input:** PRD.
**Output:** Architecture Document.

### Developer

**Role:** Write the code that implements the requirements.

**Responsibilities:**
- Implement features according to the PRD and Architecture Document
- Write clean, readable, maintainable code
- Include tests where appropriate
- Address feedback from previous iterations (reviews, QA findings, security issues)

**Input:** PRD, Architecture Document, feedback from previous iterations.
**Output:** Working code in the project workspace.

### Reviewer

**Role:** Evaluate code quality and adherence to best practices.

**Responsibilities:**
- Review code for clarity, correctness, and maintainability
- Check adherence to the architecture design
- Identify potential bugs and design issues
- Provide specific, actionable feedback

**Input:** Code in the project workspace, PRD, Architecture Document.
**Output:** Review with issues and an overall quality score.

### QA Engineer

**Role:** Verify the software works correctly from a user's perspective.

**Responsibilities:**
- Test the software against each requirement in the PRD
- Identify functional defects and edge cases
- Verify error handling and edge case behavior
- Check that the software is usable and behaves as expected

**Input:** Code in the project workspace, PRD.
**Output:** QA report with test results, defects found, and a quality score.

### Security Engineer

**Role:** Identify security vulnerabilities and risks.

**Responsibilities:**
- Scan code for common vulnerability patterns (OWASP Top 10)
- Check for insecure dependencies and configurations
- Identify data handling and authentication issues
- Provide remediation recommendations

**Input:** Code in the project workspace.
**Output:** Security report with vulnerabilities found and severity ratings.

### Product Owner

**Role:** Verify the product meets the customer's requirements.

**Responsibilities:**
- Compare the final product against each requirement in the PRD
- Score each requirement for completeness and correctness
- Make the final approve/reject decision
- Provide specific feedback on what needs improvement if rejecting

**Input:** Code in the project workspace, PRD, all review/QA/security reports.
**Output:** Approval or rejection with specific feedback per requirement.

## Agent Independence

Each agent operates independently and is not aware of other agents. The orchestrator provides each agent with the context it needs and collects its output. This design allows agents to be improved, replaced, or extended without affecting others.
