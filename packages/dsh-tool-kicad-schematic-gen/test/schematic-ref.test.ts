/**
 * The `@schematic-gen` reference source (migrated from the retired
 * `@huaqiu/dsh-tool-schematic-gen` plugin): identity, menu row, codec and the
 * mandatory registration.
 *
 * The codec is not cosmetic — DSH's `serializeReference` rejects a chip whose
 * owner (or codec) is missing and blocks the whole send, so these assertions
 * guard a hard submission failure rather than a cosmetic label. The migrated
 * chip pins the `kicad-schematic-design` skill instead of the deleted online
 * tools; the serialized-text tests pin that contract.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
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
  schematicGenDescription,
  schematicGenInsert,
  schematicGenLabel,
} from '../src/client/schematic-ref.ts'

test('binds to @ under a unique source name', () => {
  const source = createSchematicGenSource()
  assert.equal(source.trigger, '@')
  assert.equal(source.name, 'schematic-gen')
  assert.equal(SCHEMATIC_GEN_TRIGGER, '@')
  assert.equal(SCHEMATIC_GEN_SOURCE, 'schematic-gen')
  assert.equal(SCHEMATIC_GEN_ORDER, 10)
})

test('offers one candidate named "Generate schematic" with a description', async () => {
  // No host locale (node env, no <html lang>) → zh fallback.
  const source = createSchematicGenSource([], () => undefined)
  const candidates = await source.candidates()
  assert.deepEqual(candidates, [
    { name: schematicGenLabel(undefined), description: schematicGenDescription(undefined) },
  ])
  assert.equal(SCHEMATIC_GEN_LABEL, 'Generate schematic')
})

test('localizes the candidate row against the host language', async () => {
  const zh = createSchematicGenSource([], () => 'zh')
  assert.deepEqual(await zh.candidates(), [
    { name: '生成原理图', description: '根据描述生成 KiCad 原理图' },
  ])

  const en = createSchematicGenSource([], () => 'en')
  assert.deepEqual(await en.candidates(), [
    { name: 'Generate schematic', description: SCHEMATIC_GEN_DESCRIPTION },
  ])
})

test('re-reads the language on every candidates() call, so a preference change lands', async () => {
  let lang: 'zh' | 'en' = 'en'
  const source = createSchematicGenSource([], () => lang)
  assert.equal((await source.candidates())[0].name, 'Generate schematic')
  lang = 'zh'
  assert.equal((await source.candidates())[0].name, '生成原理图')
})

test('merges extra candidates ahead of the built-in row', async () => {
  const source = createSchematicGenSource([{ name: 'extra' }], () => 'en')
  assert.deepEqual((await source.candidates()).map(c => c.name), ['extra', SCHEMATIC_GEN_LABEL])
})

test('produces a stable insert with the clipboard projection', () => {
  const insert = schematicGenInsert('zh')
  assert.equal(insert.source, 'schematic-gen')
  assert.equal(insert.ref, 'generate')
  assert.equal(insert.label, '生成原理图')
  assert.equal(insert.clipboardText, '@schematic-gen')
  assert.equal(SCHEMATIC_GEN_CLIPBOARD, '@schematic-gen')
  assert.equal(SCHEMATIC_GEN_REF, 'generate')
})

test('serializes to an intent that pins the kicad-schematic-design skill', async () => {
  const source = createSchematicGenSource()
  const text = await source.codec.serialize(SCHEMATIC_GEN_REF, undefined)
  assert.equal(text, SCHEMATIC_GEN_SERIALIZED)
  assert.match(text, /kicad-schematic-design/)
  assert.match(text, /<schematic-gen intent="kicad-schematic-design">/)
  // The retired online tools must not be named by the migrated chip.
  assert.doesNotMatch(text, /generate_schematic_from_description/)
  assert.doesNotMatch(text, /generate_system_module_graph/)
  assert.match(text, /Never hand-write \.kicad_sch files/)
})

test('registration is defensive: missing or hostile registries never throw', () => {
  assert.equal(typeof registerSchematicGenSource(undefined), 'function')
  assert.equal(typeof registerSchematicGenSource(null), 'function')
  assert.equal(typeof registerSchematicGenSource({}), 'function')
  assert.equal(typeof registerSchematicGenSource({ registerSource: 42 }), 'function')
})

test('registration forwards the disposer from the registry', () => {
  let disposed = 0
  const registry = { registerSource: () => () => { disposed += 1 } }
  const dispose = registerSchematicGenSource(registry)
  dispose()
  assert.equal(disposed, 1)
})

test('registration swallows duplicate-source failures', () => {
  const registry = { registerSource: () => { throw new Error('duplicate') } }
  assert.equal(typeof registerSchematicGenSource(registry), 'function')
})
