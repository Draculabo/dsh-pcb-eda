import { describe, expect, it } from 'vitest'
import { ALLOWED_WS_HOSTS, resolveEndpoint } from '../src/protocol.js'

describe('component endpoint host whitelist', () => {
  it('cannot be extended at runtime', () => {
    expect(() => {
      ;(ALLOWED_WS_HOSTS as unknown as string[]).push('evil.example.com')
    }).toThrow()

    expect(() => resolveEndpoint({
      HQ_EDA_COMPONENT_WS_URL: 'wss://evil.example.com/componentV2/chat',
    })).toThrow(/not allowed/)
  })
})
