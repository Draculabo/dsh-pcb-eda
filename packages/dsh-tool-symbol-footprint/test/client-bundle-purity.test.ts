/**
 * Client-bundle purity gate — the build-time mirror of the DSH runtime error
 * "require(\"...\") missed the module table".
 *
 * The DSH client module system answers a bundle's synchronous `require` with
 * exactly three sources: the platform seed table, an already-materialized
 * module, or a factory registered by another boot-graph row. Anything else
 * throws at plugin init in the browser. tsdown externalizes workspace/peer
 * dependencies by default, so every plain library subpath pulled into the
 * client half MUST be covered by an `alwaysBundle` pattern in
 * `tsdown.config.ts` — this test fails the build when one leaks through as an
 * external require (regression: `@huaqiu/dsh-artifacts/placement`).
 *
 * @module
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/** Specifiers the DSH platform seed table supplies to every client bundle. */
const PLATFORM_SEEDS = new Set(['react', 'react-dom', 'react/jsx-runtime'])

describe('client bundle purity', () => {
  const bundlePath = join(__dirname, '..', 'lib', 'client.js')

  it('externalizes only platform seed words', () => {
    let source: string
    try {
      source = readFileSync(bundlePath, 'utf8')
    } catch {
      throw new Error(
        `missing ${bundlePath} — run "npx tsdown" before the test suite (the purity gate inspects the built bundle)`,
      )
    }
    const requires = [...source.matchAll(/require\("([^"]+)"\)/g)].map((m) => m[1])
    expect(requires.length).toBeGreaterThan(0)
    const offenders = [...new Set(requires)].filter((spec) => !PLATFORM_SEEDS.has(spec))
    expect(
      offenders,
      'external requires outside the platform seed table will throw "missed the module table" ' +
        'at plugin init — add them to `alwaysBundle` in tsdown.config.ts (they are plain libraries, not DSH client plugins)',
    ).toEqual([])
  })

  it('inlines the shared browser-safe placement module', () => {
    const source = readFileSync(bundlePath, 'utf8')
    // The placement subpath must be bundled, not required: assert its
    // distinctive export leaked into the bundle body.
    expect(source).toContain('getEditorType') // placement.ts property, survives minification
    expect(source).not.toContain('require("@huaqiu/dsh-artifacts/placement")')
  })
})
