# Onplana for Claude Code

Plan and run projects in [Onplana](https://onplana.com) without leaving Claude Code.

## Install

```bash
/plugin marketplace add Onplana/onplana-mcp-server
/plugin install onplana@onplana
```

Then connect the server:

```bash
/onplana-connect
```

That adds `https://mcp.onplana.com/mcp` and walks you through the browser
sign-in. The MCP server is available on every plan, including the free one.

## What you get

Two skills, invoked as `onplana:<name>`:

| Skill | Use it when |
|---|---|
| `onplana-project-planner` | You have a goal or a brief and want an executable plan: a plan document attached to the project, then a task tree with dates, dependencies, owners and test cases. |
| `onplana-autonomous-agent` | A plan already exists and you want it run: claim a task, work it, record progress and evidence, resolve or hand it back, then take the next one. |

Plus roughly 265 MCP tools once connected, scoped to the organization you sign
in as and filtered by your own role and plan. Writes go through the same
permission checks the web app uses, and every one is audited.

## Why the MCP server is not in the manifest

A plugin manifest declares MCP servers in the stdio form (`command`, `args`,
`env`). Onplana's server is remote and OAuth-authenticated, so `/onplana-connect`
attaches it at runtime instead. Anthropic's own listed integrations for hosted
products take the same approach.

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
