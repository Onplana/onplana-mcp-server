/**
 * onplana-mcp-server — public exports.
 *
 * Open-source TypeScript MCP server template, extracted from the
 * Onplana platform's production MCP deployment. Implements the
 * Streamable HTTP transport in stateless mode with Bearer auth,
 * prompt-injection containment, and a pluggable dispatcher
 * interface. MIT licensed.
 *
 *   • Transport: Streamable HTTP + stateless mode + clean 405s
 *   • Auth: Bearer-token middleware with pluggable validator
 *   • Prompt-injection: wrapUserContent() + system note suffix
 *   • Dispatcher: pluggable contract for your tool registry
 *
 * Quickstart at examples/in-memory.
 */

export type {
  AuthContext,
  Dispatcher,
  DispatchedTool,
  ToolCallResult,
} from './dispatcher.js'

export type {
  BearerAuth,
  RequireBearerAuthOptions,
} from './auth.js'

export {
  requireBearerAuth,
  getAuthContext,
} from './auth.js'

export type {
  CreateMcpHandlerOptions,
} from './transport.js'

export {
  createMcpPostHandler,
  createMcpMethodNotAllowedHandler,
} from './transport.js'

export type { WrapOptions } from './promptInjection.js'

export {
  wrapUserContent,
  USER_CONTENT_OPEN,
  USER_CONTENT_CLOSE,
  ESCAPED_CLOSE,
  SYSTEM_NOTE_SUFFIX,
  DEFAULT_USER_CONTENT_FIELDS,
} from './promptInjection.js'
