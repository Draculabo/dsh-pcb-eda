import { describe, expect, it } from 'vitest'
import { validateDimensions } from '../src/client/dims.js'

describe('validateDimensions', () => {
  it('applies body-size bounds consistently across geometry aliases', () => {
    expect(validateDimensions({
      Width: 700,
      Height: 700,
      Length: 700,
      body_width: 700,
      body_length: 700,
      boardWidth: 700,
      boardHeight: 700,
    })).toEqual([
      { key: 'Width', code: 'out_of_range' },
      { key: 'Height', code: 'out_of_range' },
      { key: 'Length', code: 'out_of_range' },
      { key: 'body_width', code: 'out_of_range' },
      { key: 'body_length', code: 'out_of_range' },
      { key: 'boardWidth', code: 'out_of_range' },
      { key: 'boardHeight', code: 'out_of_range' },
    ])
  })
})
