/**
 * Login-state + result rendering helpers shared by the client React cards.
 *
 * Every style is a FUNCTION of the active color scheme: the cards are inline
 * styled (the client bundle ships no CSS file), so light/dark support has to
 * be expressed in JS. Colors prefer DSH's `--dsw-alias-*` tokens and fall back
 * to an explicit per-scheme value (see `sidebar-action.tsx`).
 */
import type { CSSProperties, ReactNode } from 'react'
import type { Translate } from '../i18n.js'

/** Tool result content block (subset of DSH `ContentBlock`). */
interface ContentBlockLike {
  type?: string
  text?: string
}

/** Structural tool-call block subset (we only read settled text content). */
export interface ToolBlockLike {
  content?: readonly ContentBlockLike[]
}

/** Best-effort JSON.parse of the tool's text output blocks. */
export function parseToolResult(block: ToolBlockLike | undefined): Record<string, unknown> | null {
  if (!block || !Array.isArray(block.content)) return null
  const text = block.content
    .filter((c): c is ContentBlockLike => !!c && c.type === 'text' && typeof c.text === 'string')
    .map((c) => c.text as string)
    .join('')
  if (!text) return null
  try {
    const parsed = JSON.parse(text) as unknown
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/** True when the parsed result is the auth-gate signal. */
export function isNeedsAuthResult(result: Record<string, unknown> | null): result is Record<string, unknown> & { status: 'needs_auth' } {
  return !!result && result.status === 'needs_auth'
}

export const AUTH_ORIGIN = 'https://auth.eda.cn'

/** Card colors for one color scheme (DSH token first, explicit fallback second). */
export interface CardPalette {
  surface: string
  border: string
  text: string
  muted: string
  success: string
  danger: string
}

export const LIGHT_CARD_PALETTE: CardPalette = {
  surface: 'var(--dsw-alias-bg-layer-1, #ffffff)',
  border: 'var(--dsw-alias-border-l1, #e4e7ec)',
  text: 'var(--dsw-alias-label-primary, inherit)',
  muted: 'var(--dsw-alias-label-secondary, #5b6472)',
  success: 'var(--dsw-alias-state-success-primary, #1677ff)',
  danger: 'var(--dsw-alias-state-error-primary, #d4380d)',
}

export const DARK_CARD_PALETTE: CardPalette = {
  surface: 'var(--dsw-alias-bg-layer-1, #20242c)',
  border: 'var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.14))',
  text: 'var(--dsw-alias-label-primary, #e6eaf0)',
  muted: 'var(--dsw-alias-label-secondary, #8b95a5)',
  success: 'var(--dsw-alias-state-success-primary, #4cc38a)',
  danger: 'var(--dsw-alias-state-error-primary, #ff7875)',
}

export function cardPalette(dark: boolean): CardPalette {
  return dark ? DARK_CARD_PALETTE : LIGHT_CARD_PALETTE
}

export function cardStyle(palette: CardPalette): CSSProperties {
  return {
    border: `1px solid ${palette.border}`,
    borderRadius: 10,
    padding: '12px 14px',
    margin: '4px 0',
    background: palette.surface,
    color: palette.text,
    fontFamily: 'inherit',
  }
}

export const TITLE_STYLE: CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  margin: '0 0 6px',
}

export const STATUS_STYLE: CSSProperties = {
  fontSize: 13,
  margin: '0 0 10px',
  lineHeight: 1.5,
}

/**
 * Iframe height for both the dialog and the toolview card. Tuned to the
 * auth.eda.cn login form's actual painted height (≈390px at 768px width,
 * measured with a magenta iframe element background so the embedded doc's
 * transparent top/bottom strips are obvious). The dialog and toolview both
 * use this same number for consistency.
 *
 * Note: the auth.eda.cn page wrapper is `grid-rows-[20px_1fr_20px]`, so the
 * embedded doc always leaves two 20px transparent strips above and below the
 * form — they are NOT additional empty space we can shave off; they are
 * always there in the embed's own layout. The 30px buffer above the 390px
 * content (→ 440) gives the form room to grow slightly on error states
 * without immediately overflowing.
 */
export const LOGIN_IFRAME_HEIGHT = 440

/**
 * The embedded login iframe: painted with the same surface as the wrapping
 * card so the login box blends in both schemes.
 *
 * Why not `background: transparent`? Blink's `BaseBackgroundColor()` falls
 * back to WHITE whenever the embedded doc's root element has a transparent
 * background (and auth.eda.cn's `data-iframe-mode` page is exactly that).
 * That white canvas shows through wherever the document doesn't paint, which
 * reads as a glaring white "frame" around the login card in dark mode. Light
 * mode hid the bug because the white canvas happened to match the light
 * host. Painting the iframe ELEMENT with the card's surface (DSH alias
 * `--dsw-alias-bg-layer-1` with a per-scheme fallback) puts a dark sheet in
 * dark mode and a light sheet in light mode, so the login card sits on a
 * surface that blends with the host in both schemes.
 */
export function iframeStyle(palette: CardPalette): CSSProperties {
  return {
    width: '100%',
    height: LOGIN_IFRAME_HEIGHT,
    border: `1px solid ${palette.border}`,
    borderRadius: 8,
    background: palette.surface,
    display: 'block',
  }
}

export function StatusLine({
  authenticated,
  nickname,
  palette,
  t,
}: {
  authenticated: boolean
  nickname?: string
  palette: CardPalette
  t: Translate
}): ReactNode {
  if (authenticated) {
    return (
      <p style={{ ...STATUS_STYLE, color: palette.success }}>
        {t('card.loggedIn', {
          nickname: nickname ? t('card.nicknameSep', { nickname }) : '',
        })}
      </p>
    )
  }
  return (
    <p style={{ ...STATUS_STYLE, color: palette.danger }}>
      {t('card.loggedOut')}
    </p>
  )
}
