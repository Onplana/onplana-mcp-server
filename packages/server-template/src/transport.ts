/**
 * MCP Streamable HTTP transport — stateless mode.
 *
 * The handler factory creates a fresh `Server` + `StreamableHTTPServer
 * Transport` pair per HTTP request. No in-memory session state. Auth
 * + tenant context live entirely on `req` via the auth middleware
 * (see auth.ts). This is the model the official SDK example
 * `simpleStatelessStreamableHttp` uses, adapted for production with:
 *
 *   - Pluggable dispatcher (see dispatcher.ts)
 *   - Prompt-injection containment on every tool result
 *   - Automatic system-note suffix on every tool description
 *   - Clean 405 responses on GET / DELETE (no resumable streams)
 *   - Internal error handling that surfaces JSON-RPC envelopes,
 *     not HTML stack traces
 *
 * Why stateless: per-request server creation lets us use Express
 * middleware (auth, rate limiting, request logging) the same way as
 * any other route. Stateful MCP would need in-memory session
 * management that doesn't survive process restarts and complicates
 * horizontal scaling. Streamable HTTP in stateless mode handles
 * everything current MCP clients (Claude Desktop, Cursor, ChatGPT
 * custom connectors, MCP Inspector) actually use.
 *
 * Why per-request server: the SDK's tool registration is per-server-
 * instance. Doing it once at boot would mean tools/list returns the
 * same set for every caller — but in production you want per-caller
 * filtering (plan tier, role permission). Per-request lets the
 * dispatcher's `listTools(ctx)` reflect the actual auth context.
 *
 * Performance note: per-request `new Server()` + `setRequestHandler`
 * is cheap (microseconds). The cost is dominated by the dispatcher's
 * own DB queries; SDK construction is noise.
 */

import type { Request, Response, RequestHandler } from 'express'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import type { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import type { Dispatcher, AuthContext } from './dispatcher.js'
import { getAuthContext } from './auth.js'
import { wrapUserContent, SYSTEM_NOTE_SUFFIX, type WrapOptions } from './promptInjection.js'

export interface CreateMcpHandlerOptions {
  /**
   * The platform's dispatcher implementation. Receives the
   * resolved AuthContext on every list/call so the dispatcher can
   * scope visibility + execution per caller.
   */
  dispatcher: Dispatcher
  /**
   * Server identity emitted in the MCP `initialize` response.
   * Defaults to `{ name: 'mcp-server', version: '0.0.0' }`.
   */
  serverInfo?: { name: string; version: string }
  /**
   * Override the user-content field set used by `wrapUserContent`.
   * Default covers `name`, `title`, `description`, `content`, etc.
   * Pass your own Set if your platform's tool outputs use different
   * field names for end-user-supplied text.
   */
  promptInjection?: WrapOptions
  /**
   * Append the security system note to every tool description.
   * Default: true. Disable only if you have a different prompt-
   * injection containment strategy that doesn't use the wrap.
   */
  appendSystemNote?: boolean
}

/**
 * Build an Express handler for POST `<base>/`. Mount AFTER your auth
 * middleware so `req.mcpAuth` is populated.
 *
 *     app.use('/api/mcp/v1',
 *       requireBearerAuth({ auth: lookupToken, requiredScope: 'MCP_AGENT' }),
 *       createMcpPostHandler({ dispatcher: myDispatcher }),
 *     )
 *
 * The handler accepts JSON-RPC bodies. Express's built-in
 * `express.json()` middleware must be installed upstream so
 * `req.body` is parsed.
 */
export function createMcpPostHandler(opts: CreateMcpHandlerOptions): RequestHandler {
  const {
    dispatcher,
    serverInfo = { name: 'mcp-server', version: '0.0.0' },
    promptInjection,
    appendSystemNote = true,
  } = opts

  return async (req: Request, res: Response) => {
    let ctx: AuthContext
    try {
      ctx = getAuthContext(req)
    } catch (err) {
      res.status(500).json({
        jsonrpc: '2.0',
        error:   { code: -32603, message: (err as Error).message },
        id:      null,
      })
      return
    }

    const server = new Server(
      { name: serverInfo.name, version: serverInfo.version },
      { capabilities: { tools: {} } },
    )

    server.setRequestHandler(ListToolsRequestSchema, async () => {
      const visible = await dispatcher.listTools(ctx)
      const tools: Tool[] = visible.map(t => ({
        name:        t.name,
        description: appendSystemNote
          ? t.description + SYSTEM_NOTE_SUFFIX
          : t.description,
        inputSchema: t.inputSchema,
      }))
      return { tools }
    })

    server.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
      const toolName = request.params.name
      const input    = request.params.arguments ?? {}

      let result
      try {
        result = await dispatcher.callTool(toolName, input, ctx)
      } catch (err) {
        return {
          isError: true,
          content: [{
            type: 'text',
            text: `Tool dispatch failed: ${(err as Error).message}`,
          }],
        }
      }

      const wrapped = wrapUserContent(result.output, promptInjection)
      const callResult: CallToolResult = {
        isError: !!result.isError,
        content: [{
          type: 'text',
          text: JSON.stringify(wrapped, null, 2),
        }],
      }

      // Surface compensation metadata via _meta so MCP clients with
      // undo affordances can act on it without inspecting the body.
      if (result.compensatesWith) {
        callResult._meta = {
          'compensates_with':   result.compensatesWith,
          'compensation_input': result.compensationInput,
        }
      }

      return callResult
    })

    try {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,   // stateless mode
      })
      await server.connect(transport)
      await transport.handleRequest(req, res, req.body)

      res.on('close', () => {
        transport.close().catch(() => { /* best-effort */ })
        server.close().catch(() => { /* best-effort */ })
      })
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[mcp-server-template] transport error:', (err as Error).message)
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error:   { code: -32603, message: 'Internal MCP error' },
          id:      null,
        })
      }
    }
  }
}

/**
 * Convenience: GET / DELETE handlers that return clean 405 responses.
 * Mount these alongside the POST handler so MCP clients that try the
 * other verbs get a proper error rather than a 404.
 */
export function createMcpMethodNotAllowedHandler(): RequestHandler {
  return (_req, res) => {
    res.status(405).json({
      jsonrpc: '2.0',
      error:   { code: -32000, message: 'Method not allowed. Use POST.' },
      id:      null,
    })
  }
}
