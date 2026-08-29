/**
 * Host UI environment (theme + locale) store and the scoped stylesheet for
 * the schematic/system HIT card.
 *
 * The DSH slot system injects React components with PROPS, not the cordis ctx,
 * so the card cannot reach `ctx.theme` / `ctx.locale` the way a plugin body
 * can. Both services do, however, publish their state into the DOM, and that
 * is what this module reads:
 *
 * - THEME — `ui-layout`'s theme presenter toggles `body[data-ds-dark-theme]`
 *   from the resolved snapshot, so the attribute's presence IS the dark
 *   palette. `prefers-color-scheme` is deliberately NOT consulted: DSH
 *   resolves `system` itself, and an OS-dark / DSH-light combination would
 *   then be misdetected.
 * - LOCALE — `dsh-client-locale` writes `<html lang>` on every locale change
 *   (`zh-CN` | `en`). `navigator.languages` is the fallback for hosts without
 *   that plugin; zh is the last resort because this is a Chinese-first app.
 *
 * Stylesheet: uniquely-prefixed classes only, token colors, no !important, no
 * DSH-internal selectors. The style tag is removed on dispose.
 */
import { useEffect, useState } from 'react'
import { LOGIN_IFRAME_HEIGHT, type AuthLocale } from './login-url.js'

export const PLUGIN_ID = '@huaqiu/dsh-tool-schematic-gen'
export const STYLE_ID = 'hq-schematic-genhit-styles'

const DARK_ATTRIBUTE = 'data-ds-dark-theme'

function isDark(): boolean {
  return !!(typeof document !== 'undefined' && document.body && document.body.hasAttribute(DARK_ATTRIBUTE))
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
    // locale for non-browser runs.
    for (const tag of [...(navigator.languages ?? []), navigator.language]) {
      const match = localeFromTag(tag)
      if (match) return match
    }
  }
  return 'zh'
}

const listeners = new Set<() => void>()
let themeState = { dark: isDark(), locale: detectLocale() }
let themeObserver: MutationObserver | null = null
let localeObserver: MutationObserver | null = null

function notify(): void {
  for (const fn of [...listeners]) {
    try { fn() } catch { /* one bad subscriber must not strand the rest */ }
  }
}

/** Re-read the DOM and notify only when something actually changed. */
function sync(): void {
  let changed = false
  const dark = isDark()
  if (dark !== themeState.dark) {
    themeState.dark = dark
    changed = true
  }
  const locale = detectLocale()
  if (locale !== themeState.locale) {
    themeState.locale = locale
    changed = true
  }
  if (changed) notify()
}

function ensureThemeObserver(): void {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return
  if (!themeObserver && document.body) {
    themeObserver = new MutationObserver(sync)
    themeObserver.observe(document.body, { attributes: true, attributeFilter: [DARK_ATTRIBUTE] })
  }
  if (!localeObserver && document.documentElement) {
    localeObserver = new MutationObserver(sync)
    localeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] })
  }
}

export function useTheme(): boolean {
  // Read fresh on every mount. With React 18's batched mount, multiple cards
  // capture the module-level snapshot at the same moment; the *first* one's
  // effect then flips `themeState` via `sync()`, but only that one card ever
  // re-renders because the others' `useState` has already locked onto the
  // initial value. Reading the DOM directly here costs one extra attribute
  // lookup per mount and fixes the silent pinning.
  const [dark, setDark] = useState(() => isDark())
  useEffect(() => {
    ensureThemeObserver()
    setDark(isDark())
    const onChange = () => setDark(themeState.dark)
    listeners.add(onChange)
    sync()
    return () => { listeners.delete(onChange) }
  }, [])
  return dark
}

/** The host UI language (`zh` by default). */
export function useLocale(): AuthLocale {
  // Same fix as `useTheme` — fresh DOM read on mount, otherwise the second
  // and later cards in a chat render in the module-load locale even though
  // DSH wrote `<html lang>` before any of them mounted.
  const [locale, setLocale] = useState(() => detectLocale())
  useEffect(() => {
    ensureThemeObserver()
    setLocale(detectLocale())
    const onChange = () => setLocale(themeState.locale)
    listeners.add(onChange)
    sync()
    return () => { listeners.delete(onChange) }
  }, [])
  return locale
}

/**
 * Synchronous, always-fresh read of the host locale (for non-React callers).
 * Re-reads the DOM rather than returning the cached snapshot, so it is safe
 * to call before any component has subscribed.
 */
export function getLocale(): AuthLocale {
  return detectLocale()
}

export function disposeThemeObserver(): void {
  if (themeObserver) {
    themeObserver.disconnect()
    themeObserver = null
  }
  if (localeObserver) {
    localeObserver.disconnect()
    localeObserver = null
  }
  listeners.clear()
}

const CSS = `
.hq-sch { width: 100%; box-sizing: border-box; border: 1px solid var(--dsw-alias-border-l1, rgba(127,127,127,0.25)); border-radius: 10px; background: var(--dsw-alias-bg-layer-1, transparent); overflow: hidden; }
.hq-sch__header { display: flex; align-items: center; gap: 8px; padding: 10px 12px; }
.hq-sch__icon { display: inline-flex; align-items: center; justify-content: center; flex: none; width: 24px; height: 24px; border-radius: 6px; background: var(--dsw-alias-interactive-bg-hover, transparent); color: var(--dsw-alias-label-primary, currentColor); }
.hq-sch__title { font: var(--dsw-font-s-strong-14, 14px/1.4 system-ui, sans-serif); color: var(--dsw-alias-label-primary, currentColor); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hq-sch__status { display: inline-flex; align-items: center; gap: 6px; margin-left: auto; flex: none; font: var(--dsw-font-xxs-12, 12px/1.4 system-ui, sans-serif); color: var(--dsw-alias-label-secondary, currentColor); }
.hq-sch__summary { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; padding: 0 12px 10px; }
.hq-sch__badge { display: inline-flex; align-items: center; max-width: 240px; padding: 1px 8px; border-radius: 999px; border: 1px solid var(--dsw-alias-border-l1, currentColor); font: var(--dsw-font-xxs-12, 12px/1.4 system-ui, sans-serif); color: var(--dsw-alias-label-secondary, currentColor); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hq-sch__badge--mono { font-family: var(--dsw-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace); }
.hq-sch__stage { position: relative; display: flex; align-items: center; justify-content: center; width: 100%; box-sizing: border-box; height: 420px; background: var(--dsw-alias-markdown-code-block, #0a1929); overflow: hidden; }
.hq-sch__canvas { display: block; width: 100%; height: 100%; background: var(--dsw-alias-markdown-code-block, #0a1929); }
.hq-sch__stage-msg { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; padding: 10px 14px; box-sizing: border-box; font: var(--dsw-font-xxs-12, 12px/1.4 system-ui, sans-serif); color: var(--dsw-alias-label-secondary, currentColor); text-align: center; }
.hq-sch__error { margin: 0 12px 10px; padding: 8px 10px; border-radius: 6px; border: 1px solid var(--dsw-alias-state-error-primary, rgba(220,50,50,0.3)); color: var(--dsw-alias-state-error-primary, currentColor); font: var(--dsw-font-xxs-12, 12px/1.4 system-ui, sans-serif); white-space: pre-wrap; }
.hq-sch__note { margin: 0 12px 10px; font: var(--dsw-font-xxs-12, 12px/1.4 system-ui, sans-serif); color: var(--dsw-alias-label-secondary, currentColor); white-space: pre-wrap; }
.hq-sch__actions { display: flex; flex-wrap: wrap; gap: 8px; padding: 0 12px 12px; }
.hq-sch__act { display: inline-flex; align-items: center; gap: 4px; border: 1px solid var(--dsw-alias-border-l1, currentColor); border-radius: 6px; padding: 5px 12px; background: var(--dsw-alias-bg-layer-1, transparent); color: var(--dsw-alias-label-primary, currentColor); font: var(--dsw-font-xxs-12, 12px/1.4 system-ui, sans-serif); cursor: pointer; }
.hq-sch__act:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,0.08)); }
.hq-sch__act:disabled { opacity: 0.5; cursor: default; }
.hq-sch__login { padding: 0 12px 12px; }
.hq-sch__login-desc { margin: 0 0 10px; font: var(--dsw-font-xxs-12, 12px/1.4 system-ui, sans-serif); color: var(--dsw-alias-label-secondary, currentColor); line-height: 1.5; }
.hq-sch__login-status { margin: 0 0 10px; font: var(--dsw-font-xxs-12, 12px/1.4 system-ui, sans-serif); line-height: 1.5; }
.hq-sch__login-iframe { width: 100%; height: ${LOGIN_IFRAME_HEIGHT}px; border: 0; border-radius: 8px; display: block; }

/* ── live call stack (long-running generations) ───────────────────────────── */
.hq-sch__progress { display: flex; align-items: center; gap: 8px; padding: 0 12px 8px; font: var(--dsw-font-xxs-12, 12px/1.4 system-ui, sans-serif); color: var(--dsw-alias-label-secondary, currentColor); }
.hq-sch__progress-timer { margin-left: auto; flex: none; font-family: var(--dsw-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace); }
.hq-sch__ladder { display: flex; gap: 3px; padding: 0 12px 4px; }
.hq-sch__ladder-step { height: 3px; flex: 1 1 0; border-radius: 3px; background: var(--dsw-alias-border-l1, rgba(127,127,127,0.25)); }
.hq-sch__ladder-step--done { background: var(--dsw-alias-state-success-primary, #188038); }
.hq-sch__ladder-step--active { background: var(--dsw-alias-state-running-primary, #1a73e8); }
.hq-sch__ladder-step--failed { background: var(--dsw-alias-state-error-primary, #d93025); }
.hq-sch__stack { max-height: 320px; overflow-y: auto; padding: 2px 12px 12px; }
.hq-sch__frame-row { display: flex; align-items: center; gap: 6px; padding: 2px 6px; border-radius: 6px; cursor: pointer; }
.hq-sch__frame-row:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,0.08)); }
.hq-sch__frame-row--leaf { cursor: default; }
.hq-sch__frame-chev { flex: none; width: 12px; font-size: 9px; line-height: 1; color: var(--dsw-alias-label-tertiary, currentColor); }
.hq-sch__frame-dot { flex: none; width: 6px; height: 6px; border-radius: 6px; background: var(--dsw-alias-border-l1, rgba(127,127,127,0.35)); }
.hq-sch__frame-dot--running { background: var(--dsw-alias-state-running-primary, #1a73e8); animation: hq-sch-pulse 1.2s ease-in-out infinite; }
.hq-sch__frame-dot--finished { background: var(--dsw-alias-state-success-primary, #188038); }
.hq-sch__frame-dot--failed { background: var(--dsw-alias-state-error-primary, #d93025); }
.hq-sch__frame-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: var(--dsw-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace); font-size: 11px; color: var(--dsw-alias-label-primary, currentColor); }
.hq-sch__frame-name--done { color: var(--dsw-alias-label-secondary, currentColor); }
.hq-sch__frame-name--running { font-weight: 600; }
.hq-sch__frame-meta { margin-left: auto; flex: none; display: flex; align-items: center; gap: 6px; font-family: var(--dsw-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace); font-size: 10px; color: var(--dsw-alias-label-tertiary, currentColor); }
.hq-sch__frame-count { padding: 0 4px; border-radius: 999px; background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,0.14)); }
.hq-sch__frame-children { border-left: 1px solid var(--dsw-alias-border-l1, rgba(127,127,127,0.25)); margin-left: 11px; }
.hq-sch__progress-empty { padding: 2px 12px 12px; font: var(--dsw-font-xxs-12, 12px/1.4 system-ui, sans-serif); color: var(--dsw-alias-label-tertiary, currentColor); }
@keyframes hq-sch-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
`

export function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.setAttribute('data-plugin', PLUGIN_ID)
  style.textContent = CSS
  document.head.appendChild(style)
}

export function removeStyles(): void {
  const style = document.getElementById(STYLE_ID)
  if (style && style.parentNode) style.parentNode.removeChild(style)
}
