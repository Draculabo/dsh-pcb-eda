import { describe, expect, it } from 'vitest'
import { JobStore } from '../src/jobs.js'

describe('JobStore state snapshots', () => {
  it('does not expose mutable internal job state', () => {
    const store = new JobStore()
    const created = store.create({ kind: 'extract-footprint', input: {} }, {})
    const initial = { ...created }

    created.status = 'failed'
    expect(store.get(created.id)).toEqual(initial)

    const updated = store.update(created.id, {
      status: 'needs_confirmation',
      dimensions: { pitch: 2.54 },
      result: { artifact: { id: 'art_1' } },
    })
    const expected = {
      ...updated,
      dimensions: { pitch: 2.54 },
      result: { artifact: { id: 'art_1' } },
    }

    updated.dimensions!.pitch = 5.08
    const updatedArtifact = updated.result!.artifact as { id: string }
    updatedArtifact.id = 'art_changed'

    const fetched = store.get(created.id)!
    fetched.dimensions!.pitch = 7.62
    const fetchedArtifact = fetched.result!.artifact as { id: string }
    fetchedArtifact.id = 'art_fetched'

    expect(store.get(created.id)).toEqual(expected)
  })
})
