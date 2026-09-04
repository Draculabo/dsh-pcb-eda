import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ComponentGenBackend } from '../src/backend.js'
import type { HistoryStore } from '../src/history.js'
import { JobStore, runGeneration } from '../src/jobs.js'
import type { JobEvent, StartJobRequest } from '../src/types.js'

afterEach(() => {
  vi.useRealTimers()
})

describe('runGeneration', () => {
  it('emits progress before the terminal job event', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-05T00:00:00.000Z'))

    const request: StartJobRequest = {
      kind: 'symbol',
      input: { imageDataUrl: 'data:image/png;base64,YQ==' },
    }
    const store = new JobStore()
    const state = store.create(request, {})
    const events: JobEvent[] = []
    const unsubscribe = store.subscribe(state.id, (event) => {
      events.push(event)
    })

    const backend: ComponentGenBackend = {
      generateSymbol: vi.fn().mockResolvedValue({ status: 'generated' }),
      extractFootprint: vi.fn(),
      generateFootprint: vi.fn(),
    }
    const history = {
      append: vi.fn().mockResolvedValue(undefined),
    } as unknown as HistoryStore

    await runGeneration(store, backend, history, state.id, request, {})
    unsubscribe?.()

    expect(events).toEqual([
      {
        type: 'progress',
        message: '正在生成 Symbol…',
        at: '2026-09-05T00:00:00.000Z',
      },
      {
        type: 'completed',
        job: {
          id: state.id,
          kind: 'symbol',
          status: 'completed',
          progress: '正在生成 Symbol…',
          result: { status: 'generated' },
          createdAt: '2026-09-05T00:00:00.000Z',
          updatedAt: '2026-09-05T00:00:00.000Z',
        },
        at: '2026-09-05T00:00:00.000Z',
      },
    ])
  })
})
