/**
 * `@huaqiu/dsh-tool-symbol-footprint` — browser half (the generation HIT).
 *
 * Registers a keyed `tool.call.toolview` for the three generation tool names
 * (generate_symbol_from_image, generate_footprint_from_image,
 * generate_footprint_from_dimensions), replacing the stock generic tool card
 * with the `GenHit` card: header → summary → ECAD canvas preview → actions,
 * plus the interactive dimension editor for the `needs_confirmation` phase and
 * an inline login card for the `needs_auth` phase.
 *
 * The authoritative state comes from DSH itself: the frozen `ToolCallBlock` is
 * projected by the pure `projectToolCall()` into a single phase. There is no
 * second state machine, no timers, no DOM scanning.
 *
 * Human answers ("confirm"/"cancel"/"regenerate") are sent back to the agent
 * through the session conversation (`sessions.binding(sessionId).session.prompt`),
 * so the node `ask()` stays the single source of truth (single-HIL invariant).
 */
import { createElement, useEffect, useState, type ComponentType } from 'react'
import { GenHit } from './hit-card.jsx'
import { injectStyles, removeStyles, disposeThemeObserver, installGenHitUncollapser } from './theme.js'
import { installWorkspace } from './workspace.jsx'

const TOOLVIEW_KEYS = [
  'generate_symbol_from_image',
  'generate_footprint_from_image',
  'generate_footprint_from_dimensions',
] as const

/**
 * Client cordis inject: REAL service names only.
 *
 * `huaqiuAuth` is the client service provided by `@huaqiu/dsh-auth`. It is the
 * ONLY sanctioned source of login state — this plugin must not read the
 * credential cache itself (spec §10). Reading `localStorage` directly would
 * duplicate the storage key and the expiry rule, and would report the user as
 * permanently logged out whenever `@huaqiu/dsh-auth` runs in HQ Edge host mode
 * (where there is no browser-side credential cache at all).
 */
export const inject: string[] = ['slots', 'sessions', 'huaqiuAuth']

/** Minimal structural client context (dsh-client-runtime provides these). */
export interface ClientContext {
  provide?(name: string, value: unknown): () => void
  slots?: {
    inject(key: string, callback: () => () => void): () => void
    register(spec: { name: string; key?: string; id?: string }, component: unknown): unknown
  }
  get<T = unknown>(name: string): T | undefined
  effect?(fn: () => (() => void) | void, label?: string): void
}

/** Login-state view used by the needs_auth card (sourced from the `huaqiuAuth` service). */
export interface AuthStateLike {
  authenticated: boolean
  nickname?: string
}

/**
 * Structural view of the `huaqiuAuth` CLIENT service (`@huaqiu/dsh-auth`).
 *
 * Declared structurally, never imported: each package must remain
 * independently installable. `nickname` is optional because the HQ Edge host
 * contract may not supply one. `login` opens the dsh-auth login dialog.
 */
export interface HuaqiuAuthClientService {
  auth?: {
    isAuthenticated(): boolean
    getUserInfo(): Promise<{ nickname?: string } | null>
    login?(): Promise<void>
    onAuthStateChanged(listener: (info: { nickname?: string } | null) => void): () => void
  }
}

const LOGGED_OUT: AuthStateLike = { authenticated: false }

function stateOf(info: { nickname?: string } | null): AuthStateLike {
  if (!info) return LOGGED_OUT
  return {
    authenticated: true,
    ...(info.nickname ? { nickname: info.nickname } : {}),
  }
}

/**
 * Subscribe to the `huaqiuAuth` client service.
 *
 * Built as a hook rather than a plain read because the service resolves
 * credentials asynchronously (`getUserInfo()`), while the card renders
 * synchronously. The first paint uses the cheap synchronous
 * `isAuthenticated()` so the card never flashes "logged out"; the effect then
 * resolves the full payload once and follows every subsequent change.
 */
function createUseAuthState(auth: HuaqiuAuthClientService['auth'] | undefined): () => AuthStateLike {
  return function useAuthState(): AuthStateLike {
    const [state, setState] = useState<AuthStateLike>(() => ({
      authenticated: auth?.isAuthenticated() ?? false,
    }))

    useEffect(() => {
      if (!auth) {
        setState(LOGGED_OUT)
        return
      }
      let alive = true
      void auth.getUserInfo()
        .then((info) => { if (alive) setState(stateOf(info)) })
        .catch(() => { if (alive) setState(LOGGED_OUT) })
      const off = auth.onAuthStateChanged((info) => {
        if (alive) setState(stateOf(info))
      })
      return () => {
        alive = false
        off()
      }
    }, [])

    return state
  }
}

/** Sends a user-originated message into the session conversation. */
export type PromptSender = (sessionId: string | undefined, message: string) => Promise<unknown>

export function apply(ctx: ClientContext): () => void {
  const disposers: Array<() => void> = []

  const authService = ctx.get<HuaqiuAuthClientService | undefined>('huaqiuAuth')
  const useAuthState = createUseAuthState(authService?.auth)

  const sendPrompt: PromptSender = (sessionId, message) => {
    const sessions = ctx.get<{ binding(id: string): { session: { prompt(content: Array<{ type: 'text'; text: string }>, mode: 'queue'): Promise<unknown> } } | undefined }>('sessions')
    if (!sessions || typeof sessions.binding !== 'function' || !sessionId) {
      return Promise.reject(new Error('no session conversation channel'))
    }
    const binding = sessions.binding(sessionId)
    const session = binding?.session
    if (!session || typeof session.prompt !== 'function') {
      return Promise.reject(new Error('no session conversation channel'))
    }
    return session.prompt([{ type: 'text', text: message }], 'queue')
  }

  const slots = ctx.slots
  if (slots && typeof slots.inject === 'function' && typeof slots.register === 'function') {
    // The slot renders the component with React, so we must hand it a real
    // React component (not an imperative call): `GenHit` is `memo()`-wrapped
    // and cannot be invoked as a plain function. `useAuthState()` subscribes
    // to the `huaqiuAuth` service so the needs_auth card tracks the live
    // login state instead of re-reading a cache on every render.
    const GenHitView: ComponentType<{
      toolName?: string
      block?: unknown
      sessionId?: string
      inspect?: () => void
    }> = (props) =>
      createElement(GenHit, {
        ...props,
        toolName: props.toolName ?? '',
        block: props.block as never,
        sessionId: props.sessionId,
        sendPrompt,
        authState: useAuthState(),
      })

    for (const toolName of TOOLVIEW_KEYS) {
      disposers.push(slots.inject('tool.call.toolview', () => slots.register(
        { name: 'tool.call.toolview', key: toolName },
        GenHitView,
      ) as () => void))
    }
  }

  injectStyles()
  const uncollapseDispose = installGenHitUncollapser()
  const workspaceDispose = installWorkspace(ctx, authService?.auth)

  const cleanup = (): void => {
    for (const dispose of disposers) {
      try { dispose() } catch { /* already disposed */ }
    }
    disposers.length = 0
    workspaceDispose()
    uncollapseDispose()
    removeStyles()
    disposeThemeObserver()
  }
  if (ctx.effect) ctx.effect(() => cleanup, 'symbol-footprint: HIT dispose')
  return cleanup
}
