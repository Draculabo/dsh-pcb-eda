import { describe, expect, it, vi } from 'vitest'

import { createHttpPorts } from '../src/api/component-gen-client.js'
import type { JobEvent } from '../src/ports.js'

describe('component-gen HTTP client', () => {
  it('parses SSE events separated by CRLF frame boundaries', async () => {
    const expected: JobEvent = {
      type: 'progress',
      message: 'routing',
      at: '2026-09-11T08:00:00.000Z',
    }
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(`event: progress\r\ndata: ${JSON.stringify(expected)}\r\n\r\n`),
        )
        controller.close()
      },
    })
    const events: JobEvent[] = []
    const ports = createHttpPorts({
      base: '/api/v1/huaqiu/component-gen',
      doFetch: async () => new Response(body, { status: 200 }),
    })

    ports.jobEvents('job-1', (event) => {
      events.push(event)
    })

    await vi.waitFor(() => {
      expect(events).toEqual([expected])
    })
  })
})
