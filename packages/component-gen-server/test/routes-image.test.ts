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
import { Readable } from 'node:stream'
import { describe, expect, it } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createComponentGenHandler } from '../src/routes.js'
import { HistoryStore, newImageId } from '../src/history.js'
import type { ComponentGenBackend } from '../src/backend.js'
import { COMPONENT_GEN_ROUTE_PREFIX, MAX_IMAGE_BYTES } from '../src/types.js'

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

async function startJob(handler: ReturnType<typeof createComponentGenHandler>, imageDataUrl: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const payload = Buffer.from(JSON.stringify({ kind: 'symbol', input: { imageDataUrl } }))
  const req = Readable.from([payload]) as IncomingMessage
  req.method = 'POST'
  req.url = `${COMPONENT_GEN_ROUTE_PREFIX}/jobs`
  const { res, status, body } = fakeRes()
  await handler(req, res)
  return { status: status(), body: JSON.parse(body().toString()) as Record<string, unknown> }
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

describe('POST /jobs image limits', () => {
  it('accepts an image whose decoded bytes fit the configured limit', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'hq-cga-routes-'))
    try {
      const bytes = Buffer.alloc(3_200_000)
      const imageDataUrl = `data:image/png;base64,${bytes.toString('base64')}`
      expect(imageDataUrl.length).toBeGreaterThan(MAX_IMAGE_BYTES)
      expect(bytes.byteLength).toBeLessThan(MAX_IMAGE_BYTES)

      const history = new HistoryStore(dir)
      const handler = createComponentGenHandler({ backend: stubBackend, history })

      expect(await startJob(handler, imageDataUrl)).toMatchObject({
        status: 202,
        body: { jobId: expect.any(String) },
      })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('rejects an image whose decoded bytes exceed the configured limit', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'hq-cga-routes-'))
    try {
      const bytes = Buffer.alloc(MAX_IMAGE_BYTES + 1)
      const imageDataUrl = `data:image/png;base64,${bytes.toString('base64')}`
      const history = new HistoryStore(dir)
      const handler = createComponentGenHandler({ backend: stubBackend, history })

      expect(await startJob(handler, imageDataUrl)).toEqual({
        status: 413,
        body: {
          error: 'image too large',
          detail: `max ${MAX_IMAGE_BYTES} bytes`,
        },
      })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
