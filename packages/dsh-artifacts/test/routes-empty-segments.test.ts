import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as http from 'node:http'
import type { AddressInfo } from 'node:net'
import type { HuaqiuArtifacts } from '../src/service.js'
import { ARTIFACTS_ROUTE_PREFIX, createArtifactsHandler } from '../src/routes.js'

describe('artifact route path segments', () => {
  let server: http.Server
  let base: string
  let service: HuaqiuArtifacts

  beforeEach(async () => {
    service = {
      create: vi.fn(),
      get: vi.fn(),
      readContent: vi.fn(),
      delete: vi.fn(),
      deleteAll: vi.fn(),
    }
    server = http.createServer(createArtifactsHandler(service))
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error)
          return
        }
        resolve()
      })
    })
  })

  it('rejects empty segments before an artifact id', async () => {
    const response = await fetch(`${base}${ARTIFACTS_ROUTE_PREFIX}//art_deadbeef`)

    expect({
      status: response.status,
      body: await response.json(),
      getCalls: vi.mocked(service.get).mock.calls,
    }).toEqual({
      status: 404,
      body: { error: 'not found' },
      getCalls: [],
    })
  })
})
