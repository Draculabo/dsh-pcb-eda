/**
 * Plugin-update review view (browser half).
 *
 * Plain-DOM panel (no React tree) so it can never disturb the DSH shell's
 * reconciliation — same rule as the sidebar entry rows. Rendered content:
 *
 *   - head: title + intro + refresh toolbar (the shell plugin-manager head row)
 *   - state-grouped sections, each a group head + package cards
 *     (48px hairline-framed glyph, title row with a state tag, one-line
 *     version transition, end actions) — the shell's card geometry
 *   - a facts group for the independent HQ Edge runtime report
 *   - footer actions (install / ignore / show again), with a toast that
 *     reports the outcome of an install the way the shell's Toast does
 *
 * Every surface rides a `--dsw-alias-*` design token (see VIEW_CSS_TEXT), so
 * the panel follows the shell's light/dark theme and its focus-ring contract.
 *
 * @module
 */
import {
  checkUpdates,
  ignoreOffer,
  installSet,
  requestRuntimeUpdate,
  runtimeLatestVersion,
  setPluginUpdateSource,
  setRuntimeUpdateSource,
  unignoreOffer,
  TERMINAL_PHASES,
  type PluginUpdateItem,
  type PluginUpdateReport,
  type ReleaseInfo,
  type RuntimeUpdateSource,
  type UpdateJob,
} from './api.js'
import { formatMb, type UpdateCopy } from './copy.js'
import {
  CHECK_CIRCLE_ICON,
  CLOSE_ICON,
  DOWNLOAD_ICON,
  INFO_ICON,
  PLUGIN_ICON,
  REFRESH_ICON,
  WARNING_ICON,
} from './icons.js'

export interface UpdateStoreLike {
  report(): PluginUpdateReport | null
  installing(): boolean
  /** Mark the installing footer state (set by the panel before the restart). */
  setInstalling(flag: boolean): void
  /** The durable job the server currently reports as active (resumed). */
  activeJob(): UpdateJob | null
  /** Bounded recent jobs (newest first), for the result/history view. */
  recentJobs(): UpdateJob[]
  refresh(): Promise<PluginUpdateReport | null>
  /** Force a fresh update check (used by the failed-check Retry action). */
  check(): Promise<PluginUpdateReport | null>
  /** Re-read `/status` (resume an active job immediately after submitting). */
  fetchStatus(): Promise<void>
  subscribe(listener: () => void): () => void
}

/** How long the outcome toast stays up, in milliseconds. */
const TOAST_HOLD_MS = 4000

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className.length > 0) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

/** A button carrying inline SVG artwork (the icon modules emit markup). */
function iconButton(
  className: string,
  markup: string,
  label: string,
  onClick: () => void,
): HTMLButtonElement {
  const button = el('button', className)
  button.type = 'button'
  button.setAttribute('aria-label', label)
  button.title = label
  button.innerHTML = markup
  button.addEventListener('click', onClick)
  return button
}

/**
 * Compact a package name to what a person calls it — the shell plugin
 * manager's own rule (`presentation.ts` `shortName`), so both UIs read the
 * same plugin by the same name.
 */
export function shortName(name: string): string {
  const unscoped = name.startsWith('@') ? name.slice(name.indexOf('/') + 1) : name
  return unscoped.replace(/^dsh-(?:host-|client-)?/, '')
}

/** Normalize the server's block reason to a list (it may arrive as a string). */
function blockedByList(item: PluginUpdateItem): string[] {
  const by = item.blockedBy
  if (Array.isArray(by)) return by.filter((entry): entry is string => typeof entry === 'string')
  return typeof by === 'string' && by.length > 0 ? [by] : []
}

/** The tag tone a state reads as, matching the shell's Tag palette. */
function stateTone(item: PluginUpdateItem): 'success' | 'info' | 'warning' | 'danger' | 'neutral' {
  switch (item.state) {
    case 'update':
      return 'info'
    case 'install':
      return 'warning'
    case 'blocked':
      return 'danger'
    case 'ignored':
      return 'neutral'
    case 'current':
      return 'success'
  }
}

function stateLabel(item: PluginUpdateItem, copy: UpdateCopy): string {
  switch (item.state) {
    case 'current':
      return copy.state.current
    case 'update':
      return copy.state.update
    case 'install':
      return copy.state.install
    case 'ignored':
      return copy.state.ignored
    case 'blocked':
      return copy.state.blocked
  }
}

/** The one-line version transition under a card's title. */
function versionLine(item: PluginUpdateItem): string {
  switch (item.state) {
    case 'current':
      return item.currentVersion ?? item.availableVersion
    case 'install':
      return item.availableVersion
    default:
      // An absent plugin names only the version it would gain.
      return item.currentVersion === null
        ? item.availableVersion
        : `${item.currentVersion} → ${item.availableVersion}`
  }
}

function blockedReason(item: PluginUpdateItem, copy: UpdateCopy): string | undefined {
  const by = blockedByList(item)
  if (by.includes('host')) return copy.blockedReason.host
  if (by.includes('hq-edge-version')) return copy.blockedReason['hq-edge-version']
  if (by.includes('runtime-unknown')) return copy.blockedReason['runtime-unknown']
  return by.length > 0 ? by.join(', ') : undefined
}

/** One package card: glyph, name with its state tag, version line, end actions. */
function packageCard(
  item: PluginUpdateItem,
  copy: UpdateCopy,
  installing: boolean,
  store: UpdateStoreLike,
): HTMLLIElement {
  const card = el('li', 'hqpu-card')
  card.dataset.pluginName = item.name
  card.dataset.state = item.state
  // The full package name is the card's tooltip; the row shows the display name.
  card.title = `${item.name} · ${versionLine(item)}`

  const head = el('div', 'hqpu-card-head')

  const glyph = el('span', 'hqpu-card-icon')
  glyph.setAttribute('aria-hidden', 'true')
  glyph.innerHTML = PLUGIN_ICON(24)

  const main = el('div', 'hqpu-card-main')
  const titleRow = el('div', 'hqpu-title-row')
  // Prefer the user-facing display name from a v2 manifest; fall back to the
  // shortened package id (the shell's own naming rule).
  const titleText =
    typeof item.displayName === 'string' && item.displayName.trim().length > 0
      ? item.displayName.trim()
      : shortName(item.name)
  const title = el('span', 'hqpu-card-title', titleText)
  const tag = el('span', 'hqpu-tag')
  tag.dataset.tone = stateTone(item)
  tag.textContent = stateLabel(item, copy)
  titleRow.append(title, tag)

  // Version line, with the download size appended when the manifest knows it.
  const size = formatMb(item.sizeBytes ?? 0)
  const descText = size.length > 0 ? `${versionLine(item)} · ${size}` : versionLine(item)
  const desc = el('span', 'hqpu-card-desc', descText)
  main.append(titleRow, desc)

  // Optional one-line description from a v2 manifest.
  if (typeof item.description === 'string' && item.description.trim().length > 0) {
    main.append(el('span', 'hqpu-card-desc', item.description.trim()))
  }

  head.append(glyph, main)

  const end = el('div', 'hqpu-card-end')
  if (item.state === 'update' || item.state === 'install') {
    const button = el('button', 'hqpu-btn hqpu-btn--sm hqpu-btn--primary')
    button.type = 'button'
    button.disabled = installing
    // Honest label: this installs the WHOLE offered set, not just one card.
    button.innerHTML = `${DOWNLOAD_ICON(13)}<span>${copy.installOne}</span>`
    button.title = copy.installOneTip
    button.addEventListener('click', () => {
      void runInstall(store, copy)
    })
    end.append(button)
  }
  head.append(end)
  card.append(head)

  // Per-plugin change list (v2 manifest), behind a small expander.
  if (Array.isArray(item.changes) && item.changes.length > 0) {
    const expander = el('div', 'hqpu-changes')
    const toggle = el('button', 'hqpu-btn hqpu-btn--ghost hqpu-btn--sm', copy.release.changesTitle)
    toggle.type = 'button'
    const list = el('ul', 'hqpu-changes-list')
    list.style.display = 'none'
    for (const change of item.changes) {
      if (typeof change === 'string' && change.length > 0) {
        list.append(el('li', '', change))
      }
    }
    toggle.addEventListener('click', () => {
      list.style.display = list.style.display === 'none' ? '' : 'none'
    })
    expander.append(toggle, list)
    card.append(expander)
  }

  // A block reason belongs to a blocked offer only — render BOTH the mapped
  // code copy and the server's full reasons[]/notes[] (computed but, before
  // now, never shown).
  if (item.state === 'blocked') {
    const reason = blockedReason(item, copy)
    if (reason !== undefined) {
      card.append(el('p', 'hqpu-card-reason', reason))
    }
    for (const entry of [...(item.reasons ?? []), ...(item.notes ?? [])]) {
      if (typeof entry === 'string' && entry.length > 0) {
        card.append(el('p', 'hqpu-card-reason', entry))
      }
    }
  }
  return card
}

/** A section: group head with its count, then the cards. */
function group(
  heading: string,
  items: PluginUpdateItem[],
  copy: UpdateCopy,
  installing: boolean,
  store: UpdateStoreLike,
): HTMLElement | null {
  if (items.length === 0) return null
  const section = el('section', 'hqpu-group')
  section.dataset.group = heading

  const head = el('div', 'hqpu-group-head')
  head.append(el('h3', 'hqpu-group-title', heading))
  head.append(el('span', 'hqpu-group-count', copy.groupCount(items.length)))

  const list = el('ul', 'hqpu-cards')
  for (const item of items) list.append(packageCard(item, copy, installing, store))

  section.append(head, list)
  return section
}

/** First-read placeholders, sharing the card and text-line layout. */
function skeleton(copy: UpdateCopy): HTMLElement {
  const section = el('section', 'hqpu-group')
  section.setAttribute('role', 'status')
  section.dataset.loading = ''
  const head = el('div', 'hqpu-group-head')
  head.setAttribute('aria-hidden', 'true')
  const heading = el('span', 'hqpu-group-title hqpu-skeleton-text hqpu-skeleton-heading')
  const headingBar = el('span', 'hqpu-skeleton-fill hqpu-skeleton-bar')
  heading.append(headingBar)
  head.append(heading)

  const list = el('ul', 'hqpu-cards')
  list.setAttribute('aria-hidden', 'true')
  for (let index = 0; index < 3; index += 1) {
    const card = el('li', 'hqpu-card')
    const cardHead = el('div', 'hqpu-card-head')
    const glyph = el('span', 'hqpu-card-icon hqpu-skeleton-fill hqpu-skeleton-icon')
    const main = el('div', 'hqpu-card-main')
    const titleRow = el('div', 'hqpu-title-row')
    const title = el('span', 'hqpu-card-title hqpu-skeleton-text hqpu-skeleton-title')
    title.append(el('span', 'hqpu-skeleton-fill hqpu-skeleton-bar'))
    titleRow.append(title)
    const desc = el('span', 'hqpu-card-desc hqpu-skeleton-text hqpu-skeleton-desc')
    desc.append(el('span', 'hqpu-skeleton-fill hqpu-skeleton-bar'))
    main.append(titleRow, desc)
    cardHead.append(glyph, main)
    const end = el('div', 'hqpu-card-end')
    end.setAttribute('aria-hidden', 'true')
    cardHead.append(end)
    card.append(cardHead)
    list.append(card)
  }
  section.append(head, list)
  // The skeleton replaces the whole column, so label it for screen readers.
  section.setAttribute('aria-label', copy.loading)
  return section
}

// ── Durable job views (active / result / recent) ───────────────────────────

/** Format a byte count for the progress line, or null when unknown. */
function formatBytes(n: number | undefined): string | null {
  if (n === undefined || !Number.isFinite(n) || n < 0) return null
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB`
  if (n >= 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${n} B`
}

/** Format an ETA in seconds to a short human string, or null when unknown. */
function formatEta(seconds: number | undefined): string | null {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) return null
  if (seconds < 60) return `${Math.round(seconds)} s`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min`
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`
}

function jobKindLabel(job: UpdateJob, copy: UpdateCopy): string {
  return job.kind === 'runtime' ? copy.job.kindRuntime : copy.job.kindPluginSet
}

/** The phase in human words, falling back to the raw code. */
function phaseLabel(job: UpdateJob, copy: UpdateCopy): string {
  return copy.job.phase[job.phase] ?? job.phase
}

/** One per-step line for plugin-set installs (and any job that reports steps). */
function stepsList(job: UpdateJob, copy: UpdateCopy): HTMLElement | null {
  if (!Array.isArray(job.steps) || job.steps.length === 0) return null
  const wrap = el('div', 'hqpu-job-steps')
  wrap.append(el('p', 'hqpu-group-count', copy.job.stepsTitle))
  const ol = el('ol', 'hqpu-steps')
  for (const step of job.steps) {
    const li = el('li', `hqpu-step hqpu-step--${step.state}`)
    const dot = el('span', 'hqpu-dot')
    dot.dataset.state =
      step.state === 'installed'
        ? 'done'
        : step.state === 'failed'
          ? 'error'
          : step.state === 'running'
            ? 'warning'
            : 'idle'
    li.append(dot)
    const text = step.message && step.message.length > 0 ? `${step.name} — ${step.message}` : step.name
    li.append(el('span', '', text))
    ol.append(li)
  }
  wrap.append(ol)
  return wrap
}

/**
 * The ACTIVE-JOB view: type + target, previous→target, current phase, a
 * determinate bar only when a real percentage exists, bytes/speed/ETA when the
 * server publishes them, and what happens next. Closing the panel never
 * cancels the job — say so.
 */
function activeJobView(job: UpdateJob, copy: UpdateCopy): HTMLElement {
  const section = el('section', 'hqpu-group')
  section.dataset.group = 'active-job'

  const head = el('div', 'hqpu-group-head')
  const tag = el('span', 'hqpu-tag')
  tag.dataset.tone = 'info'
  tag.textContent = jobKindLabel(job, copy)
  head.append(el('h3', 'hqpu-group-title', `${jobKindLabel(job, copy)} → ${job.targetVersion}`), tag)
  section.append(head)

  const card = el('div', 'hqpu-job')

  const phaseLine = el('p', 'hqpu-status hqpu-status--dot')
  phaseLine.append(el('span', 'hqpu-spinner'))
  const transition =
    job.previousVersion !== null && job.previousVersion.length > 0
      ? `${job.previousVersion} → ${job.targetVersion} · ${phaseLabel(job, copy)}`
      : `${job.targetVersion} · ${phaseLabel(job, copy)}`
  phaseLine.append(el('span', '', transition))
  card.append(phaseLine)

  if (typeof job.message === 'string' && job.message.length > 0) {
    card.append(el('p', 'hqpu-status', job.message))
  }

  // Determinate bar only when the server gives a real percentage — never show
  // 100% before the job is terminal.
  const pct = job.progress.percent
  if (pct !== null) {
    const bar = el('div', 'hqpu-progress')
    const fill = el('div', 'hqpu-progress-fill')
    fill.style.width = `${Math.min(100, Math.max(0, pct))}%`
    bar.append(fill)
    card.append(bar)
  }

  const bits: string[] = []
  if (pct !== null) bits.push(`${Math.round(pct)}%`)
  const done = formatBytes(job.progress.bytesDone)
  const total = formatBytes(job.progress.bytesTotal)
  if (done !== null && total !== null) bits.push(copy.job.bytes(done, total))
  const speed = formatBytes(job.progress.bytesPerSecond)
  if (speed !== null) bits.push(copy.job.speed(speed))
  const eta = formatEta(job.progress.etaSeconds)
  if (eta !== null) bits.push(copy.job.eta(eta))
  if (bits.length > 0) card.append(el('p', 'hqpu-status hqpu-job-meta', bits.join(' · ')))

  const steps = stepsList(job, copy)
  if (steps !== null) card.append(steps)

  // What happens next — restart / runtime swap + elevation implications.
  card.append(el('p', 'hqpu-status', job.kind === 'runtime' ? copy.job.willSwapRuntime : copy.job.willRestartDsh))
  card.append(el('p', 'hqpu-status', copy.job.closeNote))
  section.append(card)
  return section
}

/**
 * The RESULT view for a terminal job: success / failed / rolled-back /
 * abandoned, previous→installed, per-package steps, errorCode + message, a log
 * correlation hint, and retry guidance (a retry starts a NEW job).
 */
function resultView(job: UpdateJob, copy: UpdateCopy, onRetry: () => void): HTMLElement {
  const section = el('section', 'hqpu-group')
  section.dataset.group = 'job-result'

  const tone =
    job.phase === 'done' ? 'success' : job.phase === 'failed' ? 'danger' : 'warning'
  const titleText =
    job.phase === 'done'
      ? copy.job.resultDone
      : job.phase === 'failed'
        ? copy.job.resultFailed
        : job.phase === 'rolled-back'
          ? copy.job.resultRolledBack
          : copy.job.resultAbandoned

  const head = el('div', 'hqpu-group-head')
  const tag = el('span', 'hqpu-tag')
  tag.dataset.tone = tone
  tag.textContent = titleText
  head.append(el('h3', 'hqpu-group-title', `${jobKindLabel(job, copy)} ${job.targetVersion}`), tag)
  section.append(head)

  const card = el('div', 'hqpu-job')
  const res = job.result
  const from = job.previousVersion ?? res?.installedVersion ?? '—'
  const to = res?.installedVersion ?? job.targetVersion
  const finished =
    res !== undefined && res.finishedAt.length > 0
      ? ` · ${new Date(res.finishedAt).toLocaleString()}`
      : ''
  card.append(el('p', 'hqpu-status', `${from} → ${to}${finished}`))
  if (res !== undefined && res.message !== undefined && res.message.length > 0) {
    card.append(el('p', 'hqpu-status', res.message))
  }
  if (res !== undefined && res.errorCode !== undefined && res.errorCode.length > 0) {
    card.append(el('p', 'hqpu-status', res.errorCode))
  }
  if (typeof job.logHint === 'string' && job.logHint.length > 0) {
    card.append(el('p', 'hqpu-status hqpu-job-meta', copy.job.logHint(job.logHint)))
  }

  const steps = stepsList(job, copy)
  if (steps !== null) card.append(steps)

  // Retry starts a NEW update job — never re-click the settled job id.
  if (job.phase === 'failed' || job.phase === 'abandoned') {
    const retry = el('button', 'hqpu-btn hqpu-btn--outline hqpu-btn--sm', copy.job.retry)
    retry.type = 'button'
    retry.addEventListener('click', onRetry)
    card.append(retry)
  }
  section.append(card)
  return section
}

/** A one-line row for older recent jobs (newest already shown as the card). */
function recentJobsList(jobs: UpdateJob[], copy: UpdateCopy): HTMLElement | null {
  const older = jobs.slice(1, 5)
  if (older.length === 0) return null
  const wrap = el('div', 'hqpu-group')
  wrap.dataset.group = 'recent-jobs'
  wrap.append(el('h3', 'hqpu-group-count', copy.job.recentTitle))
  const ul = el('ul', 'hqpu-cards')
  for (const job of older) {
    const li = el('li', 'hqpu-status')
    const when = job.updatedAt.length > 0 ? ` · ${new Date(job.updatedAt).toLocaleString()}` : ''
    li.textContent = `${jobKindLabel(job, copy)} ${job.targetVersion} · ${phaseLabel(job, copy)}${when}`
    ul.append(li)
  }
  wrap.append(ul)
  return wrap
}

/**
 * Check-status banner: a FAILED check shows a clear error row + Retry (never
 * the silent "no updates" empty state); a successful check shows the time;
 * when a check failed but a prior report exists it is labelled stale.
 */
function checkBanner(
  report: PluginUpdateReport,
  copy: UpdateCopy,
  onRetry: () => void,
): HTMLElement | null {
  const failed = typeof report.lastError === 'string' && report.lastError.length > 0
  const checked = typeof report.checkedAt === 'string' && report.checkedAt.length > 0
  if (!failed && !checked) return null

  const wrap = el('section', 'hqpu-group')
  wrap.dataset.group = 'check-status'
  if (failed) {
    const banner = el('div', 'hqpu-banner')
    banner.dataset.tone = 'danger'
    banner.innerHTML = WARNING_ICON(14)
    banner.append(el('span', '', copy.checkFailedBanner(report.lastError as string)))
    wrap.append(banner)
    if (report.items.length > 0) {
      wrap.append(el('p', 'hqpu-status', copy.staleNote))
    }
    const row = el('div', 'hqpu-actions')
    const retry = el('button', 'hqpu-btn hqpu-btn--primary hqpu-btn--sm', copy.retry)
    retry.type = 'button'
    retry.addEventListener('click', onRetry)
    row.append(retry)
    wrap.append(row)
    return wrap
  }
  wrap.append(
    el('p', 'hqpu-status', copy.checkedAt(new Date(report.checkedAt as string).toLocaleString())),
  )
  return wrap
}

/** Set-level release metadata (v2 manifest): summary, notes, breaking, link. */
function releaseHeader(release: ReleaseInfo | null | undefined, copy: UpdateCopy): HTMLElement | null {
  if (release === null || release === undefined) return null
  const notes = Array.isArray(release.notes) ? release.notes.filter((n) => typeof n === 'string' && n.length > 0) : []
  const breaking = Array.isArray(release.breaking)
    ? release.breaking.filter((n) => typeof n === 'string' && n.length > 0)
    : []
  const hasContent =
    (typeof release.summary === 'string' && release.summary.length > 0) ||
    notes.length > 0 ||
    breaking.length > 0 ||
    typeof release.notesUrl === 'string' ||
    typeof release.publishedAt === 'string'
  if (!hasContent) return null

  const section = el('section', 'hqpu-group')
  section.dataset.group = 'release'
  section.append(el('h3', 'hqpu-group-title', copy.release.summaryTitle))
  if (typeof release.summary === 'string' && release.summary.length > 0) {
    section.append(el('p', 'hqpu-status', release.summary))
  }
  if (typeof release.publishedAt === 'string' && release.publishedAt.length > 0) {
    section.append(el('p', 'hqpu-status', copy.release.publishedAt(new Date(release.publishedAt).toLocaleString())))
  }
  if (release.requiresRestart === true) {
    section.append(el('p', 'hqpu-status', copy.job.willRestartDsh))
  }
  if (notes.length > 0) {
    const ul = el('ul', 'hqpu-release-notes')
    for (const note of notes) ul.append(el('li', '', note as string))
    section.append(ul)
  }
  if (breaking.length > 0) {
    const banner = el('div', 'hqpu-banner')
    banner.dataset.tone = 'danger'
    banner.innerHTML = WARNING_ICON(14)
    const inner = el('span')
    inner.append(el('strong', '', `${copy.release.breakingTitle}: `))
    inner.append(document.createTextNode(breaking.join(' · ')))
    banner.append(inner)
    section.append(banner)
  }
  if (typeof release.notesUrl === 'string' && release.notesUrl.length > 0) {
    const link = el('a', 'hqpu-status hqpu-release-link', copy.release.notesLink)
    link.href = release.notesUrl
    link.target = '_blank'
    link.rel = 'noreferrer'
    section.append(link)
  }
  return section
}

/** Native disclosure that hides the developer-facing source editors by
 *  default (end users should never need to type a manifest URL). */
function advancedBlock(copy: UpdateCopy, nodes: Array<HTMLElement | null>): HTMLElement {
  const details = el('details', 'hqpu-advanced')
  details.append(el('summary', '', copy.release.advanced))
  for (const node of nodes) {
    if (node !== null) details.append(node)
  }
  return details
}

/** Mutable editor state for one manifest source (lives in the panel closure). */
interface SourceState {
  editing: boolean
  saving: boolean
  draft: string
}

/**
 * Shared state + callbacks for one update-source editor.
 *
 * hq-edge serves both manifest sources from one shape (plugin release
 * manifest, runtime-update manifest), and both are editable from this panel:
 * an override is persisted per host, so pointing discovery at a staging
 * channel (or a local test rig) needs no env var and no restart. The editor
 * state lives in the panel closure for the same reason `armed` does — a store
 * refresh must not discard a half-typed URL or silently close the editor.
 */
export interface SourceEditorActions {
  /** The source editor is open (input shown instead of the read-only row). */
  sourceEditing: boolean
  /** A save is in flight. */
  sourceSaving: boolean
  /** The URL being edited (what the input shows). */
  sourceDraft: string
  onSourceEdit(): void
  onSourceDraft(value: string): void
  onSourceSave(): void
  onSourceCancel(): void
  /** Clear the user override, falling back to the configured URL. */
  onSourceReset(): void
}

/**
 * The runtime-update action row's state and callbacks.
 *
 * Installing the runtime is destructive in a way a plugin install is not: hq-edge
 * shuts itself down so the EDA host can swap the runtime directory. So the row
 * is a two-step confirm (arm → confirm), never a single fire-and-forget click.
 */
export interface RuntimeActions extends SourceEditorActions {
  /** A request is in flight (hq-edge accepted it and is restarting). */
  busy: boolean
  /** The confirm step is armed for the version the row names. */
  armed: boolean
  /**
   * hq-edge answered `202 Accepted`: from here on the outcome belongs to the
   * EDA host, and this process is about to be replaced. Terminal — the row
   * must never re-offer the button once this is true, because hq-edge is
   * already gone and a second request could only fail.
   */
  accepted: boolean
  onArm(): void
  onConfirm(): void
  onCancel(): void
}

/**
 * Normalize the report's `runtime.source` to the full shape.
 *
 * An older hq-edge predates the feature and sends no `source` at all — that
 * must degrade to a read-only panel, not crash the render. A future server
 * may add fields; unknown extras are dropped here rather than trusted.
 */
function normalizeSource(raw: unknown): RuntimeUpdateSource | null {
  if (raw === null || typeof raw !== 'object') return null
  const candidate = raw as Partial<RuntimeUpdateSource>
  if (typeof candidate.origin !== 'string') return null
  return {
    url: typeof candidate.url === 'string' ? candidate.url : '',
    origin: candidate.origin as RuntimeUpdateSource['origin'],
    configuredUrl: typeof candidate.configuredUrl === 'string' ? candidate.configuredUrl : '',
    override: candidate.override === true,
  }
}

/** The tag naming where the URL in effect came from. */
function originLabel(origin: RuntimeUpdateSource['origin'], copy: UpdateCopy): string {
  switch (origin) {
    case 'override':
      return copy.originOverride
    case 'config':
      return copy.originConfig
    default:
      return copy.originUnset
  }
}

/** The 更新源 fact row: the URL in effect plus an origin tag. */
function sourceFactRow(
  facts: HTMLElement,
  source: RuntimeUpdateSource,
  copy: UpdateCopy,
): void {
  const wrap = el('div')
  wrap.append(el('dt', '', copy.runtime.source))
  const dd = el('dd')
  const line = el('div', 'hqpu-source-line')
  const code = el(
    'code',
    'hqpu-source-url',
    source.url.length > 0 ? source.url : copy.runtime.notConfigured,
  )
  const tag = el('span', 'hqpu-tag')
  tag.dataset.tone = source.override ? 'info' : source.origin === 'config' ? 'success' : 'neutral'
  tag.textContent = originLabel(source.origin, copy)
  line.append(code, tag)
  dd.append(line)
  wrap.append(dd)
  facts.append(wrap)
}

/** Which manifest an editor belongs to — drives data attributes + CSS hook. */
export type SourceKind = 'runtime' | 'plugin'

/** The localized strings one source editor needs (both kinds share the flow). */
interface SourceEditorLabels {
  hint: string
  edit: string
  save: string
  reset: string
  inputLabel: string
  placeholder: string
}

/** Pick the labels for one kind out of the copy table. */
function sourceLabels(copy: UpdateCopy, kind: SourceKind): SourceEditorLabels {
  return kind === 'runtime'
    ? {
        hint: copy.runtime.sourceHint,
        edit: copy.runtime.sourceEdit,
        save: copy.runtime.sourceSave,
        reset: copy.runtime.sourceReset,
        inputLabel: copy.runtime.sourceInputLabel,
        placeholder: copy.runtime.sourcePlaceholder,
      }
    : {
        hint: copy.pluginSource.hint,
        edit: copy.pluginSource.edit,
        save: copy.pluginSource.save,
        reset: copy.pluginSource.reset,
        inputLabel: copy.pluginSource.inputLabel,
        placeholder: copy.pluginSource.placeholder,
      }
}

/**
 * One update-source editor, shared by the plugin manifest and the runtime
 * manifest (the only differences are the labels and the data-attribute
 * prefix, so tests and CSS can target each).
 *
 * Read mode is a hint plus a 修改 button; edit mode is the URL field with
 * 保存 / 取消 — plus 恢复默认 while a user override shadows the configured
 * URL. The draft lives in {@link SourceEditorActions} (the panel closure), so
 * a background store refresh re-renders the typed URL instead of discarding it.
 */
function sourceEditor(
  kind: SourceKind,
  source: RuntimeUpdateSource,
  copy: UpdateCopy,
  actions: SourceEditorActions,
): HTMLElement {
  const labels = sourceLabels(copy, kind)
  const block = el('div', `hqpu-source-editor hqpu-source-editor--${kind}`)
  if (!actions.sourceEditing) {
    block.append(el('p', 'hqpu-status hqpu-source-hint', labels.hint))
    const edit = el('button', 'hqpu-btn hqpu-btn--outline hqpu-btn--sm', labels.edit)
    edit.type = 'button'
    edit.setAttribute(`data-${kind}-source-edit`, '')
    edit.disabled = actions.sourceSaving
    edit.addEventListener('click', actions.onSourceEdit)
    block.append(edit)
    return block
  }
  const input = el('input', 'hqpu-source-input')
  input.type = 'url'
  input.value = actions.sourceDraft
  input.placeholder = labels.placeholder
  input.setAttribute('aria-label', labels.inputLabel)
  input.setAttribute(`data-${kind}-source-input`, '')
  input.disabled = actions.sourceSaving
  input.addEventListener('input', () => {
    // Draft-only: no re-render, so the caret and IME stay untouched.
    actions.onSourceDraft(input.value)
  })
  // Enter saves, Escape cancels — the field is the whole editor, and Escape
  // must not fall through to the panel-wide close handler.
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') {
      ev.preventDefault()
      actions.onSourceSave()
    } else if (ev.key === 'Escape') {
      ev.preventDefault()
      ev.stopPropagation()
      actions.onSourceCancel()
    }
  })
  const save = el('button', 'hqpu-btn hqpu-btn--primary hqpu-btn--sm', labels.save)
  save.type = 'button'
  save.setAttribute(`data-${kind}-source-save`, '')
  save.disabled = actions.sourceSaving
  save.addEventListener('click', actions.onSourceSave)
  const cancel = el('button', 'hqpu-btn hqpu-btn--outline hqpu-btn--sm', copy.cancel)
  cancel.type = 'button'
  cancel.setAttribute(`data-${kind}-source-cancel`, '')
  cancel.disabled = actions.sourceSaving
  cancel.addEventListener('click', actions.onSourceCancel)
  const controls = el('div', 'hqpu-actions hqpu-source-controls')
  controls.append(input, save, cancel)
  if (source.override) {
    const reset = el('button', 'hqpu-btn hqpu-btn--ghost hqpu-btn--sm', labels.reset)
    reset.type = 'button'
    reset.setAttribute(`data-${kind}-source-reset`, '')
    reset.disabled = actions.sourceSaving
    reset.addEventListener('click', actions.onSourceReset)
    controls.append(reset)
  }
  block.append(controls)
  // Focus on open — and on any re-render while editing, which is exactly what
  // a rejected save wants (the user is dropped back into the field to fix it).
  input.focus()
  return block
}

/**
 * The plugin release-manifest source, as its own group above the plugin
 * groups: it says where the whole list comes from, so it belongs above the
 * list rather than inside it. Absent on an older hq-edge (no `pluginSource`
 * in the report) — then nothing is rendered at all.
 */
function pluginSourceGroup(
  report: PluginUpdateReport,
  copy: UpdateCopy,
  actions: SourceEditorActions,
): HTMLElement | null {
  const source = normalizeSource(report.pluginSource)
  if (source === null) return null
  const section = el('section', 'hqpu-group')
  section.dataset.group = 'plugin-source'
  const head = el('div', 'hqpu-group-head')
  head.append(el('h3', 'hqpu-group-title', copy.pluginSource.title))
  section.append(head)

  const facts = el('dl', 'hqpu-facts')
  sourceFactRow(facts, source, copy)
  section.append(facts)
  section.append(sourceEditor('plugin', source, copy, actions))
  return section
}

/** The independent HQ Edge runtime report, as ruled fact rows. */
function runtimeGroup(
  report: PluginUpdateReport,
  copy: UpdateCopy,
  actions: RuntimeActions,
): HTMLElement {
  const section = el('section', 'hqpu-group')
  section.dataset.group = 'runtime'
  const head = el('div', 'hqpu-group-head')
  head.append(el('h3', 'hqpu-group-title', copy.runtime.title))
  section.append(head)

  const facts = el('dl', 'hqpu-facts')
  const runtime = report.runtime
  // `runtime.latest` is a release ENTRY; only its version is ever displayed or
  // sent back as `targetVersion`.
  const latestVersion = runtimeLatestVersion(runtime)

  const row = (label: string, value: string, code = false): void => {
    const wrap = el('div')
    wrap.append(el('dt', '', label))
    const dd = el('dd')
    if (code) {
      const node = el('code', '', value)
      dd.append(node)
    } else {
      dd.textContent = value
    }
    wrap.append(dd)
    facts.append(wrap)
  }

  // The source row: which manifest URL is in effect and where it came from.
  // Absent on an older hq-edge — then only the legacy notConfigured row shows.
  const source = normalizeSource(runtime.source)

  if (runtime.configured === false) {
    if (source !== null) {
      sourceFactRow(facts, source, copy)
    } else {
      row(copy.runtime.source, copy.runtime.notConfigured)
    }
  } else {
    row(copy.runtime.current, runtime.currentVersion ?? copy.runtime.unknown)
    if (runtime.updateAvailable && latestVersion !== null) {
      row(copy.runtime.latest, latestVersion)
      // v2 manifest metadata: download size before committing to the update.
      const latestEntry = runtime.latest
      const size = typeof latestEntry?.sizeBytes === 'number' ? formatMb(latestEntry.sizeBytes) : ''
      if (size.length > 0) row(copy.runtime.sizeLabel, size)
    }
    if (report.manifestVersion !== null) {
      row(copy.runtime.set, report.manifestVersion, true)
    }
    if (typeof runtime.checkedAt === 'string' && runtime.checkedAt.length > 0) {
      row(copy.runtime.checkedAt, new Date(runtime.checkedAt).toLocaleString())
    }
    if (source !== null) {
      sourceFactRow(facts, source, copy)
    }
  }
  section.append(facts)

  // The editor: point the runtime at another release channel (a staging
  // manifest, a local rig) without an env var and a restart. hq-edge persists
  // the override per host, so it survives restarts of both processes. It is a
  // developer affordance, so it hides behind an "advanced" disclosure.
  if (source !== null) {
    section.append(advancedBlock(copy, [sourceEditor('runtime', source, copy, actions)]))
  }

  // ── Runtime update action row ──
  // Only offered when hq-edge reports a newer distribution AND named its
  // version: the request needs `targetVersion`, so an entry without one has
  // nothing to send.
  if (runtime.updateAvailable && latestVersion !== null) {
    const row = el('div', 'hqpu-actions hqpu-runtime-actions')
    if (actions.accepted) {
      // Terminal state: no button. hq-edge has already exited, so re-offering
      // "update" here could only produce a transport error.
      const line = el('span', 'hqpu-status hqpu-status--dot')
      line.setAttribute('role', 'status')
      line.append(el('span', 'hqpu-spinner'), el('span', '', copy.runtime.updateAccepted))
      row.append(line)
    } else if (actions.busy) {
      // Downloading + verifying + staging the bundle: tens of seconds to a few
      // minutes. Say what is happening instead of an open-ended spinner.
      const line = el('span', 'hqpu-status hqpu-status--dot')
      line.setAttribute('role', 'status')
      line.append(el('span', 'hqpu-spinner'), el('span', '', copy.runtime.updating))
      row.append(line)
    } else if (actions.armed) {
      row.append(el('p', 'hqpu-status hqpu-runtime-confirm', copy.runtime.updateConfirm(latestVersion)))
      const yes = el('button', 'hqpu-btn hqpu-btn--primary hqpu-btn--sm', copy.confirmInstall)
      yes.type = 'button'
      yes.dataset.runtimeConfirm = ''
      yes.addEventListener('click', actions.onConfirm)
      const no = el('button', 'hqpu-btn hqpu-btn--outline hqpu-btn--sm', copy.cancel)
      no.type = 'button'
      no.addEventListener('click', actions.onCancel)
      row.append(yes, no)
    } else {
      const start = el('button', 'hqpu-btn hqpu-btn--primary hqpu-btn--sm')
      start.type = 'button'
      start.dataset.runtimeUpdate = ''
      start.innerHTML = `${DOWNLOAD_ICON(13)}<span>${copy.runtime.update}</span>`
      start.addEventListener('click', actions.onArm)
      row.append(start)
    }
    section.append(row)
    // Honest duration note: no fixed "one minute" claim.
    section.append(el('p', 'hqpu-status hqpu-job-meta', copy.runtime.durationNote))
  } else {
    section.append(el('p', 'hqpu-status', copy.runtime.note))
  }

  // The host's own report of the last runtime swap (succeeded / rolled_back /
  // failed). Before this it was read from disk by hq-edge and never shown — a
  // rolled-back swap was indistinguishable from "no update ever happened".
  const lastResult = runtime.lastResult
  if (lastResult !== null && lastResult !== undefined) {
    const state = lastResult.state
    const line = el('p', 'hqpu-status hqpu-status--dot')
    line.setAttribute('role', 'status')
    const dot = el('span', 'hqpu-dot')
    dot.dataset.state = state === 'succeeded' ? 'done' : state === 'failed' ? 'error' : 'warning'
    const head =
      state === 'succeeded'
        ? copy.runtime.lastResult.succeeded
        : state === 'failed'
          ? copy.runtime.lastResult.failed
          : copy.runtime.lastResult.rolledBack
    const parts = [head]
    if (lastResult.targetVersion) parts.push(`→ ${lastResult.targetVersion}`)
    if (lastResult.installedVersion) parts.push(`(${lastResult.installedVersion})`)
    if (lastResult.at) parts.push(new Date(lastResult.at).toLocaleString())
    line.append(dot, el('span', '', parts.join(' ')))
    section.append(line)
    if (typeof lastResult.message === 'string' && lastResult.message.length > 0) {
      section.append(el('p', 'hqpu-status', lastResult.message))
    }
    if (typeof lastResult.errorCode === 'string' && lastResult.errorCode.length > 0) {
      section.append(el('p', 'hqpu-status hqpu-job-meta', lastResult.errorCode))
    }
    if (state !== 'succeeded') {
      section.append(el('p', 'hqpu-status hqpu-job-meta', copy.runtime.lastResult.elevation))
    }
  }

  if (typeof runtime.lastError === 'string' && runtime.lastError.length > 0) {
    const line = el('p', 'hqpu-status hqpu-status--dot')
    line.setAttribute('role', 'status')
    const dot = el('span', 'hqpu-dot')
    dot.dataset.state = 'error'
    line.append(dot, el('span', '', `${copy.lastError}: ${runtime.lastError}`))
    section.append(line)
  }
  return section
}

function renderList(
  section: HTMLElement,
  report: PluginUpdateReport | null,
  copy: UpdateCopy,
  installing: boolean,
  store: UpdateStoreLike,
  onRetryCheck: () => void,
): void {
  section.textContent = ''
  if (report === null) {
    section.append(skeleton(copy))
    return
  }
  // Check-status banner: a failed check shows an error row + Retry (never the
  // silent "no updates" empty state); a successful check shows the time.
  const banner = checkBanner(report, copy, onRetryCheck)
  if (banner !== null) section.append(banner)
  // Set-level release metadata (v2 manifest): summary, notes, breaking.
  const release = releaseHeader(report.release, copy)
  if (release !== null) section.append(release)
  if (report.items.length === 0) {
    // A successful check with zero updates — distinct from a failed check,
    // which already rendered its error row above.
    if (typeof report.lastError !== 'string' || report.lastError.length === 0) {
      section.append(el('div', 'hqpu-empty', copy.empty))
    }
    return
  }

  const byState = (state: PluginUpdateItem['state']): PluginUpdateItem[] =>
    report.items.filter((item) => item.state === state)

  // Most important first: what can be acted on, then what is refused, then
  // what was muted, then what is already settled.
  const order: Array<[string, PluginUpdateItem[]]> = [
    [copy.group.actionable, [...byState('update'), ...byState('install')]],
    [copy.group.blocked, byState('blocked')],
    [copy.group.ignored, byState('ignored')],
    [copy.group.current, byState('current')],
  ]
  for (const [heading, items] of order) {
    const node = group(heading, items, copy, installing, store)
    if (node !== null) section.append(node)
  }
}

function renderRuntime(
  section: HTMLElement,
  report: PluginUpdateReport | null,
  copy: UpdateCopy,
  actions: RuntimeActions,
): void {
  section.textContent = ''
  if (report === null) return
  section.append(runtimeGroup(report, copy, actions))
}

/** The plugin-source group, above the plugin groups, hidden behind an advanced
 *  disclosure (manifest-URL editing is a developer affordance). No-op without
 *  the field. */
function renderPluginSource(
  section: HTMLElement,
  report: PluginUpdateReport | null,
  copy: UpdateCopy,
  actions: SourceEditorActions,
): void {
  section.textContent = ''
  if (report === null) return
  const node = pluginSourceGroup(report, copy, actions)
  if (node !== null) section.append(advancedBlock(copy, [node]))
}

/** Run the install transaction (a new durable job), then let the store poll it. */
async function runInstall(store: UpdateStoreLike, copy: UpdateCopy): Promise<void> {
  const report = store.report()
  if (report === null) return
  // Without an evaluated set there is nothing to install: hq-edge has not read
  // a manifest yet, so the report is still its empty shell.
  if (report.manifestVersion === null) {
    showToast(copy.checkFailed, 'error')
    return
  }
  // Flip the installing flag BEFORE the request: this is what disables the
  // action buttons and shows the "DSH will restart" footer state (previously
  // dead code — runInstall never called it).
  store.setInstalling(true)
  try {
    const result = await installSet(report.manifestVersion)
    if (result.error !== undefined) {
      store.setInstalling(false)
      showToast(`${copy.installError}: ${result.error}`, 'error')
      return
    }
    // 202 accepted: a durable job now owns the lifecycle. The store's /status
    // poller renders progress and clears the flag when the job settles.
    showToast(copy.installSuccess, 'success')
    void store.fetchStatus()
  } catch (err: unknown) {
    store.setInstalling(false)
    showToast(
      `${copy.installError}: ${err instanceof Error ? err.message : String(err)}`,
      'error',
    )
  }
}

/** The single live toast; a new message replaces the one on screen. */
let toastHost: HTMLElement | null = null
let toastTimer: number | null = null

function showToast(message: string, tone: 'success' | 'error'): void {
  if (toastHost === null) return
  if (toastTimer !== null) window.clearTimeout(toastTimer)
  toastHost.textContent = ''
  const toast = el('div', 'hqpu-toast')
  toast.setAttribute('role', 'status')
  const icon = el('span', 'hqpu-toast-icon')
  icon.dataset.tone = tone
  icon.innerHTML = tone === 'success' ? CHECK_CIRCLE_ICON(16) : WARNING_ICON(16)
  toast.append(icon, el('span', 'hqpu-toast-text', message))
  toastHost.append(toast)
  toastTimer = window.setTimeout(() => {
    toastHost?.replaceChildren()
    toastTimer = null
  }, TOAST_HOLD_MS)
}

function renderActions(
  bar: HTMLElement,
  report: PluginUpdateReport | null,
  copy: UpdateCopy,
  store: UpdateStoreLike,
  installing: boolean,
): void {
  bar.textContent = ''
  if (report === null) return

  if (installing) {
    const line = el('span', 'hqpu-status hqpu-status--dot')
    const spinner = el('span', 'hqpu-spinner')
    line.append(spinner, el('span', '', copy.installing))
    bar.append(line)
    return
  }

  const actionable = report.items.filter(
    (item) => item.state === 'update' || item.state === 'install',
  ).length
  // Every write needs an evaluated set; hq-edge reports `null` until it has
  // read a manifest, and posting `null` would only earn a 400.
  const hasSet = report.manifestVersion !== null

  if (actionable === 0) {
    // The official page shows no install control when there is nothing to
    // commit, so mirror that with a muted line rather than a dead button.
    bar.append(el('span', 'hqpu-status', copy.nothingToInstall))
  } else {
    const installBtn = el('button', 'hqpu-btn hqpu-btn--primary')
    installBtn.type = 'button'
    installBtn.disabled = !hasSet || report.ignoredSet
    installBtn.innerHTML = `${DOWNLOAD_ICON(13)}<span>${copy.installAll(actionable)}</span>`
    installBtn.addEventListener('click', () => {
      void runInstall(store, copy)
    })
    bar.append(installBtn)
  }

  if (!hasSet) return

  if (report.ignoredSet) {
    const unignore = el('button', 'hqpu-btn hqpu-btn--outline hqpu-btn--sm', copy.unignore)
    unignore.type = 'button'
    unignore.addEventListener('click', () => {
      void unignoreOffer(report.manifestVersion as string)
        .then(() => store.refresh())
        .catch(() => undefined)
    })
    bar.append(unignore)
  } else if (actionable > 0) {
    const ignore = el('button', 'hqpu-btn hqpu-btn--ghost hqpu-btn--sm', copy.ignore)
    ignore.type = 'button'
    ignore.addEventListener('click', () => {
      void ignoreOffer(report.manifestVersion as string)
        .then(() => store.refresh())
        .catch(() => undefined)
    })
    bar.append(ignore)
  }
}

/**
 * Open (or focus) the update panel. Re-renders from the store; when the store
 * is stale the panel first refreshes the report.
 */
export function openUpdateView(store: UpdateStoreLike, copy: UpdateCopy): void {
  const existing = document.querySelector<HTMLElement>('[data-hq-plugin-update-view]')
  if (existing !== null) {
    existing.style.display = ''
    return
  }

  const overlay = el('div', 'hqpu-overlay')
  overlay.setAttribute('data-hq-plugin-update-view', '')
  overlay.addEventListener('click', (ev) => {
    if (ev.target === overlay) onClose()
  })

  const scrim = el('div', 'hqpu-scrim')
  const panel = el('div', 'hqpu-panel')
  panel.setAttribute('role', 'dialog')
  panel.setAttribute('aria-modal', 'true')
  panel.setAttribute('aria-label', copy.viewTitle)
  panel.tabIndex = -1

  // ── Head row: title + intro, refresh toolbar ──
  const head = el('div', 'hqpu-head')
  const headMain = el('div', 'hqpu-head-main')
  headMain.append(el('h1', 'hqpu-title', copy.viewTitle))
  const intro = el('p', 'hqpu-intro')
  intro.append(el('span', '', copy.viewIntro))
  const info = el('button', 'hqpu-info')
  info.type = 'button'
  info.setAttribute('aria-label', copy.viewInfo)
  info.title = copy.viewInfo
  info.innerHTML = INFO_ICON(11)
  intro.append(info)
  headMain.append(intro)

  const toolbar = el('div', 'hqpu-toolbar')
  const refreshBtn = iconButton('hqpu-icon-btn', REFRESH_ICON(16), copy.refresh, () => {
    void store.refresh()
  })
  toolbar.append(refreshBtn)
  const closeBtn = iconButton('hqpu-icon-btn', CLOSE_ICON(16), copy.close, () => {
    onClose()
  })
  toolbar.append(closeBtn)

  head.append(headMain, toolbar)
  panel.append(head)

  // ── Scrolling body: the centred column ──
  const scroll = el('div', 'hqpu-scroll')
  const column = el('div', 'hqpu-column')
  // The durable-job view leads: an active install/runtime update is resumed on
  // open BEFORE anything else, and a recent terminal result is shown here too.
  const jobSection = el('div', 'hqpu-stack')
  const pluginSourceSection = el('div', 'hqpu-stack')
  const listSection = el('div', 'hqpu-stack')
  const runtimeSection = el('div', 'hqpu-stack')
  const toastSection = el('div', 'hqpu-toast-host')
  column.append(jobSection, pluginSourceSection, listSection, runtimeSection, toastSection)
  scroll.append(column)
  panel.append(scroll)

  // ── Footer actions (ui-primitives Modal .footer) ──
  const footer = el('div', 'hqpu-footer')
  const actionBar = el('div', 'hqpu-actions')
  footer.append(actionBar)
  panel.append(footer)

  overlay.append(scrim, panel)
  document.body.appendChild(overlay)
  toastHost = toastSection
  panel.focus()

  const disposers: Array<() => void> = []

  // ── Runtime update: arm → confirm, then hand off to hq-edge ──
  // Live in the panel's closure (not the report) because they are UI state, and
  // a store refresh must not silently disarm a confirm the user just armed.
  let runtimeArmed = false
  let runtimeBusy = false
  let runtimeAccepted = false

  // Source-editor state, same reasoning: a background refresh must not discard
  // a half-typed URL or silently close either editor.
  const runtimeSourceState: SourceState = { editing: false, saving: false, draft: '' }
  const pluginSourceState: SourceState = { editing: false, saving: false, draft: '' }

  // Delegated, not spread: `...sourceActionsFor(...)` would evaluate the
  // getters once and freeze `sourceEditing: false` — the editor would never
  // open. Read every member through the live object instead.
  const runtimeSourceActions = sourceActionsFor('runtime', runtimeSourceState)
  const runtimeActions: RuntimeActions = {
    get busy() {
      return runtimeBusy
    },
    get armed() {
      return runtimeArmed
    },
    get accepted() {
      return runtimeAccepted
    },
    onArm: () => {
      runtimeArmed = true
      render()
    },
    onCancel: () => {
      runtimeArmed = false
      render()
    },
    onConfirm: () => {
      void requestRuntime()
    },
    get sourceEditing() {
      return runtimeSourceActions.sourceEditing
    },
    get sourceSaving() {
      return runtimeSourceActions.sourceSaving
    },
    get sourceDraft() {
      return runtimeSourceActions.sourceDraft
    },
    onSourceEdit: () => runtimeSourceActions.onSourceEdit(),
    onSourceDraft: (value: string) => runtimeSourceActions.onSourceDraft(value),
    onSourceSave: () => runtimeSourceActions.onSourceSave(),
    onSourceCancel: () => runtimeSourceActions.onSourceCancel(),
    onSourceReset: () => runtimeSourceActions.onSourceReset(),
  }

  const pluginActions: SourceEditorActions = sourceActionsFor('plugin', pluginSourceState)

  /** Build the {@link SourceEditorActions} half for one manifest source. */
  function sourceActionsFor(
    kind: SourceKind,
    state: SourceState,
  ): SourceEditorActions {
    return {
      get sourceEditing() {
        return state.editing
      },
      get sourceSaving() {
        return state.saving
      },
      get sourceDraft() {
        return state.draft
      },
      onSourceEdit: () => {
        // Prefill with the URL in effect, so 保存 is a no-op unless edited.
        const report = store.report()
        const source =
          kind === 'runtime' ? normalizeSource(report?.runtime.source) : normalizeSource(report?.pluginSource)
        state.draft = source?.url ?? ''
        state.editing = true
        render()
      },
      onSourceDraft: (value: string) => {
        state.draft = value
      },
      onSourceSave: () => {
        void submitSource(kind, state)
      },
      onSourceCancel: () => {
        state.editing = false
        render()
      },
      onSourceReset: () => {
        void submitSource(kind, state, '')
      },
    }
  }

  /**
   * Save one manifest source — or clear the override with an empty URL —
   * then re-run discovery.
   *
   * The re-check is not optional: the report is cached, so without a fresh
   * `POST /check` the facts and the update button would keep naming the OLD
   * manifest's offer after the source changed. hq-edge answers 422 with a
   * message meant for a person on refusal (bad scheme, credentials, …), which
   * the toast shows verbatim.
   */
  async function submitSource(
    kind: SourceKind,
    state: SourceState,
    url: string = state.draft,
  ): Promise<void> {
    state.saving = true
    render()
    const labels = kind === 'runtime' ? copy.runtime : copy.pluginSource
    try {
      if (kind === 'runtime') await setRuntimeUpdateSource(url)
      else await setPluginUpdateSource(url)
      state.editing = false
      showToast(labels.saved, 'success')
      try {
        await checkUpdates()
        await store.refresh()
      } catch {
        // The source IS saved; a failed re-check only leaves the previous
        // offer on screen until the next refresh — the toolbar re-runs it.
      }
    } catch (err: unknown) {
      showToast(
        `${labels.saveFailed}: ${err instanceof Error ? err.message : String(err)}`,
        'error',
      )
    } finally {
      state.saving = false
      render()
    }
  }

  async function requestRuntime(): Promise<void> {
    const version = runtimeLatestVersion(store.report()?.runtime)
    if (version === null) {
      showToast(copy.checkFailed, 'error')
      return
    }
    runtimeArmed = false
    runtimeBusy = true
    render()
    try {
      const result = await requestRuntimeUpdate(version)
      if (result?.error !== undefined) {
        showToast(`${copy.installError}: ${result.error}`, 'error')
        return
      }
      // 202 Accepted: hq-edge exits to let the EDA host swap the runtime and
      // relaunch. This panel is about to go away with the restart, so say so —
      // and latch it, so a store refresh cannot re-offer the button for a
      // server that is already gone.
      runtimeAccepted = true
      showToast(copy.runtime.updateAccepted, 'success')
      // Adopt the new durable job immediately so the active-job view renders
      // (it polls from here; this process is about to be swapped away anyway).
      void store.fetchStatus()
    } catch (err: unknown) {
      showToast(
        `${copy.installError}: ${err instanceof Error ? err.message : String(err)}`,
        'error',
      )
    } finally {
      runtimeBusy = false
      render()
    }
  }

  /** Retry a failed/abandoned job: plugin-set → a fresh install; runtime →
   *  re-arm the runtime confirm flow. Always a NEW job, never re-clicking the
   *  settled job id. */
  const retryJob = (kind: 'plugin-set' | 'runtime'): void => {
    if (kind === 'runtime') {
      runtimeArmed = true
      render()
    } else {
      void runInstall(store, copy)
    }
  }

  const renderJobSection = (): void => {
    jobSection.textContent = ''
    const active = store.activeJob()
    if (active !== null && !TERMINAL_PHASES.has(active.phase)) {
      // An active job leads the panel — resumed on open, polled to its end.
      jobSection.append(activeJobView(active, copy))
      return
    }
    const recent = store.recentJobs()
    const latest = recent[0]
    if (latest !== undefined && TERMINAL_PHASES.has(latest.phase)) {
      jobSection.append(resultView(latest, copy, () => retryJob(latest.kind)))
      const older = recentJobsList(recent, copy)
      if (older !== null) jobSection.append(older)
    }
  }

  const render = (): void => {
    const report = store.report()
    // The footer "installing" state is owned by the store flag OR any active
    // durable job — buttons stay disabled while either is true.
    const jobActive =
      store.activeJob() !== null && !TERMINAL_PHASES.has(store.activeJob()!.phase)
    const installing = store.installing() || jobActive
    const stale = report === null
    refreshBtn.disabled = stale
    renderJobSection()
    if (stale) {
      listSection.textContent = ''
      listSection.append(skeleton(copy))
    } else {
      renderList(listSection, report, copy, installing, store, () => {
        void store.check()
      })
    }
    renderPluginSource(pluginSourceSection, report, copy, pluginActions)
    renderRuntime(runtimeSection, report, copy, runtimeActions)
    renderActions(actionBar, report, copy, store, installing)
  }

  const unsubscribe = store.subscribe(render)
  disposers.push(unsubscribe)

  // Refresh on open (bounded; never block the shell).
  void store.refresh().then(() => {
    // Store notification re-renders already; nothing extra to do.
  })

  // Escape closes, the shell-wide dialog contract.
  const onKeyDown = (ev: KeyboardEvent): void => {
    if (ev.key === 'Escape') {
      ev.stopPropagation()
      onClose()
    }
  }
  document.addEventListener('keydown', onKeyDown)
  disposers.push(() => document.removeEventListener('keydown', onKeyDown))

  function onClose(): void {
    for (const dispose of disposers) {
      try {
        dispose()
      } catch {
        /* already disposed */
      }
    }
    if (toastTimer !== null) window.clearTimeout(toastTimer)
    toastTimer = null
    if (toastHost === toastSection) toastHost = null
    overlay.remove()
  }

  render()
}
