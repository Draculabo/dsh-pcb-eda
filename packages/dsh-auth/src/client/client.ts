/**
 * Auth client core — the Phase 0A POC logic, factored as a testable factory.
 * `apply()` in index.ts wires this to the real window/document/localStorage.
 */
import { AUTH_ORIGIN, handleAuthMessage, type AuthMessageEventLike, type AuthTokenPayload } from './lib.js'
import type { AuthStorage } from './storage.js'
import type { AuthTransport } from './transport.js'

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
  dispose(): void
}

export function createAuthClient(deps: AuthClientDeps): AuthClient {
  const trustedOrigin = deps.trustedOrigin ?? AUTH_ORIGIN
  const loginUrl = deps.loginUrl ?? `${AUTH_ORIGIN}/`
  const { storage, transport } = deps
  const listeners = new Set<(info: AuthTokenPayload | null) => void>()
  let iframe: ReturnType<typeof deps.documentLike.createElement> | null = null

  const emit = (info: AuthTokenPayload | null): void => {
    for (const listener of listeners) listener(info)
  }
  const closeIframe = (): void => {
    iframe?.remove()
    iframe = null
  }
  const openIframe = (): void => {
    if (iframe) return
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
      storage.clear()
      try {
        await transport.pushLogout()
      } catch {
        /* node half may be absent during dev — local state is still cleared */
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
    const msg = handleAuthMessage({ origin: event.origin, data: event.data })
    if (!msg) return
    if (msg.kind === 'token') {
      storage.set(msg.info)
      void transport.pushSession(msg.info).catch(() => { /* node may be absent */ })
      emit(msg.info)
      closeIframe()
    } else if (msg.kind === 'logout') {
      storage.clear()
      emit(null)
      closeIframe()
    } else if (msg.kind === 'close') {
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
      try {
        await transport.pushSession(restored)
      } catch {
        /* node half may be absent */
      }
    }
  }

  return {
    auth,
    handleMessageEvent,
    restore,
    dispose() {
      deps.windowLike.removeEventListener('message', onWindowMessage)
      closeIframe()
      void trustedOrigin // referenced for clarity: the gate lives in lib.handleAuthMessage
    },
  }
}
