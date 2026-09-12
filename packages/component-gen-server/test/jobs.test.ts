import { describe, expect, it } from 'vitest'
import { JobStore } from '../src/jobs.js'

describe('JobStore', () => {
  it('rejects updates for unknown jobs', () => {
    const store = new JobStore()

    expect(() => store.update('missing-job', { status: 'running' }))
      .toThrowError(new Error('Job not found: missing-job'))
  })
})
