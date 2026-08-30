/**
 * System design (`modular_circuit`) live progress.
 *
 * The two eda.cn agents report progress over DIFFERENT channels, and this
 * suite is the guard that keeps them straight:
 *
 *   - `schemagen`  → AG-UI `CUSTOM` events named `*_TRACE`, carrying LangGraph
 *                    `custom`-stream `TraceEvent`s.
 *   - `modular_circuit` → the standard AG-UI `TOOL_CALL_START`/`TOOL_CALL_END`
 *                    lifecycle (rebuilt from LangGraph tasks by the agent
 *                    server), plus a `SYSTEM_DESIGN_EVENT` custom event for
 *                    the rolling todo list and stage announcements.
 *
 * Before this was wired up, the system-design card rendered nothing for the
 * whole 10-minute run because `handleEvent` only understood the first channel.
 */
import { describe, expect, it } from 'vitest'
import { consumeCopilotkit, handleEvent, SYSTEM_DESIGN_EVENT_NAME } from '../src/sse.js'
import { ToolCallTracker, pairTraceEvents, stripTaskIds, hasTaskId, type TraceEvent } from '../src/trace.js'
import { ProgressStore, type TodoItem } from '../src/progress.js'
import { buildTree } from '../src/client/trace-tree.js'

/** Drive `consumeCopilotkit` with a scripted SSE stream. */
async function runStream(
  events: unknown[],
  options: { toolCallTrace?: boolean } = {},
): Promise<{ trace: ReturnType<typeof pairTraceEvents>; todos: unknown[]; notes: unknown[] }> {
  const traceSeen: TraceEvent[] = []
  const todos: unknown[] = []
  const notes: unknown[] = []
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder()
      for (const evt of events) {
        controller.enqueue(encoder.encode('data: ' + JSON.stringify(evt) + '\n\n'))
      }
      controller.close()
    },
  })
  await consumeCopilotkit('https://x/api/copilotkit', {}, {}, {
    fetchImpl: (async () => new Response(stream, { status: 200 })) as never,
    timeoutMs: 5000,
    toolCallTrace: options.toolCallTrace,
    onTrace: (batch) => { traceSeen.push(...batch) },
    onTodos: (batch) => { todos.push(batch) },
    onNote: (note) => { notes.push(note) },
  })
  return { trace: pairTraceEvents(traceSeen), todos, notes }
}

describe('ToolCallTracker', () => {
  it('opens and closes a tool call, synthesizing start/end trace events', () => {
    const tracker = new ToolCallTracker()
    const start = tracker.start('t1', 'design_plan_gen', 1000)
    expect(start).toMatchObject({ kind: 'tool', phase: 'start', name: 'design_plan_gen' })
    const end = tracker.end('t1', 2500)
    expect(end).toMatchObject({ kind: 'tool', phase: 'end', name: 'design_plan_gen', ok: true, ts: 2500 })
    expect(tracker.openIds).toEqual([])
  })

  it('gives each invocation a distinct instance path so repeats are not lost', () => {
    const tracker = new ToolCallTracker()
    const a = tracker.start('t1', 'es_rag_search', 1)
    tracker.end('t1', 2)
    const b = tracker.start('t2', 'es_rag_search', 3)
    expect(a.kind === 'tool' && a.path).not.toBe(b.kind === 'tool' && b.path)
    expect(stripTaskIds((a as { path: string }).path)).toBe('es_rag_search')
    expect(stripTaskIds((b as { path: string }).path)).toBe('es_rag_search')
    expect(hasTaskId((a as { path: string }).path)).toBe(true)
  })

  it('nests a child call under its still-open parent', () => {
    const tracker = new ToolCallTracker()
    tracker.start('p', 'componentWorker', 1)
    const child = tracker.start('c', 'componentWorker>es_rag_search', 2)
    // The parent's *instance* path is the prefix (it already carries the
    // parent's own task id), and only the relative leaf gets a new one.
    expect((child as { path: string }).path).toBe('componentWorker::task:p>es_rag_search::task:c')
    expect((child as { name: string }).name).toBe('es_rag_search')
    expect((child as { scope: string }).scope).toBe('componentWorker')
    // Both task ids are invisible once stripped.
    expect(stripTaskIds((child as { path: string }).path)).toBe('componentWorker>es_rag_search')
  })

  it('returns null for an end that was never opened', () => {
    expect(new ToolCallTracker().end('ghost')).toBeNull()
  })

  it('forgets open calls on reset', () => {
    const tracker = new ToolCallTracker()
    tracker.start('t1', 'a', 1)
    tracker.reset()
    expect(tracker.openIds).toEqual([])
    expect(tracker.end('t1')).toBeNull()
  })
})

describe('handleEvent — AG-UI tool-call lifecycle', () => {
  it('synthesizes trace events when a tracker is supplied', () => {
    const tracker = new ToolCallTracker()
    const started = handleEvent({ type: 'TOOL_CALL_START', toolCallId: 'x1', toolCallName: 'module_search' }, {}, tracker)
    expect(started.trace).toHaveLength(1)
    expect(started.trace![0]).toMatchObject({ kind: 'tool', phase: 'start', name: 'module_search' })
    const ended = handleEvent({ type: 'TOOL_CALL_END', toolCallId: 'x1' }, {}, tracker)
    expect(ended.trace![0]).toMatchObject({ phase: 'end', ok: true })
  })

  it('accepts the snake_case field names older builds emit', () => {
    const tracker = new ToolCallTracker()
    const r = handleEvent({ type: 'TOOL_CALL_START', tool_call_id: 'y1', tool_call_name: 'module_connect' }, {}, tracker)
    expect(r.trace![0]).toMatchObject({ name: 'module_connect' })
    expect(handleEvent({ type: 'TOOL_CALL_END', tool_call_id: 'y1' }, {}, tracker).trace).toHaveLength(1)
  })

  it('stays inert without a tracker so the schematic stack is not double-counted', () => {
    // `schemagen` reports the same calls through CUSTOM `*_TRACE` events.
    // Enabling the lifecycle adapter for it would duplicate every row.
    expect(handleEvent({ type: 'TOOL_CALL_START', toolCallId: 'z1', toolCallName: 'search_parts' }, {})).toEqual({})
    expect(handleEvent({ type: 'TOOL_CALL_END', toolCallId: 'z1' }, {})).toEqual({})
  })

  it('clears per-run bookkeeping on RUN_STARTED', () => {
    const tracker = new ToolCallTracker()
    tracker.start('t1', 'a', 1)
    expect(handleEvent({ type: 'RUN_STARTED' }, {}, tracker).runStarted).toBe(true)
    expect(tracker.openIds).toEqual([])
  })
})

describe('handleEvent — SYSTEM_DESIGN_EVENT', () => {
  it('parses a todo_progress payload', () => {
    const r = handleEvent({
      type: 'CUSTOM',
      name: SYSTEM_DESIGN_EVENT_NAME,
      value: {
        kind: 'todo_progress',
        revision: 2,
        todos: [
          { content: '确认电源方案', status: 'completed' },
          { content: '搜索 MCU 模块', status: 'in_progress' },
          { content: '设计端口连接', status: 'pending' },
          'not-an-object',
        ],
      },
    }, {})
    expect(r.todos).toEqual([
      { content: '确认电源方案', status: 'completed' },
      { content: '搜索 MCU 模块', status: 'in_progress' },
      { content: '设计端口连接', status: 'pending' },
    ])
  })

  it('parses a stage announcement', () => {
    const r = handleEvent({
      type: 'CUSTOM',
      name: SYSTEM_DESIGN_EVENT_NAME,
      value: { kind: 'progress', phase: 'start', stage: 'design_plan_gen', message: '正在整理需求并生成系统设计方案。', ts: 1770000000000 },
    }, {})
    expect(r.note).toEqual({
      phase: 'start',
      stage: 'design_plan_gen',
      message: '正在整理需求并生成系统设计方案。',
      ts: 1770000000000,
    })
  })

  it('is NOT mistaken for a trace event', () => {
    // `SYSTEM_DESIGN_EVENT` does not end in `_TRACE`; it must never reach the
    // trace pipeline, where its payload would fail validation and vanish.
    const tracker = new ToolCallTracker()
    const r = handleEvent({ type: 'CUSTOM', name: SYSTEM_DESIGN_EVENT_NAME, value: { kind: 'progress', message: 'x' } }, {}, tracker)
    expect(r.trace).toBeUndefined()
    expect(r.note).toBeDefined()
  })

  it('ignores unknown SYSTEM_DESIGN_EVENT kinds', () => {
    const r = handleEvent({ type: 'CUSTOM', name: SYSTEM_DESIGN_EVENT_NAME, value: { kind: 'something_else' } }, {})
    expect(r).toEqual({})
  })
})

describe('system-design end to end', () => {
  it('builds a call stack, todo list and stage notes from one stream', async () => {
    const { trace, todos, notes } = await runStream([
      { type: 'RUN_STARTED' },
      { type: 'CUSTOM', name: SYSTEM_DESIGN_EVENT_NAME, value: { kind: 'progress', phase: 'start', stage: 'design_plan_gen', message: '正在整理需求并生成系统设计方案。', ts: 1 } },
      { type: 'TOOL_CALL_START', toolCallId: 'a', toolCallName: 'design_plan_gen' },
      { type: 'CUSTOM', name: SYSTEM_DESIGN_EVENT_NAME, value: { kind: 'todo_progress', revision: 1, todos: [{ content: '确认需求', status: 'in_progress' }] } },
      { type: 'TOOL_CALL_END', toolCallId: 'a' },
      { type: 'CUSTOM', name: SYSTEM_DESIGN_EVENT_NAME, value: { kind: 'progress', phase: 'complete', stage: 'design_plan_gen', message: '系统设计方案已经生成。', ts: 2 } },
      { type: 'TOOL_CALL_START', toolCallId: 'b', toolCallName: 'module_search' },
      { type: 'TOOL_CALL_END', toolCallId: 'b' },
      { type: 'TOOL_CALL_START', toolCallId: 'c', toolCallName: 'module_connect' },
      { type: 'RUN_FINISHED' },
    ], { toolCallTrace: true })

    // The whole point: a system-design run yields frames at all.
    expect(trace.length).toBe(3)
    expect(trace[0]).toMatchObject({ name: 'design_plan_gen', status: 'finished' })
    expect(trace[1]).toMatchObject({ name: 'module_search', status: 'finished' })
    // Still open at RUN_FINISHED — a running leaf is the current work.
    expect(trace[2]).toMatchObject({ name: 'module_connect', status: 'running' })

    expect(todos).toHaveLength(1)
    expect(notes).toHaveLength(2)
    expect(notes[1]).toMatchObject({ phase: 'complete', message: '系统设计方案已经生成。' })
  })

  it('reports no trace at all when toolCallTrace is off (schematic default)', async () => {
    const { trace } = await runStream([
      { type: 'TOOL_CALL_START', toolCallId: 'a', toolCallName: 'design_plan_gen' },
      { type: 'TOOL_CALL_END', toolCallId: 'a' },
      { type: 'RUN_FINISHED' },
    ], { toolCallTrace: false })
    expect(trace).toEqual([])
  })

  it('still honors legacy MODULE_GEN_TRACE custom events', async () => {
    const { trace } = await runStream([
      { type: 'CUSTOM', name: 'MODULE_GEN_TRACE', value: { kind: 'tool', phase: 'start', scope: 'componentWorker', name: 'es_rag_search', ts: 10 } },
      { type: 'CUSTOM', name: 'MODULE_GEN_TRACE', value: { kind: 'tool', phase: 'end', scope: 'componentWorker', name: 'es_rag_search', ts: 20, ok: true } },
      { type: 'RUN_FINISHED' },
    ], { toolCallTrace: true })
    expect(trace).toHaveLength(1)
    expect(trace[0]).toMatchObject({ name: 'es_rag_search', status: 'finished', path: 'componentWorker>es_rag_search' })
  })
})

describe('buildTree — repeated lifecycle calls', () => {
  it('collapses 200 invocations of one search tool into a single row with ×N', () => {
    const tracker = new ToolCallTracker()
    const events: TraceEvent[] = []
    for (let i = 0; i < 200; i++) {
      events.push(tracker.start(`t${i}`, 'es_rag_search', i * 10))
      events.push(tracker.end(`t${i}`, i * 10 + 5)!)
    }
    const tree = buildTree(pairTraceEvents(events))
    expect(tree).toHaveLength(1)
    expect(tree[0]!.name).toBe('es_rag_search')
    expect(tree[0]!.repeat).toBe(200)
    expect(tree[0]!.status).toBe('finished')
    // No `::task:` leakage into the display name.
    expect(tree[0]!.name).not.toContain('::task:')
  })

  it('lets the latest invocation win the row status', () => {
    const tracker = new ToolCallTracker()
    const events: TraceEvent[] = [
      tracker.start('t1', 'es_rag_search', 1),
      tracker.end('t1', 2)!,
      tracker.start('t2', 'es_rag_search', 3),
    ]
    const tree = buildTree(pairTraceEvents(events))
    expect(tree).toHaveLength(1)
    expect(tree[0]!.status).toBe('running')
    expect(tree[0]!.repeat).toBe(2)
  })

  it('collapses schematic CUSTOM-trace repeats (no task ids) into one row', () => {
    // The schematic agent emits back-to-back start/end and a final start for
    // `search_parts`; pairing leaves two frames (one finished, one still
    // running). Both must collapse into a single row with ×2.
    const frames = pairTraceEvents([
      { kind: 'tool', phase: 'start', scope: 'schematicDesign', name: 'search_parts', ts: 1 },
      { kind: 'tool', phase: 'end', scope: 'schematicDesign', name: 'search_parts', ts: 2, ok: true },
      { kind: 'tool', phase: 'start', scope: 'schematicDesign', name: 'search_parts', ts: 3 },
    ])
    expect(frames).toHaveLength(2)
    const tree = buildTree(frames)
    expect(tree).toHaveLength(1)
    const leaf = tree[0]!.children[0]!
    expect(leaf).toBeDefined()
    expect(leaf!.children).toHaveLength(0)
    expect(leaf!.repeat).toBe(2)
    // Latest invocation is the still-running one — its status wins.
    expect(leaf!.status).toBe('running')
  })
})

describe('ProgressStore — system-design signals', () => {
  it('keeps the newest note and refuses an older one', () => {
    const store = new ProgressStore()
    store.start('c1', 'generate_system_module_graph', 'system')
    store.setNote('c1', { phase: 'start', stage: 'b', message: 'second', ts: 200 })
    store.setNote('c1', { phase: 'start', stage: 'a', message: 'first', ts: 100 })
    expect(store.get('c1')?.note?.message).toBe('second')
    store.setNote('c1', { phase: 'complete', stage: 'c', message: 'third', ts: 300 })
    expect(store.get('c1')?.note?.message).toBe('third')
  })

  it('treats an error announcement as the failure reason', () => {
    const store = new ProgressStore()
    store.start('c1', 'generate_system_module_graph', 'system')
    store.setNote('c1', { phase: 'error', stage: 'module_connect', message: '连接设计失败。', ts: 1 })
    const doc = store.get('c1')
    expect(doc?.status).toBe('failed')
    expect(doc?.error).toBe('连接设计失败。')
  })

  it('stores todos as a copy so a later mutation cannot rewrite history', () => {
    const store = new ProgressStore()
    store.start('c1', 'generate_system_module_graph', 'system')
    const todos: TodoItem[] = [{ content: 'a', status: 'pending' }]
    store.setTodos('c1', todos)
    todos[0]!.status = 'completed'
    expect(store.get('c1')?.todos?.[0]?.status).toBe('pending')
  })

  it('closes still-open spans when the run finishes', () => {
    const store = new ProgressStore()
    store.start('c1', 'generate_system_module_graph', 'system')
    const tracker = new ToolCallTracker()
    store.pushTrace('c1', [tracker.start('t1', 'module_connect', 1)!])
    expect(store.get('c1')?.frames[0]?.status).toBe('running')
    store.finish('c1')
    expect(store.get('c1')?.frames[0]?.status).toBe('finished')
  })
})
