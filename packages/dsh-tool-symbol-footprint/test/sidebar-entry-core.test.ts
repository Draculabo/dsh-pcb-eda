// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mountSidebarEntry } from '../src/client/sidebar-entry-core.js'

describe('mountSidebarEntry', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('still mounts when the optional active-state subscription throws', () => {
    document.body.innerHTML = `
      <div data-pane="sidebar">
        <div>
          <div class="logoRow">
            <button class="newSession" type="button">New session</button>
          </div>
        </div>
      </div>
    `

    const onToggle = vi.fn()
    const dispose = mountSidebarEntry({
      rowAttribute: 'data-test-entry',
      rowSelector: '[data-test-entry]',
      icon: '<span>icon</span>',
      css: {},
      label: () => 'Test entry',
      onToggle,
      position: 'after',
      familySelectors: ['[data-test-entry]'],
      active: {
        subscribe: () => {
          throw new Error('subscription failed')
        },
        isOpen: () => false,
      },
    })

    const entry = document.querySelector<HTMLButtonElement>('[data-test-entry]')
    expect(entry).not.toBeNull()
    expect(entry?.getAttribute('aria-label')).toBe('Test entry')

    entry?.click()
    expect(onToggle).toHaveBeenCalledTimes(1)

    expect(() => dispose()).not.toThrow()
    expect(document.querySelector('[data-test-entry]')).toBeNull()
  })
})
