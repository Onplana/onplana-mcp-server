# onplana-mcp-server

Open-source TypeScript MCP server template with security best
practices, extracted from [Onplana](https://onplana.com)'s production
Model Context Protocol deployment.

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](../../LICENSE)
[![npm](https://img.shields.io/npm/v/onplana-mcp-server.svg)](https://www.npmjs.com/package/onplana-mcp-server)

## What this is

A small set of utilities for building production-grade
[Model Context Protocol](https://modelcontextprotocol.io) servers in
Node.js / Express:

- **Streamable HTTP transport** wired in stateless mode (the model
  Claude Desktop, Cursor, and ChatGPT custom connectors actually use)
- **Bearer-token auth** with a pluggable validator interface
- **Prompt-injection containment** via `<onplana_user_content>` tag
  wrapping with case-insensitive closing-tag escape
- **Pluggable dispatcher interface** so your tool registry plugs in
  without entangling the transport
- Reasonable error responses (JSON-RPC envelopes, not HTML stack
  traces)

This is the platform-agnostic layer. Onplana's full production MCP
server adds plan gating, per-month tool caps, idempotency tracking,
audit logging, undo metadata, and an org-scoped cost cap on top —
all built using this same template as the foundation.

## Why a template, not a framework

The transport is the same for everyone. The dispatcher (your tool
registry, your business rules) is yours. This library does the
transport + security primitives well so you don't have to figure out
the SDK surface, stateless-mode wiring, or prompt-injection containment
patterns from scratch — and gets out of your way for the parts that
are platform-specific.

## Install

```bash
npm install github:Onplana/onplana-mcp-server @modelcontextprotocol/sdk express
```

`@modelcontextprotocol/sdk` and `express` are peer dependencies so
your application controls the versions.

## Quickstart

```ts
import express from 'express'
import {
  createMcpPostHandler,
  createMcpMethodNotAllowedHandler,
  requireBearerAuth,
  type Dispatcher,
} from 'onplana-mcp-server'

// 1. Implement your dispatcher. This is where your tool registry
//    lives. Apply plan gates, role permissions, idempotency, audit,
//    etc. here — the transport doesn't care, it just calls these
//    two methods.
const dispatcher: Dispatcher = {
  async listTools(ctx) {
    return [{
      name: 'echo',
      description: 'Echo a string back. Useful for verifying the connection.',
      inputSchema: {
        type: 'object',
        properties: { message: { type: 'string' } },
        required: ['message'],
      },
    }]
  },
  async callTool(name, input, ctx) {
    if (name === 'echo') {
      return { output: { said: (input as { message: string }).message } }
    }
    return { isError: true, output: { error: `Unknown tool: ${name}` } }
  },
}

// 2. Implement your auth validator. Look up the token in your DB,
//    OIDC provider, etc. Return the resolved context or null.
const auth = async (rawToken: string) => {
  if (rawToken === 'demo-token-123') {
    return { userId: 'user_demo', scopes: ['MCP_AGENT'] }
  }
  return null
}

// 3. Wire the Express app.
const app = express()
app.use(express.json())
app.use(
  '/api/mcp/v1',
  requireBearerAuth({ auth, requiredScope: 'MCP_AGENT' }),
)
app.post('/api/mcp/v1', createMcpPostHandler({ dispatcher }))
app.get('/api/mcp/v1', createMcpMethodNotAllowedHandler())
app.delete('/api/mcp/v1', createMcpMethodNotAllowedHandler())

app.listen(3000, () => console.log('MCP server on http://localhost:3000'))
```

Smoke test from a terminal:

```bash
curl -X POST http://localhost:3000/api/mcp/v1 \
  -H "Authorization: Bearer demo-token-123" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

The runnable [in-memory example](../../examples/in-memory) ships
three trivial tools (`echo`, `time_now`, `add`) and is the canonical
end-to-end demo.

## Production checklist

The template gets you running. These are patterns to add on top
that Onplana uses in its production deployment:

- **Rate limiting** per token. Agentic loops can fire hundreds of
  calls per minute. A 60–120 req/min ceiling per Bearer token
  prevents a misbehaving agent from saturating your API. The MCP
  rate limit should be stricter than your standard API limit —
  agents are noisier than humans.
- **Cost cap** at the tenant level if your tools call paid LLMs.
  The transport shouldn't know about cost; your dispatcher's
  `callTool` should pre-flight-check tenant spend and return
  `isError: true` with a clear over-cap message if exceeded.
- **Audit logging.** Every `callTool` should write an audit row with
  the resolved AuthContext + tool name + input hash + status
  (APPLIED / FAILED / REJECTED). Treats agent-driven actions as
  first-class events, not transport-level noise.
- **Plan / scope curation.** Don't expose every tool you ship. The
  in-app version of a tool may have UI affordances (preview
  rendering, confirmation dialogs) that an external agent doesn't
  have. Curate to the subset that's safe for unsupervised
  invocation. Onplana exposes 21 of 26 tools.
- **PREVIEW mode for risky mutations.** A `delete_*` tool dispatched
  by an LLM can do real damage. Pattern: dispatcher returns a
  PREVIEW result on FREE / STARTER plans (or for any tool whose
  destructiveness exceeds a threshold), the agent shows the user
  what it would do, the user re-issues with `confirmation: true` for
  the actual apply. Onplana ships this as a default-on safety.
- **Idempotency keys.** A model retrying the same logical action
  shouldn't create two projects. Hash the canonicalised input,
  store `(conversation_id, idempotency_key)` as a unique constraint,
  return the cached result on dedup hits.

The template doesn't enforce any of these because they're platform-
specific. Use them as a checklist when implementing your dispatcher.

## API

### `createMcpPostHandler(opts)`

Builds the Express handler for POST `/api/mcp/v1`.

```ts
interface CreateMcpHandlerOptions {
  dispatcher:        Dispatcher
  serverInfo?:       { name: string; version: string }
  promptInjection?:  WrapOptions   // override field set
  appendSystemNote?: boolean       // default true
}
```

### `requireBearerAuth(opts)`

Express middleware that extracts a Bearer token, validates it, and
populates `req.mcpAuth` with the resolved `AuthContext`.

```ts
interface RequireBearerAuthOptions {
  auth:           BearerAuth                  // your validator
  requiredScope?: string                      // optional gate
}

type BearerAuth = (rawToken: string) => Promise<AuthContext | null>
```

Rejection codes: `MCP_REQUIRES_BEARER` (no header), `MCP_INVALID_TOKEN`
(validator returned null), `SCOPE_DENIED` (token valid but lacks
scope), `AUTH_BACKEND_ERROR` (validator threw).

### `Dispatcher` interface

```ts
interface Dispatcher {
  listTools(ctx: AuthContext): Promise<DispatchedTool[]>
  callTool(name: string, input: unknown, ctx: AuthContext): Promise<ToolCallResult>
}
```

### `wrapUserContent(value, opts?)`

Recursive walker that wraps user-text fields in
`<onplana_user_content>...</onplana_user_content>` with closing-tag
escape. Default fields: `name`, `title`, `description`, `content`,
`goal`, `recommendation`, `message`. Override via `WrapOptions.userContentFields`.

## Compatibility

- Node.js ≥ 20
- `@modelcontextprotocol/sdk@^1.29.0`
- `express@^4.18.0` or `express@^5.0.0`

Tested with Claude Desktop, Cursor, ChatGPT custom connectors (where
MCP is enabled), and the official MCP Inspector.

## License

[MIT](../../LICENSE)

## See also

- [Onplana's MCP server](https://onplana.com/mcp) — the canonical
  consumer of this template
- [Model Context Protocol specification](https://spec.modelcontextprotocol.io)
- [Anthropic's prompt-injection guidance](https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/overview)
