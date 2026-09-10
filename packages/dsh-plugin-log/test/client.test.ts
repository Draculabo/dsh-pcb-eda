import { afterEach, describe, expect, it, vi } from 'vitest'

import { dumpPluginLogs, getLogger } from '../src/client.js'

describe('client logger', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('keeps logger metadata authoritative over caller fields', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-11T00:00:00.000Z'))
    vi.spyOn(console, 'info').mockImplementation(() => {})

    const logger = getLogger('dsh-auth', {
      component: 'default-component',
      level: 'warn',
      msg: 'default-message',
      ts: 'default-time',
      scope: 'default',
    })

    logger.info('session resolved', {
      component: 'field-component',
      level: 'error',
      msg: 'field-message',
      ts: 'field-time',
      scope: 'request',
    })

    expect(dumpPluginLogs().at(-1)).toEqual({
      component: 'dsh-auth',
      level: 'info',
      msg: 'session resolved',
      scope: 'request',
      ts: '2026-09-11T00:00:00.000Z',
    })
  })
})
