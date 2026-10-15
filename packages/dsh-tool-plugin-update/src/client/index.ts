/**
 * `@huaqiu/dsh-tool-plugin-update` — browser half.
 *
 * Mounts one sidebar toolbutton in the Huaqiu family block ("插件更新") with a
 * numeric badge equal to the actionable plugin-update count (spec §6.3/§7.1:
 * only compatible `update` + `install` items after host/HQ-Edge filtering and
 * after excluding the ignored offer; runtime updates are NOT counted). Click
 * opens the review/confirm/ignore modal.
 *
 * The authoritative state is the hq-edge report fetched through the plugin's
 * same-origin forwarding routes. A tiny in-memory store owns the latest report
 * + installing flag; the sidebar badge and the modal subscribe to it. No
 * timers beyond the install-poll and an idle 60 s refresh.
 *
 * @module
 */
import {
  HUAQIU_SIDEBAR_ENTRY_FAMILY,
  detectHostLocale,
  mountSidebarEntry,
  observeHostLocale,
  type HostLocale,
} from '@huaqiu/dsh-sidebar-entry'
import { checkUpdates, fetchReport, type PluginUpdateReport } from './api.js'
import { COPY } from './copy.js'
import { openUpdateView, type UpdateStoreLike } from './update-view.js'

/** Stable data attributes identifying the injected entry row. */
export const UPDATE_ENTRY_SELECTOR = '[data-hq-plugin-update-entry]'
export const UPDATE_ENTRY_ATTRIBUTE = 'data-hq-plugin-update-entry'

/** L2 semantic plugin id: rows carry data-dsh-plugin + data-dsh-part. */
const PLUGIN_ID = 'huaqiu-plugin-update'

/** Row class names (defined by {@link ENTRY_CSS_TEXT}). */
const ENTRY_CSS: Record<string, string> = {
  entry: 'hqpu-sidebar-entry',
  entryIcon: 'hqpu-sidebar-entry__icon',
  entryLabel: 'hqpu-sidebar-entry__label',
  entryBadge: 'hqpu-sidebar-entry__badge',
}

/** Localized row copy: zh is the fallback, matching the family convention. */
function entryCopy(lang: HostLocale | undefined): { label: string; tooltip: string } {
  return lang === 'en'
    ? { label: COPY.en.entryLabel, tooltip: COPY.en.entryTooltip }
    : { label: COPY.zh.entryLabel, tooltip: COPY.zh.entryTooltip }
}

/** Inline update glyph — `currentColor`, 16×16 like the shell's nav glyphs. */
export const UPDATE_ICON =
`<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
    <g fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">
        <path d="M2.5 8a5.5 5.5 0 1 1 1.61 3.89" />
        <path d="M2.5 8V4.75M2.5 8h3.25" />
    </g>
</svg>`

/** Sidebar entry styles — matched to the family rows (same inset/padding/gap
 *  as the shell's own Plugins entry). The badge is a 16px rounded pill. */
const ENTRY_CSS_TEXT = `
.hqpu-sidebar-entry {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  margin: 0 2px;
  min-height: 36px;
  padding: 7px 8px;
  background: transparent;
  border: none;
  border-radius: 12px;
  color: var(--dsw-alias-label-primary);
  cursor: pointer;
  font: inherit;
  line-height: 22px;
  text-align: left;
  white-space: nowrap;
}
.hqpu-sidebar-entry:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}
.hqpu-sidebar-entry[data-active] {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}
.hqpu-sidebar-entry__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
}
.hqpu-sidebar-entry__icon svg {
  display: block;
  width: 16px;
  height: 16px;
}
.hqpu-sidebar-entry__label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}
.hqpu-sidebar-entry__badge {
  flex: none;
  min-width: 16px;
  height: 16px;
  padding: 0 5px;
  border-radius: 8px;
  background: var(--dsw-alias-bg-badge, #e5484d);
  color: #fff;
  font-size: 11px;
  line-height: 16px;
  text-align: center;
}
/* Collapsed rail: icon-only, centered — same 36px square the shell uses. */
[data-sidebar-collapsed] .hqpu-sidebar-entry {
  justify-content: center;
  width: 36px;
  height: 36px;
  margin: 0;
  padding: 0;
}
[data-sidebar-collapsed] .hqpu-sidebar-entry__icon svg {
  width: 18px;
  height: 18px;
}
[data-sidebar-collapsed] .hqpu-sidebar-entry__label,
[data-sidebar-collapsed] .hqpu-sidebar-entry__badge {
  display: none;
}
`

/** Modal styles (hqpu-*). Plain overlay + panel, aligned to the shell's
 *  dark/light aliases. */
const VIEW_CSS_TEXT = `
.hqpu-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.45);
}
.hqpu-panel {
  box-sizing: border-box;
  width: min(640px, calc(100vw - 48px));
  max-height: min(80vh, 720px);
  display: flex;
  flex-direction: column;
  border-radius: 16px;
  background: var(--dsw-alias-bg-surface, #fff);
  color: var(--dsw-alias-label-primary, #1f2329);
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.24);
  overflow: hidden;
}
.hqpu-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--dsw-alias-line-border, rgba(0,0,0,.08));
}
.hqpu-title {
  flex: 1;
  font-size: 15px;
  font-weight: 600;
}
.hqpu-body {
  overflow: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.hqpu-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.hqpu-manifest {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--dsw-alias-label-secondary, #646a73);
}
.hqpu-manifest-value {
  font-weight: 600;
  color: var(--dsw-alias-label-primary, #1f2329);
}
.hqpu-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.hqpu-item {
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 8px;
  align-items: center;
  padding: 8px 10px;
  border-radius: 10px;
  background: var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,.04));
  font-size: 13px;
}
.hqpu-item-name {
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
}
.hqpu-item-version {
  color: var(--dsw-alias-label-secondary, #646a73);
  font-variant-numeric: tabular-nums;
}
.hqpu-item-state {
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 11px;
  line-height: 18px;
}
.hqpu-state-current { background: rgba(0,0,0,.06); color: var(--dsw-alias-label-secondary, #646a73); }
.hqpu-state-update, .hqpu-state-install { background: rgba(229,72,77,.12); color: #d92d33; }
.hqpu-state-ignored { background: rgba(0,0,0,.06); color: var(--dsw-alias-label-secondary, #646a73); }
.hqpu-state-blocked { background: rgba(229,72,77,.12); color: #d92d33; }
.hqpu-item-reason {
  grid-column: 1 / -1;
  font-size: 12px;
  color: var(--dsw-alias-label-tertiary, #8f959e);
}
.hqpu-ignored-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 10px;
  background: rgba(120,120,120,.1);
  font-size: 12px;
  color: var(--dsw-alias-label-secondary, #646a73);
}
.hqpu-empty {
  padding: 24px 0;
  text-align: center;
  color: var(--dsw-alias-label-tertiary, #8f959e);
  font-size: 13px;
}
.hqpu-runtime {
  border-top: 1px solid var(--dsw-alias-line-border, rgba(0,0,0,.08));
  padding-top: 12px;
}
.hqpu-runtime-title {
  font-size: 13px;
  font-weight: 600;
}
.hqpu-runtime-line {
  font-size: 12px;
  color: var(--dsw-alias-label-secondary, #646a73);
}
.hqpu-runtime-note {
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary, #8f959e);
}
.hqpu-runtime-error {
  font-size: 12px;
  color: #d92d33;
}
.hqpu-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.hqpu-btn {
  box-sizing: border-box;
  padding: 6px 14px;
  border-radius: 8px;
  border: 1px solid transparent;
  background: var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,.06));
  color: var(--dsw-alias-label-primary, #1f2329);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
.hqpu-btn-primary {
  background: #e5484d;
  color: #fff;
}
.hqpu-btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.hqpu-btn-ghost {
  background: transparent;
  border-color: var(--dsw-alias-line-border, rgba(0,0,0,.12));
}
.hqpu-btn-small {
  padding: 2px 10px;
  font-size: 12px;
}
.hqpu-installing {
  font-size: 13px;
  color: var(--dsw-alias-label-secondary, #646a73);
}
.hqpu-error {
  font-size: 13px;
  color: #d92d33;
}
`

const STYLE_TAG_ID = 'data-plugin-css="huaqiu-plugin-update"'

/** Inject styles once (idempotent). */
export function injectUpdateStyles(): void {
  if (typeof document === 'undefined') return
  if (document.querySelector(`style[${STYLE_TAG_ID}]`) !== null) return
  const tag = document.createElement('style')
  tag.dataset.pluginCss = 'huaqiu-plugin-update'
  tag.textContent = `${ENTRY_CSS_TEXT}\n${VIEW_CSS_TEXT}`
  document.head.appendChild(tag)
}

/** Minimal structural client context (dsh-client-runtime provides these). */
export interface ClientContext {
  get<T = unknown>(name: string): T | undefined
  effect?(fn: () => (() => void) | void, label?: string): void
}

/** In-memory update-report store shared by the badge and the modal. */
class UpdateStore implements UpdateStoreLike {
  private current: PluginUpdateReport | null = null
  private installingFlag = false
  private readonly listeners = new Set<() => void>()
  private refreshTimer: number | null = null

  report(): PluginUpdateReport | null {
    return this.current
  }

  installing(): boolean {
    return this.installingFlag
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /** Badge count per spec §6.3: actionable `update` + `install`, excluding the
   *  ignored offer (the server already folds ignore into item states; keep the
   *  client-side filter as a defensive second pass). */
  badgeCount(): number {
    const report = this.current
    if (report === null) return 0
    return report.items.filter(
      (item) => item.state === 'update' || item.state === 'install',
    ).length
  }

  private emit(): void {
    for (const listener of [...this.listeners]) {
      try {
        listener()
      } catch {
        /* one bad listener must not strand the rest */
      }
    }
  }

  async refresh(): Promise<PluginUpdateReport | null> {
    try {
      const report = await fetchReport()
      this.current = report
      this.emit()
      return report
    } catch {
      return this.current
    }
  }

  async check(): Promise<PluginUpdateReport | null> {
    try {
      const report = await checkUpdates()
      this.current = report
      this.emit()
      return report
    } catch {
      return this.current
    }
  }

  /** Mark the set as installing (set by the modal before the restart). */
  setInstalling(flag: boolean): void {
    this.installingFlag = flag
    this.emit()
  }

  /** Idle refresh while mounted (60 s) — no overlapping poll loop. */
  startIdleRefresh(): void {
    if (this.refreshTimer !== null) return
    this.refreshTimer = window.setInterval(() => {
      void this.refresh()
    }, 60_000) as unknown as number
  }

  stop(): void {
    if (this.refreshTimer !== null) {
      window.clearInterval(this.refreshTimer)
      this.refreshTimer = null
    }
    this.listeners.clear()
  }
}

/**
 * Client cordis inject: no service dependencies — the plugin reads the
 * hq-edge report purely through same-origin fetch (forwarded by its own node
 * half). `inject` stays empty so the loader never waits on another service.
 */
export const inject: string[] = []

/**
 * Client plugin body — mount the sidebar toolbutton + review modal.
 * @param ctx - real cordis client context.
 * @returns disposer removing the row and all subscriptions.
 */
export function apply(ctx: ClientContext): () => void {
  if (typeof document === 'undefined') return () => {}
  injectUpdateStyles()

  const store = new UpdateStore()
  const copy = { zh: COPY.zh, en: COPY.en }
  const copyFor = (): typeof COPY.zh => (locale === 'en' ? copy.en : copy.zh)

  // Locale: re-render the row copy when <html lang> changes. The sidebar
  // helper subscribes via `refresh.subscribe`; we fan out to its listener.
  let locale: HostLocale | undefined = detectHostLocale()
  const localeSubscribers = new Set<() => void>()
  const refreshSubscribe = (listener: () => void): (() => void) => {
    localeSubscribers.add(listener)
    return () => {
      localeSubscribers.delete(listener)
    }
  }
  const unsubscribeLocale = observeHostLocale((next) => {
    locale = next
    for (const fn of [...localeSubscribers]) {
      try {
        fn()
      } catch {
        /* one bad subscriber must not strand the rest */
      }
    }
  })
  const labelState = { label: entryCopy(locale).label, tooltip: entryCopy(locale).tooltip }
  const applyLabel = (): void => {
    const c = entryCopy(locale)
    labelState.label = c.label
    labelState.tooltip = c.tooltip
  }

  const openView = (): void => {
    // Always re-check on open so the review screen never shows stale data.
    void store.check().then((report) => {
      if (report !== null) openUpdateView(store, copyFor())
    })
  }

  const disposeEntry = mountSidebarEntry({
    rowAttribute: UPDATE_ENTRY_ATTRIBUTE,
    rowSelector: UPDATE_ENTRY_SELECTOR,
    plugin: PLUGIN_ID,
    icon: UPDATE_ICON,
    css: ENTRY_CSS,
    label: () => labelState.label,
    tooltip: () => labelState.tooltip,
    refresh: { subscribe: refreshSubscribe },
    badge: {
      subscribe: (listener) => store.subscribe(listener),
      count: () => store.badgeCount(),
    },
    onToggle: openView,
    position: 'after',
    familySelectors: HUAQIU_SIDEBAR_ENTRY_FAMILY,
  })

  store.startIdleRefresh()
  void store.refresh()

  const dispose = (): void => {
    try {
      disposeEntry()
    } catch {
      /* already disposed */
    }
    unsubscribeLocale()
    store.stop()
  }
  if (typeof ctx.effect === 'function') {
    // `ctx.effect` takes a SETUP function and calls it immediately, keeping
    // whatever it returns as the teardown. Passing `dispose` itself would run
    // the teardown synchronously — disconnecting the sidebar-entry observers
    // and stopping the store before the shell ever renders the sidebar, so the
    // row could never be placed. Hand it a factory that returns the teardown
    // instead (the same shape the sibling tool plugins use).
    ctx.effect(() => dispose, 'plugin-update')
  }
  return dispose
}
