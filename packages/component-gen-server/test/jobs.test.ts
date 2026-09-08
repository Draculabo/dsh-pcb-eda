import { describe, expect, it, vi } from 'vitest'
import { JobStore } from '../src/jobs.js'
import type { JobEvent } from '../src/types.js'

describe('JobStore subscriptions', () => {
  it('continues notifying subscribers when one listener throws', () => {
    const store = new JobStore()
    const job = store.create({ kind: 'symbol', input: {} }, {})
    const event: JobEvent = {
      type: 'progress',
      message: 'generating',
      at: '2026-09-09T00:00:00.000Z',
    }
    const listener = vi.fn()

    store.subscribe(job.id, () => {
      throw new Error('listener failed')
    })
    store.subscribe(job.id, listener)

    store.update(job.id, { status: 'running' }, event)

    expect(listener).toHaveBeenCalledOnce()
    expect(listener).toHaveBeenCalledWith(event)
  })
})
