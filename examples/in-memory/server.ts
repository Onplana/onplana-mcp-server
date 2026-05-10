/**
 * In-memory MCP server demo. Three trivial tools, hardcoded auth.
 * Runs without any database, queue, or external dependency. Use this
 * to verify the onplana-mcp-server template works end-to-end before
 * plugging in your real dispatcher and auth.
 *
 *   npm install
 *   npm run start
 *   # then in another terminal:
 *   curl -X POST http://localhost:3000/api/mcp/v1 \
 *     -H "Authorization: Bearer demo-token-abc123" \
 *     -H "Content-Type: application/json" \
 *     -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
 *
 * Or point Claude Desktop's Custom Connector at the URL with the
 * demo token in the Authorization header — Claude can chat with this
 * server's three tools.
 */
import express from 'express'
import {
  createMcpPostHandler,
  createMcpMethodNotAllowedHandler,
  requireBearerAuth,
  type Dispatcher,
} from 'onplana-mcp-server'

// ─── Dispatcher: 3 toy tools ────────────────────────────────────────

const dispatcher: Dispatcher = {
  async listTools() {
    return [
      {
        name: 'echo',
        description: 'Echo a message back. Useful for verifying the connection works.',
        inputSchema: {
          type: 'object',
          properties: { message: { type: 'string', description: 'String to echo back.' } },
          required: ['message'],
        },
      },
      {
        name: 'time_now',
        description: 'Return the current server time as an ISO 8601 string. Takes no arguments.',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'add',
        description: 'Add two numbers and return the sum.',
        inputSchema: {
          type: 'object',
          properties: {
            a: { type: 'number' },
            b: { type: 'number' },
          },
          required: ['a', 'b'],
        },
      },
    ]
  },

  async callTool(name, input) {
    switch (name) {
      case 'echo': {
        const msg = (input as { message: string }).message
        return { output: { said: msg } }
      }
      case 'time_now': {
        return { output: { now: new Date().toISOString() } }
      }
      case 'add': {
        const { a, b } = input as { a: number; b: number }
        return { output: { sum: a + b } }
      }
      default:
        return {
          isError: true,
          output:  { error: `Unknown tool: ${name}` },
        }
    }
  },
}

// ─── Auth: hardcoded for demo. Replace with your real validator. ───

const auth = async (rawToken: string) => {
  // Anything starting with `demo-` resolves to a fixed user. In real
  // deployments this calls into your token store (DB, Redis, OIDC
  // introspection, etc.) — see auth.ts in the package source for the
  // pluggable contract.
  if (rawToken.startsWith('demo-')) {
    return {
      userId: 'user_demo',
      scopes: ['MCP_AGENT'],
    }
  }
  return null
}

// ─── Express wiring ────────────────────────────────────────────────

const app = express()
app.use(express.json({ limit: '4mb' }))

app.use('/api/mcp/v1', requireBearerAuth({ auth, requiredScope: 'MCP_AGENT' }))
app.post('/api/mcp/v1',   createMcpPostHandler({
  dispatcher,
  serverInfo: { name: 'onplana-mcp-example', version: '0.1.0' },
}))
app.get('/api/mcp/v1',    createMcpMethodNotAllowedHandler())
app.delete('/api/mcp/v1', createMcpMethodNotAllowedHandler())

// Friendly root page so accidentally hitting / in a browser doesn't 404.
app.get('/', (_req, res) => {
  res.type('text/plain').send(
    'In-memory MCP demo. POST /api/mcp/v1 with Authorization: Bearer demo-token-* to interact.\n',
  )
})

const PORT = Number(process.env.PORT ?? 3000)
app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`MCP demo listening on http://localhost:${PORT}/api/mcp/v1`)
})
