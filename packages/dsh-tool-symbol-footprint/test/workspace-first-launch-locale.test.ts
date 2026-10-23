// @vitest-environment jsdom
/**
 * Regression guard: the sidebar rows speak the host's RESOLVED language from
 * the very first launch — not the language the served markup happens to
 * declare, and not only after the user switches languages once.
 *
 * dsh ships `<html lang="en">` and rewrites it once `dsh-client-locale`
 * resolves the stored preference (or the browser language) at activation. Our
 * client bundle, though, is EVALUATED when its script loads — which can be
 * well before that rewrite — while the rows are only MOUNTED later, from
 * `apply()`. A language captured at evaluation time therefore survives into
 * the DOM: by the time the `<html lang>` observer starts, the rewrite is
 * already over, so nothing re-labels the rows until the next manual switch
 * (zh → en → zh "fixing" the text is exactly how the bug reported itself).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ComponentGenPorts } from '@huaqiu/component-gen-app'

// The real app would fetch history in jsdom; only the copy resolver matters
// here, and it must stay language-sensitive (`translateFor(lang)(key)`).
vi.mock('@huaqiu/component-gen-app', () => ({
  ComponentGenApp: () => null,
  createHttpPorts: (): ComponentGenPorts => ({}) as ComponentGenPorts,
  injectAppStyles: () => {},
  removeAppStyles: () => {},
  translateFor: (lang?: string) => (key: string) => `${lang === 'en' ? 'en' : 'zh'}:${key}`,
  translate: (lang?: string, key?: string) => `${lang === 'en' ? 'en' : 'zh'}:${key}`,
  defaultT: (key: string) => `zh:${key}`,
}))

/** Minimal dsh sidebar shell so the injected rows can anchor after New Session. */
function mountShell(): void {
  const column = document.createElement('div')
  column.setAttribute('data-pane', 'sidebar')
  const root = document.createElement('div')
  const logoRow = document.createElement('div')
  logoRow.className = 'logoRow'
  const newBtn = document.createElement('button')
  newBtn.className = 'newSession'
  newBtn.textContent = '新会话'
  logoRow.appendChild(newBtn)
  root.appendChild(logoRow)
  column.appendChild(root)
  document.body.appendChild(column)
}

/**
 * Load a fresh copy of the workspace module while the document still declares
 * `lang` — the first-launch state, where evaluation happens before dsh has
 * resolved the language preference.
 */
async function loadWorkspace(lang: string): Promise<typeof import('../src/client/workspace.jsx')> {
  document.documentElement.lang = lang
  vi.resetModules()
  return import('../src/client/workspace.jsx')
}

function rowText(selector: string): string {
  return document.querySelector<HTMLElement>(selector)!.textContent ?? ''
}

const FOOT = '[data-hqcg-footprint-entry]'
const SYMBOL = '[data-hqcg-symbol-entry]'

let dispose: (() => void) | undefined

beforeEach(() => {
  document.body.innerHTML = ''
  document.documentElement.lang = 'en'
})

afterEach(() => {
  dispose?.()
  dispose = undefined
  document.body.innerHTML = ''
  document.documentElement.lang = 'en'
})

describe('workspace sidebar copy on first launch', () => {
  it('labels the rows in the language dsh resolved after the bundle was evaluated', async () => {
    // Evaluation time: the served markup still declares `en`.
    const workspace = await loadWorkspace('en')
    mountShell()
    // dsh resolves the stored preference and rewrites <html lang> — BEFORE
    // the rows are mounted, so an observer started at mount cannot see it.
    document.documentElement.lang = 'zh-CN'

    dispose = workspace.installWorkspace({}, undefined)

    expect(rowText(FOOT)).toContain('zh:app.footprintTitle')
    expect(rowText(SYMBOL)).toContain('zh:app.symbolTitle')
    const foot = document.querySelector<HTMLElement>(FOOT)!
    expect(foot.getAttribute('aria-label')).toBe('zh:app.footprintTitle')
    expect(foot.getAttribute('title')).toBe('zh:app.footprintTooltip')
  })

  it('keeps following <html lang> once the row is mounted', async () => {
    const workspace = await loadWorkspace('zh-CN')
    mountShell()
    dispose = workspace.installWorkspace({}, undefined)
    expect(rowText(FOOT)).toContain('zh:app.footprintTitle')

    // A manual switch still rewrites <html lang> and must re-label the rows.
    document.documentElement.lang = 'en'
    await vi.waitFor(() => { expect(rowText(FOOT)).toContain('en:app.footprintTitle') })
    document.documentElement.lang = 'zh-CN'
    await vi.waitFor(() => { expect(rowText(FOOT)).toContain('zh:app.footprintTitle') })
  })
})
