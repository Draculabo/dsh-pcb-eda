import { describe, expect, it } from 'vitest'
import { TRACE_NAME_PACKS, resolveTraceName, type TraceKind } from '../src/client/trace-names.js'

const CJK = /[一-鿿]/

/** Every entry of every pack, as `[pack, key, zh, en]` rows. */
function rows(): [string, string, string, string][] {
  const out: [string, string, string, string][] = []
  for (const table of ['nodes', 'tools', 'calls'] as const) {
    const zh = TRACE_NAME_PACKS.zh[table]
    const en = TRACE_NAME_PACKS.en[table]
    for (const key of Object.keys(zh)) {
      out.push([table, key, zh[key]!, en[key]!])
    }
  }
  return out
}

describe('trace name packs', () => {
  it('has an entry for every zh name in en, and vice versa', () => {
    for (const table of ['nodes', 'tools', 'calls'] as const) {
      const zh = Object.keys(TRACE_NAME_PACKS.zh[table]).sort()
      const en = Object.keys(TRACE_NAME_PACKS.en[table]).sort()
      expect(en, `${table} key parity`).toEqual(zh)
    }
  })

  it('translates every entry into both directions', () => {
    const all = rows()
    expect(all.length).toBeGreaterThan(40)
    for (const [table, key, zh, en] of all) {
      expect(zh, `zh.${table}.${key}`).toMatch(CJK)
      expect(en, `en.${table}.${key}`).not.toMatch(CJK)
      expect(en.length, `en.${table}.${key}`).toBeGreaterThan(0)
    }
  })
})

describe('resolveTraceName — schematic', () => {
  const cases: [string, string, string][] = [
    ['node:schematicDesign', '需求解析与电路设计', 'Circuit Design Engineering'],
    ['search_parts', '物料搜索与选型子代理', 'Component Selection Subagent'],
    ['symbol_search', '器件符号检索', 'Component Search'],
    ['ic_search', '芯片型号检索', 'IC Search'],
    // Not in `SchematicGen.Trace.Tools` — these come from the shared table,
    // which is exactly the tier hq-eda-ai relies on for the search tools.
    ['es_rag_search', '语义搜索', 'Semantic Search'],
    ['es_category_search', '分类搜索', 'Category Search'],
    ['es_precise_search', '精准搜索', 'Precise Search'],
  ]

  for (const [raw, zh, en] of cases) {
    it(`localizes ${raw}`, () => {
      expect(resolveTraceName(raw, 'schematic', 'zh')).toBe(zh)
      expect(resolveTraceName(raw, 'schematic', 'en')).toBe(en)
    })
  }

  it('prefers the node table over the tool table for the same identifier', () => {
    // `search_parts` exists in BOTH: node → 子代理, tool → plain 物料搜索与选型.
    expect(resolveTraceName('search_parts', 'schematic', 'zh')).toBe('物料搜索与选型子代理')
    expect(TRACE_NAME_PACKS.zh.tools['search_parts']).toBe('物料搜索与选型')
  })
})

describe('resolveTraceName — system design', () => {
  const cases: [string, string, string][] = [
    ['designAgent', '系统设计', 'System Design'],
    ['generateDesignPlan', '生成设计方案', 'Design Plan Generation'],
    ['module_search', '模块搜索', 'Module Search'],
    ['prepareSearch', '准备搜索任务', 'Prepare Search Tasks'],
    ['componentWorker', '器件搜索', 'Component Search'],
    ['es_category_search', '分类搜索', 'Category Search'],
  ]

  for (const [raw, zh, en] of cases) {
    it(`localizes ${raw}`, () => {
      expect(resolveTraceName(raw, 'system', 'zh')).toBe(zh)
      expect(resolveTraceName(raw, 'system', 'en')).toBe(en)
    })
  }

  it('does not apply the schematic overrides on a system run', () => {
    // `schematicDesign` means 原理图设计 generically, but 需求解析与电路设计 as a
    // SCHEMATIC node. A system run must get the generic reading.
    expect(resolveTraceName('schematicDesign', 'system', 'zh')).toBe('原理图设计')
    expect(resolveTraceName('schematicDesign', 'schematic', 'zh')).toBe('需求解析与电路设计')
  })
})

describe('resolveTraceName — pass-through', () => {
  const instances = [
    'ESP32-C3主控模块',
    'Type-C USB2.0 接口保护模块',
    '带自动下载电路的 CP2102 USB 转串口模块',
    '直流电机驱动模块',
  ]

  it('keeps module worker instance names verbatim in both languages', () => {
    // These are the agent's own words (the module being worked on), not
    // identifiers — translating them would destroy the only useful label.
    for (const name of instances) {
      for (const kind of ['schematic', 'system'] as TraceKind[]) {
        for (const locale of ['zh', 'en'] as const) {
          expect(resolveTraceName(name, kind, locale), `${locale}/${kind}: ${name}`).toBe(name)
        }
      }
    }
  })

  it('strips the node: prefix even for an untranslated node', () => {
    expect(resolveTraceName('node:frobnicate', 'schematic', 'zh')).toBe('frobnicate')
    expect(resolveTraceName('node:frobnicate', 'system', 'zh')).toBe('frobnicate')
  })

  it('leaves empty and non-string input alone', () => {
    expect(resolveTraceName('', 'schematic', 'zh')).toBe('')
    expect(resolveTraceName(undefined as unknown as string, 'schematic', 'zh')).toBeUndefined()
  })
})

describe('resolveTraceName — namespaced identifiers', () => {
  it('renders a known `base:suffix` as "Label · suffix"', () => {
    expect(resolveTraceName('search_parts:retry', 'schematic', 'zh')).toBe('物料搜索与选型 · retry')
  })

  it('does NOT split a name that merely contains a colon', () => {
    // hq-eda-ai's resolver returns `tools[base] ?? base`, dropping everything
    // after the colon whenever the base is unknown. That would truncate a
    // module title like this one down to "ESP32".
    expect(resolveTraceName('ESP32: 主控模块', 'schematic', 'zh')).toBe('ESP32: 主控模块')
  })
})

describe('regression: no raw identifier reaches a Chinese UI', () => {
  // The identifiers actually observed in the schematic + system-design streams.
  const observed = [
    'node:schematicDesign',
    'search_parts',
    'symbol_search',
    'ic_search',
    'es_rag_search',
    'es_category_search',
    'es_precise_search',
  ]

  it('localizes every observed schematic identifier', () => {
    for (const raw of observed) {
      const out = resolveTraceName(raw, 'schematic', 'zh')
      expect(out, raw).toMatch(CJK)
      expect(out, raw).not.toContain('_')
      expect(out, raw).not.toContain('node:')
    }
  })
})
