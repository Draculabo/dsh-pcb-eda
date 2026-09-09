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

  it('is a safe no-op without animation frame scheduling', () => {
    vi.stubGlobal('document', { documentElement: {} })
    vi.stubGlobal('MutationObserver', class {})
    vi.stubGlobal('requestAnimationFrame', undefined)

    const dispose = keepToolCardVisible('.hq-genhit')

    expect(typeof dispose).toBe('function')
    dispose()
  })
})
