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

  it('cancels a pending animation frame when disposed', () => {
    let observerCallback: MutationCallback | undefined
    const disconnect = vi.fn()

    class TestMutationObserver {
      constructor(callback: MutationCallback) {
        observerCallback = callback
      }

      observe(): void {}

      disconnect(): void {
        disconnect()
      }
    }

    const root = {
      querySelectorAll: vi.fn(() => []),
    }
    const requestAnimationFrame = vi.fn(() => 17)
    const cancelAnimationFrame = vi.fn()

    vi.stubGlobal('document', { documentElement: root })
    vi.stubGlobal('MutationObserver', TestMutationObserver)
    vi.stubGlobal('requestAnimationFrame', requestAnimationFrame)
    vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrame)

    const dispose = keepToolCardVisible('.hq-genhit')
    observerCallback?.([], {} as MutationObserver)

    expect(requestAnimationFrame).toHaveBeenCalledOnce()

    dispose()

    expect(disconnect).toHaveBeenCalledOnce()
    expect(cancelAnimationFrame).toHaveBeenCalledWith(17)
  })
})
