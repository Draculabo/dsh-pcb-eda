// @vitest-environment jsdom
/**
 * Regression guard for the `needs_auth` login card's auth.eda.cn embed.
 *
 * This package is independently installable, so it owns a copy of the embed
 * URL contract (`src/client/login-url.ts`) instead of importing it from
 * `@huaqiu/dsh-auth`. These tests are what keeps the two copies honest.
 */
import { afterEach, describe, expect, it } from 'vitest'
import {
  AUTH_IFRAME_VERSION,
  LOGIN_IFRAME_HEIGHT,
  buildLoginUrl,
  loginIframeBackground,
} from '../src/client/login-url.js'
import { STYLE_ID, getLocale, injectStyles, removeStyles } from '../src/client/theme.js'

function paramsOf(url: string): URLSearchParams {
  return new URL(url).searchParams
}

describe('buildLoginUrl (symbol-footprint login card)', () => {
  it('targets auth.eda.cn with the shared contract version', () => {
    const url = new URL(buildLoginUrl())
    expect(`${url.origin}${url.pathname}`).toBe('https://auth.eda.cn/')
    expect(url.searchParams.get('v')).toBe(AUTH_IFRAME_VERSION)
  })

  it('uses FILL mode so the embed paints the card edge-to-edge', () => {
    // `fill=full` is what removes the embed's transparent 20px grid strips
    // (`grid-rows-[20px_1fr_20px]`), which otherwise show the card surface as
    // white gaps above and below the form in dark theme.
    const p = paramsOf(buildLoginUrl())
    expect(p.get('fill')).toBe('full')
    expect(p.get('clickOutsideToClose')).toBe('true')
  })

  it('defaults to the zh embed on the light scheme', () => {
    const p = paramsOf(buildLoginUrl())
    expect(p.get('locale')).toBe('cn')
    expect(p.get('lang')).toBe('zh')
    expect(p.get('theme')).toBe('light')
  })

  it('follows the host language and color scheme', () => {
    const p = paramsOf(buildLoginUrl({ lang: 'en', theme: 'dark' }))
    // `locale` is the param auth.eda.cn actually reads (its ids are cn / en);
    // `lang` is kept for parity with hq-eda-ai's LoginDialog.
    expect(p.get('locale')).toBe('en')
    expect(p.get('lang')).toBe('en')
    expect(p.get('theme')).toBe('dark')
  })

  it('falls back to supported values for unexpected runtime options', () => {
    const p = paramsOf(buildLoginUrl({ lang: 'fr', theme: 'sepia' } as never))
    expect({
      locale: p.get('locale'),
      lang: p.get('lang'),
      theme: p.get('theme'),
    }).toEqual({ locale: 'cn', lang: 'zh', theme: 'light' })
  })

  it('paints the iframe element with the host surface in both schemes', () => {
    // Blink falls back to WHITE until the embed's own CSS applies, which
    // flashes a white block in dark mode if the element is left unpainted.
    expect(loginIframeBackground(false)).toContain('#ffffff')
    expect(loginIframeBackground(true)).toContain('#20242c')
  })
})

describe('login iframe stylesheet', () => {
  afterEach(() => {
    removeStyles()
  })

  it('sizes the iframe from the shared constant and leaves the background themed', () => {
    injectStyles()
    const css = document.getElementById(STYLE_ID)?.textContent ?? ''
    expect(css).toContain(`.hq-genhit__login-iframe { width: 100%; height: ${LOGIN_IFRAME_HEIGHT}px;`)
    // No baked-in white background: that was the dark-mode "white frame".
    expect(css).not.toMatch(/login-iframe[^}]*background/)
    // No border: 1px on each side would shrink the embed viewport to 766px on
    // a 768px card, missing its `md:grid-cols` (Tailwind md = 768px)
    // breakpoint by 2px and silently falling back to a single column.
    expect(css).toMatch(/login-iframe[^}]*border: 0;/)
  })
})

describe('host locale sensing', () => {
  afterEach(() => {
    document.documentElement.removeAttribute('lang')
  })

  it('follows <html lang> (DSH writes zh-CN | en on every locale change)', () => {
    document.documentElement.setAttribute('lang', 'zh-CN')
    expect(getLocale()).toBe('zh')
    document.documentElement.setAttribute('lang', 'en-US')
    expect(getLocale()).toBe('en')
  })
})
