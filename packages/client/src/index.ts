/**
 * onplana-mcp-client — public exports.
 *
 * Typed TypeScript client for the public Onplana MCP endpoint at
 * https://api.onplana.com/api/mcp/v1. MIT licensed. See README for
 * quickstart, the dedicated /mcp page on onplana.com for the full
 * tool catalog, and the parent monorepo for the server template.
 */

export { OnplanaMcpClient } from './client.js'
export type { OnplanaMcpClientOptions } from './client.js'
export {
  OnplanaMcpError,
} from './types.js'
export type {
  McpToolDescriptor,
  McpCallToolResult,
  ProjectStatus,
  ProjectSummary,
  ListProjectsArgs,
  TaskStatus,
  TaskPriority,
  TaskSummary,
  ListTasksArgs,
  CreateTaskArgs,
  SearchScope,
  SearchOrgKnowledgeArgs,
  SearchOrgKnowledgeOutput,
  SearchMatch,
} from './types.js'
