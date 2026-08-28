/**
 * Pure browser message parsing for auth.eda.cn postMessage envelopes.
 *
 * auth.eda.cn posts `JSON.stringify({ category: 1, data: { type, data } })`
 * to the parent window with `targetOrigin: '*'`.
 *
 * SECURITY NOTE (offline deployment): the DSH harness runs fully offline /
 * local (127.0.0.1), so there is no public attack surface of a malicious
 * website posting a forged token at us. The origin gate is therefore dropped
 * by design — webviews may even report an opaque origin ("null") for the
 * embedded auth.eda.cn iframe, which would otherwise reject legitimate login
 * messages. What remains is the ENVELOPE validation in `parseAuthMessage`
 * (category 1 + well-formed token/userId), which keeps unrelated window
 * messages from ever corrupting the credential cache.
 *
 * Envelope types (see `/Users/admin/code/eda-cn-login/lib/kicadTools.ts`):
 *   { category: 1, data: { type: 'update_access_token', data: { userId, token, expires_at, ... } } }
 *   { category: 1, data: { type: 'logout', data: null } }
 *   { category: 1, data: { type: 'close_dialog', data: null } }
 */

export const AUTH_ORIGIN = 'https://auth.eda.cn'

export interface AuthTokenPayload {
  id: string
  token: string
  nickname?: string
  /** unix seconds; undefined = no expiry */
  expiresAt?: number
}

export type ParsedAuthMessage =
  | { kind: 'token'; info: AuthTokenPayload }
  | { kind: 'logout' }
  | { kind: 'close' }

/** Structural event (origin + data) so tests don't need a real MessageEvent. */
export interface AuthMessageEventLike {
  origin: string
  data: unknown
  /** The posting window; retained for completeness (origin is not gated). */
  source?: unknown
}

interface RawEnvelope {
  category?: unknown
  data?: { type?: unknown; data?: unknown }
}

/** Coerce an id field (string or number, as auth.eda.cn sends) to a string. */
function stringifyId(value: unknown): string | null {
  if (typeof value === 'string' && value.length > 0) return value
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return null
}

export function parseAuthMessage(raw: unknown): ParsedAuthMessage | null {
  let envelope: RawEnvelope | null = null
  if (typeof raw === 'string') {
    try {
      envelope = JSON.parse(raw) as RawEnvelope
    } catch {
      return null
    }
  } else if (raw !== null && typeof raw === 'object') {
    envelope = raw as RawEnvelope
  }
  if (!envelope || envelope.category !== 1) return null
  const data = envelope.data
  if (!data || typeof data !== 'object') return null

  switch (data.type) {
    case 'update_access_token': {
      const d = data.data
      if (!d || typeof d !== 'object') return null
      const record = d as Record<string, unknown>
      const token = typeof record.token === 'string' && record.token.length > 0 ? record.token : null
      // auth.eda.cn sends userId/id as NUMBERS (e.g. 6215935) — coerce to string.
      const id = stringifyId(record.userId) ?? stringifyId(record.id)
      if (!token || !id) return null
      const nickname = typeof record.nickname === 'string' && record.nickname.length > 0 ? record.nickname : undefined
      const expiresAt = typeof record.expires_at === 'number' ? record.expires_at : undefined
      return {
        kind: 'token',
        info: {
          id,
          token,
          ...(nickname !== undefined ? { nickname } : {}),
          ...(expiresAt !== undefined ? { expiresAt } : {}),
        },
      }
    }
    case 'logout':
      return { kind: 'logout' }
    case 'close_dialog':
      return { kind: 'close' }
    default:
      return null
  }
}

/** Origin-agnostic envelope parsing. The ONLY entry point for window message events. */
export function handleAuthMessage(event: AuthMessageEventLike): ParsedAuthMessage | null {
  return parseAuthMessage(event.data)
}
