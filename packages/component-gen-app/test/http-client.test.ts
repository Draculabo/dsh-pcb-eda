import { describe, expect, it } from 'vitest'
import { createHttpPorts } from '../src/api/component-gen-client.js'

describe('createHttpPorts', () => {
  it('surfaces history deletion failures', async () => {
    const ports = createHttpPorts({
      base: '/api/v1/huaqiu/component-gen',
      doFetch: (async () => new Response(
        JSON.stringify({ error: 'delete failed', detail: 'storage unavailable' }),
        {
          status: 500,
          headers: { 'content-type': 'application/json' },
        },
      )) as typeof fetch,
    })

    await expect(ports.deleteHistory('history-1')).rejects.toThrow('delete failed: storage unavailable')
  })

  it('accepts successful history deletion responses without a body', async () => {
    const ports = createHttpPorts({
      base: '/api/v1/huaqiu/component-gen',
      doFetch: (async () => new Response(null, { status: 204 })) as typeof fetch,
    })

    await expect(ports.deleteHistory('history-1')).resolves.toBeUndefined()
  })
})
