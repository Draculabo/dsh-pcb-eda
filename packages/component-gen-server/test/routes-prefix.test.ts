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

describe('component route prefix', () => {
  it('rejects paths that only share the configured prefix text', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'hq-cga-prefix-'))
    try {
      const handler = createComponentGenHandler({ backend: stubBackend, history: new HistoryStore(dir) })
      const state: { status: number; body: unknown } = { status: 200, body: null }
      const res = {
        writeHead: (status: number) => {
          state.status = status
          return res
        },
        end: (body?: unknown) => {
          state.body = body === undefined ? null : JSON.parse(String(body))
          return res
        },
      } as unknown as ServerResponse

      await handler({ method: 'GET', url: `${COMPONENT_GEN_ROUTE_PREFIX}x/config` } as never, res)

      expect(state).toEqual({ status: 404, body: { error: 'not found' } })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
