import { describe, expect, it } from 'vitest'
import { ToolCallTracker } from '../src/trace.js'

describe('ToolCallTracker missing ids', () => {
  it('does not retain a tool call that has no id', () => {
    const tracker = new ToolCallTracker()

    tracker.start('', 'module_search', 1)

    expect(tracker.openIds).toEqual([])
  })

  it('does not synthesize an end event for a missing id', () => {
    const tracker = new ToolCallTracker()

    tracker.start('', 'module_search', 1)

    expect(tracker.end('', 2)).toBeNull()
    expect(tracker.openIds).toEqual([])
  })
})
