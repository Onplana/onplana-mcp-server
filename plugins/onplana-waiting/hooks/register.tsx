// "Waiting on you": a pane beside the chat with the Onplana tasks that wait on
// the signed-in person, and a text box that files what they paste.
//
// Every read and write goes through the Onplana MCP server this plugin
// declares in .mcp.json (whoami, list_my_tasks, list_comments, list_projects,
// create_task, create_comment), with the person's own sign-in. Nothing here
// sends a message to anyone: text that reads as a message to a person is
// refused, because a draft belongs in a mailbox, not in a task.
//
// This plugin lists the server itself because $.mcp.connect connects only a
// server in the caller's own manifest (it answers `unlisted` for the onplana
// plugin's). The onplana plugin lists the same URL; Claude Code runs a server
// with the same URL once and skips the copy, and connect then answers with the
// name the session already runs it under, so a person with both plugins has
// one Onplana server, and calls go to whatever name connect returns.

import { atom, read, update } from 'claude-code'
import type { EngineInterface, McpToolResult, Register, Timer } from 'claude-code'

import type {
  ProjectChoice,
  WaitingNote,
  WaitingRow,
  WaitingSettings,
  WaitingView,
} from '../types'

const PANE = 'onplana-waiting'
const TITLE = 'Waiting on you'
// The server's key in this plugin's .mcp.json.
const SERVER = 'onplana'
const STORE_KEY = 'waiting'
const STORE_SHAPE = 'waiting-settings-2'
const DEFAULT_MINUTES = 10
const MINUTE_CHOICES = [5, 10, 15, 30, 60]
const READY_PREFIX = 'Ready for'
// How many BLOCKED or REVIEW tasks one refresh reads the comments of.
const MAX_READY_CHECKS = 25
const LIST_LIMIT = 50

const REFUSAL =
  'That reads as a message to a person, so nothing was filed and nothing was sent. Drafts belong in your mailbox, not in a task.'

const EMPTY_VIEW: WaitingView = {
  person: null,
  ready: [],
  due: [],
  refreshedAt: null,
  problem: null,
  isLoading: false,
}
const DEFAULT_SETTINGS: WaitingSettings = {
  projectId: null,
  projectName: null,
  refreshMinutes: DEFAULT_MINUTES,
}

// Change a tag when that value's fields change: it declines what an earlier
// version stored, which outlives a reload.
const view = atom({ plugin: 'onplana-waiting', key: 'view' } as const, EMPTY_VIEW, {
  shape: 'view-1',
})
const settings = atom(
  { plugin: 'onplana-waiting', key: 'settings' } as const,
  DEFAULT_SETTINGS,
  { shape: 'settings-1' },
)
const note = atom({ plugin: 'onplana-waiting', key: 'note' } as const, null, {
  shape: 'note-1',
})
const projects = atom({ plugin: 'onplana-waiting', key: 'projects' } as const, [], {
  shape: 'projects-1',
})
const draft = atom({ plugin: 'onplana-waiting', key: 'draft' } as const, '')
const isPicking = atom({ plugin: 'onplana-waiting', key: 'isPicking' } as const, false)

type Dollar = EngineInterface
type Connection = { ok: true; server: string } | { ok: false; message: string }

// Module variables start over on a reload; the timer is cancelled with the old
// environment anyway, and session.start starts a new one.
let timer: Timer | null = null
let inFlight: Promise<WaitingView> | null = null

// ---------------------------------------------------------------- pure helpers

/**
 * Reads what $.store holds into today's settings. An older or unknown shape
 * keeps whatever still reads (a project id, a valid interval) and falls back
 * to the defaults for the rest.
 */
export function readSettings(raw: unknown): WaitingSettings {
  if (raw === null || typeof raw !== 'object') return { ...DEFAULT_SETTINGS }
  const stored = raw as Record<string, unknown>
  const minutes =
    typeof stored.refreshMinutes === 'number' &&
    MINUTE_CHOICES.includes(stored.refreshMinutes)
      ? stored.refreshMinutes
      : DEFAULT_MINUTES
  const projectId =
    typeof stored.projectId === 'string' && stored.projectId !== ''
      ? stored.projectId
      : null
  const projectName =
    projectId !== null && typeof stored.projectName === 'string'
      ? stored.projectName
      : null

  return { projectId, projectName, refreshMinutes: minutes }
}

/** Server text with its markup taken off, for display and prefix checks. */
export function cleanText(value: unknown): string {
  if (typeof value !== 'string') return ''

  return value
    .replace(/<\/?onplana_user_content>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

/** True when the text reads as a message to a person rather than a task. */
export function readsAsMessage(text: string): boolean {
  const lines = text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line !== '')
  const first = lines[0] ?? ''
  if (/^(hi|hello|hey|dear|good (morning|afternoon|evening))\b/i.test(first)) {
    return true
  }
  if (lines.some(line => /^(subject|to|cc|bcc):\s*\S/i.test(line))) return true

  const last = lines[lines.length - 1] ?? ''

  return (
    lines.length > 1 &&
    /^((kind|best|warm) regards|regards|thanks|thank you|many thanks|cheers|sincerely|best|all the best)[,.!]?$/i.test(
      last,
    )
  )
}

/** The task id in an Onplana task link, as the web app and the server write it. */
export function taskIdInLink(text: string): { id: string; link: string } | null {
  const match = /https?:\/\/\S*\/projects\/\S*[?&]task=([A-Za-z0-9_-]+)\S*/.exec(
    text,
  )
  if (match === null || match[1] === undefined) return null

  return { id: match[1], link: match[0] }
}

/** The person's calendar day, YYYY-MM-DD. */
export function localDay(ms: number): string {
  const day = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')

  return `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`
}

function clock(ms: number): string {
  const at = new Date(ms)

  return `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`
}

function firstText(result: McpToolResult): string | undefined {
  for (const block of result.content) {
    if (block.type === 'text' && typeof block.text === 'string') return block.text
  }

  return undefined
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {}
}

function toRow(raw: unknown): WaitingRow | null {
  const task = asRecord(raw)
  if (typeof task.id !== 'string' || typeof task.url !== 'string') return null
  const due = typeof task.dueDate === 'string' ? task.dueDate.slice(0, 10) : null

  return {
    id: task.id,
    title: cleanText(task.title) || 'Untitled task',
    url: task.url,
    project: cleanText(task.projectName),
    status: typeof task.status === 'string' ? task.status : '',
    dueDate: due,
    isOverdue: task.isOverdue === true,
  }
}

/** Rows a list_my_tasks answer holds that are the person's own work. */
function rowsOf(answer: unknown, roles: readonly string[]): WaitingRow[] {
  const tasks = asRecord(answer).tasks
  if (!Array.isArray(tasks)) return []
  const rows: WaitingRow[] = []
  for (const task of tasks) {
    const role = asRecord(task).role
    if (typeof role === 'string' && !roles.includes(role)) continue
    const row = toRow(task)
    if (row !== null) rows.push(row)
  }

  return rows
}

function urlOf(answer: unknown): string | null {
  const top = asRecord(answer)
  if (typeof top.url === 'string') return top.url
  const nested = asRecord(top.task).url

  return typeof nested === 'string' ? nested : null
}

// ------------------------------------------------------------- server calls

async function connect($: Dollar): Promise<Connection> {
  const connected = await $.mcp.connect(SERVER)
  if (connected.isConnected) return { ok: true, server: connected.server }

  return {
    ok: false,
    message: `Onplana is not connected (${connected.message}). Run /mcp and sign in to the Onplana server, or /onplana-connect if you have the onplana plugin.`,
  }
}

async function callTool(
  $: Dollar,
  server: string,
  tool: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const result = await $.mcp.call(server, tool, args)
  const text = firstText(result)
  if (result.isError) {
    throw new Error(cleanText(text).slice(0, 200) || `${tool} failed.`)
  }
  if (text === undefined) return {}
  try {
    return JSON.parse(text)
  } catch {
    return {}
  }
}

async function load($: Dollar): Promise<WaitingView> {
  await update($, view, current => ({ ...current, isLoading: true }))
  const connection = await connect($)
  if (!connection.ok) {
    const failed: WaitingView = { ...EMPTY_VIEW, problem: connection.message }
    await update($, view, () => failed)

    return failed
  }
  const { server } = connection
  try {
    const mine = (args: Record<string, unknown>) =>
      callTool($, server, 'list_my_tasks', { limit: LIST_LIMIT, ...args })
    const [who, blocked, review, overdue, todo, doing] = await Promise.all([
      callTool($, server, 'whoami', {}),
      mine({ status: 'BLOCKED' }),
      mine({ status: 'REVIEW' }),
      mine({ overdueOnly: true }),
      mine({ status: 'TODO' }),
      mine({ status: 'IN_PROGRESS' }),
    ])
    const today = localDay(await $.clock.now())

    // Waiting on a reply: assigned to the person, BLOCKED or in REVIEW, and
    // the newest comment hands it back with "Ready for".
    const candidates = [
      ...rowsOf(blocked, ['assignee']),
      ...rowsOf(review, ['assignee']),
    ].slice(0, MAX_READY_CHECKS)
    const checked = await Promise.all(
      candidates.map(async row => {
        const answer = await callTool($, server, 'list_comments', {
          taskId: row.id,
        })
        const comments = asRecord(answer).comments
        const newest = Array.isArray(comments) ? asRecord(comments[0]) : {}

        return cleanText(newest.content).startsWith(READY_PREFIX) ? row : null
      }),
    )
    const ready = checked.filter((row): row is WaitingRow => row !== null)

    // Due today or overdue, on tasks the person holds or works on.
    const roles = ['assignee', 'collaborator']
    const seen = new Set<string>()
    const due: WaitingRow[] = []
    for (const row of [
      ...rowsOf(overdue, roles).map(r => ({ ...r, isOverdue: true })),
      ...[blocked, review, todo, doing].flatMap(answer => rowsOf(answer, roles)),
    ]) {
      if (seen.has(row.id)) continue
      const isLate =
        row.isOverdue || (row.dueDate !== null && row.dueDate < today)
      if (!isLate && row.dueDate !== today) continue
      seen.add(row.id)
      due.push({ ...row, isOverdue: isLate })
    }
    due.sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''))

    const whoami = asRecord(who)
    const person =
      cleanText(whoami.displayName) || cleanText(asRecord(whoami.user).name) || null
    const loaded: WaitingView = {
      person,
      ready,
      due,
      refreshedAt: await $.clock.now(),
      problem: null,
      isLoading: false,
    }
    await update($, view, () => loaded)

    return loaded
  } catch (error) {
    const failed: WaitingView = {
      ...(await read($, view)),
      isLoading: false,
      problem: `Could not read your Onplana tasks: ${error instanceof Error ? error.message : 'unknown error'}`,
    }
    await update($, view, () => failed)

    return failed
  }
}

/** One refresh at a time; a second ask while one runs gets the same answer. */
function refresh($: Dollar): Promise<WaitingView> {
  if (inFlight === null) {
    inFlight = load($).finally(() => {
      inFlight = null
    })
  }

  return inFlight
}

async function loadProjects($: Dollar): Promise<void> {
  const connection = await connect($)
  if (!connection.ok) {
    await update($, note, () => ({
      text: connection.message,
      href: null,
      isRefusal: true,
    }))

    return
  }
  try {
    const answer = await callTool($, connection.server, 'list_projects', {
      limit: LIST_LIMIT,
    })
    const list = asRecord(answer).projects
    const choices: ProjectChoice[] = []
    for (const raw of Array.isArray(list) ? list : []) {
      const project = asRecord(raw)
      if (typeof project.id !== 'string') continue
      choices.push({ id: project.id, name: cleanText(project.name) || 'Untitled project' })
    }
    await update($, projects, () => choices)
  } catch (error) {
    await update($, note, () => ({
      text: `Could not list your projects: ${error instanceof Error ? error.message : 'unknown error'}`,
      href: null,
      isRefusal: true,
    }))
  }
}

// ------------------------------------------------------------ the person's acts

async function saveSettings($: Dollar, next: WaitingSettings): Promise<void> {
  await $.store.set(STORE_KEY, { shape: STORE_SHAPE, ...next })
}

function startTimer($: Dollar, minutes: number): void {
  timer?.cancel()
  timer = $.clock.every(minutes * 60_000, () => {
    void refresh($)
  })
}

async function pickProject($: Dollar, projectId: string): Promise<void> {
  const choice = (await read($, projects)).find(p => p.id === projectId)
  const next = await update($, settings, current => ({
    ...current,
    projectId,
    projectName: choice?.name ?? null,
  }))
  await saveSettings($, next)
  await update($, isPicking, () => false)
}

async function changeMinutes($: Dollar, value: string): Promise<void> {
  const minutes = Number(value)
  if (!MINUTE_CHOICES.includes(minutes)) return
  const next = await update($, settings, current => ({
    ...current,
    refreshMinutes: minutes,
  }))
  await saveSettings($, next)
  startTimer($, minutes)
}

async function startPicking($: Dollar): Promise<void> {
  await update($, isPicking, () => true)
  await loadProjects($)
}

/** What a paste becomes: a task, a comment, or a refusal with the reason. */
async function file($: Dollar, pasted: string): Promise<void> {
  const say = (text: string, isRefusal: boolean, href: string | null = null) =>
    update($, note, (): WaitingNote => ({ text, href, isRefusal }))
  const text = pasted.trim()
  if (text === '') {
    await say('Paste or type something first.', true)

    return
  }
  if (readsAsMessage(text)) {
    await say(REFUSAL, true)

    return
  }
  const connection = await connect($)
  if (!connection.ok) {
    await say(connection.message, true)

    return
  }
  const lines = text.split(/\r?\n/).filter(line => line.trim() !== '')
  const linked = taskIdInLink(text)
  try {
    if (linked !== null) {
      const content = text.replace(linked.link, '').trim()
      if (content === '') {
        await say('Add the comment beside the task link.', true)

        return
      }
      await callTool($, connection.server, 'create_comment', {
        taskId: linked.id,
        content,
      })
      await update($, draft, () => '')
      await say('Comment added.', false, linked.link)

      return
    }
    if (lines.length > 1) {
      await say(
        'A longer text needs a task link to become a comment on that task. One line becomes a task.',
        true,
      )

      return
    }
    const chosen = await read($, settings)
    if (chosen.projectId === null) {
      await say('Pick the project new tasks go to, then paste again.', true)
      await startPicking($)

      return
    }
    const answer = await callTool($, connection.server, 'create_task', {
      projectId: chosen.projectId,
      title: text.slice(0, 500),
    })
    await update($, draft, () => '')
    await say(
      `Task added to ${chosen.projectName ?? 'your project'}.`,
      false,
      urlOf(answer),
    )
  } catch (error) {
    await say(
      `Onplana did not take it: ${error instanceof Error ? error.message : 'unknown error'}`,
      true,
    )
  }
}

// ---------------------------------------------------------------- the hooks

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    // The mod API takes a bare name (letters, digits, _ and -), so the command
    // is /onplana-waiting, beside /onplana-connect.
    await $.command.register({
      name: 'onplana-waiting',
      description: 'Show the Onplana tasks waiting on you in a pane beside the chat',
    })
    const stored = readSettings(await $.store.get(STORE_KEY))
    await update($, settings, () => stored)
    startTimer($, stored.refreshMinutes)
    void $.ui.open({ id: PANE, title: TITLE })
    // The first read runs once the session is up, not while it starts.
    $.clock.after(0, () => {
      void refresh($)
    })

    return next(e)
  })

  on('command.run', { command: 'onplana-waiting' }, async $ => {
    await $.ui.open({ id: PANE, title: TITLE, focus: true })
    const loaded = await refresh($)
    if (loaded.problem !== null) return { text: loaded.problem }

    return {
      text: `${loaded.ready.length} ready for you, ${loaded.due.length} due today or overdue.`,
    }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const elements = $.ui.resolve(e)
    const { Box, Text, Button, Link } = elements
    const Input = 'Input' in elements ? elements.Input : null
    const Select = 'Select' in elements ? elements.Select : null
    const shown = await read($, view)
    const chosen = await read($, settings)
    const said = await read($, note)
    const picking = await read($, isPicking)
    const choices = await read($, projects)
    const typed = await read($, draft)

    const status =
      shown.refreshedAt === null
        ? shown.isLoading
          ? 'Reading your board...'
          : 'Not read yet.'
        : `Updated ${clock(shown.refreshedAt)}, every ${chosen.refreshMinutes} min${shown.isLoading ? ', refreshing...' : ''}`

    const row = (task: WaitingRow, detail: string) => (
      <Box key={`task-${task.id}`} flexDirection="column" marginBottom={1}>
        <Link href={task.url} label={task.title} />
        <Text dimColor>{[task.project, detail].filter(Boolean).join(', ')}</Text>
      </Box>
    )

    return (
      <Box flexDirection="column">
        <Text bold>{`Waiting on ${shown.person ?? 'you'}`}</Text>
        <Box flexDirection="row" gap={1}>
          <Text dimColor>{status}</Text>
          <Button key="refresh" plain onPress={() => void refresh($)}>
            Refresh
          </Button>
        </Box>
        {shown.problem !== null && <Text color="error">{shown.problem}</Text>}

        <Box flexDirection="column" marginTop={1}>
          <Text bold>{`Ready for you (${shown.ready.length})`}</Text>
          {shown.ready.length === 0 && (
            <Text dimColor>Nothing is handed back to you.</Text>
          )}
          {shown.ready.map(task =>
            row(task, task.status === 'BLOCKED' ? 'blocked' : 'in review'),
          )}
        </Box>

        <Box flexDirection="column" marginTop={1}>
          <Text bold>{`Due today or overdue (${shown.due.length})`}</Text>
          {shown.due.length === 0 && <Text dimColor>Nothing due today.</Text>}
          {shown.due.map(task =>
            row(
              task,
              task.isOverdue ? `overdue, was due ${task.dueDate ?? ''}` : 'due today',
            ),
          )}
        </Box>

        {Input !== null && Select !== null ? (
          <Box flexDirection="column" marginTop={1}>
            {chosen.projectId === null || picking ? (
              choices.length > 0 ? (
                <Select
                  key="project"
                  label="New tasks go to"
                  options={choices.map(p => ({ value: p.id, label: p.name }))}
                  value={chosen.projectId ?? undefined}
                  onSelect={id => void pickProject($, id)}
                />
              ) : (
                <Button key="load-projects" onPress={() => void startPicking($)}>
                  Choose the project new tasks go to
                </Button>
              )
            ) : (
              <Box flexDirection="row" gap={1}>
                <Text dimColor>{`New tasks go to ${chosen.projectName ?? 'your project'}`}</Text>
                <Button key="change-project" plain onPress={() => void startPicking($)}>
                  Change
                </Button>
              </Box>
            )}
            <Input
              key="paste"
              rows={3}
              placeholder="One line becomes a task. Text with a task link becomes a comment."
              submitLabel="file"
              value={typed}
              onInput={text => void update($, draft, () => text)}
              onSubmit={text => void file($, text)}
            />
            <Select
              key="every"
              label="Refresh every"
              options={MINUTE_CHOICES.map(m => ({ value: String(m), label: `${m} min` }))}
              value={String(chosen.refreshMinutes)}
              onSelect={value => void changeMinutes($, value)}
            />
          </Box>
        ) : (
          <Text dimColor>
            Open this pane in the terminal, the desktop app or VS Code to file a task.
          </Text>
        )}

        {said !== null &&
          (said.href !== null ? (
            <Link href={said.href} label={said.text} />
          ) : (
            <Text color={said.isRefusal ? 'warning' : undefined}>{said.text}</Text>
          ))}
      </Box>
    )
  })
}
