import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { getHqEdgeHome, getLogBaseDir } from '../src/paths.js'

const HOME = join(tmpdir(), `dsh-plugin-log-home-${process.pid}`)

// The HQ Edge home is overridable via $HQ_EDGE_HOME — the inlined
// @hqedge/paths resolver honours it, so plugin logs follow the host install.
const { configureLogging, resetLogging, getLogger, logDir, flushLogs } = await import('../src/index.js')

describe('log directory follows the HQ Edge home', () => {
  beforeEach(() => {
    rmSync(HOME, { recursive: true, force: true })
    mkdirSync(HOME, { recursive: true })
    process.env.HQ_EDGE_HOME = HOME
    delete process.env.HQ_EDGE_LOG_DIR
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

  it('lets an explicit dir win over the home', () => {
    const explicit = join(HOME, 'custom-logs')
    configureLogging({ dir: explicit, consoleLevel: 'off' })
    getLogger('dsh-auth').info('x')
    expect(logDir()).toBe(explicit)
  })

  it('ignores a whitespace-only log directory environment override', () => {
    process.env.HQ_EDGE_LOG_DIR = ' \t '
    expect(getLogBaseDir()).toBe(join(HOME, 'logs'))
  })

  it('ignores a whitespace-only home environment override', () => {
    delete process.env.HQ_EDGE_HOME
    const defaultHome = getHqEdgeHome()
    process.env.HQ_EDGE_HOME = ' \t '
    expect(getHqEdgeHome()).toBe(defaultHome)
  })
})
