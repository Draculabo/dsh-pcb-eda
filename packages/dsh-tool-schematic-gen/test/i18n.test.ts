import { describe, expect, it } from 'vitest'
import { COPY_KEYS, translate, type CopyKey } from '../src/client/i18n.js'

/** Placeholders (`{name}`) in a copy string, sorted for comparison. */
function placeholders(text: string): string[] {
  return (text.match(/\{(\w+)\}/g) ?? []).map((m) => m.slice(1, -1)).sort()
}

describe('card copy pack', () => {
  it('has a non-empty translation for every key in both languages', () => {
    expect(COPY_KEYS.length).toBeGreaterThan(0)
    for (const key of COPY_KEYS) {
      for (const locale of ['zh', 'en'] as const) {
        expect(translate(locale, key), `${locale}.${key}`).toBeTruthy()
      }
    }
  })

  it('uses the same placeholders in both languages', () => {
    for (const key of COPY_KEYS) {
      expect(placeholders(translate('en', key)), `en.${key}`).toEqual(
        placeholders(translate('zh', key)),
      )
    }
  })

  it('localizes the nickname separator instead of hardcoding the full-width colon', () => {
    expect(translate('zh', 'card.nicknameSep', { nickname: '老铁' })).toBe('：老铁')
    expect(translate('en', 'card.nicknameSep', { nickname: 'John' })).toBe(': John')
  })

  it('phrases the "I have logged in" reply in the reader\'s language', () => {
    // Regression guard: the en string used to embed the Chinese literal
    // "已登录，请重试", telling an English-speaking user to type Chinese.
    for (const key of ['card.auth.desc', 'card.auth.loggedIn'] as CopyKey[]) {
      expect(translate('en', key, { tool: 'x', nickname: '' })).toContain('I have logged in, please retry')
      expect(translate('en', key, { tool: 'x', nickname: '' })).not.toMatch(/已登录/)
      expect(translate('zh', key, { tool: 'x', nickname: '' })).toContain('已登录，请重试')
    }
  })

  it('falls back to zh for an unknown key', () => {
    expect(translate('en', 'card.status.generated')).toBe('Generated')
    expect(translate('en', 'nope.not.a.key')).toBe('nope.not.a.key')
  })
})
