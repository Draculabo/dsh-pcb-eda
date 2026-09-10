import { describe, expect, it, vi } from 'vitest'
import { JobStore } from '../src/jobs.js'

const request = {
  kind: 'symbol' as const,
  input: {},
}

describe('JobStore removal', () => {
  it('drops listeners when a job is removed', () => {
    const store = new JobStore()
    const state = store.create(request, {})
    const listener = vi.fn()

    const unsubscribe = store.subscribe(state.id, listener)
    expect(unsubscribe).not.toBeNull()

    store.remove(state.id)
    store.update(state.id, { status: 'completed' }, {
      type: 'completed',
      job: { ...state, status: 'completed' },
      at: new Date().toISOString(),
    })

    expect(listener).not.toHaveBeenCalled()
    expect(store.get(state.id)).toBeUndefined()
    expect(store.subscribe(state.id, listener)).toBeNull()
  })
})
