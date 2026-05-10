/**
 * End-to-end test against the in-memory example dispatcher. Verifies
 * that a tools/list request and a tools/call('echo') request both
 * work through the real Express + MCP SDK stack.
 *
 * We don't drive the MCP SDK client here (would add another runtime
 * dep); instead we POST the raw JSON-RPC envelopes the spec defines,
 * which is exactly what production MCP clients do over the wire.
 * supertest gives us the HTTP layer for free.
 */
import { describe, it, expect } from 'vitest'
import express from 'express'
import request from 'supertest'
import {
  createMcpPostHandler,
  createMcpMethodNotAllowedHandler,
  requireBearerAuth,
  USER_CONTENT_OPEN,
  USER_CONTENT_CLOSE,
  type Dispatcher,
} from '../src/index.js'

const dispatcher: Dispatcher = {
  async listTools() {
    return [
      {
        name: 'echo',
        description: 'Echo a message back.',
        inputSchema: {
          type: 'object',
          properties: { message: { type: 'string' } },
          required: ['message'],
        },
      },
    ]
  },
  async callTool(name, input) {
    if (name !== 'echo') return { isError: true, output: { error: 'unknown' } }
    return { output: { said: (input as { message: string }).message } }
  },
}

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use(
    '/mcp',
    requireBearerAuth({
      auth: async (raw) =>
        raw === 'good-token' ? { userId: 'u', scopes: ['MCP_AGENT'] } : null,
      requiredScope: 'MCP_AGENT',
    }),
  )
  app.post('/mcp',   createMcpPostHandler({ dispatcher }))
  app.get('/mcp',    createMcpMethodNotAllowedHandler())
  app.delete('/mcp', createMcpMethodNotAllowedHandler())
  return app
}

const HEADERS = {
  // The MCP Streamable HTTP transport requires BOTH content types in
  // the Accept header — sending only application/json gets a 406
  // "Not Acceptable" error from the SDK. Real MCP clients (Claude
  // Desktop, Cursor, etc.) always send both; we mirror that here.
  Accept: 'application/json, text/event-stream',
  'Content-Type': 'application/json',
}

/**
 * In stateless mode the SDK emits SSE frames even for one-shot RPC
 * calls — the response body is `event: message\ndata: <JSON>\n\n`
 * rather than a JSON-only body. supertest sees text/event-stream as
 * the Content-Type and leaves `res.body` empty; we extract the
 * `data:` payload from `res.text` and JSON.parse it.
 *
 * Real MCP clients (the SDK Client, Claude Desktop, Cursor, MCP
 * Inspector) parse SSE natively, so this helper is a test-only
 * concern.
 */
function parseSseEnvelope(text: string): { result?: any; error?: any; id?: number } {
  // The frame may have multiple `data:` lines (streaming responses);
  // we always have a single one for non-streaming methods like
  // tools/list and tools/call.
  const m = /^data:\s*(.+)$/m.exec(text)
  if (!m) {
    throw new Error(`SSE frame missing data line. Body: ${text.slice(0, 200)}`)
  }
  return JSON.parse(m[1])
}

describe('transport — auth gate (combined with requireBearerAuth)', () => {
  const app = buildApp()

  it('rejects unauthenticated tools/list', async () => {
    const res = await request(app)
      .post('/mcp')
      .set(HEADERS)
      .send({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
    expect(res.status).toBe(401)
    expect(res.body.code).toBe('MCP_REQUIRES_BEARER')
  })

  it('rejects bad token', async () => {
    const res = await request(app)
      .post('/mcp')
      .set({ ...HEADERS, Authorization: 'Bearer wrong' })
      .send({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
    expect(res.status).toBe(401)
    expect(res.body.code).toBe('MCP_INVALID_TOKEN')
  })
})

describe('transport — tools/list', () => {
  const app = buildApp()
  const goodHeaders = { ...HEADERS, Authorization: 'Bearer good-token' }

  it('returns the dispatcher\'s tool descriptors', async () => {
    const res = await request(app)
      .post('/mcp')
      .set(goodHeaders)
      .send({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
    expect(res.status).toBe(200)
    const env = parseSseEnvelope(res.text)
    expect(env.id).toBe(1)
    expect(env.result.tools).toHaveLength(1)
    const tool = env.result.tools[0]
    expect(tool.name).toBe('echo')
    // Description was suffixed with the security system note.
    expect(tool.description).toContain('Echo a message back.')
    expect(tool.description).toContain('<onplana_user_content>')
  })
})

describe('transport — tools/call', () => {
  const app = buildApp()
  const goodHeaders = { ...HEADERS, Authorization: 'Bearer good-token' }

  it('dispatches and wraps user content in the response', async () => {
    const res = await request(app)
      .post('/mcp')
      .set(goodHeaders)
      .send({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'echo', arguments: { message: 'hi there' } },
      })
    expect(res.status).toBe(200)
    const env = parseSseEnvelope(res.text)
    expect(env.result.isError).toBe(false)
    // The content text is JSON-stringified output. The 'said' key
    // isn't in the user-content field set so it shouldn't be wrapped;
    // this verifies the wrap is precise (only fields in the set, not
    // every string in the payload).
    const text = env.result.content[0].text as string
    const parsed = JSON.parse(text)
    expect(parsed.said).toBe('hi there')
    expect(text).not.toContain(USER_CONTENT_OPEN)
  })

  it('wraps a user-text field when one is present', async () => {
    // Customise dispatcher to return a wrappable field.
    const app2 = (() => {
      const a = express()
      a.use(express.json())
      a.use('/mcp', requireBearerAuth({
        auth: async () => ({ userId: 'u', scopes: ['MCP_AGENT'] }),
      }))
      a.post('/mcp', createMcpPostHandler({
        dispatcher: {
          async listTools() { return [] },
          async callTool() {
            return { output: { title: 'My project name' } }
          },
        },
      }))
      return a
    })()

    const res = await request(app2)
      .post('/mcp')
      .set({ ...HEADERS, Authorization: 'Bearer x' })
      .send({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'whatever', arguments: {} },
      })
    expect(res.status).toBe(200)
    const env = parseSseEnvelope(res.text)
    const text = env.result.content[0].text as string
    expect(text).toContain(`${USER_CONTENT_OPEN}My project name${USER_CONTENT_CLOSE}`)
  })

  it('returns isError when the dispatcher signals one', async () => {
    const res = await request(app)
      .post('/mcp')
      .set(goodHeaders)
      .send({
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: { name: 'unknown_tool', arguments: {} },
      })
    expect(res.status).toBe(200)
    const env = parseSseEnvelope(res.text)
    expect(env.result.isError).toBe(true)
  })
})

describe('transport — method not allowed', () => {
  const app = buildApp()
  const goodHeaders = { ...HEADERS, Authorization: 'Bearer good-token' }

  it('GET returns 405', async () => {
    const res = await request(app).get('/mcp').set(goodHeaders)
    expect(res.status).toBe(405)
  })

  it('DELETE returns 405', async () => {
    const res = await request(app).delete('/mcp').set(goodHeaders)
    expect(res.status).toBe(405)
  })
})
