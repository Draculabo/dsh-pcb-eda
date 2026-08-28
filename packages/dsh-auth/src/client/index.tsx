/**
 * `@huaqiu/dsh-auth` — browser half (the Phase 0A POC).
 *
 * Opens the auth.eda.cn login page in an overlay iframe, STRICTLY validates
 * the postMessage origin, caches credentials in localStorage (reload restore),
 * and pushes them to the node half over the plugin-owned webServer routes.
 * Provides the client-side `huaqiuAuth` service mirroring the node surface.
 *
 * On top of the credential flow it wires the two UI surfaces the login UX
 * needs:
 *   - `sidebar.footer.action` — a persistent 华秋EDA login entrypoint at the
 *     bottom of the sidebar (login/logout, live state).
 *   - `tool.call.toolview` (keyed per Huaqiu tool) — when a node tool returns
 *     `status: "needs_auth"` the tool card becomes the login HIT: an embedded
 *     auth.eda.cn iframe + login-state line, so login is a step of the
 *     conversation instead of a dead error the agent has to relay.
 */
import { createAuthStorage } from './storage.js'
import { createWebServerAuthTransport } from './transport.js'
import { createAuthClient, type AuthClient } from './client.js'
import { disposeAuth, registerAuth, registerAuthSync } from './auth-state.js'
import { HuaqiuToolView } from './ui/needs-auth-toolview.jsx'
import { HuaqiuAuthSidebarAction } from './ui/sidebar-action.jsx'

/**
 * Client cordis inject: REAL service names only (the loader maps these to
 * `ctx.inject([...])` dependencies). The `slots` registry service comes from
 * `@deepseek-ai/dsh-client-ui-slots`; it is required to register the toolview
 * and sidebar entries. The PACKAGE-level `dsh.client.inject` in package.json
 * (graph ordering) stays as-is and is NOT this export.
 */
export const inject: string[] = ['slots']

/** The Huaqiu tools whose `needs_auth` results surface the login card. */
export const AUTH_TOOL_NAMES = [
  'generate_symbol_from_image',
  'generate_footprint_from_image',
  'generate_footprint_from_dimensions',
  'generate_schematic_from_description',
  'generate_system_module_graph',
] as const

/** Minimal structural client context (dsh-client-runtime provides this). */
export interface ClientContext {
  provide?(name: string, value: unknown): () => void
  slots?: {
    inject(key: string, callback: () => () => void): () => void
    register(spec: { name: string; key?: string; id?: string }, component: unknown): unknown
  }
}

export function apply(ctx: ClientContext): () => void {
  const client: AuthClient = createAuthClient({
    storage: createAuthStorage(localStorage),
    transport: createWebServerAuthTransport(),
    windowLike: window,
    documentLike: document,
  })

  const disposers: Array<() => void> = []
  const disposeProvide = ctx.provide?.('huaqiuAuth', { auth: client.auth })
  registerAuth(client.auth)
  registerAuthSync(() => { void client.syncNow() })
  void client.restore()
  const logState = (info: { nickname?: string } | null): void => {
    console.info('[huaqiu-auth] state:', info ? `authenticated${info.nickname ? ` (${info.nickname})` : ''}` : 'anonymous')
  }
  disposers.push(client.auth.onAuthStateChanged((info) => {
    logState(info)
    void client.syncNow()
  }))

  // Healing: the node half keeps auth in memory, so a server restart drops it
  // while the browser still holds the token. Re-sync whenever the tab regains
  // focus/visibility so the tool gate flips back to authenticated without a
  // reload.
  const sync = (): void => { void client.syncNow() }
  window.addEventListener('focus', sync)
  document.addEventListener('visibilitychange', sync)
  disposers.push(() => {
    window.removeEventListener('focus', sync)
    document.removeEventListener('visibilitychange', sync)
  })

  const slots = ctx.slots
  if (slots && typeof slots.inject === 'function' && typeof slots.register === 'function') {
    for (const toolName of AUTH_TOOL_NAMES) {
      disposers.push(slots.inject('tool.call.toolview', () => slots.register({ name: 'tool.call.toolview', key: toolName }, HuaqiuToolView) as () => void))
    }
    disposers.push(slots.inject('sidebar.footer.action', () => slots.register({ name: 'sidebar.footer.action', id: 'huaqiu-auth' }, HuaqiuAuthSidebarAction) as () => void))
  }

  return () => {
    for (const dispose of disposers) {
      try {
        dispose()
      } catch {
        /* already disposed */
      }
    }
    disposeProvide?.()
    client.dispose()
    disposeAuth()
  }
}
