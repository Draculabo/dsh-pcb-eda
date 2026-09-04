import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { ComponentGenBackend } from '../src/backend.js'
import { HistoryStore } from '../src/history.js'
import { JobStore, runGeneration } from '../src/jobs.js'
import type { StartJobRequest } from '../src/types.js'

describe('runGeneration', () => {
  it('keeps an aborted job cancelled when the backend ignores its signal', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-05T00:00:00.000Z'))
    const dir = mkdtempSync(join(tmpdir(), 'hq-cga-job-'))

    try {
      let finishGeneration!: (result: Record<string, unknown>) => void
      const backend: ComponentGenBackend = {
        generateSymbol: async (_args, exec) => {
          expect(exec.signal?.aborted).toBe(false)
          return await new Promise<Record<string, unknown>>((resolve) => {
            finishGeneration = resolve
          })
        },
        extractFootprint: async () => ({ status: 'generated' }),
        generateFootprint: async () => ({ status: 'generated' }),
      }
      const history = new HistoryStore(dir)
      const store = new JobStore()
      const request: StartJobRequest = {
        kind: 'symbol',
        input: { imageDataUrl: 'data:image/png;base64,YQ==' },
      }
      const initial = store.create(request, {})
      const events: unknown[] = []
      store.subscribe(initial.id, (event) => events.push(event))

      const running = runGeneration(store, backend, history, initial.id, request, {})
      expect(store.abort(initial.id)).toBe(true)
      finishGeneration({
        status: 'generated',
        artifact: { id: 'artifact-ignored', filename: 'ignored.kicad_sym' },
      })

      const outcome = await running
      expect(outcome).toEqual({
        state: {
          ...initial,
          status: 'cancelled',
          progress: '正在生成 Symbol…',
          updatedAt: '2026-09-05T00:00:00.000Z',
        },
        recorded: true,
      })
      expect(events).toEqual([
        { type: 'cancelled', at: '2026-09-05T00:00:00.000Z' },
      ])

      const page = await history.list({})
      expect(page).toEqual({
        entries: [
          {
            id: expect.stringMatching(/^hst_/),
            kind: 'symbol',
            createdAt: '2026-09-05T00:00:00.000Z',
            status: 'cancelled',
            input: {},
          },
        ],
        nextCursor: null,
      })
    } finally {
      rmSync(dir, { recursive: true, force: true })
      vi.useRealTimers()
    }
  })
})
