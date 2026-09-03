import { afterEach, describe, expect, it, vi } from 'vitest'
import { keepToolCardVisible } from '../src/index.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('keepToolCardVisible', () => {
  it('cancels a pending animation frame when disposed', () => {
    let observerCallback: MutationCallback | undefined
    const disconnect = vi.fn()

    class TestMutationObserver {
      constructor(callback: MutationCallback) {
        observerCallback = callback
      }

      observe() {}

      disconnect() {
        disconnect()
      }
    }

    vi.stubGlobal('document', {
      documentElement: {
        querySelectorAll: () => [],
      },
    })
    vi.stubGlobal('MutationObserver', TestMutationObserver)

    const requestAnimationFrame = vi.fn(() => 17)
    const cancelAnimationFrame = vi.fn()
    vi.stubGlobal('requestAnimationFrame', requestAnimationFrame)
    vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrame)

    const dispose = keepToolCardVisible('.tool-card')
    observerCallback?.([], {} as MutationObserver)

    expect(requestAnimationFrame).toHaveBeenCalledTimes(1)

    dispose()
    dispose()

    expect(disconnect).toHaveBeenCalledTimes(2)
    expect(cancelAnimationFrame).toHaveBeenCalledOnce()
    expect(cancelAnimationFrame).toHaveBeenCalledWith(17)
  })
})
