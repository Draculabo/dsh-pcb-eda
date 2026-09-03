import { describe, expect, it } from 'vitest'
import { projectToolCall } from '../src/client/parse.js'

describe('projectToolCall', () => {
  it('projects generated results as completed', () => {
    expect(projectToolCall({
      content: [{
        type: 'text',
        text: JSON.stringify({ status: 'generated', kind: 'schematic', design_name: 'demo' }),
      }],
    })).toEqual({
      phase: 'completed',
      result: {
        status: 'generated',
        kind: 'schematic',
        artifact: null,
        designName: 'demo',
        fileCount: null,
        moduleCount: null,
        connectionCount: null,
        note: null,
        agentNote: null,
      },
    })
  })

  it('rejects unexpected statuses even when the result includes a kind', () => {
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
})
