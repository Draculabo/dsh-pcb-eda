import { describe, expect, it } from 'vitest'
import { apply, inject, name } from '../src/index.js'

describe('@huaqiu/dsh-tool-part-search plugin', () => {
  it('exposes the expected plugin shape', () => {
    expect(name).toBe('@huaqiu/dsh-tool-part-search')
    expect(inject).toEqual(['tools'])
    expect(typeof apply).toBe('function')
  })

  it('registers the four part-search tools via ctx.tools.register', () => {
    const registered: unknown[] = []
    const ctx = {
      tools: {
        register: (def: unknown) => {
          registered.push(def)
          return () => undefined
        },
      },
    }
    const dispose = apply(ctx as never)
    expect(registered).toHaveLength(4)
    const names = registered.map((t) => (t as { name: string }).name)
    expect(names).toEqual([
      'search_hqsch_parts',
      'get_hqsch_part',
      'get_hqsch_part_models',
      'get_hqsch_supply_chain',
    ])
    // disposer is a function (tool unregistration path)
    expect(typeof dispose).toBe('function')
  })

  it('throws loudly when the tools service is missing', () => {
    expect(() => apply({} as never)).toThrow(/requires the DSH/)
  })

  it('has no @hqedge dependency other than the published @hqedge/logging', async () => {
    const fs = await import('node:fs/promises')
    const [source, manifest] = await Promise.all([
      fs.readFile(new URL('../src/index.ts', import.meta.url), 'utf8'),
      fs.readFile(new URL('../package.json', import.meta.url), 'utf8'),
    ])
    // No import from @hqedge anywhere in the plugin source, except the
    // published @hqedge/logging (all other hq-edge internals must stay out).
    expect(source).not.toMatch(/from\s+['"]@hqedge\/(?!logging)/)
    expect(source).not.toMatch(/import\s*\(['"]@hqedge\/(?!logging)/)
    // No @hqedge package in any dependency section of the manifest, except
    // @hqedge/logging itself.
    const deps = {
      ...JSON.parse(manifest).dependencies,
      ...JSON.parse(manifest).peerDependencies,
      ...JSON.parse(manifest).devDependencies,
    }
    expect(Object.keys(deps).some((k) => k.startsWith('@hqedge') && k !== '@hqedge/logging')).toBe(false)
  })
})
