import { mkdtempSync, rmSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { tmpdir } from 'node:os'
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

describe('component-gen request bodies', () => {
  it('rejects oversized request bodies before parsing JSON', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'hq-cga-routes-'))
    try {
      const history = new HistoryStore(dir)
      const handler = createComponentGenHandler({ backend: stubBackend, history })
      const req = Readable.from([Buffer.alloc(8 * 1024 * 1024 + 1, 0x61)]) as IncomingMessage
      req.method = 'POST'
      req.url = `${COMPONENT_GEN_ROUTE_PREFIX}/jobs`

      const response = {
        status: 200,
        headers: {} as Record<string, string>,
        body: '',
      }
      const res = {
        writeHead: (status: number, headers?: Record<string, string>) => {
          response.status = status
          if (headers) {
            Object.assign(response.headers, headers)
          }
          return res
        },
        end: (body?: unknown) => {
          response.body = body === undefined ? '' : String(body)
          return res
        },
      } as unknown as ServerResponse

      await handler(req, res)

      expect({
        status: response.status,
        contentType: response.headers['content-type'],
        body: JSON.parse(response.body),
      }).toEqual({
        status: 413,
        contentType: 'application/json; charset=utf-8',
        body: {
          error: 'request body too large',
          detail: 'max 8388608 bytes',
        },
      })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
