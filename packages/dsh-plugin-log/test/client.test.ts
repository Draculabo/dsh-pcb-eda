import { afterEach, describe, expect, it, vi } from 'vitest'

import { dumpPluginLogs, getLogger } from '../src/client.js'

describe('browser logger metadata', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('keeps reserved metadata authoritative over caller fields', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    const log = getLogger('dsh-auth', {
      component: 'default-component',
      level: 'debug',
      msg: 'default-message',
      source: 'default',
    })

    log.warn('session expired', {
      component: 'field-component',
      level: 'info',
      msg: 'field-message',
      source: 'field',
    })

    expect(dumpPluginLogs().at(-1)).toEqual(expect.objectContaining({
      component: 'dsh-auth',
      level: 'warn',
      msg: 'session expired',
      source: 'field',
      ts: expect.any(String),
    }))
  })
})
