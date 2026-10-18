// @vitest-environment jsdom
/**
 * DOM tests for the HQ Edge runtime facts block in the update review panel.
 *
 * Regression guard for the "[object Object]" latest-version row: hq-edge sends
 * `runtime.latest` as a full release ENTRY (`{ version, hash, platform, … }`),
 * not a bare string. The client type once claimed `string`, and rendering the
 * entry straight into a text node stringified it. The row must name a version.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { runtimeLatestVersion, type PluginUpdateReport } from '../src/client/api.js'
import { COPY } from '../src/client/copy.js'
import { openUpdateView, type UpdateStoreLike } from '../src/client/update-view.js'

// The view calls the API directly, so stub the one call the runtime button
// makes. Everything else (facts rows, install bar) is exercised for real.
const { requestRuntimeUpdate } = vi.hoisted(() => ({
  requestRuntimeUpdate: vi.fn(async (_v: string) => ({
    requestId: 'req-1',
    targetVersion: '0.2.12',
    state: 'accepted',
  })),
}))
vi.mock('../src/client/api.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/client/api.js')>()
  return { ...actual, requestRuntimeUpdate }
})

function runtimeEntry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: '0.2.12',
    hash: 'a'.repeat(128),
    platform: 'win',
    arch: 'x64',
    url: 'https://example.invalid/edge-headless-0.2.12-win-x64.zip',
    ...overrides,
  }
}

function reportWith(latest: unknown, updateAvailable = true): PluginUpdateReport {
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
    },
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
