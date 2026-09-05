import { describe, expect, it } from 'vitest'
import { createHttpPorts } from '../src/api/component-gen-client.js'
import type { JobEvent } from '../src/ports.js'

describe('component job events', () => {
  it('delivers the final SSE frame when the stream closes without a blank line', async () => {
    const expected: JobEvent = {
      type: 'failed',
      error: 'generation failed',
      at: '2026-09-05T00:00:00.000Z',
    }
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(`event: failed\ndata: ${JSON.stringify(expected)}`))
        controller.close()
      },
    })
    const doFetch = (async () => new Response(body, {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    })) as typeof fetch
    const ports = createHttpPorts({ base: '/api/v1/huaqiu/component-gen', doFetch })

    const actual = await new Promise<JobEvent>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('final SSE frame was not delivered')), 1000)
      ports.jobEvents('job-1', (event) => {
        clearTimeout(timeout)
        resolve(event)
      })
    })

    expect(actual).toEqual(expected)
  })
})
