import { describe, expect, it } from 'vitest'
import { projectToolCall } from '../src/client/parse.js'

describe('projectToolCall status projection', () => {
  it('rejects unknown statuses even when kind is present', () => {
    expect(projectToolCall({
      content: [{
        type: 'text',
        text: JSON.stringify({ status: 'queued', kind: 'symbol' }),
      }],
    })).toEqual({
      phase: 'failed',
      message: 'unexpected tool status: queued',
    })
  })

  it('preserves legacy kind-only completion results', () => {
    expect(projectToolCall({
      content: [{
        type: 'text',
        text: JSON.stringify({ kind: 'symbol' }),
      }],
    })).toEqual({
      phase: 'completed',
      result: {
        status: null,
        kind: 'symbol',
        artifact: null,
        content: null,
        fileUrl: null,
        filename: null,
        pkgType: null,
        fileName: null,
        dimensions: null,
        note: null,
        agentNote: null,
        serviceMessage: null,
      },
    })
  })
})
