import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { HistoryStore } from '../src/history.js'
import type { HistoryEntry } from '../src/types.js'

describe('HistoryStore invalid limit handling', () => {
  it('falls back to the default page size for NaN limits', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'hq-cga-'))

    try {
      const store = new HistoryStore(dir)
      const entries: HistoryEntry[] = Array.from({ length: 21 }, (_, index) => ({
        id: `hst_${index}`,
        kind: 'footprint',
        createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
        status: 'generated',
        input: { packageType: `PKG${index}` },
      }))

      for (const entry of entries) {
        await store.append(entry)
      }

      const page = await store.list({ limit: Number.NaN })

      expect(page).toEqual({
        entries: [...entries].reverse().slice(0, 20),
        nextCursor: 'hst_1',
      })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
