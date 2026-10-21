/**
 * The `@schematic-gen` reference source (migrated from the retired
 * `@huaqiu/dsh-tool-schematic-gen` plugin): identity, menu row, codec and the
 * mandatory registration.
 *
 * The codec is not cosmetic — DSH's `serializeReference` rejects a chip whose
 * owner (or codec) is missing and blocks the whole send, so these assertions
 * guard a hard submission failure rather than a cosmetic label. The migrated
 * chip serializes to the bare clipboard token; the semantics that used to ride
 * in the payload live in the node half's `huaqiu:schematic-gen` section (see
 * `prompt.test.ts` for that contract).
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
  registerSchematicGenSourceTracked,
  registerSchematicGenSourceWhenReady,
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
  assert.equal((await source.candidates())[0]?.name, 'Generate schematic')
  lang = 'zh'
  assert.equal((await source.candidates())[0]?.name, '生成原理图')
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

test('serializes to the bare clipboard token — semantics live in the section', async () => {
  const source = createSchematicGenSource()
  const text = await source.codec.serialize(SCHEMATIC_GEN_REF, undefined)
  // The idiomatic mention pattern (DSH's own draft tests serialize a
  // reference to its ref): the model form IS the clipboard token.
  assert.equal(text, SCHEMATIC_GEN_SERIALIZED)
  assert.equal(text, SCHEMATIC_GEN_CLIPBOARD)
  assert.equal(text, '@schematic-gen')
  // Nothing else may ride in the USER message: whatever serialize() returns
  // is spliced over the chip's clipboard range, so a long payload is noise
  // the user reads back on every send. The skill pin and the guardrails are
  // the node half's `huaqiu:schematic-gen` section (see prompt.test.ts).
  assert.doesNotMatch(text, /kicad-schematic-design/)
  assert.doesNotMatch(text, /Never hand-write/)
  assert.doesNotMatch(text, /hardware design brief/)
  // The retired online tools must not be named by the migrated chip.
  assert.doesNotMatch(text, /generate_schematic_from_description/)
  assert.doesNotMatch(text, /generate_system_module_graph/)
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

// ── registration outcome (the "no serializer for reference source" guard) ────
// A chip whose source never registered is not a cosmetic problem: DSH's
// `serializeReference` routes every chip to its owner's codec and rejects the
// whole send when the owner is missing. These tests pin that the caller can
// SEE the outcome, and that a late-arriving trigger service still gets our
// source instead of silently producing an unsubmittable chip.

test('tracked registration reports the outcome of one attempt', () => {
  const missing = registerSchematicGenSourceTracked(undefined)
  assert.equal(missing.registered, false)
  missing.dispose() // no-op, must not throw

  let disposed = 0
  const registry = { registerSource: () => () => { disposed += 1 } }
  const live = registerSchematicGenSourceTracked(registry)
  assert.equal(live.registered, true)
  live.dispose()
  assert.equal(disposed, 1)
})

test('a duplicate registration counts as registered (the first owner serves)', () => {
  const registry = { registerSource: () => { throw new Error('duplicate') } }
  assert.equal(registerSchematicGenSourceTracked(registry).registered, true)
})

/** Deterministic fake scheduler: ticks only when the test says so. */
function fakeScheduler() {
  const jobs = new Map<number, () => void>()
  let next = 0
  return {
    setTimer: (fn: () => void) => { next += 1; jobs.set(next, fn); return next },
    clearTimer: (handle: unknown) => { jobs.delete(Number(handle)) },
    tick: (count = 1) => {
      for (let i = 0; i < count; i += 1) {
        // Snapshot first: a job that schedules or cancels during this tick is
        // settled by the NEXT tick, never by the one already running.
        for (const job of [...jobs.values()]) job()
      }
    },
    pending: () => jobs.size,
  }
}

test('when-ready registers immediately and schedules no retry', () => {
  const scheduler = fakeScheduler()
  let disposed = 0
  const registry = { registerSource: () => () => { disposed += 1 } }
  const binding = registerSchematicGenSourceWhenReady(() => registry, {
    setTimer: scheduler.setTimer,
    clearTimer: scheduler.clearTimer,
  })
  assert.equal(binding.registered(), true)
  assert.equal(scheduler.pending(), 0)
  binding.dispose()
  assert.equal(disposed, 1)
})

test('when-ready registers a trigger service that activates after apply()', () => {
  const scheduler = fakeScheduler()
  let disposed = 0
  let registry: { registerSource: () => () => void } | undefined
  const binding = registerSchematicGenSourceWhenReady(() => registry, {
    setTimer: scheduler.setTimer,
    clearTimer: scheduler.clearTimer,
  })
  // The service was absent at apply() time — the state that produced
  // `slash: no serializer for reference source "schematic-gen"` on send.
  assert.equal(binding.registered(), false)
  assert.equal(scheduler.pending(), 1)

  registry = { registerSource: () => () => { disposed += 1 } }
  scheduler.tick()
  assert.equal(binding.registered(), true)
  assert.equal(scheduler.pending(), 0, 'the retry timer stops once registered')

  binding.dispose()
  assert.equal(disposed, 1)
})

test('when-ready keeps polling until maxAttempts, then reports unregistered', () => {
  const scheduler = fakeScheduler()
  const events: string[] = []
  const binding = registerSchematicGenSourceWhenReady(() => undefined, {
    maxAttempts: 3,
    setTimer: scheduler.setTimer,
    clearTimer: scheduler.clearTimer,
    trace: (event) => events.push(event),
  })
  assert.equal(binding.registered(), false)
  scheduler.tick(2)
  assert.equal(binding.registered(), false)
  assert.equal(scheduler.pending(), 1, 'still polling below the cap')
  scheduler.tick()
  assert.equal(binding.registered(), false)
  assert.equal(scheduler.pending(), 0, 'the retry timer stops at the cap')
  assert.deepEqual(events, ['waiting for inputTriggers', 'source registration gave up'])
  binding.dispose() // must be safe with nothing registered
})

test('when-ready stops polling once disposed', () => {
  const scheduler = fakeScheduler()
  let registered = 0
  const binding = registerSchematicGenSourceWhenReady(() => (
    { registerSource: () => { registered += 1; return () => {} } }
  ), {
    setTimer: scheduler.setTimer,
    clearTimer: scheduler.clearTimer,
  })
  // First attempt succeeded (service present at apply) — no poll scheduled.
  assert.equal(registered, 1)
  assert.equal(scheduler.pending(), 0)
  binding.dispose()

  // The pending case: dispose must cancel the poll so a provider that appears
  // later is never registered into a fiber that is already gone.
  let late = 0
  let registry: { registerSource: () => () => void } | undefined
  const pending = registerSchematicGenSourceWhenReady(() => registry, {
    setTimer: scheduler.setTimer,
    clearTimer: scheduler.clearTimer,
  })
  assert.equal(scheduler.pending(), 1)
  pending.dispose()
  assert.equal(scheduler.pending(), 0)
  registry = { registerSource: () => { late += 1; return () => {} } }
  scheduler.tick(5)
  assert.equal(late, 0, 'a disposed binding never registers')
  assert.equal(pending.registered(), false)
})
