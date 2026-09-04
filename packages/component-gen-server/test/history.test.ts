/**
 * `@huaqiu/component-gen-server` — history store tests.
 */
import { mkdtempSync, existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { HistoryStore, parseDataUrl, newHistoryId, newImageId } from '../src/history.js'
import type { HistoryEntry } from '../src/types.js'

function makeEntry(overrides: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    id: newHistoryId(),
    kind: 'footprint',
    createdAt: new Date().toISOString(),
    status: 'generated',
    input: { packageType: 'BGA100' },
    ...overrides,
  }
}

describe('HistoryStore', () => {
  it('persists entries to JSON on disk and reloads them', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'hq-cga-'))
    try {
      const store = new HistoryStore(dir)
      const entry = makeEntry()
      await store.append(entry)
      expect(existsSync(join(dir, 'history.json'))).toBe(true)
      const reloaded = new HistoryStore(dir)
      const page = await reloaded.list({})
      expect(page.entries.map((e) => e.id)).toEqual([entry.id])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('returns an empty page for an unknown cursor', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'hq-cga-'))
    try {
      const store = new HistoryStore(dir)
      await store.append(makeEntry())

      expect(await store.list({ cursor: 'hst_missing' })).toEqual({
        entries: [],
        nextCursor: null,
      })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('round-trips image input into inputs/ and back', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'hq-cga-'))
    try {
      const store = new HistoryStore(dir)
      const imageId = newImageId()
      const dataUrl = `data:image/png;base64,${Buffer.from('abc').toString('base64')}`
      await store.saveImage(imageId, dataUrl)
      const read = await store.readImage(imageId)
      expect(read?.mime).toBe('image/png')
      expect(Buffer.from(read!.bytes).toString()).toBe('abc')
      expect(await store.readImage('nope')).toBeNull()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('parseDataUrl', () => {
  it('parses a base64 data URL', () => {
    const parsed = parseDataUrl(`data:image/png;base64,${Buffer.from('hi').toString('base64')}`)
    expect(parsed?.mime).toBe('image/png')
    expect(parsed?.bytes.toString()).toBe('hi')
  })
  it('returns null for non-data URLs', () => {
    expect(parseDataUrl('https://example.com/a.png')).toBeNull()
  })
})
