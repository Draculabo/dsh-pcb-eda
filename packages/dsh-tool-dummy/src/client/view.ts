/**
 * The dummy plugin's probe panel — a small modal that calls the node half's
 * `GET /api/v1/huaqiu/dummy` route and shows which build answered.
 *
 * This is the end of the discovery test loop: after a plugin is discovered,
 * installed and activated, opening this panel proves both halves are live
 * and reports the exact published version.
 *
 * Every colour rides a `--dsw-alias-*` token (light/dark follow the shell);
 * geometry tokens that the bundled shell may not publish carry the canonical
 * value as an inline `var(…, fallback)`, the same form the official
 * primitives use — so this panel never needs a runtime token backfill.
 *
 * @module
 */
import { CLOSE_ICON } from './icons.js'

/** Same-origin probe route (the node half mounts it under this prefix). */
export const DUMMY_ROUTE = '/api/v1/huaqiu/dummy'

const VIEW_CSS_TEXT = `
.hqd-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  box-sizing: border-box;
}
.hqd-scrim {
  position: absolute;
  inset: 0;
  background: var(--dsw-alias-bg-mask-1, rgba(0, 0, 0, 0.4));
  backdrop-filter: blur(var(--dsw-mask-blur, 4px));
}
.hqd-panel {
  position: relative;
  z-index: 1;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  width: min(520px, 100%);
  max-height: 100%;
  overflow: hidden;
  border-radius: var(--dsw-radius-panel, 28px);
  background: var(--dsw-alias-bg-layer-2);
  box-shadow: var(--dsw-elevation-prominent);
  color: var(--dsw-alias-label-primary);
}
.hqd-panel:focus {
  outline: none;
}
.hqd-panel:focus-visible {
  outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: -2px;
}
.hqd-head {
  display: flex;
  flex: none;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  box-sizing: border-box;
  padding: 22px 24px 12px;
}
.hqd-title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  line-height: 28px;
}
.hqd-intro {
  margin: 4px 0 0;
  color: var(--dsw-alias-label-secondary);
  font-size: 13px;
  line-height: 20px;
}
.hqd-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  box-sizing: border-box;
  padding: 0 24px 16px;
}
.hqd-status {
  margin: 0 0 12px;
  color: var(--dsw-alias-label-secondary);
  font-size: 13px;
  line-height: 20px;
}
.hqd-status[data-tone="error"] {
  color: var(--dsw-alias-state-error-primary);
}
.hqd-status[data-tone="success"] {
  color: var(--dsw-alias-state-success-primary);
}
.hqd-result {
  margin: 0;
  padding: 12px 14px;
  border: 1px solid var(--dsw-alias-border-l3);
  border-radius: var(--dsw-radius-md, 12px);
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  font-family: var(--dsw-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 12.5px;
  line-height: 20px;
  white-space: pre-wrap;
  word-break: break-all;
}
.hqd-footer {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  box-sizing: border-box;
  padding: 0 24px 20px;
}
.hqd-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 32px;
  padding: 0 14px;
  border: none;
  border-radius: var(--dsw-radius-md, 12px);
  background: transparent;
  color: var(--dsw-alias-label-primary);
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  font-weight: 500;
}
.hqd-btn:focus-visible {
  outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: -2px;
}
.hqd-btn--primary {
  background: var(--dsw-alias-button-primary-fill);
  color: var(--dsw-alias-label-primary-foreground);
}
.hqd-btn--primary:hover {
  background: var(--dsw-alias-button-primary-hover);
}
.hqd-btn--ghost:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}
.hqd-btn[disabled] {
  cursor: default;
  opacity: 0.6;
}
.hqd-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 32px;
  height: 32px;
  padding: 0;
  border: none;
  border-radius: var(--dsw-radius-sm, 8px);
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
}
.hqd-icon-btn:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}
.hqd-icon-btn:focus-visible {
  outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: -2px;
}
.hqd-visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}
@media (prefers-reduced-motion: reduce) {
  .hqd-overlay * {
    animation: none !important;
    transition: none !important;
  }
}
`

export interface DummyCopy {
  title: string
  intro: string
  probe: string
  probing: string
  close: string
  hint: string
  failed: (reason: string) => string
}

const ZH: DummyCopy = {
  title: 'Dummy 插件',
  intro: '探测节点半角的路由，确认哪个已发布版本正在运行。',
  probe: '探测',
  probing: '探测中…',
  close: '关闭',
  hint: '点击“探测”调用 GET /api/v1/huaqiu/dummy。',
  failed: (reason) => `探测失败：${reason}`,
}

const EN: DummyCopy = {
  title: 'Dummy plugin',
  intro: 'Probe the node half’s route to see exactly which published build is live.',
  probe: 'Probe',
  probing: 'Probing…',
  close: 'Close',
  hint: 'Click “Probe” to call GET /api/v1/huaqiu/dummy.',
  failed: (reason) => `Probe failed: ${reason}`,
}

export function dummyCopy(lang: string | undefined): DummyCopy {
  return lang === 'en' ? EN : ZH
}

/** Tiny element helper: tag + optional class + optional text. */
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className !== undefined && className.length > 0) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

function injectStyles(): void {
  if (document.querySelector('style[data-plugin-css="huaqiu-dummy-view"]') !== null) return
  const style = document.createElement('style')
  style.setAttribute('data-plugin-css', 'huaqiu-dummy-view')
  style.textContent = VIEW_CSS_TEXT
  document.head.appendChild(style)
}

/** Pretty-print a probe payload, keeping the key order stable. */
function formatPayload(payload: unknown): string {
  if (payload === null || typeof payload !== 'object') return String(payload)
  const record = payload as Record<string, unknown>
  const lines = Object.entries(record).map(([key, value]) => `  ${key}: ${JSON.stringify(value)}`)
  return `{\n${lines.join(',\n')}\n}`
}

/** Stable attribute identifying the (single-instance) probe panel. */
export const DUMMY_VIEW_ATTRIBUTE = 'data-hq-dummy-view'

/** Close the probe panel if it is open (idempotent). */
export function closeDummyView(): void {
  document.querySelector(`[${DUMMY_VIEW_ATTRIBUTE}]`)?.remove()
}

/**
 * Open the probe panel (single instance: a second call re-shows the open one,
 * the same guard the official plugin manager uses).
 */
export function openDummyView(copy: DummyCopy): void {
  const existing = document.querySelector<HTMLElement>(`[${DUMMY_VIEW_ATTRIBUTE}]`)
  if (existing !== null) {
    existing.style.display = ''
    return
  }

  injectStyles()

  const overlay = el('div', 'hqd-overlay')
  overlay.setAttribute(DUMMY_VIEW_ATTRIBUTE, '')

  const scrim = el('div', 'hqd-scrim')
  const panel = el('div', 'hqd-panel')
  panel.setAttribute('role', 'dialog')
  panel.setAttribute('aria-modal', 'true')
  panel.setAttribute('aria-label', copy.title)
  panel.tabIndex = -1

  // ── Head ──
  const head = el('div', 'hqd-head')
  const heading = el('div')
  const title = el('h2', 'hqd-title', copy.title)
  const intro = el('p', 'hqd-intro', copy.intro)
  heading.append(title, intro)
  const closeBtn = el('button', 'hqd-icon-btn')
  closeBtn.type = 'button'
  closeBtn.title = copy.close
  closeBtn.setAttribute('aria-label', copy.close)
  closeBtn.innerHTML = CLOSE_ICON(14)
  head.append(heading, closeBtn)
  panel.append(head)

  // ── Body ──
  const scroll = el('div', 'hqd-scroll')
  const status = el('p', 'hqd-status', copy.hint)
  const result = el('pre', 'hqd-result')
  result.hidden = true
  scroll.append(status, result)
  panel.append(scroll)

  // ── Footer ──
  const footer = el('div', 'hqd-footer')
  const closeFooter = el('button', 'hqd-btn hqd-btn--ghost', copy.close)
  closeFooter.type = 'button'
  const probeBtn = el('button', 'hqd-btn hqd-btn--primary', copy.probe)
  probeBtn.type = 'button'
  footer.append(closeFooter, probeBtn)
  panel.append(footer)

  overlay.append(scrim, panel)
  document.body.appendChild(overlay)
  panel.focus()

  const onKeydown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      overlay.remove()
      document.removeEventListener('keydown', onKeydown, true)
    }
  }
  document.addEventListener('keydown', onKeydown, true)
  scrim.addEventListener('click', () => {
    overlay.remove()
    document.removeEventListener('keydown', onKeydown, true)
  })
  const closeNow = (): void => {
    overlay.remove()
    document.removeEventListener('keydown', onKeydown, true)
  }
  closeBtn.addEventListener('click', closeNow)
  closeFooter.addEventListener('click', closeNow)

  const probe = async (): Promise<void> => {
    probeBtn.disabled = true
    status.dataset.tone = ''
    status.textContent = copy.probing
    result.hidden = true
    try {
      const response = await fetch(DUMMY_ROUTE, { headers: { accept: 'application/json' } })
      const text = await response.text()
      let payload: unknown = text
      try {
        payload = JSON.parse(text)
      } catch {
        /* keep the raw text */
      }
      if (!response.ok) {
        status.dataset.tone = 'error'
        status.textContent = copy.failed(`HTTP ${response.status}`)
        return
      }
      status.dataset.tone = 'success'
      status.textContent = ''
      result.textContent = formatPayload(payload)
      result.hidden = false
    } catch (error) {
      status.dataset.tone = 'error'
      status.textContent = copy.failed(error instanceof Error ? error.message : String(error))
    } finally {
      probeBtn.disabled = false
    }
  }
  probeBtn.addEventListener('click', () => {
    void probe()
  })

  // Probe once on open: the panel exists to answer "is it live?".
  void probe()
}
