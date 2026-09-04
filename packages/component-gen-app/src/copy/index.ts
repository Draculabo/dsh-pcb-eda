/**
 * `@huaqiu/component-gen-app` — copy packs + translate resolver.
 *
 * Mirrors the `dsh-tool-symbol-footprint` house convention:
 *   - `ZH as const` → `CopyKey` → `EN: Record<CopyKey, string>` (missing EN
 *     key is a compile error; zh is the runtime fallback);
 *   - `Translate = (key, params?) => string` with `{param}` substitution;
 *   - `fieldLabel` (utils/labels.ts) resolves dimension keys through the
 *     `field.*` copy section, so labels follow the UI language.
 */
import { ZH, type CopyKey } from './zh.js'
import { EN } from './en.js'

export type { CopyKey } from './zh.js'
export { ZH } from './zh.js'
export { EN } from './en.js'

export type Translate = (key: string, params?: Record<string, unknown>) => string

type FlatKey = string

function lookup(pack: Record<string, unknown>, keys: FlatKey): string | undefined {
  let node: unknown = pack
  for (const seg of keys.split('.')) {
    if (node && typeof node === 'object') node = (node as Record<string, unknown>)[seg]
    else return undefined
  }
  return typeof node === 'string' ? node : undefined
}

export function translate(lang: string | undefined, key: string, params?: Record<string, unknown>): string {
  const pack = lang?.toLowerCase().startsWith('en') ? (EN as unknown as Record<string, unknown>) : ZH as unknown as Record<string, unknown>
  let v = lookup(pack, key)
  if (v === undefined) v = lookup(ZH as unknown as Record<string, unknown>, key)
  if (v === undefined) v = key
  if (params) {
    for (const k of Object.keys(params)) {
      v = v.split(`{${k}}`).join(String(params[k]))
    }
  }
  return v
}

/** Build a `(key, params?) => string` resolver for a given language. */
export function translateFor(lang: string | undefined): Translate {
  return (key, params) => translate(lang, key, params)
}

/** zh-only fallback (used when no locale is supplied). */
export const defaultT: Translate = (key, params) => translate('zh', key, params)
