import { describe, expect, it } from 'vitest'
import { ProgressStore } from '../src/progress.js'
import { collectTraceEvents } from '../src/trace.js'

describe('ProgressStore terminal updates', () => {
  it('ignores late progress signals after a run completes', () => {
    let now = 1000
    const store = new ProgressStore({ now: () => now })

    store.start('c1', 'generate_system_design', 'system')
    store.updateState('c1', { design_plan: { steps: [1] } })
    store.setTodos('c1', [{ content: 'Choose MCU', status: 'in_progress' }])
    store.setNote('c1', { phase: 'start', stage: 'plan', message: 'Planning', ts: 10 })
    store.pushTrace('c1', collectTraceEvents({
      kind: 'tool',
      phase: 'start',
      scope: 'root',
      name: 'search_parts',
      ts: 20,
    }))

    now = 2000
    store.finish('c1')
    const completed = structuredClone(store.get('c1'))

    now = 3000
    store.updateState('c1', { search_plan: { query: 'late' } })
    store.setTodos('c1', [{ content: 'Late todo', status: 'completed' }])
    store.setNote('c1', { phase: 'complete', stage: 'plan', message: 'Late note', ts: 30 })
    store.pushTrace('c1', collectTraceEvents({
      kind: 'tool',
      phase: 'start',
      scope: 'root',
      name: 'late_tool',
      ts: 40,
    }))

    expect(store.get('c1')).toEqual(completed)
  })

  it('ignores late progress signals after a run fails', () => {
    let now = 1000
    const store = new ProgressStore({ now: () => now })

    store.start('c1', 'generate_schematic_from_description', 'schematic')
    store.updateState('c1', { requirement: 'power supply' })
    now = 2000
    store.fail('c1', 'backend failed')
    const failed = structuredClone(store.get('c1'))

    now = 3000
    store.updateState('c1', { architecture: { blocks: ['late'] } })
    store.setNote('c1', { phase: 'complete', stage: 'architecture', message: 'Late note', ts: 30 })

    expect(store.get('c1')).toEqual(failed)
  })
})
