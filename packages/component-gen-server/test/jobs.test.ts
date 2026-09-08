import { describe, expect, it, vi } from 'vitest'
import type { ComponentGenBackend } from '../src/backend.js'
import type { HistoryStore } from '../src/history.js'
import { JobStore, runGeneration } from '../src/jobs.js'
import type { HistoryEntry, StartJobRequest } from '../src/types.js'

describe('runGeneration cancellation', () => {
  it('keeps a job cancelled when the backend resolves after abort', async () => {
    const store = new JobStore()
    const req: StartJobRequest = {
      kind: 'symbol',
      input: { imageDataUrl: 'data:image/png;base64,AA==' },
    }
    const job = store.create(req, {})
    const append = vi.fn(async (entry: HistoryEntry) => entry)
    const history = { append } as unknown as HistoryStore

    const backend: ComponentGenBackend = {
      generateSymbol: vi.fn(async () => {
        store.abort(job.id)
        return { status: 'generated', artifact: { id: 'artifact-1' } }
      }),
      extractFootprint: vi.fn(),
      generateFootprint: vi.fn(),
    }

    const outcome = await runGeneration(store, backend, history, job.id, req, {})

    expect(outcome.state.status).toBe('cancelled')
    expect(append).toHaveBeenCalledWith(expect.objectContaining({ status: 'cancelled' }))
  })
})
