import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const HOME = join(tmpdir(), `dsh-plugin-log-home-${process.pid}`)

// The DSH home is overridable — HQ Edge points DSH_HOME at its own versioned,
// per-user tree. The log directory must follow it, exactly like
// `@deepseek-ai/dsh-home-paths` says it should.
vi.mock('@deepseek-ai/dsh-home-paths', () => ({
  dshHomePath: (...segments: string[]) => join(HOME, ...segments),
  resolveDshHome: () => HOME,
}))

const { configureLogging, resetLogging, getLogger, logDir, flushLogs } = await import('../src/index.js')

describe('log directory follows the DSH home', () => {
  beforeEach(() => {
    rmSync(HOME, { recursive: true, force: true })
    mkdirSync(HOME, { recursive: true })
    resetLogging()
  })

  afterEach(async () => {
    await flushLogs()
    resetLogging()
    rmSync(HOME, { recursive: true, force: true })
  })

  it('defaults to <DSH_HOME>/logs', () => {
    getLogger('dsh-auth').info('x')
    expect(logDir()).toBe(join(HOME, 'logs'))
  })

  it('creates the logs directory under the overridden home', async () => {
    getLogger('dsh-auth').info('x')
    await flushLogs()
    expect(existsSync(join(HOME, 'logs', 'dsh-plugins.log'))).toBe(true)
  })

  it('lets an explicit dir win over the home', () => {
    const explicit = join(HOME, 'custom-logs')
    configureLogging({ dir: explicit, consoleLevel: 'off' })
    getLogger('dsh-auth').info('x')
    expect(logDir()).toBe(explicit)
  })
})
