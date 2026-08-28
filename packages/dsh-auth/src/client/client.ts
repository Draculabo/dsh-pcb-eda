/**
 * Auth client core — the Phase 0A POC logic, factored as a testable factory.
 * `apply()` in index.ts wires this to the real window/document/localStorage.
 */
import { AUTH_ORIGIN, handleAuthMessage, parseAuthMessageDebug, type AuthMessageEventLike, type AuthTokenPayload } from './lib.js'
import type { AuthStorage } from './storage.js'
import type { AuthTransport } from './transport.js'
import { dbg } from './debug.js'

export interface AuthClientDeps {
  storage: AuthStorage
  transport: AuthTransport
  /** Strict origin gate; defaults to auth.eda.cn. */
  trustedOrigin?: string
  loginUrl?: string
  windowLike: Pick<Window, 'addEventListener' | 'removeEventListener'>
  documentLike: Pick<Document, 'createElement' | 'body'>
}

export interface AuthClient {
  auth: {
    isAuthenticated(): boolean
    getAccessToken(): Promise<string | null>
    getUserInfo(): Promise<AuthTokenPayload | null>
    login(): Promise<void>
    logout(): Promise<void>
    onAuthStateChanged(listener: (info: AuthTokenPayload | null) => void): () => void
  }
  /** Route window 'message' events here. Exposed for direct testing. */
  handleMessageEvent(event: AuthMessageEventLike): void
  /** Re-push persisted credentials on boot (acceptance group D). */
  restore(): Promise<void>
  /** Re-push persisted credentials on demand (heals a reset/absent node half). */
  syncNow(): Promise<void>
  dispose(): void
}

export function createAuthClient(deps: AuthClientDeps): AuthClient {
  const trustedOrigin = deps.trustedOrigin ?? AUTH_ORIGIN
  const loginUrl = deps.loginUrl ?? `${AUTH_ORIGIN}/`
  const { storage, transport } = deps
  const listeners = new Set<(info: AuthTokenPayload | null) => void>()
  let iframe: ReturnType<typeof deps.documentLike.createElement> | null = null
  dbg('client-boot', { loginUrl, hasTrustedOrigin: Boolean(deps.trustedOrigin) })

  const emit = (info: AuthTokenPayload | null): void => {
    for (const listener of listeners) listener(info)
  }
  const closeIframe = (): void => {
    if (iframe) {
      dbg('overlay-close')
      iframe.remove()
    }
    iframe = null
  }
  const openIframe = (): void => {
    if (iframe) return
    dbg('overlay-open', { url: loginUrl })
    const el = deps.documentLike.createElement('iframe')
    el.src = loginUrl
    el.style.cssText =
      'position:fixed;inset:0;width:100vw;height:100vh;border:0;z-index:2147483647;background:#fff;'
    deps.documentLike.body.appendChild(el)
    iframe = el
  }

  const auth = {
    isAuthenticated: (): boolean => storage.get() !== null,
    getAccessToken: async (): Promise<string | null> => storage.get()?.token ?? null,
    getUserInfo: async (): Promise<AuthTokenPayload | null> => storage.get(),
    login: async (): Promise<void> => openIframe(),
    logout: async (): Promise<void> => {
      dbg('logout-requested')
      storage.clear()
      try {
        await transport.pushLogout()
        dbg('node-push-logout-ok')
      } catch {
        dbg('node-push-logout-failed')
      }
      emit(null)
      closeIframe()
    },
    onAuthStateChanged: (listener: (info: AuthTokenPayload | null) => void): (() => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }

  const handleMessageEvent = (event: AuthMessageEventLike): void => {
    // Offline deployment: no origin gate (see lib.ts). Envelope validation is
    // the only gate, so unrelated window messages can never corrupt state.
    const rawPreview = typeof event.data === 'string'
      ? event.data.slice(0, 240)
      : event.data === null ? 'null'
      : typeof event.data === 'object' ? (() => {
          try {
            const s = JSON.stringify(event.data)
            return s ? s.slice(0, 240) : '[object-nonjson]'
          } catch {
            return '[object-nonjson]'
          }
        })()
      : typeof event.data
    dbg('window-message', { origin: event.origin, data: rawPreview })
    const parsed = parseAuthMessageDebug(event.data)
    if (!parsed.ok) {
      dbg('message-rejected', { reason: parsed.reason })
      return
    }
    const msg = parsed.msg
    if (msg.kind === 'token') {
      dbg('token-accepted', { id: msg.info.id })
      storage.set(msg.info)
      dbg('storage-set', { id: msg.info.id, hasToken: Boolean(msg.info.token) })
      void transport.pushSession(msg.info)
        .then(() => dbg('node-push-ok'))
        .catch(() => dbg('node-push-failed'))
      emit(msg.info)
      dbg('auth-state', `authenticated (${msg.info.nickname ?? msg.info.id})`)
      closeIframe()
    } else if (msg.kind === 'logout') {
      storage.clear()
      dbg('storage-clear', 'via logout message')
      emit(null)
      dbg('auth-state', 'anonymous (logout)')
      void transport.pushLogout().then(() => dbg('node-push-logout-ok')).catch(() => dbg('node-push-logout-failed'))
      closeIframe()
    } else if (msg.kind === 'close') {
      dbg('close-dialog-message')
      closeIframe()
    }
  }

  const onWindowMessage = (event: MessageEvent): void => {
    handleMessageEvent({ origin: event.origin, data: event.data })
  }

  deps.windowLike.addEventListener('message', onWindowMessage)

  const restore = async (): Promise<void> => {
    const restored = storage.get()
    if (restored) {
      dbg('restore-hit', { id: restored.id })
      try {
        await transport.pushSession(restored)
        dbg('node-push-ok', 'restore')
      } catch {
        dbg('node-push-failed', 'restore')
      }
    } else {
      dbg('restore-miss')
    }
  }

  return {
    auth,
    handleMessageEvent,
    restore,
    /**
     * Re-push the persisted credential to the node half. Healing path: the
     * node keeps auth in memory, so a `dsh web` restart (or a failed first
     * push) drops it while the browser still has the token. Callers re-sync on
     * focus / visibilitychange / login-card mount so the tool gate reflects
     * the actual browser login without requiring a page reload.
     */
    async syncNow(): Promise<void> {
      const info = storage.get()
      if (!info) {
        dbg('sync-now-miss')
        return
      }
      try {
        await transport.pushSession(info)
        dbg('node-push-ok', 'syncNow')
      } catch {
        dbg('node-push-failed', 'syncNow')
      }
    },
    dispose() {
      deps.windowLike.removeEventListener('message', onWindowMessage)
      closeIframe()
      void trustedOrigin // referenced for clarity: the auth iframe URL comes from it
    },
  }
}
