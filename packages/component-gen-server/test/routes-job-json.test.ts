import { Readable } from 'node:stream'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { ServerResponse } from 'node:http'
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

function fakeRes(): {
  res: ServerResponse
  result: () => { status: number; body: unknown }
} {
  const state = { status: 200, body: '' }
  const res = {
    writeHead: (status: number) => {
      state.status = status
      return res
    },
    end: (body?: unknown) => {
      state.body = body === undefined ? '' : String(body)
      return res
    },
  } as unknown as ServerResponse

  return {
    res,
    result: () => ({
      status: state.status,
      body: state.body ? JSON.parse(state.body) as unknown : null,
    }),
  }
}

describe('POST /jobs', () => {
  it('returns 400 for malformed JSON without starting generation', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'hq-component-routes-'))
    try {
      let generationCalls = 0
      const backend: ComponentGenBackend = {
        ...stubBackend,
        generateSymbol: async () => {
          generationCalls += 1
          return { status: 'generated' }
        },
      }
      const history = new HistoryStore(dir)
      const handler = createComponentGenHandler({ backend, history })
      const req = Readable.from(['{"kind":"symbol"']) as Readable & {
        method?: string
        url?: string
      }
      req.method = 'POST'
      req.url = `${COMPONENT_GEN_ROUTE_PREFIX}/jobs`
      const { res, result } = fakeRes()

      await handler(req as never, res)

      expect(result()).toEqual({
        status: 400,
        body: { error: 'invalid json body' },
      })
      expect(generationCalls).toBe(0)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
