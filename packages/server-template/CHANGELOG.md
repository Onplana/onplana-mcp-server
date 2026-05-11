# Changelog

All notable changes to the Onplana MCP server template + client SDK
will be documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] — 2026-05-10

Initial release. Extracted from the Onplana platform's production MCP
deployment ([https://onplana.com/mcp](https://onplana.com/mcp)).

### Added — `onplana-mcp-server` (server template)

- `createMcpHandler({ dispatcher, auth })` — Express handler factory
  for the MCP Streamable HTTP transport in stateless mode.
- `Dispatcher` interface — pluggable contract for `listTools` +
  `callTool`. Lets host platforms wire whatever tool registry they
  prefer (Onplana wires its closed dispatcher; the in-memory example
  ships a 3-tool toy implementation).
- `BearerAuth` interface + `requireBearerAuth(...)` middleware —
  Bearer-token auth pattern with pluggable token validation.
- `wrapUserContent(value)` — recursive walker that wraps user-text
  fields in `<onplana_user_content>...</onplana_user_content>` tags
  with case-insensitive closing-tag escape. Prompt-injection
  containment for tool results.
- `SYSTEM_NOTE_SUFFIX` — appendable system note that tells the LLM
  to treat wrapped content as data, never as instructions.
- In-memory example (`examples/in-memory`) — runnable MCP server
  with three trivial tools (echo, time_now, add). Verifies the repo
  is functional without external dependencies.

### Added — `onplana-mcp-client` (client SDK)

- `OnplanaMcpClient` class — typed wrapper around the public Onplana
  MCP endpoint at `<API_URL>/api/mcp/v1`.
- `listTools()` / `callTool(name, args)` — generic JSON-RPC tools
  surface, returns the raw MCP `Tool[]` and `CallToolResult` shapes.
- Convenience methods for the most-used Onplana tools:
  `listProjects`, `getProject`, `searchOrgKnowledge`, `createTask`,
  `listTasks`. Other tools accessible via `callTool`.

### Notes

- Built against `@modelcontextprotocol/sdk@^1.29.0`.
- Tested against Claude Desktop, Cursor, and the official MCP
  Inspector.
- See `README.md` for the production checklist (rate limiting,
  cost caps, audit logging, scope curation) — patterns Onplana uses
  in its closed monorepo on top of this template.
