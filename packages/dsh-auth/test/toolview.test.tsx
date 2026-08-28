// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { HuaqiuToolView } from '../src/client/ui/needs-auth-toolview.jsx'
import { DARK_ATTRIBUTE, disposeUiEnv, syncUiEnv } from '../src/client/ui-env.js'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const mounted: Array<{ root: Root; container: HTMLElement }> = []

function setHostEnv(options: { dark?: boolean; lang?: string } = {}): void {
  if (options.dark) document.body.setAttribute(DARK_ATTRIBUTE, '')
  else document.body.removeAttribute(DARK_ATTRIBUTE)
  if (options.lang) document.documentElement.setAttribute('lang', options.lang)
  else document.documentElement.removeAttribute('lang')
  syncUiEnv()
}

function render(block: unknown): HTMLElement {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(<HuaqiuToolView toolName="gen_symbol" block={block as never} />)
  })
  mounted.push({ root, container })
  return container
}

function needsAuthBlock(): unknown {
  return { content: [{ type: 'text', text: '{"status":"needs_auth","kind":"symbol"}' }] }
}

function card(container: HTMLElement): HTMLElement {
  const el = container.firstElementChild as HTMLElement | null
  if (!el) throw new Error('card not rendered')
  return el
}

function iframe(container: HTMLElement): HTMLIFrameElement {
  const el = container.querySelector('iframe')
  if (!el) throw new Error('login iframe not rendered')
  return el as HTMLIFrameElement
}

beforeEach(() => {
  document.body.innerHTML = ''
  setHostEnv({ dark: false, lang: 'zh-CN' })
})

afterEach(() => {
  for (const { root, container } of mounted.splice(0)) {
    act(() => root.unmount())
    container.remove()
  }
  document.body.innerHTML = ''
  disposeUiEnv()
})

describe('HuaqiuToolView login card', () => {
  it('embeds the always-transparent login iframe in the host language and scheme', () => {
    const container = render(needsAuthBlock())
    const src = new URL(iframe(container).src)
    expect(`${src.origin}${src.pathname}`).toBe('https://auth.eda.cn/')
    expect(src.searchParams.get('transparent')).toBe('true')
    // `fill=full` is what repaints the embedded page's own background.
    expect(src.searchParams.get('fill')).toBeNull()
    expect(src.searchParams.get('locale')).toBe('cn')
    expect(src.searchParams.get('lang')).toBe('zh')
    expect(src.searchParams.get('theme')).toBe('light')
    expect(iframe(container).style.background).toBe('transparent')
  })

  it('follows the dark palette and the English locale', () => {
    setHostEnv({ dark: true, lang: 'en' })
    const container = render(needsAuthBlock())
    const src = new URL(iframe(container).src)
    expect(src.searchParams.get('theme')).toBe('dark')
    expect(src.searchParams.get('locale')).toBe('en')
    expect(container.textContent).toContain('Huaqiu EDA (eda.cn) login')
    expect(container.textContent).toContain('gen_symbol')
    expect(card(container).style.background).toBe('var(--dsw-alias-bg-layer-1, #20242c)')
  })

  it('renders the zh copy by default', () => {
    const container = render(needsAuthBlock())
    expect(container.textContent).toContain('华秋 EDA（eda.cn）登录')
    expect(container.textContent).toContain('未登录')
  })

  it('renders the JSON fallback (localized) for non-auth results', () => {
    const container = render({ content: [{ type: 'text', text: '{"status":"generated"}' }] })
    expect(container.querySelector('iframe')).toBeNull()
    expect(container.textContent).toContain('工具：gen_symbol')
    expect(container.textContent).toContain('"status": "generated"')
  })

  it('renders the localized empty marker when there is no result', () => {
    const container = render(undefined)
    expect(container.textContent).toContain('(无输出)')
    act(() => {
      setHostEnv({ lang: 'en' })
    })
    const en = render(undefined)
    expect(en.textContent).toContain('(no output)')
  })
})
