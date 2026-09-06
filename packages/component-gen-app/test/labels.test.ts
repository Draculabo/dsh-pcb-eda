import { describe, expect, it } from 'vitest'

import { humanizeKey } from '../src/utils/labels.js'

describe('humanizeKey', () => {
  it('trims separator-derived whitespace from generated labels', () => {
    expect([
      humanizeKey('__body_width__'),
      humanizeKey('--leadPitch--'),
    ]).toEqual([
      'Body width',
      'Lead Pitch',
    ])
  })
})
