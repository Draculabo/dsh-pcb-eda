/**
 * `@huaqiu/component-gen-server` — history store.
 *
 * Plain filesystem (no SQLite): `<dir>/history.json` + `<dir>/inputs/<id>`.
 * History is user-level (not project-level). Entries are appended by the job
 * runner on terminal states; input thumbnails are stored by the routes layer
 * at POST /jobs time. `imageId` in an entry's `input` points into `inputs/`.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { HistoryEntry, HistoryPage, HistoryPatch, HistoryQuery } from './types.js'

const INPUT_DIR = 'inputs'

function readJsonFile<T>(path: string, fallback: T): T {
  try {
    if (!existsSync(path)) return fallback
    return JSON.parse(readFileSync(path, 'utf8')) as T
  } catch {
    return fallback
  }
}

function writeJsonFile(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(value, null, 2), 'utf8')
}

/** `data:image/...;base64,....` → { mime, bytes } | null. */
export function parseDataUrl(dataUrl: string): { mime: string; bytes: Buffer } | null {
  const m = /^data:([^;,]+);base64,(.+)$/s.exec(dataUrl)
  if (!m) return null
  try {
    return { mime: m[1]!, bytes: Buffer.from(m[2]!, 'base64') }
  } catch {
    return null
  }
}

export class HistoryStore {
  private readonly dir: string
  private readonly file: string
  private entries: HistoryEntry[] = []

  constructor(dir: string) {
    this.dir = dir
    this.file = join(dir, 'history.json')
    this.entries = readJsonFile<HistoryEntry[]>(this.file, [])
  }

  /** All entries, newest first. */
  private sorted(): HistoryEntry[] {
    return [...this.entries].sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
  }

  async append(entry: HistoryEntry): Promise<HistoryEntry> {
    this.entries = [entry, ...this.entries.filter((e) => e.id !== entry.id)]
    writeJsonFile(this.file, this.entries)
    return entry
  }

  async list(query: HistoryQuery): Promise<HistoryPage> {
    const limit = Math.max(1, Math.min(100, query.limit ?? 20))
    const sorted = this.sorted()
    const cursorIndex = query.cursor ? sorted.findIndex((e) => e.id === query.cursor) : -1
    if (query.cursor && cursorIndex < 0) {
      return { entries: [], nextCursor: null }
    }
    const start = query.cursor ? cursorIndex + 1 : 0
    const slice = sorted.slice(start, start + limit)
    const next = start + slice.length < sorted.length ? slice[slice.length - 1]?.id ?? null : null
    return { entries: slice, nextCursor: next }
  }

  async get(id: string): Promise<HistoryEntry | null> {
    return this.entries.find((e) => e.id === id) ?? null
  }

  async patch(id: string, patch: HistoryPatch): Promise<HistoryEntry | null> {
    const idx = this.entries.findIndex((e) => e.id === id)
    if (idx < 0) return null
    const current = this.entries[idx]!
    const next: HistoryEntry = {
      ...current,
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.error !== undefined ? { error: patch.error } : {}),
      ...(patch.edited !== undefined ? { edited: patch.edited } : {}),
      ...(patch.result !== undefined ? { result: patch.result } : {}),
    }
    this.entries[idx] = next
    writeJsonFile(this.file, this.entries)
    return next
  }

  async delete(id: string): Promise<void> {
    const entry = this.entries.find((e) => e.id === id)
    this.entries = this.entries.filter((e) => e.id !== id)
    writeJsonFile(this.file, this.entries)
    if (entry?.input?.imageId) {
      try { unlinkSync(join(this.dir, INPUT_DIR, entry.input.imageId)) } catch { /* already gone */ }
      try { unlinkSync(join(this.dir, INPUT_DIR, `${entry.input.imageId}.mime`)) } catch { /* already gone */ }
    }
  }

  // ── input thumbnails ──────────────────────────────────────────────────────
  // Bytes are stored as `<imageId>`; the original media type in a `<imageId>.mime`
  // sidecar so reopen serves pasted/selected JPEG/WebP/… images correctly (the
  // local file the user pasted may be long gone — this copy is authoritative).

  async saveImage(imageId: string, dataUrl: string): Promise<void> {
    const parsed = parseDataUrl(dataUrl)
    if (!parsed) throw new Error('component-gen: invalid image data URL')
    const dir = join(this.dir, INPUT_DIR)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, imageId), parsed.bytes)
    writeFileSync(join(dir, `${imageId}.mime`), parsed.mime, 'utf8')
  }

  async readImage(imageId: string): Promise<{ bytes: Uint8Array; mime: string } | null> {
    const dir = join(this.dir, INPUT_DIR)
    const path = join(dir, imageId)
    if (!existsSync(path)) return null
    let mime = 'image/png'
    try {
      const sidecar = readFileSync(join(dir, `${imageId}.mime`), 'utf8').trim()
      if (sidecar) mime = sidecar
    } catch { /* legacy entry stored before the mime sidecar existed */ }
    return { bytes: readFileSync(path), mime }
  }
}

export function newHistoryId(): string {
  return `hst_${randomUUID().slice(0, 18)}`
}

export function newImageId(): string {
  return `img_${randomUUID().slice(0, 18)}`
}
