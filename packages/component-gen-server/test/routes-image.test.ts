/**
 * `@huaqiu/component-gen-server` — HTTP route integration tests.
 *
 * Covers the input-image route contract: the client's `ports.inputImage`
 * requests `/history/:imageId/image` with the stored thumbnail id (`img_…`),
 * NOT a history entry id — the handler must serve the image directly by that
 * id (previously it looked the id up as a history entry and 404'd).
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import type { ServerResponse } from 'node:http'
import { createComponentGenHandler } from '../src/routes.js'
import { HistoryStore, newImageId } from '../src/history.js'
import type { ComponentGenBackend } from '../src/backend.js'
import { COMPONENT_GEN_ROUTE_PREFIX } from '../src/types.js'

const stubBackend: ComponentGenBackend = {
  generateSymbol: async () => ({ status: 'generated' }),
  extractFootprint: async () => ({ status: 'generated' }),
  generateFootprint: async () => ({ status: 'generated' }),
}

/** Minimal ServerResponse that captures status/headers/body. */
function fakeRes(): {
  res: ServerResponse
  status: () => number
  mime: () => string | undefined
  body: () => Buffer
} {
  const state: { status: number; headers: Record<string, string>; body: Buffer } = {
    status: 200,
    headers: {},
    body: Buffer.alloc(0),
  }
  const res = {
    statusCode: 200,
    writeHead: (status: number, headers?: Record<string, string>) => {
      state.status = status
      if (headers) Object.assign(state.headers, headers)
      return res
    },
    end: (body?: unknown) => {
      if (body !== undefined) state.body = Buffer.isBuffer(body) ? body : Buffer.from(String(body))
      return res
    },
    setHeader: () => {},
  } as unknown as ServerResponse
  return {
    res,
    status: () => state.status,
    mime: () => state.headers['content-type'],
    body: () => state.body,
  }
}

async function callImage(handler: ReturnType<typeof createComponentGenHandler>, imageId: string): Promise<{ status: number; mime?: string; body: Buffer }> {
  const req = {
    method: 'GET',
    url: `${COMPONENT_GEN_ROUTE_PREFIX}/history/${encodeURIComponent(imageId)}/image`,
  }
  const { res, status, mime, body } = fakeRes()
  await handler(req as never, res)
  return { status: status(), mime: mime(), body: body() }
}

describe('GET /history/:imageId/image', () => {
  it('serves a stored input image by its thumbnail id directly (not by history entry id)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'hq-cga-routes-'))
    try {
      const history = new HistoryStore(dir)
      const imageId = newImageId()
      await history.saveImage(imageId, `data:image/jpeg;base64,${Buffer.from('img-bytes').toString('base64')}`)

      const handler = createComponentGenHandler({ backend: stubBackend, history })
      const out = await callImage(handler, imageId)

      expect(out.status).toBe(200)
      expect(out.mime).toBe('image/jpeg')
      expect(out.body.toString()).toBe('img-bytes')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('404s for an unknown image id', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'hq-cga-routes-'))
    try {
      const history = new HistoryStore(dir)
      const handler = createComponentGenHandler({ backend: stubBackend, history })
      const out = await callImage(handler, 'img_missing')
      expect(out.status).toBe(404)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
