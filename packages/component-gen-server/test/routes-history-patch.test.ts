import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'
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

async function patchHistory(body: string): Promise<{ status: number; body: unknown }> {
  const dir = mkdtempSync(join(tmpdir(), 'hq-cga-history-patch-'))
  try {
    const handler = createComponentGenHandler({
      backend: stubBackend,
      history: new HistoryStore(dir),
    })
    const req = Readable.from([body]) as unknown as IncomingMessage
    req.method = 'PATCH'
    req.url = `${COMPONENT_GEN_ROUTE_PREFIX}/history/hst_missing`

    let status = 200
    let responseBody = ''
    const res = {
      writeHead: (nextStatus: number) => {
        status = nextStatus
        return res
      },
      end: (chunk?: unknown) => {
        if (chunk !== undefined) {
          responseBody += String(chunk)
        }
        return res
      },
    } as unknown as ServerResponse

    await handler(req, res)
    return {
      status,
      body: responseBody ? JSON.parse(responseBody) as unknown : null,
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe('PATCH /history/:id', () => {
  it.each(['null', '[]'])('rejects non-object JSON payload %s', async (payload) => {
    await expect(patchHistory(payload)).resolves.toEqual({
      status: 400,
      body: { error: 'invalid history patch' },
    })
  })
})
