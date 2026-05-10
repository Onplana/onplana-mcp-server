# onplana-mcp-client

Typed TypeScript client for the public [Onplana](https://onplana.com)
Model Context Protocol endpoint at `https://api.onplana.com/api/mcp/v1`.

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](../../LICENSE)
[![npm](https://img.shields.io/npm/v/onplana-mcp-client.svg)](https://www.npmjs.com/package/onplana-mcp-client)

## What this is

A small, dependency-free SDK for calling Onplana's MCP server from
in-house agents, scripts, and custom integrations. Wraps the JSON-RPC
wire format with:

- A generic `callTool<T>(name, args)` for any tool
- Typed convenience methods for the most-used ones — `listProjects`,
  `searchOrgKnowledge`, `createTask`, `listTasks`, `getProject`
- Clean error types (`OnplanaMcpError`) with HTTP status + Onplana
  error code surfaced

If you're using Claude Desktop, Cursor, or another MCP-aware client,
you don't need this — those clients speak MCP natively. This SDK is
for code that wants to drive Onplana via MCP without writing
JSON-RPC by hand.

## Install

```bash
npm install onplana-mcp-client
```

Zero runtime dependencies. Works on Node ≥ 18 (uses ambient `fetch`)
and modern browsers.

## Quickstart

### 1. Get a connection token

Sign in to Onplana, go to **Integrations → AI Agents**, click
**Generate connection** on the "Other MCP client" tile, copy the
token. It's an `MCP_AGENT`-scoped personal access token; revocable
from the same page.

### 2. Drive Onplana from code

```ts
import { OnplanaMcpClient } from 'onplana-mcp-client'

const client = new OnplanaMcpClient({
  url:   'https://api.onplana.com/api/mcp/v1',
  token: process.env.ONPLANA_PAT!,
})

// List my projects
const projects = await client.listProjects({ status: 'ACTIVE' })
for (const p of projects) console.log(p.id, p.name)

// Semantic search across indexed content
const { matches } = await client.searchOrgKnowledge({
  query: 'rationale for the 3-week design phase',
  scope: 'all',
  limit: 5,
})
matches.forEach(m => console.log(`${m.entityType} ${m.entityId} (${m.similarity.toFixed(2)}): ${m.snippet}`))

// Create a task (on FREE / STARTER plans returns a PREVIEW result)
await client.createTask({
  projectId: 'p_123',
  title:     'Migrate Postgres to Aurora',
  priority:  'HIGH',
})
```

### 3. Generic tool surface

For tools without a typed wrapper, use `callTool<T>`:

```ts
const { output, isError, raw } = await client.callTool<{ projects: any[] }>(
  'find_similar_projects',
  { description: 'Migrate from Project Online', limit: 5 },
)

if (isError) {
  console.warn('tool reported failure', raw)
} else {
  console.log(output.projects)
}
```

The full tool catalog is documented at [onplana.com/mcp](https://onplana.com/mcp).
Twenty-one tools today: list/get/create/update across projects,
tasks, sprints, comments, milestones, plus the differentiator
`search_org_knowledge` (hybrid vector + BM25 search).

## Configuration

```ts
new OnplanaMcpClient({
  url:        string,             // required, e.g. 'https://api.onplana.com/api/mcp/v1'
  token:      string,             // required, MCP_AGENT-scoped PAT
  fetch?:     typeof fetch,       // override for tests / non-Node runtimes
  timeoutMs?: number,             // default 30,000
})
```

For self-hosted Onplana (Enterprise+), point `url` at your backend
origin: `https://onplana.your-tenant.com/api/mcp/v1`.

## Errors

All transport / protocol errors throw `OnplanaMcpError`:

```ts
import { OnplanaMcpClient, OnplanaMcpError } from 'onplana-mcp-client'

try {
  await client.listProjects()
} catch (err) {
  if (err instanceof OnplanaMcpError) {
    console.error(`Onplana returned ${err.status} ${err.code}: ${err.message}`)
    if (err.code === 'MCP_INVALID_TOKEN')   { /* mint a new PAT */ }
    if (err.code === 'SCOPE_DENIED')        { /* PAT lacks MCP_AGENT */ }
    if (err.code === 'MCP_REQUIRES_BEARER') { /* missing Authorization header */ }
  }
}
```

Tool-level failures (validation, plan gates, idempotency hits) are
NOT thrown — they come back as `{ isError: true, output: { ... } }`
from `callTool`. Tools are designed to let an LLM see + react to
those, so the SDK preserves that semantic for symmetry.

## Compatibility

- Node.js ≥ 18 (uses ambient `fetch`)
- Modern browsers (Chrome, Firefox, Safari)
- Onplana MCP server v1.x (May 2026 onwards)

## License

[MIT](../../LICENSE)

## See also

- [Onplana's MCP server overview](https://onplana.com/mcp) — full
  tool catalog + setup instructions for Claude Desktop / Cursor
- [`onplana-mcp-server`](../server-template) — the open-source
  server template Onplana's deployment is built on
- [Model Context Protocol specification](https://spec.modelcontextprotocol.io)
