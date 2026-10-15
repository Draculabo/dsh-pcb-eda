/**
 * Plugin-update review modal (browser half).
 *
 * Plain-DOM modal (no React tree) so it can never disturb the DSH shell's
 * reconciliation — same rule as the sidebar entry rows. Rendered content:
 *
 *   - header: title + refresh
 *   - plugin list (name, current → available, state badge, blocked reason)
 *   - ignored-offer banner + reversible "show again"
 *   - install action (disabled while installing / nothing actionable / offer
 *     ignored); after install the UI keeps polling the backend state instead
 *     of trusting the HTTP response alone, because activating a set restarts
 *     DSH (spec §7.1: never report success on the 200/202 alone).
 *   - independent HQ Edge runtime section (read-only report; the actual
 *     upgrade is owned by the EDA installer).
 *
 * @module
 */
import {
  checkUpdates,
  ignoreOffer,
  installSet,
  unignoreOffer,
  type PluginUpdateItem,
  type PluginUpdateReport,
} from './api.js'
import type { UpdateCopy } from './copy.js'

export interface UpdateStoreLike {
  report(): PluginUpdateReport | null
  installing(): boolean
  refresh(): Promise<PluginUpdateReport | null>
  subscribe(listener: () => void): () => void
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  node.className = className
  if (text !== undefined) node.textContent = text
  return node
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

function blockedReason(item: PluginUpdateItem, copy: UpdateCopy): string | undefined {
  const by = item.blockedBy ?? []
  if (by.includes('host')) return copy.blockedReason.host
  if (by.includes('hq-edge-version')) return copy.blockedReason['hq-edge-version']
  if (by.includes('runtime-unknown')) return copy.blockedReason['runtime-unknown']
  return by.length > 0 ? by.join(', ') : undefined
}

/**
 * Open (or focus) the update modal. Re-renders from the store; when the store
 * is stale the modal first refreshes the report.
 */
export function openUpdateView(store: UpdateStoreLike, copy: UpdateCopy): void {
  const existing = document.querySelector<HTMLElement>('[data-hq-plugin-update-view]')
  if (existing !== null) {
    existing.style.display = ''
    return
  }

  const overlay = el('div', 'hqpu-overlay')
  overlay.setAttribute('data-hq-plugin-update-view', '')
  const panel = el('div', 'hqpu-panel')

  // Header
  const header = el('div', 'hqpu-header')
  header.append(el('div', 'hqpu-title', copy.viewTitle))
  const refreshBtn = el('button', 'hqpu-btn', copy.refresh)
  header.append(refreshBtn)
  const closeBtn = el('button', 'hqpu-btn hqpu-btn-ghost', copy.close)
  header.append(closeBtn)

  // Body: plugin list + ignored banner + install action + runtime section.
  const body = el('div', 'hqpu-body')
  const listSection = el('div', 'hqpu-section')
  const runtimeSection = el('div', 'hqpu-section hqpu-runtime')
  const actionBar = el('div', 'hqpu-actions')

  panel.append(header, body)
  body.append(listSection, runtimeSection, actionBar)
  overlay.append(panel)
  document.body.appendChild(overlay)

  const disposers: Array<() => void> = []

  const render = (): void => {
    const report = store.report()
    const installing = store.installing()
    renderList(listSection, report, copy, installing, store)
    renderRuntime(runtimeSection, report, copy)
    renderActions(actionBar, report, copy, store, installing)
  }

  const unsubscribe = store.subscribe(render)
  disposers.push(unsubscribe)

  // Refresh on open (bounded; never block the shell).
  void store.refresh().then(() => {
    // Store notification re-renders already; nothing extra to do.
  })

  const onClose = (): void => {
    for (const dispose of disposers) {
      try {
        dispose()
      } catch {
        /* already disposed */
      }
    }
    overlay.remove()
  }
  closeBtn.addEventListener('click', onClose)
  overlay.addEventListener('click', (ev) => {
    if (ev.target === overlay) onClose()
  })
  refreshBtn.addEventListener('click', () => {
    void store.refresh()
  })
  disposers.push(() => {
    closeBtn.removeEventListener('click', onClose)
    overlay.removeEventListener('click', onClose)
    refreshBtn.removeEventListener('click', () => {})
  })

  render()
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
    section.append(el('div', 'hqpu-empty', copy.checkFailed))
    return
  }
  if (report.items.length === 0) {
    section.append(el('div', 'hqpu-empty', copy.empty))
    return
  }

  const manifestRow = el('div', 'hqpu-manifest')
  manifestRow.append(
    el('span', 'hqpu-manifest-label', `${copy.manifestVersion}`),
    el('span', 'hqpu-manifest-value', report.manifestVersion),
  )
  section.append(manifestRow)

  if (report.ignoredSet) {
    const banner = el('div', 'hqpu-ignored-banner', copy.ignoredOffer)
    const unignore = el('button', 'hqpu-btn hqpu-btn-small', copy.unignore)
    unignore.addEventListener('click', () => {
      void unignoreOffer(report.manifestVersion)
        .then(() => store.refresh())
        .catch(() => undefined)
    })
    banner.append(unignore)
    section.append(banner)
  }

  const list = el('ul', 'hqpu-list')
  for (const item of report.items) {
    const row = el('li', `hqpu-item hqpu-item-${item.state}`)
    const name = el('span', 'hqpu-item-name', item.name)
    const version = el(
      'span',
      'hqpu-item-version',
      item.state === 'current'
        ? item.currentVersion
        : `${item.currentVersion} → ${item.availableVersion}`,
    )
    const state = el('span', `hqpu-item-state hqpu-state-${item.state}`, stateLabel(item, copy))
    row.append(name, version, state)
    const reason = blockedReason(item, copy)
    if (reason !== undefined) {
      row.append(el('span', 'hqpu-item-reason', reason))
    }
    list.append(row)
  }
  section.append(list)
}

function renderRuntime(
  section: HTMLElement,
  report: PluginUpdateReport | null,
  copy: UpdateCopy,
): void {
  section.textContent = ''
  const title = el('div', 'hqpu-runtime-title', copy.runtime.title)
  section.append(title)
  const runtime = report?.runtime
  if (runtime === undefined || runtime.configured === false) {
    section.append(el('div', 'hqpu-runtime-line', copy.runtime.notConfigured))
    return
  }
  if (runtime.updateAvailable && runtime.latest !== undefined) {
    section.append(el('div', 'hqpu-runtime-line', copy.runtime.updateAvailable(runtime.latest)))
  } else if (runtime.currentVersion !== undefined) {
    section.append(el('div', 'hqpu-runtime-line', copy.runtime.current(runtime.currentVersion)))
  } else {
    section.append(el('div', 'hqpu-runtime-line', copy.runtime.unknown))
  }
  section.append(el('div', 'hqpu-runtime-note', copy.runtime.note))
  if (runtime.lastError !== undefined && runtime.lastError.length > 0) {
    section.append(el('div', 'hqpu-runtime-error', `${copy.lastError}: ${runtime.lastError}`))
  }
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
    bar.append(el('span', 'hqpu-installing', copy.installing))
    return
  }

  const actionable = report.items.filter(
    (item) => item.state === 'update' || item.state === 'install',
  ).length
  const installBtn = el(
    'button',
    'hqpu-btn hqpu-btn-primary',
    actionable > 0 ? copy.installAll(actionable) : copy.state.current,
  )
  installBtn.disabled = actionable === 0 || report.ignoredSet
  installBtn.addEventListener('click', () => {
    void installSet(report.manifestVersion)
      .then((result) => {
        if (result.error !== undefined) {
          bar.textContent = ''
          bar.append(el('div', 'hqpu-error', `${copy.installError}: ${result.error}`))
          return
        }
        // The set is activated atomically; DSH restarts. Keep polling the
        // backend state rather than trusting the response alone (spec §7.1).
        bar.textContent = ''
        bar.append(el('span', 'hqpu-installing', copy.installSuccess))
        void pollUntilSettled(store, report.manifestVersion)
      })
      .catch((err: unknown) => {
        bar.textContent = ''
        bar.append(
          el('div', 'hqpu-error', `${copy.installError}: ${err instanceof Error ? err.message : String(err)}`),
        )
      })
  })
  bar.append(installBtn)
}

/** After an install, poll the backend until the update report settles
 *  (installing flag clears or DSH restarts under us — the next load re-reads
 *  the fresh state). */
function pollUntilSettled(store: UpdateStoreLike, setVersion: string): void {
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
