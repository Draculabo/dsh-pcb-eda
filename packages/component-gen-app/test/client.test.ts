import { describe, expect, it } from 'vitest'
import { createHttpPorts } from '../src/api/component-gen-client.js'

describe('createHttpPorts', () => {
  it('rejects accepted job responses without a job id', async () => {
    const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> = []
    const ports = createHttpPorts({
      base: '/api/v1/huaqiu/component-gen',
      doFetch: async (input, init) => {
        requests.push({ input, init })
        return new Response(JSON.stringify({}), {
          status: 202,
          headers: { 'content-type': 'application/json' },
        })
      },
    })

    await expect(ports.startJob({
      kind: 'symbol',
      input: { instruction: 'create a resistor symbol' },
    })).rejects.toThrow('invalid start job response: missing jobId')

    expect(requests).toEqual([
      {
        input: '/api/v1/huaqiu/component-gen/jobs',
        init: {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            kind: 'symbol',
            input: { instruction: 'create a resistor symbol' },
          }),
          signal: undefined,
        },
      },
    ])
  })
})
