/**
 * `@huaqiu/dsh-tool-schematic-gen` — CopilotKit SSE consumption and the
 * export-zip POST (dependency-free; `fetch` is injected).
 *
 * @module @huaqiu/dsh-tool-schematic-gen
 */
import type { EdaAccount, SchematicGenConfig } from './config.js'
import { buildExportHeaders } from './config.js'
import {
  collectTraceEvents, isTraceEventName, ToolCallTracker,
  type TraceEvent,
} from './trace.js'
import type { ProgressNote, TodoItem } from './progress.js'

/**
 * Overall SSE / zip budget — the eda.cn design agents routinely run 9–12+
 * minutes per generation (observed runs exceeded the old 10-min cap), so
 * allow 30 minutes before aborting the stream. This single constant drives
 * both the backend SSE stream timeout and the agent-facing tool timeout hint
 * (`TOOL_TIMEOUT_MS` in tools.ts references it).
 */
export const HTTP_TIMEOUT_MS = 1_800_000

// ── STATE_DELTA application ──────────────────────────────────────────────────

/**
 * Apply one `STATE_DELTA` op set to the accumulating state. Only **top-level**
 * patches (`/key`) are applied; nested paths are ignored because the final
 * `STATE_SNAPSHOT` is authoritative for the deliverable fields.
 */
export function applyDelta(delta: unknown, state: Record<string, unknown>): void {
  if (!Array.isArray(delta)) return
  for (const op of delta) {
    if (!op || typeof op !== 'object') continue
    const record = op as { op?: unknown; path?: unknown; value?: unknown }
    const path = typeof record.path === 'string' ? record.path : ''
    const m = /^\/([^/]+)$/.exec(path)
    if (!m) continue
    const key = m[1]!
    if (record.op === 'remove') delete state[key]
    else if (record.op === 'add' || record.op === 'replace') state[key] = record.value
  }
}

/**
 * Custom-event name the `modular_circuit` (system design) agent uses for
 * everything that is NOT a tool call: a rolling todo list and human-readable
 * stage announcements (`packages/agents/system-design/src/utils/progress.ts`).
 */
export const SYSTEM_DESIGN_EVENT_NAME = 'SYSTEM_DESIGN_EVENT'

/** Read a string field that may be camelCase (AG-UI) or snake_case (older builds). */
function strField(rec: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const v = rec[key]
    if (typeof v === 'string' && v.length > 0) return v
  }
  return ''
}

/** Parse one `todo_progress` entry; anything else is dropped. */
function parseTodo(value: unknown): TodoItem | null {
  if (!value || typeof value !== 'object') return null
  const rec = value as Record<string, unknown>
  const content = typeof rec['content'] === 'string' ? rec['content'] : ''
  if (content.length === 0) return null
  const status = rec['status']
  return {
    content,
    status: status === 'completed' ? 'completed' : status === 'in_progress' ? 'in_progress' : 'pending',
  }
}

/** Parse a design-stage announcement (`kind: "progress"`). */
function parseNote(value: Record<string, unknown>): ProgressNote | null {
  const message = typeof value['message'] === 'string' ? value['message'].trim() : ''
  if (message.length === 0) return null
  const phase = value['phase']
  const stage = typeof value['stage'] === 'string' ? value['stage'] : ''
  return {
    phase: phase === 'complete' ? 'complete' : phase === 'error' ? 'error' : 'start',
    stage,
    message,
    ts: typeof value['ts'] === 'number' && Number.isFinite(value['ts']) ? value['ts'] : Date.now(),
  }
}

export interface HandleEventResult {
  text?: string
  finished?: boolean
  error?: string
  /** Execution-trace events decoded from an AG-UI `CUSTOM` frame. */
  trace?: TraceEvent[]
  /** Set when `state` was mutated, so the caller can resample progress. */
  stateChanged?: boolean
  /** Rolling todo list from the system-design agent. */
  todos?: TodoItem[]
  /** Human-readable stage announcement from the system-design agent. */
  note?: ProgressNote
  /** `RUN_STARTED` — reset any per-run bookkeeping. */
  runStarted?: boolean
}

/**
 * Handle one decoded SSE event, mutating `state` and returning any text /
 * lifecycle signals for the caller to aggregate.
 *
 * `tracker` is required only for agents that report progress through the
 * standard AG-UI tool-call lifecycle instead of `CUSTOM` trace events —
 * that is, `modular_circuit` (system design).
 */
export function handleEvent(
  evt: unknown,
  state: Record<string, unknown>,
  tracker?: ToolCallTracker,
): HandleEventResult {
  if (!evt || typeof evt !== 'object') return {}
  const record = evt as {
    type?: unknown
    snapshot?: unknown
    delta?: unknown
    error?: unknown
    message?: unknown
    /** `CUSTOM` only — the custom event name, e.g. `SCHEMATIC_GENERATOR_TRACE`. */
    name?: unknown
    /** `CUSTOM` only — the payload; here one (or many) `TraceEvent`s. */
    value?: unknown
  }
  const rec = evt as Record<string, unknown>
  const type = record.type
  if (type === 'STATE_SNAPSHOT') {
    if (record.snapshot && typeof record.snapshot === 'object') {
      for (const key of Object.keys(state)) {
        delete state[key]
      }
      Object.assign(state, record.snapshot)
    }
    return { stateChanged: true }
  }
  if (type === 'STATE_DELTA') {
    applyDelta(record.delta, state)
    return { stateChanged: true }
  }
  if (type === 'RUN_STARTED') {
    tracker?.reset()
    return { runStarted: true }
  }
  // ── standard AG-UI tool-call lifecycle ────────────────────────────────
  // This is how `modular_circuit` reports its stack. The schematic agent uses
  // CUSTOM trace events for the same purpose, so `tracker` is only supplied
  // for the system tool and these branches stay inert otherwise.
  if (type === 'TOOL_CALL_START' && tracker) {
    const id = strField(rec, 'toolCallId', 'tool_call_id')
    const name = strField(rec, 'toolCallName', 'tool_call_name') || 'unknown'
    return { trace: [tracker.start(id, name)] }
  }
  if (type === 'TOOL_CALL_END' && tracker) {
    const id = strField(rec, 'toolCallId', 'tool_call_id')
    const ev = tracker.end(id)
    return ev ? { trace: [ev] } : {}
  }
  if (type === 'CUSTOM') {
    const name = typeof record.name === 'string' ? record.name : ''
    // System-design progress: a todo list and/or a stage announcement. Neither
    // is a TraceEvent, so it must be checked BEFORE the trace-name test —
    // `SYSTEM_DESIGN_EVENT` does not end in `_TRACE` and would be dropped.
    if (name === SYSTEM_DESIGN_EVENT_NAME) {
      const value = record.value
      if (value && typeof value === 'object') {
        const payload = value as Record<string, unknown>
        if (payload['kind'] === 'todo_progress' && Array.isArray(payload['todos'])) {
          const todos: TodoItem[] = []
          for (const item of payload['todos']) {
            const todo = parseTodo(item)
            if (todo) todos.push(todo)
          }
          return todos.length > 0 ? { todos } : {}
        }
        if (payload['kind'] === 'progress') {
          const note = parseNote(payload)
          return note ? { note } : {}
        }
      }
      return {}
    }
    if (!isTraceEventName(name)) return {}
    const events = collectTraceEvents(record.value)
    return events.length > 0 ? { trace: events } : {}
  }
  if (type === 'TEXT_MESSAGE_CONTENT') {
    return { text: typeof (evt as { delta?: unknown }).delta === 'string' ? (evt as { delta: string }).delta : '' }
  }
  if (type === 'RUN_FINISHED') {
    return { finished: true }
  }
  if (type === 'RUN_ERROR') {
    return { error: typeof record.error === 'string' ? record.error : (typeof record.message === 'string' ? record.message : 'unknown run error') }
  }
  return {}
}

/**
 * Live stream accumulator. The optional callbacks fire as each event arrives
 * rather than only at the end — that is what makes a 10-minute run report
 * progress while it is still running.
 */
interface Accumulator {
  text: string
  finished: boolean
  error: string
  trace: TraceEvent[]
  /** Called with each batch of trace events, immediately as they decode. */
  onTrace?: (events: TraceEvent[]) => void
  /** Called after any state mutation, so the progress ladder can resample. */
  onState?: (state: Record<string, unknown>) => void
  /** Called with a fresh todo list from the system-design agent. */
  onTodos?: (todos: TodoItem[]) => void
  /** Called with each stage announcement from the system-design agent. */
  onNote?: (note: ProgressNote) => void
  /**
   * Tool-call lifecycle → trace adapter. Present only for agents that report
   * their stack through `TOOL_CALL_START`/`TOOL_CALL_END`.
   */
  tracker?: ToolCallTracker
}

/** Parse one `data: …` SSE block into event(s) and route them through `handleEvent`. */
function dispatchRaw(raw: string, state: Record<string, unknown>, acc: Accumulator): void {
  const lines = raw.split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('data:')) continue
    const payload = trimmed.slice(5).trim()
    if (!payload) continue
    let evt: unknown
    try {
      evt = JSON.parse(payload)
    } catch {
      continue // keep-alives / comments are ignored
    }
    const r = handleEvent(evt, state, acc.tracker)
    if (r.text) acc.text += r.text
    if (r.finished) acc.finished = true
    if (r.error) acc.error = r.error
    if (r.trace && r.trace.length > 0) {
      for (const ev of r.trace) acc.trace.push(ev)
      acc.onTrace?.(r.trace)
    }
    if (r.todos && r.todos.length > 0) acc.onTodos?.(r.todos)
    if (r.note) acc.onNote?.(r.note)
    if (r.stateChanged) acc.onState?.(state)
  }
}

/** Decode a chunk, split on SSE boundaries, dispatch complete events, return
 *  the unterminated remainder. */
function feed(chunkStr: string, state: Record<string, unknown>, leftover: string, acc: Accumulator): string {
  const combined = leftover + chunkStr
  const parts = combined.split(/\r?\n\r?\n/)
  const newLeftover = parts.pop() || ''
  for (const raw of parts) {
    if (raw.trim().length === 0) continue
    dispatchRaw(raw, state, acc)
  }
  return newLeftover
}

export interface ConsumeOptions {
  signal?: AbortSignal | null
  timeoutMs?: number
  fetchImpl?: typeof fetch
  /** Live execution-trace events, pushed as each `CUSTOM` frame decodes. */
  onTrace?: (events: TraceEvent[]) => void
  /** Called after every state mutation (snapshot or delta), for the stage ladder. */
  onState?: (state: Record<string, unknown>) => void
  /** Called with a fresh todo list from the system-design agent. */
  onTodos?: (todos: TodoItem[]) => void
  /** Called with each human-readable stage announcement. */
  onNote?: (note: ProgressNote) => void
  /**
   * Invoked once when the design API rejects the request with HTTP 401, i.e. the
   * supplied `x-user-token` is dead. Hook for reactive invalidation: the caller
   * clears its credential cache so the next request re-resolves instead of
   * replaying a dead token (spec §6.5).
   */
  onUnauthorized?: () => void
  /**
   * Synthesize trace events from the standard AG-UI `TOOL_CALL_START` /
   * `TOOL_CALL_END` lifecycle.
   *
   * **Only enable this for `modular_circuit` (system design).** The schematic
   * agent reports the same calls through `CUSTOM` trace events, so enabling
   * both would double every row in the stack.
   */
  toolCallTrace?: boolean
}

/**
 * POST to the CopilotKit endpoint and consume the SSE stream until it ends or
 * the budget elapses, accumulating the agent state.
 */
export async function consumeCopilotkit(
  url: string,
  body: Record<string, unknown>,
  headers: Record<string, string>,
  options: ConsumeOptions = {},
): Promise<{ state: Record<string, unknown>; finished: boolean; text: string; trace: TraceEvent[] }> {
  const { signal, timeoutMs = HTTP_TIMEOUT_MS, fetchImpl = fetch } = options
  const controller = new AbortController()
  const timer = setTimeout(
    () => controller.abort(new Error('schematic-gen: the design agent did not finish within ' + timeoutMs + 'ms')),
    timeoutMs,
  )
  let onAbort: (() => void) | null = null
  if (signal) {
    if (signal.aborted) controller.abort()
    else {
      onAbort = () => controller.abort()
      signal.addEventListener('abort', onAbort, { once: true })
    }
  }

  let res: Response
  try {
    res = await fetchImpl(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    })
  } catch (err) {
    clearTimeout(timer)
    if (onAbort && signal) signal.removeEventListener('abort', onAbort)
    throw new Error('schematic-gen: failed to reach the design API: ' + String((err as Error)?.message || err))
  }

  if (!res || !res.ok) {
    clearTimeout(timer)
    if (onAbort && signal) signal.removeEventListener('abort', onAbort)
    if (res && res.status === 401) {
      try { options.onUnauthorized?.() } catch { /* invalidation is best-effort */ }
    }
    throw new Error('schematic-gen: the design API returned HTTP ' +
      String(res && res.status) + ' (expected 200 with an SSE stream)')
  }
  if (!res.body || typeof res.body.getReader !== 'function') {
    clearTimeout(timer)
    if (onAbort && signal) signal.removeEventListener('abort', onAbort)
    throw new Error('schematic-gen: the design API response had no stream body')
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  const state: Record<string, unknown> = {}
  const acc: Accumulator = {
    text: '',
    finished: false,
    error: '',
    trace: [],
    onTrace: options.onTrace,
    onState: options.onState,
    onTodos: options.onTodos,
    onNote: options.onNote,
    tracker: options.toolCallTrace ? new ToolCallTracker() : undefined,
  }

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buf = feed(decoder.decode(value, { stream: true }), state, buf, acc)
    }
    // Flush a final event not terminated by a blank line.
    if (buf.length > 0) dispatchRaw(buf, state, acc)
  } finally {
    clearTimeout(timer)
    if (onAbort && signal) signal.removeEventListener('abort', onAbort)
    try { await reader.cancel() } catch { /* already done */ }
  }

  if (acc.error) {
    throw new Error('schematic-gen: the design agent reported an error: ' + acc.error +
      (acc.text ? ' — ' + acc.text.slice(0, 300) : ''))
  }
  return { state, finished: acc.finished, text: acc.text, trace: acc.trace }
}

export interface ExportZipOptions {
  signal?: AbortSignal | null
  timeoutMs?: number
  fetchImpl?: typeof fetch
}

/**
 * POST the module graph to the production export-zip route and return the zip
 * as a Buffer. The route reads `req.json()` as the `MODULE_GRAPH` and responds
 * with `application/zip`.
 */
export async function exportModuleGraphZip(
  exportZipUrl: string,
  moduleGraph: Record<string, unknown>,
  config: SchematicGenConfig,
  account: EdaAccount,
  options: ExportZipOptions = {},
): Promise<Buffer> {
  const { signal, timeoutMs = HTTP_TIMEOUT_MS, fetchImpl = fetch } = options
  const controller = new AbortController()
  const timer = setTimeout(
    () => controller.abort(new Error('schematic-gen: the export-zip service did not respond within ' + timeoutMs + 'ms')),
    timeoutMs,
  )
  let onAbort: (() => void) | null = null
  if (signal) {
    if (signal.aborted) controller.abort()
    else {
      onAbort = () => controller.abort()
      signal.addEventListener('abort', onAbort, { once: true })
    }
  }

  let res: Response
  try {
    res = await fetchImpl(exportZipUrl, {
      method: 'POST',
      headers: buildExportHeaders(config, account),
      body: JSON.stringify(moduleGraph),
      signal: controller.signal,
    })
  } catch (err) {
    clearTimeout(timer)
    if (onAbort && signal) signal.removeEventListener('abort', onAbort)
    throw new Error('schematic-gen: failed to export the module graph to zip: ' +
      String((err as Error)?.message || err))
  } finally {
    clearTimeout(timer)
    if (onAbort && signal) signal.removeEventListener('abort', onAbort)
  }

  if (!res || !res.ok) {
    let detail = ''
    try {
      const j = (await res.json()) as { error?: unknown }
      detail = typeof j.error === 'string' ? j.error : ''
    } catch { /* not JSON */ }
    throw new Error('schematic-gen: the export-zip service returned HTTP ' +
      String(res && res.status) + (detail ? ' — ' + detail : ''))
  }
  const ab = await res.arrayBuffer()
  return Buffer.from(ab)
}