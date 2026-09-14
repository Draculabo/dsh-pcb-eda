import { describe, expect, it } from 'vitest'

import { isTraceEventName, parseTraceEvent } from '../src/trace.js'

describe('trace identifier normalization', () => {
  it('normalizes surrounding whitespace in trace event names', () => {
    expect(isTraceEventName('  SCHEMATIC_GENERATOR_TRACE  ')).toBe(true)
    expect(isTraceEventName('  custom_trace  ')).toBe(true)
    expect(isTraceEventName('   ')).toBe(false)
  })

  it('normalizes node identifiers and ignores blank scopes', () => {
    expect(parseTraceEvent({
      kind: 'node',
      phase: 'start',
      node: '  plan  ',
      scope: '   ',
      ts: 1,
    })).toEqual({ kind: 'node', phase: 'start', node: 'plan', ts: 1 })
  })

  it('normalizes tool identifiers and falls back from blank scopes and paths', () => {
    expect(parseTraceEvent({
      kind: 'tool',
      phase: 'start',
      name: '  search_parts  ',
      scope: '   ',
      path: '   ',
      ts: 2,
    })).toEqual({
      kind: 'tool',
      phase: 'start',
      scope: 'search_parts',
      name: 'search_parts',
      ts: 2,
    })
  })

  it('rejects blank node and tool names', () => {
    expect(parseTraceEvent({ kind: 'node', phase: 'start', node: '   ', ts: 1 })).toBeNull()
    expect(parseTraceEvent({ kind: 'tool', phase: 'start', name: '   ', scope: 'root', ts: 1 })).toBeNull()
  })
})
