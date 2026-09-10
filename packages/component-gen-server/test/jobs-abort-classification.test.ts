import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ComponentGenBackend } from '../src/backend.js'
import { HistoryStore } from '../src/history.js'
import { JobStore, runGeneration } from '../src/jobs.js'

describe('runGeneration abort classification', () => {
  it('keeps backend failures containing abort text as failed jobs', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'hq-cga-'))
    try {
      const error = new Error('failed to abort remote upload')
      const backend: ComponentGenBackend = {
        async generateSymbol() {
          throw error
        },
        async extractFootprint() {
          throw error
        },
        async generateFootprint() {
          throw error
        },
      }
      const request = { kind: 'symbol' as const, input: {} }
      const store = new JobStore()
      const history = new HistoryStore(dir)
      const initial = store.create(request, {})

      const outcome = await runGeneration(store, backend, history, initial.id, request, {})

      expect(outcome).toEqual({
        state: {
          id: initial.id,
          kind: 'symbol',
          status: 'failed',
          createdAt: initial.createdAt,
          updatedAt: expect.any(String),
          progress: '正在生成 Symbol…',
          error: 'failed to abort remote upload',
        },
        recorded: true,
      })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('continues to classify AbortError failures as cancelled jobs', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'hq-cga-'))
    try {
      const error = new Error('The operation was aborted')
      error.name = 'AbortError'
      const backend: ComponentGenBackend = {
        async generateSymbol() {
          throw error
        },
        async extractFootprint() {
          throw error
        },
        async generateFootprint() {
          throw error
        },
      }
      const request = { kind: 'symbol' as const, input: {} }
      const store = new JobStore()
      const history = new HistoryStore(dir)
      const initial = store.create(request, {})

      const outcome = await runGeneration(store, backend, history, initial.id, request, {})

      expect(outcome).toEqual({
        state: {
          id: initial.id,
          kind: 'symbol',
          status: 'cancelled',
          createdAt: initial.createdAt,
          updatedAt: expect.any(String),
          progress: '正在生成 Symbol…',
        },
        recorded: true,
      })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
