import { describe, expect, it } from 'vitest'
import { createHttpPorts } from '../src/api/component-gen-client.js'

describe('component mutation errors', () => {
  it('surfaces failed job aborts and history deletes', async () => {
    const calls: Array<{ url: string; method: string | undefined }> = []
    const doFetch: typeof fetch = async (input, init) => {
      calls.push({ url: String(input), method: init?.method })
      return new Response(
        JSON.stringify({ error: 'mutation rejected', detail: 'permission denied' }),
        {
          status: 403,
          headers: { 'content-type': 'application/json' },
        },
      )
    }
    const ports = createHttpPorts({
      base: '/api/v1/huaqiu/component-gen',
      doFetch,
    })

    await expect(ports.abortJob('job/1')).rejects.toThrow('mutation rejected: permission denied')
    await expect(ports.deleteHistory('history/1')).rejects.toThrow('mutation rejected: permission denied')

    expect(calls).toEqual([
      {
        url: '/api/v1/huaqiu/component-gen/jobs/job%2F1',
        method: 'DELETE',
      },
      {
        url: '/api/v1/huaqiu/component-gen/history/history%2F1',
        method: 'DELETE',
      },
    ])
  })
})
