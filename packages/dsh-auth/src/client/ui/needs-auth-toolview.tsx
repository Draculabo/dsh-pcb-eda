/**
 * Keyed `tool.call.toolview` renderer for the Huaqiu EDA tools.
 *
 * When a Huaqiu tool returns `status: "needs_auth"`, this card renders the
 * login human-in-the-loop step: an embedded auth.eda.cn login iframe plus a
 * live login-state line. The singleton auth client's `message` listener
 * already receives the postMessage from this same-origin iframe, caches the
 * credential and pushes it to the node service, so after the user logs in the
 * card flips to "已登录" and the model can retry the tool.
 *
 * For any other result it renders a faithful JSON fallback (the generic row
 * that this keyed entry replaces), so nothing is lost for successful calls.
 */
import { memo, useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { getAuthState, subscribeAuth, syncAuthNow } from '../auth-state.js'
import {
  AUTH_ORIGIN,
  CARD_STYLE,
  DESC_STYLE,
  IFRAME_STYLE,
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

function JsonFallback({ toolName, block }: { toolName: string; block?: ToolBlockLike }): React.JSX.Element {
  const result = useMemo(() => parseToolResult(block), [block])
  return (
    <div style={CARD_STYLE}>
      <p style={TITLE_STYLE}>工具：{toolName}</p>
      <pre style={{ margin: 0, fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 320, overflow: 'auto' }}>
        {result ? JSON.stringify(result, null, 2) : '(无输出)'}
      </pre>
    </div>
  )
}

function LoginCard({ toolName }: { toolName: string }): React.JSX.Element {
  const authState = useSyncExternalStore(subscribeAuth, getAuthState)
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  // Healing: if the browser already holds a token (e.g. the node half was
  // reset by a server restart), push it again the moment the login card
  // mounts so the tool gate flips to authenticated without a manual re-login.
  useEffect(() => {
    syncAuthNow()
  }, [toolName])
  return (
    <div style={CARD_STYLE}>
      <p style={TITLE_STYLE}>华秋 EDA（eda.cn）登录</p>
      <p style={DESC_STYLE}>
        工具「{toolName}」需要登录华秋 EDA 账号才能继续。请在下方的登录框完成登录（或点击左侧「华秋EDA登录」按钮）；
        登录完成后，回复助手「已登录，请重试」，助手会自动重新调用该工具。
      </p>
      <StatusLine authenticated={authState.authenticated} nickname={authState.nickname} />
      <iframe
        ref={iframeRef}
        src={AUTH_ORIGIN}
        title="华秋EDA登录"
        style={IFRAME_STYLE}
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
