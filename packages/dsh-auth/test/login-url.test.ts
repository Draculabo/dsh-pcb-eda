// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAuthClient } from '../src/client/client.js'
import { createAuthStorage } from '../src/client/storage.js'
import { DIALOG_IFRAME_ATTR, closeLoginDialog } from '../src/client/ui/login-dialog.js'

describe('auth login URL configuration', () => {
  afterEach(() => {
    closeLoginDialog()
    localStorage.clear()
    document.body.innerHTML = ''
  })

  it('forwards the configured login URL to the dialog iframe', async () => {
    const client = createAuthClient({
      storage: createAuthStorage(localStorage),
      transport: {
        pushSession: vi.fn(async () => undefined),
        pushLogout: vi.fn(async () => undefined),
      },
      loginUrl: 'https://auth.example.test/login?tenant=pcb',
      windowLike: window,
      documentLike: document,
    })

    await client.auth.login({ lang: 'en', theme: 'dark' })

    const iframe = document.querySelector<HTMLIFrameElement>(`[${DIALOG_IFRAME_ATTR}]`)
    const url = new URL(iframe!.src)

    expect({
      origin: url.origin,
      pathname: url.pathname,
      tenant: url.searchParams.get('tenant'),
      locale: url.searchParams.get('locale'),
      lang: url.searchParams.get('lang'),
      theme: url.searchParams.get('theme'),
    }).toEqual({
      origin: 'https://auth.example.test',
      pathname: '/login',
      tenant: 'pcb',
      locale: 'en',
      lang: 'en',
      theme: 'dark',
    })

    client.dispose()
  })
})
