/**
 * Runtime locale pack for the `gen-hit` card (zh + en). Kept self-contained
 * (not the DSH `locale` service) so the card works without registering a
 * namespace; the default is zh.
 */

const COPY: Record<string, Record<string, string>> = {
  zh: {
    'card.title.symbol': '生成符号',
    'card.title.footprint': '生成封装',
    'card.title.generic': '生成结果',
    'card.kind.symbol': '符号',
    'card.kind.footprint': '封装',
    'card.kind.schematic': '原理图',
    'card.kind.pcb': 'PCB',
    'card.status.generating': '正在生成…',
    'card.status.generated': '已生成',
    'card.status.failed': '生成失败',
    'card.status.cancelled': '已取消',
    'card.status.confirm': '待确认尺寸',
    'card.status.noPreview': '预览不可用',
    'card.preview.loading': '正在加载预览…',
    'card.preview.renderError': '预览渲染失败：',
    'card.preview.resolveError': '无法解析工件：',
    'card.preview.missing': '没有可用于预览的工件内容',
    'card.error.toolFailed': '工具调用失败',
    'card.error.retry': '重试',
    'card.confirm.body': '请确认或修正以下尺寸；确认后告诉我，我将继续生成。',
    'card.note.noPreview': '预览不可用，可下载原始文件。',
    'card.action.download': '下载',
    'card.action.downloading': '下载中…',
    'card.action.regenerate': '重新生成',
    'card.action.regenerating': '重新生成中…',
    'card.action.inspect': '详情',
    'card.action.regenerateFailed': '重新生成失败',
    'card.regeneratePrompt': '请重新生成刚才的{kind}',
    'card.meta.pkg': '封装类型',
    'card.editor.unit': 'mm',
    'card.editor.dragHint': '拖动图形或直接输入数值调整尺寸',
    'card.editor.confirm': '确认尺寸',
    'card.editor.cancel': '取消',
    'card.editor.sent': '已确认尺寸，正在继续生成…',
    'card.editor.declined': '已取消生成',
    'card.editor.invalid': '数值无效',
    'card.editor.pins': '{count} 引脚',
    'card.editor.body': '本体',
    'card.editor.pitch': '间距',
    'card.editor.edited': '已改',
    'card.editor.ai': 'AI',
    'card.editor.advanced': '高级尺寸',
    'card.editor.validationOk': '✓ 就绪',
    'card.editor.validationIssue': '⚠ {n} 个问题',
    'card.editor.issueOutOfRange': '超出允许范围',
    'card.editor.issueMinGtMax': '最小值大于最大值',
    'card.auth.title': '华秋 EDA（eda.cn）登录',
    'card.auth.desc': '工具「{tool}」需要登录华秋 EDA 账号才能继续。请在下方的登录框完成登录（或点击左侧「华秋EDA登录」按钮）；登录完成后，回复助手「已登录，请重试」，助手会自动重新调用该工具。',
    'card.auth.loggedIn': '✓ 已登录{nickname}—— 现在可以回复助手「已登录，请重试」，助手会重新调用工具。',
    'card.auth.loggedOut': '未登录 —— 请在上方登录华秋 EDA（eda.cn）账号，或点击左侧「华秋EDA登录」按钮；登录完成后让助手重试。',
  },
  en: {
    'card.title.symbol': 'Generated symbol',
    'card.title.footprint': 'Generated footprint',
    'card.title.generic': 'Generated result',
    'card.kind.symbol': 'symbol',
    'card.kind.footprint': 'footprint',
    'card.kind.schematic': 'schematic',
    'card.kind.pcb': 'PCB',
    'card.status.generating': 'Generating…',
    'card.status.generated': 'Generated',
    'card.status.failed': 'Failed',
    'card.status.cancelled': 'Cancelled',
    'card.status.confirm': 'Confirm dimensions',
    'card.status.noPreview': 'Preview unavailable',
    'card.preview.loading': 'Loading preview…',
    'card.preview.renderError': 'Preview render failed: ',
    'card.preview.resolveError': 'Could not resolve artifact: ',
    'card.preview.missing': 'No previewable artifact content',
    'card.error.toolFailed': 'Tool call failed',
    'card.error.retry': 'Retry',
    'card.confirm.body': 'Confirm or correct these dimensions, then tell me to continue.',
    'card.note.noPreview': 'Preview unavailable; download the raw file instead.',
    'card.action.download': 'Download',
    'card.action.downloading': 'Downloading…',
    'card.action.regenerate': 'Regenerate',
    'card.action.regenerating': 'Regenerating…',
    'card.action.inspect': 'Inspect',
    'card.action.regenerateFailed': 'Regenerate failed',
    'card.regeneratePrompt': 'Please regenerate the {kind} above',
    'card.meta.pkg': 'Package',
    'card.editor.unit': 'mm',
    'card.editor.dragHint': 'Drag the geometry or edit the values',
    'card.editor.confirm': 'Use these dimensions',
    'card.editor.cancel': 'Cancel',
    'card.editor.sent': 'Dimensions confirmed — continuing…',
    'card.editor.declined': 'Generation cancelled',
    'card.editor.invalid': 'Invalid value',
    'card.editor.pins': '{count} pins',
    'card.editor.body': 'Body',
    'card.editor.pitch': 'Pitch',
    'card.editor.edited': 'edited',
    'card.editor.ai': 'AI',
    'card.editor.advanced': 'Advanced dimensions',
    'card.editor.validationOk': '✓ Ready',
    'card.editor.validationIssue': '⚠ {n} issue(s)',
    'card.editor.issueOutOfRange': 'outside allowed range',
    'card.editor.issueMinGtMax': 'min is greater than max',
    'card.auth.title': 'Huaqiu EDA (eda.cn) login',
    'card.auth.desc': 'Tool "{tool}" requires a Huaqiu EDA login. Complete the login below (or use the 华秋EDA login button in the sidebar); then reply "已登录，请重试" so the assistant can retry the tool.',
    'card.auth.loggedIn': '✓ Logged in{nickname} — reply "已登录，请重试" and the assistant will retry.',
    'card.auth.loggedOut': 'Not logged in — complete the login above, or use the 华秋EDA sidebar button.',
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

/** Fallback translate used when the slot's locale `t` is unavailable. */
export const defaultT: Translate = (key, params) => translate('zh', key, params)
