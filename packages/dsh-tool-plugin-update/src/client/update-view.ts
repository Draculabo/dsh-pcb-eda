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
  setRuntimeUpdateSource,
  unignoreOffer,
  type PluginUpdateItem,
  type PluginUpdateReport,
  type RuntimeUpdateSource,
} from './api.js'
import type { UpdateCopy } from './copy.js'
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
  refresh(): Promise<PluginUpdateReport | null>
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
  // The full package name is the card's tooltip; the row shows the short name.
  card.title = `${item.name} · ${versionLine(item)}`

  const head = el('div', 'hqpu-card-head')

  const glyph = el('span', 'hqpu-card-icon')
  glyph.setAttribute('aria-hidden', 'true')
  glyph.innerHTML = PLUGIN_ICON(24)

  const main = el('div', 'hqpu-card-main')
  const titleRow = el('div', 'hqpu-title-row')
  const title = el('span', 'hqpu-card-title', shortName(item.name))
  const tag = el('span', 'hqpu-tag')
  tag.dataset.tone = stateTone(item)
  tag.textContent = stateLabel(item, copy)
  titleRow.append(title, tag)

  const desc = el('span', 'hqpu-card-desc', versionLine(item))

  main.append(titleRow, desc)
  head.append(glyph, main)

  const end = el('div', 'hqpu-card-end')
  if (item.state === 'update' || item.state === 'install') {
    const button = el('button', 'hqpu-btn hqpu-btn--sm hqpu-btn--primary')
    button.type = 'button'
    button.disabled = installing
    button.innerHTML = `${DOWNLOAD_ICON(13)}<span>${copy.installOne}</span>`
    button.addEventListener('click', () => {
      void runInstall(store, copy)
    })
    end.append(button)
  }
  head.append(end)
  card.append(head)

  // A block reason belongs to a blocked offer only.
  if (item.state === 'blocked') {
    const reason = blockedReason(item, copy)
    if (reason !== undefined) {
      card.append(el('p', 'hqpu-card-reason', reason))
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

/**
 * The runtime-update action row's state and callbacks.
 *
 * Installing the runtime is destructive in a way a plugin install is not: hq-edge
 * shuts itself down so the EDA host can swap the runtime directory. So the row
 * is a two-step confirm (arm → confirm), never a single fire-and-forget click.
 *
 * The source-editing half makes the manifest URL editable from this panel:
 * hq-edge persists the override per host, so pointing the runtime at a staging
 * channel (or a local test rig) needs no env var and no restart. The editor
 * state lives in the panel closure for the same reason `armed` does — a store
 * refresh must not discard a half-typed URL.
 */
export interface RuntimeActions {
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
      return copy.runtime.originOverride
    case 'config':
      return copy.runtime.originConfig
    default:
      return copy.runtime.originUnset
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

/**
 * The update-source editor.
 *
 * Read mode is a hint plus a 修改 button; edit mode is the URL field with
 * 保存 / 取消 — plus 恢复默认 while a user override shadows the configured
 * URL. The draft lives in {@link RuntimeActions} (the panel closure), so a
 * background store refresh re-renders the typed URL instead of discarding it.
 */
function sourceEditor(
  source: RuntimeUpdateSource,
  copy: UpdateCopy,
  actions: RuntimeActions,
): HTMLElement {
  const block = el('div', 'hqpu-source-editor')
  if (!actions.sourceEditing) {
    block.append(el('p', 'hqpu-status hqpu-source-hint', copy.runtime.sourceHint))
    const edit = el('button', 'hqpu-btn hqpu-btn--outline hqpu-btn--sm', copy.runtime.sourceEdit)
    edit.type = 'button'
    edit.dataset.runtimeSourceEdit = ''
    edit.disabled = actions.sourceSaving
    edit.addEventListener('click', actions.onSourceEdit)
    block.append(edit)
    return block
  }
  const input = el('input', 'hqpu-source-input')
  input.type = 'url'
  input.value = actions.sourceDraft
  input.placeholder = copy.runtime.sourcePlaceholder
  input.setAttribute('aria-label', copy.runtime.sourceInputLabel)
  input.dataset.runtimeSourceInput = ''
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
  const save = el('button', 'hqpu-btn hqpu-btn--primary hqpu-btn--sm', copy.runtime.sourceSave)
  save.type = 'button'
  save.dataset.runtimeSourceSave = ''
  save.disabled = actions.sourceSaving
  save.addEventListener('click', actions.onSourceSave)
  const cancel = el('button', 'hqpu-btn hqpu-btn--outline hqpu-btn--sm', copy.cancel)
  cancel.type = 'button'
  cancel.dataset.runtimeSourceCancel = ''
  cancel.disabled = actions.sourceSaving
  cancel.addEventListener('click', actions.onSourceCancel)
  const controls = el('div', 'hqpu-actions hqpu-source-controls')
  controls.append(input, save, cancel)
  if (source.override) {
    const reset = el('button', 'hqpu-btn hqpu-btn--ghost hqpu-btn--sm', copy.runtime.sourceReset)
    reset.type = 'button'
    reset.dataset.runtimeSourceReset = ''
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
  // the override per host, so it survives restarts of both processes.
  if (source !== null) {
    section.append(sourceEditor(source, copy, actions))
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
  } else {
    section.append(el('p', 'hqpu-status', copy.runtime.note))
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
): void {
  section.textContent = ''
  if (report === null) {
    section.append(skeleton(copy))
    return
  }
  if (report.items.length === 0) {
    section.append(el('div', 'hqpu-empty', copy.empty))
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

/** Run the install transaction, then keep polling until the state settles. */
async function runInstall(store: UpdateStoreLike, copy: UpdateCopy): Promise<void> {
  const report = store.report()
  if (report === null) return
  // Without an evaluated set there is nothing to install: hq-edge has not read
  // a manifest yet, so the report is still its empty shell.
  if (report.manifestVersion === null) {
    showToast(copy.checkFailed, 'error')
    return
  }
  try {
    const result = await installSet(report.manifestVersion)
    if (result.error !== undefined) {
      showToast(`${copy.installError}: ${result.error}`, 'error')
      return
    }
    // The set activates atomically and DSH restarts. Keep polling the backend
    // state rather than trusting the response alone (spec §7.1).
    showToast(copy.installSuccess, 'success')
    void pollUntilSettled(store)
  } catch (err: unknown) {
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

/** After an install, poll the backend until the update report settles
 *  (installing flag clears or DSH restarts under us — the next load re-reads
 *  the fresh state). */
function pollUntilSettled(store: UpdateStoreLike): void {
  let attempts = 0
  const tick = (): void => {
    void store
      .refresh()
      .then((report) => {
        if (store.installing()) return
        if (report !== null && report.ignoredSet === false && attempts >= 2) return
      })
      .catch(() => undefined)
      .finally(() => {
        attempts += 1
        if (attempts < 10) {
          window.setTimeout(tick, 2000)
        }
      })
  }
  tick()
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
  const listSection = el('div', 'hqpu-stack')
  const runtimeSection = el('div', 'hqpu-stack')
  const toastSection = el('div', 'hqpu-toast-host')
  column.append(listSection, runtimeSection, toastSection)
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
  // a half-typed URL or silently close the editor.
  let sourceEditing = false
  let sourceSaving = false
  let sourceDraft = ''

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
      return sourceEditing
    },
    get sourceSaving() {
      return sourceSaving
    },
    get sourceDraft() {
      return sourceDraft
    },
    onSourceEdit: () => {
      // Prefill with the URL in effect, so 保存 is a no-op unless edited.
      sourceDraft = normalizeSource(store.report()?.runtime.source)?.url ?? ''
      sourceEditing = true
      render()
    },
    onSourceDraft: (value: string) => {
      sourceDraft = value
    },
    onSourceSave: () => {
      void submitRuntimeSource(sourceDraft)
    },
    onSourceCancel: () => {
      sourceEditing = false
      render()
    },
    onSourceReset: () => {
      void submitRuntimeSource('')
    },
  }

  /**
   * Save the runtime-update source — or clear the override with an empty
   * URL — then re-run discovery.
   *
   * The re-check is not optional: the report is cached, so without a fresh
   * `POST /check` the facts and the update button would keep naming the OLD
   * manifest's offer after the source changed. hq-edge answers 422 with a
   * message meant for a person on refusal (bad scheme, credentials, …), which
   * the toast shows verbatim.
   */
  async function submitRuntimeSource(url: string): Promise<void> {
    sourceSaving = true
    render()
    try {
      await setRuntimeUpdateSource(url)
      sourceEditing = false
      showToast(copy.runtime.sourceSaved, 'success')
      try {
        await checkUpdates()
        await store.refresh()
      } catch {
        // The source IS saved; a failed re-check only leaves the previous
        // offer on screen until the next refresh — the toolbar re-runs it.
      }
    } catch (err: unknown) {
      showToast(
        `${copy.runtime.sourceSaveFailed}: ${err instanceof Error ? err.message : String(err)}`,
        'error',
      )
    } finally {
      sourceSaving = false
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

  const render = (): void => {
    const report = store.report()
    const installing = store.installing()
    const stale = report === null
    refreshBtn.disabled = stale
    if (stale) {
      listSection.textContent = ''
      listSection.append(skeleton(copy))
    } else {
      renderList(listSection, report, copy, installing, store)
    }
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
