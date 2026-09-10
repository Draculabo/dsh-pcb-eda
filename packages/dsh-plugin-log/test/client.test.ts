import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { dumpPluginLogs, getLogger } from '../src/client.js'

describe('client logger', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns isolated snapshots from the in-memory log ring', () => {
    getLogger('dsh-auth').info('session resolved', {
      context: {
        userId: '7',
      },
    })

    const first = dumpPluginLogs()
    first[0]!.msg = 'mutated'
    ;(first[0]!.context as { userId: string }).userId = 'changed'

    expect(dumpPluginLogs()).toEqual([
      {
        ts: expect.any(String),
        level: 'info',
        component: 'dsh-auth',
        msg: 'session resolved',
        context: {
          userId: '7',
        },
      },
    ])
  })
})
