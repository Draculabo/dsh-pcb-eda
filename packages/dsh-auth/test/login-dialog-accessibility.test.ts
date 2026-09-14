// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import {
  DIALOG_IFRAME_ATTR,
  DIALOG_OVERLAY_ATTR,
  closeLoginDialog,
  openLoginDialog,
} from '../src/client/ui/login-dialog.js'

describe('login dialog accessibility', () => {
  afterEach(() => {
    closeLoginDialog()
    document.body.innerHTML = ''
  })

  it('exposes modal dialog semantics with an accessible name', () => {
    openLoginDialog({ lang: 'en' })

    const dialog = document.querySelector<HTMLElement>(`[${DIALOG_OVERLAY_ATTR}]`)
    const iframe = document.querySelector<HTMLIFrameElement>(`[${DIALOG_IFRAME_ATTR}]`)

    expect(dialog).not.toBeNull()
    expect(dialog?.getAttribute('role')).toBe('dialog')
    expect(dialog?.getAttribute('aria-modal')).toBe('true')
    expect(dialog?.getAttribute('aria-label')).toBe(iframe?.title)
    expect(dialog?.getAttribute('aria-label')).not.toBe('')
  })
})
