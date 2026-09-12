import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const HOME = join(tmpdir(), `dsh-plugin-log-home-${process.pid}`)

// The HQ Edge home is overridable via $HQ_EDGE_HOME — the inlined
// @hqedge/paths resolver honours it, so plugin logs follow the host install.
const { configureLogging, resetLogging, getLogger, logDir, flushLogs } = await import('../src/index.js')

describe('log directory follows the HQ Edge home', () => {
  beforeEach(() => {
    rmSync(HOME, { recursive: true, force: true })
    mkdirSync(HOME, { recursive: true })
    process.env.HQ_EDGE_HOME = HOME
    resetLogging()
  })

  afterEach(async () => {
    await flushLogs()
    resetLogging()
    delete process.env.HQ_EDGE_HOME
    delete process.env.HQ_EDGE_LOG_DIR
    rmSync(HOME, { recursive: true, force: true })
  })

  it('defaults to <HQ_EDGE_HOME>/logs/dsh-plugins', () => {
    getLogger('dsh-auth').info('x')
    expect(logDir()).toBe(join(HOME, 'logs', 'dsh-plugins'))
  })

  it('creates the log directory under the overridden home', async () => {
    getLogger('dsh-auth').info('x')
    await flushLogs()
    expect(existsSync(join(HOME, 'logs', 'dsh-plugins', 'dsh-plugins.log'))).toBe(true)
  })

  it('trims whitespace around environment path overrides', () => {
    process.env.HQ_EDGE_HOME = `  ${HOME}  `
    process.env.HQ_EDGE_LOG_DIR = `  ${join(HOME, 'custom-env-logs')}  `
    resetLogging()

    getLogger('dsh-auth').info('x')

    expect(logDir()).toBe(join(HOME, 'custom-env-logs', 'dsh-plugins'))
  })

  it('lets an explicit dir win over the home', () => {
    const explicit = join(HOME, 'custom-logs')
    configureLogging({ dir: explicit, consoleLevel: 'off' })
    getLogger('dsh-auth').info('x')
    expect(logDir()).toBe(explicit)
  })
})
