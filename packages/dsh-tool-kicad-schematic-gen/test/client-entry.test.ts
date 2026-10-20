/**
 * The client entry's wiring — the bug this guards:
 *
 *   "cannot send message on clicking send while triggered @//schematic-gen/ —
 *    slash: no serializer for reference source \"schematic-gen\""
 *
 * The chip landed in the composer, but its source was never registered, and
 * DSH's `InputTriggerController.serializeReference` routes every chip to its
 * owner's codec — a chip with no owner blocks the WHOLE send instead of
 * degrading. The registration was skipped because `ctx.get('inputTriggers')`
 * was read once, at `apply()` time: activation is service-availability driven,
 * the trigger pipeline's own dependency chain is far longer than ours, and the
 * service was simply not there yet.
 *
 * Two halves of the fix, both asserted here against the real entry module:
 *
 *   1. the entry DECLARES `inputTriggers`, so cordis parks the plugin until the
 *      provider exists (`Fiber._refresh()` keeps the epoch INACTIVE while any
 *      declared service is missing) and `apply()` never runs too early;
 *   2. the registration self-heals — a provider that still arrives late is
 *      picked up by a short poll, and the sidebar click REFUSES to insert a
 *      chip while the source is unregistered (an unsubmittable chip is worse
 *      than no chip).
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { JSDOM } from 'jsdom'

// The DOM has to exist before the module is imported: the entry captures
// `document` state at mount time, exactly like the sidebar-row test does.
const dom = new JSDOM('<!doctype html><html lang="zh"><body></body></html>', { pretendToBeVisual: true })
const globals = globalThis as unknown as Record<string, unknown>
globals['window'] = dom.window
globals['document'] = dom.window.document
globals['MutationObserver'] = dom.window.MutationObserver
globals['Node'] = dom.window.Node
globals['HTMLElement'] = dom.window.HTMLElement
globals['HTMLButtonElement'] = dom.window.HTMLButtonElement
// The delivery-card visibility observer schedules a frame per mutation batch.
globals['requestAnimationFrame'] = dom.window.requestAnimationFrame.bind(dom.window)
globals['cancelAnimationFrame'] = dom.window.cancelAnimationFrame.bind(dom.window)

const document = dom.window.document

/** Captured loader registrations, in load order. */
const registrations: Array<{
  id: string
  factory: (require: (name: string) => unknown) => unknown
}> = []
;(dom.window as unknown as { __ModuleLoader__: unknown }).__ModuleLoader__ = {
  load: (registration: never) => { registrations.push(registration) },
}

await import('../src/client/index.ts')

/** Minimal React shim: the delivery card is never rendered in these tests. */
const reactShim = {
  createElement: () => null,
  useState: () => [undefined, () => {}],
  useEffect: () => {},
}

/** The plugin object the module loader hands back (the object form of `apply`). */
function loadEntry(): { inject: string[]; apply: (ctx: unknown) => void } {
  const registration = registrations.find((row) => row.id === '@huaqiu/dsh-tool-kicad-schematic-gen')
  assert.ok(registration, 'the client bundle registers itself with the module loader')
  return registration!.factory((name: string) => (name === 'react' ? reactShim : undefined)) as never
}

/** Minimal dsh sidebar shell: column > root > logoRow(newSession). */
function mountShell(): void {
  const column = document.createElement('div')
  column.setAttribute('data-pane', 'sidebar')
  const root = document.createElement('div')
  const logoRow = document.createElement('div')
  logoRow.className = 'logoRow'
  const newBtn = document.createElement('button')
  newBtn.className = 'newSession'
  logoRow.appendChild(newBtn)
  root.appendChild(logoRow)
  column.appendChild(root)
  document.body.appendChild(column)
}

/** The entry's ctx: `inputTriggers` resolves through `getRegistry()`, lazily. */
function makeCtx(getRegistry: () => unknown, services: Record<string, unknown> = {}) {
  const cleanups: Array<() => void> = []
  return {
    ctx: {
      get: (name: string) => (name === 'inputTriggers' ? getRegistry() : services[name]),
      slots: { inject: () => () => {}, register: () => () => {} },
      effect: (fn: () => unknown) => {
        const result = fn()
        if (typeof result === 'function') cleanups.push(result as () => void)
        return result
      },
    } as unknown,
    cleanups,
  }
}

/** A `sessions` face with one main-view Session and a guard-mimicking `scope()`. */
function fakeSessions(): unknown {
  const ids = ['main', 'other']
  const byId: Record<string, { retainedBy: { mainView?: number } }> = {
    main: { retainedBy: { mainView: 1 } },
    other: { retainedBy: {} },
  }
  return {
    list: { getSnapshot: () => ({ ids, byId }) },
    scope: () => { throw new Error('service "sessions" returned a cordis Context') },
    binding: (id: string) => ({ ctx: { id } }),
  }
}

/** A `conversation` face recording insertions and notices. */
function fakeConversation(record: { inserts: unknown[]; notices: unknown[] }): unknown {
  return {
    input: {
      for() {
        return {
          state: {
            getSnapshot: () => ({ draft: '', draftRev: 7, phase: 'plain', occurrences: [] }),
          },
          insertReference: (insert: unknown) => { record.inserts.push(insert); return true },
          focus: () => {},
          notify: (level: string, text: string) => { record.notices.push({ level, text }) },
        }
      },
    },
  }
}

/** One click on the mounted sidebar row. */
function clickRow(): void {
  const row = document.querySelector('[data-hqcg-schematic-entry]') as HTMLButtonElement | null
  assert.ok(row, 'the sidebar row is mounted')
  row!.click()
}

/** Let the registration poll (250 ms) run at least once. */
function settle(ms = 400): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

test('the entry declares inputTriggers, so cordis parks it until the trigger pipeline exists', () => {
  assert.deepEqual(loadEntry().inject, ['slots', 'inputTriggers'])
})

test('a trigger service that activates after apply() still gets the source registered', async () => {
  mountShell()
  let live = 0
  let registry: { registerSource: () => () => void } | undefined
  const { ctx, cleanups } = makeCtx(() => registry)
  loadEntry().apply(ctx)

  // The service was absent at apply() — exactly the state that produced
  // `slash: no serializer for reference source "schematic-gen"` on send.
  assert.equal(live, 0)
  assert.equal(document.querySelectorAll('[data-hqcg-schematic-entry]').length, 1)

  registry = { registerSource: () => { live += 1; return () => { live -= 1 } } }
  await settle()
  assert.equal(live, 1, 'the poll registered the source once the provider appeared')

  for (const cleanup of cleanups) cleanup()
  assert.equal(live, 0, 'disposing the entry unregisters the source')
  document.body.innerHTML = ''
})

test('the click declines while the source is unregistered, and inserts once it is', async () => {
  mountShell()
  const record = { inserts: [] as unknown[], notices: [] as unknown[] }
  let registry: { registerSource: () => () => void } | undefined
  const { ctx, cleanups } = makeCtx(() => registry, {
    sessions: fakeSessions(),
    conversation: fakeConversation(record),
  })
  loadEntry().apply(ctx)

  // Unregistered: the row must NOT insert a chip DSH would refuse to submit.
  clickRow()
  assert.equal(record.inserts.length, 0, 'no chip while the source is unregistered')
  assert.equal(record.notices.length, 1, 'the click explains itself instead of failing silently')

  // Provider arrives: the poll registers, and the next click inserts normally.
  registry = { registerSource: () => () => {} }
  await settle()
  clickRow()
  assert.equal(record.inserts.length, 1, 'the chip lands once the source is registered')
  assert.deepEqual(record.inserts[0], {
    source: 'schematic-gen',
    ref: 'generate',
    label: '生成原理图',
    clipboardText: '@schematic-gen',
  })

  for (const cleanup of cleanups) cleanup()
  document.body.innerHTML = ''
})
