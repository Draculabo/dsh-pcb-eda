/**
 * `@huaqiu/dsh-tool-schematic-gen` — browser half (the schematic/system HIT).
 *
 * Registers keyed `tool.call.toolview` entries for both
 * `generate_schematic_from_description` and `generate_system_module_graph`,
 * replacing the stock JSON fallback (and the auth plugin's generic row) with
 * the `GenHit` card: header → summary → ECAD canvas preview (single sheet for
 * the schematic tool, project zip root sheet for the system tool) → actions.
 *
 * The authoritative state comes from DSH itself: the frozen `ToolCallBlock` is
 * projected by the pure `projectToolCall()` into a single phase. Human answers
 * ("regenerate") are sent back to the agent through
 * `sessions.binding(sessionId).session.prompt`, so the node `ask()` stays the
 * single source of truth.
 */
import { createElement, useEffect, useState, type ComponentType } from 'react'
import { GenHit } from './hit-card.jsx'
import { injectStyles, removeStyles, disposeThemeObserver, installSchematicUncollapser } from './theme.js'
import type { AuthStateLike, PromptSender } from './hit-card.jsx'

export type { AuthStateLike, PromptSender }

const TOOLVIEW_KEYS = [
  'generate_schematic_from_description',
  'generate_system_module_graph',
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

/**
 * Structural view of the `huaqiuAuth` CLIENT service (`@huaqiu/dsh-auth`).
 *
 * Declared structurally, never imported: each package must remain
 * independently installable. `nickname` is optional because the HQ Edge host
 * contract may not supply one.
 */
export interface HuaqiuAuthClientService {
  auth?: {
    isAuthenticated(): boolean
    getUserInfo(): Promise<{ nickname?: string } | null>
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
    const GenHitView: ComponentType<{
      toolName?: string
      block?: unknown
      sessionId?: string
      /**
       * Published as part of `ToolCallOwnerProps` and stable across the
       * running and settled forms. Forwarded so the card can correlate with
       * the node half's progress store.
       */
      callId?: string
      inspect?: () => void
    }> = (props) =>
      createElement(GenHit, {
        ...props,
        toolName: props.toolName ?? '',
        block: props.block as never,
        sessionId: props.sessionId,
        callId: props.callId,
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
  const uncollapseDispose = installSchematicUncollapser()

  const cleanup = (): void => {
    for (const dispose of disposers) {
      try { dispose() } catch { /* already disposed */ }
    }
    disposers.length = 0
    uncollapseDispose()
    removeStyles()
    disposeThemeObserver()
  }
  if (ctx.effect) ctx.effect(() => cleanup, 'schematic-gen: HIT dispose')
  return cleanup
}
