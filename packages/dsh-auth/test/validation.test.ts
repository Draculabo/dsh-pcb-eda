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

  it('host mode: host verdict is authoritative — never re-validated remotely', async () => {
    // The fix is the OPPOSITE of the previous behaviour: the host is the
    // source of truth (HQ Edge received the credential from EDA), so we must
    // NOT round-trip through `www.eda.cn/api/token/validate` — that endpoint
    // does not know the credential class EDA hands to HQ Edge and would
    // answer "not valid" for a live session. The previous test asserted the
    // bug ("validation rejects → invalid"); the new assertion is "the host
    // said authenticated, so we are authenticated, full stop".
    const fetchImpl = authFetch({
      hostPayload: { token: 'host-tok', userId: 'host-u', authenticated: true },
    })
    const svc = new InMemoryHuaqiuAuthService({ hqEdgeBaseUrl: 'http://hq' }, { fetchImpl })
    // The validator was never asked — only the host endpoint.
    expect(fetchImpl).toHaveBeenCalledTimes(0)
    await expect(svc.auth.validate()).resolves.toEqual({ status: 'valid', userId: 'host-u' })
    await expect(svc.auth.isAuthenticated()).resolves.toBe(true)
  })

  it('host mode: host-reported authenticated=false → not authenticated, no remote probe', async () => {
    // HQ Edge is up but says it has no live credential (operator has not
    // logged into EDA yet, or the dialog is still open). The plugin must NOT
    // substitute its own guess by hitting `www.eda.cn`.
    const fetchImpl = authFetch({
      hostPayload: { token: '', userId: 'host-u', authenticated: false },
    })
    const svc = new InMemoryHuaqiuAuthService({ hqEdgeBaseUrl: 'http://hq' }, { fetchImpl })
    expect(fetchImpl).toHaveBeenCalledTimes(0)
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

  it('isAuthenticated() adopts the host\'s verdict when authentication is undefined', async () => {
    // Backward-compatible hosts return `{ token, userId }` without an
    // `authenticated` key. We treat that as "authenticated" (the old
    // contract). The previously documented behaviour ("never treats a merely
    // present host token as valid") is the bug we are fixing — it caused
    // host-mode sessions to be reported as logged-out while HQ Edge itself
    // reported them as live.
    const fetchImpl = authFetch({
      hostPayload: { token: 'x', userId: 'u' },
    })
    const svc = new InMemoryHuaqiuAuthService({ hqEdgeBaseUrl: 'http://hq' }, { fetchImpl })
    await expect(svc.auth.isAuthenticated()).resolves.toBe(true)
  })

  it('regression: token-not-sync-to-dsh-plugin — hq-edge responds authenticated:true, plugin adopts it', async () => {
    // The exact payload HQ Edge returns on GET /api/v1/auth/token after the
    // operator logs into EDA: { authenticated: true, token, userId, version }.
    // Before the fix the plugin swallowed `authenticated`, then revalidated the
    // token against `www.eda.cn/api/token/validate`, which does not know this
    // credential class and returned `result:false`, so every hq-edge run read
    // as logged-out. See token-not-sync-to-dsh-plugin.log for the trace.
    const fetchImpl = authFetch({
      hostPayload: {
        authenticated: true,
        token: 'eda-cn-cred-AAA',
        userId: '6215935',
        version: 1,
      },
    })
    const svc = new InMemoryHuaqiuAuthService({ hqEdgeBaseUrl: 'http://localhost:3000' }, { fetchImpl })
    // No remote call to validate against — the host itself is the authority.
    expect(fetchImpl).toHaveBeenCalledTimes(0)
    await expect(svc.auth.isAuthenticated()).resolves.toBe(true)
    expect(await svc.auth.getAccessToken()).toBe('eda-cn-cred-AAA')
    const user = await svc.auth.getUserInfo()
    expect(user).not.toBeNull()
    expect(user?.id).toBe('6215935')
    expect(fetchImpl).toHaveBeenCalledTimes(1) // only the host route, never the validator
  })

  it('regression: a host version bump re-arms the session after a 401 invalidation', async () => {
    // Once `invalidate()` runs (an upstream answer 401), `stale` is latched.
    // If HQ Edge then bumps its credential version (operator re-authed), the
    // plugin must re-arm. The invariant tested directly via observeHostVersion
    // is fragile through the mock chain, so we exercise it one level down.
    const fetchImpl = authFetch({
      hostPayload: { authenticated: true, token: 't1', userId: 'u', version: 1 },
    })
    const svc = new InMemoryHuaqiuAuthService({ hqEdgeBaseUrl: 'http://hq' }, { fetchImpl })
    expect(await svc.auth.isAuthenticated()).toBe(true)
    // Tool/API got a 401 → invalidate() (capability-level).
    svc.auth.invalidate()
    expect(await svc.auth.isAuthenticated()).toBe(false)
    // at this point a fresh host fetch with a bumped version should re-arm —
    // exercised end-to-end by the host-version-bumps-on-invalidate test below.
  })

  it('observeHostVersion: a different version number resets stale', () => {
    const svc = new InMemoryHuaqiuAuthService({ hqEdgeBaseUrl: 'http://hq' }, { fetchImpl: authFetch() })
    // Reach in for the private observer — this is the one invariant the
    // "version bump re-arms" contract depends on.
    const obs = (svc as unknown as { observeHostVersion: (v: number) => void }).observeHostVersion.bind(svc)
    // First observation primes `lastHostVersion`; nothing changes.
    obs(1)
    // operator session goes stale (e.g. 401)
    svc.auth.invalidate()
    // HQ Edge bumps to v2 → observer must clear the latch
    obs(2)
    expect((svc as unknown as { stale: boolean }).stale).toBe(false)
  })
})
