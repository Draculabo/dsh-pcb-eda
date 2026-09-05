import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import { describe, expect, it } from 'vitest'
import type { ComponentGenBackend } from '../src/backend.js'
import { HistoryStore } from '../src/history.js'
import { createComponentGenHandler } from '../src/routes.js'
import { COMPONENT_GEN_ROUTE_PREFIX, type HistoryEntry } from '../src/types.js'

const stubBackend: ComponentGenBackend = {
  generateSymbol: async () => ({ status: 'generated' }),
  extractFootprint: async () => ({ status: 'generated' }),
  generateFootprint: async () => ({ status: 'generated' }),
}

describe('PATCH /history/:id status validation', () => {
  it('rejects unsupported history statuses without mutating the entry', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'hq-cga-history-status-'))
    try {
      const history = new HistoryStore(dir)
      const entry: HistoryEntry = {
        id: 'hst_status_validation',
        kind: 'symbol',
        createdAt: '2026-09-05T00:00:00.000Z',
        status: 'generated',
        input: {},
      }
      await history.append(entry)

      const handler = createComponentGenHandler({ backend: stubBackend, history })
      const req = Readable.from([JSON.stringify({ status: 'running' })]) as unknown as IncomingMessage
      req.method = 'PATCH'
      req.url = `${COMPONENT_GEN_ROUTE_PREFIX}/history/${entry.id}`

      let status = 0
      let responseBody = ''
      const res = {
        writeHead(code: number) {
          status = code
          return res
        },
        end(body?: unknown) {
          responseBody = body === undefined ? '' : String(body)
          return res
        },
      } as unknown as ServerResponse

      await handler(req, res)

      expect({ status, body: JSON.parse(responseBody) }).toEqual({
        status: 400,
        body: { error: 'invalid history status (expected generated | failed | cancelled)' },
      })
      expect(await history.get(entry.id)).toEqual(entry)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
