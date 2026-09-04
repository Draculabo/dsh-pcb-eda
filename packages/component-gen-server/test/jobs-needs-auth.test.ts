import { describe, expect, it } from 'vitest'
import type { ComponentGenBackend } from '../src/backend.js'
import type { HistoryStore } from '../src/history.js'
import { JobStore, runGeneration } from '../src/jobs.js'
import type { HistoryEntry, StartJobRequest } from '../src/types.js'

describe('runGeneration needs_auth history', () => {
  it('waits for history persistence before reporting the outcome as recorded', async () => {
    let resolveAppendStarted!: () => void
    const appendStarted = new Promise<void>((resolve) => {
      resolveAppendStarted = resolve
    })

    let resolveAppend!: () => void
    const appendPending = new Promise<void>((resolve) => {
      resolveAppend = resolve
    })

    const appended: HistoryEntry[] = []
    const history = {
      async append(entry: HistoryEntry): Promise<HistoryEntry> {
        appended.push(entry)
        resolveAppendStarted()
        await appendPending
        return entry
      },
    } as unknown as HistoryStore

    const backend: ComponentGenBackend = {
      async generateSymbol() {
        return { status: 'needs_auth' }
      },
      async extractFootprint() {
        throw new Error('unexpected extractFootprint call')
      },
      async generateFootprint() {
        throw new Error('unexpected generateFootprint call')
      },
    }

    const request: StartJobRequest = {
      kind: 'symbol',
      input: { instruction: 'Generate the symbol' },
    }
    const store = new JobStore()
    const job = store.create(request, {})
    const running = runGeneration(store, backend, history, job.id, request, {})

    await appendStarted

    let settled = false
    void running.then(() => {
      settled = true
    })
    await Promise.resolve()

    expect(settled).toBe(false)

    resolveAppend()
    const outcome = await running

    expect(outcome).toEqual({
      state: store.get(job.id),
      recorded: true,
    })
    expect(appended).toHaveLength(1)
    expect(appended[0]).toEqual({
      id: appended[0]!.id,
      kind: 'symbol',
      createdAt: outcome.state.updatedAt,
      status: 'failed',
      input: { instruction: 'Generate the symbol' },
      error: 'Huaqiu EDA login required',
    })
  })
})
