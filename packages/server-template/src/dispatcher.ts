/**
 * Pluggable contract that a host platform implements to plug its tool
 * registry into the MCP transport.
 *
 * Why this layer exists: the transport (Streamable HTTP wiring,
 * stateless mode, prompt-injection containment) is platform-agnostic;
 * the actual tool catalog isn't. A `Dispatcher` is the seam between
 * them.
 *
 * Two responsibilities:
 *
 *   1. `listTools(ctx)` — return the tool descriptors the caller is
 *      allowed to see. Filter by plan tier, role permission, feature
 *      flag, whatever your platform's gating model is. The MCP client
 *      only ever sees what this returns.
 *
 *   2. `callTool(name, input, ctx)` — execute a tool. Apply the same
 *      enforcement on the call path (callers can construct any tool
 *      name, even one that wasn't in `listTools`'s output). Return a
 *      `ToolCallResult` that the transport will JSON-stringify into
 *      an MCP `CallToolResult.content[0].text`.
 *
 * The transport handles auth + transport-level errors. The dispatcher
 * handles application-level concerns (plan gates, idempotency,
 * audit, undo metadata). Onplana's closed-source dispatcher is a
 * single ~600-LOC choke point that does all of those uniformly. Yours
 * can be much smaller.
 */

/**
 * Whatever your auth layer resolved from the Bearer token. The
 * dispatcher receives this and uses it to scope tool execution to the
 * caller's tenant / user / role.
 *
 * The shape is intentionally loose — `userId` and `scopes` are the
 * minimum useful metadata; everything else is platform-specific
 * (orgId, planTier, featureFlags, etc.) and lives in the index
 * signature. Cast to your platform's specific shape inside your
 * dispatcher implementation.
 */
export interface AuthContext {
  /** Caller's user identity. */
  userId: string
  /**
   * Granted scopes. The transport checks scope membership via
   * `requireBearerAuth({ requiredScope })`; downstream dispatchers
   * may inspect `scopes` for fine-grained gates if they want.
   */
  scopes: string[]
  /** Platform-specific extension fields (orgId, planTier, etc.). */
  [key: string]: unknown
}

/**
 * Tool descriptor returned by `listTools`. Same shape MCP clients
 * receive in `tools/list` responses, minus the protocol envelope.
 *
 * `inputSchema` is JSON Schema (subset). MCP requires the top-level
 * type to be "object"; properties + required follow standard JSON
 * Schema conventions. The MCP SDK handles the wire format; we just
 * need to emit the right shape here.
 */
export interface DispatchedTool {
  name:        string
  description: string
  inputSchema: {
    type:       'object'
    /**
     * Property descriptors. Values are JSON Schema property objects
     * (e.g. `{ type: 'string', description: 'message text' }`) — typed
     * here as `object` rather than the looser `unknown` so the shape
     * matches the upstream `@modelcontextprotocol/sdk` `Tool` schema
     * exactly. JSON Schema property values are always objects in
     * practice; the narrower type is correct AND interoperable.
     */
    properties?: Record<string, object>
    required?:   string[]
    additionalProperties?: boolean
    [k: string]: unknown
  }
}

/**
 * Tool execution result. The transport wraps this into the MCP
 * `CallToolResult.content` array as a JSON-stringified text block —
 * the simplest interop shape, accepted uniformly by current Claude
 * Desktop / Cursor / ChatGPT custom connectors / MCP Inspector
 * clients.
 *
 * Set `isError: true` to surface a non-fatal failure to the model
 * (e.g. "tool input was malformed; please retry with a valid id");
 * the model will see the error and can re-plan rather than abort the
 * conversation. Throwing from `callTool` instead is appropriate for
 * unrecoverable errors (DB down, etc.) — the transport surfaces
 * those as JSON-RPC errors with HTTP 500.
 *
 * `compensatesWith` + `compensationInput` are optional — Onplana uses
 * them to support "undo last AI action" UI; if your platform has no
 * undo flow, ignore them. The transport doesn't act on these fields
 * itself; they're returned in `_meta` so consumers can build undo
 * flows on top.
 */
export interface ToolCallResult {
  output:             unknown
  isError?:           boolean
  /** Name of a compensating tool, if this action is reversible. */
  compensatesWith?:   string
  /** Input to pass to the compensating tool. */
  compensationInput?: unknown
}

/**
 * The dispatcher contract. Implement this to wire your tool registry
 * into the MCP transport. The in-memory example
 * (`examples/in-memory`) ships a 3-tool toy implementation showing
 * the minimum shape; production implementations like Onplana's add
 * plan gating, idempotency, per-month caps, audit rows, etc.
 *
 * Both methods receive the auth context resolved by the auth layer,
 * so you can scope every operation by tenant/user/role.
 */
export interface Dispatcher {
  /**
   * Return the tool descriptors visible to this caller. Apply
   * plan/permission filtering here so the MCP client never sees
   * tools it can't call. An LLM that doesn't see a tool can't
   * blindly invoke it and waste turns on 403s.
   */
  listTools(ctx: AuthContext): Promise<DispatchedTool[]>

  /**
   * Execute a tool. Re-apply the listTools filter — never trust
   * that the caller only invokes what was advertised. Return a
   * ToolCallResult; throw only for unrecoverable errors.
   */
  callTool(name: string, input: unknown, ctx: AuthContext): Promise<ToolCallResult>
}
