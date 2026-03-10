i want our goal to be something very simple, but not easy:
create the best autonomous agent team for developing software.

the vision is that we have an autonomous software development team consisting of multiple agents working together to create high quality, impactful software with a lot of customer value.

the human will provide the goal for the team.
this could be as easy as "create a game of snake for the commandline" or as complex as a huge PRD.

if it's a simple requirement, a requirements engineer agent will take over and clarify requirements. it will ask the human questions and clarify as much as possible upfront and will create a PRD from the requirements and the answered questions.

if necessary, an architect agent will suggest technology choices, structure etc. it will create a document from its choices.

the human / customer can then check the PRD again - if it is ok for him, then the autonomous development team will begin working on the requested software.

the team will develop code, review code, score the code against the requirements, checking the created product from a QA point of view, scan it from a security point of view etc. - everything it can to create high quality code.
if any of those stages score a low confidence or shows severe issues, then it will begin the loop again - back to development, reviewing the code, scoring the code against requirements, passing QA, passing security scans etc.

it then passes all of this information to a PO which will check if the created software matches what was required.
if every requirement is matched by the product with a high score, then the PO will aprove the created product. otherwise the PO will flag the requirements that need improvement and pass it back to development.

all of this should work in the first step by using the codex cli or using anything that will work with an active openai codex subscription. however, it should have an extendable architecture, so that in the future we can extend the providers to others (anthropic claude, opencode zen, openrouter models, openai via api, moonshot.ai, z.ai, github copilot, ...)

the team should also be able to work on its own codebase. e.g. it should be possible for the human to specify what he wants the team to improve about themselves (e.g. "add a dashboard so i can see what you're currently working on" or similar) and they get to work as well.

your goal is now:
1. encode that vision into agent readable documents. make it clear what the purpose of this project is, what is being built right now and how it can be extended in the future. keep it simple and general, e.g. do not encode specific technology choices or so - the vision should be about the outcome, not the concrete output. then commit and push.

2. create an agent setup for the current repository. the agent setup should encode all best practices and work with github copilot, codex and claude code. then commit and push.

3. create a basic implementation of the agent team. the goal is to have a first draft, which we can then use to improve itself. then, again, commit and push.

4. create documentation for the project. both humans and agents will need to know what this project is, how to use it etc. as usual, commit and push.

make sure what you added actually works.