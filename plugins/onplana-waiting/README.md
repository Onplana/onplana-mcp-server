# Onplana: Waiting on you

A pane beside the chat in Claude Code with the [Onplana](https://onplana.com)
tasks that wait on you, and a text box that files what you paste. It runs on
the terminal, the desktop app, VS Code and mobile.

## Install

```bash
/plugin marketplace add Onplana/onplana-mcp-server
/plugin install onplana-waiting@onplana
```

Most people install it beside the main plugin, which brings the Onplana skills
and `/onplana-connect`:

```bash
/plugin install onplana@onplana
```

## It needs the Onplana MCP server

The pane reads and writes through the Onplana MCP server,
`https://mcp.onplana.com/mcp`, with your own sign-in. This plugin lists that
server in its own `.mcp.json`, because a hooks module can connect only a server
its own plugin lists. The `onplana` plugin lists the same URL. Claude Code runs
a server with the same URL once and skips the other copy (the same happens if
you added the URL yourself with `claude mcp add`), so with both plugins you
still get one Onplana server and one set of tools.

Installed on its own, this plugin still brings the server, so Claude also gets
the roughly 265 Onplana tools, not only the pane.

Sign in once: run `/mcp`, choose the Onplana server and complete the browser
sign-in, or run `/onplana-connect` if you have the `onplana` plugin. The MCP
server is available on every Onplana plan, including the free one.

## What the pane shows

For the person signed in to Onplana:

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

The mobile app draws no text box yet, so there the pane shows the lists only.

## What runs, what it calls, what it keeps

**The hooks module.** `hooks/hooks.json` names one hooks module,
`hooks/register.tsx`, which Claude Code loads and runs inside its own plugin
environment, where a module has no file system, network, process or DOM of
its own. It downloads nothing and runs no other code: no shell command, no
script, no second module. Everything it does goes through Claude Code's plugin
API: it registers the `/onplana-waiting` command, opens the pane, sets its
refresh timer, keeps its values in the session's state and the plugin store,
and connects to and calls the Onplana MCP server. `claude plugin validate` on
this folder lists those calls.

**Onplana tools it calls by itself.** The pane calls these Onplana MCP tools
on its own, without Claude or the model asking for them and without a
permission prompt:

| Tool | When | What it sends |
|---|---|---|
| `whoami` | each refresh | nothing |
| `list_my_tasks` | each refresh, five times (`BLOCKED`, `REVIEW`, `TODO`, `IN_PROGRESS`, overdue) | the status or overdue filter, a limit of 50 |
| `list_comments` | each refresh, for up to 25 `BLOCKED` or `REVIEW` tasks | the task id |
| `list_projects` | when you choose the project new tasks go to | a limit of 50 |
| `create_task` | when you press Enter on one line | the project id you chose, the line as the title |
| `create_comment` | when you press Enter on a text with a task link | the task id from the link, the rest of the text |

A refresh runs when a session starts, on the timer you set, on
`/onplana-waiting` and when you press **Refresh**. It only reads. The two writes happen only when you press
Enter in the text box.

**What it reads and keeps on your machine.** In Claude Code's plugin store (a
JSON file of this plugin's own under your Claude Code configuration
directory), under the key `waiting`: the project you chose (its id and name)
and the refresh interval. That is all it keeps across sessions, and it reads nothing
else from your machine. What it lists lives in the session's state and is gone
when the session ends.

**What it sends, and where.** Only to the Onplana MCP server,
`https://mcp.onplana.com/mcp`, as the account you signed in with: the tool
arguments in the table above. It sends nothing to anyone else and sends no
message to a person. Onplana's privacy policy is at
[onplana.com/privacy](https://onplana.com/privacy).

## Why it is a plugin of its own

The pane used to ship inside the `onplana` plugin (1.2.0). The Claude plugin
directory accepts a hooks module only from a verified organization, so the
directory plugin went back to the MCP server, skills and commands (1.2.1), and
the pane lives here, in the same marketplace.

## Editing it

`hooks/register.tsx`, its state contract `types/index.d.ts` (named in
`plugin.json` as `types`) and `tests/waiting.test.tsx` are maintained here
directly. Check them with `claude plugin validate` and `claude plugin test` on
this folder.

## Links

- [Onplana MCP](https://onplana.com/mcp)
- [The onplana plugin](../onplana/README.md)
- [Support](https://onplana.com/support)
