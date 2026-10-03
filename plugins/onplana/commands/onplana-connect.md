---
description: Sign in to the Onplana MCP server, then verify it works
---

Sign this Claude Code session in to Onplana's MCP server and confirm the
connection before reporting success.

## How the server gets here

The plugin declares the server in its own `.mcp.json`, pointing at
`https://mcp.onplana.com/mcp`, so installing the plugin is enough to add it.
It appears in `/mcp` as **plugin:onplana:onplana**. If the person already
added that URL themselves, Claude Code keeps their entry and treats the
plugin's as a duplicate, so there is still only one set of tools.

## Steps

1. Sign in. Ask the person to run `/mcp`, choose the Onplana server, and
   complete the browser sign-in. The token is issued to the Onplana
   organization they sign in as, and it lasts 90 days.

2. Verify rather than assume. Call `whoami` and report the account and
   organization it returns. If the tool list is empty or the call fails, the
   connection is not usable yet, so say so plainly instead of continuing.

3. Only if the server is missing from `/mcp` (for example, the plugin's
   server was toggled off), add it by hand, then go back to step 1:

   ```bash
   claude mcp add --transport http --scope user onplana https://mcp.onplana.com/mcp
   ```

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
