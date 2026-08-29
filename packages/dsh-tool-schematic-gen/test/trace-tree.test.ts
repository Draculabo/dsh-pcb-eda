import { describe, expect, it } from 'vitest'
import {
  buildTree,
  countStatus,
  formatDuration,
  formatElapsed,
  type StackNode,
} from '../src/client/trace-tree.js'
import type { TraceFrame } from '../src/trace.js'

function frame(path: string, name: string, status: TraceFrame['status'] = 'running', id = ''): TraceFrame {
  return {
    id: id || `trace-${path}-${name}`,
    name,
    path,
    status,
    startedAt: 0,
    ...(status === 'running' ? {} : { finishedAt: 100 }),
  }
}

/** Flatten a tree into `depth:name` rows — far easier to assert on than nesting. */
function rows(nodes: readonly StackNode[]): string[] {
  const out: string[] = []
  const walk = (n: StackNode): void => {
    out.push(`${n.depth}:${n.name}`)
    for (const c of n.children) walk(c)
  }
  for (const n of nodes) walk(n)
  return out
}

describe('buildTree', () => {
  it('renders a single flat frame as one root', () => {
    const tree = buildTree([frame('root', 'search_parts')])
    expect(rows(tree)).toEqual(['0:search_parts'])
    expect(tree[0]?.frame).not.toBeUndefined()
  })

  it('synthesizes intermediate nodes for path segments that emitted no event', () => {
    // `root` never sent an event of its own — only its child did.
    const tree = buildTree([frame('root>plan', 'node:plan')])
    expect(rows(tree)).toEqual(['0:root', '1:node:plan'])
    // The synthesized node has no frame of its own.
    expect(tree[0]?.frame).toBeUndefined()
    expect(tree[0]?.children[0]?.frame).not.toBeUndefined()
  })

  it('shares one parent across siblings that report the same prefix', () => {
    const tree = buildTree([
      frame('root>plan', 'node:plan'),
      frame('root>design', 'node:design'),
    ])
    expect(rows(tree)).toEqual(['0:root', '1:node:plan', '1:node:design'])
    expect(tree).toHaveLength(1)
    expect(tree[0]?.children).toHaveLength(2)
  })

  it('nests three levels deep from breadcrumbs alone', () => {
    const tree = buildTree([
      frame('a>b', 'node:b'),
      frame('a>b>c', 'search_parts'),
    ])
    expect(rows(tree)).toEqual(['0:a', '1:node:b', '2:search_parts'])
  })

  it('mints a sibling for a repeated call at the same path, so repeats are not lost', () => {
    const tree = buildTree([
      frame('root>search', 'search_parts', 'finished'),
      frame('root>search', 'search_parts', 'finished'),
    ])
    // The second call must NOT silently collapse into the first row.
    expect(rows(tree)).toEqual(['0:root', '1:search_parts', '2:search_parts'])
  })

  it('prefers the frame display name over the bare path segment', () => {
    // The last path segment is `plan`, the frame name is `node:plan`.
    const tree = buildTree([frame('root>plan', 'node:plan')])
    expect(tree[0]?.children[0]?.name).toBe('node:plan')
  })

  it('keeps each frame status on its node', () => {
    const tree = buildTree([
      frame('root>a', 'a', 'finished'),
      frame('root>b', 'b', 'running'),
      frame('root>c', 'c', 'failed'),
    ])
    const statuses = tree[0]?.children.map((c) => c.status)
    expect(statuses).toEqual(['finished', 'running', 'failed'])
  })

  it('returns an empty tree for no frames and skips empty paths', () => {
    expect(buildTree([])).toEqual([])
    expect(buildTree([frame('', 'orphan')])).toEqual([])
  })

  it('tolerates whitespace and empty segments in the breadcrumb', () => {
    const tree = buildTree([frame(' root > plan ', 'node:plan')])
    expect(rows(tree)).toEqual(['0:root', '1:node:plan'])
  })
})

describe('countStatus', () => {
  it('counts every descendant, not just direct children', () => {
    const tree = buildTree([
      frame('a', 'a', 'finished'),
      frame('a>b', 'b', 'finished'),
      frame('a>c', 'c', 'running'),
      frame('a>d', 'd', 'failed'),
    ])
    const counts = countStatus(tree[0]!)
    expect(counts.total).toBe(3)
    expect(counts.finished).toBe(1)
    expect(counts.failed).toBe(1)
  })

  it('reports zero for a leaf', () => {
    const tree = buildTree([frame('a', 'a')])
    expect(countStatus(tree[0]!)).toEqual({ total: 0, finished: 0, failed: 0 })
  })
})

describe('formatDuration', () => {
  it('uses milliseconds under a second', () => {
    expect(formatDuration(0)).toBe('0ms')
    expect(formatDuration(450)).toBe('450ms')
    expect(formatDuration(999)).toBe('999ms')
  })

  it('switches to one-decimal seconds at a second', () => {
    expect(formatDuration(1000)).toBe('1.0s')
    expect(formatDuration(4200)).toBe('4.2s')
  })

  it('renders nothing for a missing or nonsensical span', () => {
    expect(formatDuration(null)).toBe('')
    expect(formatDuration(undefined)).toBe('')
    expect(formatDuration(Number.NaN)).toBe('')
    expect(formatDuration(-5)).toBe('')
  })
})

describe('formatElapsed', () => {
  it('formats as m:ss with a zero-padded second', () => {
    expect(formatElapsed(0)).toBe('0:00')
    expect(formatElapsed(5_000)).toBe('0:05')
    expect(formatElapsed(65_000)).toBe('1:05')
    expect(formatElapsed(600_000)).toBe('10:00')
  })

  it('clamps negatives to 0:00 rather than printing a sign', () => {
    expect(formatElapsed(-1)).toBe('0:00')
    expect(formatElapsed(Number.NaN)).toBe('0:00')
  })
})
