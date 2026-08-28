/**
 * The sidebar login dialog — a real modal (backdrop + centered card + iframe).
 *
 * WHY A DIALOG AND NOT A FULL-VIEWPORT IFRAME
 *
 * The embed (`auth.eda.cn`) reads only two URL params: `fill` and
 * `clickOutsideToClose`. With `fill !== 'full'` it sets
 * `data-iframe-mode="true"` on `<html>` and the CSS rule
 * `html[data-iframe-mode=true], html[data-iframe-mode=true] body { background: 0 0 !important }`
 * makes its root transparent — but the page wrapper still uses a
 * `grid-rows-[20px_1fr_20px]` layout, so the 20px strips above/below the
 * card are empty and show through to whatever is behind the iframe. Behind
 * the iframe element, with no background set, Blink falls back to a WHITE
 * base background canvas. That white is what was reading as a "white frame
 * around the login card in dark mode" (and was invisibly there in light
 * mode, blending with the white host).
 *
 * The two ways out:
 *   1. Paint the iframe element with a color → in a full-viewport iframe
 *      that blanks the whole app with that color (light surface = white
 *      blocks the light host; dark surface = dark blocks the dark host).
 *   2. Make the iframe CARD-SIZED and put it inside a host-painted card,
 *      so the iframe's background can be `transparent` and the card's
 *      surface shows through wherever the embedded doc is transparent.
 *      This is the pattern the toolview card already uses
 *      (`needs-auth-toolview.tsx`) and the pattern `hq-eda-ai`'s
 *      `LoginDialog.tsx` uses.
 *
 * We use (2): a fixed full-viewport backdrop (semi-transparent black) +
 * centered card (host surface bg) + the iframe (transparent inner doc,
 * card surface as element bg so Blink's white canvas never reaches the
 * user). Click on the backdrop, the × button, Escape, or the auth embed's
 * own `close_dialog` postMessage closes the dialog.
 */
import { LOGIN_IFRAME_HEIGHT } from './common.js'
import { buildLoginUrl, type AuthLocale, type AuthTheme } from '../lib.js'
import { translate } from '../i18n.js'
import { getCurrentLocale, getCurrentSurfaceColor, subscribeUiEnv, syncUiEnv } from '../ui-env.js'

/** Aria / data attribute names — stable so tests and CSS can target them. */
export const DIALOG_OVERLAY_ATTR = 'data-hq-auth-dialog'
export const DIALOG_CARD_ATTR = 'data-hq-auth-dialog-card'
export const DIALOG_IFRAME_ATTR = 'data-hq-auth-dialog-iframe'
export const DIALOG_CLOSE_ATTR = 'data-hq-auth-dialog-close'

/**
 * Iframe height. Tuned to the auth.eda.cn login form's actual painted height
 * (≈390px at 768px width, measured with a magenta iframe element background
 * so the embedded doc's transparent 20px top/bottom strips are obvious). The
 * shared constant lives in `./common.jsx` so the dialog and the toolview
 * card stay in lock-step.
 */
const IFRAME_HEIGHT = LOGIN_IFRAME_HEIGHT
const CARD_MAX_WIDTH = 768

let container: HTMLDivElement | null = null
let unsubscribe: (() => void) | null = null
let onCloseRequested: (() => void) | null = null

/**
 * Open the login dialog. Idempotent: a second call while open is a no-op
 * (mirrors the client-side `if (iframe) return` guard). `onClose` fires
 * whenever the dialog closes for ANY reason (backdrop click, Escape, close
 * button, postMessage, programmatic close) — the auth client uses it to
 * unblock its own `isOpen` state.
 */
export function openLoginDialog(options: { lang?: AuthLocale; theme?: AuthTheme } = {}, onClose?: () => void): void {
  if (container) return
  // The ui-env module reads the DOM once at import time. Re-read here so
  // the dialog picks up the current theme even if no React component has
  // subscribed yet (e.g. when the sidebar opens the dialog before any
  // card has mounted), or when a test sets the attribute after import.
  syncUiEnv()
  const locale = options.lang ?? getCurrentLocale()

  const root = document.createElement('div')
  root.setAttribute(DIALOG_OVERLAY_ATTR, '')
  // Backdrop: dim the host without blanking it. Theme-agnostic — rgba black
  // works on both light and dark hosts.
  root.style.cssText = [
    'position:fixed',
    'inset:0',
    'width:100vw',
    'height:100vh',
    'border:0',
    'z-index:2147483647',
    'background:rgba(0, 0, 0, 0.55)',
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'box-sizing:border-box',
  ].join(';')

  const card = document.createElement('div')
  card.setAttribute(DIALOG_CARD_ATTR, '')
  const applyCardColors = (): void => {
    const surface = getCurrentSurfaceColor()
    // No card border: a 1px border on each side would shrink the iframe's
    // viewport to 766px on a 768px card, missing the embed's `md:grid-cols`
    // (Tailwind `md` = 768px) threshold by 2px and silently falling back to
    // a single-column layout. The card's box-shadow already gives the card
    // a clear visual edge against the dimmed host.
    card.style.cssText = [
      `width:min(100vw, ${CARD_MAX_WIDTH}px)`,
      // Card height = iframe height exactly. A taller card would leave a
      // strip of card surface below the form (the flex column has only one
      // child, the iframe, so any extra height piles up at the bottom).
      `height:min(90vh, ${IFRAME_HEIGHT}px)`,
      'border-radius:12px',
      'box-shadow:0 24px 48px rgba(0, 0, 0, 0.32)',
      'position:relative',
      'box-sizing:border-box',
      `background:${surface}`,
      'display:flex',
      'flex-direction:column',
    ].join(';')
  }
  applyCardColors()

  const closeButton = document.createElement('button')
  closeButton.setAttribute(DIALOG_CLOSE_ATTR, '')
  closeButton.type = 'button'
  closeButton.setAttribute('aria-label', translate(locale, 'dialog.close'))
  closeButton.title = translate(locale, 'dialog.close')
  closeButton.textContent = '×'
  closeButton.style.cssText = [
    'position:absolute',
    'top:6px',
    'right:10px',
    'width:28px',
    'height:28px',
    'border:0',
    'background:transparent',
    'color:var(--dsw-alias-label-secondary, #5b6472)',
    'font-size:22px',
    'line-height:1',
    'cursor:pointer',
    'border-radius:6px',
    'padding:0',
  ].join(';')
  closeButton.addEventListener('click', closeLoginDialog)

  const iframe = document.createElement('iframe')
  iframe.setAttribute(DIALOG_IFRAME_ATTR, '')
  iframe.src = buildLoginUrl({ lang: options.lang, theme: options.theme })
  iframe.title = translate(locale, 'card.title')
  iframe.allow = 'clipboard-write'
  // The iframe element background = the card surface. That is what masks
  // Blink's white base canvas in the embedded doc's transparent strips
  // (see file header). The embedded doc itself is transparent because
  // buildLoginUrl never sends `fill=full`.
  iframe.style.cssText = [
    'width:100%',
    `height:${IFRAME_HEIGHT}px`,
    'border:0',
    'border-radius:8px',
    `background:${getCurrentSurfaceColor()}`,
    'display:block',
    'flex:0 0 auto',
  ].join(';')

  card.appendChild(closeButton)
  card.appendChild(iframe)
  root.appendChild(card)
  document.body.appendChild(root)

  // Backdrop click: close ONLY when the click lands on the backdrop itself,
  // not on the card. The card stops propagation in its own click handler.
  root.addEventListener('mousedown', backdropMouseDown)
  card.addEventListener('mousedown', stopPropagation)
  document.addEventListener('keydown', onKeyDown)

  // React to theme/locale flips so the card surface + iframe background
  // track the host (a mid-session switch while the dialog is open would
  // otherwise leave a stale-colored card).
  unsubscribe = subscribeUiEnv(() => {
    if (!container) return
    applyCardColors()
    iframe.style.background = getCurrentSurfaceColor()
    closeButton.title = translate(getCurrentLocale(), 'dialog.close')
    closeButton.setAttribute('aria-label', closeButton.title)
  })

  container = root
  onCloseRequested = onClose ?? null
}

/** Programmatic close (used by the auth client after a successful login). */
export function closeLoginDialog(): void {
  if (!container) return
  container.remove()
  container = null
  document.removeEventListener('keydown', onKeyDown)
  unsubscribe?.()
  unsubscribe = null
  const cb = onCloseRequested
  onCloseRequested = null
  cb?.()
}

/** True while the dialog is mounted. */
export function isLoginDialogOpen(): boolean {
  return container !== null
}

function backdropMouseDown(event: MouseEvent): void {
  if (event.target === container) closeLoginDialog()
}

function stopPropagation(event: MouseEvent): void {
  event.stopPropagation()
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.stopPropagation()
    closeLoginDialog()
  }
}
