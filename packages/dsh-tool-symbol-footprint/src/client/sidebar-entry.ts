/**
 * `@huaqiu/dsh-tool-symbol-footprint` — sidebar entry wiring over the shared
 * injection core (`sidebar-entry-core.ts`, adapted from dsh-web's task-board /
 * skill-explorer / ssh pattern).
 *
 * Injects two compact rows — 封装生成 and Symbol 生成 — between the shell's New
 * Session button and the workspace browser, instead of the previous cramped
 * `sidebar.footer.action` buttons. Each row toggles the shared
 * `shell.overlay` workspace on its page. The row is plain DOM (no React tree);
 * the overlay it toggles is the React workspace owned by `workspace.tsx`.
 */
import { mountSidebarEntry as mountSharedSidebarEntry } from './sidebar-entry-core.js'

/** Stable data attributes identifying the injected entry rows. */
export const FOOTPRINT_ENTRY_SELECTOR = '[data-hqcg-footprint-entry]'
export const SYMBOL_ENTRY_SELECTOR = '[data-hqcg-symbol-entry]'

/** L2 semantic plugin id (issue #506): rows carry data-dsh-plugin + data-dsh-part. */
const PLUGIN_ID = 'huaqiu-component-gen'

/**
 * Inline icons (footprint.svg / symbol.svg from the repo root). Both viewBoxes
 * are cropped to the artwork's ink so the glyph fills the icon slot instead of
 * canvas padding: footprint renders 18×18 (matches the shell's square nav
 * glyphs); the symbol is a wide component glyph (≈1.29:1) rendered ~18×14,
 * falling right in the range of the sidebar's narrow siblings. Both use
 * `currentColor` so they inherit the sidebar text/theme color.
 */
export const FOOTPRINT_ICON =
  '<svg viewBox="160 160 704 704" width="18" height="18" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<rect x="262" y="262" width="500" height="500" rx="26" fill="none" stroke="currentColor" stroke-width="40"/>' +
  '<line x1="346" y1="180" x2="346" y2="262" stroke="currentColor" stroke-width="32"/>' +
  '<line x1="429" y1="180" x2="429" y2="262" stroke="currentColor" stroke-width="32"/>' +
  '<line x1="512" y1="180" x2="512" y2="262" stroke="currentColor" stroke-width="32"/>' +
  '<line x1="595" y1="180" x2="595" y2="262" stroke="currentColor" stroke-width="32"/>' +
  '<line x1="678" y1="180" x2="678" y2="262" stroke="currentColor" stroke-width="32"/>' +
  '<line x1="346" y1="762" x2="346" y2="844" stroke="currentColor" stroke-width="32"/>' +
  '<line x1="429" y1="762" x2="429" y2="844" stroke="currentColor" stroke-width="32"/>' +
  '<line x1="512" y1="762" x2="512" y2="844" stroke="currentColor" stroke-width="32"/>' +
  '<line x1="595" y1="762" x2="595" y2="844" stroke="currentColor" stroke-width="32"/>' +
  '<line x1="678" y1="762" x2="678" y2="844" stroke="currentColor" stroke-width="32"/>' +
  '<line x1="180" y1="346" x2="262" y2="346" stroke="currentColor" stroke-width="32"/>' +
  '<line x1="180" y1="429" x2="262" y2="429" stroke="currentColor" stroke-width="32"/>' +
  '<line x1="180" y1="512" x2="262" y2="512" stroke="currentColor" stroke-width="32"/>' +
  '<line x1="180" y1="595" x2="262" y2="595" stroke="currentColor" stroke-width="32"/>' +
  '<line x1="180" y1="678" x2="262" y2="678" stroke="currentColor" stroke-width="32"/>' +
  '<line x1="762" y1="346" x2="844" y2="346" stroke="currentColor" stroke-width="32"/>' +
  '<line x1="762" y1="429" x2="844" y2="429" stroke="currentColor" stroke-width="32"/>' +
  '<line x1="762" y1="512" x2="844" y2="512" stroke="currentColor" stroke-width="32"/>' +
  '<line x1="762" y1="595" x2="844" y2="595" stroke="currentColor" stroke-width="32"/>' +
  '<line x1="762" y1="678" x2="844" y2="678" stroke="currentColor" stroke-width="32"/>' +
  '<circle cx="310" cy="310" r="26" fill="currentColor"/>' +
  '</svg>'

export const SYMBOL_ICON =
  '<svg viewBox="3 5 18 14" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<rect x="7" y="6" width="10" height="12" rx="1.5"/>' +
  '<path d="M4 9h3"/>' +
  '<path d="M4 12h3"/>' +
  '<path d="M4 15h3"/>' +
  '<path d="M17 9h3"/>' +
  '<path d="M17 12h3"/>' +
  '<path d="M17 15h3"/>' +
  '<path d="M10 12h4"/>' +
  '</svg>'

/** Class names used by the injected rows (defined by `injectSidebarEntryStyles`). */
const ENTRY_CSS: Record<string, string> = {
  entry: 'hqcg-sidebar-entry',
  entryIcon: 'hqcg-sidebar-entry__icon',
  entryLabel: 'hqcg-sidebar-entry__label',
}

/** Sidebar entry styles — ported from dsh-web task-board's `.entry` block. */
const ENTRY_CSS_TEXT = `
.hqcg-sidebar-entry {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: 36px;
  padding: 0 10px;
  background: transparent;
  border: none;
  border-radius: 8px;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
  font-size: 13px;
  white-space: nowrap;
}
.hqcg-sidebar-entry:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}
.hqcg-sidebar-entry[data-active] {
  background: var(--dsw-alias-interactive-bg-active);
  color: var(--dsw-alias-label-primary);
  font-weight: 600;
}
.hqcg-sidebar-entry__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  flex: none;
}
.hqcg-sidebar-entry__icon svg {
  display: block;
  width: 18px;
  height: 18px;
}
.hqcg-sidebar-entry__label {
  overflow: hidden;
  text-overflow: ellipsis;
}
/* Collapsed rail: icon-only, centered, matching the shell's 56px rail. */
[data-dsh-frame][data-sidebar-collapsed] .hqcg-sidebar-entry,
[data-sidebar-collapsed] .hqcg-sidebar-entry {
  justify-content: center;
  padding: 0;
  width: 36px;
  height: 36px;
  margin: 0 auto 12px;
  border-radius: 50%;
}
[data-dsh-frame][data-sidebar-collapsed] .hqcg-sidebar-entry__label,
[data-sidebar-collapsed] .hqcg-sidebar-entry__label {
  display: none;
}
`

const STYLE_TAG_ID = 'data-plugin-css="huaqiu-component-gen-sidebar"'

/** Inject the sidebar entry stylesheet once (idempotent). */
export function injectSidebarEntryStyles(): void {
  if (typeof document === 'undefined') return
  if (document.querySelector(`style[${STYLE_TAG_ID}]`) !== null) return
  const tag = document.createElement('style')
  tag.dataset.pluginCss = 'huaqiu-component-gen-sidebar'
  tag.textContent = ENTRY_CSS_TEXT
  document.head.appendChild(tag)
}

/** Per-row mounting options (wired to the workspace state by the caller). */
export interface SidebarRowOptions {
  selector: string
  attribute: string
  icon: string
  label: string
  tooltip: string
  position: 'before' | 'after'
  onToggle(): void
  isOpen(): boolean
}

/**
 * Mount the two component-gen sidebar rows (footprint + symbol). Rows are
 * ordered deterministically: footprint first, symbol second — whatever the
 * mount order, the family-positioning keeps the pair stable.
 *
 * @param rows - the two rows' wiring (footprint, then symbol).
 * @param subscribe - subscription source for active-state + label refresh.
 * @returns disposer removing both rows and their observers.
 */
export function mountComponentGenSidebarEntries(
  rows: [SidebarRowOptions, SidebarRowOptions],
  subscribe: (listener: () => void) => () => void,
): () => void {
  if (typeof document === 'undefined') return () => {}
  injectSidebarEntryStyles()

  const familySelectors = [FOOTPRINT_ENTRY_SELECTOR, SYMBOL_ENTRY_SELECTOR] as const
  const disposers = rows.map((row) =>
    mountSharedSidebarEntry({
      rowAttribute: row.attribute,
      rowSelector: row.selector,
      plugin: PLUGIN_ID,
      icon: row.icon,
      css: ENTRY_CSS,
      label: () => row.label,
      tooltip: () => row.tooltip,
      refresh: { subscribe },
      onToggle: row.onToggle,
      position: row.position,
      familySelectors,
      active: {
        subscribe,
        isOpen: row.isOpen,
      },
    }),
  )

  return () => {
    for (const dispose of disposers) {
      try { dispose() } catch { /* already disposed */ }
    }
  }
}
