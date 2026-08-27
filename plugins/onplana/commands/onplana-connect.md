---
description: Connect Claude Code to the Onplana MCP server, then verify it works
---

Connect this Claude Code session to Onplana's MCP server and confirm the
connection before reporting success.

## Why this is a command and not part of the manifest

A Claude Code plugin declares MCP servers in the stdio form (`command`, `args`,
`env`). Onplana's server is remote and OAuth-authenticated at
`https://mcp.onplana.com/mcp`, so it is attached at runtime instead. Anthropic's
own listed integrations for hosted products do the same thing.

## Steps

1. Add the server. Prefer `--scope user` so it follows the person rather than one
   checkout, unless they say they want it only in this project:

   ```bash
   claude mcp add --transport http --scope user onplana https://mcp.onplana.com/mcp
   ```

2. Authenticate. Run `/mcp`, choose **onplana**, and complete the browser
   sign-in. The token is issued to the Onplana organization the person signs in
   as, and it lasts 90 days.

3. Verify rather than assume. Call `whoami` and report the account and
   organization it returns. If the tool list is empty or the call fails, the
   connection is not usable yet, so say so plainly instead of continuing.

## What they get

Roughly 265 tools, scoped to the signed-in organization and filtered by that
person's own role and plan. Reads and writes both go through the same
permission checks the web app uses, and every write is audited.

Two skills ship with this plugin:

- **onplana:onplana-project-planner** turns a goal or a brief into an executable
  plan: a plan document attached to the project, then a task tree with dates,
  dependencies, owners and test cases.
- **onplana:onplana-autonomous-agent** runs an existing plan: claim a task, work
  it, record progress and evidence, resolve or hand it back, then take the next
  one.

Suggest the planner skill when they want a plan built, and the autonomous skill
when a plan already exists and they want it executed.

## If they do not have an account

Onplana has a free tier and the MCP server is available on every plan, including
free. Point them at https://onplana.com and continue once they can sign in.
