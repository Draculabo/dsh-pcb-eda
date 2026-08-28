import { describe, expect, it } from 'vitest'
import { apply, inject, name } from '../src/index.js'

describe('@huaqiu/dsh-tool-part-search skeleton', () => {
  it('exposes the expected plugin shape', () => {
    expect(name).toBe('@huaqiu/dsh-tool-part-search')
    expect(inject).toEqual(['tools'])
    expect(typeof apply).toBe('function')
  })

  it('registers the probe tool via ctx.tools.register', () => {
    const registered: unknown[] = []
    const ctx = {
      tools: {
        register: (def: unknown) => {
          registered.push(def)
          return () => undefined
        },
      },
    }
    apply(ctx as never)
    expect(registered).toHaveLength(1)
    const tool = registered[0] as { name: string }
    expect(tool.name).toBe('huaqiu_phase0_probe')
  })

  it('does not reference @hqedge anywhere', async () => {
    const source = await import('node:fs/promises').then((fs) => fs.readFile(new URL('../src/index.ts', import.meta.url), 'utf8'))
    expect(source).not.toContain('@hqedge')
  })
})
