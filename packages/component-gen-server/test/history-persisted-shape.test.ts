import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { HistoryStore } from '../src/history.js'
import type { HistoryEntry } from '../src/types.js'

describe('HistoryStore persisted shape', () => {
  it('recovers from a non-array history file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'hq-cga-history-'))

    try {
      writeFileSync(join(dir, 'history.json'), JSON.stringify({ entries: [] }), 'utf8')

      const store = new HistoryStore(dir)
      expect(await store.list({})).toEqual({ entries: [], nextCursor: null })

      const entry: HistoryEntry = {
        id: 'hst_valid',
        kind: 'footprint',
        createdAt: '2026-01-01T00:00:00.000Z',
        status: 'generated',
        input: { packageType: 'BGA100' },
      }
      await store.append(entry)

      expect(JSON.parse(readFileSync(join(dir, 'history.json'), 'utf8'))).toEqual([entry])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
