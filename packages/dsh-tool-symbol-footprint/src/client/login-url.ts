/**
 * auth.eda.cn embed URL contract for the `needs_auth` login card.
 *
 * SELF-CONTAINED ON PURPOSE: this package must stay independently
 * installable, so it duplicates the ~40 lines of URL contract from
 * `@huaqiu/dsh-auth` (`src/client/lib.ts`) instead of importing them. Keep
 * the two in sync — `AUTH_IFRAME_VERSION` in particular is a shared
 * cache-buster with the web app (`hq-eda-ai` LoginDialog).
 *
 * The embed has two rendering modes and this card uses FILL mode:
 *
 * - **Fill mode** (`fill=full`) — the embed's `DialogContent` becomes
 *   `w-full h-full max-w-none max-h-none left-0 top-0 rounded-none border-none`
 *   (`eda-cn-login/components/LoginDialog.tsx`, `fillFull` branch) and the
 *   page wrapper drops `bg-transparent`, so the embed paints its own
 *   `bg-background` edge-to-edge. That is what this card wants: the iframe
 *   IS the surface, and fill mode is what removes the white gaps above and
 *   below the form that the transparent mode's `grid-rows-[20px_1fr_20px]`
 *   strips would otherwise leave showing the host surface.
 * - **Transparent card mode** (no `fill`) — used by the sidebar-triggered
 *   login dialog in `dsh-auth`, which paints its own host-colored card
 *   around the iframe. Not used here.
 */

export const AUTH_ORIGIN = 'https://auth.eda.cn'

/**
 * Contract version of the auth.eda.cn embed, shared with the web app
 * (`hq-eda-ai` LoginDialog) and `dsh-auth` so all three send the same
 * cache-busting `v=`.
 */
export const AUTH_IFRAME_VERSION = '20260409'

/**
 * Iframe height. Sized so the embed's two-column layout (WeChat QR + phone
 * form, which needs an iframe viewport ≥768px — Tailwind's `md` breakpoint)
 * plus the agreement checkbox fits without an internal scrollbar.
 */
export const LOGIN_IFRAME_HEIGHT = 440

/** UI language of the auth.eda.cn embed. */
export type AuthLocale = 'zh' | 'en'

/** Color scheme of the auth.eda.cn embed (its own vocabulary). */
export type AuthTheme = 'light' | 'dark'

/**
 * auth.eda.cn's own language ids, keyed by our locale id. The embed's
 * `LanguageContext.getLangFromUrl` only accepts these two ids from
 * `locales/index.ts`; anything else silently falls back to the browser
 * language. `lang=zh` (what hq-eda-ai sends) is ignored for the same reason,
 * but we send it too for parity and forward compatibility.
 */
export const AUTH_LOCALE_ID: Record<AuthLocale, string> = { zh: 'cn', en: 'en' }

export interface LoginUrlOptions {
  /** Embed UI language (default `zh`). */
  lang?: AuthLocale
  /** Embed color scheme (default `light`). */
  theme?: AuthTheme
}

/**
 * Build the auth.eda.cn embed URL for this card: FILL mode, closing on an
 * outside click, in the host's language and color scheme.
 */
export function buildLoginUrl(options: LoginUrlOptions = {}): string {
  const url = new URL(`${AUTH_ORIGIN}/`)
  url.searchParams.set('v', AUTH_IFRAME_VERSION)
  url.searchParams.set('clickOutsideToClose', 'true')
  // Fill mode: the card IS the surface, so let the embed paint it.
  url.searchParams.set('fill', 'full')
  const lang = options.lang ?? 'zh'
  url.searchParams.set('locale', AUTH_LOCALE_ID[lang])
  url.searchParams.set('lang', lang)
  url.searchParams.set('theme', options.theme ?? 'light')
  return url.toString()
}

/**
 * Background for the iframe ELEMENT, matching the host surface.
 *
 * Even in fill mode the element needs a surface color: Blink's
 * `BaseBackgroundColor()` falls back to WHITE until the embed's own CSS
 * applies, which flashes a white block in dark mode on every card mount.
 * The DSH alias token is preferred so custom host themes are honored, with a
 * per-scheme fallback.
 */
export function loginIframeBackground(dark: boolean): string {
  return dark ? 'var(--dsw-alias-bg-layer-1, #20242c)' : 'var(--dsw-alias-bg-layer-1, #ffffff)'
}
