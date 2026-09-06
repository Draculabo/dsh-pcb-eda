import { describe, expect, it } from 'vitest'
import { createHttpPorts } from '../src/api/component-gen-client.js'

describe('component config limits', () => {
  it('falls back to the default image byte limit when the server returns an invalid value', async () => {
    const ports = createHttpPorts({
      base: '/api/v1/huaqiu/component-gen',
      doFetch: async () => new Response(JSON.stringify({
        hostMode: true,
        capabilities: { symbol: false, footprint: true },
        limits: { imageBytes: -1 },
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    })

    await expect(ports.config()).resolves.toEqual({
      hostMode: true,
      capabilities: { symbol: false, footprint: true },
      limits: { imageBytes: 4 * 1024 * 1024 },
    })
  })
})
