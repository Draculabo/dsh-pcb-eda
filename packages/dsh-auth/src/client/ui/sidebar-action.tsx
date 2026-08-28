/**
 * `sidebar.footer.action` entry: the Huaqiu EDA account trigger at the bottom
 * of the DSH sidebar (beside Settings).
 *
 * - Not logged in: shows the HQ icon and opens the login dialog through
 *   `auth.login({ lang, theme })` — a real modal (backdrop + centered card +
 *   auth.eda.cn iframe) that is ALWAYS TRANSPARENT in the embed itself
 *   (`fill=full` is never sent, see `lib.ts#buildLoginUrl`), and the card
 *   surface masks Blink's white base canvas so the login card floats over
 *   the dimmed app in both light and dark themes. `lang`/`theme` follow the
 *   host UI. Click on the backdrop, the × button, or Escape closes it, and
 *   auth.eda.cn's own `close_dialog` postMessage closes it as well.
 * - Logged in: the trigger becomes the user's AVATAR (`headimage` from the
 *   auth.eda.cn payload, HQ icon while it is missing/fails to load) and a click
 *   opens a context menu with「Go to profile」(the eda.cn account page, with
 *   the access token) and「Log out」— the same shape as `hq-eda-ai`'s
 *   `UserMenu`, portalled to `document.body` with fixed positioning so the
 *   sidebar's `overflow: hidden` can never clip it.
 *
 * THEMING: colors prefer DSH's `--dsw-alias-*` tokens (so a custom host theme
 * is honored) and fall back to an explicit light/dark pair chosen from
 * `useIsDark()`; the two paths cannot disagree, because ui-layout's presenter
 * writes `body[data-ds-dark-theme]` from the very snapshot that installs those
 * tokens.
 */
import { memo, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { getAuth, getAuthState, subscribeAuth } from '../auth-state.js'
import { buildProfileUrl } from '../lib.js'
import { useIsDark, useLocale } from '../ui-env.js'
import { useT } from '../i18n.js'
import { HQ_ICON } from './hq-icon.jsx'

export interface SidebarFooterActionOwnerProps {
  wide?: boolean
}

const AVATAR_SIZE = 26
const ICON_SIZE = 22

/** One color scheme's menu colors (DSH token first, explicit fallback second). */
interface Palette {
  surface: string
  border: string
  text: string
  muted: string
  hover: string
  danger: string
  dangerHover: string
  avatarBg: string
  shadow: string
}

const LIGHT_PALETTE: Palette = {
  surface: 'var(--dsw-alias-bg-overlay, #ffffff)',
  border: 'var(--dsw-alias-border-l1, #e4e7ec)',
  text: 'var(--dsw-alias-label-primary, #3a4356)',
  muted: 'var(--dsw-alias-label-secondary, #8a94a6)',
  hover: 'var(--dsw-alias-interactive-bg-hover, #f5f7fa)',
  danger: 'var(--dsw-alias-state-error-primary, #d4380d)',
  dangerHover: 'rgba(216, 56, 13, 0.08)',
  avatarBg: 'var(--dsw-alias-bg-layer-2, #eef2f7)',
  shadow: '0 12px 32px rgba(15, 23, 42, 0.16)',
}

const DARK_PALETTE: Palette = {
  surface: 'var(--dsw-alias-bg-overlay, #20242c)',
  border: 'var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.14))',
  text: 'var(--dsw-alias-label-primary, #e6eaf0)',
  muted: 'var(--dsw-alias-label-secondary, #8b95a5)',
  hover: 'var(--dsw-alias-interactive-bg-hover, rgba(255, 255, 255, 0.08))',
  danger: 'var(--dsw-alias-state-error-primary, #ff7875)',
  dangerHover: 'rgba(255, 120, 117, 0.14)',
  avatarBg: 'var(--dsw-alias-bg-layer-2, rgba(255, 255, 255, 0.10))',
  shadow: '0 12px 32px rgba(0, 0, 0, 0.46)',
}

const TRIGGER_BASE: CSSProperties = {
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '8px 12px',
  border: 'none',
  borderRadius: 8,
  background: 'transparent',
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
  textAlign: 'left',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
}

const MENU_BASE: CSSProperties = {
  position: 'fixed',
  zIndex: 2147483000,
  minWidth: 184,
  padding: 6,
  borderWidth: 1,
  borderStyle: 'solid',
  borderRadius: 12,
  fontFamily: 'inherit',
  fontSize: 13,
}

const MENU_HEADER_BASE: CSSProperties = {
  padding: '6px 10px 8px',
  fontSize: 12,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const MENU_ITEM_BASE: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  width: '100%',
  padding: '8px 10px',
  border: 'none',
  borderRadius: 8,
  background: 'transparent',
  font: 'inherit',
  fontSize: 13,
  textAlign: 'left',
  cursor: 'pointer',
}

/**
 * One menu row. Hover is tracked in state: the client bundle ships no CSS
 * file, so inline styles cannot express `:hover`.
 */
function MenuItem({
  label,
  icon,
  danger,
  palette,
  onSelect,
}: {
  label: string
  icon: React.JSX.Element
  danger?: boolean
  palette: Palette
  onSelect: () => void
}): React.JSX.Element {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      type="button"
      role="menuitem"
      style={{
        ...MENU_ITEM_BASE,
        color: danger ? palette.danger : palette.text,
        background: hovered ? (danger ? palette.dangerHover : palette.hover) : 'transparent',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onSelect}
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}

function UserIcon(): React.JSX.Element {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={15}
      height={15}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      style={{ flex: '0 0 auto' }}
    >
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )
}

function LogoutIcon(): React.JSX.Element {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={15}
      height={15}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      style={{ flex: '0 0 auto' }}
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" x2="9" y1="12" y2="12" />
    </svg>
  )
}

export const HuaqiuAuthSidebarAction = memo(function HuaqiuAuthSidebarAction({ wide }: SidebarFooterActionOwnerProps): React.JSX.Element | null {
  const authState = useSyncExternalStore(subscribeAuth, getAuthState)
  const auth = getAuth()
  const dark = useIsDark()
  const locale = useLocale()
  const t = useT()
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuStyle, setMenuStyle] = useState<CSSProperties | null>(null)
  const [avatarBroken, setAvatarBroken] = useState(false)
  const [hovered, setHovered] = useState(false)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

  const palette = dark ? DARK_PALETTE : LIGHT_PALETTE
  const authenticated = authState.authenticated
  const avatar = authenticated && !avatarBroken ? authState.avatar : undefined
  const showLabel = wide !== false

  // A new avatar URL is a fresh chance to render it.
  useEffect(() => {
    setAvatarBroken(false)
  }, [authState.avatar])

  // Logging out (from anywhere: menu, another tab surface, node invalidation)
  // must never leave an orphan menu pointing at a signed-out account.
  useEffect(() => {
    if (!authenticated) setMenuOpen(false)
  }, [authenticated])

  // Anchor the portalled menu to the trigger before paint: the sidebar footer
  // sits at the bottom edge, so the menu grows UPWARD from the trigger's top.
  useLayoutEffect(() => {
    if (!menuOpen || !triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    setMenuStyle({
      ...MENU_BASE,
      background: palette.surface,
      borderColor: palette.border,
      color: palette.text,
      boxShadow: palette.shadow,
      left: Math.max(8, Math.round(rect.left)),
      bottom: Math.max(8, Math.round(window.innerHeight - rect.top + 8)),
      ...(wide ? { width: Math.round(rect.width) } : {}),
    })
  }, [menuOpen, wide, avatar, palette])

  // Close on: outside click, Escape, resize or scroll (the anchor moved).
  useEffect(() => {
    if (!menuOpen) return
    const onPointerDown = (event: MouseEvent): void => {
      const target = event.target as Node
      if (triggerRef.current?.contains(target)) return
      if (menuRef.current?.contains(target)) return
      setMenuOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    const dismiss = (): void => setMenuOpen(false)
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('resize', dismiss)
    window.addEventListener('scroll', dismiss, true)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('resize', dismiss)
      window.removeEventListener('scroll', dismiss, true)
    }
  }, [menuOpen])

  if (!auth) return null

  /**
   *「Go to profile」always carries the token, so eda.cn can establish the
   * session in the opened tab (it hides the token itself — see
   * `lib.ts#buildProfileUrl`). The snapshot normally has it; fall back to the
   * client so a stale snapshot can never open an unauthenticated tab.
   */
  const openProfile = (): void => {
    setMenuOpen(false)
    void (async () => {
      const info = authState.token
        ? { token: authState.token, phone: authState.phone }
        : await auth.getUserInfo()
            .then((i) => (i ? { token: i.token, phone: i.phone } : null))
            .catch(() => null)
      if (!info?.token) return
      window.open(buildProfileUrl(info), '_blank', 'noopener,noreferrer')
    })()
  }

  const label = authenticated
    ? (authState.nickname ?? t('sidebar.account'))
    : t('sidebar.login')

  const title = authenticated ? t('sidebar.accountTitle') : t('sidebar.loginTitle')
  const triggerBackground = menuOpen || hovered ? palette.hover : 'transparent'

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={() => {
          if (!authenticated) {
            // Always-transparent embed in the host's language and color scheme;
            // `closeOnOutsideClick` defaults to true. The login dialog owns
            // the DOM (backdrop + card + iframe) and closes itself on
            // backdrop click, Escape, the × button, or the embed's
            // `close_dialog` postMessage.
            void auth.login({ lang: locale, theme: dark ? 'dark' : 'light' })
            return
          }
          setMenuOpen((open) => !open)
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          ...TRIGGER_BASE,
          color: palette.text,
          padding: wide ? '8px 12px' : '8px 6px',
          background: triggerBackground,
        }}
        title={title}
      >
        {avatar ? (
          <span
            style={{
              flex: '0 0 auto',
              width: AVATAR_SIZE,
              height: AVATAR_SIZE,
              borderRadius: '50%',
              overflow: 'hidden',
              background: palette.avatarBg,
              display: 'block',
            }}
          >
            <img
              src={avatar}
              alt=""
              width={AVATAR_SIZE}
              height={AVATAR_SIZE}
              onError={() => setAvatarBroken(true)}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          </span>
        ) : (
          <HQ_ICON size={ICON_SIZE} />
        )}
        {showLabel ? (
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
        ) : null}
      </button>

      {menuOpen && menuStyle
        ? createPortal(
            <div ref={menuRef} role="menu" style={menuStyle}>
              {authState.nickname ? (
                <div style={{ ...MENU_HEADER_BASE, color: palette.muted }} title={authState.nickname}>{authState.nickname}</div>
              ) : null}
              <MenuItem
                label={t('menu.profile')}
                icon={<UserIcon />}
                palette={palette}
                onSelect={openProfile}
              />
              <MenuItem
                label={t('menu.logout')}
                icon={<LogoutIcon />}
                danger
                palette={palette}
                onSelect={() => {
                  setMenuOpen(false)
                  void auth.logout()
                }}
              />
            </div>,
            document.body,
          )
        : null}
    </div>
  )
})
