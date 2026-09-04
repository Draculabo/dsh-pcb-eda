// @vitest-environment jsdom
/**
 * DOM regression guard for the task-board-style sidebar entries.
 *
 * The two generator rows (封装生成 / Symbol 生成) are injected between the shell's
 * New Session button and the workspace browser (dsh-web pattern). This test
 * builds a minimal fake sidebar shell and asserts placement, order, semantic
 * attributes, click wiring and idempotency.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  mountComponentGenSidebarEntries,
  FOOTPRINT_ENTRY_SELECTOR,
  SYMBOL_ENTRY_SELECTOR,
} from '../src/client/sidebar-entry.js'
import type { SidebarRowOptions } from '../src/client/sidebar-entry.js'

/** Minimal dsh sidebar shell: column > root > logoRow(newSession). */
function mountShell(): HTMLElement {
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
  return root
}

function rows(): [SidebarRowOptions, SidebarRowOptions] {
  return [
    {
      selector: FOOTPRINT_ENTRY_SELECTOR,
      attribute: 'data-hqcg-footprint-entry',
      icon: '<svg viewBox="0 0 16 16"></svg>',
      label: '封装生成',
      tooltip: '打开封装生成',
      position: 'before',
      onToggle: () => {},
      isOpen: () => false,
    },
    {
      selector: SYMBOL_ENTRY_SELECTOR,
      attribute: 'data-hqcg-symbol-entry',
      icon: '<svg viewBox="0 0 16 16"></svg>',
      label: 'Symbol 生成',
      tooltip: '打开 Symbol 生成',
      position: 'after',
      onToggle: () => {},
      isOpen: () => false,
    },
  ]
}

describe('component-gen sidebar entries', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('injects both rows after New Session, footprint before symbol', () => {
    mountShell()
    const clicks: string[] = []
    const [footRow, symRow] = rows()
    footRow.onToggle = () => clicks.push('footprint')
    symRow.onToggle = () => clicks.push('symbol')
    const dispose = mountComponentGenSidebarEntries([footRow, symRow], () => () => {})

    const root = document.querySelector<HTMLElement>('[data-pane="sidebar"] > div')!
    const newBtn = root.querySelector<HTMLButtonElement>('button.newSession')!
    const foot = root.querySelector<HTMLElement>(FOOTPRINT_ENTRY_SELECTOR)!
    const sym = root.querySelector<HTMLElement>(SYMBOL_ENTRY_SELECTOR)!

    // Both placed after the New Session row (before the workspace browser).
    expect(foot).toBeTruthy()
    expect(sym).toBeTruthy()
    const following = (a: Element, b: Element): boolean =>
      (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
    expect(following(newBtn, foot)).toBe(true)
    expect(following(newBtn, sym)).toBe(true)
    // Deterministic order: footprint first, symbol second.
    expect(following(foot, sym)).toBe(true)

    // L2 semantic attributes.
    expect(foot.getAttribute('data-dsh-plugin')).toBe('huaqiu-component-gen')
    expect(foot.getAttribute('data-dsh-part')).toBe('sidebar-entry')
    // Labels rendered.
    expect(foot.textContent).toContain('封装生成')
    expect(sym.textContent).toContain('Symbol 生成')

    // Click wiring toggles the owning page.
    foot.click()
    sym.click()
    expect(clicks).toEqual(['footprint', 'symbol'])

    dispose()
  })

  it('is idempotent and reflects the active bridge on the open row', () => {
    mountShell()
    let footprintOpen = true
    // The core subscribes refresh + active for BOTH rows; keep every listener
    // and notify them all to simulate a real state change.
    const listeners = new Set<() => void>()
    const subscribe = (fn: () => void): (() => void) => {
      listeners.add(fn)
      return () => { listeners.delete(fn) }
    }
    const notify = (): void => { for (const fn of [...listeners]) fn() }
    const [footRow, symRow] = rows()
    footRow.isOpen = () => footprintOpen

    const dispose1 = mountComponentGenSidebarEntries([footRow, symRow], subscribe)
    const dispose2 = mountComponentGenSidebarEntries([footRow, symRow], subscribe)

    // Second mount must not duplicate the rows.
    expect(document.querySelectorAll(FOOTPRINT_ENTRY_SELECTOR).length).toBe(1)
    expect(document.querySelectorAll(SYMBOL_ENTRY_SELECTOR).length).toBe(1)

    // Active bridge drives the data-active highlight.
    const foot = document.querySelector<HTMLElement>(FOOTPRINT_ENTRY_SELECTOR)!
    const sym = document.querySelector<HTMLElement>(SYMBOL_ENTRY_SELECTOR)!
    expect(foot.hasAttribute('data-active')).toBe(true)
    expect(sym.hasAttribute('data-active')).toBe(false)

    // A state change (workspace closed) clears the highlight via the bridge.
    footprintOpen = false
    notify()
    expect(foot.hasAttribute('data-active')).toBe(false)
    footprintOpen = true
    notify()
    expect(foot.hasAttribute('data-active')).toBe(true)

    dispose1()
    dispose2()
  })

  it('removes the rows on dispose', () => {
    mountShell()
    const dispose = mountComponentGenSidebarEntries(rows(), () => () => {})
    expect(document.querySelectorAll(FOOTPRINT_ENTRY_SELECTOR).length).toBe(1)
    dispose()
    expect(document.querySelectorAll(FOOTPRINT_ENTRY_SELECTOR).length).toBe(0)
    expect(document.querySelectorAll(SYMBOL_ENTRY_SELECTOR).length).toBe(0)
  })
})
