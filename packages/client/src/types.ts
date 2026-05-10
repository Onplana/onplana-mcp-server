/**
 * Public type surface for the Onplana MCP client SDK.
 *
 * Mirrors the shapes the Onplana MCP server emits today (May 2026,
 * server v1.x). When the server adds tools or fields, we extend
 * these types in a backwards-compatible way; breaking changes go
 * through a major version bump on the SDK.
 *
 * The shapes are intentionally minimal — only fields users of the
 * convenience methods care about. For the full structured payload,
 * use the generic `callTool<T>(...)` and supply your own type
 * parameter.
 */

export interface McpToolDescriptor {
  name:        string
  description: string
  inputSchema: {
    type:       'object'
    properties?: Record<string, unknown>
    required?:   string[]
    [k: string]: unknown
  }
}

export interface McpCallToolResult {
  /** True when the tool reported a non-fatal failure inline. */
  isError: boolean
  /** Raw content blocks. The first text block is the JSON-stringified
   *  tool output for current Onplana tools. */
  content: Array<{ type: string; text?: string }>
  _meta?:  Record<string, unknown>
}

// ─── Onplana-specific tool argument + output shapes ──────────────────

export type ProjectStatus =
  | 'PLANNING' | 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'CANCELLED'

export type TaskStatus =
  | 'TODO' | 'IN_PROGRESS' | 'REVIEW' | 'DONE' | 'BLOCKED'

export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

export interface ListProjectsArgs {
  status?:     ProjectStatus
  assigneeId?: string
}

export interface ProjectSummary {
  id:           string
  name:         string
  status:       ProjectStatus
  description?: string | null
}

export interface ListTasksArgs {
  projectId?:  string
  assigneeId?: string
  status?:     TaskStatus
}

export interface TaskSummary {
  id:        string
  title:     string
  status:    TaskStatus
  priority:  TaskPriority
  projectId: string
}

export interface CreateTaskArgs {
  projectId:    string
  title:        string
  description?: string
  priority?:    TaskPriority
  dueDate?:     string   // ISO 8601 / YYYY-MM-DD
  assigneeId?:  string
}

export type SearchScope =
  | 'projects' | 'tasks' | 'risks' | 'goals' | 'comments' | 'wiki' | 'all'

export interface SearchOrgKnowledgeArgs {
  query:  string
  scope?: SearchScope
  limit?: number
}

export interface SearchMatch {
  entityType: 'PROJECT' | 'TASK' | 'RISK' | 'GOAL' | 'COMMENT' | 'WIKI_PAGE'
  entityId:   string
  similarity: number
  snippet:    string
}

export interface SearchOrgKnowledgeOutput {
  matches: SearchMatch[]
}

// ─── Errors ─────────────────────────────────────────────────────────

export class OnplanaMcpError extends Error {
  /** HTTP status from the server, or null when the failure is
   *  transport-level (network error, parse failure). */
  public readonly status:    number | null
  /** Onplana error code when present (MCP_REQUIRES_PAT,
   *  SCOPE_DENIED, MCP_INVALID_TOKEN, …). */
  public readonly code:      string | null
  /** Raw upstream payload for forensics; null when not parseable. */
  public readonly responseBody?: unknown

  constructor(message: string, opts: { status?: number | null; code?: string | null; responseBody?: unknown } = {}) {
    super(message)
    this.name         = 'OnplanaMcpError'
    this.status       = opts.status ?? null
    this.code         = opts.code   ?? null
    this.responseBody = opts.responseBody
  }
}
