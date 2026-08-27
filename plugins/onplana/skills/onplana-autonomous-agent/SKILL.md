---
name: onplana-autonomous-agent
description: >-
  Work autonomously on projects in Onplana over its MCP server: pick up the open
  tasks in a project, do the work, keep each task's status current, report
  progress as comments, file an Issue when something is wrong, and poll for human
  replies. Use this whenever an agent (Claude Code, ChatGPT / Codex, or claude.ai)
  is connected to the Onplana MCP server and is asked to run through a project's
  tasks on its own.
---

# Onplana autonomous agent

This skill teaches a connected AI agent how to run through a project's work in
Onplana without a human babysitting every step. Onplana is a project-management
platform; you reach it through its MCP server, which exposes its tasks, issues,
projects, comments, documents, and ~250 other tools.

You do NOT need to memorize the tool catalog. Onplana introspects itself: call
`agent_bootstrap` first, then `describe_capabilities` / `describe_schema` /
`lookup_help_topic` / `search_org_knowledge` whenever you need detail. This skill
is the operating discipline that sits on top of those tools.

## 1. Connect (one-time, per client)

The server is `https://mcp.onplana.com/mcp`. Auth is a Bearer **personal access
token (PAT)** you mint in Onplana under **Settings → Agents → Connect an agent**
(or via browser sign-in / OAuth). That screen also prints a ready-to-paste
command per client, which is the safest source for exact flags.

- **Claude Code**: copy the generated `claude mcp add onplana ...` command (it
  embeds your token), or add an HTTP MCP server pointing at the URL with an
  `Authorization: Bearer <PAT>` header.
- **ChatGPT**: add Onplana as an MCP connector (or wire it into a Custom GPT)
  pointing at the same URL with the Bearer PAT.
- **Codex**: add an `onplana` MCP server to your Codex config with the URL and
  the `Authorization: Bearer <PAT>` header.
- **claude.ai**: Settings → Connectors → add a custom connector with the URL and
  token.

Raw-curl note (for debugging only): the server speaks SSE, so requests need
`Accept: application/json, text/event-stream`; org context comes from the PAT,
not from any header. Your MCP client handles all of this for you.

## 2. Cold start (first two calls, every session)

1. **`agent_bootstrap`**: one round-trip returns your identity, a capabilities
   summary, the entity-name index, and your assigned-task count. Its `nextSteps`
   are the canonical pointers; follow them.
2. **`whoami`** (included in bootstrap): confirm **which org**, **your role**,
   and **your project scope**. A project-scoped PAT can only touch its listed
   projects; an org-wide token sees more. Everything below is bounded by this.

If a call later returns **402** (plan/quota) or **403** (permission/scope), that
is the boundary, not a bug: log it, skip that action, and keep going. Do not
retry the same forbidden call.

## 3. The autonomous loop

The default job is a **non-blocking breadth-first sweep**: get through every open
task once, leaving each one either advanced, done, or clearly annotated. Never
let one stuck task halt the whole run.

**Autonomy modes.** The default is **high**: act, report, and keep moving, only
pausing for the guardrails in section 6. If a human prefixes the run with
`autonomy: guided`, switch to a slower posture: plan and draft each step, then
wait for their go-ahead (a comment reply or `request_user_input`) before you
commit a change. When in doubt about which mode you're in, ask once, then
proceed.

For a target project:

1. **List the open work.** `list_tasks` for the project (filter to not-done), or
   `list_assigned_tasks` for what's assigned to you, or `list_related_tasks`
   (`created_by_conversation` / `assigned_to_me`) to find work tied to you. Use
   `list_overdue` to prioritize.
2. **For each task, in order:**
   a. **Understand it.** `get_task` (and `get_subtree` if it has subtasks),
      `read_agent_brief` for any agent-specific brief, and check dependencies,
      acceptance criteria, attachments, and recent comments. For the exact
      fields a task accepts in this project, `describe_schema("Task", projectId)`.
   b. **Move it to in-progress.** `update_task` status → `IN_PROGRESS` before you
      start, so humans watching the board see it's live.
   c. **Do the actual work** in your own environment (write code, research,
      draft a document, analyze data, whatever the task asks).
   d. **Report as you go.** `append_log` for progress lines, `create_comment` for
      human-readable notes (post these in the task's **Agent** thread when one
      exists), and attach deliverables with `upload_task_attachment` or
      `draft_document`. Keep the comment trail honest: what you did, what you
      found, what's left.
   e. **Verify it works before you call it done.** Don't mark anything `DONE` on
      faith, reproduce the task's acceptance criteria. For code, run the build,
      the type-check, and the tests, and read the output. For a document or data
      deliverable, open it and confirm it says what the task asked for. **For
      anything with a UI or a running app, drive it in a browser and confirm the
      change actually behaves** (see section 5, "Testing the app"). Record what you
      ran and what you saw, attach the evidence (a screenshot, a log), and only
      then close the task. If verification fails the task is not done: fix it, or
      fall to step (g)/(h).
   f. **Close it out.** When the task's done and verified, `update_task` status →
      `DONE` (or `REVIEW` if a human should sign off). Keep the status field
      truthful at all times.
   g. **If you're blocked or unsure** (missing access, ambiguous requirement, a
      decision that's the human's to make): **add a comment to the task spelling
      out exactly what you need, then move on to the next task.** Do not stall the
      sweep. (Use `request_user_input` instead only when you truly cannot make
      any further progress anywhere and must wait.)
   h. **If you hit a real problem** (a bug, a blocker, a broken dependency, a
      risk that materialized): **file an Issue** with `create_issue` under the
      **same project**, and `link_issue` it to the task. Issues are Onplana's
      "this is happening and needs triage" log, distinct from tasks.
3. **When the sweep finishes**, post a short summary comment on the project (or
   on a designated coordination task): how many tasks advanced / completed /
   blocked, and the issues you filed. Then `end_session`.

## 4. Reporting discipline (the contract)

Humans trust autonomous agents only when the board reflects reality. So:

- **Status is never stale.** Every task you touch ends the run with a status that
  matches what actually happened.
- **Every meaningful step leaves a trace**: a comment or a log line. Silence
  reads as "nothing happened."
- **Deliverables live in Onplana**, not just in your head: attach files, draft
  documents, or paste results into a comment so the work survives the session.
- **Blocked is a state you record, not a wall you hit.** Comment the blocker,
  keep moving.

## 5. Testing the app (how to verify, with a browser)

"Done" means *you watched it work*, not "the code looks right." Match the check to
the deliverable:

- **Code / build tasks.** Run the project's own gates and read the real output:
  the build, the type-check (`tsc --noEmit` or equivalent), the unit/integration
  tests, the linter. Never report green you did not see scroll past. If a task
  ships a schema or API change, exercise the endpoint (a real request, the right
  status code) rather than trusting the diff.
- **UI / running-app tasks.** Start (or point at) the running app and reproduce
  the exact user flow the task describes, end to end.

**Use a browser to test whenever the change is user-visible.** Most agents can
drive Chrome through a connector their *own client* provides, not the Onplana MCP:
**Claude for Chrome** (the `claude-in-chrome` tools), a Playwright/Puppeteer MCP,
or a headless browser you script yourself. With one connected:

1. **Navigate** to the running app's URL (your local dev server, a staging URL, or
   the live app for a read-only check).
2. **Sign in with a test account.** Never type real production or personal
   credentials into a form on the user's behalf, that is the human's to do. Ask
   for a sandbox/test login, or have the human authenticate and hand you the
   signed-in tab.
3. **Reproduce the flow**: click through the exact steps in the task, fill the
   forms, trigger the action.
4. **Read the result, not just the screenshot.** Pull the page text / DOM, and
   check the **browser console and network panel** for errors and failed
   requests, a green-looking page can still be throwing 500s underneath.
5. **Defeat stale caches.** Service workers, CDNs, and dev tunnels happily serve
   an old bundle. Hard-reload (or open a fresh tab / cache-bust the URL) so you
   are testing the new build, not yesterday's. If the UI and the API disagree,
   suspect a cached front end first.
6. **Capture evidence and attach it.** Screenshot the working result and
   `upload_task_attachment` it to the task (or paste the console/network summary
   into a `create_comment`). Evidence is what turns `DONE` into something a human
   can trust without redoing your work.

**No browser automation available?** Don't silently mark it done. Either ask the
human to spot-check (give them the exact URL and steps), or, if the work was
purely backend, verify via the API/CLI and say so. Onplana itself is a web app, so
when the task *is* about Onplana's own UI, the same browser flow applies: open the
Onplana web app, sign in, and exercise the feature you changed.

## 6. Tasks vs Issues vs Risks vs Change Requests

Put the right thing in the right place:

- **Task**: planned work you will do ("build X", "review Y").
- **Issue**: a problem that has materialized and needs triage ("the build is
  failing", "this dependency is broken"). File these with `create_issue`; do NOT
  log bugs/blockers as new tasks.
- **Risk**: something that *might* happen (probabilistic, future).
- **Change Request**: a formal change to the project's baseline (scope /
  schedule / budget). Heavier, governance-gated; only when explicitly asked.

When unsure of an entity's fields or allowed values, ask the server:
`describe_schema(<Entity>[, projectId])`, `lookup_help_topic`, or
`search_org_knowledge`.

## 7. Guardrails

- **Stay in scope.** Act only within the org / projects your token allows. A 403
  means stop, not retry.
- **Don't talk to yourself.** When reading comment threads for human feedback,
  skip messages authored by agent personas (the read tools flag these) so you
  never reply to your own notes or loop forever. Advance your "since" timestamp
  each poll.
- **Pause before irreversible or outward-facing actions**: deleting data,
  changing access/permissions, sending external messages, anything that leaves
  Onplana. Surface it and wait for a human, even in autonomous mode.
- **Be honest in reports.** If a task failed or was skipped, say so plainly with
  the reason. Never mark something `DONE` you didn't actually finish.
- **Token budget is finite.** AI-heavy tools draw on the org's bundled allowance;
  if you hit a quota wall (`aiQuotaExceeded`), report it and stop the AI calls,
  not the whole run.

## 8. Ready-to-run directive

Once connected, a human can kick off a full sweep with a single instruction.
Paste something like this (adapt the project name):

> Loop through all the remaining open tasks in **<Project name>** and work on
> them autonomously. Move each task to In Progress, do the work, and verify it
> (run the tests/build, and for anything user-visible test it in a browser and
> attach a screenshot) before marking it Done, keep each status up to date. If
> you're blocked or have a question, add a comment to the task explaining what you
> need and move on to the next task. If you hit a real problem, file an Issue under
> the same project and link it to the task. When you've been through every task,
> post a summary and end the session.

## 9. The ~15 tools you'll actually use

Everything else is one `describe_capabilities` call away. The workhorses:

| Phase | Tools |
|-------|-------|
| Cold start | `agent_bootstrap`, `whoami` |
| Find work | `list_tasks`, `list_assigned_tasks`, `list_related_tasks`, `list_overdue`, `list_related_issues` |
| Understand | `get_task`, `get_subtree`, `read_agent_brief`, `describe_schema` |
| Do + report | `update_task`, `append_log`, `create_comment`, `upload_task_attachment`, `draft_document` |
| Problems | `create_issue`, `link_issue`, `resolve_issue` |
| Blocked / done | `request_user_input`, `end_session` |
| Lookup | `describe_capabilities`, `lookup_help_topic`, `search_org_knowledge` |
