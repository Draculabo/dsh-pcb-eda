import { describe, expect, it } from 'vitest'
import {
  DEFAULT_HITL_LOCALE,
  HITL_PACKS,
  hitlTranslate,
  resolveHitlLocale,
  type HitlCopyKey,
} from '../src/hitl-i18n.js'

const ZH_KEYS = Object.keys(HITL_PACKS.zh) as HitlCopyKey[]
const EN_KEYS = Object.keys(HITL_PACKS.en) as HitlCopyKey[]

/** `{name}` placeholders inside a copy string. */
function placeholders(text: string): string[] {
  return (text.match(/\{(\w+)\}/g) ?? []).map((m) => m.slice(1, -1)).sort()
}

describe('hitl locale packs', () => {
  it('are non-empty and cover the same keys in both languages', () => {
    expect(ZH_KEYS.length).toBeGreaterThan(0)
    expect(EN_KEYS.slice().sort()).toEqual(ZH_KEYS.slice().sort())
  })

  it('have no blank or key-only entries', () => {
    for (const key of ZH_KEYS) {
      expect(HITL_PACKS.zh[key].length).toBeGreaterThan(0)
      expect(HITL_PACKS.en[key].length).toBeGreaterThan(0)
    }
  })

  it('use the same placeholders in zh and en', () => {
    for (const key of ZH_KEYS) {
      expect(placeholders(HITL_PACKS.en[key])).toEqual(placeholders(HITL_PACKS.zh[key]))
    }
  })

  it('actually differ per language (a copy-pasted pack would be a silent bug)', () => {
    const identical = ZH_KEYS.filter((k) => HITL_PACKS.zh[k] === HITL_PACKS.en[k])
    // `header` is "封装"/"Footprint", so nothing should be identical.
    expect(identical).toEqual([])
  })
})

describe('resolveHitlLocale', () => {
  it('accepts ids and BCP-47 tags, case-insensitively', () => {
    expect(resolveHitlLocale('zh')).toBe('zh')
    expect(resolveHitlLocale('zh-CN')).toBe('zh')
    expect(resolveHitlLocale('zh_Hans')).toBe('zh')
    expect(resolveHitlLocale('EN-us')).toBe('en')
    expect(resolveHitlLocale('  en  ')).toBe('en')
  })

  it('falls back to the package default for anything else', () => {
    for (const value of [undefined, null, '', 'fr', 'ja', 42, {}]) {
      expect(resolveHitlLocale(value)).toBe(DEFAULT_HITL_LOCALE)
    }
  })
})

describe('hitlTranslate', () => {
  it('interpolates params and defaults to zh', () => {
    expect(hitlTranslate('en', 'confirm.question', { pkg: 'QFN' })).toBe(
      'Are these extracted QFN dimensions correct?',
    )
    expect(hitlTranslate(undefined, 'confirm.question', { pkg: 'QFN' })).toContain('QFN')
  })

  it('defaults to zh, matching the card copy', () => {
    expect(hitlTranslate(undefined, 'header')).toBe('封装')
    expect(hitlTranslate('en', 'header')).toBe('Footprint')
  })
})
