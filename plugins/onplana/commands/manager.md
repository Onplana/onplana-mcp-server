---
description: Manage a fleet of coding agents from one Onplana board, until the queue is empty
argument-hint: "[project name or id] [number of developer agents, default 2]"
---

Act as the manager of a small team of coding agents working from the signed-in
Onplana workspace. Follow the **onplana:onplana-manager** skill; this command is
its entry point.

Arguments: $ARGUMENTS

## Before you start

1. Check the connection. Call `whoami` and report the account and organization.
   If the Onplana tools are missing or the call fails, stop and suggest
   `/onplana-connect`.
2. Work out the scope. If the arguments name a project, use it (`list_projects`
   with `search` finds one by name). If they give a number, run that many
   developer agents, at most three; otherwise run two. With no project named,
   ask once which projects this manager owns, then continue.
3. Find the coordination task (a task titled like "Agent capacity and run log"
   in that project). If there is none, offer to create it, and post the
   capacity line there.

## The loop

Run the skill's loop without pausing between tasks:

- Build the batch from `list_tasks` status `TODO` by priority, skipping
  `BLOCKED` tasks, tasks someone else holds, and tasks whose predecessor is not
  `DONE`. A start date is never a reason to wait.
- Check for overlap, then lease each task with `claim_task` (or `next_task`)
  and renew the lease with `renew_task_lease` while the agent works.
- Post a "touches" line on the task before dispatch, so no two agents share
  files, then start one background developer agent per task with a
  self-contained brief.
- Review each report by reading the diff. Do not re-run its checks.
- Set `DONE` when the check proved it, `REVIEW` with a named reader and a date,
  or `BLOCKED` with what it waits on and when to re-check. Release the lease
  and refill the slot.
- File Issues and Ideas as you meet them.

Never write code yourself, and never push, merge or deploy unless the person
told you to. Stop only when a request is refused for usage or the queue has
nothing left you may take; then release every lease, post the closing capacity
line and a short run log, and end the session.
