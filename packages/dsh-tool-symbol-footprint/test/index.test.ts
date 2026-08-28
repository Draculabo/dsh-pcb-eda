import { describe, expect, it } from 'vitest'
import { apply, inject, name } from '../src/index.js'
import * as client from '../src/client/index.js'

describe('@huaqiu/dsh-tool-symbol-footprint skeleton', () => {
  it('exposes the expected node plugin shape', () => {
    expect(name).toBe('@huaqiu/dsh-tool-symbol-footprint')
    expect(inject).toEqual(['tools'])
    expect(typeof apply).toBe('function')
  })

  it('registers the probe tool', () => {
    const registered: unknown[] = []
    apply({ tools: { register: (d: unknown) => (registered.push(d), () => undefined) } } as never)
    expect((registered[0] as { name: string }).name).toBe('huaqiu_phase0_probe')
  })

  it('client stub exports the DSH client-module shape', () => {
    expect(client.inject).toContain('@deepseek-ai/dsh-client-runtime')
    expect(typeof client.apply).toBe('function')
  })
})
