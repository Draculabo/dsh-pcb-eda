/**
 * Shared dark-mode store (body[data-ds-dark-theme]) + the scoped card
 * stylesheet. Uniquely-prefixed classes only, token colors, no !important,
 * no DSH-internal selectors. The style tag is removed on dispose.
 */
import { useEffect, useState } from 'react'

export const PLUGIN_ID = '@huaqiu/dsh-tool-symbol-footprint'
export const STYLE_ID = 'hq-genhit-styles'

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
.hq-genhit { width: 100%; box-sizing: border-box; border: 1px solid var(--dsw-alias-border-l1, rgba(127,127,127,0.25)); border-radius: 10px; background: var(--dsw-alias-bg-layer-1, transparent); overflow: hidden; }
.hq-genhit__header { display: flex; align-items: center; gap: 8px; padding: 10px 12px; }
.hq-genhit__icon { display: inline-flex; align-items: center; justify-content: center; flex: none; width: 24px; height: 24px; border-radius: 6px; background: var(--dsw-alias-interactive-bg-hover, transparent); color: var(--dsw-alias-label-primary, currentColor); }
.hq-genhit__title { font: var(--dsw-font-s-strong-14, 14px/1.4 system-ui, sans-serif); color: var(--dsw-alias-label-primary, currentColor); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hq-genhit__status { display: inline-flex; align-items: center; gap: 6px; margin-left: auto; flex: none; font: var(--dsw-font-xxs-12, 12px/1.4 system-ui, sans-serif); color: var(--dsw-alias-label-secondary, currentColor); }
.hq-genhit__summary { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; padding: 0 12px 10px; }
.hq-genhit__badge { display: inline-flex; align-items: center; max-width: 220px; padding: 1px 8px; border-radius: 999px; border: 1px solid var(--dsw-alias-border-l1, currentColor); font: var(--dsw-font-xxs-12, 12px/1.4 system-ui, sans-serif); color: var(--dsw-alias-label-secondary, currentColor); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hq-genhit__badge--mono { font-family: var(--dsw-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace); }
.hq-genhit__stage { position: relative; display: flex; align-items: center; justify-content: center; width: 100%; box-sizing: border-box; background: var(--dsw-alias-markdown-code-block, #0a1929); overflow: hidden; }
.hq-genhit__stage--symbol, .hq-genhit__stage--footprint { height: 320px; }
.hq-genhit__stage--schematic { height: 420px; }
.hq-genhit__stage--pcb { height: 480px; }
.hq-genhit__canvas { display: block; width: 100%; height: 100%; background: var(--dsw-alias-markdown-code-block, #0a1929); }
.hq-genhit__stage-msg { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; padding: 10px 14px; box-sizing: border-box; font: var(--dsw-font-xxs-12, 12px/1.4 system-ui, sans-serif); color: var(--dsw-alias-label-secondary, currentColor); text-align: center; }
.hq-genhit__error { margin: 0 12px 10px; padding: 8px 10px; border-radius: 6px; border: 1px solid var(--dsw-alias-state-error-primary, rgba(220,50,50,0.3)); color: var(--dsw-alias-state-error-primary, currentColor); font: var(--dsw-font-xxs-12, 12px/1.4 system-ui, sans-serif); white-space: pre-wrap; }
.hq-genhit__actions { display: flex; flex-wrap: wrap; gap: 8px; padding: 0 12px 12px; }
.hq-genhit__act { display: inline-flex; align-items: center; gap: 4px; border: 1px solid var(--dsw-alias-border-l1, currentColor); border-radius: 6px; padding: 5px 12px; background: var(--dsw-alias-bg-layer-1, transparent); color: var(--dsw-alias-label-primary, currentColor); font: var(--dsw-font-xxs-12, 12px/1.4 system-ui, sans-serif); cursor: pointer; }
.hq-genhit__act:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,0.08)); }
.hq-genhit__act:disabled { opacity: 0.5; cursor: default; }
.hq-genhit__note { margin: 0 12px 10px; font: var(--dsw-font-xxs-12, 12px/1.4 system-ui, sans-serif); color: var(--dsw-alias-label-secondary, currentColor); white-space: pre-wrap; }
.hq-genhit__editor { padding: 0 12px 4px; }
.hq-genhit__geom { display: block; width: 100%; height: auto; touch-action: none; }
.hq-genhit__body { fill: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,0.08)); stroke: var(--dsw-alias-label-primary, currentColor); stroke-width: 1.5; }
.hq-genhit__pad { fill: var(--dsw-alias-accent-primary, currentColor); opacity: 0.85; }
.hq-genhit__ball { fill: var(--dsw-alias-accent-primary, currentColor); opacity: 0.85; }
.hq-genhit__epad { fill: var(--dsw-alias-accent-primary, currentColor); opacity: 0.25; stroke: var(--dsw-alias-accent-primary, currentColor); stroke-width: 1; stroke-dasharray: 2 2; }
.hq-genhit__pkg { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; padding: 0 0 8px; }
.hq-genhit__badge--pkg { border-color: var(--dsw-alias-accent-primary, currentColor); color: var(--dsw-alias-accent-primary, currentColor); }
.hq-genhit__pkg-meta { font: var(--dsw-font-xxs-12, 12px/1.4 system-ui, sans-serif); color: var(--dsw-alias-label-secondary, currentColor); }
.hq-genhit__pkg-meta--sep { opacity: 0.85; }
.hq-genhit__dimline { stroke: var(--dsw-alias-label-secondary, currentColor); stroke-width: 1; }
.hq-genhit__dimlabel { fill: var(--dsw-alias-label-secondary, currentColor); font: 11px/1 system-ui, sans-serif; }
.hq-genhit__dimlabel--clickable { cursor: pointer; }
.hq-genhit__dimlabel--clickable:hover { fill: var(--dsw-alias-accent-primary, currentColor); text-decoration: underline; }
.hq-genhit__tol { fill: var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary, currentColor)); font: 9px/1 ui-monospace, SFMono-Regular, Menlo, monospace; }
.hq-genhit__arrow { fill: var(--dsw-alias-label-secondary, currentColor); }
.hq-genhit__handle { fill: var(--dsw-alias-accent-primary, currentColor); stroke: var(--dsw-alias-bg-layer-1, #fff); stroke-width: 1.5; cursor: ew-resize; }
.hq-genhit__handle--h { cursor: ns-resize; }
.hq-genhit__handle--wh { cursor: nwse-resize; }
.hq-genhit__drag-hint { padding: 0 2px 6px; font: var(--dsw-font-xxs-12, 12px/1.4 system-ui, sans-serif); color: var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary, currentColor)); }
.hq-genhit__fields { display: flex; flex-wrap: wrap; gap: 8px 12px; padding: 0 0 10px; }
.hq-genhit__field { display: inline-flex; align-items: center; gap: 6px; }
.hq-genhit__field-label { font: var(--dsw-font-xxs-12, 12px/1.4 system-ui, sans-serif); color: var(--dsw-alias-label-secondary, currentColor); }
.hq-genhit__field-label--edited { color: var(--dsw-alias-accent-primary, currentColor); }
.hq-genhit__field-tag { font: 10px/1.2 system-ui, sans-serif; padding: 1px 4px; border-radius: 4px; }
.hq-genhit__field-tag--ai { color: var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary, currentColor)); border: 1px solid var(--dsw-alias-border-l1, currentColor); }
.hq-genhit__field-tag--edited { color: var(--dsw-alias-accent-primary, currentColor); border: 1px solid var(--dsw-alias-accent-primary, currentColor); }
.hq-genhit__field-input { width: 72px; padding: 3px 6px; border-radius: 6px; border: 1px solid var(--dsw-alias-border-l1, currentColor); background: var(--dsw-alias-bg-layer-1, transparent); color: var(--dsw-alias-label-primary, currentColor); font: var(--dsw-font-xxs-12, 12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace); }
.hq-genhit__field--invalid .hq-genhit__field-input { border-color: var(--dsw-alias-state-error-primary, currentColor); }
.hq-genhit__field-unit { font: var(--dsw-font-xxs-12, 12px/1.4 system-ui, sans-serif); color: var(--dsw-alias-label-secondary, currentColor); }
.hq-genhit__adv { padding: 0 0 8px; }
.hq-genhit__adv-toggle { display: inline-flex; align-items: center; gap: 4px; border: 1px solid var(--dsw-alias-border-l1, currentColor); border-radius: 6px; padding: 3px 8px; background: var(--dsw-alias-bg-layer-1, transparent); color: var(--dsw-alias-label-secondary, currentColor); font: var(--dsw-font-xxs-12, 12px/1.4 system-ui, sans-serif); cursor: pointer; }
.hq-genhit__fields--adv { padding-top: 8px; }
.hq-genhit__validation { display: flex; align-items: baseline; gap: 6px; padding: 6px 10px; margin: 0 0 10px; border-radius: 6px; font: var(--dsw-font-xxs-12, 12px/1.4 system-ui, sans-serif); color: var(--dsw-alias-label-secondary, currentColor); background: var(--dsw-alias-interactive-bg-hover, transparent); }
.hq-genhit__validation--warn { color: var(--dsw-alias-state-warning-primary, var(--dsw-alias-state-error-primary, currentColor)); background: var(--dsw-alias-state-warning-bg, transparent); }
.hq-genhit__validation-detail { opacity: 0.85; }
.hq-genhit__login { padding: 0 12px 12px; }
.hq-genhit__login-desc { margin: 0 0 10px; font: var(--dsw-font-xxs-12, 12px/1.4 system-ui, sans-serif); color: var(--dsw-alias-label-secondary, currentColor); line-height: 1.5; }
.hq-genhit__login-status { margin: 0 0 10px; font: var(--dsw-font-xxs-12, 12px/1.4 system-ui, sans-serif); line-height: 1.5; }
.hq-genhit__login-iframe { width: 100%; height: 520px; border: 1px solid var(--dsw-alias-border-l1, currentColor); border-radius: 8px; background: #fff; display: block; }
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
