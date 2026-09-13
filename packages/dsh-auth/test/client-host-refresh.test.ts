// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { createAuthClient } from '../src/client/client.js'
import type { AuthStorage } from '../src/client/storage.js'
import type { AuthTransport } from '../src/client/transport.js'

describe('host auth refresh', () => {
  it('coalesces overlapping refreshes so stale requests cannot overwrite newer state', async () => {
    let resolveMode!: (mode: boolean) => void
    const pendingMode = new Promise<boolean>((resolve) => {
      resolveMode = resolve
    })
    const storage: AuthStorage = {
      get: () => null,
      set: vi.fn(),
      clear: vi.fn(),
    }
    const transport: AuthTransport = {
      pushSession: vi.fn(async () => undefined),
      pushLogout: vi.fn(async () => undefined),
      fetchHostMode: vi.fn(() => pendingMode),
      fetchSession: vi.fn(async () => ({
        authenticated: true,
        user: { id: 'host-user', token: 'host-token' },
      })),
      triggerLogin: vi.fn(async () => undefined),
      fetchUserInfo: vi.fn(async () => null),
    }
    const client = createAuthClient({
      storage,
      transport,
      windowLike: {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      } as never,
      documentLike: document,
    })

    const first = client.refreshHost()
    const second = client.refreshHost()

    expect(transport.fetchHostMode).toHaveBeenCalledTimes(1)
    resolveMode(true)

    await expect(Promise.all([first, second])).resolves.toEqual([true, true])
    expect(transport.fetchSession).toHaveBeenCalledTimes(1)
    await expect(client.auth.getUserInfo()).resolves.toEqual({ id: 'host-user', token: 'host-token' })
  })
})
