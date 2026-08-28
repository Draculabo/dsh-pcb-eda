// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { DARK_ATTRIBUTE, disposeUiEnv, syncUiEnv, useColorScheme, useIsDark, useLocale } from '../src/client/ui-env.js'
import { AUTH_COPY_KEYS, createT, translate, useT, type AuthCopyKey } from '../src/client/i18n.js'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/** Render a tiny probe component and read the hook values out of it. */
function probe<T>(hook: () => T): { read: () => T; unmount: () => void } {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root: Root = createRoot(container)
  let value!: T
  function Probe(): null {
    value = hook()
    return null
  }
  act(() => {
    root.render(<Probe />)
  })
  return {
    read: () => value,
    unmount: () => {
      act(() => root.unmount())
      container.remove()
    },
  }
}

function setHtmlLang(lang: string | null): void {
  if (lang === null) document.documentElement.removeAttribute('lang')
  else document.documentElement.setAttribute('lang', lang)
}

beforeEach(() => {
  document.body.removeAttribute(DARK_ATTRIBUTE)
  document.documentElement.removeAttribute('data-theme')
  document.documentElement.className = ''
  setHtmlLang(null)
  syncUiEnv()
})

afterEach(() => {
  disposeUiEnv()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('ui-env theme sensing', () => {
  it('is light by default and dark once DSH marks the body', () => {
    const p = probe(useIsDark)
    expect(p.read()).toBe(false)

    act(() => {
      document.body.setAttribute(DARK_ATTRIBUTE, '')
    })
    // The MutationObserver fires async; syncUiEnv() is the deterministic path.
    act(() => {
      syncUiEnv()
    })
    expect(p.read()).toBe(true)

    act(() => {
      document.body.removeAttribute(DARK_ATTRIBUTE)
      syncUiEnv()
    })
    expect(p.read()).toBe(false)
    p.unmount()
  })

  it('tracks the body attribute through the MutationObserver', async () => {
    const p = probe(useIsDark)
    document.body.setAttribute(DARK_ATTRIBUTE, '')
    await act(async () => {
      await Promise.resolve()
    })
    expect(p.read()).toBe(true)
    p.unmount()
  })

  it('falls back to html[data-theme] / .dark for hosts that mark <html>', () => {
    const p = probe(useIsDark)
    act(() => {
      document.documentElement.setAttribute('data-theme', 'dark')
      syncUiEnv()
    })
    expect(p.read()).toBe(true)
    act(() => {
      document.documentElement.removeAttribute('data-theme')
      document.documentElement.classList.add('dark')
      syncUiEnv()
    })
    expect(p.read()).toBe(true)
    p.unmount()
  })

  it('maps the color scheme to auth.eda.cn vocabulary', () => {
    const p = probe(useColorScheme)
    expect(p.read()).toBe('light')
    act(() => {
      document.body.setAttribute(DARK_ATTRIBUTE, '')
      syncUiEnv()
    })
    expect(p.read()).toBe('dark')
    p.unmount()
  })
})

describe('ui-env locale sensing', () => {
  it('reads <html lang> (what dsh-client-locale writes: zh-CN / en)', () => {
    const p = probe(useLocale)
    act(() => {
      setHtmlLang('en')
      syncUiEnv()
    })
    expect(p.read()).toBe('en')
    act(() => {
      setHtmlLang('zh-CN')
      syncUiEnv()
    })
    expect(p.read()).toBe('zh')
    p.unmount()
  })

  it('falls back to the browser languages when the document says nothing', () => {
    vi.stubGlobal('navigator', { languages: ['en-GB', 'zh'], language: 'en-GB' })
    const p = probe(useLocale)
    act(() => {
      syncUiEnv()
    })
    expect(p.read()).toBe('en')
    p.unmount()
  })

  it('defaults to zh when neither the document nor the browser says anything', () => {
    vi.stubGlobal('navigator', { languages: [], language: undefined })
    const p = probe(useLocale)
    act(() => {
      syncUiEnv()
    })
    expect(p.read()).toBe('zh')
    p.unmount()
  })
})

describe('i18n', () => {
  it('has a non-empty translation for every key in both languages', () => {
    expect(AUTH_COPY_KEYS.length).toBeGreaterThan(0)
    for (const key of AUTH_COPY_KEYS) {
      for (const locale of ['zh', 'en'] as const) {
        expect(translate(locale, key), `${locale}.${key}`).toBeTruthy()
      }
    }
  })

  it('translates and interpolates params', () => {
    expect(translate('zh', 'menu.profile')).toBe('个人中心')
    expect(translate('en', 'menu.profile')).toBe('Go to profile')
    expect(translate('zh', 'menu.logout')).toBe('退出登录')
    expect(translate('en', 'menu.logout')).toBe('Log out')
    expect(translate('en', 'card.tool', { tool: 'gen_symbol' })).toBe('Tool: gen_symbol')
    expect(translate('zh', 'card.tool', { tool: 'gen_symbol' })).toBe('工具：gen_symbol')
  })

  it('useT() follows the host locale', () => {
    act(() => {
      setHtmlLang('en')
      syncUiEnv()
    })
    const en = probe(useT)
    expect(en.read()('menu.profile')).toBe('Go to profile')
    expect(en.read()('sidebar.login')).toBe('Huaqiu EDA login')
    en.unmount()

    act(() => {
      setHtmlLang('zh-CN')
      syncUiEnv()
    })
    const zh = probe(useT)
    expect(zh.read()('menu.profile')).toBe('个人中心')
    expect(zh.read()('card.loggedIn', { nickname: '：老铁' })).toContain('老铁')
    zh.unmount()
  })

  it('leaves unknown placeholders intact and falls back to zh / the key', () => {
    expect(translate('en', 'card.desc', {})).toContain('{tool}')
    const t = createT('zh')
    // A key missing from both dictionaries stays visible (fail loud, not blank).
    expect(t('nope.missing' as AuthCopyKey)).toBe('nope.missing')
  })
})
