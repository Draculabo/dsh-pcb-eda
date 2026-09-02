import { describe, expect, it } from 'vitest'
import { ProgressStore } from '../src/progress.js'

describe('ProgressStore snapshots', () => {
  it('does not expose mutable internal progress documents', () => {
    const store = new ProgressStore({ now: () => 1000 })
    store.start('c1', 'generate_system_design', 'system')
    store.setTodos('c1', [{ content: 'Draft power tree', status: 'in_progress' }])

    const snapshot = store.get('c1')!
    snapshot.status = 'failed'
    snapshot.todos![0]!.content = 'mutated outside the store'
    snapshot.frames.push({
      id: 'external',
      name: 'external',
      path: 'external',
      status: 'running',
      startedAt: 1000,
    })

    const listed = store.list()[0]!
    listed.toolName = 'mutated outside the store'

    expect(store.get('c1')).toEqual({
      callId: 'c1',
      toolName: 'generate_system_design',
      kind: 'system',
      status: 'running',
      startedAt: 1000,
      updatedAt: 1000,
      frames: [],
      stage: null,
      todos: [{ content: 'Draft power tree', status: 'in_progress' }],
      note: null,
      error: null,
    })
  })
})
