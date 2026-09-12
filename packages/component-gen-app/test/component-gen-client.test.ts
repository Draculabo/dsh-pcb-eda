import { describe, expect, it, vi } from 'vitest'
import { createHttpPorts } from '../src/api/component-gen-client.js'

describe('component generation HTTP client', () => {
  it('surfaces job cancellation failures with server error details', async () => {
    const doFetch = vi.fn(async () => new Response(
      JSON.stringify({ error: 'cancel failed', detail: 'job is already completed' }),
      {
        status: 409,
        headers: { 'content-type': 'application/json' },
      },
    ))
    const ports = createHttpPorts({
      base: '/api/v1/huaqiu/component-gen',
      doFetch: doFetch as typeof fetch,
    })

    await expect(ports.abortJob('job/1')).rejects.toThrow('cancel failed: job is already completed')
    expect(doFetch).toHaveBeenCalledWith(
      '/api/v1/huaqiu/component-gen/jobs/job%2F1',
      { method: 'DELETE' },
    )
  })

  it('accepts successful job cancellation responses without a body', async () => {
    const doFetch = vi.fn(async () => new Response(null, { status: 204 }))
    const ports = createHttpPorts({
      base: '/api/v1/huaqiu/component-gen',
      doFetch: doFetch as typeof fetch,
    })

    await expect(ports.abortJob('job-1')).resolves.toBeUndefined()
  })
})
