import { describe, expect, it } from 'vitest'
import { parseEvent } from '../src/api/component-gen-client.js'

describe('parseEvent SSE event type contract', () => {
  it('rejects a named SSE frame when the payload type does not match', () => {
    const frame = [
      'event: completed',
      'data: {"type":"failed","error":"generation failed","at":"2026-09-05T12:00:00.000Z"}',
    ].join('\n')

    expect(parseEvent(frame)).toBeNull()
  })

  it('preserves unnamed SSE frames that carry their type in the payload', () => {
    const event = {
      type: 'progress' as const,
      message: 'routing',
      at: '2026-09-05T12:00:00.000Z',
    }
    const frame = `data: ${JSON.stringify(event)}`

    expect(parseEvent(frame)).toEqual(event)
  })
})
