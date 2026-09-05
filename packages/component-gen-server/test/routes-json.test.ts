import { mkdtempSync, rmSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { describe, expect, it } from 'vitest'
import type { ComponentGenBackend } from '../src/backend.js'
import { HistoryStore } from '../src/history.js'
import { createComponentGenHandler } from '../src/routes.js'
import { COMPONENT_GEN_ROUTE_PREFIX } from '../src/types.js'

const backend: ComponentGenBackend = {
  generateSymbol: async () => ({ status: 'generated' }),
  extractFootprint: async () => ({ status: 'generated' }),
  generateFootprint: async () => ({ status: 'generated' }),
}

async function request(
  handler: ReturnType<typeof createComponentGenHandler>,
  method: string,
  path: string,
  body: string,
): Promise<{ status: number; body: unknown }> {
  const req = Readable.from([Buffer.from(body)]) as IncomingMessage
  req.method = method
  req.url = `${COMPONENT_GEN_ROUTE_PREFIX}${path}`

  let status = 200
  let responseBody = ''
  const res = {
    writeHead: (nextStatus: number) => {
      status = nextStatus
      return res
    },
    end: (value?: unknown) => {
      responseBody = value === undefined ? '' : String(value)
      return res
    },
  } as unknown as ServerResponse

  await handler(req, res)
  return {
    status,
    body: responseBody ? JSON.parse(responseBody) : null,
  }
}

describe('component-gen JSON request bodies', () => {
  it('rejects malformed job JSON as a client error', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'hq-cga-routes-json-'))
    try {
      const handler = createComponentGenHandler({ backend, history: new HistoryStore(dir) })

      await expect(request(handler, 'POST', '/jobs', '{"kind":')).resolves.toEqual({
        status: 400,
        body: { error: 'invalid json body' },
      })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('rejects malformed history patches as a client error', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'hq-cga-routes-json-'))
    try {
      const handler = createComponentGenHandler({ backend, history: new HistoryStore(dir) })

      await expect(request(handler, 'PATCH', '/history/missing', '{"favorite":')).resolves.toEqual({
        status: 400,
        body: { error: 'invalid json body' },
      })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
