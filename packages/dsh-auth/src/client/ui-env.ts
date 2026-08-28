/**
 * Host theme + locale sensing for the client UI.
 *
 * The DSH slot system injects React components with PROPS, not the cordis ctx,
 * so the cards cannot reach `ctx.theme` / `ctx.locale` the way a plugin body
 * can. Both services do, however, publish their state into the DOM, and that
 * is what this module reads:
 *
 * - THEME — `ui-layout`'s presenter switches `body[data-ds-dark-theme]` from
 *   the resolved snapshot (`packages/client/ui-layout/src/client/theme-presenter.ts`,
 *   `DARK_ATTRIBUTE`), so the attribute's presence IS the dark palette. Same
 *   signal the sibling packages already use
 *   (`dsh-tool-schematic-gen/src/client/theme.ts`). `prefers-color-scheme` is
 *   deliberately NOT consulted: DSH resolves `system` itself, and an OS-dark /
 *   DSH-light combination would then be misdetected.
 * - LOCALE — `dsh-client-locale` writes `<html lang>` on every locale change
 *   (`syncDocumentLanguage`: `zh-CN` | `en`). Falling back to the browser's
 *   own `navigator.languages` keeps the UI usable on hosts without that
 *   plugin. Chinese is the last resort because this is a Chinese-first app
 *   (and `hq-eda-ai` defaults to zh: `languageMap[lang] || "zh"`).
 *
 * Both are exposed as `useSyncExternalStore` snapshots so every mounted card
 * re-renders together when the user flips theme or language.
 */
import { useSyncExternalStore } from 'react'
import type { AuthLocale, AuthTheme } from './lib.js'

/** DSH's dark-palette marker, written by ui-layout's theme presenter. */
export const DARK_ATTRIBUTE = 'data-ds-dark-theme'

function isDarkDocument(): boolean {
  if (typeof document === 'undefined') return false
  if (document.body?.hasAttribute(DARK_ATTRIBUTE)) return true
  // Fallbacks for hosts that mark the scheme on <html> instead of <body>.
  const root = document.documentElement
  if (!root) return false
  const dataTheme = root.getAttribute('data-theme')
  if (dataTheme !== null) return dataTheme.toLowerCase() === 'dark'
  return root.classList.contains('dark')
}

/** `zh-CN`, `zh-Hans`, `en-GB`, … → our locale id (`undefined` = unknown). */
function localeFromTag(tag: string | null | undefined): AuthLocale | undefined {
  if (!tag) return undefined
  const primary = tag.toLowerCase().split('-')[0]
  return primary === 'zh' || primary === 'en' ? primary : undefined
}

function detectLocale(): AuthLocale {
  if (typeof document !== 'undefined') {
    const fromDocument = localeFromTag(document.documentElement?.getAttribute('lang'))
    if (fromDocument) return fromDocument
  }
  if (typeof navigator !== 'undefined' && typeof window !== 'undefined') {
    // `window` is the browser test: Node exposes a global `navigator`
    // reporting the machine's own language, which would otherwise decide the
    // locale for non-browser runs (same guard DSH's locale plugin uses).
    for (const tag of [...(navigator.languages ?? []), navigator.language]) {
      const match = localeFromTag(tag)
      if (match) return match
    }
  }
  return 'zh'
}

let dark = isDarkDocument()
let locale = detectLocale()
const listeners = new Set<() => void>()
let darkObserver: MutationObserver | null = null
let localeObserver: MutationObserver | null = null

function notify(): void {
  for (const listener of [...listeners]) {
    try {
      listener()
    } catch {
      /* one crashing subscriber must not strand the rest on a stale value */
    }
  }
}

/** Re-read the DOM and notify only what actually changed. */
export function syncUiEnv(): void {
  let changed = false
  const nextDark = isDarkDocument()
  if (nextDark !== dark) {
    dark = nextDark
    changed = true
  }
  const nextLocale = detectLocale()
  if (nextLocale !== locale) {
    locale = nextLocale
    changed = true
  }
  if (changed) notify()
}

/** Start observing (idempotent; also re-reads so no change is missed). */
function watch(): void {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return
  if (!darkObserver && document.body) {
    darkObserver = new MutationObserver(syncUiEnv)
    darkObserver.observe(document.body, { attributes: true, attributeFilter: [DARK_ATTRIBUTE] })
  }
  if (!localeObserver && document.documentElement) {
    localeObserver = new MutationObserver(syncUiEnv)
    localeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['lang', 'data-theme', 'class'],
    })
  }
  syncUiEnv()
}

function subscribe(callback: () => void): () => void {
  watch()
  listeners.add(callback)
  return () => {
    listeners.delete(callback)
  }
}

const getDark = (): boolean => dark
const getLocale = (): AuthLocale => locale

/**
 * Synchronous read of the current dark-palette state. Safe outside React
 * (the auth client uses it when appending the overlay iframe, before any
 * component has a chance to subscribe).
 */
export function getCurrentDark(): boolean {
  return dark
}

/** Synchronous read of the current host surface color (matches the palette). */
export function getCurrentSurfaceColor(): string {
  return dark ? 'var(--dsw-alias-bg-layer-1, #20242c)' : 'var(--dsw-alias-bg-layer-1, #ffffff)'
}

/** `true` while the host renders the dark palette. */
export function useIsDark(): boolean {
  return useSyncExternalStore(subscribe, getDark, getDark)
}

/** The host UI language. */
export function useLocale(): AuthLocale {
  return useSyncExternalStore(subscribe, getLocale, getLocale)
}

/** The host color scheme in auth.eda.cn's own vocabulary. */
export function useColorScheme(): AuthTheme {
  return useIsDark() ? 'dark' : 'light'
}

/** Release the observers (called from `apply()`'s disposer). */
export function disposeUiEnv(): void {
  darkObserver?.disconnect()
  localeObserver?.disconnect()
  darkObserver = null
  localeObserver = null
  listeners.clear()
}
