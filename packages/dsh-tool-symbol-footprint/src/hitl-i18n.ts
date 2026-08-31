/**
 * Locale pack for the NODE-side human-in-the-loop (HITL) prompts.
 *
 * Why this is not `client/i18n.ts`: that module imports React and subscribes
 * to the host locale store via `useLocale()`, so it can only run in the
 * browser half. The HITL helpers in `dimensions.ts` run in the node half —
 * they build the `userQuestions.ask()` payload, i.e. the text the human
 * actually reads — and they were hardcoded to English.
 *
 * The node half cannot see `<html lang>` (no DOM), so the locale is a
 * DEPLOYMENT setting, not a detected one: `SymbolFootprintConfig.hitlLanguage`
 * / `HQ_EDA_HITL_LANGUAGE`. The default is zh to match the rest of the
 * package — `client/theme.ts` falls back to zh ("this is a Chinese-first
 * app") and `client/i18n.ts` pins `defaultT` to zh — so the dialog and the
 * card now speak the same language instead of the card being zh while the
 * dialog stayed en.
 *
 * Same typed-dictionary guard as `client/i18n.ts`: `ZH` is the source of
 * truth, `EN` is typed `Record<HitlCopyKey, string>`, so a key added to one
 * pack and not the other is a compile error rather than a silent fallback.
 *
 * @module @huaqiu/dsh-tool-symbol-footprint
 */

export type HitlLocale = 'zh' | 'en'

/** Default when neither config nor env specifies one — see the header note. */
export const DEFAULT_HITL_LOCALE: HitlLocale = 'zh'

const ZH = {
  /** Shown in place of the package name when the extractor did not return one. */
  'confirm.pkgFallback': '该封装',
  /** `userQuestions` header chip; kept short (UIs truncate it). */
  'header': '封装',
  'render.empty': '（提取器没有返回任何尺寸值）',
  'confirm.detail':
    '提取出的 {pkg} 尺寸：\n\n{dims}\n\n如需修改，请选择「{edit}」并以 key=value 形式输入更正，例如「W=6.2, pitch=1.27」。',
  'confirm.question': '以下提取出的 {pkg} 尺寸是否正确？',
  'confirm.opt.confirm': '确认',
  'confirm.opt.confirm.desc': '按这些尺寸生成封装。',
  'confirm.opt.edit': '修改数值',
  'confirm.opt.edit.desc': '生成前先更正一个或多个数值。',
  'confirm.opt.cancel': '取消',
  'confirm.opt.cancel.desc': '不生成封装。',
  'confirm.edit.question': '以 key=value 形式输入更正后的数值（留空则保留提取值）。',
  'direct.question': '服务已识别为标准封装并自动生成了封装，是否使用？',
  'direct.detail':
    '生成的文件：{file}\n\n选择「{accept}」使用自动生成的封装，或选择「{decline}」改为手动提供尺寸。',
  'direct.unknown': '（未知）',
  'direct.opt.accept': '使用',
  'direct.opt.accept.desc': '使用自动生成的封装。',
  'direct.opt.decline': '不使用',
  'direct.opt.decline.desc': '不使用；改为手动提供 package_type 与尺寸。',
} as const

export type HitlCopyKey = keyof typeof ZH

const EN: Record<HitlCopyKey, string> = {
  'confirm.pkgFallback': 'the package',
  'header': 'Footprint',
  'render.empty': '(the extractor returned no dimension values)',
  'confirm.detail':
    'Extracted {pkg} dimensions:\n\n{dims}\n\nTo change values, choose "{edit}" and type ' +
    'corrections as key=value pairs, e.g. "W=6.2, pitch=1.27".',
  'confirm.question': 'Are these extracted {pkg} dimensions correct?',
  'confirm.opt.confirm': 'Confirm',
  'confirm.opt.confirm.desc': 'Generate the footprint using these dimensions.',
  'confirm.opt.edit': 'Edit values',
  'confirm.opt.edit.desc': 'Correct one or more values before generating.',
  'confirm.opt.cancel': 'Cancel',
  'confirm.opt.cancel.desc': 'Do not generate a footprint.',
  'confirm.edit.question':
    'Type the corrected values as key=value pairs (or leave empty to keep the extracted ones).',
  'direct.question':
    'The service recognised this as a standard package and auto-generated a footprint. Use it?',
  'direct.detail':
    'Generated file: {file}\n\nChoose "{accept}" to use the auto-generated footprint, ' +
    'or "{decline}" to provide dimensions manually.',
  'direct.unknown': '(unknown)',
  'direct.opt.accept': 'Accept',
  'direct.opt.accept.desc': 'Use the auto-generated footprint.',
  'direct.opt.decline': 'Decline',
  'direct.opt.decline.desc': 'Decline; provide package_type and dimensions manually.',
}

const COPY: Record<HitlLocale, Record<HitlCopyKey, string>> = { zh: ZH, en: EN }

/** Exported for tests: the raw packs, so zh/en parity can be asserted. */
export const HITL_PACKS = COPY

/**
 * Localized answer vocabulary for the HITL options.
 *
 * Sourced from the packs above (not restated) so the option a human clicks and
 * the copy describing it can never drift apart. `dimensions.ts` re-exports
 * this as `HIL_LABELS`, alongside the English `HIL_*` constants.
 */
export const HITL_LABELS: Record<HitlLocale, {
  confirm: string
  edit: string
  cancel: string
  accept: string
  decline: string
}> = {
  zh: {
    confirm: ZH['confirm.opt.confirm'],
    edit: ZH['confirm.opt.edit'],
    cancel: ZH['confirm.opt.cancel'],
    accept: ZH['direct.opt.accept'],
    decline: ZH['direct.opt.decline'],
  },
  en: {
    confirm: EN['confirm.opt.confirm'],
    edit: EN['confirm.opt.edit'],
    cancel: EN['confirm.opt.cancel'],
    accept: EN['direct.opt.accept'],
    decline: EN['direct.opt.decline'],
  },
}

/**
 * Coerce an arbitrary config/env value to a locale id.
 *
 * Accepts BCP-47-ish tags (`zh-CN`, `en-US`) and raw ids (`zh`, `en`),
 * case-insensitively; anything else falls back to `DEFAULT_HITL_LOCALE`.
 */
export function resolveHitlLocale(value: unknown): HitlLocale {
  if (typeof value !== 'string') {
    return DEFAULT_HITL_LOCALE
  }

  const primary = value.trim().toLowerCase().replace(/_/g, '-').split('-')[0]
  return primary === 'en' || primary === 'zh' ? primary : DEFAULT_HITL_LOCALE
}

export type HitlTranslate = (key: HitlCopyKey, params?: Record<string, string | number>) => string

/** Translate a HITL copy key, interpolating `{name}` placeholders. */
export function hitlTranslate(
  locale: HitlLocale | undefined,
  key: HitlCopyKey,
  params?: Record<string, string | number>,
): string {
  const pack = locale === 'en' ? COPY.en : COPY.zh
  let text = pack[key]
  if (params) {
    for (const name of Object.keys(params)) {
      text = text.split(`{${name}}`).join(String(params[name]))
    }
  }
  return text
}

/** Translate bound to one locale — the form the HITL helpers take. */
export function hitlT(locale?: HitlLocale): HitlTranslate {
  return (key, params) => hitlTranslate(locale, key, params)
}
