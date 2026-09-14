import { afterEach, describe, expect, it, vi } from 'vitest'

import { dumpPluginLogs, getLogger } from '../src/client.js'

describe('dumpPluginLogs', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns isolated snapshots of nested browser log records', () => {
    vi.spyOn(console, 'info').mockImplementation(() => {})

    getLogger('snapshot-isolation').info('original', {
      context: { attempt: 1 },
    })

    const first = dumpPluginLogs().find((record) => record.component === 'snapshot-isolation')!
    first.component = 'mutated'
    ;(first.context as { attempt: number }).attempt = 2

    const second = dumpPluginLogs().find((record) => record.component === 'snapshot-isolation')
    expect(second).toMatchObject({
      component: 'snapshot-isolation',
      msg: 'original',
      context: { attempt: 1 },
    })
  })
})
