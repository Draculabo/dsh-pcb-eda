/**
 * Keyed `tool.call.toolview` renderer for the Huaqiu EDA tools.
 *
 * When a Huaqiu tool returns `status: "needs_auth"`, this card renders the
 * login human-in-the-loop step: an embedded auth.eda.cn login iframe plus a
 * live login-state line. The singleton auth client's `message` listener
 * already receives the postMessage from this same-origin iframe, caches the
 * credential and pushes it to the node service, so after the user logs in the
 * card flips to「已登录」and the model can retry the tool.
 *
 * The embed is the second of the two FULL login surfaces (the other is the
 * sidebar overlay): it uses the same `buildLoginUrl()` contract — always
 * transparent — and passes the host's language and color scheme.
 *
 * For any other result it renders a faithful JSON fallback (the generic row
 * that this keyed entry replaces), so nothing is lost for successful calls.
 */
import { memo, useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { getAuthState, subscribeAuth, syncAuthNow } from '../auth-state.js'
import { buildLoginUrl } from '../lib.js'
import { useIsDark, useLocale } from '../ui-env.js'
import { useT } from '../i18n.js'
import {
  cardPalette,
  cardStyle,
  iframeStyle,
  isNeedsAuthResult,
  parseToolResult,
  StatusLine,
  TITLE_STYLE,
  type ToolBlockLike,
} from './common.jsx'

export interface NeedsAuthToolViewProps {
  toolName: string
  block?: ToolBlockLike
}

const DESC_STYLE = {
  fontSize: 13,
  margin: '0 0 10px',
  lineHeight: 1.5,
} as const

function JsonFallback({ toolName, block }: { toolName: string; block?: ToolBlockLike }): React.JSX.Element {
  const result = useMemo(() => parseToolResult(block), [block])
  const dark = useIsDark()
  const t = useT()
  const palette = cardPalette(dark)
  return (
    <div style={cardStyle(palette)}>
      <p style={TITLE_STYLE}>{t('card.tool', { tool: toolName })}</p>
      <pre style={{ margin: 0, fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 320, overflow: 'auto' }}>
        {result ? JSON.stringify(result, null, 2) : t('card.empty')}
      </pre>
    </div>
  )
}

function LoginCard({ toolName }: { toolName: string }): React.JSX.Element {
  const authState = useSyncExternalStore(subscribeAuth, getAuthState)
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const dark = useIsDark()
  const locale = useLocale()
  const t = useT()
  const palette = cardPalette(dark)
  // Healing: if the browser already holds a token (e.g. the node half was
  // reset by a server restart), push it again the moment the login card
  // mounts so the tool gate flips to authenticated without a manual re-login.
  useEffect(() => {
    syncAuthNow()
  }, [toolName])

  // Same contract as the sidebar overlay: always transparent, host language,
  // host color scheme. Rebuilt on change so a mid-session switch is picked up.
  const src = useMemo(
    () => buildLoginUrl({ lang: locale, theme: dark ? 'dark' : 'light' }),
    [locale, dark],
  )

  return (
    <div style={cardStyle(palette)}>
      <p style={TITLE_STYLE}>{t('card.title')}</p>
      <p style={{ ...DESC_STYLE, color: palette.muted }}>
        {t('card.desc', { tool: toolName })}
      </p>
      <StatusLine authenticated={authState.authenticated} nickname={authState.nickname} palette={palette} t={t} />
      <iframe
        ref={iframeRef}
        src={src}
        title={t('card.title')}
        style={iframeStyle(palette)}
        allow="clipboard-write"
      />
    </div>
  )
}

export const HuaqiuToolView = memo(function HuaqiuToolView(props: NeedsAuthToolViewProps): React.JSX.Element {
  const { toolName, block } = props
  const result = useMemo(() => parseToolResult(block), [block])
  if (isNeedsAuthResult(result)) {
    return <LoginCard toolName={toolName} />
  }
  return <JsonFallback toolName={toolName} block={block} />
})
