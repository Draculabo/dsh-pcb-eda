import { describe, expect, it, vi } from 'vitest'
import { createHttpPorts } from '../src/api/component-gen-client.js'

describe('createHttpPorts', () => {
  it('surfaces abort job HTTP failures', async () => {
    const doFetch = vi.fn(async () => new Response(null, { status: 503 })) as typeof fetch
    const ports = createHttpPorts({
      base: '/api/v1/huaqiu/component-gen',
      doFetch,
    })

    await expect(ports.abortJob('job/1')).rejects.toThrow('abort job HTTP 503')
    expect(doFetch).toHaveBeenCalledWith('/api/v1/huaqiu/component-gen/jobs/job%2F1', {
      method: 'DELETE',
    })
  })
})
