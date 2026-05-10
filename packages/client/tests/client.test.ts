/**
 * Unit tests for OnplanaMcpClient. Drives a stub fetch so we don't
 * need a live MCP endpoint. Verifies:
 *
 *   - JSON-RPC envelopes are constructed correctly
 *   - Authorization header carries the Bearer token
 *   - Successful responses return the parsed `output` shape
 *   - Tool-level isError flags propagate
 *   - HTTP errors → OnplanaMcpError with status + code
 *   - Network errors → OnplanaMcpError with status: null
 *   - Convenience methods unwrap their canonical output shape
 */
import { describe, it, expect } from 'vitest'
import { OnplanaMcpClient, OnplanaMcpError } from '../src/index.js'

interface StubCall {
  url:    string
  init:   RequestInit
}

function makeStubFetch(handler: (call: StubCall) => Response | Promise<Response>) {
  const calls: StubCall[] = []
  const fn = async (url: string | URL, init?: RequestInit) => {
    const call = { url: String(url), init: init ?? {} }
    calls.push(call)
    return handler(call)
  }
  return Object.assign(fn as unknown as typeof fetch, { _calls: calls })
}

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
}

describe('OnplanaMcpClient — construction', () => {
  it('throws when url is missing', () => {
    expect(() => new OnplanaMcpClient({ url: '', token: 't' })).toThrow(/url is required/)
  })

  it('throws when token is missing', () => {
    expect(() => new OnplanaMcpClient({ url: 'https://x', token: '' })).toThrow(/token is required/)
  })

  it('strips trailing slash from url', async () => {
    const stub = makeStubFetch(() => jsonResponse({ jsonrpc: '2.0', id: 1, result: { tools: [] } }))
    const client = new OnplanaMcpClient({
      url:   'https://api.onplana.com/api/mcp/v1/',
      token: 'pat_x',
      fetch: stub,
    })
    await client.listTools()
    expect(stub._calls[0].url).toBe('https://api.onplana.com/api/mcp/v1')
  })
})

describe('OnplanaMcpClient — JSON-RPC envelope', () => {
  it('sends method + params with Bearer header', async () => {
    let captured: StubCall | null = null
    const stub = makeStubFetch((c) => {
      captured = c
      return jsonResponse({ jsonrpc: '2.0', id: 1, result: { tools: [] } })
    })
    const client = new OnplanaMcpClient({ url: 'https://x', token: 'pat_xyz', fetch: stub })
    await client.callTool('list_projects', { status: 'ACTIVE' })

    expect(captured!.init.method).toBe('POST')
    expect((captured!.init.headers as Record<string, string>).Authorization).toBe('Bearer pat_xyz')
    expect((captured!.init.headers as Record<string, string>)['Content-Type']).toBe('application/json')
    const body = JSON.parse(captured!.init.body as string)
    expect(body.jsonrpc).toBe('2.0')
    expect(body.method).toBe('tools/call')
    expect(body.params.name).toBe('list_projects')
    expect(body.params.arguments).toEqual({ status: 'ACTIVE' })
    expect(typeof body.id).toBe('number')
  })

  it('omits params for methods that don\'t need them (tools/list)', async () => {
    let captured: StubCall | null = null
    const stub = makeStubFetch((c) => {
      captured = c
      return jsonResponse({ jsonrpc: '2.0', id: 1, result: { tools: [] } })
    })
    const client = new OnplanaMcpClient({ url: 'https://x', token: 'pat', fetch: stub })
    await client.listTools()

    const body = JSON.parse(captured!.init.body as string)
    expect(body.method).toBe('tools/list')
    expect(body).not.toHaveProperty('params')
  })
})

describe('OnplanaMcpClient — listTools', () => {
  it('returns the tool descriptor array', async () => {
    const stub = makeStubFetch(() =>
      jsonResponse({
        jsonrpc: '2.0',
        id: 1,
        result: {
          tools: [
            { name: 'list_projects', description: 'List…', inputSchema: { type: 'object' } },
            { name: 'create_task',   description: 'Create…', inputSchema: { type: 'object' } },
          ],
        },
      }),
    )
    const client = new OnplanaMcpClient({ url: 'https://x', token: 't', fetch: stub })
    const tools = await client.listTools()
    expect(tools).toHaveLength(2)
    expect(tools[0].name).toBe('list_projects')
  })

  it('returns [] when result.tools is missing', async () => {
    const stub = makeStubFetch(() => jsonResponse({ jsonrpc: '2.0', id: 1, result: {} }))
    const client = new OnplanaMcpClient({ url: 'https://x', token: 't', fetch: stub })
    expect(await client.listTools()).toEqual([])
  })
})

describe('OnplanaMcpClient — callTool', () => {
  it('parses the JSON-stringified text content', async () => {
    const stub = makeStubFetch(() =>
      jsonResponse({
        jsonrpc: '2.0',
        id: 1,
        result: {
          isError: false,
          content: [{ type: 'text', text: JSON.stringify({ projects: [{ id: 'p1', name: 'X' }] }) }],
        },
      }),
    )
    const client = new OnplanaMcpClient({ url: 'https://x', token: 't', fetch: stub })
    const { output, isError } = await client.callTool<{ projects: { id: string; name: string }[] }>(
      'list_projects',
      {},
    )
    expect(isError).toBe(false)
    expect(output.projects[0]).toEqual({ id: 'p1', name: 'X' })
  })

  it('propagates isError from the dispatcher', async () => {
    const stub = makeStubFetch(() =>
      jsonResponse({
        jsonrpc: '2.0',
        id: 1,
        result: {
          isError: true,
          content: [{ type: 'text', text: JSON.stringify({ error: 'plan-gated' }) }],
        },
      }),
    )
    const client = new OnplanaMcpClient({ url: 'https://x', token: 't', fetch: stub })
    const { isError, output } = await client.callTool<{ error: string }>('move_task_to_sprint', {})
    expect(isError).toBe(true)
    expect(output.error).toBe('plan-gated')
  })

  it('falls back gracefully when text content is non-JSON', async () => {
    const stub = makeStubFetch(() =>
      jsonResponse({
        jsonrpc: '2.0',
        id: 1,
        result: { isError: false, content: [{ type: 'text', text: 'plain string' }] },
      }),
    )
    const client = new OnplanaMcpClient({ url: 'https://x', token: 't', fetch: stub })
    const { output } = await client.callTool('something', {})
    expect(output).toBe('plain string')
  })
})

describe('OnplanaMcpClient — convenience methods', () => {
  it('listProjects unwraps result.projects', async () => {
    const stub = makeStubFetch(() =>
      jsonResponse({
        jsonrpc: '2.0',
        id: 1,
        result: {
          isError: false,
          content: [{ type: 'text', text: JSON.stringify({ projects: [{ id: 'a', name: 'X', status: 'ACTIVE' }] }) }],
        },
      }),
    )
    const client = new OnplanaMcpClient({ url: 'https://x', token: 't', fetch: stub })
    const out = await client.listProjects({ status: 'ACTIVE' })
    expect(out).toHaveLength(1)
    expect(out[0].name).toBe('X')
  })

  it('searchOrgKnowledge returns matches[]', async () => {
    const stub = makeStubFetch(() =>
      jsonResponse({
        jsonrpc: '2.0',
        id: 1,
        result: {
          isError: false,
          content: [{
            type: 'text',
            text: JSON.stringify({
              matches: [
                { entityType: 'TASK', entityId: 't1', similarity: 0.82, snippet: 'Aurora migration plan' },
              ],
            }),
          }],
        },
      }),
    )
    const client = new OnplanaMcpClient({ url: 'https://x', token: 't', fetch: stub })
    const { matches } = await client.searchOrgKnowledge({ query: 'aurora', scope: 'tasks' })
    expect(matches).toHaveLength(1)
    expect(matches[0].similarity).toBe(0.82)
  })
})

describe('OnplanaMcpClient — error handling', () => {
  it('throws OnplanaMcpError on 401 with status + code', async () => {
    const stub = makeStubFetch(() =>
      jsonResponse(
        { error: 'Invalid token', code: 'MCP_INVALID_TOKEN' },
        { status: 401 },
      ),
    )
    const client = new OnplanaMcpClient({ url: 'https://x', token: 'bad', fetch: stub })
    await expect(client.listTools()).rejects.toMatchObject({
      name:   'OnplanaMcpError',
      status: 401,
      code:   'MCP_INVALID_TOKEN',
    })
  })

  it('throws OnplanaMcpError on 403 SCOPE_DENIED', async () => {
    const stub = makeStubFetch(() =>
      jsonResponse(
        { error: 'Token scope insufficient. Required: MCP_AGENT', code: 'SCOPE_DENIED' },
        { status: 403 },
      ),
    )
    const client = new OnplanaMcpClient({ url: 'https://x', token: 't', fetch: stub })
    await expect(client.listTools()).rejects.toMatchObject({ status: 403, code: 'SCOPE_DENIED' })
  })

  it('throws OnplanaMcpError with status: null on network error', async () => {
    const stub = makeStubFetch(() => { throw new Error('connection refused') })
    const client = new OnplanaMcpClient({ url: 'https://x', token: 't', fetch: stub })
    await expect(client.listTools()).rejects.toMatchObject({
      name:    'OnplanaMcpError',
      status:  null,
      message: /Network error.*connection refused/,
    })
  })

  it('throws when JSON-RPC envelope contains an error', async () => {
    const stub = makeStubFetch(() =>
      jsonResponse({ jsonrpc: '2.0', id: 1, error: { code: -32603, message: 'Internal MCP error' } }),
    )
    const client = new OnplanaMcpClient({ url: 'https://x', token: 't', fetch: stub })
    await expect(client.listTools()).rejects.toBeInstanceOf(OnplanaMcpError)
  })

  it('throws when response has neither result nor error', async () => {
    const stub = makeStubFetch(() => jsonResponse({ jsonrpc: '2.0', id: 1 }))
    const client = new OnplanaMcpClient({ url: 'https://x', token: 't', fetch: stub })
    await expect(client.listTools()).rejects.toThrow(/neither `result` nor `error`/)
  })
})
