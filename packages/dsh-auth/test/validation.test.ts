import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { rmSync } from 'node:fs'
import { TokenValidator } from '../src/validation.js'
import { InMemoryHuaqiuAuthService } from '../src/service.js'
import { authFetch } from './helpers.js'

const TMP = join(tmpdir(), `dsh-auth-validation-test-${process.pid}`)
vi.mock('@deepseek-ai/dsh-home-paths', () => ({ dshHomePath: () => TMP }))

describe('TokenValidator (unit)', () => {
  it('classifies a 2xx `result:true` as valid', async () => {
    const fetchImpl = authFetch({ validateResult: true })
    const v = new TokenValidator({ fetchImpl })
    await expect(v.validate('tok')).resolves.toEqual({ status: 'valid' })
  })

  it('classifies a 2xx `result:false` as invalid (unauthorized)', async () => {
    const v = new TokenValidator({ fetchImpl: authFetch({ validateResult: false }) })
    await expect(v.validate('tok')).resolves.toEqual({ status: 'invalid', reason: 'unauthorized' })
  })

  it('classifies HTTP 401 as invalid (unauthorized)', async () => {
    const v = new TokenValidator({ fetchImpl: authFetch({ validateStatus: 401 }) })
    await expect(v.validate('tok')).resolves.toEqual({ status: 'invalid', reason: 'unauthorized' })
  })

  it('classifies HTTP 403 as invalid (forbidden)', async () => {
    const v = new TokenValidator({ fetchImpl: authFetch({ validateStatus: 403 }) })
    await expect(v.validate('tok')).resolves.toEqual({ status: 'invalid', reason: 'forbidden' })
  })

  it('classifies HTTP 5xx as unavailable — NOT invalid', async () => {
    const v = new TokenValidator({ fetchImpl: authFetch({ validateStatus: 500 }) })
    const result = await v.validate('tok')
    expect(result.status).toBe('unavailable')
  })

  it('classifies a network failure as unavailable — NOT invalid', async () => {
    const v = new TokenValidator({ fetchImpl: authFetch({ throwNetwork: true }) })
    const result = await v.validate('tok')
    expect(result.status).toBe('unavailable')
    expect(result).not.toMatchObject({ status: 'invalid' })
  })

  it('treats a known-expired credential as expired WITHOUT a remote call', async () => {
    const fetchImpl = authFetch({ validateResult: true })
    const v = new TokenValidator({ fetchImpl })
    const result = await v.validate('tok', { expiresAt: 1 })
    expect(result).toEqual({ status: 'invalid', reason: 'expired' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('does not assume a credential with unknown expiry is invalid', async () => {
    const fetchImpl = authFetch({ validateResult: true })
    const v = new TokenValidator({ fetchImpl })
    await expect(v.validate('tok', {})).resolves.toEqual({ status: 'valid' })
  })

  it('caches within TTL: three validate() calls → one remote request', async () => {
    const fetchImpl = authFetch({ validateResult: true })
    const v = new TokenValidator({ fetchImpl, ttlMs: 60_000 })
    await v.validate('tok')
    await v.validate('tok')
    await v.validate('tok')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('re-validates after the TTL elapses', async () => {
    const fetchImpl = authFetch({ validateResult: true })
    let now = 0
    const v = new TokenValidator({ fetchImpl, ttlMs: 100, now: () => now })
    await v.validate('tok')
    now = 101
    await v.validate('tok')
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('coalesces concurrent validate() calls into one in-flight request', async () => {
    const fetchImpl = authFetch({ validateResult: true })
    const v = new TokenValidator({ fetchImpl })
    const results = await Promise.all([v.validate('tok'), v.validate('tok'), v.validate('tok')])
    expect(results.every((r) => r.status === 'valid')).toBe(true)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('token change → new remote validation (T1 validity never reused for T2)', async () => {
    const fetchImpl = authFetch({ validateResult: true })
    const v = new TokenValidator({ fetchImpl })
    await v.validate('T1')
    await v.validate('T2')
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('invalidate() clears the cache so the next call re-validates', async () => {
    const fetchImpl = authFetch({ validateResult: true })
    const v = new TokenValidator({ fetchImpl })
    await v.validate('tok')
    v.invalidate('tok')
    await v.validate('tok')
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })
})

describe('HuaqiuAuthService validation lifecycle (spec §19)', () => {
  beforeEach(() => rmSync(TMP, { recursive: true, force: true }))
  afterEach(() => rmSync(TMP, { recursive: true, force: true }))

  it('standalone: token exists → validation succeeds → authenticated', async () => {
    const svc = new InMemoryHuaqiuAuthService({}, { fetchImpl: authFetch() })
    svc.setCredentials({ id: 'u1', token: 'tok-1', expiresAt: Math.floor(Date.now() / 1000) + 3600 })
    await expect(svc.auth.validate()).resolves.toEqual({ status: 'valid' })
    await expect(svc.auth.isAuthenticated()).resolves.toBe(true)
  })

  it('expired locally: no remote call, credential marked invalid but kept', async () => {
    const fetchImpl = authFetch({ validateResult: true })
    const svc = new InMemoryHuaqiuAuthService({}, { fetchImpl })
    svc.setCredentials({ id: 'u1', token: 'tok-old', expiresAt: 1 })
    await expect(svc.auth.validate()).resolves.toEqual({ status: 'invalid', reason: 'expired' })
    expect(fetchImpl).not.toHaveBeenCalled()
    await expect(svc.auth.isAuthenticated()).resolves.toBe(false)
    // credential is kept for recovery (spec §9)
    await expect(svc.auth.getAccessToken()).resolves.toBe('tok-old')
  })

  it('remote 401: invalid, cached valid state cleared', async () => {
    const svc = new InMemoryHuaqiuAuthService({}, { fetchImpl: authFetch({ validateStatus: 401 }) })
    svc.setCredentials({ id: 'u1', token: 'tok-bad' })
    await expect(svc.auth.validate()).resolves.toEqual({ status: 'invalid', reason: 'unauthorized' })
    await expect(svc.auth.isAuthenticated()).resolves.toBe(false)
  })

  it('remote unavailable: status = unavailable, token NOT declared invalid', async () => {
    const svc = new InMemoryHuaqiuAuthService({}, { fetchImpl: authFetch({ throwNetwork: true }) })
    svc.setCredentials({ id: 'u1', token: 'tok-net' })
    const result = await svc.auth.validate()
    expect(result.status).toBe('unavailable')
    expect(result).not.toMatchObject({ status: 'invalid' })
  })

  it('validation cache: repeated isAuthenticated() within TTL hits remote once', async () => {
    const fetchImpl = authFetch({ validateResult: true })
    const svc = new InMemoryHuaqiuAuthService({}, { fetchImpl })
    svc.setCredentials({ id: 'u1', token: 'tok-cache' })
    await svc.auth.isAuthenticated()
    await svc.auth.isAuthenticated()
    await svc.auth.isAuthenticated()
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('token change invalidates validation: validate(T1) valid → replace T2 → re-validated', async () => {
    const fetchImpl = authFetch({ validateResult: true })
    const svc = new InMemoryHuaqiuAuthService({}, { fetchImpl })
    svc.setCredentials({ id: 'u1', token: 'T1' })
    await svc.auth.validate()
    svc.setCredentials({ id: 'u1', token: 'T2' })
    await svc.auth.validate()
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('host mode: host token follows the same validation path; an invalid host token is detected', async () => {
    // Host route serves a token, but the validation endpoint rejects it.
    const fetchImpl = authFetch({
      hostPayload: { token: 'stale-host-tok', userId: 'host-u' },
      validateResult: false,
    })
    const svc = new InMemoryHuaqiuAuthService({ hqEdgeBaseUrl: 'http://hq' }, { fetchImpl })
    await expect(svc.auth.getAccessToken()).resolves.toBe('stale-host-tok')
    await expect(svc.auth.validate()).resolves.toEqual({ status: 'invalid', reason: 'unauthorized' })
    await expect(svc.auth.isAuthenticated()).resolves.toBe(false)
  })

  it('API 401 → auth.invalidate() → isAuthenticated() short-circuits false, credential kept', async () => {
    const fetchImpl = authFetch({ validateResult: true })
    const svc = new InMemoryHuaqiuAuthService({}, { fetchImpl })
    svc.setCredentials({ id: 'u1', token: 'tok-api' })
    await expect(svc.auth.isAuthenticated()).resolves.toBe(true)
    // A tool received 401 and tells dsh-auth.
    svc.auth.invalidate()
    await expect(svc.auth.isAuthenticated()).resolves.toBe(false)
    // Credential retained for recovery; a fresh validate() re-checks remotely.
    await expect(svc.auth.getAccessToken()).resolves.toBe('tok-api')
    await expect(svc.auth.validate()).resolves.toEqual({ status: 'valid' })
  })

  it('isAuthenticated() never treats a merely-present host token as valid', async () => {
    // Host route available, but validation rejects → must NOT report authenticated.
    const fetchImpl = authFetch({
      hostPayload: { token: 'x', userId: 'u' },
      validateResult: false,
    })
    const svc = new InMemoryHuaqiuAuthService({ hqEdgeBaseUrl: 'http://hq' }, { fetchImpl })
    await expect(svc.auth.isAuthenticated()).resolves.toBe(false)
  })
})
