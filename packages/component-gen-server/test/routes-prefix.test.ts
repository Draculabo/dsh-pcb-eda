import type { ServerResponse } from 'node:http'
import { describe, expect, it } from 'vitest'
import { createComponentGenHandler } from '../src/routes.js'
import { COMPONENT_GEN_ROUTE_PREFIX } from '../src/types.js'

describe('component-gen route prefix', () => {
  it('rejects paths that only share the textual route prefix', async () => {
    let status = 200
    let body = ''
    const res = {
      writeHead(code: number) {
        status = code
        return res
      },
      end(value?: unknown) {
        body = value === undefined ? '' : String(value)
        return res
      },
    } as unknown as ServerResponse
    const handler = createComponentGenHandler({ backend: {} as never, history: {} as never })

    await handler({
      method: 'GET',
      url: `${COMPONENT_GEN_ROUTE_PREFIX}x/config`,
    } as never, res)

    expect({ status, body: JSON.parse(body) }).toEqual({
      status: 404,
      body: { error: 'not found' },
    })
  })
})
