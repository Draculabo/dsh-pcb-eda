/**
 * Auth client core — the Phase 0A POC logic, factored as a testable factory.
 * `apply()` in index.ts wires this to the real window/document/localStorage.
 */
import {
  AUTH_ORIGIN,
  buildLoginUrl,
  handleAuthMessage,
  HOST_SURFACE,
  LOGIN_OVERLAY_BASE_STYLE,
  type AuthMessageEventLike,
  type AuthTokenPayload,
  type LoginOptions,
} from './lib.js'
import { getCurrentDark } from './ui-env.js'
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
    login(options?: LoginOptions): Promise<void>
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

  const emit = (info: AuthTokenPayload | null): void => {
    for (const listener of listeners) listener(info)
  }
  const closeIframe = (): void => {
    if (iframe) iframe.remove()
    iframe = null
  }
  /**
   * Open the full-viewport auth.eda.cn overlay.
   *
   * The iframe ELEMENT is painted with the host's app surface (DSH alias
   * `--dsw-alias-bg-layer-1` with a per-scheme fallback). The embedded doc
   * itself stays transparent (`fill=full` omitted, `data-iframe-mode` set
   * there), so the login card paints on the host surface. The two together
   * avoid Blink's white `BaseBackgroundColor()` default that would otherwise
   * show as a white "frame" around the card in dark mode.
   */
  const openIframe = (options: LoginOptions = {}): void => {
    if (iframe) return
    const el = deps.documentLike.createElement('iframe')
    el.src = buildLoginUrl({ baseUrl: loginUrl, ...options })
    el.style.cssText = `${LOGIN_OVERLAY_BASE_STYLE}background:${HOST_SURFACE[getCurrentDark() ? 'dark' : 'light']};`
    deps.documentLike.body.appendChild(el)
    iframe = el
  }

  const auth = {
    isAuthenticated: (): boolean => storage.get() !== null,
    getAccessToken: async (): Promise<string | null> => storage.get()?.token ?? null,
    getUserInfo: async (): Promise<AuthTokenPayload | null> => storage.get(),
    login: async (options?: LoginOptions): Promise<void> => openIframe(options ?? {}),
    logout: async (): Promise<void> => {
      storage.clear()
      try {
        await transport.pushLogout()
      } catch {
        /* node may be absent — local state is still cleared */
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
    const msg = handleAuthMessage(event)
    if (!msg) return
    if (msg.kind === 'token') {
      storage.set(msg.info)
      void transport.pushSession(msg.info).catch(() => { /* node push is best-effort; syncNow heals */ })
      emit(msg.info)
      closeIframe()
    } else if (msg.kind === 'logout') {
      storage.clear()
      emit(null)
      void transport.pushLogout().catch(() => { /* local state already cleared */ })
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
        /* boot push is best-effort; syncNow heals */
      }
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
      if (!info) return
      try {
        await transport.pushSession(info)
      } catch {
        /* sync is best-effort; a later focus event retries */
      }
    },
    dispose() {
      deps.windowLike.removeEventListener('message', onWindowMessage)
      closeIframe()
      void trustedOrigin // referenced for clarity: the auth iframe URL comes from it
    },
  }
}
