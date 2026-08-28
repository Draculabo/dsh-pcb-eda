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
import { createElement, type ComponentType } from 'react'
import { GenHit } from './hit-card.jsx'
import { injectStyles, removeStyles, disposeThemeObserver } from './theme.js'
import type { AuthStateLike, PromptSender } from './hit-card.jsx'

export type { AuthStateLike, PromptSender }

const TOOLVIEW_KEYS = [
  'generate_schematic_from_description',
  'generate_system_module_graph',
] as const

/** Client cordis inject: REAL service names only. */
export const inject: string[] = ['slots', 'sessions']

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

/** Read the auth plugin's shared credential cache (localStorage) — display only. */
function readAuthState(): AuthStateLike {
  try {
    const raw = localStorage.getItem('huaqiu.dsh.auth')
    if (!raw) return { authenticated: false }
    const parsed = JSON.parse(raw) as { token?: string; nickname?: string; expiresAt?: number }
    const ok = typeof parsed.token === 'string' && parsed.token.length > 0
    const expired = typeof parsed.expiresAt === 'number' && parsed.expiresAt > 0 && parsed.expiresAt < Math.floor(Date.now() / 1000)
    return { authenticated: ok && !expired, nickname: typeof parsed.nickname === 'string' ? parsed.nickname : undefined }
  } catch {
    return { authenticated: false }
  }
}

export function apply(ctx: ClientContext): () => void {
  const disposers: Array<() => void> = []

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
      inspect?: () => void
    }> = (props) =>
      createElement(GenHit, {
        ...props,
        toolName: props.toolName ?? '',
        block: props.block as never,
        sessionId: props.sessionId,
        sendPrompt,
        authState: readAuthState(),
      })

    for (const toolName of TOOLVIEW_KEYS) {
      disposers.push(slots.inject('tool.call.toolview', () => slots.register(
        { name: 'tool.call.toolview', key: toolName },
        GenHitView,
      ) as () => void))
    }
  }

  injectStyles()

  const cleanup = (): void => {
    for (const dispose of disposers) {
      try { dispose() } catch { /* already disposed */ }
    }
    disposers.length = 0
    removeStyles()
    disposeThemeObserver()
  }
  if (ctx.effect) ctx.effect(() => cleanup, 'schematic-gen: HIT dispose')
  return cleanup
}
