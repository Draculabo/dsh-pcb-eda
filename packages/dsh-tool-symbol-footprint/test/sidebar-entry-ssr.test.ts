import { describe, expect, it } from 'vitest'
import { mountSidebarEntry } from '../src/client/sidebar-entry-core.js'

describe('mountSidebarEntry without a DOM', () => {
  it('returns a safe disposer instead of touching browser globals', () => {
    const dispose = mountSidebarEntry({
      rowAttribute: 'data-test-entry',
      rowSelector: '[data-test-entry]',
      icon: '<svg></svg>',
      css: {},
      label: () => 'Test entry',
      onToggle: () => {},
      position: 'after',
      familySelectors: ['[data-test-entry]'],
    })

    expect(typeof dispose).toBe('function')
    expect(() => dispose()).not.toThrow()
  })
})
