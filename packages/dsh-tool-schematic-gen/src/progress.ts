/**
 * `@huaqiu/dsh-tool-schematic-gen` — live run progress (node half).
 *
 * Long design runs take 10+ minutes. The tool body sits on the node half and
 * returns once, so the browser card would otherwise show a frozen label for
 * the whole run. This module is the node side of the fix:
 *
 *   tool body ──pushTrace/updateState──▶ ProgressStore (keyed by callId)
 *                                             │
 *                        ctx.webServer ◀──────┘  GET …/progress/<callId>
 *                                             │
 *                                    browser card polls
 *
 * **Why `callId` is the key.** `defineTool`'s second argument is a
 * `ToolRunContext`, which extends `ToolExecutionInput` and therefore carries
 * `callId`. The `tool.call.toolview` slot passes the very same string to the
 * browser component as `ToolCallOwnerProps.callId` — documented in DSH as
 * "stable across running and settled forms". So no hand-rolled correlation id
 * has to travel through the tool result.
 *
 * **Two independent progress signals**, because the backend is not guaranteed
 * to emit trace events:
 *   1. `frames` — a real call stack, when AG-UI `CUSTOM` trace events arrive.
 *   2. `stage`  — a coarse ladder derived from the agent's own state keys,
 *                 which always arrives via `STATE_SNAPSHOT`/`STATE_DELTA`.
 * The card renders the stack when it exists and the ladder otherwise, and
 * always shows the elapsed timer.
 *
 * @module @huaqiu/dsh-tool-schematic-gen
 */
import { pairTraceEvents, type TraceEvent, type TraceFrame } from './trace.js'

export type RunStatus = 'running' | 'completed' | 'failed'
export type RunKind = 'schematic' | 'system'

/**
 * One item of the rolling todo list the system-design agent publishes
 * (`SYSTEM_DESIGN_EVENT` / `kind: "todo_progress"`).
 */
export interface TodoItem {
  content: string
  status: 'pending' | 'in_progress' | 'completed'
}

/**
 * A human-readable stage announcement from the system-design agent's
 * `emitWorkflowProgress` middleware — e.g. "正在整理需求并生成系统设计方案。".
 *
 * This is the ONLY narrative progress signal the system agent gives us; the
 * coarse ladder below is derived from state keys and says nothing about what
 * the agent is actually doing right now.
 */
export interface ProgressNote {
  phase: 'start' | 'complete' | 'error'
  /** Tool/stage id, e.g. `design_plan_gen`. Empty when the agent omits it. */
  stage: string
  message: string
  ts: number
}

/** One rung of the coarse progress ladder. `key` is an i18n key suffix. */
export interface StageSpec {
  key: string
  reached(state: Record<string, unknown>): boolean
}

/** A non-empty value: null/empty-string/empty-array/empty-object/false are not. */
function filled(v: unknown): boolean {
  if (v === null || v === undefined || v === false) {
    return false
  }
  if (typeof v === 'string') {
    return v.trim().length > 0
  }
  if (Array.isArray(v)) {
    return v.length > 0
  }
  if (typeof v === 'object') {
    return Object.keys(v as Record<string, unknown>).length > 0
  }
  return true
}

/** Connections live one level down: `connect_result.connections`. */
function connectionsFilled(state: Record<string, unknown>): boolean {
  const cr = state['connect_result']
  if (cr && typeof cr === 'object') {
    return filled((cr as Record<string, unknown>)['connections'])
  }
  return false
}

/**
 * Stage ladders, ordered. Derived from the agent's own initial state
 * (`emptySchematicState` / `emptySystemState` in config.ts), so a stage is
 * "reached" exactly when the agent has written that part of the design.
 */
export const STAGE_LADDERS: Record<RunKind, readonly StageSpec[]> = {
  schematic: [
    { key: 'requirement', reached: (s) => filled(s['requirement']) },
    { key: 'architecture', reached: (s) => filled(s['architecture']) },
    { key: 'circuit', reached: (s) => filled(s['circuit']) },
    { key: 'report', reached: (s) => filled(s['report']) || filled(s['reportStage']) },
    { key: 'output', reached: (s) => filled(s['schFiles']) },
  ],
  system: [
    { key: 'plan', reached: (s) => filled(s['design_plan']) },
    { key: 'search', reached: (s) => filled(s['search_plan']) },
    { key: 'bom', reached: (s) => filled(s['bom_list']) },
    { key: 'modules', reached: (s) => filled(s['module_list']) },
    { key: 'connect', reached: connectionsFilled },
    { key: 'erc', reached: (s) => s['erc_passed'] === true },
    { key: 'export', reached: (s) => filled(s['module_graph']) },
  ],
}

/** Resolve how far a run has got, purely from the agent state snapshot. */
export function stageOf(
  kind: RunKind,
  state: Record<string, unknown>,
): { index: number; total: number; key: string } | null {
  const ladder = STAGE_LADDERS[kind]
  if (!ladder || ladder.length === 0) {
    return null
  }
  let reached = 0
  for (const spec of ladder) {
    if (!spec.reached(state)) {
      break
    }
    reached += 1
  }
  // `index` is the stage currently IN PROGRESS (0-based); clamp to the last
  // stage once everything is reached.
  const index = Math.min(reached, ladder.length - 1)
  return { index, total: ladder.length, key: ladder[index]!.key }
}

/** Hard cap on retained frames so a pathological stream cannot grow unbounded. */
export const MAX_FRAMES = 500

/**
 * Structural sink the tool bodies depend on, so `tools.ts` never imports the
 * concrete store. Every method tolerates an unknown `callId`.
 */
export interface RunProgress {
  start(callId: string, toolName: string, kind: RunKind): void
  pushTrace(callId: string, events: readonly TraceEvent[]): void
  updateState(callId: string, state: Record<string, unknown>): void
  setTodos(callId: string, todos: readonly TodoItem[]): void
  setNote(callId: string, note: ProgressNote): void
  finish(callId: string): void
  fail(callId: string, message: string): void
}

/** The document the browser polls for. */
export interface ProgressDoc {
  callId: string
  toolName: string
  kind: RunKind
  status: RunStatus
  startedAt: number
  updatedAt: number
  /** Real call stack, present only when the backend emits trace events. */
  frames: TraceFrame[]
  /** Coarse ladder, always present while state has been seen. */
  stage: { index: number; total: number; key: string } | null
  /** Rolling todo list. System-design only; `null` for schematic runs. */
  todos: TodoItem[] | null
  /** Latest stage announcement. System-design only; `null` until one arrives. */
  note: ProgressNote | null
  /** Failure text, set by `fail`. */
  error: string | null
}

export interface ProgressStoreOptions {
  /** Age after which a run is forgotten. Default 30 min (matches the SSE budget). */
  ttlMs?: number
  now?: () => number
}

interface RunRecord {
  doc: ProgressDoc
  /** Raw trace events retained only long enough to re-pair frames. */
  events: TraceEvent[]
  state: Record<string, unknown>
}

/**
 * In-memory progress registry. Deliberately NOT persisted: progress is only
 * meaningful while the run is live, and a stale doc after a restart would be
 * worse than none.
 */
export class ProgressStore {
  private readonly runs = new Map<string, RunRecord>()
  private readonly ttlMs: number
  private readonly now: () => number

  constructor(options: ProgressStoreOptions = {}) {
    this.ttlMs = options.ttlMs ?? 30 * 60 * 1000
    this.now = options.now ?? (() => Date.now())
  }

  /** Register a run. Safe to call twice for the same id (idempotent). */
  start(callId: string, toolName: string, kind: RunKind): void {
    if (!callId) {
      return
    }
    if (this.runs.has(callId)) {
      return
    }
    const ts = this.now()
    this.runs.set(callId, {
      doc: {
        callId,
        toolName,
        kind,
        status: 'running',
        startedAt: ts,
        updatedAt: ts,
        frames: [],
        stage: null,
        todos: null,
        note: null,
        error: null,
      },
      events: [],
      state: {},
    })
  }

  /** Append trace events and re-pair the frame list. */
  pushTrace(callId: string, events: readonly TraceEvent[]): void {
    const rec = this.runs.get(callId)
    if (!rec || events.length === 0) {
      return
    }
    for (const ev of events) {
      rec.events.push(ev)
    }
    if (rec.events.length > MAX_FRAMES * 4) {
      // Keep the tail: newer spans are what the user is waiting on. Frames
      // already derived from dropped starts simply stay unclosed.
      rec.events.splice(0, rec.events.length - MAX_FRAMES * 4)
    }
    rec.doc.frames = pairTraceEvents(rec.events).slice(-MAX_FRAMES)
    rec.doc.updatedAt = this.now()
  }

  /** Merge an agent state snapshot and re-evaluate the stage ladder. */
  updateState(callId: string, state: Record<string, unknown>): void {
    const rec = this.runs.get(callId)
    if (!rec) {
      return
    }
    Object.assign(rec.state, state)
    rec.doc.stage = stageOf(rec.doc.kind, rec.state)
    rec.doc.updatedAt = this.now()
  }

  /** Replace the todo list. Only ever set by the system-design agent. */
  setTodos(callId: string, todos: readonly TodoItem[]): void {
    const rec = this.runs.get(callId)
    if (!rec) return
    rec.doc.todos = todos.map((todo) => ({ ...todo }))
    rec.doc.updatedAt = this.now()
  }

  /** Record the latest stage announcement. */
  setNote(callId: string, note: ProgressNote): void {
    const rec = this.runs.get(callId)
    if (!rec) return
    // A later revision always wins, but never let an older one clobber it.
    if (rec.doc.note && note.ts < rec.doc.note.ts) return
    rec.doc.note = { ...note }
    rec.doc.updatedAt = this.now()
    // An `error` announcement is the closest thing to a live failure reason.
    if (note.phase === 'error' && rec.doc.status === 'running') {
      rec.doc.status = 'failed'
      rec.doc.error = note.message
    }
  }

  finish(callId: string): void {
    const rec = this.runs.get(callId)
    if (!rec) {
      return
    }
    rec.doc.status = 'completed'
    rec.doc.updatedAt = this.now()
    // Close any span still open — the stream ended, so nothing is running.
    for (const f of rec.doc.frames) {
      if (f.status === 'running') {
        f.status = 'finished'
        f.finishedAt = rec.doc.updatedAt
      }
    }
  }

  fail(callId: string, message: string): void {
    const rec = this.runs.get(callId)
    if (!rec) {
      return
    }
    rec.doc.status = 'failed'
    rec.doc.error = message
    rec.doc.updatedAt = this.now()
    // Blame only the spans that never closed — an already-finished span
    // succeeded before the failure surfaced.
    for (const f of rec.doc.frames) {
      if (f.status === 'running') {
        f.status = 'failed'
        f.finishedAt = rec.doc.updatedAt
      }
    }
  }

  /** Snapshot for the HTTP route, or `null` when unknown/expired. */
  get(callId: string): ProgressDoc | null {
    const rec = this.runs.get(callId)
    if (!rec) {
      return null
    }
    if (this.now() - rec.doc.updatedAt > this.ttlMs) {
      this.runs.delete(callId)
      return null
    }
    return rec.doc
  }

  /** Every live run. Used by the route when the caller has no callId. */
  list(): ProgressDoc[] {
    const out: ProgressDoc[] = []
    for (const callId of [...this.runs.keys()]) {
      const doc = this.get(callId)
      if (doc) {
        out.push(doc)
      }
    }
    return out
  }

  delete(callId: string): void {
    this.runs.delete(callId)
  }

  /** Drop expired runs. Returns how many were removed. */
  sweep(): number {
    const now = this.now()
    let removed = 0
    for (const [callId, rec] of [...this.runs]) {
      if (now - rec.doc.updatedAt > this.ttlMs) {
        this.runs.delete(callId)
        removed += 1
      }
    }
    return removed
  }

  get size(): number {
    return this.runs.size
  }
}
