/**
 * Display names for the agents' graph nodes and tool calls (zh + en).
 *
 * The eda.cn backend streams raw code identifiers — `node:schematicDesign`,
 * `search_parts`, `es_rag_search` — and the call stack used to render them
 * verbatim, so a Chinese UI showed an English snake_case stack. This module is
 * the dictionary that turns an identifier into a sentence.
 *
 * Port of `hq-eda-ai`'s two resolvers:
 *
 *   - schematic  → `apps/web/src/components/sch_sub_gen/TraceTimeline.tsx`
 *     (`resolveName`: `SchematicGen.Trace.Nodes` → `.Tools` → `ToolCalls`)
 *   - system     → `apps/web/src/components/modular_circuit/ModuleGenTraceTimeline.tsx`
 *     (`resolveName`: `ToolCalls` only)
 *
 * with the dictionaries taken from `apps/web/src/locales/{cn,en}.ts` — the
 * `ToolCalls` table plus the `SchematicGen.Trace.{Nodes,Tools}` overrides.
 *
 * Names that are NOT in any dictionary are returned unchanged on purpose:
 * the module worker instances are named after the module the agent is working
 * on ("Type-C USB2.0 接口保护模块"), and those are already copy, not code.
 */
import { useCallback } from 'react'
import type { AuthLocale } from './login-url.js'
import { useLocale } from './theme.js'

/** Prefix `traceName()` puts on a LangGraph node so it cannot collide with a tool. */
const NODE_PREFIX = 'node:'

// ── Shared node / tool vocabulary ──────────────────────────────────────────
// The system-design agent (`modular_circuit`) resolves EVERYTHING through this
// one table. The schematic agent uses it as its last resort — which is where
// `es_rag_search` / `es_category_search` / `es_precise_search` come from, since
// they are absent from `SchematicGen.Trace.Tools`.

/**
 * Chinese is the source of truth, as in `client/i18n.ts`: `CallNameKey` is
 * derived from it and `TOOL_CALLS_EN` is typed against it, so a name added to
 * zh but missing from en is a COMPILE error rather than a Chinese fallback
 * leaking into an English UI.
 */
const TOOL_CALLS_ZH = {
  // Search
  plan_search: '搜索规划',
  es_category_search: '分类搜索',
  es_precise_search: '精准搜索',
  es_rag_search: '语义搜索',
  ComponentSearchOutput: '元件检索',
  // Routing / agent
  intent_resolver: '路由决策',
  generate_design_plan: '生成设计方案',
  reflect_design: '设计反思',
  module_ops_agent: '模块管理助手',
  // TypeScript graph nodes
  intentResolver: '需求分析',
  generateDesignPlan: '生成设计方案',
  moduleOpsAgent: '模块管理',
  designAgent: '系统设计',
  model_request: '分析与决策',
  tools: '执行工具',
  design_plan_gen: '生成设计方案',
  module_search: '模块搜索',
  module_connect: '模块连接',
  request_module_change: '模块替换',
  prepareSearch: '准备搜索任务',
  planSearch: '搜索规划',
  componentWorker: '器件搜索',
  syncModules: '同步模块',
  connectModules: '模块连接设计',
  buildModuleGraph: '生成连接图',
  request_design_decision: '确认设计决策',
  request_module_review: '确认模块变更',
  reflectDesign: '设计复核',
  ercCheckNode: '电气规则检查',
  exportCircuit: '导出电路',
  schematicDesign: '原理图设计',
  checkCircuit: '电路校验',
  datasheetReview: '数据手册评审',
  layoutAnnotate: '布局规划',
  integrateFlat: '生成原理图',
  genPreviewUrl: '生成预览',
  // Component / module operations
  component_worker: '搜索元器件',
  search_modules: '搜索模块',
  add_modules: '添加模块',
  replace_modules: '替换模块',
  rm_modules: '移除模块',
  complete_modules: '补全模块',
  connect_modules: '连接模块',
  // Design / schematic
  kicad_schematic_generate: '生成 KiCad 原理图',
  generate_design_outline: '生成流程图',
  write_connection: '写入连接',
  update_virtual_module_ports: '更新模块端口',
  submit_connection_report: '提交设计报告',
  // Engineering / validation
  erc_check: '电气规则检查',
  add_new_eco: '添加 ECO',
  apply_user_option: '应用用户选项',
  // BOM
  update_bom: '更新 BOM',
  add_module: '添加模块',
  delete_module: '删除模块',
  research_module: '重新搜索模块',
  replace_module: '替换模块',
  update_quantity: '更新数量',
} as const

type CallNameKey = keyof typeof TOOL_CALLS_ZH

const TOOL_CALLS_EN: Record<CallNameKey, string> = {
  plan_search: 'Search Planning',
  es_category_search: 'Category Search',
  es_precise_search: 'Precise Search',
  es_rag_search: 'Semantic Search',
  ComponentSearchOutput: 'Component Retrieval',
  intent_resolver: 'Routing Decision',
  generate_design_plan: 'Generate Design Plan',
  reflect_design: 'Design Reflection',
  module_ops_agent: 'Module Operations Agent',
  intentResolver: 'Requirements Analysis',
  generateDesignPlan: 'Design Plan Generation',
  moduleOpsAgent: 'Module Operations',
  designAgent: 'System Design',
  model_request: 'Analysis and Decision',
  tools: 'Run Tools',
  design_plan_gen: 'Generate Design Plan',
  module_search: 'Module Search',
  module_connect: 'Module Connection',
  request_module_change: 'Module Replacement',
  prepareSearch: 'Prepare Search Tasks',
  planSearch: 'Component Search Planning',
  componentWorker: 'Component Search',
  syncModules: 'Module Synchronization',
  connectModules: 'Module Interconnection Design',
  buildModuleGraph: 'Build Connection Graph',
  request_design_decision: 'Confirm Design Decision',
  request_module_review: 'Review Module Changes',
  reflectDesign: 'Design Review',
  ercCheckNode: 'Electrical Rules Validation',
  exportCircuit: 'Circuit Export',
  schematicDesign: 'Schematic Design',
  checkCircuit: 'Circuit Validation',
  datasheetReview: 'Datasheet Review',
  layoutAnnotate: 'Schematic Layout Planning',
  integrateFlat: 'Schematic Generation',
  genPreviewUrl: 'Preview Rendering',
  component_worker: 'Search Components',
  search_modules: 'Search Modules',
  add_modules: 'Add Modules',
  replace_modules: 'Replace Modules',
  rm_modules: 'Remove Modules',
  complete_modules: 'Complete Modules',
  connect_modules: 'Connect Modules',
  kicad_schematic_generate: 'Generate KiCad Schematic',
  generate_design_outline: 'Generate Diagram',
  write_connection: 'Write Connections',
  update_virtual_module_ports: 'Update Module Ports',
  submit_connection_report: 'Submit Design Report',
  erc_check: 'Electrical Rules Check',
  add_new_eco: 'Add ECO',
  apply_user_option: 'Apply User Options',
  update_bom: 'Update BOM',
  add_module: 'Add Module',
  delete_module: 'Delete Module',
  research_module: 'Research Module',
  replace_module: 'Replace Module',
  update_quantity: 'Update Quantity',
}

// ── Schematic-gen overrides ────────────────────────────────────────────────
// The schematic agent reuses some identifiers with a different, more specific
// meaning than `TOOL_CALLS` gives them — `schematicDesign` is "原理图设计"
// generically but "需求解析与电路设计" as a schematic node, and `search_parts`
// is the subagent (子代理) when it is a node but plain 物料搜索与选型 when it is
// a tool. These two tables are consulted BEFORE `TOOL_CALLS`.

const SCH_NODES_ZH = {
  schematicDesign: '需求解析与电路设计',
  datasheetReview: '数据手册设计复核',
  checkCircuit: '电气连接完整性检查',
  layoutAnnotate: '原理图布局规划',
  integrateFlat: '生成 KiCad 原理图',
  genPreviewUrl: '生成原理图预览',
  search_parts: '物料搜索与选型子代理',
  circuit_review: '电路设计评审子代理',
} as const

type SchNodeKey = keyof typeof SCH_NODES_ZH

const SCH_NODES_EN: Record<SchNodeKey, string> = {
  schematicDesign: 'Circuit Design Engineering',
  datasheetReview: 'Design Review',
  checkCircuit: 'Electrical Design Validation',
  layoutAnnotate: 'Schematic Layout Planning',
  integrateFlat: 'Schematic Generation',
  genPreviewUrl: 'Preview Rendering',
  search_parts: 'Component Selection Subagent',
  circuit_review: 'Circuit Design Review Subagent',
}

const SCH_TOOLS_ZH = {
  symbol_search: '器件符号检索',
  ic_search: '芯片型号检索',
  search_parts: '物料搜索与选型',
  research_datasheet: '数据手册研究',
  submit_module: '提交并校验电路设计',
  check_ic: '芯片应用电路检查',
  ic_datasheet_search: '芯片数据手册检索',
  circuit_review: '电路设计评审',
} as const

type SchToolKey = keyof typeof SCH_TOOLS_ZH

const SCH_TOOLS_EN: Record<SchToolKey, string> = {
  symbol_search: 'Component Search',
  ic_search: 'IC Search',
  search_parts: 'Component Selection',
  research_datasheet: 'Datasheet Research',
  submit_module: 'Design Submission',
  check_ic: 'IC Application Check',
  ic_datasheet_search: 'IC Datasheet Search',
  circuit_review: 'Circuit Design Review',
}

// ── Packs ──────────────────────────────────────────────────────────────────

interface NamePack {
  /** Schematic graph nodes (checked first, schematic runs only). */
  nodes: Record<string, string>
  /** Schematic tool names (checked second). */
  tools: Record<string, string>
  /** Shared node + tool vocabulary (system runs use only this one). */
  calls: Record<string, string>
}

const PACKS: Record<AuthLocale, NamePack> = {
  zh: {
    nodes: SCH_NODES_ZH as Record<string, string>,
    tools: SCH_TOOLS_ZH as Record<string, string>,
    calls: TOOL_CALLS_ZH as Record<string, string>,
  },
  en: {
    nodes: SCH_NODES_EN as Record<string, string>,
    tools: SCH_TOOLS_EN as Record<string, string>,
    calls: TOOL_CALLS_EN as Record<string, string>,
  },
}

/** Exported for tests: the raw packs, so zh/en parity can be asserted. */
export const TRACE_NAME_PACKS = PACKS

/** Which agent produced the run — decides which tables apply. */
export type TraceKind = 'schematic' | 'system'

/**
 * Turn one raw trace identifier into the localized display name.
 *
 * Resolution order for a schematic run mirrors `TraceTimeline#resolveName`:
 * `node:<name>` → schematic nodes → schematic tools → shared table → the bare
 * name. The last step is what keeps module instance titles intact.
 */
export function resolveTraceName(raw: string, kind: TraceKind, locale: AuthLocale): string {
  if (typeof raw !== 'string' || raw.length === 0) {
    return raw
  }
  const pack = PACKS[locale] ?? PACKS.zh
  const name = raw.startsWith(NODE_PREFIX) ? raw.slice(NODE_PREFIX.length) : raw

  // System design has no per-agent override tables: one flat lookup, and
  // anything unknown (a module worker instance named after its module) passes
  // straight through.
  if (kind === 'system') {
    return pack.calls[name] ?? name
  }

  if (pack.nodes[name]) {
    return pack.nodes[name]!
  }
  const asTool = pack.tools[name] ?? pack.calls[name]
  if (asTool) {
    return asTool
  }

  // `base:suffix` forms render as "Label · suffix". Unlike hq-eda-ai — which
  // drops the suffix whenever the base is unknown (`tools[base] ?? base`) —
  // we only split when the base IS known, so a name that merely contains a
  // colon survives intact.
  const sep = name.indexOf(':')
  if (sep > 0 && sep < name.length - 1) {
    const base = name.slice(0, sep)
    const label = pack.tools[base] ?? pack.calls[base]
    if (label) {
      return `${label} · ${name.slice(sep + 1)}`
    }
  }

  return name
}

/** `resolveTraceName` bound to the host UI language. */
export function useTraceNames(kind: TraceKind): (name: string) => string {
  const locale = useLocale()
  return useCallback(
    (name: string) => resolveTraceName(name, kind, locale),
    [kind, locale],
  )
}
