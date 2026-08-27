---
name: onplana-project-planner
description: >-
  Turn a goal or a brief into an executable Onplana plan over its MCP server:
  write a plan.md and attach it to the project, decompose it into tasks and
  subtasks, set start/due dates and dependencies, assign owners, add test cases
  as you go, and create tasks for the downstream surfaces a change ripples to.
  Use this whenever an agent (Claude Code, ChatGPT / Codex, or claude.ai) is
  connected to the Onplana MCP server and is asked to PLAN a project rather than
  just execute one. Hand the result to the onplana-autonomous-agent skill to run.
---

# Onplana project planner

This skill teaches a connected AI agent how to turn a goal into a real, runnable
plan inside Onplana: a written plan document attached to the project, and a task
tree (with dates, dependencies, owners, test cases, and downstream-surface tasks)
that another agent or a human can pick up and execute. Onplana is a
project-management platform you reach through its MCP server.

It is the front half of a pair. This skill **builds** the plan; the
`onplana-autonomous-agent` skill **runs** it. You do NOT need to memorize the tool
catalog, Onplana introspects itself: call `agent_bootstrap` first, then
`describe_capabilities` / `describe_schema` / `lookup_help_topic` /
`search_org_knowledge` whenever you need detail.

## 1. Connect and cold start

Connection is identical to the execution skill: the server is
`https://mcp.onplana.com/mcp`, auth is a Bearer **personal access token** minted
under **Settings → Agents → Connect an agent**. See the `onplana-autonomous-agent`
skill, section 1, for the per-client setup (Claude Code / ChatGPT / Codex /
claude.ai).

Every session, start the same two ways:

1. **`agent_bootstrap`**: identity, capabilities, entity-name index, assigned-task
   count. Follow its `nextSteps`.
2. **`whoami`**: confirm **which org**, **your role**, and **your project scope**.
   Planning creates a lot of objects (a project, tasks, assignments), so know up
   front whether your token is org-wide or scoped to specific projects. A **402**
   (plan/quota) or **403** (permission/scope) is a boundary, not a bug: log it,
   skip that action, keep going.

## 2. The planning method (the pipeline)

Planning is a pipeline, not a single call. The order matters because each stage
feeds the next:

> **Frame → write plan.md → decompose → schedule → assign → test cases →
> downstream surfaces → review → hand off.**

**Autonomy modes.** Default is **high**: build the whole plan, then report. If a
human prefixes the run with `autonomy: guided`, draft each stage and wait for a
go-ahead before you commit it (especially before creating the task tree and before
assigning real people). When unsure which mode you are in, ask once, then proceed.

**One fast path worth knowing.** If the human just wants a project stood up from a
structured brief, `instantiate_plan` creates a project + epic + tasks/subtasks +
risks in one atomic call. Use it when speed matters. Use the deliberate pipeline
below when you want a written plan, real dates, dependencies, assignments, test
cases, and downstream coverage, which is what this skill is for.

## 3. Frame the work

Before you write anything:

- **Find or create the target project.** Planning into an existing project?
  `get_project` for its current state, members, and dates. Greenfield?
  `create_project` (name, description, dates, status `PLANNING`). The plan, tasks,
  and assignments all hang off this project id.
- **Gather context.** Read any brief or seed task (`get_task`, `read_agent_brief`),
  skim similar past work (`find_similar_projects`), and check who is available
  (`list_org_members`, `list_teams`, `get_capacity`).
- **Learn the shape of the data in THIS org.** `describe_schema("Task", projectId)`
  and `describe_schema("Project")` tell you the exact fields, enums, and date
  formats this project accepts (custom statuses, custom fields, priority values),
  so the tasks you create are valid the first time.

## 4. Write the plan, and attach it to the project

Write the plan as a markdown document and attach it **before** you create tasks, so
there is a single human-readable source of truth the task tree is derived from.

- **Ensure a place to put it.** `list_libraries` for the project; if there is no
  suitable library, `create_library` (for example "Planning"). Then create the doc
  with `draft_document` (an editable markdown document in that library) titled
  `plan.md` or `<Project> plan`. If you already have the file bytes, use
  `upload_library_document` instead.
- **Keep it the source of truth.** As the plan evolves, `update_document_content`
  the doc so it never drifts from the task tree. `read_document_content` to re-read
  it later.

A plan.md that decomposes cleanly into tasks looks like this:

```
# <Project> plan

## Objective            one paragraph: the outcome and why it matters
## Scope                in scope / explicitly out of scope
## Milestones           dated checkpoints the work rolls up to
## Work breakdown       phases -> tasks -> subtasks (this becomes the task tree)
## Schedule             sequence, dependencies, the critical path, target dates
## Owners               who does what (roles or named people)
## Test strategy        acceptance criteria per deliverable, and the test cases
## Downstream surfaces  every place this change ripples to, with an owner each
## Risks                what might go wrong, and the mitigation
## Estimates & assumptions
```

The "Work breakdown", "Test strategy", and "Downstream surfaces" sections are the
ones you turn directly into tasks in the next stages, write them so each leaf is a
concrete, assignable unit of work.

## 5. Decompose into tasks and subtasks

Turn the work breakdown into the task tree, mirroring the plan's structure:

- **Group with phases.** Create an `create_epic` (or a milestone) per phase so the
  board reflects the plan's shape. `move_task_to_epic` to file tasks under them.
- **Create the tasks.** `create_task` for one, `bulk_create_tasks` for many at
  once. Each task gets a clear title, a description that **includes its acceptance
  criteria**, an estimate (`estimatedHours`), and a priority.
- **Add subtasks** for anything that is more than a single sitting:
  `add_subtasks` under the parent. Keep leaves small enough that "done" is
  unambiguous.
- Keep the breakdown honest: if a task has no acceptance criteria you can test, it
  is not specified well enough yet, sharpen it before moving on.

## 6. Schedule: dates, dependencies, milestones

A plan without dates is a wish list. Sequence and schedule the tree:

- **Set dates per task.** `update_task` (or set them at create time) for
  `startDate` and `dueDate`. Onplana dates are calendar-day `YYYY-MM-DD`, confirm
  the exact field names with `describe_schema("Task")`.
- **Respect the working calendar.** `list_working_calendars` /
  `get_working_calendar` so deadlines skip weekends and holidays instead of landing
  on a day no one works.
- **Wire dependencies.** `link_dependency` (types FS / SS / FF / SF, with lag)
  so the schedule encodes the real order of operations. In `guided` mode, prefer
  `propose_dependency` so a human confirms the links.
- **Let the engine help.** `critical_path_narrative` explains the longest path and
  where the slack is; `auto_schedule_proposal` / `gantt_optimize` propose a
  sequenced set of dates you can review and apply.
- **Set milestones.** `create_milestone` for each dated checkpoint in the plan, so
  progress rolls up to something a stakeholder recognizes. Set the project's own
  `startDate` / `endDate` (`update_project`) to bound the whole effort.

## 7. Assign owners

Map work to people:

- **Know who is available.** `list_org_members`, `list_team_members`, and
  `get_capacity` to avoid overloading anyone.
- **Assign.** `assign_task` for one, `bulk_assign` for many. The assignee must be
  a member of the project, `add_project_member` first if needed (and allowed).
- **When the call is the human's**, do not hard-assign: `propose_assignment`
  surfaces a suggestion for them to approve. Always use the propose path in
  `guided` mode, and whenever you are assigning real named people to real
  deadlines.

## 8. Build in test cases as you go

Do not leave testing to the end. As you create each deliverable task, derive its
acceptance criteria into explicit, checkable test cases in the same pass:

- **Per-deliverable test cases.** For each feature/deliverable task, add test-case
  **subtasks** (`add_subtasks`), one per acceptance criterion: the happy path, the
  edge cases, the failure modes. "Build login" gets "Test: valid login", "Test:
  wrong password locks after N tries", "Test: expired session redirects".
- **A QA group for cross-cutting checks.** Create a "Testing & QA" epic (or a
  milestone) for the end-to-end / regression / performance checks that span
  several deliverables.
- **Tag them so they are findable.** `create_tag` a `test` (or `qa`) tag and
  `assign_tag` it to every test task, so the execution agent and reviewers can
  filter the suite at a glance.
- This is the planning-side mirror of the execution skill's "verify before you
  mark it done" step: the test cases you write now are exactly what the agent runs
  later to earn a `DONE`.

## 9. Add tasks for downstream surfaces (if any)

A change rarely lives in one place. For anything user-facing or shared, add an
explicit task for **each surface it ripples to**, so the work is not silently
forgotten. Walk this checklist and add a task per applicable row (mark the rest
N/A in the plan, with a reason):

- **Documentation** (user docs, help center, READMEs, runbooks)
- **Tests** (unit, integration, end-to-end) beyond the per-deliverable cases
- **API / SDK / client consumers** that must change with a contract change
- **Data migrations / backfills** and their rollback
- **Permissions / roles / access** that the change touches
- **Notifications / events / webhooks / automations** that should fire
- **Analytics / tracking** for the new behavior
- **Internationalization** (new user-facing strings)
- **Marketing / release notes / changelog** when it is customer-visible
- **Seed / demo / fixtures** so the new path is exercised

Record these in the plan.md "Downstream surfaces" section AND create the tasks, and
fold their effort into the estimate, downstream work is not free. Some plans
genuinely have no downstream surfaces (a one-off analysis); "if any" is real, just
make the N/A call explicitly rather than skipping the check.

## 10. Review the plan before you hand it off

Sanity-check the plan you just built, the same discipline the execution skill
applies before it closes a task:

- `get_subtree` the project / epics and confirm there are **no orphan tasks**, the
  hierarchy matches the plan.md work breakdown, and estimates roll up sensibly.
- **Dates are consistent**: no child due after its parent, no task starting before
  a dependency finishes. `critical_path_narrative` to confirm the critical path is
  what you intended.
- **Every deliverable has at least one test case**, and **every applicable
  downstream surface has a task**.
- **Dependencies are acyclic** (Onplana rejects cycles; if a `link_dependency`
  errored, the order is wrong, fix it).
- Then `update_document_content` so plan.md reflects the final tree, and post a
  short summary comment on the project: phases, task count, milestones, the
  critical path, and anything still needing a human decision.

## 11. Hand off to execution

The plan is now runnable. Either start executing it yourself with the
`onplana-autonomous-agent` skill (loop the open tasks, do them, verify, report),
or tell the human the project is planned and ready and point them at that skill.
Keep plan.md updated as the work proceeds, a living plan is worth more than a
pretty one.

## 12. Guardrails

- **Stay in scope.** Create objects only in the org / projects your token allows. A
  403 means stop, not retry.
- **Do not over-explode.** A plan is a map, not every keystroke. If you are about
  to create hundreds of trivial subtasks, step back, the right grain is "a unit a
  person can own and finish", not "every line of the work".
- **Be careful assigning real people to real deadlines.** Prefer `propose_*`
  tools when the call is the human's, and always in `guided` mode.
- **Pause before outward-facing actions** (sending invites/messages, anything that
  leaves Onplana). Surface and wait, even in autonomous mode.
- **Keep the plan and the tree in sync.** If you change the task tree, update
  plan.md; if you change plan.md, reflect it in the tasks. Drift between the two is
  the main way a plan goes stale.
- **Token budget is finite.** Schedule/optimize and narrative tools draw on the
  org's bundled AI allowance; on `aiQuotaExceeded`, stop the AI calls and report,
  do the rest by hand.

## 13. Ready-to-run directive

Once connected, a human can kick off planning with one instruction. Paste
something like this (adapt the goal and project):

> Plan **<the goal>** in Onplana. Create (or use) the project, write a plan.md and
> attach it to the project's library, then decompose it into tasks and subtasks
> mirroring the plan. Set start and due dates and dependencies for each task,
> assign owners (propose assignments rather than hard-assigning where it is my
> call), and add test-case subtasks for each deliverable as you go. Add tasks for
> any downstream surfaces the work touches (docs, tests, API, migrations,
> permissions, analytics). Set milestones, review the tree for orphans and date
> conflicts, update plan.md to match, and post a summary when done.

## 14. The tools you'll actually use

Everything else is one `describe_capabilities` call away. The workhorses:

| Phase | Tools |
|-------|-------|
| Cold start | `agent_bootstrap`, `whoami` |
| Frame | `get_project`, `create_project`, `find_similar_projects`, `describe_schema`, `list_org_members`, `list_teams` |
| Plan doc | `list_libraries`, `create_library`, `draft_document`, `upload_library_document`, `update_document_content`, `read_document_content` |
| Decompose | `create_epic`, `create_task`, `bulk_create_tasks`, `add_subtasks`, `move_task_to_epic` |
| Schedule | `update_task`, `link_dependency`, `propose_dependency`, `create_milestone`, `list_working_calendars`, `critical_path_narrative`, `auto_schedule_proposal`, `gantt_optimize`, `update_project` |
| Assign | `list_org_members`, `get_capacity`, `assign_task`, `bulk_assign`, `propose_assignment`, `add_project_member` |
| Test cases | `add_subtasks`, `create_tag`, `assign_tag` |
| Review + fast path | `get_subtree`, `instantiate_plan` |
| Lookup | `describe_capabilities`, `lookup_help_topic`, `search_org_knowledge` |
