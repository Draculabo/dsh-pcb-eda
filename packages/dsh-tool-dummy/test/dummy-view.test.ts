// @vitest-environment jsdom
/**
 * DOM tests for the dummy plugin's probe panel.
 *
 * Covers the single-instance guard, both close paths (button + Escape), and
 * the probe call itself — success renders the payload, failure renders the
 * reason. `fetch` is stubbed; jsdom provides the DOM.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  closeDummyView,
  DUMMY_VIEW_ATTRIBUTE,
  dummyCopy,
  openDummyView,
} from '../src/client/view.js'

const VIEW_SELECTOR = `[${DUMMY_VIEW_ATTRIBUTE}]`

beforeEach(() => {
  document.body.innerHTML = ''
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      new Response(JSON.stringify({ name: '@huaqiu/dsh-tool-dummy', version: '9.9.9' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    ),
  )
})

afterEach(() => {
  closeDummyView()
  vi.unstubAllGlobals()
})

describe('openDummyView', () => {
  it('opens a dialog panel and probes on open', async () => {
    openDummyView(dummyCopy('zh'))
    const panel = document.querySelector('.hqd-panel')
    expect(panel).not.toBeNull()
    expect(panel?.getAttribute('role')).toBe('dialog')
    expect(panel?.getAttribute('aria-modal')).toBe('true')
    await vi.waitFor(() => {
      expect(document.querySelector('.hqd-result')?.textContent).toContain('9.9.9')
    })
    expect(document.querySelector('.hqd-status')?.getAttribute('data-tone')).toBe('success')
  })

  it('is single-instance: a second open re-shows the same panel', () => {
    openDummyView(dummyCopy('zh'))
    const first = document.querySelector(VIEW_SELECTOR)
    openDummyView(dummyCopy('en'))
    expect(document.querySelectorAll(VIEW_SELECTOR)).toHaveLength(1)
    expect(document.querySelector(VIEW_SELECTOR)).toBe(first)
    expect(document.querySelector('.hqd-title')?.textContent).toBe('Dummy 插件')
  })

  it('closes via the close button', () => {
    openDummyView(dummyCopy('zh'))
    const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('.hqd-footer .hqd-btn'))
    const close = buttons.find((b) => b.textContent === '关闭')
    expect(close).toBeDefined()
    close?.click()
    expect(document.querySelector(VIEW_SELECTOR)).toBeNull()
  })

  it('closes on Escape', () => {
    openDummyView(dummyCopy('zh'))
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(document.querySelector(VIEW_SELECTOR)).toBeNull()
  })

  it('renders the failure reason when the probe request fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('boom')
      }),
    )
    openDummyView(dummyCopy('zh'))
    await vi.waitFor(() => {
      expect(document.querySelector('.hqd-status')?.textContent).toContain('boom')
    })
    expect(document.querySelector('.hqd-status')?.getAttribute('data-tone')).toBe('error')
    expect(document.querySelector<HTMLPreElement>('.hqd-result')?.hidden).toBe(true)
  })

  it('localizes the copy', () => {
    expect(dummyCopy('en').title).toBe('Dummy plugin')
    expect(dummyCopy('zh').title).toBe('Dummy 插件')
    expect(dummyCopy(undefined).title).toBe('Dummy 插件')
  })
})
