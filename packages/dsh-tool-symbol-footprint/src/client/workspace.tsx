/**
 * `@huaqiu/dsh-tool-symbol-footprint` — Component Gen workspace (browser half).
 *
 * Two `sidebar.footer.action` rows (Symbol Gen / Footprint Gen) + one
 * `shell.overlay` that draws the `@huaqiu/component-gen-app` workspace. A
 * single shared `{ open, page }` state drives both slots (the pattern from
 * dsh-web-files / dsh-web-terminal), and the app is the single HIL driver —
 * generation runs through the plugin's own webServer routes
 * (`/api/v1/huaqiu/component-gen/*`) with no agent tool involved.
 *
 * Auth is the `huaqiuAuth` CLIENT service (structural, never imported): the
 * same sanctioned source the GenHit card uses. The ports adapter only
 * consumes its public surface.
 */
import { createElement, useCallback, useEffect, useState, type ComponentType } from 'react'
import {
  ComponentGenApp, createHttpPorts, injectAppStyles,
  type ComponentGenAuthPort, type ComponentGenPage, type ComponentGenPorts,
} from '@huaqiu/component-gen-app'
import type { HuaqiuAuthClientService } from './index.js'

/** Shared workspace state for the two sidebar actions + the overlay. */
interface WorkspaceState {
  open: boolean
  page: ComponentGenPage
}
const listeners = new Set<() => void>()
const state: WorkspaceState = { open: false, page: 'footprint' }

function announce(): void {
  for (const fn of [...listeners]) {
    try { fn() } catch { /* one bad subscriber must not strand the rest */ }
  }
}

function setOpen(open: boolean): void {
  if (state.open === open) return
  state.open = open
  announce()
}

function openPage(page: ComponentGenPage): void {
  state.page = page
  state.open = true
  announce()
}

function useWorkspaceState(): WorkspaceState {
  const [, force] = useState(0)
  useEffect(() => {
    const listener = (): void => force((n) => n + 1)
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  }, [])
  return { open: state.open, page: state.page }
}

/** Host UI language from `<html lang>` (same heuristic as the GenHit theme). */
function detectLocale(): string | undefined {
  if (typeof document !== 'undefined') {
    const tag = document.documentElement?.getAttribute('lang')
    if (tag) {
      const primary = tag.toLowerCase().split('-')[0]
      if (primary === 'zh' || primary === 'en') return primary
    }
  }
  return undefined
}

/** Build the workspace ports: component-gen HTTP + dsh-auth client auth. */
export function createWorkspacePorts(
  auth: HuaqiuAuthClientService['auth'] | undefined,
): ComponentGenPorts {
  const authPort: ComponentGenAuthPort = {
    isAuthenticated: async () => auth?.isAuthenticated() ?? false,
    getUserInfo: async () => {
      try { return (await auth?.getUserInfo()) ?? null } catch { return null }
    },
    login: async () => {
      try { await auth?.login?.() } catch { /* dsh-auth owns the dialog */ }
    },
    onAuthStateChanged: (cb) => {
      if (!auth?.onAuthStateChanged) return () => {}
      return auth.onAuthStateChanged((info) => cb(!!info))
    },
  }
  return createHttpPorts({
    base: '/api/v1/huaqiu/component-gen',
    artifactsBase: '/api/v1/huaqiu/artifacts',
    auth: authPort,
  })
}

/** Full-viewport overlay panel hosting the app. */
function WorkspaceOverlay({ ports }: { ports: ComponentGenPorts }): JSX.Element {
  const { open, page } = useWorkspaceState()
  const lang = detectLocale()
  const close = useCallback(() => setOpen(false), [])
  if (!open) return <></>
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 120,
        display: 'flex',
        alignItems: 'stretch',
        justifyContent: 'center',
        padding: 'clamp(8px, 2.5vh, 28px)',
        boxSizing: 'border-box',
        background: 'color-mix(in srgb, var(--dsw-alias-bg-layer-1, #0b0d10) 82%, transparent)',
        backdropFilter: 'blur(2px)',
        pointerEvents: 'auto',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) close() }}
    >
      <div
        style={{
          width: 'min(880px, 100%)',
          height: '100%',
          overflow: 'auto',
          background: 'var(--dsw-alias-bg-layer-1, #0b0d10)',
          border: '1px solid var(--dsw-alias-border-l1, rgba(127,127,127,0.3))',
          borderRadius: '12px',
          padding: '16px',
          boxSizing: 'border-box',
        }}
      >
        <ComponentGenApp ports={ports} page={page} lang={lang} showHistory onClose={close} />
      </div>
    </div>
  )
}

/** Sidebar footer action row for one generator. */
function WorkspaceAction({ page, label, wide }: { page: ComponentGenPage; label: string; wide: boolean }): JSX.Element {
  const { open } = useWorkspaceState()
  const toggle = useCallback(() => {
    if (state.open && state.page === page) setOpen(false)
    else openPage(page)
  }, [page])
  return createElement(
    'button',
    {
      type: 'button',
      onClick: toggle,
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        width: '100%',
        padding: '6px 10px',
        border: '1px solid var(--dsw-alias-border-l1, rgba(127,127,127,0.3))',
        borderRadius: '6px',
        background: open && state.page === page
          ? 'var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,0.12))'
          : 'var(--dsw-alias-bg-layer-1, transparent)',
        color: 'var(--dsw-alias-label-primary, currentColor)',
        font: 'var(--dsw-font-xxs-12, 12px/1.4 system-ui, sans-serif)',
        cursor: 'pointer',
      },
    },
    wide ? createElement('span', { style: { textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, label) : null,
  )
}

/**
 * Register the workspace UI. Call from the client `apply()`; returns a
 * disposer. `auth` is the `huaqiuAuth` client service (may be absent).
 */
export function installWorkspace(
  ctx: { slots?: { inject(key: string, callback: () => () => void): () => void; register(spec: { name: string; key?: string; id?: string; order?: number }, component: unknown): unknown } },
  auth: HuaqiuAuthClientService['auth'] | undefined,
): () => void {
  const disposers: Array<() => void> = []
  const ports = createWorkspacePorts(auth)

  const slots = ctx.slots
  if (slots && typeof slots.inject === 'function' && typeof slots.register === 'function') {
    const Overlay = (): JSX.Element => <WorkspaceOverlay ports={ports} />
    disposers.push(slots.inject('shell.overlay', () => slots.register({ name: 'shell.overlay', id: 'huaqiu-component-gen' }, Overlay) as () => void))

    const SymbolAction: ComponentType<{ wide: boolean }> = ({ wide }) =>
      <WorkspaceAction page="symbol" label="Symbol 生成" wide={wide} />
    const FootprintAction: ComponentType<{ wide: boolean }> = ({ wide }) =>
      <WorkspaceAction page="footprint" label="封装生成" wide={wide} />

    // Explicit adjacent order so the two rows sit together above defaults.
    disposers.push(slots.inject('sidebar.footer.action', () => slots.register({ name: 'sidebar.footer.action', id: 'huaqiu-symbol-gen', order: -2 }, SymbolAction) as () => void))
    disposers.push(slots.inject('sidebar.footer.action', () => slots.register({ name: 'sidebar.footer.action', id: 'huaqiu-footprint-gen', order: -3 }, FootprintAction) as () => void))
  }

  injectAppStyles()

  return () => {
    for (const dispose of disposers) {
      try { dispose() } catch { /* already disposed */ }
    }
    disposers.length = 0
  }
}
