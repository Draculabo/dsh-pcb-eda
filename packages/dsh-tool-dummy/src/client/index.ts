/**
 * `@huaqiu/dsh-tool-dummy` — browser half.
 *
 * Mounts one sidebar toolbutton in the Huaqiu family block ("Dummy 插件") that
 * opens a small probe panel: the panel calls the node half's
 * `GET /api/v1/huaqiu/dummy` route and shows which published build answered.
 *
 * The plugin's whole purpose is to be DISCOVERABLE — it is the fixture for
 * hq-edge's remote plugin discovery (manifest → active inventory → install /
 * update / current states in the PluginUpdate view). It deliberately carries
 * no product behaviour: no badge, no store, no timers, no `hqEdge` bridge.
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
import { dummyCopy, openDummyView, closeDummyView } from './view.js'
import { FLASK_ICON } from './icons.js'

/** Stable data attributes identifying the injected entry row. */
export const DUMMY_ENTRY_SELECTOR = '[data-hq-dummy-entry]'
export const DUMMY_ENTRY_ATTRIBUTE = 'data-hq-dummy-entry'

/** L2 semantic plugin id: rows carry data-dsh-plugin + data-dsh-part. */
const PLUGIN_ID = 'huaqiu-dummy'

/** Row class names (defined by {@link ENTRY_CSS_TEXT}). */
const ENTRY_CSS: Record<string, string> = {
  entry: 'hqd-sidebar-entry',
  entryIcon: 'hqd-sidebar-entry__icon',
  entryLabel: 'hqd-sidebar-entry__label',
}

/** Localized row copy: zh is the fallback, matching the family convention. */
function entryCopy(lang: HostLocale | undefined): { label: string; tooltip: string } {
  const c = dummyCopy(lang)
  return lang === 'en'
    ? { label: 'Dummy', tooltip: 'Open the dummy plugin panel' }
    : { label: 'Dummy 插件', tooltip: '打开 Dummy 插件面板' }
}

/** Sidebar row glyph — a flask: "test fixture" at the shell's 16px nav size. */
export const DUMMY_ICON = FLASK_ICON(16)

/** Sidebar entry styles — matched to the family rows (same inset/padding/gap
 *  as the shell's own Plugins entry, `SidebarRoot.module.css` `.panelRow`).
 *  Every colour rides a `--dsw-alias-*` token so the row follows the shell's
 *  light/dark theme. */
const ENTRY_CSS_TEXT = `
.hqd-sidebar-entry {
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
  border-radius: var(--dsw-radius-md, 12px);
  color: var(--dsw-alias-label-primary);
  cursor: pointer;
  font: inherit;
  line-height: 22px;
  text-align: left;
  white-space: nowrap;
}
.hqd-sidebar-entry:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}
.hqd-sidebar-entry[data-active] {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}
.hqd-sidebar-entry:focus-visible {
  outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: -2px;
}
.hqd-sidebar-entry__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
}
.hqd-sidebar-entry__icon svg {
  display: block;
  width: 16px;
  height: 16px;
}
.hqd-sidebar-entry__label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}
/* Collapsed rail: icon-only, centered — same 36px square the shell uses. */
[data-sidebar-collapsed] .hqd-sidebar-entry {
  justify-content: center;
  width: 36px;
  height: 36px;
  margin: 0;
  padding: 0;
}
[data-sidebar-collapsed] .hqd-sidebar-entry__label {
  display: none;
}
`

function injectEntryStyles(): void {
  if (document.querySelector('style[data-plugin-css="huaqiu-dummy-entry"]') !== null) return
  const style = document.createElement('style')
  style.setAttribute('data-plugin-css', 'huaqiu-dummy-entry')
  style.textContent = ENTRY_CSS_TEXT
  document.head.appendChild(style)
}

/** Minimal structural client context (the DSH client runtime provides these).
 *  Declared structurally, never imported, so the package stays independently
 *  installable — the same pattern as the sibling tool plugins. */
export interface ClientContext {
  effect?(fn: () => (() => void) | void, label?: string): void
}

/** Cordis services this half needs: none — the row is plain DOM and the
 *  probe route is same-origin. */
export const inject: string[] = []

/**
 * Install the sidebar row + probe panel on the running client context.
 */
export function apply(ctx: ClientContext): () => void {
  injectEntryStyles()

  // Locale: the row re-renders its copy when <html lang> changes. The sidebar
  // helper subscribes via `refresh.subscribe`; fan out to its listeners.
  const localeSubscribers = new Set<() => void>()
  const refreshSubscribe = (listener: () => void): (() => void) => {
    localeSubscribers.add(listener)
    return () => {
      localeSubscribers.delete(listener)
    }
  }
  const unsubscribeLocale = observeHostLocale(() => {
    for (const fn of [...localeSubscribers]) {
      try {
        fn()
      } catch {
        /* one bad subscriber must not strand the rest */
      }
    }
  })

  const openView = (): void => {
    openDummyView(dummyCopy(detectHostLocale()))
  }

  const disposeEntry = mountSidebarEntry({
    rowAttribute: DUMMY_ENTRY_ATTRIBUTE,
    rowSelector: DUMMY_ENTRY_SELECTOR,
    plugin: PLUGIN_ID,
    icon: DUMMY_ICON,
    css: ENTRY_CSS,
    label: () => entryCopy(detectHostLocale()).label,
    tooltip: () => entryCopy(detectHostLocale()).tooltip,
    refresh: { subscribe: refreshSubscribe },
    onToggle: openView,
    position: 'after',
    familySelectors: HUAQIU_SIDEBAR_ENTRY_FAMILY,
  })

  const dispose = (): void => {
    try {
      disposeEntry()
    } catch {
      /* already disposed */
    }
    unsubscribeLocale()
    closeDummyView()
  }
  if (typeof ctx.effect === 'function') {
    // `ctx.effect` takes a SETUP function and calls it immediately, keeping
    // whatever it returns as the teardown. Passing `dispose` itself would run
    // the teardown synchronously — disconnecting the sidebar-entry observers
    // before the shell ever renders the sidebar, so the row could never be
    // placed. Hand it a factory that returns the teardown instead (the same
    // shape the sibling tool plugins use).
    ctx.effect(() => dispose, 'dsh-tool-dummy')
  }
  return dispose
}
