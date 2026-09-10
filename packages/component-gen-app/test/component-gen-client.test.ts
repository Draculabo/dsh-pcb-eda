import { describe, expect, it, vi } from 'vitest'
import { createHttpPorts } from '../src/api/component-gen-client.js'

describe('createHttpPorts startJob', () => {
  it.each([
    {},
    { jobId: '' },
    { jobId: '   ' },
  ])('rejects a 202 response without a usable job id', async (body) => {
    const doFetch = vi.fn(async () => new Response(JSON.stringify(body), { status: 202 })) as unknown as typeof fetch
    const ports = createHttpPorts({ base: '/api/v1/huaqiu/component-gen', doFetch })

    await expect(ports.startJob({ kind: 'symbol', input: {} })).rejects.toThrow('job start response missing jobId')
  })
})
