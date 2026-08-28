/**
 * Login-state + result rendering helpers shared by the client React cards.
 */
import type { CSSProperties, ReactNode } from 'react'

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

export const CARD_STYLE: CSSProperties = {
  border: '1px solid #e4e7ec',
  borderRadius: 10,
  padding: '12px 14px',
  margin: '4px 0',
  background: '#fff',
  fontFamily: 'inherit',
}

export const TITLE_STYLE: CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  margin: '0 0 6px',
}

export const DESC_STYLE: CSSProperties = {
  fontSize: 13,
  color: '#5b6472',
  margin: '0 0 10px',
  lineHeight: 1.5,
}

export const STATUS_STYLE: CSSProperties = {
  fontSize: 13,
  margin: '0 0 10px',
  lineHeight: 1.5,
}

export const IFRAME_STYLE: CSSProperties = {
  width: '100%',
  height: 520,
  border: '1px solid #e4e7ec',
  borderRadius: 8,
  background: '#fff',
  display: 'block',
}

export function StatusLine({ authenticated, nickname }: { authenticated: boolean; nickname?: string }): ReactNode {
  if (authenticated) {
    return (
      <p style={{ ...STATUS_STYLE, color: '#1677ff' }}>
        ✓ 已登录{nickname ? `：${nickname}` : ''} —— 现在可以回复助手「已登录，请重试」，助手会重新调用工具。
      </p>
    )
  }
  return (
    <p style={{ ...STATUS_STYLE, color: '#d4380d' }}>
      未登录 —— 请在上方登录华秋 EDA（eda.cn）账号，或点击左侧「华秋EDA登录」按钮；登录完成后让助手重试。
    </p>
  )
}
