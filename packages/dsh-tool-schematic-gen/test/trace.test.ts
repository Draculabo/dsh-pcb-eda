import { describe, expect, it } from 'vitest'
import {
  collectTraceEvents,
  isTraceEventName,
  pairTraceEvents,
  parseTraceEvent,
  traceName,
  tracePath,
  type TraceEvent,
} from '../src/trace.js'

function node(phase: 'start' | 'end', nodeName: string, ts: number, scope?: string, note?: string) {
  return { kind: 'node', phase, node: nodeName, ts, ...(scope ? { scope } : {}), ...(note ? { note } : {}) }
}
function tool(phase: 'start' | 'end', scope: string, name: string, ts: number, ok?: boolean) {
  return { kind: 'tool', phase, scope, name, ts, ...(ok === undefined ? {} : { ok }) }
}

describe('isTraceEventName', () => {
  it('accepts the known eda.cn agent names', () => {
    expect(isTraceEventName('SCHEMATIC_GENERATOR_TRACE')).toBe(true)
    expect(isTraceEventName('SCHEMAGEN_TRACE')).toBe(true)
    expect(isTraceEventName('MODULAR_CIRCUIT_TRACE')).toBe(true)
    expect(isTraceEventName('MODULE_GEN_TRACE')).toBe(true)
  })

  it('accepts any name ending in _TRACE, so a backend rename cannot silently kill progress', () => {
    expect(isTraceEventName('SOME_FUTURE_TRACE')).toBe(true)
    expect(isTraceEventName('future_trace')).toBe(true)
  })

  it('rejects non-strings and unrelated names', () => {
    expect(isTraceEventName(undefined)).toBe(false)
    expect(isTraceEventName('')).toBe(false)
    expect(isTraceEventName(42)).toBe(false)
    expect(isTraceEventName('TEXT_MESSAGE_CONTENT')).toBe(false)
  })
})

describe('parseTraceEvent', () => {
  it('parses a node event with its scope breadcrumb', () => {
    const ev = parseTraceEvent(node('start', 'plan', 1000, 'root>plan'))
    expect(ev).toEqual({ kind: 'node', phase: 'start', node: 'plan', ts: 1000, scope: 'root>plan' })
  })

  it('parses a tool event and keeps ok:false as an explicit failure', () => {
    const okEv = parseTraceEvent(tool('end', 'root', 'search_parts', 2000, true))
    expect(okEv && okEv.kind === 'tool' && okEv.ok).toBeUndefined() // `true` is not stored
    const badEv = parseTraceEvent(tool('end', 'root', 'search_parts', 2000, false))
    expect(badEv && badEv.kind === 'tool' && badEv.ok).toBe(false)
  })

  it('rejects non-objects, bad phases and missing identity fields', () => {
    expect(parseTraceEvent(null)).toBeNull()
    expect(parseTraceEvent('nope')).toBeNull()
    expect(parseTraceEvent([])).toBeNull()
    expect(parseTraceEvent({ kind: 'node', phase: 'tick', node: 'a', ts: 1 })).toBeNull()
    expect(parseTraceEvent({ kind: 'node', phase: 'start', ts: 1 })).toBeNull()
    expect(parseTraceEvent({ kind: 'tool', phase: 'start', scope: 's', ts: 1 })).toBeNull()
    expect(parseTraceEvent({ kind: 'widget', phase: 'start', ts: 1 })).toBeNull()
  })

  it('substitutes Date.now() when the backend omits ts', () => {
    const before = Date.now()
    const ev = parseTraceEvent({ kind: 'node', phase: 'start', node: 'plan' })
    expect(ev?.ts).toBeGreaterThanOrEqual(before)
  })

  it('degrades a tool with no scope to its own name', () => {
    const ev = parseTraceEvent({ kind: 'tool', phase: 'start', name: 'search_parts', ts: 1 })
    expect(ev && ev.kind === 'tool' && ev.scope).toBe('search_parts')
  })
})

describe('collectTraceEvents', () => {
  it('collects a batched array payload, dropping invalid members', () => {
    const out = collectTraceEvents([
      node('start', 'a', 1),
      { nonsense: true },
      tool('start', 'a', 't', 2),
    ])
    expect(out).toHaveLength(2)
  })

  it('wraps a single event payload', () => {
    expect(collectTraceEvents(node('start', 'a', 1))).toHaveLength(1)
  })

  it('returns empty for garbage', () => {
    expect(collectTraceEvents('x')).toEqual([])
  })
})

describe('tracePath / traceName', () => {
  it('uses a node scope verbatim and falls back to its name', () => {
    expect(tracePath(parseTraceEvent(node('start', 'plan', 1, 'root>plan')) as TraceEvent)).toBe('root>plan')
    expect(tracePath(parseTraceEvent(node('start', 'plan', 1)) as TraceEvent)).toBe('plan')
  })

  it('appends the tool name to its caller scope', () => {
    expect(tracePath(parseTraceEvent(tool('start', 'root>plan', 'search_parts', 1)) as TraceEvent))
      .toBe('root>plan>search_parts')
  })

  it('does not duplicate the name when scope already equals it', () => {
    expect(tracePath(parseTraceEvent(tool('start', 'search_parts', 'search_parts', 1)) as TraceEvent))
      .toBe('search_parts')
  })

  it('prefixes node display names with node:', () => {
    expect(traceName(parseTraceEvent(node('start', 'plan', 1)) as TraceEvent)).toBe('node:plan')
    expect(traceName(parseTraceEvent(tool('start', 'r', 'search_parts', 1)) as TraceEvent)).toBe('search_parts')
  })
})

describe('pairTraceEvents', () => {
  it('pairs a simple start/end into one finished frame', () => {
    const frames = pairTraceEvents([
      parseTraceEvent(tool('start', 'root', 'search_parts', 1000)) as TraceEvent,
      parseTraceEvent(tool('end', 'root', 'search_parts', 2500)) as TraceEvent,
    ])
    expect(frames).toHaveLength(1)
    expect(frames[0]).toMatchObject({ name: 'search_parts', status: 'finished', startedAt: 1000, finishedAt: 2500 })
  })

  it('leaves an unclosed start running', () => {
    const frames = pairTraceEvents([parseTraceEvent(tool('start', 'root', 'a', 1)) as TraceEvent])
    expect(frames[0]?.status).toBe('running')
    expect(frames[0]?.finishedAt).toBeUndefined()
  })

  it('closes nested same-name spans LIFO instead of cross-contaminating', () => {
    const frames = pairTraceEvents([
      parseTraceEvent(tool('start', 'root', 'a', 1)) as TraceEvent,
      parseTraceEvent(tool('start', 'root>a', 'a', 2)) as TraceEvent,
      parseTraceEvent(tool('end', 'root>a', 'a', 3)) as TraceEvent,
      parseTraceEvent(tool('end', 'root', 'a', 4)) as TraceEvent,
    ])
    expect(frames).toHaveLength(2)
    // The inner span (`root>a>a`) opened second and closes FIRST, at 3; the
    // outer span (`root>a`) closes last, at 4. If they shared one open slot
    // the inner end would have closed the outer frame instead.
    expect(frames[0]).toMatchObject({ path: 'root>a', startedAt: 1, finishedAt: 4 })
    expect(frames[1]).toMatchObject({ path: 'root>a>a', startedAt: 2, finishedAt: 3 })
  })

  it('marks a span failed only when a tool ends with ok:false', () => {
    const frames = pairTraceEvents([
      parseTraceEvent(tool('start', 'root', 'a', 1)) as TraceEvent,
      parseTraceEvent(tool('end', 'root', 'a', 2, false)) as TraceEvent,
    ])
    expect(frames[0]?.status).toBe('failed')
  })

  it('ignores an end with no matching start', () => {
    const frames = pairTraceEvents([parseTraceEvent(tool('end', 'root', 'ghost', 1)) as TraceEvent])
    expect(frames).toEqual([])
  })

  it('separates the same tool name used under two different subtrees', () => {
    const frames = pairTraceEvents([
      parseTraceEvent(tool('start', 'root>left', 'a', 1)) as TraceEvent,
      parseTraceEvent(tool('start', 'root>right', 'a', 2)) as TraceEvent,
      parseTraceEvent(tool('end', 'root>left', 'a', 3)) as TraceEvent,
    ])
    expect(frames[0]?.status).toBe('finished')
    expect(frames[1]?.status).toBe('running')
  })
})
