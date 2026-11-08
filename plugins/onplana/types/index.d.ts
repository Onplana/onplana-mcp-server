// The "Waiting on you" pane's values: what hooks/register.tsx keeps in
// $.state for the session, declared here so `claude plugin validate` and
// `tsc` hold the module to them.

/** One task in the pane, read from the Onplana MCP server. */
export type WaitingRow = {
  id: string
  title: string
  /** The task's link in the Onplana web app, as the server returns it. */
  url: string
  project: string
  status: string
  /** YYYY-MM-DD, or null when the task has no due date. */
  dueDate: string | null
  isOverdue: boolean
}

/** What the pane lists, and how the last refresh went. */
export type WaitingView = {
  /** The signed-in person's name, from whoami. */
  person: string | null
  /** BLOCKED or REVIEW tasks whose last comment begins "Ready for". */
  ready: WaitingRow[]
  /** Tasks due today or overdue. */
  due: WaitingRow[]
  refreshedAt: number | null
  /** Why the last refresh could not read the board, in one sentence. */
  problem: string | null
  isLoading: boolean
}

/** What the person chose once, mirrored from $.store. */
export type WaitingSettings = {
  /** The project a one-line paste becomes a task in. */
  projectId: string | null
  projectName: string | null
  refreshMinutes: number
}

/** The line under the text box after a paste. */
export type WaitingNote = {
  text: string
  href: string | null
  isRefusal: boolean
}

export type ProjectChoice = { id: string; name: string }

declare module 'claude-code' {
  interface PluginState {
    onplana: {
      view: Shaped<WaitingView>
      settings: Shaped<WaitingSettings>
      note: Shaped<WaitingNote | null>
      projects: Shaped<ProjectChoice[]>
      draft: string
      isPicking: boolean
    }
  }
}
