// @vitest-environment jsdom
/**
 * DOM tests for the HQ Edge runtime facts block in the update review panel.
 *
 * Regression guard for the "[object Object]" latest-version row: hq-edge sends
 * `runtime.latest` as a full release ENTRY (`{ version, sha256, platform, … }`),
 * not a bare string. The client type once claimed `string`, and rendering the
 * entry straight into a text node stringified it. The row must name a version.
 *
 * The second half covers the configurable update source: the panel must show
 * the manifest URL in effect with its origin, edit it through the forwarder,
 * re-run discovery after a save, and offer 恢复默认 only while a user
 * override shadows the configured URL.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { runtimeLatestVersion, type PluginUpdateItem, type PluginUpdateReport } from '../src/client/api.js'
import { COPY } from '../src/client/copy.js'
import { openUpdateView, type UpdateStoreLike } from '../src/client/update-view.js'
import { normalizePluginUpdateReport } from '../src/client/version.js'

// The view calls the API directly, so stub the calls it makes. Everything
// else (facts rows, install bar) is exercised for real.
const { requestRuntimeUpdate, setRuntimeUpdateSource, setPluginUpdateSource, checkUpdates } = vi.hoisted(
  () => ({
    requestRuntimeUpdate: vi.fn(async (_v: string) => ({
      requestId: 'req-1',
      targetVersion: '0.2.12',
      state: 'accepted',
    })),
    setRuntimeUpdateSource: vi.fn(async (url: string) => ({
      url,
      origin: url.length > 0 ? ('override' as const) : ('config' as const),
      configuredUrl: 'https://example.invalid/edge-headless-manifest.json',
      override: url.length > 0,
    })),
    setPluginUpdateSource: vi.fn(async (url: string) => ({
      url,
      origin: url.length > 0 ? ('override' as const) : ('config' as const),
      configuredUrl: 'https://gitee.com/huaqiu-electronics/dsh-pcb-eda/raw/main/plugins-release-manifest.json',
      override: url.length > 0,
    })),
    checkUpdates: vi.fn(async () => ({})),
  }),
)
vi.mock('../src/client/api.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/client/api.js')>()
  return { ...actual, requestRuntimeUpdate, setRuntimeUpdateSource, setPluginUpdateSource, checkUpdates }
})

function runtimeEntry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: '0.2.12',
    sha256: 'a'.repeat(64),
    platform: 'win',
    arch: 'x64',
    url: 'https://example.invalid/edge-headless-0.2.12-win-x64.zip',
    ...overrides,
  }
}

function reportWith(
  latest: unknown,
  updateAvailable = true,
  source?: unknown,
  pluginSource?: unknown,
): PluginUpdateReport {
  return {
    manifestVersion: '0.6.1',
    items: [],
    actionableCount: 0,
    ignoredSet: false,
    runtime: {
      configured: true,
      currentVersion: '0.2.11',
      latest: latest as never,
      updateAvailable,
      checkedAt: null,
      lastError: null,
      ...(source !== undefined ? { source: source as never } : {}),
    },
    ...(pluginSource !== undefined ? { pluginSource: pluginSource as never } : {}),
  }
}

function fakeStore(report: PluginUpdateReport): UpdateStoreLike {
  const listeners = new Set<() => void>()
  return {
    report: () => report,
    installing: () => false,
    refresh: async () => {
      for (const listener of [...listeners]) listener()
      return report
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

function factsText(): string {
  return document.querySelector('.hqpu-facts')?.textContent ?? ''
}

afterEach(() => {
  document.body.innerHTML = ''
  requestRuntimeUpdate.mockClear()
  setRuntimeUpdateSource.mockClear()
  setPluginUpdateSource.mockClear()
  checkUpdates.mockClear()
})

describe('runtimeLatestVersion', () => {
  it('reads the version off a release entry object', () => {
    expect(runtimeLatestVersion(reportWith(runtimeEntry()).runtime)).toBe('0.2.12')
  })

  it('accepts a bare version string from an older server', () => {
    expect(runtimeLatestVersion(reportWith('0.2.12').runtime)).toBe('0.2.12')
  })

  it('returns null when there is no latest entry', () => {
    expect(runtimeLatestVersion(reportWith(null).runtime)).toBeNull()
    expect(runtimeLatestVersion(reportWith(undefined).runtime)).toBeNull()
    expect(runtimeLatestVersion(null)).toBeNull()
  })

  it('never stringifies an object without a version', () => {
    expect(runtimeLatestVersion(reportWith({ platform: 'win' }).runtime)).toBeNull()
  })
})

describe('update view runtime facts', () => {
  it('renders the latest version, not "[object Object]"', () => {
    openUpdateView(fakeStore(reportWith(runtimeEntry())), COPY.zh)

    const facts = factsText()
    expect(facts).toContain('当前版本')
    expect(facts).toContain('0.2.11')
    expect(facts).toContain('最新版本')
    expect(facts).toContain('0.2.12')
    expect(facts).not.toContain('[object Object]')
  })

  it('omits the latest row when no update is available', () => {
    openUpdateView(fakeStore(reportWith(runtimeEntry(), false)), COPY.zh)

    expect(factsText()).not.toContain('最新版本')
  })
})

describe('runtime update action', () => {
  const startButton = (): HTMLButtonElement | null =>
    document.querySelector<HTMLButtonElement>('[data-runtime-update]')
  const confirmButton = (): HTMLButtonElement | null =>
    document.querySelector<HTMLButtonElement>('[data-runtime-confirm]')

  it('offers an install button only when a version is available', () => {
    openUpdateView(fakeStore(reportWith(runtimeEntry())), COPY.zh)
    expect(startButton()).not.toBeNull()

    document.body.innerHTML = ''
    openUpdateView(fakeStore(reportWith(runtimeEntry(), false)), COPY.zh)
    expect(startButton()).toBeNull()
  })

  it('needs a confirmed second click before it posts anything', () => {
    openUpdateView(fakeStore(reportWith(runtimeEntry())), COPY.zh)

    startButton()?.click()
    // Armed: the confirm prompt is up and nothing has been sent yet.
    expect(confirmButton()).not.toBeNull()
    expect(requestRuntimeUpdate).not.toHaveBeenCalled()
    // The prompt names the target version — the user must see what restarts.
    expect(document.body.textContent).toContain('0.2.12')

    confirmButton()?.click()
    expect(requestRuntimeUpdate).toHaveBeenCalledWith('0.2.12')
  })

  it('sends nothing when the confirm step is cancelled', () => {
    openUpdateView(fakeStore(reportWith(runtimeEntry())), COPY.zh)

    startButton()?.click()
    const cancel = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
      (b) => b.textContent === COPY.zh.cancel,
    )
    cancel?.click()

    expect(requestRuntimeUpdate).not.toHaveBeenCalled()
    // Back to the armed-off state: the install button is offered again.
    expect(startButton()).not.toBeNull()
  })
})

describe('runtime update source editor', () => {
  const configSource = {
    url: 'https://example.invalid/edge-headless-manifest.json',
    origin: 'config' as const,
    configuredUrl: 'https://example.invalid/edge-headless-manifest.json',
    override: false,
  }
  const editButton = (): HTMLButtonElement | null =>
    document.querySelector<HTMLButtonElement>('[data-runtime-source-edit]')
  const sourceInput = (): HTMLInputElement | null =>
    document.querySelector<HTMLInputElement>('[data-runtime-source-input]')

  it('shows the source URL in effect with its origin tag', () => {
    openUpdateView(fakeStore(reportWith(runtimeEntry(), true, configSource)), COPY.zh)

    const facts = factsText()
    expect(facts).toContain('更新源')
    expect(facts).toContain(configSource.url)
    expect(facts).toContain('默认配置')
    // The other fact rows still render — the source row is additive.
    expect(facts).toContain('0.2.12')
  })

  it('labels a user override as 自定义', () => {
    const overrideSource = {
      ...configSource,
      url: 'https://staging.example.invalid/manifest.json',
      origin: 'override' as const,
      override: true,
    }
    openUpdateView(fakeStore(reportWith(runtimeEntry(), true, overrideSource)), COPY.zh)

    expect(factsText()).toContain('自定义')
    expect(factsText()).toContain(overrideSource.url)
  })

  it('offers no editor when the server sends no source (older hq-edge)', () => {
    openUpdateView(fakeStore(reportWith(runtimeEntry())), COPY.zh)
    expect(editButton()).toBeNull()
  })

  it('prefills the field with the URL in effect and saves the edit', async () => {
    openUpdateView(fakeStore(reportWith(runtimeEntry(), true, configSource)), COPY.zh)

    editButton()?.click()
    expect(sourceInput()?.value).toBe(configSource.url)

    const input = sourceInput()
    if (input === null) throw new Error('source input missing')
    input.value = 'https://staging.example.invalid/manifest.json'
    input.dispatchEvent(new Event('input', { bubbles: true }))

    document.querySelector<HTMLButtonElement>('[data-runtime-source-save]')?.click()
    await vi.waitFor(() =>
      expect(setRuntimeUpdateSource).toHaveBeenCalledWith(
        'https://staging.example.invalid/manifest.json',
      ),
    )
    // The cached report still named the OLD manifest's offer, so a save must
    // re-run discovery — otherwise the facts and the update button would lie.
    await vi.waitFor(() => expect(checkUpdates).toHaveBeenCalled())
    // Editor closes on success.
    expect(sourceInput()).toBeNull()
  })

  it('offers reset only while an override shadows the configured URL', async () => {
    const overrideSource = {
      ...configSource,
      url: 'https://staging.example.invalid/manifest.json',
      origin: 'override' as const,
      override: true,
    }
    openUpdateView(fakeStore(reportWith(runtimeEntry(), true, overrideSource)), COPY.zh)

    editButton()?.click()
    document.querySelector<HTMLButtonElement>('[data-runtime-source-reset]')?.click()
    // Clearing the override is a POST with an empty URL.
    await vi.waitFor(() => expect(setRuntimeUpdateSource).toHaveBeenCalledWith(''))

    document.body.innerHTML = ''
    setRuntimeUpdateSource.mockClear()
    openUpdateView(fakeStore(reportWith(runtimeEntry(), true, configSource)), COPY.zh)
    editButton()?.click()
    expect(document.querySelector('[data-runtime-source-reset]')).toBeNull()
  })

  it('keeps the editor open and reports the reason when a save is refused', async () => {
    setRuntimeUpdateSource.mockRejectedValueOnce(
      new Error('http:// is only accepted for a loopback host (localhost / 127.0.0.1)'),
    )
    openUpdateView(fakeStore(reportWith(runtimeEntry(), true, configSource)), COPY.zh)

    editButton()?.click()
    const input = sourceInput()
    if (input === null) throw new Error('source input missing')
    input.value = 'http://evil.example.invalid/manifest.json'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    document.querySelector<HTMLButtonElement>('[data-runtime-source-save]')?.click()

    // hq-edge's 422 message is shown verbatim, and the user is dropped back
    // into the field to fix the URL rather than losing the draft.
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain(
        'http:// is only accepted for a loopback host (localhost / 127.0.0.1)',
      )
    })
    expect(sourceInput()).not.toBeNull()
    expect(sourceInput()?.value).toBe('http://evil.example.invalid/manifest.json')
    // A refused save must not trigger discovery against a URL that was never set.
    expect(checkUpdates).not.toHaveBeenCalled()
  })

  it('cancel discards the draft without saving', () => {
    openUpdateView(fakeStore(reportWith(runtimeEntry(), true, configSource)), COPY.zh)

    editButton()?.click()
    const input = sourceInput()
    if (input === null) throw new Error('source input missing')
    input.value = 'https://never-saved.example.invalid/manifest.json'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    document.querySelector<HTMLButtonElement>('[data-runtime-source-cancel]')?.click()

    expect(sourceInput()).toBeNull()
    expect(setRuntimeUpdateSource).not.toHaveBeenCalled()
    // Back to read mode with the URL in effect untouched.
    expect(factsText()).toContain(configSource.url)
  })
})

describe('plugin update source editor', () => {
  const pluginConfigSource = {
    url: 'https://gitee.com/huaqiu-electronics/dsh-pcb-eda/raw/main/plugins-release-manifest.json',
    origin: 'config' as const,
    configuredUrl: 'https://gitee.com/huaqiu-electronics/dsh-pcb-eda/raw/main/plugins-release-manifest.json',
    override: false,
  }
  const pluginEditButton = (): HTMLButtonElement | null =>
    document.querySelector<HTMLButtonElement>('[data-plugin-source-edit]')
  const pluginInput = (): HTMLInputElement | null =>
    document.querySelector<HTMLInputElement>('[data-plugin-source-input]')
  const runtimeInput = (): HTMLInputElement | null =>
    document.querySelector<HTMLInputElement>('[data-runtime-source-input]')
  const reportWithPlugin = (
    pluginSource: unknown,
    runtimeSource?: unknown,
  ): PluginUpdateReport =>
    reportWith(runtimeEntry(), true, runtimeSource, pluginSource)

  it('renders the plugin source group with the URL in effect and its origin', () => {
    openUpdateView(fakeStore(reportWithPlugin(pluginConfigSource)), COPY.zh)

    const group = document.querySelector('[data-group="plugin-source"]')
    expect(group).not.toBeNull()
    expect(group?.textContent).toContain('插件更新源')
    expect(group?.textContent).toContain(pluginConfigSource.url)
    expect(group?.textContent).toContain('默认配置')
    // The group sits ABOVE the plugin groups, not inside the runtime block.
    const column = document.querySelector('.hqpu-column')
    const kids = [...(column?.children ?? [])].map((n) => n.className)
    expect(kids.indexOf('hqpu-stack')).toBeLessThan(
      kids.lastIndexOf('hqpu-stack'),
    )
  })

  it('renders nothing when the server sends no pluginSource (older hq-edge)', () => {
    openUpdateView(fakeStore(reportWith(runtimeEntry())), COPY.zh)
    expect(document.querySelector('[data-group="plugin-source"]')).toBeNull()
    expect(pluginEditButton()).toBeNull()
  })

  it('prefills with the URL in effect and saves the edit, then re-checks', async () => {
    openUpdateView(fakeStore(reportWithPlugin(pluginConfigSource)), COPY.zh)

    pluginEditButton()?.click()
    expect(pluginInput()?.value).toBe(pluginConfigSource.url)

    const input = pluginInput()
    if (input === null) throw new Error('plugin source input missing')
    input.value = 'https://staging.example.invalid/release-manifest.json'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    document.querySelector<HTMLButtonElement>('[data-plugin-source-save]')?.click()

    await vi.waitFor(() =>
      expect(setPluginUpdateSource).toHaveBeenCalledWith(
        'https://staging.example.invalid/release-manifest.json',
      ),
    )
    // The cached report still named the OLD manifest's offer, so a save must
    // re-run discovery — otherwise the list and the badge would lie.
    await vi.waitFor(() => expect(checkUpdates).toHaveBeenCalled())
    expect(pluginInput()).toBeNull()
  })

  it('offers reset only while an override shadows the configured URL', async () => {
    const overrideSource = {
      ...pluginConfigSource,
      url: 'https://staging.example.invalid/release-manifest.json',
      origin: 'override' as const,
      override: true,
    }
    openUpdateView(fakeStore(reportWithPlugin(overrideSource)), COPY.zh)

    pluginEditButton()?.click()
    document.querySelector<HTMLButtonElement>('[data-plugin-source-reset]')?.click()
    // Clearing the override is a POST with an empty URL.
    await vi.waitFor(() => expect(setPluginUpdateSource).toHaveBeenCalledWith(''))

    document.body.innerHTML = ''
    setPluginUpdateSource.mockClear()
    openUpdateView(fakeStore(reportWithPlugin(pluginConfigSource)), COPY.zh)
    pluginEditButton()?.click()
    expect(document.querySelector('[data-plugin-source-reset]')).toBeNull()
  })

  it('keeps the editor open and reports the reason when a save is refused', async () => {
    setPluginUpdateSource.mockRejectedValueOnce(
      new Error('http:// is only accepted for a loopback host (localhost / 127.0.0.1)'),
    )
    openUpdateView(fakeStore(reportWithPlugin(pluginConfigSource)), COPY.zh)

    pluginEditButton()?.click()
    const input = pluginInput()
    if (input === null) throw new Error('plugin source input missing')
    input.value = 'http://intranet.example/release-manifest.json'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    document.querySelector<HTMLButtonElement>('[data-plugin-source-save]')?.click()

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain(
        'http:// is only accepted for a loopback host (localhost / 127.0.0.1)',
      )
    })
    // Still editing — the user fixes the URL in place, draft intact.
    expect(pluginInput()).not.toBeNull()
    expect(pluginInput()?.value).toBe('http://intranet.example/release-manifest.json')
    // A refused save must not trigger discovery against a URL that was never set.
    expect(checkUpdates).not.toHaveBeenCalled()
  })

  it('cancel discards the plugin draft without saving', () => {
    openUpdateView(fakeStore(reportWithPlugin(pluginConfigSource)), COPY.zh)

    pluginEditButton()?.click()
    const input = pluginInput()
    if (input === null) throw new Error('plugin source input missing')
    input.value = 'https://never-saved.example.invalid/release-manifest.json'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    document.querySelector<HTMLButtonElement>('[data-plugin-source-cancel]')?.click()

    expect(pluginInput()).toBeNull()
    expect(setPluginUpdateSource).not.toHaveBeenCalled()
    expect(
      document.querySelector('[data-group="plugin-source"]')?.textContent,
    ).toContain(pluginConfigSource.url)
  })

  it('the two editors keep independent state', () => {
    openUpdateView(
      fakeStore(reportWith(runtimeEntry(), true, {
        url: 'https://example.invalid/edge-headless-manifest.json',
        origin: 'config' as const,
        configuredUrl: 'https://example.invalid/edge-headless-manifest.json',
        override: false,
      }, pluginConfigSource)),
      COPY.zh,
    )

    // Open the runtime editor only: the plugin editor must stay in read mode.
    document.querySelector<HTMLButtonElement>('[data-runtime-source-edit]')?.click()
    expect(runtimeInput()).not.toBeNull()
    expect(pluginInput()).toBeNull()

    document.querySelector<HTMLButtonElement>('[data-runtime-source-cancel]')?.click()
    pluginEditButton()?.click()
    expect(pluginInput()).not.toBeNull()
    expect(runtimeInput()).toBeNull()
  })
})

// ── Version direction gate (the reported corner case) ───────────────────────
//
// The panel once rendered `analytics 可更新 0.6.4 → 0.6.2` with a live 安装
// button for the whole 16-plugin set: the manifest published 0.6.2 while the
// active bundle already held 0.6.4. "Update available" must exist only when
// the remote SemVer is strictly greater than the local one — an older
// hq-edge still reports the wrong state, so every report is normalized at
// the fetch boundary (fetchReport/checkUpdates) before it reaches the view.
describe('plugin item version direction (UI)', () => {
  const analyticsCard = (): HTMLElement | null =>
    document.querySelector<HTMLElement>('.hqpu-card[data-plugin-name="@huaqiu/dsh-analytics"]')

  function item(overrides: Partial<PluginUpdateItem>): PluginUpdateItem {
    return {
      name: '@huaqiu/dsh-analytics',
      currentVersion: null,
      availableVersion: '0.6.4',
      state: 'install',
      ...overrides,
    }
  }

  function reportWithItems(items: PluginUpdateItem[]): PluginUpdateReport {
    return normalizePluginUpdateReport({
      ...reportWith(runtimeEntry()),
      items,
    })
  }

  it('a lagging manifest offer is not 可更新 and carries no install button', () => {
    // Exactly what the shell reported: installed 0.6.4, manifest 0.6.2.
    const raw = item({ currentVersion: '0.6.4', availableVersion: '0.6.2', state: 'update' })
    openUpdateView(fakeStore(reportWithItems([raw])), COPY.zh)

    const card = analyticsCard()
    expect(card).not.toBeNull()
    expect(card?.dataset.state).toBe('current')
    // Reads as up-to-date, not as an update.
    expect(card?.querySelector('.hqpu-tag')?.textContent).toBe(COPY.zh.state.current)
    expect(card?.textContent).toContain('0.6.4')
    // No install control anywhere on the card.
    expect(card?.querySelector('button')).toBeNull()
    // It lands in the settled group, not in 待处理.
    const groups = [...document.querySelectorAll<HTMLElement>('.hqpu-group')]
    const inActionable = groups.some(
      (g) => g.dataset.group === COPY.zh.group.actionable && g.contains(card as Node),
    )
    expect(inActionable).toBe(false)
    const inCurrent = groups.some(
      (g) => g.dataset.group === COPY.zh.group.current && g.contains(card as Node),
    )
    expect(inCurrent).toBe(true)
    // And the footer agrees: nothing to install at all.
    expect(document.body.textContent).toContain(COPY.zh.nothingToInstall)
  })

  it('a genuinely newer remote version stays 可更新 with its install button', () => {
    const raw = item({ currentVersion: '0.6.2', availableVersion: '0.6.4', state: 'update' })
    openUpdateView(fakeStore(reportWithItems([raw])), COPY.zh)

    const card = analyticsCard()
    expect(card?.dataset.state).toBe('update')
    expect(card?.querySelector('.hqpu-tag')?.textContent).toBe(COPY.zh.state.update)
    expect(card?.textContent).toContain('0.6.2 → 0.6.4')
    expect(card?.querySelector('button')?.textContent).toContain(COPY.zh.installOne)
    const groups = [...document.querySelectorAll<HTMLElement>('.hqpu-group')]
    expect(
      groups.some((g) => g.dataset.group === COPY.zh.group.actionable && g.contains(card as Node)),
    ).toBe(true)
  })

  it('the reported 16-plugin lagging manifest leaves nothing actionable', () => {
    // analytics, artifacts, auth, … — 16 plugins at 0.6.4 against a 0.6.2
    // manifest: every card demoted, badge and footer both at zero.
    const names = [
      'analytics',
      'artifacts',
      'auth',
      'eda-host',
      'eda-selection',
      'huaqiu-about',
      'kicad',
      'kicad-drc',
      'tool-part-search',
      'tool-pcb-viewer',
      'tool-plugin-update',
      'tool-quote',
      'tool-symbol-footprint',
      'ui-theme-huaqiu',
      'dsh-plugin-log',
      'dsh-sidebar-entry',
    ]
    openUpdateView(
      fakeStore(
        reportWithItems(
          names.map((name) =>
            item({
              name: `@huaqiu/dsh-${name}`,
              currentVersion: '0.6.4',
              availableVersion: '0.6.2',
              state: 'update',
            }),
          ),
        ),
      ),
      COPY.zh,
    )

    const cards = [...document.querySelectorAll<HTMLElement>('.hqpu-card')]
    expect(cards).toHaveLength(16)
    expect(cards.every((c) => c.dataset.state === 'current')).toBe(true)
    // No install button anywhere, in any group.
    expect(document.querySelector('.hqpu-cards button')).toBeNull()
    expect(document.body.textContent).toContain(COPY.zh.nothingToInstall)
  })

  it('keeps a mixed report honest: only the genuine upgrade is actionable', () => {
    openUpdateView(
      fakeStore(
        reportWithItems([
          item({ currentVersion: '0.6.4', availableVersion: '0.6.2', state: 'update' }), // lagging
          item({
            name: '@huaqiu/dsh-kicad',
            currentVersion: '0.6.1',
            availableVersion: '0.6.2',
            state: 'update',
          }), // genuine
          item({ name: '@huaqiu/dsh-auth', currentVersion: null, availableVersion: '0.6.2' }), // absent
        ]),
      ),
      COPY.zh,
    )

    expect(analyticsCard()?.dataset.state).toBe('current')
    expect(
      document.querySelector<HTMLElement>('.hqpu-card[data-plugin-name="@huaqiu/dsh-kicad"]')
        ?.dataset.state,
    ).toBe('update')
    expect(
      document.querySelector<HTMLElement>('.hqpu-card[data-plugin-name="@huaqiu/dsh-auth"]')
        ?.dataset.state,
    ).toBe('install')
    // Footer offers exactly the two actionable installs.
    expect(document.body.textContent).toContain(COPY.zh.installAll(2))
  })
})
