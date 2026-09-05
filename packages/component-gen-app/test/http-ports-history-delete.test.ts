import { describe, expect, it, vi } from 'vitest'
import { createHttpPorts } from '../src/api/component-gen-client.js'

describe('createHttpPorts deleteHistory', () => {
  it('rejects when the history delete request fails', async () => {
    const doFetch = vi.fn<typeof fetch>(async () => new Response(null, { status: 500 }))
    const ports = createHttpPorts({
      base: '/api/v1/huaqiu/component-gen',
      doFetch,
    })

    await expect(ports.deleteHistory('entry/1')).rejects.toThrow('history delete HTTP 500')
    expect(doFetch.mock.calls).toEqual([
      [
        '/api/v1/huaqiu/component-gen/history/entry%2F1',
        { method: 'DELETE' },
      ],
    ])
  })
})
