/**
 * `sidebar.footer.action` entry: a persistent Huaqiu EDA login entrypoint at
 * the bottom of the DSH sidebar (beside Settings).
 *
 * - Not logged in: shows「华秋EDA登录」and opens the full-screen auth.eda.cn
 *   overlay (`auth.login()`, the same flow the auth client already ships).
 * - Logged in: shows the nickname and logs out on click.
 */
import { memo, useSyncExternalStore } from 'react'
import { getAuth, getAuthState, subscribeAuth } from '../auth-state.js'

export interface SidebarFooterActionOwnerProps {
  wide?: boolean
}

export const HuaqiuAuthSidebarAction = memo(function HuaqiuAuthSidebarAction({ wide }: SidebarFooterActionOwnerProps): React.JSX.Element | null {
  const authState = useSyncExternalStore(subscribeAuth, getAuthState)
  const auth = getAuth()
  if (!auth) return null

  const authenticated = authState.authenticated
  const label = authenticated
    ? (authState.nickname ? `${authState.nickname} · 已登录` : '华秋EDA · 已登录')
    : '华秋EDA登录'

  return (
    <button
      type="button"
      onClick={() => {
        if (authenticated) void auth.logout()
        else void auth.login()
      }}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: wide ? '8px 12px' : '8px 6px',
        border: 'none',
        borderRadius: 8,
        background: authenticated ? '#e6f4ff' : '#f5f7fa',
        color: authenticated ? '#1677ff' : '#3a4356',
        fontSize: 13,
        fontWeight: 500,
        cursor: 'pointer',
        textAlign: 'left',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
      }}
      title={authenticated ? '点击退出华秋 EDA 登录' : '登录华秋 EDA（eda.cn）账号'}
    >
      <span aria-hidden style={{ flex: '0 0 auto' }}>{authenticated ? '✓' : '🔑'}</span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
    </button>
  )
})
