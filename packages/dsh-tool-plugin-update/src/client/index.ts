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
import { PLUGIN_ICON } from './icons.js'
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

/** The sidebar glyph — the same pinwheel the shell's own Plugins entry draws
 *  (`IconPluginPinwheelOutlineRegular`), so both rows read as one feature. */
export const UPDATE_ICON = PLUGIN_ICON(16)

/** Sidebar entry styles — matched to the family rows (same inset/padding/gap
 *  as the shell's own Plugins entry, `SidebarRoot.module.css` `.panelRow`).
 *  Every colour rides a `--dsw-alias-*` token so the row follows the shell's
 *  light/dark theme; the badge foreground uses the toast label, the shell's
 *  "always light ink on a saturated surface" token. */
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
  border-radius: var(--dsw-radius-md);
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
.hqpu-sidebar-entry:focus-visible {
  outline: var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: -2px;
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
  background: var(--dsw-alias-state-error-primary);
  color: var(--dsw-alias-toast-label);
  font-size: 11px;
  line-height: 16px;
  font-weight: 500;
  text-align: center;
  font-variant-numeric: tabular-nums;
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

/**
 * View styles (hqpu-*). Plain overlay + panel, drawn with the SAME design
 * tokens and geometry the shell's own plugin manager uses
 * (`ui-plugin-manager/src/client/PluginManagerPage.module.css` +
 * `ui-primitives/src/{Modal,Toast,Tag,StateDot}.module.css`), so this page
 * reads as part of the product rather than a bolt-on.
 *
 * Two rules keep it honest across themes:
 *   1. every colour is a `--dsw-alias-*` token — no literal hex/rgb, so light
 *      and dark both come out right (the old sheet invented
 *      `--dsw-alias-bg-surface` / `--dsw-alias-line-border` / `--dsw-alias-bg-badge`,
 *      none of which exist, and so always fell back to a white panel);
 *   2. `color-mix()` tints come from the state token itself, so a palette
 *      change moves fill and ink together.
 *
 * The chrome (panel, scrim, header, footer) follows `ui-primitives/Modal`,
 * because this view IS a dialog; the body follows `PluginManagerPage`, because
 * that is the content it heads. The one token the bundled shell does not
 * publish is backfilled by {@link ensureDesignTokens} — see the note there.
 */
const VIEW_CSS_TEXT = `
/* ── Overlay + panel (ui-primitives Modal.module.css) ─────────────────── */
.hqpu-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  /* The frame's own top inset keeps a tall card clear of the window chrome. */
  padding: max(24px, var(--dsh-frame-overlay-top, 24px)) 24px;
}
.hqpu-scrim {
  position: absolute;
  /* Only paint excludes the native caption; the root still blocks clicks. */
  inset: var(--dsh-frame-chrome-top, 0px) 0 0;
  background: var(--dsw-alias-bg-mask-1);
  animation: hqpu-fade var(--ds-transition-duration, 0.2s) var(--ds-ease-in-out, ease);
}
.hqpu-panel {
  position: relative;
  z-index: 1;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 20px;
  width: min(920px, 100%);
  max-height: 100%;
  overflow: hidden;
  border: 0;
  border-radius: var(--dsw-radius-panel);
  background: var(--dsw-alias-bg-layer-2);
  box-shadow: var(--dsw-elevation-prominent);
  color: var(--dsw-alias-label-primary);
  animation: hqpu-panel-in var(--ds-transition-duration, 0.2s) var(--ds-ease-in-out, ease);
}
.hqpu-panel:focus {
  outline: none;
}
@keyframes hqpu-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes hqpu-panel-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* ── Head row (ui-primitives Modal .header) ─────────────────────────────── */
.hqpu-head {
  display: flex;
  flex: none;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  box-sizing: border-box;
  /* The official Title row: 22/14/12/24 — the toolbar sits 10px further right
   * than the body content on purpose, matching the shell's own close button. */
  padding: 22px 14px 12px 24px;
}
.hqpu-head-main {
  min-width: 0;
  max-width: 100%;
}
.hqpu-title {
  margin: 0;
  font-size: 20px;
  font-weight: 500;
  line-height: 28px;
  color: var(--dsw-alias-label-primary);
}
.hqpu-intro {
  display: flex;
  align-items: center;
  gap: 4px;
  margin: 4px 0 0;
  font-size: 13px;
  line-height: 20px;
  color: var(--dsw-alias-label-secondary);
}
.hqpu-info {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 20px;
  height: 20px;
  padding: 0;
  border: 0;
  border-radius: var(--dsw-radius-sm);
  background: transparent;
  color: var(--dsw-alias-label-caption);
  cursor: pointer;
}
.hqpu-info:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-secondary);
}
.hqpu-info:focus-visible {
  outline: var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: 1px;
}
.hqpu-toolbar {
  display: flex;
  flex: none;
  align-items: center;
  gap: 16px;
}

/* ── Scrolling body: the page's centred column ────────────────────────── */
.hqpu-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  box-sizing: border-box;
  /* The panel's 20px gap already separates this from the head and footer. */
  padding: 0 clamp(16px, 3vw, 32px) 4px;
  /* Anything that scrolls inside the panel draws the l2 thumb. */
  --dsh-scrollbar-thumb: var(--dsw-alias-scrollbar-bg-l2);
  --dsh-scrollbar-thumb-hover: var(--dsw-alias-scrollbar-hover-l2);
}
.hqpu-column {
  display: flex;
  flex-direction: column;
  gap: 24px;
  width: 100%;
  max-width: 880px;
  margin: 0 auto;
}
/* A stack of groups (or the single toast host) inside the column. */
.hqpu-stack {
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.hqpu-toast-host:empty {
  display: none;
}

/* ── Groups (PluginManagerPage .group) ────────────────────────────────── */
.hqpu-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.hqpu-group-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.hqpu-group-title {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: 14px;
  font-weight: 500;
  line-height: 22px;
  color: var(--dsw-alias-label-primary);
}
.hqpu-group-count {
  flex: none;
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-tertiary);
  font-variant-numeric: tabular-nums;
}

/* ── Cards (PluginManagerPage .card) ──────────────────────────────────── */
.hqpu-cards {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.hqpu-card {
  min-width: 0;
  /* The hover surface reaches 8px past the content on both sides. */
  margin: 0 -8px;
  border-radius: var(--dsw-radius-xl);
}
.hqpu-card:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}
.hqpu-card-head {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 8px;
}
.hqpu-card-icon {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border: 0.5px solid var(--dsw-alias-border-l3);
  border-radius: var(--dsw-radius-lg);
  color: var(--dsw-alias-label-secondary);
}
.hqpu-card-icon svg {
  display: block;
  width: 24px;
  height: 24px;
}
.hqpu-card-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.hqpu-title-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
}
.hqpu-card-title {
  min-width: 0;
  font-size: 14px;
  font-weight: 500;
  line-height: 20px;
  color: var(--dsw-alias-label-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.hqpu-card-desc {
  font-size: 13px;
  line-height: 18px;
  color: var(--dsw-alias-label-tertiary);
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 1;
  overflow: hidden;
  overflow-wrap: anywhere;
}
.hqpu-card-end {
  position: relative;
  z-index: 1;
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 8px;
}
.hqpu-card-reason {
  margin: 0;
  padding: 0 8px 8px 70px;
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-state-error-primary);
  overflow-wrap: anywhere;
}

/* ── Tags (ui-primitives Tag.module.css) ──────────────────────────────── */
.hqpu-tag {
  display: inline-flex;
  align-items: center;
  flex: none;
  border-radius: 999px;
  corner-shape: round;
  padding: 1px 8px;
  font-size: 11px;
  font-weight: 500;
  line-height: 17px;
  white-space: nowrap;
}
.hqpu-tag[data-tone='success'] {
  background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 10%, transparent);
  color: var(--dsw-alias-state-success-primary);
}
.hqpu-tag[data-tone='info'] {
  background: color-mix(in srgb, var(--dsw-alias-state-business-primary) 10%, transparent);
  color: var(--dsw-alias-state-business-primary);
}
.hqpu-tag[data-tone='warning'] {
  background: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 12%, transparent);
  color: var(--dsw-alias-state-warn-primary);
}
.hqpu-tag[data-tone='danger'] {
  background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 10%, transparent);
  color: var(--dsw-alias-state-error-primary);
}
.hqpu-tag[data-tone='neutral'] {
  background: var(--dsw-alias-bg-module-platform);
  color: var(--dsw-alias-label-secondary);
}

/* ── Fact rows (PluginManagerPage .facts / .rows) ─────────────────────── */
.hqpu-facts {
  margin: 0;
  display: flex;
  flex-direction: column;
}
.hqpu-facts > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 44px;
  padding: 8px 2px;
  border-bottom: 0.5px solid var(--dsw-alias-border-l2);
}
.hqpu-facts > div:last-child {
  border-bottom: 0;
}
.hqpu-facts dt {
  flex: none;
  font-size: 13px;
  line-height: 20px;
  color: var(--dsw-alias-label-secondary);
}
.hqpu-facts dd {
  min-width: 0;
  margin: 0;
  font-size: 13px;
  line-height: 20px;
  text-align: end;
  overflow-wrap: anywhere;
  color: var(--dsw-alias-label-primary);
}
.hqpu-facts code {
  padding: 2px 6px;
  border-radius: var(--dsw-radius-xs);
  background: var(--dsw-alias-bg-module-platform);
  font-family: var(--dsw-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 12px;
}

/* ── Banner (PluginManagerPage .installSafety) ────────────────────────── */
.hqpu-banner {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 12px;
  border-radius: var(--dsw-radius-md);
  background: var(--dsw-alias-state-warn-tertiary);
  font-size: 12.5px;
  line-height: 18px;
  color: var(--dsw-alias-label-secondary);
}
.hqpu-banner > svg {
  flex: none;
  margin-top: 2px;
  color: var(--dsw-alias-state-warn-primary);
}

/* ── Status, empty, failure (PluginManagerPage .status / .empty / .failure) */
.hqpu-status {
  margin: 0;
  font-size: 13px;
  line-height: 20px;
  color: var(--dsw-alias-label-tertiary);
}
.hqpu-status--dot {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.hqpu-failure {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--dsw-alias-state-error-primary);
}
.hqpu-empty {
  padding: 32px 0;
  text-align: center;
  font-size: 13px;
  line-height: 20px;
  color: var(--dsw-alias-label-tertiary);
}

/* ── State dot + spinner (ui-primitives StateDot.module.css) ──────────── */
.hqpu-dot {
  position: relative;
  display: inline-block;
  flex: none;
  width: 10px;
  height: 10px;
}
.hqpu-dot::after {
  content: '';
  position: absolute;
  inset: 20%;
  border-radius: 50%;
  corner-shape: round;
  background: currentColor;
}
.hqpu-dot[data-state='done'] { color: var(--dsw-alias-state-success-primary); }
.hqpu-dot[data-state='warning'] { color: var(--dsw-alias-state-warn-primary); }
.hqpu-dot[data-state='error'] { color: var(--dsw-alias-state-error-primary); }
.hqpu-dot[data-state='idle'] { color: var(--dsw-alias-state-idle-primary); }
.hqpu-spinner {
  flex: none;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 1.5px solid color-mix(in srgb, currentColor 25%, transparent);
  border-top-color: currentColor;
  animation: hqpu-spin 1.5s linear infinite;
}
@keyframes hqpu-spin {
  to { transform: rotate(360deg); }
}

/* ── Skeleton (PluginManagerPage .skeleton*) ──────────────────────────── */
.hqpu-skeleton-fill {
  background: var(--dsw-alias-bg-skeleton);
  animation: hqpu-skeleton 2s cubic-bezier(0.36, 0, 0.64, 1) infinite;
}
.hqpu-skeleton-text {
  display: flex;
  align-items: center;
  height: 1lh;
}
.hqpu-skeleton-bar {
  width: 100%;
  height: 12px;
  border-radius: var(--dsw-radius-xs);
}
.hqpu-skeleton-heading { width: 96px; }
.hqpu-skeleton-title { width: min(144px, 60%); }
.hqpu-skeleton-desc { width: min(280px, 85%); }
.hqpu-skeleton-icon { border-color: transparent; }
@keyframes hqpu-skeleton {
  0% { opacity: 1; }
  40% { opacity: 0.6; }
  80%, 100% { opacity: 1; }
}

/* ── Toast (ui-primitives Toast.module.css, held inside the panel) ────── */
.hqpu-toast {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-radius: var(--dsw-radius-lg);
  background: var(--dsw-alias-toast-bg);
  color: var(--dsw-alias-toast-label);
  font-size: 14px;
  line-height: 22px;
  box-shadow: var(--dsw-shadow-lv3);
  animation: hqpu-toast-in 160ms ease-out;
}
.hqpu-toast-icon {
  display: grid;
  place-items: center;
  flex: none;
  color: var(--dsw-alias-state-warn-label);
}
.hqpu-toast-icon[data-tone='success'] { color: var(--dsw-alias-state-success-primary); }
.hqpu-toast-text { min-width: 0; }
@keyframes hqpu-toast-in {
  from { opacity: 0; transform: translateY(-6px); }
  to { opacity: 1; transform: none; }
}

/* ── Buttons (PluginManagerPage .addButton / .iconButton) ─────────────── */
.hqpu-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: var(--dsw-radius-sm);
  background: transparent;
  color: var(--dsw-alias-label-caption);
  cursor: pointer;
}
.hqpu-icon-btn svg { display: block; }
.hqpu-icon-btn:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-secondary);
}
.hqpu-icon-btn:disabled {
  opacity: 0.5;
  cursor: default;
}
.hqpu-icon-btn:focus-visible {
  outline: var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: 1px;
}
.hqpu-btn {
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 32px;
  padding: 0 12px;
  border: 0;
  border-radius: var(--dsw-radius-md);
  background: var(--dsw-alias-bg-layer-3);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 13px;
  line-height: 20px;
  cursor: pointer;
}
.hqpu-btn svg { display: block; }
.hqpu-btn:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover-solid); }
.hqpu-btn:disabled { opacity: 0.5; cursor: default; }
.hqpu-btn:focus-visible {
  outline: var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: 1px;
}
.hqpu-btn--primary {
  background: var(--dsw-alias-button-primary-fill);
  color: var(--dsw-alias-label-primary-foreground);
}
.hqpu-btn--primary:hover:not(:disabled) { background: var(--dsw-alias-button-primary-hover); }
.hqpu-btn--outline {
  background: transparent;
  border: 0.5px solid var(--dsw-alias-border-l4);
  color: var(--dsw-alias-label-secondary);
}
.hqpu-btn--outline:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }
.hqpu-btn--ghost { background: transparent; color: var(--dsw-alias-label-secondary); }
.hqpu-btn--ghost:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }
.hqpu-btn--danger { color: var(--dsw-alias-state-error-primary); }
.hqpu-btn--sm { height: 28px; padding: 0 10px; font-size: 12.5px; }
.hqpu-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

/* ── Runtime update action row (arm → confirm step) ───────────────────── */
.hqpu-runtime-actions {
  margin-top: 12px;
}
.hqpu-runtime-confirm {
  flex: 1 1 100%;
  margin: 0;
}

/* ── Footer action row (ui-primitives Modal .footer) ───────────────────── */
.hqpu-footer {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 0 24px 20px;
}

.hqpu-visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}

/* ── Reduced motion: drop every decorative animation ──────────────────── */
@media (prefers-reduced-motion: reduce) {
  .hqpu-scrim,
  .hqpu-panel,
  .hqpu-skeleton-fill,
  .hqpu-spinner,
  .hqpu-toast {
    animation: none;
  }
}
`

const STYLE_TAG_ID = 'data-plugin-css="huaqiu-plugin-update"'

/**
 * Design tokens the bundled DSH shell may not publish.
 *
 * hq-edge ships an older `ui-theme` build. A live probe of the running shell
 * (both themes) shows 13 of the tokens this stylesheet reads are absent:
 * `--dsw-radius-{xs,sm,md,lg,xl,panel}`, `--dsw-focus-ring-width`,
 * `--dsw-focus-ring-color`, `--dsw-alias-toast-label`,
 * `--dsw-alias-state-idle-primary`, `--dsw-font-mono`,
 * `--dsh-frame-overlay-top` and `--dsh-frame-chrome-top`.
 *
 * An unresolved `var()` is not an error — it silently degrades the property to
 * its initial value. That is how this panel once rendered with
 * `border-radius: 0px` and a 3px `auto` focus ring while every colour was
 * already correct.
 *
 * The last three (`--dsw-font-mono`, `--dsh-frame-*`) are deliberately NOT
 * backfilled: the shell's own primitives rely on the inline `var(…, fallback)`
 * form for those (`Modal.module.css`, `PluginManagerPage.module.css`), so this
 * sheet does too. Everything else is backfilled below with the canonical value
 * from `ui-theme/src/styles/{base,focus,design-platform}.css`.
 *
 * Values are feature-detected at runtime and scoped to this plugin's own roots
 * rather than `:root`, so a newer shell always wins and filling a gap can never
 * restyle the host.
 */

/** The two roots this plugin styles: the view overlay (built in
 *  update-view.ts) and the sidebar row ({@link ENTRY_CSS}.entry). */
const STYLE_ROOTS = '.hqpu-overlay, .hqpu-sidebar-entry'

/** The shell's dark-theme carrier — audited live as `body[data-ds-dark-theme]`. */
const DARK_THEME_SELECTOR = 'body[data-ds-dark-theme]'

/** Same roots, one rule per theme, for tokens whose official value flips. */
const DARK_STYLE_ROOTS = STYLE_ROOTS.split(',')
  .map((root) => `${DARK_THEME_SELECTOR} ${root.trim()}`)
  .join(',')

type DesignTokenFallback =
  | { token: string; value: string }
  | { token: string; value: { light: string; dark: string } }

const DESIGN_TOKEN_FALLBACKS: DesignTokenFallback[] = [
  // base.css — geometry; theme-invariant.
  { token: '--dsw-radius-xs', value: '4px' },
  { token: '--dsw-radius-sm', value: '8px' },
  { token: '--dsw-radius-md', value: '12px' },
  { token: '--dsw-radius-lg', value: '16px' },
  { token: '--dsw-radius-xl', value: '20px' },
  { token: '--dsw-radius-panel', value: '28px' },
  // focus.css — the standard ring geometry. The colour already falls back
  // inline in the sheet; publishing it too keeps the ring intact if that
  // fallback is ever edited away.
  { token: '--dsw-focus-ring-width', value: '2px' },
  { token: '--dsw-focus-ring-color', value: 'var(--dsw-alias-state-business-primary, #C7000B)' },
  // design-platform.css — `--dsw-static-neutral-bluish-00` is white in both
  // themes, which is exactly what the official alias resolves to.
  { token: '--dsw-alias-toast-label', value: 'var(--dsw-static-neutral-bluish-00, #fff)' },
  // The one token whose official value flips with the theme. `--dsw-static-*`
  // are theme-invariant, so one rule per carrier reproduces neutral-300
  // (light) / neutral-600 (dark) without knowing the current theme.
  {
    token: '--dsw-alias-state-idle-primary',
    value: {
      light: 'var(--dsw-static-neutral-300, #d4d4d4)',
      dark: 'var(--dsw-static-neutral-600, #545557)',
    },
  },
]

const TOKEN_STYLE_TAG_ID = 'data-plugin-css="huaqiu-plugin-update-tokens"'

/**
 * Publish canonical values for the design tokens the shell is missing.
 *
 * Idempotent and cheap: safe to call on every open, so a shell that publishes
 * its tokens late still wins (the stale fallbacks are removed in that case).
 */
export function ensureDesignTokens(): void {
  if (typeof document === 'undefined' || document.body === null) return
  const probe = getComputedStyle(document.body)
  const missing = DESIGN_TOKEN_FALLBACKS.filter(
    (entry) => probe.getPropertyValue(entry.token).trim() === '',
  )

  const existing = document.querySelector<HTMLStyleElement>(`style[${TOKEN_STYLE_TAG_ID}]`)
  if (missing.length === 0) {
    existing?.remove()
    return
  }

  const flat = missing.filter(
    (entry): entry is { token: string; value: string } => typeof entry.value === 'string',
  )
  const themed = missing.filter(
    (entry): entry is { token: string; value: { light: string; dark: string } } =>
      typeof entry.value !== 'string',
  )

  const rules: string[] = []
  const lightDecls = [
    ...flat.map((entry) => `  ${entry.token}: ${entry.value};`),
    ...themed.map((entry) => `  ${entry.token}: ${entry.value.light};`),
  ]
  rules.push(`${STYLE_ROOTS} {\n${lightDecls.join('\n')}\n}`)
  if (themed.length > 0) {
    const darkDecls = themed.map((entry) => `  ${entry.token}: ${entry.value.dark};`)
    rules.push(`${DARK_STYLE_ROOTS} {\n${darkDecls.join('\n')}\n}`)
  }

  const tag = existing ?? document.createElement('style')
  tag.dataset.pluginCss = 'huaqiu-plugin-update-tokens'
  tag.textContent = rules.join('\n')
  if (tag.parentNode === null) document.head.appendChild(tag)
}

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
  ensureDesignTokens()

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

  const openView = (): void => {
    // Re-detect the shell's design tokens on every open: a shell that
    // publishes them after this plugin mounted must win, and one that never
    // does must keep the canonical fallbacks.
    ensureDesignTokens()
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
    // Read the live locale on every refresh (the locale observer fires
    // `refresh.subscribe`'s listener, which re-applies these) so the row
    // re-localizes when the host UI language changes — matching the sibling
    // family rows, which read a live `currentLang` variable the same way.
    label: () => entryCopy(locale).label,
    tooltip: () => entryCopy(locale).tooltip,
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
