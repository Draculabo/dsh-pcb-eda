import { describe, expect, it } from 'vitest'
import { parseProgressDoc } from '../src/client/progress.js'
import type { ProgressDoc } from '../src/progress.js'

describe('parseProgressDoc', () => {
  it('preserves a valid progress document', () => {
    const doc: ProgressDoc = {
      callId: 'call_1',
      toolName: 'schematic_generate',
      kind: 'schematic',
      status: 'running',
      startedAt: 100,
      updatedAt: 200,
      frames: [],
      stage: null,
      todos: null,
      note: null,
      error: null,
    }

    expect(parseProgressDoc(doc)).toEqual(doc)
  })

  it.each([
    null,
    [],
    { status: 'unknown' },
    {},
  ])('rejects malformed progress responses: %j', (value) => {
    expect(() => parseProgressDoc(value)).toThrow('progress route returned invalid response')
  })
})
