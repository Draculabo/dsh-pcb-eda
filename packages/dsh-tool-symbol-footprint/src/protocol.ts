/**
 * `@huaqiu/dsh-tool-symbol-footprint` — componentV2 WebSocket protocol.
 *
 * A faithful TypeScript port of the `hq-edge` plugin's SaaS protocol layer
 * (itself a port of the 华秋/eda.cn component chat backend spoken by NextChat).
 * All pure, dependency-free logic lives here so the whole frame taxonomy and
 * the socket lifecycle are unit-testable without a server.
 *
 * Wire protocol facts preserved from the original:
 *   - endpoint `wss://www.eda.cn/componentV2/chat` (whitelist-checked override
 *     via `HQ_EDA_COMPONENT_WS_URL`);
 *   - the token rides as a QUERY parameter (`?token=…`) — the backend takes no
 *     auth header;
 *   - frames: `1`=streaming, `2`=streaming-end, `6`=agent action,
 *     `12`=token-expired (3/5 are diagnostics and ignored);
 *   - images ship as `data:<mime>;base64,…` inside `context.chat.base64_images`.
 *
 * @module @huaqiu/dsh-tool-symbol-footprint
 */
import { readFile } from 'node:fs/promises'

// ── Public constants ─────────────────────────────────────────────────────────

/** Command types the componentV2 backend understands. */
export const commandTypes = {
  /** image → schematic symbol. */
  PARSE_SYMBOL: 'agent.image.parse_symbol',
  /** image → package dimensions (the pre-HIL extraction step). */
  FOOTPRINT_DIMENSIONS: 'agent.footprint.dimensions.generate',
  /** dimensions → footprint (the post-HIL generation step). */
  FOOTPRINT_GENERATE: 'agent.footprint.generate',
} as const

/** AGENT-frame actions this plugin awaits. */
export const agentActions = {
  FOOTPRINT_DIMENSIONS: 'footprint_dimensions',
  SYMBOL_BUTTON: 'symbol_button',
  FOOTPRINT_BUTTON: 'footprint_button',
  /** The backend's "I don't know this package type" answer. */
  PKG_TYPE_NOT_FOUND: 'pkgTypeNotFound',
} as const

/** The package types the backend's footprint extractor supports. */
export const packageTypes = ['bga', 'dip', 'plcc', 'qfn', 'son', 'qfp', 'sop', 'sot23'] as const

/** Default componentV2 endpoint — the prod value NextChat ships. */
export const DEFAULT_WS_ENDPOINT = 'wss://www.eda.cn/componentV2/chat'

/** Hosts allowed to receive component commands — the two NextChat itself uses. */
export const ALLOWED_WS_HOSTS = ['www.eda.cn', 'www.fdatasheets.com']

// ── Budgets ──────────────────────────────────────────────────────────────────

/** One WebSocket round trip (image parsing is slow; the SaaS streams). */
export const WS_ROUND_TRIP_MS = 120_000
/** WebSocket connect budget. */
export const WS_CONNECT_MS = 20_000
/**
 * Grace period after `CHAT_STREAMING_END` to let a trailing AGENT frame land.
 */
export const WS_TRAILING_ACTION_MS = 2_500
/** Largest input image we will base64-encode and ship (4 MiB raw). */
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024
/** Largest generated artifact we will inline into the tool result (512 KiB). */
export const MAX_ARTIFACT_BYTES = 512 * 1024
/** Budget for fetching an input image URL or a generated artifact. */
export const HTTP_FETCH_MS = 30_000

/** Frame envelope types. */
const FRAME = { STREAMING: 1, STREAMING_END: 2, AGENT: 6, TOKEN_EXPIRED: 12 } as const

// ── Endpoint resolution ──────────────────────────────────────────────────────

/**
 * Resolve and validate the componentV2 WebSocket endpoint.
 *
 * @param env - process env (injectable).
 * @returns a `ws:`/`wss:` URL on a whitelisted host, no trailing slash.
 * @throws when the override is unparseable, not a WebSocket scheme, or points
 *   at a host outside the whitelist.
 */
export function resolveEndpoint(env?: Record<string, string | undefined>): string {
  const source = env && typeof env.HQ_EDA_COMPONENT_WS_URL === 'string' && env.HQ_EDA_COMPONENT_WS_URL.length > 0
    ? env.HQ_EDA_COMPONENT_WS_URL
    : DEFAULT_WS_ENDPOINT
  let parsed: URL
  try {
    parsed = new URL(source)
  } catch {
    throw new Error('symbol-footprint: HQ_EDA_COMPONENT_WS_URL is not a valid URL: ' + source)
  }
  if (parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:') {
    throw new Error('symbol-footprint: component endpoint must use ws:// or wss:// (got ' + parsed.protocol + ')')
  }
  if (!ALLOWED_WS_HOSTS.includes(parsed.hostname)) {
    throw new Error(
      'symbol-footprint: component endpoint host "' + parsed.hostname + '" is not allowed (expected one of ' +
      ALLOWED_WS_HOSTS.join(', ') + ')',
    )
  }
  return source.replace(/\/+$/, '')
}

/**
 * Build the per-call socket URL: the endpoint, a short random channel segment,
 * and the token as a query parameter (the backend takes no auth header).
 */
export function buildSocketUrl(
  endpoint: string,
  token: string | null,
  random?: () => number,
): string {
  const rnd = typeof random === 'function' ? random : Math.random
  const channel = rnd().toString().substring(3, 8)
  const base = endpoint + '/' + channel
  if (typeof token !== 'string' || token.length === 0) return base
  return base + (base.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(token)
}

// ── Frame taxonomy ───────────────────────────────────────────────────────────

/** Accumulated state across a socket session. */
export interface FrameAccumulator {
  text: string[]
  actions: Array<{ action: string; context: unknown }>
  ended: boolean
  tokenExpired: boolean
}

/** Interpret one decoded frame, mutating the accumulator. */
export function consumeFrame(frame: unknown, acc: FrameAccumulator): void {
  if (frame === null || typeof frame !== 'object') return
  const record = frame as { type?: unknown; msg?: unknown; action?: unknown; context?: unknown }
  const type = record.type
  if (type === FRAME.STREAMING) {
    if (typeof record.msg === 'string' && record.msg.length > 0) acc.text.push(record.msg)
    return
  }
  if (type === FRAME.STREAMING_END) {
    acc.ended = true
    if (typeof record.msg === 'string' && record.msg.length > 0) acc.text.push(record.msg)
    return
  }
  if (type === FRAME.AGENT) {
    if (typeof record.action === 'string' && record.action.length > 0) {
      acc.actions.push({ action: record.action, context: record.context })
    }
    return
  }
  if (type === FRAME.TOKEN_EXPIRED) {
    acc.tokenExpired = true
    return
  }
  // Types 3 (END_LOG) and 5 (DEBUG) are diagnostics — deliberately ignored.
}

/** Find the first collected action matching one of `wanted`. */
export function findAction(
  actions: Array<{ action: string; context: unknown }>,
  wanted: readonly string[],
): { action: string; context: unknown } | null {
  for (const entry of actions) {
    if (wanted.includes(entry.action)) return entry
  }
  return null
}

// ── WebSocket RPC ────────────────────────────────────────────────────────────

/** Shape the socket factory can supply (Node 22+ global `WebSocket`). */
export interface SocketLike {
  onopen: ((ev: unknown) => void) | null
  onmessage: ((ev: { data: unknown }) => void) | null
  onerror: ((ev: { message?: string }) => void) | null
  onclose: (() => void) | null
  send(data: string): void
  close(): void
}

export interface CallComponentAgentOptions {
  url: string
  command: Record<string, unknown>
  awaitActions: readonly string[]
  signal?: AbortSignal | null
  timeoutMs?: number
  socketFactory?: (url: string) => SocketLike
  /**
   * Invoked once when the component service reports a token-expired frame. Hook
   * for reactive invalidation: the caller clears its credential cache so the
   * next request re-resolves instead of replaying a dead token (spec §6.5).
   */
  onTokenExpired?: () => void
}

export interface ComponentCallResult {
  action: { action: string; context: unknown } | null
  actions: Array<{ action: string; context: unknown }>
  text: string
}

/**
 * Send one command over the componentV2 WebSocket and collect the response
 * until an awaited AGENT action arrives (or the stream ends).
 *
 * Resolution rules, in priority order:
 *   1. an awaited action arrives            → resolve immediately
 *   2. `CHAT_STREAMING_END` arrives         → wait up to WS_TRAILING_ACTION_MS
 *                                             for a late action, then resolve
 *   3. token-expired frame                 → reject with an actionable error
 *   4. socket error / close before (1)/(2)  → reject
 *   5. caller signal aborts or budget spent → reject
 */
export function callComponentAgent(options: CallComponentAgentOptions): Promise<ComponentCallResult> {
  const {
    url,
    command,
    awaitActions,
    signal,
    timeoutMs = WS_ROUND_TRIP_MS,
    socketFactory,
  } = options

  return new Promise((resolve, reject) => {
    if (signal && signal.aborted) {
      reject(new Error('symbol-footprint: cancelled before the request was sent'))
      return
    }

    const acc: FrameAccumulator = { text: [], actions: [], ended: false, tokenExpired: false }
    let settled = false
    let socket: SocketLike | null = null
    let overallTimer: ReturnType<typeof setTimeout> | null = null
    let connectTimer: ReturnType<typeof setTimeout> | null = null
    let trailingTimer: ReturnType<typeof setTimeout> | null = null
    let onAbort: (() => void) | null = null

    function cleanup(): void {
      if (overallTimer !== null) clearTimeout(overallTimer)
      if (connectTimer !== null) clearTimeout(connectTimer)
      if (trailingTimer !== null) clearTimeout(trailingTimer)
      if (onAbort !== null && signal && typeof signal.removeEventListener === 'function') {
        try { signal.removeEventListener('abort', onAbort) } catch { /* ignore */ }
      }
      if (socket !== null && typeof socket.close === 'function') {
        try { socket.close() } catch { /* already closing */ }
      }
    }

    function finish(err: Error | null, value?: ComponentCallResult): void {
      if (settled) return
      settled = true
      cleanup()
      if (err) reject(err)
      else resolve(value!)
    }

    function settleWithCollected(): void {
      finish(null, {
        action: findAction(acc.actions, awaitActions),
        actions: acc.actions.slice(),
        text: acc.text.join(''),
      })
    }

    overallTimer = setTimeout(() => {
      finish(new Error('symbol-footprint: the component service did not complete within ' + timeoutMs + 'ms'))
    }, timeoutMs)

    if (signal && typeof signal.addEventListener === 'function') {
      onAbort = () => finish(new Error('symbol-footprint: cancelled'))
      signal.addEventListener('abort', onAbort, { once: true })
    }

    try {
      socket = typeof socketFactory === 'function'
        ? socketFactory(url)
        : (new WebSocket(url) as unknown as SocketLike)
    } catch (err) {
      finish(new Error('symbol-footprint: failed to open the component socket: ' +
        String((err && (err as Error).message) || err)))
      return
    }

    connectTimer = setTimeout(() => {
      finish(new Error('symbol-footprint: the component service did not accept a connection within ' +
        WS_CONNECT_MS + 'ms'))
    }, WS_CONNECT_MS)

    socket!.onopen = () => {
      if (connectTimer !== null) { clearTimeout(connectTimer); connectTimer = null }
      try {
        socket!.send(JSON.stringify(command))
      } catch (err) {
        finish(new Error('symbol-footprint: failed to send the component command: ' +
          String((err && (err as Error).message) || err)))
      }
    }

    socket!.onmessage = (event) => {
      if (settled) return
      let frame: unknown
      try {
        frame = JSON.parse(typeof event.data === 'string' ? event.data : String(event.data))
      } catch {
        return // non-JSON keep-alives are ignored, as in NextChat
      }
      consumeFrame(frame, acc)
      if (acc.tokenExpired) {
        try { options.onTokenExpired?.() } catch { /* invalidation is best-effort */ }
        finish(new Error(
          'symbol-footprint: the HQ EDA session token was rejected by the component service ' +
          '(expired or invalid). Sign in to HQ EDA again and retry.'))
        return
      }
      if (findAction(acc.actions, awaitActions) !== null) {
        settleWithCollected()
        return
      }
      if (acc.ended && trailingTimer === null) {
        trailingTimer = setTimeout(settleWithCollected, WS_TRAILING_ACTION_MS)
      }
    }

    socket!.onerror = (event) => {
      finish(new Error('symbol-footprint: the component socket errored' +
        (event && event.message ? ': ' + event.message : '')))
    }

    socket!.onclose = () => {
      if (settled) return
      if (acc.ended || acc.actions.length > 0) {
        settleWithCollected()
        return
      }
      finish(new Error('symbol-footprint: the component socket closed before the service responded'))
    }
  })
}

// ── Image input ─────────────────────────────────────────────────────────────

/** Extension → MIME, for local files (the backend needs a typed data URL). */
const IMAGE_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
}

/** Guess an image MIME type from a path/URL extension; defaults to png. */
export function guessImageMime(pathOrUrl: string): string {
  const match = /\.([a-zA-Z0-9]+)(?:[?#].*)?$/.exec(String(pathOrUrl || ''))
  const ext = match ? match[1]!.toLowerCase() : ''
  return IMAGE_MIME[ext] || 'image/png'
}

export interface ImageDeps {
  readFileImpl?: (p: string) => Promise<Uint8Array | Buffer | string>
  fetchImpl?: typeof fetch
}

/**
 * Turn the tool's image argument into the `data:<mime>;base64,<...>` URL the
 * backend expects in `context.chat.base64_images`.
 *
 * Accepts, in precedence order: an existing data URL, an http(s) URL, or a
 * local filesystem path.
 */
export async function resolveImageDataUrl(
  args: { image_path?: unknown; image_url?: unknown },
  deps?: ImageDeps,
): Promise<string> {
  const readImpl = (deps && deps.readFileImpl) || readFile
  const fetchImpl = (deps && deps.fetchImpl) || fetch

  const rawUrl = args && typeof args.image_url === 'string' ? args.image_url.trim() : ''
  const rawPath = args && typeof args.image_path === 'string' ? args.image_path.trim() : ''

  if (rawUrl.length === 0 && rawPath.length === 0) {
    throw new Error('symbol-footprint: provide image_path (a local file) or image_url')
  }

  if (rawUrl.startsWith('data:')) {
    if (!/^data:image\//.test(rawUrl)) {
      throw new Error('symbol-footprint: image_url data URL must carry an image/* media type')
    }
    return rawUrl
  }

  if (rawUrl.length > 0) {
    if (!/^https?:\/\//i.test(rawUrl)) {
      throw new Error('symbol-footprint: image_url must be an http(s) URL or a data: URL')
    }
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), HTTP_FETCH_MS)
    let res: Response
    try {
      res = await fetchImpl(rawUrl, { signal: controller.signal })
    } finally {
      clearTimeout(timer)
    }
    if (!res || !res.ok) {
      throw new Error('symbol-footprint: failed to download image_url (HTTP ' +
        String(res && res.status) + ')')
    }
    const buffer = Buffer.from(await res.arrayBuffer())
    assertImageSize(buffer.length)
    const headerMime = res.headers && typeof res.headers.get === 'function'
      ? res.headers.get('content-type')
      : null
    const mime = headerMime && headerMime.startsWith('image/')
      ? headerMime.split(';')[0]!.trim()
      : guessImageMime(rawUrl)
    return 'data:' + mime + ';base64,' + buffer.toString('base64')
  }

  let buffer: Uint8Array | Buffer | string
  try {
    buffer = await readImpl(rawPath)
  } catch (err) {
    throw new Error('symbol-footprint: cannot read image_path "' + rawPath + '": ' +
      String((err && (err as Error).message) || err))
  }
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer as Uint8Array | string)
  assertImageSize(bytes.length)
  return 'data:' + guessImageMime(rawPath) + ';base64,' + bytes.toString('base64')
}

function assertImageSize(byteLength: number): void {
  if (byteLength === 0) throw new Error('symbol-footprint: the image is empty')
  if (byteLength > MAX_IMAGE_BYTES) {
    throw new Error('symbol-footprint: image is too large (' + byteLength + ' bytes > ' +
      MAX_IMAGE_BYTES + '). Crop the package drawing and retry.')
  }
}

// ── Generated-artifact handling ─────────────────────────────────────────────

/**
 * Read the `fileUrl` out of a `symbol_button` / `footprint_button` action.
 * The backend nests it as a JSON STRING in `context.params`, but tolerate an
 * already-parsed object and a flat `fileUrl` too.
 */
export function extractFileUrl(context: unknown): string | null {
  if (context === null || typeof context !== 'object') return null
  const record = context as { params?: unknown; fileUrl?: unknown }
  let params = record.params
  if (typeof params === 'string') {
    try {
      params = JSON.parse(params)
    } catch {
      params = null
    }
  }
  const candidate =
    (params && typeof params === 'object' && typeof (params as { fileUrl?: unknown }).fileUrl === 'string'
      ? (params as { fileUrl: string }).fileUrl
      : undefined) ??
    (typeof record.fileUrl === 'string' ? record.fileUrl : undefined) ??
    null
  if (candidate === null || candidate.length === 0) return null
  return candidate.startsWith('//') ? 'https:' + candidate : candidate
}

export interface ArtifactFetchResult {
  content: string | null
  note?: string
}

/**
 * Download a generated KiCad artifact as text, size-capped. Failure is NOT
 * fatal: the caller still has the URL, and inlining the body is a convenience.
 */
export async function fetchArtifactText(
  url: string,
  fetchImpl?: typeof fetch,
): Promise<ArtifactFetchResult> {
  const impl = fetchImpl || fetch
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), HTTP_FETCH_MS)
  try {
    const res = await impl(url, { signal: controller.signal })
    if (!res || !res.ok) {
      return { content: null, note: 'the generated file could not be downloaded (HTTP ' +
        String(res && res.status) + '); use fileUrl directly' }
    }
    const text = await res.text()
    if (typeof text !== 'string') return { content: null, note: 'the generated file was not text' }
    if (text.length > MAX_ARTIFACT_BYTES) {
      return {
        content: text.slice(0, MAX_ARTIFACT_BYTES),
        note: 'the generated file was truncated at ' + MAX_ARTIFACT_BYTES +
          ' characters; download fileUrl for the complete file',
      }
    }
    return { content: text }
  } catch (err) {
    return { content: null, note: 'the generated file could not be downloaded (' +
      String((err && (err as Error).message) || err) + '); use fileUrl directly' }
  } finally {
    clearTimeout(timer)
  }
}

// ── Command construction ─────────────────────────────────────────────────────

/**
 * Build a command for the componentV2 backend. `history` is deliberately
 * empty: an agent tool call has no NextChat chat transcript, and sending a
 * fabricated one would misrepresent the session.
 */
export function buildCommand(
  type: string,
  parts: { inputText?: string; images?: string[]; extra?: Record<string, unknown> },
): Record<string, unknown> {
  const inputText = parts && typeof parts.inputText === 'string' ? parts.inputText : ''
  const images = parts && Array.isArray(parts.images) ? parts.images : []
  const chat: Record<string, unknown> = { input_text: inputText }
  if (images.length > 0) chat.base64_images = images
  const context: Record<string, unknown> = { chat, history: [] }
  if (parts && parts.extra) Object.assign(context, parts.extra)
  return { type, context }
}

/**
 * Derive a sensible filename for a generated artifact (kind + extension).
 */
export function artifactFilenameFor(kind: 'symbol' | 'footprint' | 'schematic' | 'pcb', fallbackFileUrl?: string): string {
  if (typeof fallbackFileUrl === 'string' && fallbackFileUrl.length > 0) {
    const m = /\/([^/?#]+\.kicad_(?:sym|mod|footprint|sch|pcb))(?:[?#]|$)/i.exec(fallbackFileUrl)
    if (m && m[1]) return m[1]
  }
  const extMap = { symbol: 'kicad_sym', footprint: 'kicad_footprint', schematic: 'kicad_sch', pcb: 'kicad_pcb' }
  return 'generated.' + (extMap[kind] || 'txt')
}
