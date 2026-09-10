import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Readable } from 'node:stream'
import { describe, expect, it } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createComponentGenHandler } from '../src/routes.js'
import { HistoryStore } from '../src/history.js'
import type { ComponentGenBackend } from '../src/backend.js'
import { COMPONENT_GEN_ROUTE_PREFIX } from '../src/types.js'

const backend: ComponentGenBackend = {
  generateSymbol: async () => ({ status: 'generated' }),
  extractFootprint: async () => ({ status: 'generated' }),
  generateFootprint: async () => ({ status: 'generated' }),
}

async function postJob(input: unknown): Promise<{ status: number; body: unknown }> {
  const dir = mkdtempSync(join(tmpdir(), 'hq-cga-job-input-'))
  try {
    const handler = createComponentGenHandler({ backend, history: new HistoryStore(dir) })
    const req = Readable.from([JSON.stringify({ kind: 'symbol', input })]) as unknown as IncomingMessage
    req.method = 'POST'
    req.url = `${COMPONENT_GEN_ROUTE_PREFIX}/jobs`

    let status = 200
    let responseBody = ''
    const res = {
      writeHead: (nextStatus: number) => {
        status = nextStatus
        return res
      },
      end: (body?: unknown) => {
        responseBody = body === undefined ? '' : String(body)
        return res
      },
    } as unknown as ServerResponse

    await handler(req, res)
    return { status, body: JSON.parse(responseBody) as unknown }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe('POST /jobs input validation', () => {
  it.each(['text', [], null])('rejects non-object job input %#', async (input) => {
    await expect(postJob(input)).resolves.toEqual({
      status: 400,
      body: { error: 'invalid job input (expected object)' },
    })
  })
})
