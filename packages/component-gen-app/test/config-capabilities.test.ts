import { describe, expect, it } from 'vitest'
import { createHttpPorts } from '../src/api/component-gen-client.js'

describe('component config capabilities', () => {
  it('fills missing capability flags with their defaults', async () => {
    const ports = createHttpPorts({
      base: '/api/v1/huaqiu/component-gen',
      doFetch: async () => new Response(JSON.stringify({
        hostMode: true,
        capabilities: { symbol: false },
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    })

    await expect(ports.config()).resolves.toEqual({
      hostMode: true,
      capabilities: {
        symbol: false,
        footprint: true,
      },
      limits: {
        imageBytes: 4 * 1024 * 1024,
      },
    })
  })
})
