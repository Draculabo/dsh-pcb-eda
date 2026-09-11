import { describe, expect, it, vi } from 'vitest'
import { createHttpPorts } from '../src/api/component-gen-client.js'

describe('component generation start response', () => {
  it('rejects accepted jobs without a usable job id', async () => {
    const doFetch = vi.fn(async () => new Response(JSON.stringify({}), {
      status: 202,
      headers: { 'content-type': 'application/json' },
    })) as unknown as typeof fetch

    const ports = createHttpPorts({
      base: '/api/v1/huaqiu/component-gen',
      doFetch,
    })

    await expect(ports.startJob({
      kind: 'symbol',
      input: { instruction: 'Create a resistor symbol' },
    })).rejects.toThrow('component generation response missing jobId')
  })
})
