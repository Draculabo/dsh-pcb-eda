/**
 * Flat trace frames → nested call stack (browser half).
 *
 * Port of `hq-eda-ai`'s prototype
 * (`docs/prototype/tool_call_stack_prototype.tsx#buildTree`), adapted to the
 * paired {@link TraceFrame} list produced on the node side rather than to raw
 * events.
 *
 * Each frame carries a `parent>child>leaf` breadcrumb in `path`. This module
 * turns those breadcrumbs into a tree, synthesizing intermediate frames for
 * path segments that never emitted an event of their own — exactly the
 * "Recursive Depth Model" the prototype describes.
 */
import { stripTaskIds, type TraceFrame, type TraceStatus } from '../trace.js'

/**
 * One node of the rendered call stack.
 *
 * A row is collapsed — i.e. represents several invocations of the same
 * logical call at the same visible scope — whenever `repeat > 1`. The runtime
 * keeps the LATEST frame on `frame`, so the duration column shows the most
 * recent call's time, and the ×N badge surfaces how many calls actually ran
 * (the schematic agent fires `ic_search` fourteen times in a row to confirm
 * the part pick; hq-eda-ai shows ONE row for that).
 */
export interface StackNode {
  /** Stable React key. Path-derived for synthesized nodes, frame id otherwise. */
  id: string
  /** Display name (`node:plan` for graph nodes, bare name for tools). */
  name: string
  status: TraceStatus
  /** 0 for a root; each nesting level adds one. */
  depth: number
  /**
   * Start of the LATEST invocation. For a one-off this is also the start of
   * the only invocation. The card uses this together with `finishedAt` to
   * compute the latest call's duration.
   */
  startedAt: number
  finishedAt?: number
  children: StackNode[]
  /**
   * How many times this exact call ran. `1` for a one-off.
   *
   * Every repeat — whether from a LangGraph `*_TRACE` event with no task id
   * (schematic) or from the AG-UI tool-call lifecycle with a hidden
   * `::task:<id>` (system design) — lands on the same leaf, keyed on the
   * STRIPPED visible path. The card surfaces the count via a `×N` pill.
   */
  repeat: number
  /**
   * The frame this node was built from. `undefined` for synthesized
   * intermediate nodes, which exist only to hold the nesting shape.
   */
  frame?: TraceFrame
}

/**
 * Build the call-stack tree.
 *
 * Path prefixes are shared, so a parent emitted by five different children
 * is one node, not five. Repeated calls of the same tool at the same scope
 * collapse into one row — both the schematic CUSTOM-trace stream (no task
 * ids) and the system-design AG-UI lifecycle (hidden `::task:<id>` in each
 * instance path) end up with one node per logical call.
 */
export function buildTree(frames: readonly TraceFrame[]): StackNode[] {
  const roots: StackNode[] = []
  const byPath = new Map<string, StackNode>()

  for (const frame of frames) {
    const segments = frame.path.split('>').map((s) => s.trim()).filter((s) => s.length > 0)
    if (segments.length === 0) {
      continue
    }

    // 1. Walk every path prefix, creating intermediate nodes as needed.
    //    Key the map on the *visible* path (with any `::task:<id>` marker
    //    stripped) so repeats land on one node instead of proliferating into
    //    a sibling per invocation.
    let parent: StackNode | null = null
    for (let i = 0; i < segments.length; i++) {
      const raw = segments.slice(0, i + 1).join('>')
      const pathId = stripTaskIds(raw)
      let node = byPath.get(pathId)
      if (!node) {
        node = {
          id: `path:${pathId}`,
          name: stripTaskIds(segments[i]!),
          status: 'running',
          depth: i,
          startedAt: frame.startedAt,
          children: [],
          repeat: 1,
        }
        byPath.set(pathId, node)
        if (parent) {
          parent.children.push(node)
        } else {
          roots.push(node)
        }
      }
      parent = node
    }

    if (!parent) {
      continue
    }

    // 2. Decorate the leaf with this frame.
    if (!parent.frame) {
      parent.frame = frame
      // Prefer the frame's own display name: for a graph node the last path
      // segment is the bare node name while the frame name is `node:<name>`.
      parent.name = frame.name
      parent.status = frame.status
      parent.startedAt = frame.startedAt
      if (frame.finishedAt !== undefined) {
        parent.finishedAt = frame.finishedAt
      }
      continue
    }

    // A repeat of a call we already show: bump the counter and let the
    // latest invocation win for status + duration.
    parent.repeat += 1
    parent.frame = frame
    parent.name = frame.name
    parent.status = frame.status
    parent.startedAt = frame.startedAt
    if (frame.finishedAt !== undefined) {
      parent.finishedAt = frame.finishedAt
    } else {
      delete parent.finishedAt
    }
  }

  return roots
}

/** Count frames by status, for the `done/total` badge on a parent. */
export function countStatus(node: StackNode): { finished: number; total: number; failed: number } {
  let finished = 0
  let total = 0
  let failed = 0
  const walk = (n: StackNode): void => {
    for (const child of n.children) {
      total += 1
      if (child.status === 'finished') {
        finished += 1
      }
      if (child.status === 'failed') {
        failed += 1
      }
      walk(child)
    }
  }
  walk(node)
  return { finished, total, failed }
}

/**
 * Format a span as `123ms` under a second and `4.2s` above, mirroring the
 * prototype's duration formatter.
 */
export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms) || ms < 0) {
    return ''
  }
  if (ms < 1000) {
    return `${Math.round(ms)}ms`
  }
  return `${(ms / 1000).toFixed(1)}s`
}

/** Format an elapsed wall-clock span as `m:ss` — used by the run timer. */
export function formatElapsed(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) {
    return '0:00'
  }
  const total = Math.floor(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
