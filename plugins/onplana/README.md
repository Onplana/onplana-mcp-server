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

Two skills, invoked as `onplana:<name>`:

| Skill | Use it when |
|---|---|
| `onplana-project-planner` | You have a goal or a brief and want an executable plan: a plan document attached to the project, then a task tree with dates, dependencies, owners and test cases. |
| `onplana-autonomous-agent` | A plan already exists and you want it run: claim a task, work it, record progress and evidence, resolve or hand it back, then take the next one. |

Plus roughly 265 MCP tools once connected, scoped to the organization you sign
in as and filtered by your own role and plan. Writes go through the same
permission checks the web app uses, and every one is audited.

## Data

The plugin adds one remote MCP server, `https://mcp.onplana.com/mcp`, declared
in `.mcp.json`. It runs nothing on your machine. When Claude calls an Onplana
tool, the tool's arguments (for example a task title, a description, or a
project id) are sent to that server, which reads or writes your Onplana data as
the account you signed in with. Sign-in uses OAuth in your browser. Onplana's
privacy policy is at [onplana.com/privacy](https://onplana.com/privacy).

If you already added `https://mcp.onplana.com/mcp` yourself with
`claude mcp add`, Claude Code keeps your entry and skips the plugin's, so you
still get one set of tools.

## Editing the skills

Do not edit `skills/*/SKILL.md` here. They are generated from the canonical
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
