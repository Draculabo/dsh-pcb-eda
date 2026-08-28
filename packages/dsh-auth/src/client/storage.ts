/**
 * localStorage-backed credential cache (client side). Survives reload, which
 * is what makes the fingerprint silent-login restore (acceptance group D) work.
 */
import type { AuthTokenPayload } from './lib.js'

export const DEFAULT_STORAGE_KEY = 'huaqiu.dsh.auth'

export interface AuthStorage {
  get(): AuthTokenPayload | null
  set(info: AuthTokenPayload): void
  clear(): void
}

export function createAuthStorage(
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>,
  key: string = DEFAULT_STORAGE_KEY,
): AuthStorage {
  return {
    get() {
      const raw = storage.getItem(key)
      if (!raw) return null
      try {
        const parsed = JSON.parse(raw) as AuthTokenPayload
        if (!parsed || typeof parsed.token !== 'string' || typeof parsed.id !== 'string') return null
        // Parity with auth.eda.cn's 5-day token window.
        if (parsed.expiresAt !== undefined && parsed.expiresAt * 1000 <= Date.now()) {
          storage.removeItem(key)
          return null
        }
        return parsed
      } catch {
        return null
      }
    },
    set(info) {
      storage.setItem(key, JSON.stringify(info))
    },
    clear() {
      storage.removeItem(key)
    },
  }
}
