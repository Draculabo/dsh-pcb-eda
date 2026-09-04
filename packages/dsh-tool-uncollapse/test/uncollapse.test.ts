/**
 * `@huaqiu/dsh-tool-uncollapse` — smoke tests.
 */
import { describe, expect, it } from 'vitest'
import { keepToolCardVisible } from '../src/index.js'

describe('keepToolCardVisible', () => {
  it('is a safe no-op without a DOM (SSR / test env)', () => {
    const dispose = keepToolCardVisible('.hq-genhit')
    expect(typeof dispose).toBe('function')
    dispose()
  })
})
