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
import { hasTaskId, stripTaskIds, type TraceFrame, type TraceStatus } from '../trace.js'

/** One node of the rendered call stack. */
export interface StackNode {
  /** Stable React key. Path-derived for synthesized nodes, frame id otherwise. */
  id: string
  /** Display name (`node:plan` for graph nodes, bare name for tools). */
  name: string
  status: TraceStatus
  /** 0 for a root; each nesting level adds one. */
  depth: number
  startedAt: number
  finishedAt?: number
  children: StackNode[]
  /**
   * How many times this exact call ran. `1` for a one-off.
   *
   * Spans synthesized from the AG-UI tool-call lifecycle carry a hidden
   * `::task:<id>` in their path, so a search tool invoked 200 times would
   * otherwise produce 200 identical rows. They collapse into one row that
   * shows the latest state plus a `×N` badge.
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
 * Path prefixes are shared, so a parent emitted by five different children is
 * one node, not five. A path segment that receives more than one frame of its
 * own (the same tool invoked repeatedly at the same scope — very common during
 * part search) gets a distinct sibling child per extra frame, so repeated
 * calls stay visible instead of silently collapsing into one row.
 */
export function buildTree(frames: readonly TraceFrame[]): StackNode[] {
  const roots: StackNode[] = []
  const byPath = new Map<string, StackNode>()
  let minted = 0

  for (const frame of frames) {
    const segments = frame.path.split('>').map((s) => s.trim()).filter((s) => s.length > 0)
    if (segments.length === 0) continue
    // Lifecycle-synthesized spans carry `::task:<id>`; collapse their repeats.
    const collapse = hasTaskId(frame.path)

    // 1. Walk every path prefix, creating intermediate nodes as needed.
    let parent: StackNode | null = null
    for (let i = 0; i < segments.length; i++) {
      const raw = segments.slice(0, i + 1).join('>')
      // `::task:<id>` makes every invocation unique; key on the visible path
      // so repeats land on one node instead of proliferating.
      const pathId = hasTaskId(raw) ? stripTaskIds(raw) : raw
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
        if (parent) parent.children.push(node)
        else roots.push(node)
      }
      parent = node
    }

    if (!parent) continue

    // 2. Decorate the leaf with this frame.
    if (!parent.frame) {
      parent.frame = frame
      // Prefer the frame's own display name: for a graph node the last path
      // segment is the bare node name while the frame name is `node:<name>`.
      parent.name = frame.name
      parent.status = frame.status
      parent.startedAt = frame.startedAt
      if (frame.finishedAt !== undefined) parent.finishedAt = frame.finishedAt
      continue
    }

    // A lifecycle-synthesized repeat of a call we already show: latest state
    // wins, and the counter surfaces how many times it actually ran.
    if (collapse) {
      parent.frame = frame
      parent.name = frame.name
      parent.status = frame.status
      parent.startedAt = frame.startedAt
      parent.repeat += 1
      if (frame.finishedAt !== undefined) parent.finishedAt = frame.finishedAt
      else delete parent.finishedAt
      continue
    }

    // This path segment already owns a frame (a repeated call from CUSTOM
    // trace events, which have no task id) — mint a sibling so the repeat is
    // not lost.
    const node: StackNode = {
      id: frame.id || `frame-${minted++}`,
      name: frame.name,
      status: frame.status,
      depth: parent.depth + 1,
      startedAt: frame.startedAt,
      children: [],
      repeat: 1,
      frame,
    }
    if (frame.finishedAt !== undefined) node.finishedAt = frame.finishedAt
    parent.children.push(node)
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
      if (child.status === 'finished') finished += 1
      if (child.status === 'failed') failed += 1
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
  if (ms === null || ms === undefined || !Number.isFinite(ms) || ms < 0) return ''
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

/** Format an elapsed wall-clock span as `m:ss` — used by the run timer. */
export function formatElapsed(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '0:00'
  const total = Math.floor(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
