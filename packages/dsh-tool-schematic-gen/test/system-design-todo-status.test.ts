import { describe, expect, it } from 'vitest'
import { handleEvent, SYSTEM_DESIGN_EVENT_NAME } from '../src/sse.js'

describe('system design todo status normalization', () => {
  it('preserves known statuses and normalizes unknown statuses to pending', () => {
    const result = handleEvent({
      type: 'CUSTOM',
      name: SYSTEM_DESIGN_EVENT_NAME,
      value: {
        kind: 'todo_progress',
        todos: [
          { content: 'Plan modules', status: 'completed' },
          { content: 'Wire modules', status: 'in_progress' },
          { content: 'Review design', status: 'blocked' },
          { content: 'Finalize output' },
        ],
      },
    }, {})

    expect(result.todos).toEqual([
      { content: 'Plan modules', status: 'completed' },
      { content: 'Wire modules', status: 'in_progress' },
      { content: 'Review design', status: 'pending' },
      { content: 'Finalize output', status: 'pending' },
    ])
  })
})
