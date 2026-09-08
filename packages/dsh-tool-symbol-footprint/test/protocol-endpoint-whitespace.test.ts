import { describe, expect, it } from 'vitest'
import { resolveEndpoint } from '../src/protocol.js'

describe('resolveEndpoint whitespace', () => {
  it('normalizes surrounding whitespace before returning a valid override', () => {
    expect(resolveEndpoint({
      HQ_EDA_COMPONENT_WS_URL: '  wss://www.fdatasheets.com/componentV2/chat/  ',
    })).toBe('wss://www.fdatasheets.com/componentV2/chat')
  })
})
