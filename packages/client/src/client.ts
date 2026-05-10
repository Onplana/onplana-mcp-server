/**
 * Onplana MCP client SDK.
 *
 * Use this from in-house agents, scripts, custom integrations, or
 * any context where you'd rather call typed methods than hand-roll
 * JSON-RPC envelopes against `https://api.onplana.com/api/mcp/v1`.
 *
 * Two surfaces:
 *
 *   1. Generic — `client.listTools()` / `client.callTool(name, args)`.
 *      Maps directly to the MCP wire surface; useful for any tool
 *      including ones we don't ship a typed wrapper for.
 *
 *   2. Convenience — typed wrappers around the most-used Onplana
 *      tools (`listProjects`, `searchOrgKnowledge`, `createTask`, …).
 *      Returns parsed output objects, not the raw `CallToolResult`
 *      JSON-stringified text shape.
 *
 * The SDK is dependency-free (uses `fetch` from the runtime). Works
 * in Node ≥ 18 and modern browsers. No bundled MCP SDK because the
 * client only needs to send POST /mcp requests with JSON-RPC bodies
 * — the wire format is small and stable.
 */

import {
  McpToolDescriptor,
  McpCallToolResult,
  OnplanaMcpError,
  ListProjectsArgs,
  ProjectSummary,
  ListTasksArgs,
  TaskSummary,
  CreateTaskArgs,
  SearchOrgKnowledgeArgs,
  SearchOrgKnowledgeOutput,
} from './types.js'

export interface OnplanaMcpClientOptions {
  /**
   * Base URL of the MCP endpoint, e.g. `https://api.onplana.com/api/mcp/v1`.
   * For self-hosted Onplana, point at your backend's API origin.
   */
  url: string
  /**
   * Onplana personal access token with the `MCP_AGENT` scope.
   * Mint one from `/integrations → AI Agents` in your Onplana
   * deployment (or from Settings → Developer with the same scope).
   */
  token: string
  /**
   * Override the global `fetch`. Useful for testing (inject a stub)
   * or for runtimes where `fetch` isn't ambient. Defaults to
   * `globalThis.fetch`.
   */
  fetch?: typeof fetch
  /**
   * Request timeout in milliseconds. Default 30,000 (30s) — generous
   * because some Onplana tools (`summarize_project`, RAG search)
   * call upstream LLMs that can take several seconds.
   */
  timeoutMs?: number
}

let nextRequestId = 0

export class OnplanaMcpClient {
  private readonly url: string
  private readonly token: string
  private readonly fetchImpl: typeof fetch
  private readonly timeoutMs: number

  constructor(opts: OnplanaMcpClientOptions) {
    if (!opts.url)   throw new Error('OnplanaMcpClient: url is required')
    if (!opts.token) throw new Error('OnplanaMcpClient: token is required')
    // Strip trailing slash for predictable joins; the wire endpoint
    // is the URL itself, no path append.
    this.url       = opts.url.replace(/\/+$/, '')
    this.token     = opts.token
    this.fetchImpl = opts.fetch ?? globalThis.fetch
    this.timeoutMs = opts.timeoutMs ?? 30_000

    if (!this.fetchImpl) {
      throw new Error('OnplanaMcpClient: no fetch implementation available. Pass `fetch` in the options or run on Node ≥ 18.')
    }
  }

  // ── Generic surface ────────────────────────────────────────────

  /**
   * List the tools the connected token can invoke. Onplana filters
   * by plan tier + role permission server-side, so you only see
   * tools you can actually call.
   */
  async listTools(): Promise<McpToolDescriptor[]> {
    const result = await this.rpc<{ tools: McpToolDescriptor[] }>('tools/list')
    return result.tools ?? []
  }

  /**
   * Invoke a tool. `T` is the parsed-JSON shape of the tool's
   * `output` payload — the SDK parses the first text block from the
   * MCP `CallToolResult.content` array.
   *
   * Throws `OnplanaMcpError` on transport failure or non-2xx status.
   * Returns `{ output, isError, raw }` on success — `isError: true`
   * means the tool ran but the dispatcher signalled a non-fatal
   * failure (e.g. plan-gated, validation failed, idempotency hit).
   */
  async callTool<T = unknown>(
    name: string,
    // `object` is broader than `Record<string, unknown>` and accepts
    // any structurally-typed args object (e.g. CreateTaskArgs) without
    // forcing callers to cast. JSON-serialised on the wire either way.
    args: object = {},
  ): Promise<{ output: T; isError: boolean; raw: McpCallToolResult }> {
    const raw = await this.rpc<McpCallToolResult>('tools/call', {
      name,
      arguments: args,
    })
    const text = raw.content?.[0]?.text ?? null
    let output: T
    try {
      output = text === null ? ({} as T) : (JSON.parse(text) as T)
    } catch {
      // Non-JSON text content — return as-is rather than crashing.
      output = (text as unknown) as T
    }
    return { output, isError: !!raw.isError, raw }
  }

  // ── Typed convenience methods ──────────────────────────────────

  /** List projects, optionally filtered by status / assignee. */
  async listProjects(args: ListProjectsArgs = {}): Promise<ProjectSummary[]> {
    const { output } = await this.callTool<{ projects: ProjectSummary[] }>(
      'list_projects',
      args,
    )
    return output.projects ?? []
  }

  /** Get full project detail including tasks, milestones, recent activity. */
  async getProject(projectId: string): Promise<unknown> {
    const { output } = await this.callTool('get_project', { projectId })
    return output
  }

  /** List tasks. Pass `projectId` for project-scoped or `assigneeId`
   *  for cross-project. */
  async listTasks(args: ListTasksArgs = {}): Promise<TaskSummary[]> {
    const { output } = await this.callTool<{ tasks: TaskSummary[] }>(
      'list_tasks',
      args,
    )
    return output.tasks ?? []
  }

  /** Create a task. On FREE / STARTER plans this returns a PREVIEW
   *  result (the dispatcher signals via `isError: false` but the
   *  task isn't persisted; check the raw `_meta.onplana.status`). */
  async createTask(args: CreateTaskArgs): Promise<unknown> {
    const { output } = await this.callTool('create_task', args)
    return output
  }

  /**
   * Hybrid (vector + BM25) semantic search across the org's indexed
   * content — projects, tasks, risks, goals, comments, wiki pages.
   * The differentiator vs other PM-tool MCPs.
   */
  async searchOrgKnowledge(args: SearchOrgKnowledgeArgs): Promise<SearchOrgKnowledgeOutput> {
    const { output } = await this.callTool<SearchOrgKnowledgeOutput>(
      'search_org_knowledge',
      args,
    )
    return { matches: output.matches ?? [] }
  }

  // ── Private wire layer ─────────────────────────────────────────

  private async rpc<T>(method: string, params?: unknown): Promise<T> {
    const body = {
      jsonrpc: '2.0' as const,
      id:      ++nextRequestId,
      method,
      ...(params !== undefined ? { params } : {}),
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)

    let response: Response
    try {
      response = await this.fetchImpl(this.url, {
        method:  'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type':  'application/json',
          'Accept':        'application/json, text/event-stream',
        },
        body:    JSON.stringify(body),
        signal:  controller.signal,
      })
    } catch (err) {
      throw new OnplanaMcpError(
        `Network error calling Onplana MCP: ${(err as Error).message}`,
        { status: null, code: null },
      )
    } finally {
      clearTimeout(timer)
    }

    if (!response.ok) {
      let payload: unknown = null
      try { payload = await response.json() } catch { /* ignore */ }
      const code = (payload as { code?: string } | null)?.code ?? null
      const msg  = (payload as { error?: string } | null)?.error
                   ?? `Onplana MCP returned ${response.status}`
      throw new OnplanaMcpError(msg, {
        status: response.status,
        code,
        responseBody: payload,
      })
    }

    let envelope: { result?: T; error?: { code: number; message: string } }
    try {
      envelope = await response.json()
    } catch (err) {
      throw new OnplanaMcpError(
        `Onplana MCP returned non-JSON response: ${(err as Error).message}`,
        { status: response.status },
      )
    }

    if (envelope.error) {
      throw new OnplanaMcpError(
        `Onplana MCP RPC error ${envelope.error.code}: ${envelope.error.message}`,
        { status: response.status, responseBody: envelope },
      )
    }

    if (envelope.result === undefined) {
      throw new OnplanaMcpError(
        'Onplana MCP returned an envelope with neither `result` nor `error`.',
        { status: response.status, responseBody: envelope },
      )
    }

    return envelope.result
  }
}
