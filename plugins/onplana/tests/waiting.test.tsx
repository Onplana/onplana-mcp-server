import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

const PANE = {
  plugin: 'onplana',
  component: 'Pane',
  requestId: 'onplana-waiting',
  props: {
    title: 'Waiting on you',
    isFocused: false,
    bodyColumns: 48,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

const SURFACES = ['terminal', 'desktop', 'vscode', 'mobile'] as const
const TYPING = ['terminal', 'desktop'] as const

// Noon on a fixed day, so "today" is that day in any time zone a runner has.
const NOW = new Date(2026, 10, 8, 12, 0, 0).getTime()
const TODAY = '2026-11-08'
const LINK = (task: string) =>
  `https://app.example.test/projects/p1?task=${task}`

type Call = { tool: string; args: Record<string, unknown> }

function task(id: string, fields: Record<string, unknown>) {
  return {
    id,
    title: `Task ${id}`,
    projectName: 'Website',
    status: 'TODO',
    dueDate: null,
    isOverdue: false,
    url: LINK(id),
    role: 'assignee',
    ...fields,
  }
}

function answer(tool: string, args: Record<string, unknown>): unknown {
  switch (tool) {
    case 'whoami':
      return { displayName: 'Pat Example' }
    case 'list_my_tasks':
      if (args.status === 'REVIEW') {
        return { tasks: [task('r1', { status: 'REVIEW', title: 'Check the copy' })] }
      }
      if (args.status === 'BLOCKED') {
        return { tasks: [task('b1', { status: 'BLOCKED', title: 'Vendor quote' })] }
      }
      if (args.overdueOnly === true) {
        return {
          tasks: [task('o1', { title: 'Send the invoice', dueDate: '2026-11-05', isOverdue: true })],
        }
      }
      if (args.status === 'TODO') {
        return {
          tasks: [
            task('t1', { title: 'Book the room', dueDate: TODAY }),
            task('t2', { title: 'Plan next month', dueDate: '2026-12-01' }),
          ],
        }
      }

      return { tasks: [] }
    case 'list_comments':
      return {
        comments: [
          {
            content:
              args.taskId === 'r1'
                ? '<onplana_user_content><p>Ready for you: the copy is in.</p></onplana_user_content>'
                : '<onplana_user_content><p>Waiting on the vendor.</p></onplana_user_content>',
          },
        ],
      }
    case 'list_projects':
      return { projects: [{ id: 'p1', name: 'Website' }, { id: 'p2', name: 'Launch' }] }
    case 'create_task':
      return { task: { id: 'new' }, url: LINK('new') }
    case 'create_comment':
      return { id: 'c1' }
    default:
      return {}
  }
}

/** The engine beneath the plugin: an Onplana server that answers from fixtures. */
function engine(on: On, stored: Record<string, unknown>) {
  const calls: Call[] = []
  // The plugin's store, held here so a test reads back what the pane kept.
  const store: Record<string, unknown> = { ...stored }
  const clock = mock.clock(on, { now: NOW })
  on('store.get', (_, e) => ({ value: store[e.key] }))
  on('store.set', (_, e) => {
    store[e.key] = JSON.parse(JSON.stringify(e.value))

    return { value: undefined }
  })
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('mcp.connect', () => ({
    value: { isConnected: true, server: 'plugin:onplana:onplana' },
  }))
  on('mcp.call', (_, e) => {
    calls.push({ tool: e.tool, args: e.args })

    return {
      value: {
        content: [{ type: 'text', text: JSON.stringify(answer(e.tool, e.args)) }],
        isError: false,
      },
    }
  })

  return { calls, clock, store }
}

test('an older stored shape keeps nothing it cannot read', async ($, on) => {
  // What an earlier draft of the pane stored: a bare project key and a text
  // interval. The pane starts with no project and the default 10 minutes.
  const { clock } = engine(on, { waiting: { project: 'p9', every: '10m' } })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await clock.settle()

  for (const surface of TYPING) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ key: 'load-projects' })).toBeDefined()
    expect((await ui.find({ key: 'every' }))?.props.value).toBe('10')
    expect((await ui.find({ type: 'Text', text: /every 10 min/ }))).toBeDefined()
    await ui.unmount()
  }
})

test('a stored project id survives a shape it does not match', async ($, on) => {
  const { clock } = engine(on, {
    waiting: { projectId: 'p2', projectName: 'Launch', refreshMinutes: 'ten' },
  })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: 'New tasks go to Launch' })).toBeDefined()
  expect((await ui.find({ key: 'every' }))?.props.value).toBe('10')
  await ui.unmount()
})

test('the pane groups what waits on the person, on every surface', async ($, on) => {
  const { clock } = engine(on, {})
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await clock.settle()

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Text', text: 'Waiting on Pat Example' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'Ready for you (1)' })).toBeDefined()
    expect((await ui.find({ type: 'Link', text: 'Check the copy' }))?.props.href).toBe(LINK('r1'))
    // Blocked, but its last comment does not hand it back.
    expect(await ui.find({ type: 'Link', text: 'Vendor quote' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: 'Due today or overdue (2)' })).toBeDefined()
    expect(await ui.find({ type: 'Link', text: 'Send the invoice' })).toBeDefined()
    expect(await ui.find({ type: 'Link', text: 'Book the room' })).toBeDefined()
    expect(await ui.find({ type: 'Link', text: 'Plan next month' })).toBeUndefined()
    await ui.unmount()
  }
})

test('one line becomes a task in the project picked once', async ($, on) => {
  const { calls, clock, store } = engine(on, {})
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'load-projects' })
  await ui.select({ key: 'project', value: 'p1' })
  await ui.input({ key: 'paste', text: 'Book the caterer' })

  expect(calls.filter(c => c.tool === 'create_task')).toEqual([
    { tool: 'create_task', args: { projectId: 'p1', title: 'Book the caterer' } },
  ])
  expect((await ui.find({ type: 'Link', text: /Task added to Website/ }))?.props.href).toBe(LINK('new'))
  expect(store.waiting).toEqual(
    expect.objectContaining({ projectId: 'p1', projectName: 'Website' }),
  )
  await ui.unmount()
})

test('a longer text with a task link becomes a comment on that task', async ($, on) => {
  const { calls, clock } = engine(on, {})
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.input({
    key: 'paste',
    text: `${LINK('r1')}\nThe copy reads well.\nOne heading is too long.`,
  })

  expect(calls.filter(c => c.tool === 'create_comment')).toEqual([
    {
      tool: 'create_comment',
      args: { taskId: 'r1', content: 'The copy reads well.\nOne heading is too long.' },
    },
  ])
  await ui.unmount()
})

test('a message to a person is refused and nothing is filed', async ($, on) => {
  const { calls, clock } = engine(on, { waiting: { shape: 'waiting-settings-2', projectId: 'p1', projectName: 'Website', refreshMinutes: 10 } })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.input({
    key: 'paste',
    text: `Hi Sam,\nCould you send the signed quote by Friday?\nThanks,`,
  })

  expect(calls.some(c => c.tool === 'create_task' || c.tool === 'create_comment')).toBe(false)
  expect(await ui.find({ type: 'Text', text: /Drafts belong in your mailbox/ })).toBeDefined()
  await ui.unmount()
})

test('the board is read again on the timer the person sets', async ($, on) => {
  const { calls, clock, store } = engine(on, {})
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await clock.settle()
  const reads = () => calls.filter(c => c.tool === 'whoami').length
  expect(reads()).toBe(1)

  await clock.advance(10 * 60_000)
  expect(reads()).toBe(2)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.select({ key: 'every', value: '5' })
  await clock.advance(5 * 60_000)
  expect(reads()).toBe(3)
  expect(store.waiting).toEqual(expect.objectContaining({ refreshMinutes: 5 }))
  await ui.unmount()
})

test('the command opens the pane and reads the board', async ($, on) => {
  const { clock } = engine(on, {})
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await clock.settle()

  const { text } = await $.command.run({
    command: 'onplana-waiting',
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: true, columns: 160 },
  })
  expect(text).toBe('1 ready for you, 2 due today or overdue.')
})
