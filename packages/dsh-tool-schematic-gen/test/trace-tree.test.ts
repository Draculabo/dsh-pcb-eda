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

  it('collapses repeated calls at the same path into one row with a ×N badge', () => {
    // The schematic agent fires `search_parts` repeatedly without changing the
    // path; hq-eda-ai shows ONE row growing a ×N pill. Verify we do the same.
    const tree = buildTree([
      frame('root>search', 'search_parts', 'finished'),
      frame('root>search', 'search_parts', 'finished'),
    ])
    expect(rows(tree)).toEqual(['0:root', '1:search_parts'])
    expect(tree[0]?.children).toHaveLength(1)
    expect(tree[0]?.children[0]?.repeat).toBe(2)
  })

  it('collapses 14 same-path calls into one row, with the latest call winning status', () => {
    // Mirrors the screenshot: schematic agent fires `ic_search` fourteen times
    // in a row under `root>plan>circuit`. Each call has a different duration.
    const calls = [
      133, 255, 30, 123, 145, 139, 139, 159, 128, 135, 1400, 1300, 0, 0,
    ]
    const frames = calls.map((dur, i) =>
      frame(
        'root>plan>circuit>ic_search',
        'ic_search',
        dur === 0 && i === calls.length - 1 ? 'running' : 'finished',
        `ic-${i}`,
      ),
    )
    // Override finished timestamps to mirror the durations; default fixture
    // uses 0..100 which compresses everything.
    const tuned = frames.map((f, i) => ({
      ...f,
      startedAt: i * 100,
      finishedAt: f.status === 'finished' ? i * 100 + (calls[i] ?? 0) : undefined,
    }))
    const tree = buildTree(tuned)
    const leaf = tree[0]!.children[0]!.children[0]!.children[0]!
    // Synthesized intermediate nodes keep their bare path-segment name; only
    // the leaf is decorated with the frame's display name.
    expect(rows(tree)).toEqual(['0:root', '1:plan', '2:circuit', '3:ic_search'])
    expect(leaf.repeat).toBe(14)
    // The latest invocation is the one still running — its status wins.
    expect(leaf.status).toBe('running')
  })

  it('keeps repeat-1 visible by leaving the ×N pill off', () => {
    const tree = buildTree([frame('root>design', 'design_power', 'finished')])
    expect(tree[0]!.children[0]!.repeat).toBe(1)
  })

  it('does not collapse two distinct tools at the same parent', () => {
    // Two different sibling paths must stay two rows, even though they share
    // a prefix.
    const tree = buildTree([
      frame('root>circuit>design_power', 'design_power', 'finished'),
      frame('root>circuit>design_mcu', 'design_mcu', 'finished'),
    ])
    const circuit = tree[0]!.children[0]!
    expect(circuit.children).toHaveLength(2)
    expect(circuit.children.map((c) => c.name)).toEqual(['design_power', 'design_mcu'])
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
