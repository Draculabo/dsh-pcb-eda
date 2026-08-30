import { describe, expect, it } from 'vitest'
import { COPY_KEYS, FIELD_LABEL_KEY, translate, type CopyKey } from '../src/client/i18n.js'
import { fieldLabel, humanizeKey } from '../src/client/parse.js'

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
    // zh uses '：' (no space); en uses ': ' — hardcoding one made the other
    // locale read "Logged in：John" / "已登录: John".
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
})

describe('fieldLabel', () => {
  const zh = (key: string, params?: Record<string, unknown>) => translate('zh', key, params)
  const en = (key: string, params?: Record<string, unknown>) => translate('en', key, params)

  it('resolves canonical dimension keys to localized labels', () => {
    expect(fieldLabel('body_width', zh)).toBe('本体宽')
    expect(fieldLabel('body_width', en)).toBe('Body width')
    expect(fieldLabel('pitch', zh)).toBe('间距')
    expect(fieldLabel('pin_count', en)).toBe('Pin count')
    expect(fieldLabel('standoff', zh)).toBe('抬升高度')
  })

  it('is separator- and case-insensitive', () => {
    // `body_width`, `bodyWidth` and `Body Width` are the same dimension.
    const variants = ['body_width', 'bodyWidth', 'Body Width', 'BODYWIDTH']
    for (const variant of variants) {
      expect(fieldLabel(variant, en)).toBe('Body width')
    }
  })

  it('localizes the _max / _min bounds suffix', () => {
    expect(fieldLabel('body_length_max', zh)).toBe('本体长（最大）')
    expect(fieldLabel('body_length_min', zh)).toBe('本体长（最小）')
    expect(fieldLabel('W_max', en)).toBe('Width (max)')
    expect(fieldLabel('L_MIN', en)).toBe('Length (min)')
  })

  it('falls back to humanizeKey for keys outside the vocabulary', () => {
    // The agent can emit arbitrary dimension names, so the fallback must stay.
    expect(fieldLabel('some_unknown_dim', en)).toBe(humanizeKey('some_unknown_dim'))
    expect(fieldLabel('some_unknown_dim', en)).toBe('Some unknown dim')
  })

  it('maps every FIELD_LABEL_KEY value to a key that exists in both packs', () => {
    for (const copyKey of Object.values(FIELD_LABEL_KEY)) {
      expect(COPY_KEYS).toContain(copyKey)
      expect(translate('en', copyKey)).toBeTruthy()
      expect(translate('zh', copyKey)).toBeTruthy()
    }
  })
})
