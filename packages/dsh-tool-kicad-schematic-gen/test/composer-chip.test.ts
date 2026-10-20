/**
 * Programmatic composer chip insertion.
 *
 * Regression guard for a silent no-op: the sidebar row mounted and clicked,
 * but no chip ever landed and no notice ever showed. Two independent causes,
 * both invisible because every failure path swallowed its own error:
 *
 * 1. The current Session was read from `sessions.list.getSnapshot().current`,
 *    a field `SessionListState` does not have — it carries `ids` / `byId` /
 *    `phase`. The read therefore always yielded undefined and the insertion
 *    aborted with `no-session` before touching the draft.
 * 2. The session scope came from `sessions.scope(id)`, which returns a cordis
 *    AgentContext. DSH's dynamic-plugin guard REJECTS any service call whose
 *    result is a Context ("returned a cordis Context, which the dynamic facade
 *    does not expose") and that rejection throws — so the throw was caught and
 *    reported as `no-session` too. `binding(id).ctx` is the guard-safe path.
 *
 * The tests below fake the guard (a `scope()` that throws exactly like it) and
 * assert the chip still lands.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  SCHEMATIC_GEN_CLIPBOARD, SCHEMATIC_GEN_REF, SCHEMATIC_GEN_SOURCE,
} from '../src/client/schematic-ref.ts'
import {
  currentSessionId, insertSchematicChip, resolveSessionScope,
  type SessionsLike,
} from '../src/client/composer-chip.ts'

/** A `sessions` face with one main-view Session and a guard-mimicking `scope()`. */
function fakeSessions(options: { mainView?: string; ids?: string[]; withCtx?: boolean } = {}): SessionsLike & { scopeCalls: number } {
  const ids = options.ids ?? ['main', 'other']
  const mainView = options.mainView === undefined ? 'main' : options.mainView
  const byId: Record<string, { retainedBy: { mainView?: number } }> = {}
  for (const id of ids) byId[id] = { retainedBy: id === mainView ? { mainView: 1 } : {} }
  const state = { calls: 0 }
  return {
    list: { getSnapshot: () => ({ ids, byId }) },
    // DSH's dynamic facade throws on a Context-returning call; this is that throw.
    scope: (_id: string) => { state.calls += 1; throw new Error('service "sessions" returned a cordis Context') },
    binding: (id: string) => (
      options.withCtx === false ? undefined : { ctx: { id } }
    ),
    get scopeCalls(): number { return state.calls },
  } as SessionsLike & { scopeCalls: number }
}

/** A `conversation` face whose input records the one insertion it accepts. */
function fakeConversation(record: { insert: unknown; span: unknown }[], options: { focus?: number } = {}): unknown {
  return {
    input: {
      for(_actx: unknown): unknown {
        return {
          state: {
            getSnapshot: () => ({
              draft: '', draftRev: 7, phase: 'plain', occurrences: [],
            }),
          },
          insertReference: (insert: unknown, span: unknown): boolean => {
            record.push({ insert, span })
            return true
          },
          focus: () => { options.focus = (options.focus ?? 0) + 1 },
        }
      },
    },
  }
}

test('currentSessionId resolves the main-view Session without a `current` field', () => {
  const sessions = fakeSessions()
  // The snapshot deliberately has no `current` — that is the shape DSH publishes.
  assert.equal((sessions.list!.getSnapshot() as Record<string, unknown>)['current'], undefined)
  assert.equal(currentSessionId(sessions), 'main')
})

test('currentSessionId falls back to host list order, then to any known row', () => {
  assert.equal(currentSessionId(fakeSessions({ mainView: 'none' })), 'main')
  assert.equal(currentSessionId({ list: { getSnapshot: () => ({ ids: [], byId: { only: {} } }) } }), 'only')
  assert.equal(currentSessionId(undefined), undefined)
  assert.equal(currentSessionId({ list: { getSnapshot: () => { throw new Error('gone') } } }), undefined)
})

test('resolveSessionScope prefers binding(id).ctx and never calls the denied scope()', () => {
  const sessions = fakeSessions()
  const actx = resolveSessionScope(sessions, 'main') as { id: string }
  assert.deepEqual(actx, { id: 'main' })
  assert.equal(sessions.scopeCalls, 0)
})

test('resolveSessionScope survives a host where scope() is the only path', () => {
  const sessions = fakeSessions({ withCtx: false })
  assert.equal(resolveSessionScope(sessions, 'main'), undefined)
})

test('insertSchematicChip inserts the chip into the live draft', () => {
  const record: { insert: unknown; span: unknown }[] = []
  const focus = { focus: 0 }
  const result = insertSchematicChip({
    getSessions: () => fakeSessions(),
    getConversation: () => fakeConversation(record, focus) as never,
  })
  assert.deepEqual(result, { ok: true })
  assert.equal(record.length, 1)
  const insert = record[0]!.insert as { source: string; ref: string; clipboardText: string }
  assert.equal(insert.source, SCHEMATIC_GEN_SOURCE)
  assert.equal(insert.ref, SCHEMATIC_GEN_REF)
  assert.equal(insert.clipboardText, SCHEMATIC_GEN_CLIPBOARD)
  assert.deepEqual(record[0]!.span, { start: 0, end: 0, draftRev: 7 })
  // The caret has to follow the chip: clicking the sidebar row leaves DOM focus
  // on the row, so without this focus hand-back the caret stands still and
  // reads as sitting at the START of the chip the user just inserted.
  assert.equal(focus.focus, 1)
})

test('insertSchematicChip still succeeds when the composer cannot be focused', () => {
  const record: { insert: unknown; span: unknown }[] = []
  const conversation = {
    input: {
      for: () => ({
        state: { getSnapshot: () => ({ draft: '', draftRev: 1, phase: 'plain', occurrences: [] }) },
        insertReference: (insert: unknown, span: unknown): boolean => { record.push({ insert, span }); return true },
        focus: () => { throw new Error('composer not mounted') },
      }),
    },
  }
  assert.deepEqual(
    insertSchematicChip({ getSessions: () => fakeSessions(), getConversation: () => conversation as never }),
    { ok: true },
  )
  assert.equal(record.length, 1)
})

test('insertSchematicChip reports a reason instead of throwing when a service is absent', () => {
  assert.deepEqual(
    insertSchematicChip({ getSessions: () => undefined, getConversation: () => undefined }),
    { ok: false, reason: 'unavailable' },
  )
  // A conversation without a single known Session (not a missing service).
  assert.deepEqual(
    insertSchematicChip({
      getSessions: () => ({}),
      getConversation: () => ({ input: { for: () => undefined } }) as never,
    }),
    { ok: false, reason: 'no-session' },
  )
  // A host that has not loaded the conversation service at all.
  assert.deepEqual(
    insertSchematicChip({
      getSessions: () => fakeSessions(),
      getConversation: () => undefined,
    }),
    { ok: false, reason: 'unavailable' },
  )
})
