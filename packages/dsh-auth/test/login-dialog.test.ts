// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import {
  DIALOG_IFRAME_ATTR,
  closeLoginDialog,
  openLoginDialog,
} from '../src/client/ui/login-dialog.js'

const DARK_ATTRIBUTE = 'data-ds-dark-theme'

describe('login dialog host defaults', () => {
  afterEach(() => {
    closeLoginDialog()
    document.body.removeAttribute(DARK_ATTRIBUTE)
    document.documentElement.removeAttribute('lang')
  })

  it('inherits the current host locale and theme when options are omitted', () => {
    document.documentElement.setAttribute('lang', 'en')
    document.body.setAttribute(DARK_ATTRIBUTE, '')

    openLoginDialog()

    const iframe = document.querySelector<HTMLIFrameElement>(`[${DIALOG_IFRAME_ATTR}]`)
    const src = new URL(iframe!.src)
    expect(Object.fromEntries(src.searchParams.entries())).toMatchObject({
      locale: 'en',
      lang: 'en',
      theme: 'dark',
    })
  })
})
