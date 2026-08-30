/**
 * `@huaqiu/dsh-tool-schematic-gen` — execution-trace model for the eda.cn
 * design agents.
 *
 * Port of the `hq-eda-ai` schematic-gen trace contract
 * (`packages/agents/schematic-gen/src/utils/trace.ts`) plus its frontend
 * start/end pairing logic
 * (`apps/web/src/components/sch_sub_gen/TraceTimeline.tsx#buildStatusEntries`).
 *
 * The eda.cn CopilotKit endpoint streams AG-UI `CUSTOM` events, each carrying
 * one `TraceEvent` (LangGraph `custom` stream mode):
 *
 *   data: {"type":"CUSTOM","name":"SCHEMATIC_GENERATOR_TRACE",
 *          "value":{"kind":"tool","phase":"start","scope":"schematicDesign",
 *                   "name":"search_parts","ts":1770000000000}}
 *
 * `scope` is a `parent>child` breadcrumb and is the ONLY hierarchical signal
 * the backend gives us — it is what the card turns into a call stack.
 *
 * @module @huaqiu/dsh-tool-schematic-gen
 */

// ── Wire model ─────────────────────────────────────────────────────────────

export type TracePhase = 'start' | 'end'

/** A LangGraph graph node entering/leaving. */
export interface NodeTraceEvent {
  kind: 'node'
  phase: TracePhase
  /** Graph node name. */
  node: string
  ts: number
  /**
   * Full scope path (`parent>this`). Older backend builds omit it; the
   * frontend then degrades to the node's own name (see {@link tracePath}).
   */
  scope?: string
  /** Optional human note emitted by the node. */
  note?: string
}

/** A tool call entering/leaving. */
export interface ToolTraceEvent {
  kind: 'tool'
  phase: TracePhase
  /** Scope path of the CALLER (`parent`), not including `name`. */
  scope: string
  name: string
  ts: number
  /**
   * Instance path (`parent>leaf::task:<toolCallId>`), present only for spans
   * synthesized from the AG-UI tool-call lifecycle. The hidden `::task:` suffix
   * makes repeated calls of the SAME tool distinct so retries are not lost,
   * while {@link traceName} keeps the display name clean.
   */
  path?: string
  /** Absent means success; only `false` marks failure. */
  ok?: boolean
}

export type TraceEvent = NodeTraceEvent | ToolTraceEvent

/**
 * Custom-event names the eda.cn agents are known to use. Matching is
 * deliberately tolerant: any name ending in `_TRACE` is accepted too, so a
 * backend rename does not silently kill progress.
 */
export const KNOWN_TRACE_EVENT_NAMES: readonly string[] = [
  'SCHEMATIC_GENERATOR_TRACE',
  'SCHEMAGEN_TRACE',
  'MODULAR_CIRCUIT_TRACE',
  'MODULE_GEN_TRACE',
]

export function isTraceEventName(name: unknown): boolean {
  if (typeof name !== 'string' || name.length === 0) {
    return false
  }
  if (KNOWN_TRACE_EVENT_NAMES.includes(name)) {
    return true
  }
  return /_TRACE$/i.test(name)
}

// ── Parsing ────────────────────────────────────────────────────────────────

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

/**
 * Validate one decoded `CUSTOM` payload as a {@link TraceEvent}.
 * Returns `null` for anything else (interrupts, future event shapes).
 */
export function parseTraceEvent(value: unknown): TraceEvent | null {
  if (!isRecord(value)) {
    return null
  }
  const kind = value['kind']
  const phase = value['phase']
  const ts = value['ts']
  if (phase !== 'start' && phase !== 'end') {
    return null
  }
  const timestamp = typeof ts === 'number' && Number.isFinite(ts) ? ts : Date.now()

  if (kind === 'node') {
    const node = value['node']
    if (typeof node !== 'string' || node.length === 0) {
      return null
    }
    const ev: NodeTraceEvent = { kind: 'node', phase, node, ts: timestamp }
    const scope = value['scope']
    if (typeof scope === 'string' && scope.length > 0) {
      ev.scope = scope
    }
    const note = value['note']
    if (typeof note === 'string' && note.length > 0) {
      ev.note = note
    }
    return ev
  }

  if (kind === 'tool') {
    const name = value['name']
    if (typeof name !== 'string' || name.length === 0) {
      return null
    }
    const scope = value['scope']
    const ev: ToolTraceEvent = {
      kind: 'tool',
      phase,
      // Tolerate a missing scope by degrading to the tool's own name.
      scope: typeof scope === 'string' && scope.length > 0 ? scope : name,
      name,
      ts: timestamp,
    }
    const path = value['path']
    if (typeof path === 'string' && path.length > 0) ev.path = path
    if (value['ok'] === false) ev.ok = false
    return ev
  }

  return null
}

/**
 * Collect every {@link TraceEvent} inside one `CUSTOM` payload. The backend
 * normally writes one event per chunk, but array payloads are accepted so a
 * batched writer cannot drop the stream.
 */
export function collectTraceEvents(value: unknown): TraceEvent[] {
  if (Array.isArray(value)) {
    const out: TraceEvent[] = []
    for (const item of value) {
      const ev = parseTraceEvent(item)
      if (ev) {
        out.push(ev)
      }
    }
    return out
  }
  const ev = parseTraceEvent(value)
  return ev ? [ev] : []
}

// ── Path derivation ────────────────────────────────────────────────────────

/**
 * Canonical `a>b>c` path for one event — the breadcrumb the card nests by.
 *
 * Mirrors `TraceTimeline.buildStatusEntries`: a node's path is its own scope
 * (falling back to its name when the backend omits scope), while a tool's path
 * is its caller scope with the tool name appended.
 */
export function tracePath(ev: TraceEvent): string {
  if (ev.kind === 'node') {
    return ev.scope && ev.scope.length > 0 ? ev.scope : ev.node
  }
  // The instance path wins when present: it is the only breadcrumb that
  // distinguishes two calls of the same tool at the same scope.
  if (ev.path && ev.path.length > 0) return ev.path
  return ev.scope === ev.name ? ev.name : `${ev.scope}>${ev.name}`
}

/** Display name of one event (`node:foo` for nodes, bare name for tools). */
export function traceName(ev: TraceEvent): string {
  return ev.kind === 'node' ? `node:${ev.node}` : ev.name
}

// ── Start/end pairing ──────────────────────────────────────────────────────

export type TraceStatus = 'running' | 'finished' | 'failed'

/** One paired span: a stack frame the card can render. */
export interface TraceFrame {
  /** Stable synthetic id (`trace-<seq>`). */
  id: string
  /** Display key, e.g. `node:plan` or `search_parts`. */
  name: string
  /** Full `parent>child>leaf` breadcrumb used to nest the frame. */
  path: string
  status: TraceStatus
  startedAt: number
  finishedAt?: number
}

/**
 * Pair `start`/`end` events into {@link TraceFrame}s, preserving nesting via
 * `path`.
 *
 * Uses the same per-key open stack as `buildStatusEntries`, so nested calls
 * with the same name (a tool re-entered inside its own subtree) close in LIFO
 * order instead of cross-contaminating.
 */
export function pairTraceEvents(events: readonly TraceEvent[]): TraceFrame[] {
  const frames: TraceFrame[] = []
  const open = new Map<string, number[]>()
  let seq = 0

  for (const ev of events) {
    const name = traceName(ev)
    const path = tracePath(ev)
    // Key on the display name + path so two different subtrees using the same
    // tool name never share an open slot.
    const key = `${path}|${name}`

    if (ev.phase === 'start') {
      const stack = open.get(key)
      const index = frames.length
      if (stack) {
        stack.push(index)
      } else {
        open.set(key, [index])
      }
      frames.push({ id: `trace-${seq++}`, name, path, status: 'running', startedAt: ev.ts })
      continue
    }

    const stack = open.get(key)
    const index = stack?.pop()
    if (index === undefined) {
      continue
    }
    const failed = ev.kind === 'tool' && ev.ok === false
    frames[index] = {
      ...frames[index]!,
      status: failed ? 'failed' : 'finished',
      finishedAt: ev.ts,
    }
  }

  return frames
}

// ── AG-UI tool-call lifecycle ──────────────────────────────────────────────

/**
 * Marker appended to the leaf of a synthesized instance path. It is invisible
 * in the UI (stripped from display names and from the tree key) but makes each
 * invocation of a repeated tool a distinct path.
 */
export const TASK_MARK_RE = /::task:[^>]*/g

/** Strip the hidden `::task:<id>` suffixes from one path segment/path. */
export function stripTaskIds(path: string): string {
  return path.replace(TASK_MARK_RE, '')
}

/** True when a path was synthesized from the tool-call lifecycle. */
export function hasTaskId(path: string): boolean {
  return path.includes('::task:')
}

interface ActiveToolCall {
  semanticPath: string
  instancePath: string
}

/**
 * Convert the **standard AG-UI tool-call lifecycle** (`TOOL_CALL_START` /
 * `TOOL_CALL_END`) into {@link TraceEvent}s.
 *
 * This exists because the two eda.cn agents report progress differently:
 *
 *   - `schemagen` (schematic) emits LangGraph `custom`-stream `TraceEvent`s,
 *     republished as AG-UI `CUSTOM` events named `SCHEMATIC_GENERATOR_TRACE`.
 *   - `modular_circuit` (system design) does NOT emit those. Its stack is
 *     rebuilt by the agent server from LangGraph *tasks* and published as the
 *     ordinary AG-UI `TOOL_CALL_START` / `TOOL_CALL_END` pair — see
 *     `ModuleGenTraceProvider.onToolCallStartEvent` in hq-eda-ai.
 *
 * Without this adapter the system-design tool reported no progress at all.
 *
 * Port of `createToolInstancePath` + `toToolTraceEvent` in
 * `apps/web/src/lib/modular_circuit/context/ModuleGenTraceProvider.tsx`.
 */
export class ToolCallTracker {
  private readonly active = new Map<string, ActiveToolCall>()

  /** Forget every open call — invoke on `RUN_STARTED`. */
  reset(): void {
    this.active.clear()
  }

  /**
   * Build an instance path, reusing the deepest currently-open call whose
   * semantic path is a prefix of this one so nested tools nest properly.
   */
  private instancePath(semanticPath: string, toolCallId: string): string {
    let parent: ActiveToolCall | undefined
    for (const candidate of this.active.values()) {
      if (!semanticPath.startsWith(`${candidate.semanticPath}>`)) continue
      if (!parent || candidate.semanticPath.length > parent.semanticPath.length) {
        parent = candidate
      }
    }
    const relative = parent ? semanticPath.slice(parent.semanticPath.length + 1) : semanticPath
    const segments = relative.split('>').map((s) => s.trim()).filter((s) => s.length > 0)
    const leaf = segments.length - 1
    if (leaf >= 0) segments[leaf] = `${segments[leaf]}::task:${toolCallId}`
    const current = segments.join('>')
    return parent ? `${parent.instancePath}>${current}` : current
  }

  /** Split a semantic path into its parent scope and leaf display name. */
  private static split(semanticPath: string): { scope: string; name: string } {
    const segments = semanticPath.split('>').map((s) => s.trim()).filter((s) => s.length > 0)
    const name = segments[segments.length - 1] || 'unknown'
    const scope = segments.length > 1 ? segments.slice(0, -1).join('>') : name
    return { scope, name }
  }

  /** Open a tool call. Returns the `start` trace event. */
  start(toolCallId: string, semanticPath: string, ts: number = Date.now()): TraceEvent {
    const instancePath = this.instancePath(semanticPath, toolCallId)
    if (toolCallId) this.active.set(toolCallId, { semanticPath, instancePath })
    const { scope, name } = ToolCallTracker.split(semanticPath)
    return { kind: 'tool', phase: 'start', scope, name, path: instancePath, ts }
  }

  /**
   * Close a tool call. Returns the `end` trace event, or `null` when the id
   * was never opened (a late/duplicate frame we must not invent a span for).
   */
  end(toolCallId: string, ts: number = Date.now()): TraceEvent | null {
    const known = this.active.get(toolCallId)
    if (!known) return null
    this.active.delete(toolCallId)
    const { scope, name } = ToolCallTracker.split(known.semanticPath)
    return { kind: 'tool', phase: 'end', scope, name, path: known.instancePath, ts, ok: true }
  }

  /** Ids still open. Exposed for diagnostics/tests. */
  get openIds(): string[] {
    return [...this.active.keys()]
  }
}
