/**
 * Tests for `scripts/utils/manifest-validation.mjs` — the pure validation
 * shared by the pre-publish gate. Covers the schema rules that protect HQ
 * Edge's remote plugin discovery from a drifting release manifest.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { isValidSemverRange, validateReleaseManifest } from '../utils/manifest-validation.mjs'

const validPlugin = (name = '@huaqiu/dsh-kicad', overrides = {}) => ({
  name,
  version: '0.5.21',
  ...overrides,
})

const validManifest = (plugins = { '@huaqiu/dsh-kicad': {
  version: '0.5.21',
  hosts: ['kicad'],
  requiresHqEdge: false,
  minHqEdge: null,
  maxHqEdge: null,
  minDsh: null,
} }) => ({
  schemaVersion: 1,
  pluginSetVersion: '0.5.21',
  plugins,
})

const ctx = (plugins = [validPlugin()], injects = new Map([['@huaqiu/dsh-kicad', ['skills', 'tools']]])) => ({
  dshPlugins: plugins,
  pluginEntryInjects: (pkg) => injects.get(pkg.name) ?? [],
})

describe('isValidSemverRange', () => {
  it('accepts exact, caret, tilde, comparator chains and any', () => {
    for (const good of ['0.5.21', '^0.5.21', '~0.5.21', '>=0.2.0', '>=0.2.0 <0.4.0', '>=0.2.0 <0.4.0 || ^1.0.0', '*', '>=0', '0.5', '0.1.7-rc.2', '^0.1.7-rc.2']) {
      assert.equal(isValidSemverRange(good), true, `expected ${good} to be valid`)
    }
  })

  it('rejects malformed ranges', () => {
    for (const bad of ['', 'abc', '>=', '0.5.21.1', '>=0.2.0 <', 'a.b.c', '1.2.3 ||']) {
      assert.equal(isValidSemverRange(bad), false, `expected ${JSON.stringify(bad)} to be invalid`)
    }
  })

  it('rejects non-string values (null means "no bound", handled by callers)', () => {
    assert.equal(isValidSemverRange(null), false)
    assert.equal(isValidSemverRange(undefined), false)
    assert.equal(isValidSemverRange(5), false)
  })
})

describe('validateReleaseManifest', () => {
  it('accepts a valid manifest', () => {
    const failures = validateReleaseManifest(validManifest(), ctx())
    assert.deepEqual(failures, [])
  })

  it('rejects missing/invalid schemaVersion', () => {
    const failures = validateReleaseManifest({ ...validManifest(), schemaVersion: 2 }, ctx())
    assert.ok(failures.some((f) => f.includes('schemaVersion')))
  })

  it('rejects pluginSetVersion mismatch', () => {
    const failures = validateReleaseManifest({ ...validManifest(), pluginSetVersion: '0.5.22' }, ctx())
    assert.ok(failures.some((f) => f.includes('pluginSetVersion')))
  })

  it('rejects a real plugin missing from the manifest', () => {
    const missing = validPlugin('@huaqiu/dsh-tool-quote')
    const failures = validateReleaseManifest(validManifest(), ctx([validPlugin(), missing]))
    assert.ok(failures.some((f) => f.includes('missing from manifest')))
  })

  it('rejects a utility/app package wrongly listed as a plugin', () => {
    const failures = validateReleaseManifest(
      validManifest({ '@huaqiu/component-gen-server': {
        version: '0.5.21', hosts: ['all'], requiresHqEdge: false, minHqEdge: null, maxHqEdge: null, minDsh: null,
      } }),
      ctx([validPlugin()]),
    )
    assert.ok(failures.some((f) => f.includes('not real DSH plugins')))
  })

  it('rejects version drift from package version and lockstep', () => {
    const manifest = validManifest()
    manifest.plugins['@huaqiu/dsh-kicad'].version = '0.5.22'
    const failures = validateReleaseManifest(manifest, ctx())
    assert.ok(failures.some((f) => f.includes('does not match package version')))
    assert.ok(failures.some((f) => f.includes('must equal pluginSetVersion')))
  })

  it('rejects an invalid hosts enum value', () => {
    const manifest = validManifest()
    manifest.plugins['@huaqiu/dsh-kicad'].hosts = ['kicad', 'atari']
    const failures = validateReleaseManifest(manifest, ctx())
    assert.ok(failures.some((f) => f.includes('invalid host')))
  })

  it('rejects an invalid minHqEdge range', () => {
    const manifest = validManifest()
    manifest.plugins['@huaqiu/dsh-kicad'].minHqEdge = 'not-a-range'
    const failures = validateReleaseManifest(manifest, ctx())
    assert.ok(failures.some((f) => f.includes('minHqEdge is not a valid semver range')))
  })

  it('rejects requiresHqEdge drift from cordis.patch.yml inject', () => {
    const manifest = validManifest()
    manifest.plugins['@huaqiu/dsh-kicad'].requiresHqEdge = true // patch injects skills/tools, not hqEdge
    const failures = validateReleaseManifest(manifest, ctx())
    assert.ok(failures.some((f) => f.includes('requiresHqEdge')))
  })

  it('accepts requiresHqEdge true when inject contains hqEdge', () => {
    const manifest = validManifest({ '@huaqiu/dsh-eda-host': {
      version: '0.5.21', hosts: ['all'], requiresHqEdge: true, minHqEdge: '>=0.2.0', maxHqEdge: null, minDsh: null,
    } })
    const failures = validateReleaseManifest(manifest, ctx([validPlugin('@huaqiu/dsh-eda-host')], new Map([['@huaqiu/dsh-eda-host', ['hqEdge', 'tools']]])))
    assert.deepEqual(failures, [])
  })

  it('rejects a duplicate/unknown package entry', () => {
    const manifest = validManifest()
    manifest.plugins['@huaqiu/does-not-exist'] = {
      version: '0.5.21', hosts: ['all'], requiresHqEdge: false, minHqEdge: null, maxHqEdge: null, minDsh: null,
    }
    const failures = validateReleaseManifest(manifest, ctx())
    assert.ok(failures.some((f) => f.includes('not real DSH plugins')))
  })
})
