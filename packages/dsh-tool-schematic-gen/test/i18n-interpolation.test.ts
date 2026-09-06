import { describe, expect, it } from 'vitest'
import { translate } from '../src/client/i18n.js'

describe('card copy interpolation', () => {
  it('does not interpolate placeholder text introduced by a parameter value', () => {
    expect(translate('en', 'card.auth.loggedIn', {
      nickname: ' {tool}',
      tool: 'replacement',
    })).toBe('✓ Logged in {tool} — reply "I have logged in, please retry" and the assistant will retry.')
  })
})
