# Changelog

All notable changes to the Onplana MCP server template + client SDK
will be documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added: `onplana` Claude Code plugin 1.2.0

- A **Waiting on you** pane beside the chat, from a hooks module
  (`plugins/onplana/hooks/register.tsx`, its state contract in
  `types/index.d.ts`): the signed-in person's `BLOCKED` or `REVIEW` tasks
  whose newest comment begins "Ready for", and their tasks due today or
  overdue, grouped and linked. It refreshes on a timer the person sets
  (default 10 minutes) and on `/onplana-waiting`.
- A text box in the pane: one line becomes a task in a project picked once
  (remembered across sessions), a longer text with a task link becomes a
  comment on that task, and text that reads as a message to a person is
  refused with a pointer to the mailbox. Nothing is sent to anyone.
- Reads and writes only through tools the Onplana MCP server already exposes
  (`whoami`, `list_my_tasks`, `list_comments`, `list_projects`,
  `create_task`, `create_comment`); no new tool or scope.
- `tests/waiting.test.tsx` for `claude plugin test`, including a settings
  value stored in an older shape.
- `plugin.json` names the contract under `types`. The directory listing
  fields (`displayName`, `documentationUrl`, `supportUrl`,
  `privacyPolicyUrl`, `termsOfServiceUrl`, `icon`) stay: the plugins
  reference lists each one, and `claude plugin validate` 2.1.317 reports
  none of them as unknown.

### Added: `onplana` Claude Code plugin 1.1.0

- `/onplana:manager` command and the `onplana-manager` skill: run a small
  fleet of coding agents from one Onplana board. The manager never writes
  code; it picks tasks by priority, leases each one (`claim_task`,
  `next_task`, `renew_task_lease`, `release_task`), posts a "touches" line so
  no two agents share files, dispatches developer agents with a
  self-contained brief, reviews by reading the diff, and keeps `REVIEW`
  (with a reader and a date) and `BLOCKED` (with what it waits on) honest.
  Uses only tools the Onplana MCP server already exposes.

## [0.1.0] - 2026-05-10

Initial release. Extracted from the Onplana platform's production MCP
deployment ([https://onplana.com/mcp](https://onplana.com/mcp)).

### Added: `onplana-mcp-server` (server template)

- `createMcpHandler({ dispatcher, auth })`: Express handler factory
  for the MCP Streamable HTTP transport in stateless mode.
- `Dispatcher` interface: pluggable contract for `listTools` +
  `callTool`. Lets host platforms wire whatever tool registry they
  prefer (Onplana wires its closed dispatcher; the in-memory example
  ships a 3-tool toy implementation).
- `BearerAuth` interface + `requireBearerAuth(...)` middleware:
  Bearer-token auth pattern with pluggable token validation.
- `wrapUserContent(value)`: recursive walker that wraps user-text
  fields in `<onplana_user_content>...</onplana_user_content>` tags
  with case-insensitive closing-tag escape. Prompt-injection
  containment for tool results.
- `SYSTEM_NOTE_SUFFIX`: appendable system note that tells the LLM
  to treat wrapped content as data, never as instructions.
- In-memory example (`examples/in-memory`): runnable MCP server
  with three trivial tools (echo, time_now, add). Verifies the repo
  is functional without external dependencies.

### Added: `onplana-mcp-client` (client SDK)

- `OnplanaMcpClient` class: typed wrapper around the public Onplana
  MCP endpoint at `<API_URL>/api/mcp/v1`.
- `listTools()` / `callTool(name, args)`: generic JSON-RPC tools
  surface, returns the raw MCP `Tool[]` and `CallToolResult` shapes.
- Convenience methods for the most-used Onplana tools:
  `listProjects`, `getProject`, `searchOrgKnowledge`, `createTask`,
  `listTasks`. Other tools accessible via `callTool`.

### Notes

- Built against `@modelcontextprotocol/sdk@^1.29.0`.
- Tested against Claude Desktop, Cursor, and the official MCP
  Inspector.
- See `README.md` for the production checklist (rate limiting,
  cost caps, audit logging, scope curation), patterns Onplana uses
  in its closed monorepo on top of this template.
