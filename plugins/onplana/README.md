# Onplana for Claude Code

Plan and run projects in [Onplana](https://onplana.com) without leaving Claude Code.

## Install

```bash
/plugin marketplace add Onplana/onplana-mcp-server
/plugin install onplana@onplana
```

The plugin brings the Onplana MCP server (`https://mcp.onplana.com/mcp`) with
it. Sign in once:

```bash
/onplana-connect
```

That walks you through the browser sign-in and checks the connection works.
You can also run `/mcp`, choose the Onplana server and sign in there. The MCP
server is available on every plan, including the free one.

On claude.ai and in Cowork, the server appears on the plugin's **Connectors**
tab, where you connect it and sign in.

## What you get

Three skills, invoked as `onplana:<name>`, three commands, `/onplana-connect`,
`/onplana:manager` (run a fleet of coding agents from one board) and
`/onplana-waiting` (the pane below), and the Waiting on you pane:

| Skill | Use it when |
|---|---|
| `onplana-project-planner` | You have a goal or a brief and want an executable plan: a plan document attached to the project, then a task tree with dates, dependencies, owners and test cases. |
| `onplana-autonomous-agent` | A plan already exists and you want it run: claim a task, work it, record progress and evidence, resolve or hand it back, then take the next one. |
| `onplana-manager` | You want several coding agents working one board at once: a manager session that never codes picks tasks by priority, leases each one, names the files it touches, dispatches developer agents, reviews by reading the diff and keeps every status honest. Start it with `/onplana:manager`. |

## Waiting on you pane

In Claude Code the plugin also opens a **Waiting on you** pane beside the chat
(a hooks module, `hooks/register.tsx`, on the terminal, the desktop app, VS
Code and mobile). It lists, for the person signed in to Onplana:

- **Ready for you**: tasks assigned to you that are `BLOCKED` or in `REVIEW`
  and whose newest comment begins "Ready for", so someone has handed them back.
- **Due today or overdue**: tasks you hold or work on that are due today or
  past due.

Each task links to it in the Onplana web app. The pane reads the board again
every 10 minutes (choose 5, 10, 15, 30 or 60 under **Refresh every**) and
whenever you run `/onplana-waiting`, which also opens the pane if you closed it.

Below the lists is a text box. Paste or type, then press Enter:

- **One line** becomes a task in the project you choose once (the choice is
  remembered across sessions; **Change** picks another).
- **A longer text with an Onplana task link** becomes a comment on that task;
  the link itself is left out of the comment.
- **Text that reads as a message to a person** (a greeting, a sign-off, a
  `To:` or `Subject:` line) is refused, and nothing is filed: drafts belong in
  your mailbox, not in a task.

The pane sends nothing to anyone. It reads and writes only through the Onplana
MCP server above, with your own sign-in, using tools the server already has
(`whoami`, `list_my_tasks`, `list_comments`, `list_projects`, `create_task`,
`create_comment`). On a refresh it reads your BLOCKED, REVIEW, TODO,
IN_PROGRESS and overdue tasks, and the comments of up to 25 BLOCKED or REVIEW
tasks. The only thing it keeps on your machine is the chosen project and the
refresh interval, in Claude Code's plugin store. The mobile app draws no text
box yet, so there the pane shows the lists only.

Plus roughly 265 MCP tools once connected, scoped to the organization you sign
in as and filtered by your own role and plan. Writes go through the same
permission checks the web app uses, and every one is audited.

## Data

The plugin adds one remote MCP server, `https://mcp.onplana.com/mcp`, declared
in `.mcp.json`. Apart from the Waiting on you pane's hooks module, which runs
inside Claude Code's own plugin environment and calls only that server, it runs
nothing on your machine. When Claude calls an Onplana
tool, the tool's arguments (for example a task title, a description, or a
project id) are sent to that server, which reads or writes your Onplana data as
the account you signed in with. Sign-in uses OAuth in your browser. Onplana's
privacy policy is at [onplana.com/privacy](https://onplana.com/privacy).

If you already added `https://mcp.onplana.com/mcp` yourself with
`claude mcp add`, Claude Code keeps your entry and skips the plugin's, so you
still get one set of tools.

## Editing the skills

`skills/onplana-manager/SKILL.md`, the commands and the pane (`hooks/`,
`types/index.d.ts`, `tests/`) are maintained here directly. Check the pane
with `claude plugin validate` and `claude plugin test` on this folder.
Do not edit the other two `skills/*/SKILL.md` here. They are generated from the canonical
sources in the Onplana repo (`docs/onplana-agent-skill/`) by
`marketing/scripts/sync-agent-skill.mjs`, which writes both these copies and the
public downloads at [onplana.com/agent-skill](https://onplana.com/agent-skill).
Edit the canonical file and re-run the sync, or the two drift apart.

Note that the copies here deliberately omit the provenance banner the public
downloads carry: a plugin skill is parsed as YAML frontmatter starting at byte
zero, and an HTML comment above the opening `---` breaks that, so the skill
would load with no name and no description.

## Links

- [Onplana MCP](https://onplana.com/mcp)
- [Connect Onplana to Claude](https://docs.onplana.com/ai-agents/connect-onplana-from-the-claude-connectors-directory/)
- [Create a project from ChatGPT or Claude](https://docs.onplana.com/ai-agents/create-a-project-from-chatgpt-or-claude/)
- [Agent skills](https://onplana.com/agent-skill)
