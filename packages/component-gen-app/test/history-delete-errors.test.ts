import { describe, expect, it, vi } from 'vitest'

import { createHttpPorts } from '../src/api/component-gen-client.js'

describe('component history deletion', () => {
  it('surfaces failed HTTP responses', async () => {
    const doFetch = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 503 }))
    const ports = createHttpPorts({
      base: '/api/v1/huaqiu/component-gen',
      doFetch,
    })

    await expect(ports.deleteHistory('history/1')).rejects.toThrow('delete history HTTP 503')
    expect(doFetch).toHaveBeenCalledWith(
      '/api/v1/huaqiu/component-gen/history/history%2F1',
      { method: 'DELETE' },
    )
  })
})
