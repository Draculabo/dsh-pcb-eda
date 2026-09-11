import { describe, expect, it, vi } from 'vitest'
import {
  agentActions,
  callComponentAgent,
  commandTypes,
  type SocketLike,
} from '../src/protocol.js'

function fakeSocket(): SocketLike & { sent: string[] } {
  return {
    onopen: null,
    onmessage: null,
    onerror: null,
    onclose: null,
    sent: [],
    send(data: string) {
      this.sent.push(data)
    },
    close() {},
  }
}

describe('callComponentAgent token invalidation', () => {
  it('invalidates the cached credential before rejecting an expired-token frame', async () => {
    const socket = fakeSocket()
    const onTokenExpired = vi.fn()
    const request = callComponentAgent({
      url: 'ws://example.test/component',
      command: { type: commandTypes.PARSE_SYMBOL, context: {} },
      awaitActions: [agentActions.SYMBOL_BUTTON],
      socketFactory: () => socket,
      onTokenExpired,
    })

    socket.onopen?.(null)
    socket.onmessage?.({ data: JSON.stringify({ type: 12 }) })

    await expect(request).rejects.toThrow(/token was rejected/)
    expect(onTokenExpired).toHaveBeenCalledTimes(1)
  })
})
