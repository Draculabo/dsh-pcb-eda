/**
 * `@huaqiu/dsh-tool-uncollapse` — smoke tests.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { keepToolCardVisible } from '../src/index.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('keepToolCardVisible', () => {
  it('is a safe no-op without a DOM (SSR / test env)', () => {
    const dispose = keepToolCardVisible('.hq-genhit')
    expect(typeof dispose).toBe('function')
    dispose()
  })

  it('is a safe no-op for invalid selectors', () => {
    const MutationObserver = vi.fn()
    vi.stubGlobal('document', {
      documentElement: {
        matches() {
          throw new Error('invalid selector')
        },
      },
    })
    vi.stubGlobal('MutationObserver', MutationObserver)

    const dispose = keepToolCardVisible('[')

    expect({
      disposeType: typeof dispose,
      observerCreated: MutationObserver.mock.calls.length,
    }).toEqual({
      disposeType: 'function',
      observerCreated: 0,
    })
    dispose()
  })
})
