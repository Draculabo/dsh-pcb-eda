/**
 * Scoped stylesheet + dark-mode store for the schematic/system HIT card.
 * Uniquely-prefixed classes only; the style tag is removed on dispose.
 */
import { useEffect, useState } from 'react'

export const PLUGIN_ID = '@huaqiu/dsh-tool-schematic-gen'
export const STYLE_ID = 'hq-schematic-genhit-styles'

function isDark(): boolean {
  return !!(typeof document !== 'undefined' && document.body && document.body.hasAttribute('data-ds-dark-theme'))
}

const listeners = new Set<() => void>()
let themeState = { dark: isDark() }
let themeObserver: MutationObserver | null = null

function ensureThemeObserver(): void {
  if (themeObserver || !document.body) return
  themeObserver = new MutationObserver(() => {
    const d = isDark()
    if (d !== themeState.dark) {
      themeState.dark = d
      listeners.forEach((fn) => { try { fn() } catch { /* ignore */ } })
    }
  })
  themeObserver.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] })
}

export function useTheme(): boolean {
  const [dark, setDark] = useState(() => themeState.dark)
  useEffect(() => {
    ensureThemeObserver()
    const onChange = () => setDark(themeState.dark)
    listeners.add(onChange)
    return () => { listeners.delete(onChange) }
  }, [])
  return dark
}

export function disposeThemeObserver(): void {
  if (themeObserver) {
    themeObserver.disconnect()
    themeObserver = null
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
.hq-sch__login-iframe { width: 100%; height: 520px; border: 1px solid var(--dsw-alias-border-l1, currentColor); border-radius: 8px; background: #fff; display: block; }
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
