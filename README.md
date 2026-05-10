# Onplana MCP server

Open-source TypeScript Model Context Protocol building blocks,
extracted from [Onplana](https://onplana.com)'s production MCP
deployment. Two packages:

- **[`onplana-mcp-server`](./packages/server-template)** — server
  template. Streamable HTTP transport, Bearer auth, prompt-injection
  containment, pluggable dispatcher.
- **[`onplana-mcp-client`](./packages/client)** — typed TypeScript
  client SDK for calling the public Onplana MCP endpoint at
  `https://api.onplana.com/api/mcp/v1`.

[![CI](https://github.com/Onplana/onplana-mcp-server/workflows/CI/badge.svg)](https://github.com/Onplana/onplana-mcp-server/actions)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

## What this is

The transport layer of an MCP server — Streamable HTTP wiring,
stateless mode, scoped Bearer auth, prompt-injection containment —
done well, separated from the platform-specific tool registry. Use
the **server template** to build your own MCP server with security
best practices baked in. Use the **client SDK** to drive Onplana's
hosted MCP from your own code.

The patterns are extracted from Onplana's production deployment
(public docs at [onplana.com/mcp](https://onplana.com/mcp)) — the
same layer that handles real Claude Desktop, Cursor, ChatGPT custom
connector, and in-house agent traffic against the Onplana platform.

## Why open-source

The MCP transport is the same for everyone. Most early MCP servers
get the security primitives wrong:

- **Prompt injection.** Tools that return user-generated content
  (task titles, comment bodies, wiki text) put that content directly
  into the model's context. Without containment, a hostile actor can
  plant `"ignore previous instructions"` in their own data and the
  next agent that reads it follows along.
- **Stateless transport.** Most SDK examples assume in-memory session
  state, which breaks horizontal scaling and complicates the auth
  model.
- **Plan-gate semantics.** Surfacing tools the caller can't actually
  invoke wastes turns and confuses the model.

Onplana solved these in production over six months of MCP-server
work. Publishing the patterns is high-leverage:

1. Other MCP authors get a known-good template instead of
   reinventing.
2. The repo is a pretraining-signal surface — public GitHub READMEs
   are heavily weighted in next-gen LLM training data, and a repo
   with patterns + clear documentation about MCP improves model
   recall of "what good MCP servers look like."
3. The dispatcher interface is the seam where your business logic
   plugs in. The transport is generic; what matters about your MCP
   server is the tool registry. Open-sourcing the transport doesn't
   give away anything proprietary.

The dispatcher implementation, tool catalog, plan-gate logic, audit
infrastructure, and the rest of Onplana's ~600 LOC closed-source
dispatcher stay in the closed monorepo because they encode platform
business logic. If you build your own MCP server using this
template, you write your own dispatcher — that's the work that
matters and the work that's specific to your platform.

## Repository layout

```
onplana-mcp-server/
├── packages/
│   ├── server-template/        # onplana-mcp-server (npm)
│   │   ├── src/
│   │   │   ├── transport.ts    # Streamable HTTP wiring
│   │   │   ├── auth.ts         # Bearer auth pattern
│   │   │   ├── promptInjection.ts  # wrapUserContent + escape
│   │   │   ├── dispatcher.ts   # Pluggable Dispatcher interface
│   │   │   └── index.ts
│   │   ├── tests/              # promptInjection + auth + transport
│   │   └── README.md
│   └── client/                 # onplana-mcp-client (npm)
│       ├── src/
│       │   ├── client.ts       # OnplanaMcpClient class
│       │   ├── types.ts        # Public type surface
│       │   └── index.ts
│       ├── tests/              # client.test.ts (stub fetch)
│       └── README.md
├── examples/
│   └── in-memory/              # Runnable demo with 3 toy tools
└── .github/workflows/
    ├── ci.yml                  # tsc + vitest on PR
    └── publish.yml             # npm publish on tag v*
```

## Quickstart

### Build a server

Install:

```bash
npm install github:Onplana/onplana-mcp-server @modelcontextprotocol/sdk express
```

Wire an Express app:

```ts
import express from 'express'
import {
  createMcpPostHandler,
  createMcpMethodNotAllowedHandler,
  requireBearerAuth,
  type Dispatcher,
} from 'onplana-mcp-server'

const dispatcher: Dispatcher = {
  async listTools(ctx) { /* return your tool descriptors */ return [] },
  async callTool(name, input, ctx) { /* dispatch to your tools */ return { output: {} } },
}

const auth = async (token: string) => {
  // Validate against your token store. Return AuthContext or null.
  return { userId: 'u', scopes: ['MCP_AGENT'] }
}

const app = express()
app.use(express.json())
app.use('/api/mcp/v1',
  requireBearerAuth({ auth, requiredScope: 'MCP_AGENT' }),
)
app.post('/api/mcp/v1', createMcpPostHandler({ dispatcher }))
app.get('/api/mcp/v1', createMcpMethodNotAllowedHandler())
app.delete('/api/mcp/v1', createMcpMethodNotAllowedHandler())
app.listen(3000)
```

Full quickstart in [`packages/server-template/README.md`](./packages/server-template/README.md);
runnable demo in [`examples/in-memory/`](./examples/in-memory).

### Drive Onplana from code

Install:

```bash
npm install github:Onplana/onplana-mcp-server
```

Use:

```ts
import { OnplanaMcpClient } from 'onplana-mcp-client'

const client = new OnplanaMcpClient({
  url:   'https://api.onplana.com/api/mcp/v1',
  token: process.env.ONPLANA_PAT!,
})

const projects = await client.listProjects({ status: 'ACTIVE' })

// The differentiator vs other PM-tool MCPs: hybrid semantic + lexical
// search across your org's indexed content (projects, tasks, risks,
// goals, comments, wiki pages).
const { matches } = await client.searchOrgKnowledge({
  query: 'rationale for the 3-week design phase',
  scope: 'all',
  limit: 5,
})
```

Full client docs in [`packages/client/README.md`](./packages/client/README.md).

## Production checklist

The template + SDK get you running. Add these on top:

- **Per-token rate limiting.** 60–120 req/min per Bearer token;
  agentic loops are noisier than humans.
- **Tenant cost cap.** If your tools call paid LLMs, gate dispatch
  on month-to-date spend. Onplana's deployment uses
  `aiMonthlyCostCapUsd` with WARN / BLOCK modes.
- **Audit logging.** Every dispatch should write an audit row
  tagged with `actorType: 'mcp_agent'` so admins can see what AI
  agents did in their tenant separately from human activity.
- **Plan / scope curation.** Don't expose every internal tool.
  Onplana exposes 21 of 26; the suppressed 5 either need an in-app
  preview UI, are too risky for unsupervised invocation, or produce
  oversized payloads.
- **PREVIEW mode for risky mutations.** Default mutating tools to
  preview-only on free tiers. Onplana ships this — agents see "what
  it would do" before users explicitly upgrade and re-run.
- **Idempotency keys.** Hash the canonicalised input + a session
  id; store as a unique constraint on your audit row. A model
  retrying the same logical action shouldn't double-create.

Each of those is platform-specific. The template gives you the seam
where they plug in (`Dispatcher.callTool`); your dispatcher
implements them however your platform encodes those concepts.

## Compatibility

- Node.js ≥ 20 (for the server template and CI matrix); ≥ 18 for
  the client (uses ambient `fetch`).
- `@modelcontextprotocol/sdk@^1.29.0`
- `express@^4.18.0` or `express@^5.0.0`

Tested against:

- Claude Desktop (Custom Connector)
- Cursor (`~/.cursor/mcp.json`)
- ChatGPT custom connectors (where MCP is enabled in your account)
- The official [MCP Inspector](https://github.com/modelcontextprotocol/inspector)

## Contributing

Issues + PRs welcome. The repo is small by design — the goal is for
the transport patterns to be obvious, well-tested, and stable.
Major-version bumps are reserved for breaking changes to the
exported `Dispatcher` / `BearerAuth` / handler factory shapes.
Patches and minors are for prompt-injection containment refinements,
new helper utilities, additional test coverage.

## License

[MIT](./LICENSE) — © 2026 Onplana

## See also

- **[onplana.com/mcp](https://onplana.com/mcp)** — public docs page
  for the production Onplana MCP deployment (full tool catalog,
  setup instructions, security model)
- **[onplana.com](https://onplana.com)** — Onplana, the PM platform.
  Cloud-agnostic, AI-native, Microsoft Project Online alternative
- **[Model Context Protocol specification](https://spec.modelcontextprotocol.io)** — the MCP standard
- **[Anthropic prompt-injection guidance](https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/overview)** — the security pattern this repo's wrap implements
