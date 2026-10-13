/**
 * The `@schematic-gen` reference source: identity, menu row, codec and the
 * mandatory registration.
 *
 * The codec is not cosmetic — DSH's `serializeReference` rejects a chip whose
 * owner (or codec) is missing and blocks the whole send, so these assertions
 * guard a hard submission failure rather than a cosmetic label.
 */
import { describe, expect, it } from 'vitest'
import {
  SCHEMATIC_GEN_CLIPBOARD,
  SCHEMATIC_GEN_DESCRIPTION,
  SCHEMATIC_GEN_LABEL,
  SCHEMATIC_GEN_ORDER,
  SCHEMATIC_GEN_REF,
  SCHEMATIC_GEN_SERIALIZED,
  SCHEMATIC_GEN_SOURCE,
  SCHEMATIC_GEN_TRIGGER,
  createSchematicGenSource,
  registerSchematicGenSource,
  schematicGenInsert,
} from '../src/client/schematic-ref.js'

describe('schematic-gen reference identity', () => {
  it('binds to @ under a unique source name', () => {
    const source = createSchematicGenSource()
    expect(source.trigger).toBe('@')
    expect(source.name).toBe('schematic-gen')
    expect(SCHEMATIC_GEN_TRIGGER).toBe('@')
    expect(SCHEMATIC_GEN_SOURCE).toBe('schematic-gen')
    expect(SCHEMATIC_GEN_ORDER).toBe(10)
  })

  it('offers one candidate named "Generate schematic" with a description', async () => {
    const source = createSchematicGenSource()
    const candidates = await source.candidates()
    expect(candidates).toEqual([
      { name: SCHEMATIC_GEN_LABEL, description: SCHEMATIC_GEN_DESCRIPTION },
    ])
    expect(SCHEMATIC_GEN_LABEL).toBe('Generate schematic')
  })

  it('merges extra candidates ahead of the built-in row', async () => {
    const source = createSchematicGenSource([{ name: 'extra' }])
    expect((await source.candidates()).map(c => c.name)).toEqual(['extra', SCHEMATIC_GEN_LABEL])
  })

  it('pick and button-click produce the same insert payload', () => {
    expect(createSchematicGenSource().onPick()).toEqual({ insert: schematicGenInsert() })
    expect(schematicGenInsert()).toEqual({
      source: SCHEMATIC_GEN_SOURCE,
      ref: SCHEMATIC_GEN_REF,
      label: SCHEMATIC_GEN_LABEL,
      clipboardText: SCHEMATIC_GEN_CLIPBOARD,
    })
  })

  it('leaves appearance undefined so the chip renders the standard @ marker', () => {
    expect(schematicGenInsert().appearance).toBeUndefined()
  })
})

describe('schematic-gen codec', () => {
  it('round-trips the clipboard projection', () => {
    const codec = createSchematicGenSource().codec
    expect(codec.clipboardText(SCHEMATIC_GEN_REF)).toBe(SCHEMATIC_GEN_CLIPBOARD)
    expect(SCHEMATIC_GEN_CLIPBOARD).toBe('@schematic-gen')
  })

  it('serializes explicit tool intent, never a fabricated description', async () => {
    const codec = createSchematicGenSource().codec
    const text = await codec.serialize(SCHEMATIC_GEN_REF, new AbortController().signal)

    expect(text).toBe(SCHEMATIC_GEN_SERIALIZED)
    // Must name both generation tools and forbid hand-writing KiCad content.
    expect(text).toContain('generate_schematic_from_description')
    expect(text).toContain('generate_system_module_graph')
    expect(text).toContain('.kicad_sch')
    // Must not invent requirements, and must not fire merely on load.
    expect(text).toContain("Use the user's own words")
    expect(text.toLowerCase()).not.toContain('generate now')
  })
})

describe('registerSchematicGenSource', () => {
  it('registers and returns the registry disposer', () => {
    let registered: unknown
    let disposed = 0
    const dispose = registerSchematicGenSource({
      registerSource: (src: unknown) => { registered = src; return () => { disposed += 1 } },
    })
    expect((registered as { name: string }).name).toBe(SCHEMATIC_GEN_SOURCE)
    dispose()
    expect(disposed).toBe(1)
  })

  it('degrades to a no-op disposer when the service is absent', () => {
    for (const registry of [undefined, null, {}, { registerSource: 'nope' }]) {
      const dispose = registerSchematicGenSource(registry)
      expect(typeof dispose).toBe('function')
      expect(() => dispose()).not.toThrow()
    }
  })

  it('swallows a duplicate registration instead of breaking the client half', () => {
    const dispose = registerSchematicGenSource({
      registerSource: () => { throw new Error('slash source "@schematic-gen" is already registered') },
    })
    expect(() => dispose()).not.toThrow()
  })

  it('tolerates a registry whose disposer is not a function', () => {
    const dispose = registerSchematicGenSource({ registerSource: () => undefined as never })
    expect(() => dispose()).not.toThrow()
  })
})
