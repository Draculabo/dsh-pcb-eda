/**
 * `@huaqiu/component-gen-app` — unit tests for pure helpers.
 *
 * The component tree needs a DOM, so these target the DOM-free utilities only.
 */
import { describe, expect, it } from 'vitest'
import { defaultArtifactsBase, parseEvent } from '../src/api/component-gen-client.js'
import { humanizeKey } from '../src/utils/labels.js'
import { translateFor } from '../src/copy/index.js'

describe('defaultArtifactsBase', () => {
  it('derives the artifacts base from the component-gen base', () => {
    expect(defaultArtifactsBase('/api/v1/huaqiu/component-gen')).toBe('/api/v1/huaqiu/artifacts')
    expect(defaultArtifactsBase('/api/v1/huaqiu/component-gen/')).toBe('/api/v1/huaqiu/artifacts')
  })
})

describe('parseEvent', () => {
  it('parses an SSE frame', () => {
    const frame = 'event: progress\ndata: {"type":"progress","message":"ok","at":"2026-01-01T00:00:00Z"}\n\n'
    const evt = parseEvent(frame)
    expect(evt?.type).toBe('progress')
    expect(evt?.message).toBe('ok')
  })
  it('returns null for an empty frame', () => {
    expect(parseEvent('')).toBeNull()
  })
  it('rejects JSON values that are not job event objects', () => {
    expect(parseEvent('data: "unexpected"')).toBeNull()
    expect(parseEvent('data: [{"type":"progress"}]')).toBeNull()
    expect(parseEvent('data: {"message":"missing type"}')).toBeNull()
  })
})

describe('humanizeKey', () => {
  it('humanizes camelCase keys', () => {
    expect(humanizeKey('a1Min')).toBe('A1 Min')
    expect(humanizeKey('pitch_d')).toBe('Pitch d')
  })
})

describe('translateFor', () => {
  it('returns Chinese by default and English on demand', () => {
    const zh = translateFor('zh')
    const en = translateFor('en')
    expect(zh('card.submit')).toBeTruthy()
    expect(typeof en('card.submit')).toBe('string')
  })
})
