import { mkdtempSync, rmSync } from 'node:fs'
import type { ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ComponentGenBackend } from '../src/backend.js'
import { HistoryStore } from '../src/history.js'
import { createComponentGenHandler } from '../src/routes.js'
import { COMPONENT_GEN_ROUTE_PREFIX } from '../src/types.js'

const stubBackend: ComponentGenBackend = {
  generateSymbol: async () => ({ status: 'generated' }),
  extractFootprint: async () => ({ status: 'generated' }),
  generateFootprint: async () => ({ status: 'generated' }),
}

describe('component config route method contract', () => {
  it('rejects unsupported methods with 405 and the allowed method', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'hq-cga-config-method-'))
    try {
      const handler = createComponentGenHandler({
        backend: stubBackend,
        history: new HistoryStore(dir),
      })
      const response = {
        status: 0,
        headers: {} as Record<string, string>,
        body: '',
      }
      const res = {
        writeHead(status: number, headers?: Record<string, string>) {
          response.status = status
          response.headers = headers ?? {}
          return res
        },
        end(body?: unknown) {
          response.body = body === undefined ? '' : String(body)
          return res
        },
      } as unknown as ServerResponse

      await handler({
        method: 'POST',
        url: `${COMPONENT_GEN_ROUTE_PREFIX}/config`,
      } as never, res)

      expect(response).toEqual({
        status: 405,
        headers: {
          allow: 'GET',
          'content-type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify({ error: 'method not allowed' }),
      })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
