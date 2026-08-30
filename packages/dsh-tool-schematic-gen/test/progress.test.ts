import { describe, expect, it } from 'vitest'
import {
  MAX_FRAMES,
  ProgressStore,
  STAGE_LADDERS,
  stageOf,
  type RunProgress,
} from '../src/progress.js'
import { collectTraceEvents } from '../src/trace.js'

function toolStart(scope: string, name: string, ts: number) {
  return collectTraceEvents({ kind: 'tool', phase: 'start', scope, name, ts })[0]!
}

describe('stageOf', () => {
  it('reports the FIRST stage as in-progress for an empty state', () => {
    const stage = stageOf('schematic', {})
    expect(stage).toEqual({ index: 0, total: 5, key: 'requirement' })
  })

  it('advances one rung per filled state key', () => {
    const stage = stageOf('schematic', { requirement: 'x', architecture: { blocks: [1] } })
    expect(stage).toEqual({ index: 2, total: 5, key: 'circuit' })
  })

  it('clamps to the last rung once everything is reached', () => {
    const stage = stageOf('schematic', {
      requirement: 'x', architecture: { blocks: [1] }, circuit: { nets: [1] },
      report: 'markdown', schFiles: ['a.kicad_sch'],
    })
    expect(stage?.index).toBe(4)
    expect(stage?.key).toBe('output')
  })

  it('treats empty strings, empty arrays and empty objects as NOT reached', () => {
    expect(stageOf('schematic', { requirement: '' })?.index).toBe(0)
    expect(stageOf('schematic', { requirement: [] })?.index).toBe(0)
    expect(stageOf('schematic', { requirement: {} })?.index).toBe(0)
    expect(stageOf('schematic', { requirement: false })?.index).toBe(0)
  })

  it('stops at the first gap even when later keys are already filled', () => {
    const stage = stageOf('schematic', { requirement: 'x', circuit: { nets: [1] } })
    // architecture is missing, so the ladder must not skip ahead to circuit.
    expect(stage?.key).toBe('architecture')
  })

  it('reads system stages, including connections nested one level down', () => {
    expect(stageOf('system', {})?.key).toBe('plan')
    expect(stageOf('system', { design_plan: { steps: [1] } })?.key).toBe('search')
    expect(stageOf('system', { design_plan: { steps: [1] }, search_plan: { q: 'mcu' } })?.key).toBe('bom')

    const throughModules = {
      design_plan: { steps: [1] }, search_plan: { q: 'mcu' },
      bom_list: [{ ref: 'R1' }], module_list: [{ name: 'mcu' }],
    }
    // connections live under connect_result, NOT at the top level — a
    // top-level `connections` key must NOT advance the ladder.
    expect(stageOf('system', { ...throughModules, connections: [1] })?.key).toBe('connect')
    expect(stageOf('system', { ...throughModules, connect_result: { connections: [1] } })?.key).toBe('erc')
    expect(stageOf('system', {
      ...throughModules, connect_result: { connections: [1] }, erc_passed: true,
    })?.key).toBe('export')
  })

  it('exposes a ladder for every run kind', () => {
    expect(STAGE_LADDERS.schematic.length).toBeGreaterThan(0)
    expect(STAGE_LADDERS.system.length).toBeGreaterThan(0)
  })
})

describe('ProgressStore', () => {
  it('ignores start/finish/fail for an unknown callId instead of throwing', () => {
    const store = new ProgressStore()
    expect(() => store.finish('nope')).not.toThrow()
    expect(() => store.fail('nope', 'boom')).not.toThrow()
    expect(store.get('nope')).toBeNull()
  })

  it('registers a run and serves its snapshot', () => {
    const store = new ProgressStore({ now: () => 1000 })
    store.start('c1', 'generate_schematic_from_description', 'schematic')
    const doc = store.get('c1')
    expect(doc).toMatchObject({ callId: 'c1', kind: 'schematic', status: 'running', startedAt: 1000 })
    expect(doc?.frames).toEqual([])
    expect(doc?.stage).toBeNull()
  })

  it('is idempotent on start, so a re-entered tool keeps the original start time', () => {
    let now = 1000
    const store = new ProgressStore({ now: () => now })
    store.start('c1', 't', 'schematic')
    now = 5000
    store.start('c1', 't', 'schematic')
    expect(store.get('c1')?.startedAt).toBe(1000)
  })

  it('pairs pushed trace events into frames', () => {
    const store = new ProgressStore()
    store.start('c1', 't', 'schematic')
    store.pushTrace('c1', [toolStart('root', 'search_parts', 100)])
    expect(store.get('c1')?.frames).toHaveLength(1)
    expect(store.get('c1')?.frames[0]).toMatchObject({ name: 'search_parts', status: 'running' })
  })

  it('re-evaluates the stage ladder as state arrives', () => {
    const store = new ProgressStore()
    store.start('c1', 't', 'schematic')
    store.updateState('c1', { requirement: 'x' })
    expect(store.get('c1')?.stage?.key).toBe('architecture')
    store.updateState('c1', { architecture: { blocks: [1] } })
    expect(store.get('c1')?.stage?.key).toBe('circuit')
  })

  it('merges successive state updates rather than replacing them', () => {
    const store = new ProgressStore()
    store.start('c1', 't', 'system')
    store.updateState('c1', { design_plan: { steps: [1] } })
    store.updateState('c1', { search_plan: { q: 'mcu' } })
    // Proves the second update merged rather than replaced the first.
    expect(store.get('c1')?.stage?.key).toBe('bom')
  })

  it('stores todo snapshots without retaining caller-owned objects', () => {
    const store = new ProgressStore({ now: () => 2000 })
    const todos = [{ content: 'Draft power tree', status: 'in_progress' as const }]

    store.start('c1', 't', 'system')
    store.setTodos('c1', todos)
    todos[0]!.content = 'mutated outside the store'

    expect(store.get('c1')).toMatchObject({
      updatedAt: 2000,
      todos: [{ content: 'Draft power tree', status: 'in_progress' }],
    })
  })

  it('keeps the newest progress note and turns live error notes into failures', () => {
    const store = new ProgressStore({ now: () => 3000 })
    store.start('c1', 't', 'system')
    store.setNote('c1', { phase: 'start', stage: 'plan', message: 'Planning', ts: 20 })
    store.setNote('c1', { phase: 'complete', stage: 'plan', message: 'Stale', ts: 10 })

    expect(store.get('c1')).toMatchObject({
      status: 'running',
      note: { phase: 'start', stage: 'plan', message: 'Planning', ts: 20 },
    })

    store.setNote('c1', { phase: 'error', stage: 'plan', message: 'Planning failed', ts: 30 })

    expect(store.get('c1')).toMatchObject({
      status: 'failed',
      error: 'Planning failed',
      updatedAt: 3000,
      note: { phase: 'error', stage: 'plan', message: 'Planning failed', ts: 30 },
    })
  })

  it('finish() closes every still-open span', () => {
    const store = new ProgressStore({ now: () => 9000 })
    store.start('c1', 't', 'schematic')
    store.pushTrace('c1', [toolStart('root', 'a', 100), toolStart('root', 'b', 200)])
    store.finish('c1')
    const doc = store.get('c1')!
    expect(doc.status).toBe('completed')
    expect(doc.frames.every((f) => f.status === 'finished')).toBe(true)
    expect(doc.frames.every((f) => f.finishedAt === 9000)).toBe(true)
  })

  it('fail() blames only the spans that never closed', () => {
    const store = new ProgressStore({ now: () => 9000 })
    store.start('c1', 't', 'schematic')
    store.pushTrace('c1', [toolStart('root', 'a', 100)])
    store.updateState('c1', {})
    // Close the first span, then open a second one.
    store.pushTrace('c1', [collectTraceEvents({ kind: 'tool', phase: 'end', scope: 'root', name: 'a', ts: 150 })[0]!])
    store.pushTrace('c1', [toolStart('root', 'b', 200)])
    store.fail('c1', 'boom')

    const doc = store.get('c1')!
    expect(doc.status).toBe('failed')
    expect(doc.error).toBe('boom')
    expect(doc.frames[0]?.name).toBe('a')
    expect(doc.frames[0]?.status).toBe('finished') // succeeded before the failure
    expect(doc.frames[1]?.name).toBe('b')
    expect(doc.frames[1]?.status).toBe('failed')
  })

  it('expires and drops an idle run past the TTL', () => {
    let now = 0
    const store = new ProgressStore({ ttlMs: 1000, now: () => now })
    store.start('c1', 't', 'schematic')
    now = 1500
    expect(store.get('c1')).toBeNull()
    expect(store.sweep()).toBe(0) // already dropped by get()
  })

  it('sweep() removes only expired runs', () => {
    let now = 0
    const store = new ProgressStore({ ttlMs: 1000, now: () => now })
    store.start('old', 't', 'schematic')
    now = 2000
    store.start('fresh', 't', 'schematic')
    expect(store.sweep()).toBe(1)
    expect(store.get('fresh')).not.toBeNull()
    expect(store.get('old')).toBeNull()
  })

  it('caps retained frames so a pathological stream cannot grow unbounded', () => {
    const store = new ProgressStore()
    store.start('c1', 't', 'schematic')
    for (let i = 0; i < MAX_FRAMES + 100; i++) {
      store.pushTrace('c1', [toolStart('root', `tool_${i}`, i)])
    }
    const frames = store.get('c1')!.frames
    expect(frames.length).toBe(MAX_FRAMES)
    // Kept the TAIL — newer spans are what the user is waiting on.
    expect(frames[frames.length - 1]?.name).toBe(`tool_${MAX_FRAMES + 99}`)
  })

  it('satisfies the RunProgress sink the tool bodies depend on', () => {
    const sink: RunProgress = new ProgressStore()
    sink.start('c1', 't', 'system')
    sink.updateState('c1', { design_plan: {} })
    sink.pushTrace('c1', [toolStart('root', 'a', 1)])
    sink.finish('c1')
    expect(sink instanceof ProgressStore ? sink.get('c1')?.status : null).toBe('completed')
  })

  it('list() reports only live runs', () => {
    const store = new ProgressStore()
    store.start('a', 't', 'schematic')
    store.start('b', 't', 'system')
    expect(store.list().map((d) => d.callId).sort()).toEqual(['a', 'b'])
  })
})
