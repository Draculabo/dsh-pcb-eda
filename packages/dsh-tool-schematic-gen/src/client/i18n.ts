/**
 * Runtime locale pack for the schematic/system HIT card (zh + en), default zh.
 */
import { useCallback } from 'react'
import { useLocale } from './theme.js'

const COPY: Record<string, Record<string, string>> = {
  zh: {
    'card.title.schematic': '生成原理图',
    'card.title.system': '生成系统设计',
    'card.kind.schematic': '原理图',
    'card.kind.system': '系统设计',
    'card.status.generating': '正在生成…',
    'card.status.generated': '已生成',
    'card.status.failed': '生成失败',
    'card.preview.loading': '正在加载预览…',
    'card.preview.renderError': '预览渲染失败：',
    'card.preview.resolveError': '无法解析工件：',
    'card.preview.missing': '没有可用于预览的工件内容',
    'card.error.toolFailed': '工具调用失败',
    'card.error.retry': '重试',
    'card.meta.design': '设计',
    'card.meta.sheets': '{count} 张图纸',
    'card.meta.modules': '{count} 个模块',
    'card.meta.connections': '{count} 条连接',
    'card.action.download': '下载',
    'card.action.downloading': '下载中…',
    'card.action.regenerate': '重新生成',
    'card.action.regenerating': '重新生成中…',
    'card.action.inspect': '详情',
    'card.regeneratePrompt.schematic': '请重新生成刚才的原理图',
    'card.regeneratePrompt.system': '请重新生成刚才的系统设计',
    'card.auth.title': '华秋 EDA AI（eda.cn）登录',
    'card.auth.desc': '工具「{tool}」需要登录华秋 EDA AI 账号才能继续。请在下方的登录框完成登录（或点击左侧「华秋EDA AI登录」按钮）；登录完成后，回复助手「已登录，请重试」，助手会自动重新调用该工具。',
    'card.auth.loggedIn': '✓ 已登录{nickname}—— 现在可以回复助手「已登录，请重试」，助手会重新调用工具。',
    'card.auth.loggedOut': '未登录 —— 请在上方登录华秋 EDA AI（eda.cn）账号，或点击左侧「华秋EDA AI 登录」按钮；登录完成后让助手重试。',
  },
  en: {
    'card.title.schematic': 'Generated schematic',
    'card.title.system': 'Generated system design',
    'card.kind.schematic': 'schematic',
    'card.kind.system': 'system design',
    'card.status.generating': 'Generating…',
    'card.status.generated': 'Generated',
    'card.status.failed': 'Failed',
    'card.preview.loading': 'Loading preview…',
    'card.preview.renderError': 'Preview render failed: ',
    'card.preview.resolveError': 'Could not resolve artifact: ',
    'card.preview.missing': 'No previewable artifact content',
    'card.error.toolFailed': 'Tool call failed',
    'card.error.retry': 'Retry',
    'card.meta.design': 'Design',
    'card.meta.sheets': '{count} sheet(s)',
    'card.meta.modules': '{count} module(s)',
    'card.meta.connections': '{count} connection(s)',
    'card.action.download': 'Download',
    'card.action.downloading': 'Downloading…',
    'card.action.regenerate': 'Regenerate',
    'card.action.regenerating': 'Regenerating…',
    'card.action.inspect': 'Inspect',
    'card.regeneratePrompt.schematic': 'Please regenerate the schematic above',
    'card.regeneratePrompt.system': 'Please regenerate the system design above',
    'card.auth.title': 'Huaqiu EDA AI (eda.cn) login',
    'card.auth.desc': 'Tool "{tool}" requires a Huaqiu EDA AI login. Complete the login below (or use the 华秋EDA AI sidebar button); then reply "已登录，请重试" so the assistant can retry the tool.',
    'card.auth.loggedIn': '✓ Logged in{nickname} — reply "已登录，请重试" and the assistant will retry.',
    'card.auth.loggedOut': 'Not logged in — complete the login above, or use the 华秋EDA AI sidebar button.',
  },
}

export type Translate = (key: string, params?: Record<string, unknown>) => string

export function translate(lang: 'zh' | 'en', key: string, params?: Record<string, unknown>): string {
  const dict = lang === 'en' ? COPY.en! : COPY.zh!
  let v = dict[key]
  if (v === undefined) v = COPY.zh![key]
  if (v === undefined) v = key
  if (params) {
    for (const k of Object.keys(params)) {
      v = v.split(`{${k}}`).join(String(params[k]))
    }
  }
  return v
}

export const defaultT: Translate = (key, params) => translate('zh', key, params)

/**
 * Translate bound to the HOST UI language.
 *
 * The card used to hard-pin `const t = defaultT`, which silently froze every
 * string to zh and left the `en` dictionary above as dead code. `useT()`
 * follows the locale store in `theme.js` instead, so the card switches
 * language with the app.
 */
export function useT(): Translate {
  const lang = useLocale()
  return useCallback(
    (key: string, params?: Record<string, unknown>) => translate(lang, key, params),
    [lang],
  )
}
