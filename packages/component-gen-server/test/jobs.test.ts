import { describe, expect, it, vi } from 'vitest'
import { JobStore } from '../src/jobs.js'

describe('JobStore', () => {
  it('isolates subscriber failures and respects disposal', () => {
    const store = new JobStore()
    const state = store.create({ kind: 'symbol', input: {} }, {})
    const events: string[] = []

    const disposeThrowing = store.subscribe(state.id, () => {
      events.push('throwing')
      throw new Error('subscriber failed')
    })
    const disposeHealthy = store.subscribe(state.id, (event) => {
      events.push(event.type)
    })

    expect(disposeThrowing).toBeTypeOf('function')
    expect(disposeHealthy).toBeTypeOf('function')

    store.settle(state.id, { status: 'completed', result: { ok: true } })
    expect(events).toEqual(['throwing', 'completed'])

    disposeThrowing?.()
    disposeHealthy?.()
    events.length = 0

    store.settle(state.id, { status: 'cancelled' })
    expect(events).toEqual([])
  })

  it('returns null when subscribing to an unknown job', () => {
    const listener = vi.fn()
    expect(store.subscribe('missing', listener)).toBeNull()
  })
})
