/**
 * SemVer direction gate for plugin-update reports (browser half).
 *
 * The rule under guard, for EVERY plugin in the report: "update available"
 * (and any install control) exists only when the version offered by the
 * remote release manifest is strictly GREATER than the locally installed
 * one. The corner case this file pins is the one the panel once showed:
 *
 *   analytics  可更新  0.6.4 → 0.6.2  [安装]
 *
 * — a manifest that LAGS behind the installed bundle, offered as an update
 * with a live install button. An older hq-edge still reports that state
 * (its rule was string inequality, not SemVer direction), so the client
 * normalizes every report at the fetch boundary and the badge + panel can
 * never disagree.
 */
import { describe, expect, it } from 'vitest'
import {
  compareSemver,
  isVersionUpgrade,
  normalizePluginUpdateItem,
  normalizePluginUpdateReport,
} from '../src/client/version.js'
import type { PluginUpdateItem, PluginUpdateReport } from '../src/client/api.js'

function item(overrides: Partial<PluginUpdateItem> = {}): PluginUpdateItem {
  return {
    name: '@huaqiu/dsh-analytics',
    currentVersion: '0.6.4',
    availableVersion: '0.6.2',
    state: 'update',
    ...overrides,
  }
}

function report(items: PluginUpdateItem[]): PluginUpdateReport {
  return {
    manifestVersion: '0.6.2',
    items,
    actionableCount: items.filter((i) => i.state === 'update' || i.state === 'install').length,
    ignoredSet: false,
    runtime: {
      configured: false,
      currentVersion: null,
      latest: null,
      updateAvailable: false,
      checkedAt: null,
      lastError: null,
    },
  }
}

describe('compareSemver', () => {
  it('orders releases numerically per field', () => {
    expect(compareSemver('0.6.2', '0.6.4')).toBeLessThan(0)
    expect(compareSemver('0.6.4', '0.6.2')).toBeGreaterThan(0)
    expect(compareSemver('0.6.4', '0.6.4')).toBe(0)
    expect(compareSemver('0.10.0', '0.9.9')).toBeGreaterThan(0)
    expect(compareSemver('1.0.0', '0.99.99')).toBeGreaterThan(0)
  })

  it('ranks a prerelease below its release', () => {
    expect(compareSemver('0.6.5-rc.1', '0.6.5')).toBeLessThan(0)
    expect(compareSemver('0.6.5', '0.6.5-rc.1')).toBeGreaterThan(0)
  })

  it('orders prerelease identifiers per SemVer §11', () => {
    expect(compareSemver('0.6.5-alpha', '0.6.5-beta')).toBeLessThan(0)
    expect(compareSemver('0.6.5-alpha.1', '0.6.5-alpha.beta')).toBeLessThan(0)
    // Numeric identifiers rank below alphanumeric ones.
    expect(compareSemver('0.6.5-1', '0.6.5-alpha')).toBeLessThan(0)
    expect(compareSemver('0.6.5-rc.2', '0.6.5-rc.11')).toBeLessThan(0)
    // A larger set of identifiers ranks higher when the shared ones are equal.
    expect(compareSemver('0.6.5-rc.1', '0.6.5-rc.1.1')).toBeLessThan(0)
  })

  it('ignores build metadata in precedence', () => {
    expect(compareSemver('0.6.4+build.1', '0.6.4')).toBe(0)
    expect(compareSemver('0.6.4', '0.6.4+other')).toBe(0)
  })

  it('returns null when either side is not SemVer (fail closed)', () => {
    expect(compareSemver('dev', '0.6.4')).toBeNull()
    expect(compareSemver('0.6.4', 'latest')).toBeNull()
    expect(compareSemver('v1', '1.0.0')).toBeNull()
    expect(compareSemver('1.0', '1.0.0')).toBeNull()
    expect(compareSemver('01.2.3', '1.2.3')).toBeNull()
    expect(compareSemver('', '0.6.4')).toBeNull()
  })
})

describe('isVersionUpgrade', () => {
  it('an absent plugin is installable without any comparison', () => {
    expect(isVersionUpgrade(null, '0.6.2')).toBe(true)
    expect(isVersionUpgrade(null, 'dev')).toBe(true)
  })

  it('a strictly greater remote version is an upgrade', () => {
    expect(isVersionUpgrade('0.6.2', '0.6.4')).toBe(true)
    expect(isVersionUpgrade('0.6.4', '0.7.0')).toBe(true)
    expect(isVersionUpgrade('0.6.4', '0.6.5-rc.1')).toBe(true)
  })

  it('an equal or older remote version is not an upgrade', () => {
    expect(isVersionUpgrade('0.6.4', '0.6.4')).toBe(false)
    expect(isVersionUpgrade('0.6.4', '0.6.2')).toBe(false)
    expect(isVersionUpgrade('0.6.4', '0.5.99')).toBe(false)
    // A prerelease is never "greater" than its own release.
    expect(isVersionUpgrade('0.6.5', '0.6.5-rc.1')).toBe(false)
  })

  it('an unprovable direction fails closed', () => {
    expect(isVersionUpgrade('dev', '0.6.4')).toBe(false)
    expect(isVersionUpgrade('0.6.4', 'nightly')).toBe(false)
  })
})

describe('normalizePluginUpdateItem', () => {
  it('demotes a server-reported update that is not strictly newer', () => {
    expect(normalizePluginUpdateItem(item()).state).toBe('current')
    expect(normalizePluginUpdateItem(item({ currentVersion: '0.6.4', availableVersion: '0.6.4' })).state).toBe(
      'current',
    )
  })

  it('keeps a genuine upgrade offer', () => {
    const genuine = item({ currentVersion: '0.6.2', availableVersion: '0.6.4' })
    expect(normalizePluginUpdateItem(genuine).state).toBe('update')
  })

  it('leaves every other state untouched', () => {
    for (const state of ['install', 'blocked', 'ignored', 'current'] as const) {
      expect(normalizePluginUpdateItem(item({ state })).state).toBe(state)
    }
    // An absent plugin stays installable even against a non-SemVer offer.
    expect(
      normalizePluginUpdateItem(item({ currentVersion: null, availableVersion: 'dev', state: 'install' }))
        .state,
    ).toBe('install')
  })

  it('preserves unknown server fields (thin adapter)', () => {
    const extra = { ...item(), requiresHqEdge: true, reasons: ['x'] }
    expect(normalizePluginUpdateItem(extra)).toMatchObject({
      state: 'current',
      requiresHqEdge: true,
      reasons: ['x'],
    })
  })
})

describe('normalizePluginUpdateReport', () => {
  it('recomputes actionableCount from the corrected states', () => {
    const normalized = normalizePluginUpdateReport(
      report([
        item({ currentVersion: '0.6.4', availableVersion: '0.6.2' }), // older → demoted
        item({ name: '@huaqiu/dsh-kicad', currentVersion: '0.6.2', availableVersion: '0.6.4' }), // upgrade
        item({ name: '@huaqiu/dsh-auth', currentVersion: null, availableVersion: '0.6.4', state: 'install' }),
        item({ name: '@huaqiu/dsh-quote', currentVersion: '0.6.4', availableVersion: '0.6.2', state: 'blocked' }),
      ]),
    )
    expect(normalized.items.map((i) => i.state)).toEqual(['current', 'update', 'install', 'blocked'])
    expect(normalized.actionableCount).toBe(2)
    // The set identity and runtime block ride through unchanged.
    expect(normalized.manifestVersion).toBe('0.6.2')
    expect(normalized.runtime.configured).toBe(false)
  })

  it('turns an all-lagging manifest into an empty offer', () => {
    // The reported corner case: 16 plugins, every one at 0.6.4 with the
    // manifest behind at 0.6.2 — nothing is actionable, nothing installable.
    const items = Array.from({ length: 16 }, (_, index) =>
      item({ name: `@huaqiu/dsh-plugin-${index}` }),
    )
    const normalized = normalizePluginUpdateReport(report(items))
    expect(normalized.items.every((i) => i.state === 'current')).toBe(true)
    expect(normalized.actionableCount).toBe(0)
  })

  it('survives a degenerate report shape', () => {
    const shell = { ...report([]), items: undefined } as unknown as PluginUpdateReport
    expect(normalizePluginUpdateReport(shell)).toBe(shell)
  })
})
