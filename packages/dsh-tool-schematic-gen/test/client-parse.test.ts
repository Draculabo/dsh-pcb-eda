import { describe, expect, it } from 'vitest'
import { projectToolCall } from '../src/client/parse.js'

describe('projectToolCall', () => {
  it('rejects explicit unexpected statuses even when the result has a kind', () => {
    expect(projectToolCall({
      content: [{
        type: 'text',
        text: JSON.stringify({ status: 'failed', kind: 'schematic' }),
      }],
    })).toEqual({
      phase: 'failed',
      message: 'unexpected tool status: failed',
    })
  })

  it('keeps legacy kind-only results compatible', () => {
    expect(projectToolCall({
      content: [{
        type: 'text',
        text: JSON.stringify({ kind: 'schematic', design_name: 'legacy' }),
      }],
    })).toMatchObject({
      phase: 'completed',
      result: {
        status: null,
        kind: 'schematic',
        designName: 'legacy',
      },
    })
  })
})
