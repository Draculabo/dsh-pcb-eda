import { describe, expect, it } from 'vitest'
import { projectToolCall, resultTextOf } from '../src/client/parse.js'

describe('schematic result text projection', () => {
  it('combines text content blocks in order', () => {
    const block = {
      content: [
        { type: 'text', text: '{"status":"generated",' },
        { type: 'image', text: 'ignored' },
        { type: 'text', text: '"kind":"schematic"}' },
      ],
    }

    expect(resultTextOf(block)).toBe('{"status":"generated","kind":"schematic"}')
  })

  it('projects JSON split across text blocks', () => {
    const projected = projectToolCall({
      content: [
        { type: 'text', text: '{"status":"generated",' },
        { type: 'text', text: '"kind":"schematic","design_name":"demo"}' },
      ],
    })

    expect(projected).toEqual({
      phase: 'completed',
      result: {
        status: 'generated',
        kind: 'schematic',
        artifact: null,
        artifacts: [],
        designName: 'demo',
        fileCount: null,
        moduleCount: null,
        connectionCount: null,
        note: null,
        agentNote: null,
      },
    })
  })
})
