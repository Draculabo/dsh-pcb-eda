import { describe, expect, it } from 'vitest'

import { LOG_LEVELS, parseLevel } from '../src/levels.js'

describe('log levels', () => {
  it('keeps the supported level set immutable at runtime', () => {
    expect(() => (LOG_LEVELS as string[]).push('trace')).toThrow(TypeError)
    expect(parseLevel('trace', 'info')).toBe('info')
  })
})
