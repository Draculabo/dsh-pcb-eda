import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { configureLogging, resetLogging, getLogger, logDir, logFilePath, flushLogs } from '../src/index.js'

const TMP = join(tmpdir(), `dsh-plugin-log-test-${process.pid}`)

function setup(opts: Parameters<typeof configureLogging>[0] = {}) {
  resetLogging()
  configureLogging({ dir: TMP, consoleLevel: 'off', level: 'debug', ...opts })
}

function readLines(): Array<Record<string, any>> {
  const path = join(TMP, 'dsh-plugins.log')
  if (!existsSync(path)) return []
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l))
}

describe('getLogger', () => {
  beforeEach(() => {
    rmSync(TMP, { recursive: true, force: true })
    mkdirSync(TMP, { recursive: true })
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(async () => {
    await flushLogs()
    resetLogging()
    rmSync(TMP, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('writes JSONL records carrying component, level and message', async () => {
    setup()
    getLogger('dsh-auth').info('host session resolved', { userId: '6215935' })
    await flushLogs()

    const lines = readLines()
    const record = lines.find((l) => l.msg === 'host session resolved')
    expect(record).toBeTruthy()
    expect(record!.component).toBe('dsh-auth')
    expect(record!.level).toBe('info')
    expect(record!.userId).toBe('6215935')
    expect(typeof record!.ts).toBe('string')
    expect(typeof record!.pid).toBe('number')
  })

  it('writes a boot banner naming the resolved log file and DSH home', async () => {
    setup()
    getLogger('dsh-artifacts').debug('ignored-or-not')
    await flushLogs()

    const banner = readLines().find((l) => l.msg === 'plugin log ready')
    expect(banner).toBeTruthy()
    expect(banner!.logFile).toBe(join(TMP, 'dsh-plugins.log'))
    expect(banner!.platform).toBe(process.platform)
  })

  it('unifies every plugin into one file', async () => {
    setup()
    getLogger('dsh-auth').info('a')
    getLogger('dsh-artifacts').info('b')
    getLogger('dsh-schematic-gen').warn('c')
    await flushLogs()

    const components = new Set(readLines().map((l) => l.component))
    expect(components.has('dsh-auth')).toBe(true)
    expect(components.has('dsh-artifacts')).toBe(true)
    expect(components.has('dsh-schematic-gen')).toBe(true)
  })

  it('honours the configured minimum level', async () => {
    setup({ level: 'warn' })
    const log = getLogger('dsh-auth')
    log.debug('no')
    log.info('no')
    log.warn('yes')
    await flushLogs()

    const msgs = readLines().map((l) => l.msg)
    expect(msgs).not.toContain('no')
    expect(msgs).toContain('yes')
  })

  it('redacts credentials before they reach the file', async () => {
    setup()
    getLogger('dsh-auth').info('fetched', { token: '21ce59a4-2d69-5b0c-b1ea-6fe3c0d012a4', userId: '7' })
    await flushLogs()

    const raw = readFileSync(join(TMP, 'dsh-plugins.log'), 'utf8')
    expect(raw).not.toContain('21ce59a4')
    const record = readLines().find((l) => l.msg === 'fetched')
    expect(record!.token).toBe('[redacted]')
    expect(record!.userId).toBe('7')
  })

  it('mirrors to the console when the console level allows it', async () => {
    setup({ consoleLevel: 'error' })
    getLogger('dsh-auth').error('boom', { detail: 'x' })
    await flushLogs()
    expect(console.error).toHaveBeenCalled()
    expect(console.warn).not.toHaveBeenCalled()
  })

  it('rotates when the file exceeds maxBytes and keeps only maxFiles', async () => {
    const path = join(TMP, 'dsh-plugins.log')
    writeFileSync(path, 'x'.repeat(1000))
    setup({ maxBytes: 1000, maxFiles: 2 })

    getLogger('dsh-auth').info('after-rotation')
    await flushLogs()

    expect(existsSync(join(TMP, 'dsh-plugins.1.log'))).toBe(true)
    expect(existsSync(join(TMP, 'dsh-plugins.2.log'))).toBe(false)
    expect(readFileSync(path, 'utf8')).toContain('after-rotation')
  })

  it('falls back to a writable directory when the DSH home is not usable', () => {
    const blocker = join(TMP, 'not-a-dir')
    writeFileSync(blocker, 'file')
    resetLogging()
    configureLogging({ dir: join(blocker, 'logs'), consoleLevel: 'off' })

    expect(logDir()).not.toBe(join(blocker, 'logs'))
    expect(() => getLogger('dsh-auth').info('still works')).not.toThrow()
  })

  it('never throws from a log call', () => {
    setup()
    const log = getLogger('dsh-auth')
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    expect(() => log.info('cyclic', cyclic)).not.toThrow()
    expect(() => log.error('boom', { err: new Error('bad') })).not.toThrow()
  })

  it('reports the active file path only once logging has started', () => {
    resetLogging()
    expect(logFilePath()).toBeNull()
    setup()
    getLogger('dsh-auth').info('x')
    expect(logFilePath()).toBe(join(TMP, 'dsh-plugins.log'))
  })
})
