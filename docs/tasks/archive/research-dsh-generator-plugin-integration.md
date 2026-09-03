# Research: DSH Generator Workspace Integration

**Task:** `docs/tasks/generator-workspace-integration.md`
**Status:** research only — no production code was modified.
**Date:** 2026-09-03

## Pinned source state

| Repository | Commit | Notes |
|---|---|---|
| `deepseek-harness` (DSH) | `61e8199aae67c3ae23db96a722aa6585a48dd0d4` (2026-08-25) | fork `Huaqiu-Electronics/deepseek-harness`, upstream `deepseek-ai/deepseek-harness` |
| `dsh-pcb-eda` | `746f20b0a7629c9aa230f3d4393b73290ad57559` (2026-09-03) | `Huaqiu-Electronics/dsh-pcb-eda` |
| `dsh-plugin` | — | not a git repo; a directory of ~26 independently cloned third-party DSH plugin repos |

Paths below are relative to `/Users/admin/code/deepseek-harness` unless the repo is named explicitly.

> Prior research in this repo (`docs/research/dsh-pcb-eda.md`, `docs/research/migrate-hq-edge-plugins.md`,
> `docs/research/dsh-plugin-deployment-and-hq-edge-bundling.md`) covers packaging, auth and artifacts
> well. They do **not** cover the DSH Web UI extension surface. This document fills that gap; it is
> self-contained but does not repeat what those three already establish.

---

## Executive Summary

1. **DSH Web has no generic "register a top-level workspace" API.** The frame has exactly three
   columns — `sidebar`, `conversation`, `details` — plus one floating layer `shell.overlay`
   (`packages/client/ui-layout/src/client/index.ts:33-84`). Each column is a `kind: 'single'` slot.
   Registering into a single slot **replaces** its occupant and destroys the child slots it declares.

2. **The idiomatic plugin-owned workspace is a `conversation.view` entry.** That slot is a
   `list` slot rendered as a **tab strip** in the session header, beside Chat
   (`packages/client/ui-conversation/src/client/contract/slots.ts:113`;
   rendered at `packages/client/ui-conversation/src/client/skeleton/ConversationSession.tsx:145-160`).
   This is exactly how DSH ships its own second workspace: `ui-trajectory` registers
   `id: 'trajectory', order: 10, label: () => t('view.trajectory')`
   (`packages/client/ui-trajectory/src/client/index.ts:43-64`).

3. **Answer to the task's central question:** the three generators should be `conversation.view`
   entries (tabs), not webviews, not iframes, not panels, and not a new primitive. Each gets
   `id: 'huaqiu-symbol' | 'huaqiu-footprint' | 'huaqiu-schematic'`, a localized `label`, and an
   `order` above `10` so they sort after Chat/Trajectory.

4. **The `sidebar` is effectively closed.** The only additive sidebar seat is
   `sidebar.footer.action` (a `list`), which `dsh-auth` already uses for the 华秋EDA login entry
   (`dsh-pcb-eda/packages/dsh-auth/src/client/index.tsx:109`). `sidebar.workspaces` is a `single`
   slot owned by `ui-workspace`. Do not plan a sidebar nav for the generators.

5. **Tools stay exactly where they are.** `ctx.tools.register(defineTool({...}))` in the node half;
   the tool body is a thin adapter over the existing generator server API. Both
   `@huaqiu/dsh-tool-symbol-footprint` and `@huaqiu/dsh-tool-schematic-gen` already do this and
   should not be restructured.

6. **Agent → workspace handoff has no public API.** `setView()` has exactly two call sites, both
   inside `ui-conversation` (`src/client/apply.ts:410`, `src/client/skeleton/ConversationSession.tsx:154`).
   There is **no client-side router and no deep links** anywhere in DSH Web. The handoff must be a
   **plugin-provided client service** (the `huaqiuAuth` precedent) carrying the artifact id, plus a
   user gesture to switch tabs. `shell.overlay` is the escape hatch if a plugin-owned,
   programmatically-openable full-screen surface is required.

7. **Authentication is already solved and must be reused verbatim.** `huaqiuAuth` resolves
   host (HQ Edge `GET /api/v1/auth/token`, fed by overlay `config.hqEdgeBaseUrl`) → browser-pushed →
   `~/.dsh/auth/session.json` → `null`
   (`dsh-pcb-eda/packages/dsh-auth/src/service.ts:1-23`, `src/host.ts:16-21`). Inside DSH/HQ Edge the
   user never enters an API key; standalone DSH keeps the browser login. **No new auth system.**

8. **Endpoint discovery is not a DSH problem.** The generator APIs are remote
   (`https://gen.eda.cn/api/copilotkit`), resolved from env/overlay config
   (`dsh-pcb-eda/packages/dsh-tool-schematic-gen/src/config.ts:24-27, 58-69`). There is **no
   `HQ_EDGE_PORT`** and none is needed: only `@huaqiu/dsh-auth` talks to HQ Edge, and it receives
   `hqEdgeBaseUrl` as overlay `config`.

9. **All three generators can share one architecture.** Shared: a client-half runtime library
   (slot registration helpers, `huaqiuAuth` consumption, artifact HTTP client, i18n pack, theme).
   Generator-specific: the view component, the tool schemas, the API endpoints, and the artifact type.

10. **Pick `@deepseek-ai/dsh-client-ui-trajectory` as the reference implementation** for the browser
    half and the existing `@huaqiu/dsh-tool-schematic-gen` for the node half. `@huaqiu/dsh-auth` is
    the reference for the cross-cutting concerns (service provide/inject, webServer routes,
    standalone-vs-host mode detection).

---

## 1. Existing DSH Plugin Inventory

### 1.1 DSH's own client packages (`packages/client/*`)

These are the authoritative examples — they are the only code that ships with DSH and therefore the
only code guaranteed to be correct against the current slot API.

| Package | UI seats it registers | Tools | Backend | Relevance |
|---|---|---|---|---|
| `ui-trajectory` | `conversation.view` (tab `trajectory`) | – | – | **PRIMARY REFERENCE** — plugin-owned view tab |
| `ui-conversation` | declares ~20 conversation slots; registers `conversation.view` `chat`, composer, header, docks | – | – | the owner of the workspace primitive |
| `ui-layout` | declares `sidebar`/`conversation`/`details`/`shell.overlay`; registers `root` | – | – | defines the frame, `ctx.layout` |
| `ui-sidebar` | declares `sidebar.*`; registers `sidebar` | – | – | proves the sidebar is closed |
| `ui-workspace` | `sidebar.workspaces`, `conversation.hero.workspace` | – | – | workspace *picker*, not a workspace |
| `ui-tool` | declares `tool.call.toolview`; renders the tool tree | – | – | agent tool-result rendering |
| `ui-deliverables` | `conversation.chat.turnTail`, provides `chatFileMentions` | – | – | provider-by-`ctx.get` precedent |
| `ui-goal`, `ui-plan`, `ui-skill`, `ui-model-selection`, `ui-agent-preset`, `ui-user-questions`, `ui-jobs`, `ui-subagent`, `ui-attachment`, `ui-commands`, `ui-input-trigger`, `ui-mnemon`-style | various composer/header/settings seats | – | – | seat-use examples |
| `ui-settings`, `ui-settings-plugins`, `ui-settings-general`, `ui-settings-plugin-inventory` | declares `settings.*` seats | – | – | settings UI pattern |

### 1.2 Third-party plugins under `/Users/admin/code/dsh-plugin`

All of them are real, shipped plugins. Slot usage below was extracted from their built
`lib/client.js` bundles (source not vendored), so it is evidence of *what is possible*, not of API shape.

| Plugin | Package name | `dsh.client` | Browser slots observed | Relevance |
|---|---|---|---|---|
| `dsh-plugin-open-app` | `@2nd1st/dsh-plugin-open-app` | web; injects `…client-ui-slots`, `…client-ui-conversation` | `sidebar.footer.action`, `conversation.view`, `conversation.input.dock`, `shell.overlay`, `tool.call.toolview` | **HIGHEST** — "one container per app with its own workspace and conversation" |
| `DSH-better-sidebar` | `dsh-better-sidebar` | – | registers its own `/sidebar/api` prefix route and exposes a *plugin-provided* service for other plugins to add sidebar pages | proves sidebar extension needs a plugin-owned service |
| `dsh-genui` | – | web | `tool.call.toolview` (UI-from-tool-output protocol) | tool-result rendering |
| `deepseek-harness-genui` | – | web | similar | tool-result rendering |
| `dsh-git-worktree` | `dsh-git-worktree` | web; injects `@deepseek-ai/dsh-client-ui-tool` | `tool.call.toolview` | tool + UI |
| `dsh-mcp-panel`, `dsh-market`, `dsh-mnemon`, `dsh-context`, `dsh-computer-use`, `dsh-visualize` | – | web | `settings.section` (computer-use), settings seats | backend-integration & settings examples |
| `dsh-toolkit` | `@deepseek-ai/dsh-toolkit` | none (node only) | – | node-only plugin |
| `dsh-pcb-parts-search` | – | none | – | earlier Huaqiu tool plugin |
| `Oh-My-DSH` (`dsh-webui-enhance`, `dsh-badgeboard`, `dsh-memory`, `dsh-agent-swarm`) | – | web | `details`, `conversation.view`, `conversation.session.header.actions`, `tool.view.cordis` | documents the slot names in its README |

### 1.3 Huaqiu plugins in this repo (`dsh-pcb-eda/packages/*`)

| Plugin | Node half | Browser half | Tools | Backend | Auth | Relevance |
|---|---|---|---|---|---|---|
| `@huaqiu/dsh-auth` | provides `huaqiuAuth`, mounts `/api/v1/huaqiu/auth` | `sidebar.footer.action`, `tool.call.toolview` (historically) | – | HQ Edge (host mode) / auth.eda.cn | **owner** | **REFERENCE for cross-cutting** |
| `@huaqiu/dsh-artifacts` | provides `huaqiuArtifacts`, mounts `/api/v1/huaqiu/artifacts` | – | – | fs under `~/.dsh/artifacts` | – | artifact store |
| `@huaqiu/dsh-tool-symbol-footprint` | 3 tools, SSE progress route | `tool.call.toolview` × 3 | `generate_symbol_from_image`, `generate_footprint_from_image`, `generate_footprint_from_dimensions` | `gen.eda.cn` | `huaqiuAuth` | **REFERENCE for node half** |
| `@huaqiu/dsh-tool-schematic-gen` | 2 tools, SSE progress route | `tool.call.toolview` × 2 | `generate_schematic_from_description`, `generate_system_module_graph` | `gen.eda.cn` | `huaqiuAuth` | **REFERENCE for node half** |
| `@huaqiu/dsh-tool-part-search` | 4 tools | – | `search_hqsch_parts`, `get_hqsch_part`, `get_hqsch_part_models`, `get_hqsch_supply_chain` | HQsch API | – | tools-only precedent |

---

## 2. Reference Plugin Deep Dive

Two references are needed, because no single existing plugin covers both halves.

### 2.1 Browser half — `@deepseek-ai/dsh-client-ui-trajectory`

**Why it is the closest match.** It is the only shipped, cross-package plugin whose entire job is
"add a second workspace to the conversation, without owning a service". It is 65 lines long, has no
store, no server, and no tool. It is the minimal correct answer to *"how does a plugin own a
workspace?"*

**Package structure** (`packages/client/ui-trajectory/package.json`)

```jsonc
{
  "name": "@deepseek-ai/dsh-client-ui-trajectory",
  "main": "lib/index.js",              // node half (unused here, but must exist)
  "exports": {
    ".":        { "types": "./lib/types/index.d.ts",  "default": "./lib/index.js" },
    "./client": { "types": "./lib/types/client/index.d.ts", "default": "./lib/client.js" },
  },
  "dsh": {
    "client": {
      "inject": [                                   // MODULE-GRAPH ORDER, not runtime DI
        "@deepseek-ai/dsh-client-locale",
        "@deepseek-ai/dsh-client-runtime",
        "@deepseek-ai/dsh-client-ui-conversation",  // declares 'conversation.view'
      ],
      "platform": "web"
    }
  }
}
```

**Entrypoint** (`packages/client/ui-trajectory/src/client/index.ts`, verbatim, lines 22-64)

```ts
export const inject = ['slots', 'conversationEvents', 'conversationViews', 'sessions', 'locale']

export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-trajectory: dictionaries')
  const t = ctx.locale.bind(NS)                     // label follows locale without re-registering
  const duration = createTrajectoryDurationStore()
  registerTrajectoryMessageDefinitions(ctx)
  // …
  ctx.slots.inject('conversation.view', () => ctx.slots.register({
    name: 'conversation.view',
    id: 'trajectory',
    order: 10,
    locale: NS,
    label: () => t('view.trajectory'),
    inject: (sessionId: SessionId): TrajectoryViewInjected => {
      const session = ctx.sessions.binding(sessionId)?.session
      if (session === undefined) throw new Error(`ui-trajectory: session "${sessionId}" is unavailable`)
      return { hooks: { duration }, loadOlder: async () => { /* … */ }, setActualDuration: v => duration.set(v) }
    },
  }, TrajectoryView))
}
```

**Conventions to copy**

| # | Convention | Evidence |
|---|---|---|
| 1 | `export const inject` lists **real service names** (`slots`, `sessions`, `locale`) | `src/client/index.ts:23` |
| 2 | `ctx.slots.inject(key, () => ctx.slots.register(opts, Comp))` for a slot **declared by another package** | `src/client/index.ts:43` |
| 3 | `id` + `order` + `label` (a **thunk**, so it follows locale) | `src/client/index.ts:45-48` |
| 4 | `ctx.locale.register(NS, {zh, en})` then `ctx.locale.bind(NS)` | `src/client/index.ts:31, 35` |
| 5 | `ctx.effect(fn, 'label')` for disposal | `src/client/index.ts:31` |
| 6 | Business data arrives through the `inject` factory, keyed by `sessionId` | `src/client/index.ts:49-63` |
| 7 | `dsh.client.inject` = **graph ordering** only; the runtime inject list is the module export | `package.json:32-41` vs `src/client/index.ts:23` |

**What NOT to copy**

- Its `registerXxxDefinition(ctx)` calls (`trajectory-*`) are trajectory-domain ledger registrations.
- It declares no `store`; the generators **will** need one (form state, artifact list, selected
  artifact). Use `defineStore` from `@deepseek-ai/dsh-client-runtime/client`
  (`packages/client/runtime/src/client/index.ts:70`) and pass `store: createMyStore` to `register`.
- It has no node half worth imitating (it is a pure consumer). Generators need the tools half from
  `dsh-tool-schematic-gen`.

### 2.2 Node half + cross-cutting — `@huaqiu/dsh-tool-schematic-gen` and `@huaqiu/dsh-auth`

**Node entry** (`dsh-pcb-eda/packages/dsh-tool-schematic-gen/src/index.ts:31-41`, 57-127)

```ts
export const name = '@huaqiu/dsh-tool-schematic-gen'
export const inject = ['tools', 'huaqiuAuth', 'huaqiuArtifacts', 'webServer'] as const

export function apply(ctx: Context, config: SchematicGenPluginConfig = {}): () => void {
  // fail fast on missing services (lines 58-71)
  const finalConfig = resolveConfig({ ...process.env, ...configOverride })
  const progress = new ProgressStore()
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix', path: PROGRESS_ROUTE_PREFIX, handler: createProgressHandler(progress),
  }))
  const disposers = createSchematicGenTools(env).map(tool => ctx.tools.register(tool))
  return function dispose() { for (const d of disposers) { try { d() } catch {} } ; progress.sweep() }
}
```

**Conventions to copy**

| # | Convention | Evidence |
|---|---|---|
| 1 | Fail fast at load time with a message naming the missing service | `src/index.ts:58-71` |
| 2 | Endpoint overrides: overlay `config` wins over env, both optional | `src/index.ts:77-80`, `src/config.ts:58-69` |
| 3 | Live progress via a node `webServer` **prefix** route polled by the browser card | `src/index.ts:86-95` |
| 4 | Tools are created by a factory and registered with disposers collected | `src/index.ts:107` |
| 5 | `defineTool({ name, description, parameters, output: { schema, render }, execute, presentCall, timeoutMs })` | `src/tools.ts:503-544` |
| 6 | Cross-package services declared **structurally, never imported** | `dsh-tool-schematic-gen/src/client/index.ts:58-64` |
| 7 | Standalone-vs-host mode detected by asking the node half over a plugin route | `dsh-auth/src/client/index.tsx:103-111`, `src/routes.ts:91-94` |

**What NOT to copy**

- The `AUTH_GATE_NOTE` "ask the user to log in" flow is a workaround for **standalone DSH** where
  there is no workspace. With a real workspace, the workspace itself should own the login surface and
  the tool description should point at the workspace instead.
- The HIT card's "do not paste the source into your reply" instruction exists because the card is the
  *only* surface today. Once a workspace exists, the tool should return the `artifactId` and the card
  should offer "Open in … Generator".

---

## 3. DSH UI Integration Pattern

### 3.1 The complete slot inventory (authoritative)

`SlotMap` is an empty interface that every UI package extends by declaration merging
(`packages/client/ui-slots/src/index.ts:24`). The union below is the complete extension surface.
`kind` determines cardinality: `single` = replace, `list` = additive, `keyed` = dispatch by key,
`chain` = selector-routed replacement.

| Slot | Kind | Scope | Declared by | Usable by plugins? |
|---|---|---|---|---|
| `root` | single | root | runtime — **DO NOT register** (`runtime/src/client/slots.ts:33-42`) | ✗ |
| `sidebar` | single | root | `ui-layout` | ✗ (replaces the whole column) |
| `conversation` | single | session-maybe | `ui-layout` | ✗ |
| `details` | single | session | `ui-layout` | ✗ |
| **`shell.overlay`** | **list** | root | `ui-layout` | **✓** frame-wide floating layer |
| `sidebar.brand.mark` / `.brand.name` | single | root | `ui-sidebar` | ~ (takes over branding) |
| `sidebar.workspaces` | single | root | `ui-sidebar` | ✗ (claimed by `ui-workspace`) |
| `sidebar.settings` | single | root | `ui-sidebar` | ✗ |
| **`sidebar.footer.action`** | **list** | root | `ui-sidebar` | **✓** (used by `dsh-auth`, `open-app`) |
| `conversation.session` | single | session | `ui-conversation` | ✗ |
| `conversation.session.header` | single | session | `ui-conversation` | ✗ |
| `conversation.session.header.lineage` | single | session | `ui-conversation` | ~ |
| **`conversation.session.header.actions`** | **list** | session | `ui-conversation` | **✓** |
| **`conversation.session.header.utilities`** | **list** | session | `ui-conversation` | **✓** |
| **`conversation.view`** | **list** | session | `ui-conversation` | **✓ ← THE WORKSPACE PRIMITIVE** |
| `conversation.chat.node` | keyed | session | `ui-conversation` | ~ (chat internals) |
| `conversation.message.images` | single | session | `ui-conversation` | ~ |
| `conversation.chat.commandview` | keyed | session | `ui-conversation` | **✓** (by command name) |
| `conversation.chat.turnTail` | chain | session | `ui-conversation` | **✓** |
| `conversation.chat.assistant-actions` | list | session | `ui-conversation` | **✓** |
| `conversation.details.tool` | single | session | `ui-conversation` | ~ |
| `conversation.composer` | chain | session | `ui-conversation` | **✓** |
| `conversation.hero.workspace` / `.brand.mark` / `.agentPreset` | single | root | `ui-conversation` | ~ |
| `conversation.input.dock` / `.composer.dock` / `.left` / `.right` | list | session | `ui-conversation` | **✓** |
| `conversation.composer.bar` | single | session-maybe | `ui-conversation` | ~ |
| `conversation.input.attachments` | single | session-maybe | `ui-conversation` | ~ |
| `conversation.input.plan` / `.model` | single | session | `ui-conversation` | ~ |
| `conversation.input.overlay` | list | session | `ui-input-trigger` | **✓** |
| **`tool.call.toolview`** | **keyed** | session | `ui-tool` | **✓ keyed by wire tool name** |
| `settings.trigger` / `.header` / `.close` | single | root | `ui-settings` | ~ |
| `settings.action` / `.section` / `.plugins.tab` / `.onboarding` / `.general.item` | list | root | `ui-settings` | **✓** |
| `settings.plugin.item` | keyed | root | `ui-settings-plugins` | **✓** |
| `conversation.hero.workspace.directoryFlow`, `sidebar.workspaces.directoryFlow` | single | root | `ui-workspace` | ~ |

### 3.2 How a `conversation.view` entry becomes a workspace

1. **Declare** — `ui-conversation` claims the slot when it registers `conversation.session`:
   `children: { 'conversation.view': { kind: 'list', scope: 'session' } }`
   (`packages/client/ui-conversation/src/client/apply.ts:240-244`). Declaring is claiming.
2. **Register** — any plugin calls `ctx.slots.inject('conversation.view', () => ctx.slots.register(
   { name: 'conversation.view', id, order, label }, Component))`.
3. **Project to tabs** — `ui-conversation` reads the ledger and builds the tab list
   (`packages/client/ui-conversation/src/client/apply.ts:153-166`):

   ```ts
   const viewTabs = (): ViewTab[] => {
     const tabs: ViewTab[] = []
     for (const entry of slots.entries('conversation.view')) {
       if (entry.options.id === undefined) continue
       tabs.push({ id: entry.options.id, label: resolveSlotLabel(entry.options.label) ?? entry.options.id })
     }
     return tabs
   }
   const views = {
     list: viewTabs,
     subscribe: fn => slots.subscribe('conversation.view', fn),
     version: () => slots.getVersion('conversation.view'),
   }
   ```

   `ViewTab` is `{ id: string; label: string }` (`src/client/contract/views.ts:13`).
4. **Render** — the header draws a tab strip when there is more than one view
   (`packages/client/ui-conversation/src/client/skeleton/ConversationSession.tsx:145-160`):

   ```tsx
   {tabs.length > 1 && (
     <div className={css.tabs} role="tablist">
       {tabs.map(viewTab => (
         <button key={viewTab.id} type="button" role="tab"
                 aria-selected={viewTab.id === active?.id}
                 onClick={() => { actions.setView(viewTab.id) }}>
           {viewTab.label}
         </button>
       ))}
     </div>
   )}
   ```

5. **Select** — `actions.setView(id)` writes `ChatStoreState.view`, which is persisted per session
   under `dsh.conversation.chat` (`src/client/stores.ts:26`). Active-view resolution falls back to
   `'chat'` when the stored id is unknown (`ConversationSession.tsx:24-31`).
6. **Render one at a time** — the session body renders the active entry via
   `renderSlot('conversation.view', …, { only: activeId })`.

Result — exactly the UX the task asks for:

```text
┌──────────┬──────────────────────────────────────────────────┐
│ sidebar  │  [ Chat ] [ Trajectory ] [ Symbol ] [ Footprint ] [ Schematic ]
│          │  ────────────────────────────────────────────────
│ work-    │
│ spaces   │   <the active view's component, full column>
│          │
└──────────┴──────────────────────────────────────────────────┘
```

### 3.3 Pattern comparison (task §4)

| Pattern | Primitive | Per-session? | Programmatically openable? | Verdict |
|---|---|---|---|---|
| sidebar → route | ✗ no client router exists | – | – | impossible |
| sidebar → webview | ✗ no webview primitive | – | – | impossible |
| toolbar → panel | `details` is `single` | yes | `ctx.layout.openDetails()` | wrong surface (a side panel) |
| plugin → iframe | possible inside any component | yes | depends on host | unnecessary — no legacy app to embed |
| **`conversation.view` tab** | **list slot** | **yes** | ✗ (see §8) | **RECOMMENDED** |
| `shell.overlay` | list slot, root scope, click-through | no (root) | ✓ plugin-controlled | escape hatch |

**Explicit answer to task §4's question:** implement all three generators as
**`conversation.view` entries** — i.e. DSH conversation-workspace tabs, a first-class DSH primitive.
Use `shell.overlay` only if a requirement emerges that demands a plugin can *programmatically* open a
full-screen surface; do not build that pre-emptively.

### 3.4 Registration API reference

`ctx.slots.register(options, component)` — `options`
(`packages/client/runtime/src/client/slots.ts:68-84`):

| Field | Meaning |
|---|---|
| `name` | slot key (required) |
| `key` | dispatch key for `keyed` slots (e.g. a tool name for `tool.call.toolview`) |
| `id` | identity for `list`/`single` entries; **required** for `conversation.view` (it becomes the tab id) |
| `order` | ascending render order for `list` slots (chat = `0`, trajectory = `10`) |
| `label` | `string \| (() => string)`; the tab caption (`ui-slots/src/index.ts:474, 581`) |
| `priority` | explicit order for `chain` slots |
| `select` | `(owner) => match \| null` for `chain` slots |
| `store` | a `StoreHandle` (shared) or `() => StoreHandle` (exclusive per entry) → component gets `useStore` + `actions` |
| `inject` | `(sessionId?, actions?) => InjectedFace` — business callbacks |
| `children` | declare child slots (declaring = claiming) |
| `locale` | namespace name → component receives a typed `t` |

`ctx.slots.inject(key, callback)` (`packages/client/runtime/src/client/slots.ts:143-205`) runs the
callback when the slot is declared (and re-runs if the declaration is replaced), wiring disposal into
the caller's Cordis fiber. **This is the correct call for contributing to a slot you do not own.**

Stores: `defineStore({ init, persist?, actions })` is publicly exported
(`packages/client/runtime/src/client/index.ts:70`). Session-scope stores are instantiated per session
and the persist key is suffixed with the session id (`ui-slots/src/index.ts:84-91`).

---

## 4. Tool Integration Pattern

### 4.1 Registration

Node half only. Service name `tools`, so `inject` must list it.

```ts
// packages/core/tools/src/index.ts:1037-1062
register(definition: ToolDefinition): () => void
```

`ToolDefinition` (`packages/core/tools/src/index.ts:222-288`):

| Field | Required | Notes |
|---|---|---|
| `name` | ✓ | wire name; `run_code` is reserved (throws) |
| `description` | ✓ | LLM prompt contract |
| `parameters` | ✓ | JSON-Schema-ish object; each property may carry `required: true` |
| `output: { schema, render, presentationMeta? }` | ✓ | `register` throws without it; `render(args, value): ContentBlock[]` |
| `execute(args, exec)` | ✓ | `exec` gives `agent`, `signal`, `callId`; must observe `signal` |
| `presentCall(args)` | – | `ToolCallView` — pending card (pure, replay-safe) |
| `presentResult(args, result)` | – | `ToolResultView` — completed card |
| `finalizeContent(exec, result)` | – | last-mile model-facing content transform |
| `timeoutMs` | – | enforced by a wrapper; never sent to the model |
| `isConcurrencySafe(args)` | – | opt into parallel dispatch |

Real example — `packages/schedule/schedule/src/tools.ts:317-397` (`schedule_create`), and in this
repo `dsh-pcb-eda/packages/dsh-tool-schematic-gen/src/tools.ts:503-544`
(`generate_schematic_from_description`) and `dsh-tool-symbol-footprint/src/tools.ts:493-560`.

### 4.2 Adapter vs inline logic — task §5's question

**Recommended: `generator server API ↑ DSH tool adapter`.** The existing Huaqiu plugins already do
this and it is the only structure compatible with the standalone/API-key requirement:

```text
packages/<gen>/src/tools.ts      defineTool({ name, description, parameters, output, execute })
        │  execute() → thin adapter: resolve account, build body, POST, store artifact
        ▼
packages/<gen>/src/sse.ts        HTTP/SSE transport to the existing server API
        ▼
   https://gen.eda.cn/api/…      the SAME server API standalone clients use
```

Evidence that this is already the house style:

- `dsh-tool-schematic-gen/src/config.ts:24-27` — the tool targets the **production** endpoint
  `https://gen.eda.cn/api/copilotkit`, the same one the reference scripts POST to.
- `dsh-tool-schematic-gen/src/index.ts:11-18` — "no `@hqedge/*` dependency, no HTTP proxy"; the tool
  is a self-contained adapter over the public API.
- `dsh-tool-schematic-gen/src/tools.ts:163-166` — the only persistence is
  `artifacts.create({ type, filename, content, contentEncoding })`.

**Nothing about the tool layer needs to change to add workspaces.** The tools already return an
`artifact` reference in their JSON output
(`dsh-tool-symbol-footprint/src/client/parse.ts:42, 107-134`), which is exactly what a workspace
needs to open a result.

### 4.3 Rendering a tool result in the UI

`tool.call.toolview` is `keyed` by **wire tool name**; the key domain is open, so a plugin owns the
rendering of its own tools (`packages/client/ui-tool/src/client/contract/slots.ts:10-25`). Owner props
(`ToolCallOwnerProps`, lines 29-44): `callId`, `toolName`, `block` (frozen running-or-settled node),
`cwd`, `home`, `openFile(path)`, `inspect?()`.

Both Huaqiu generator plugins already use this — see
`dsh-pcb-eda/packages/dsh-tool-schematic-gen/src/client/index.ts:156-161`:

```ts
for (const toolName of TOOLVIEW_KEYS) {
  disposers.push(slots.inject('tool.call.toolview', () => slots.register(
    { name: 'tool.call.toolview', key: toolName }, GenHitView) as () => void))
}
```

There is also a declarative route: `presentCall` / `presentResult` return `card`-tagged views
(`generic | terminal | diff | search | read | web`) that render without any slot registration
(`packages/core/tools/src/presentation.ts:46, 140`). Use those for simple cases; use
`tool.call.toolview` when the result needs real interactivity.

---

## 5. Authentication Pattern

### 5.1 Answer to task §6

> The canonical existing mechanism is the **`huaqiuAuth` Cordis service** provided by
> `@huaqiu/dsh-auth`, which resolves the credential in a fixed order and hands the node half a token
> that the tool layer puts on `x-user-id` / `x-user-token`. No plugin outside `dsh-auth` ever touches
> a credential source.

**Resolution order** (`dsh-pcb-eda/packages/dsh-auth/src/service.ts:14-21`, `src/host.ts:16-21`):

```text
1. host session   — HQ Edge configured → GET {hqEdgeBaseUrl}/api/v1/auth/token → {token, userId} (TTL cache)
2. pushed session — browser half logs in (auth.eda.cn iframe → postMessage) → POST /api/v1/huaqiu/auth/session
3. persisted file — node-side ~/.dsh/auth/session.json, written on every set
4. null           → tools return status "needs_auth"
```

**How the endpoint reaches the plugin** — overlay `config`, not an env var:

- `dsh-pcb-eda/packages/dsh-auth/src/index.ts:33` — `apply(ctx, config?: Partial<HuaqiuAuthConfig>)`.
- `src/host.ts:43-75` — `resolveHostConfig`: `config.hqEdgeBaseUrl` **>** `env.HQ_EDGE_BASE_URL` **>** `''`.
- `hq-edge/apps/server/src/dsh/supervisor.ts:1080-1097` — the supervisor puts
  `config: { hqEdgeBaseUrl }` on the **bridge entry only**; the DSH loader forwards it as the 2nd
  argument to `apply(ctx, config)`.

**How the token reaches the wire** (`dsh-tool-schematic-gen/src/config.ts:72-95`):

```ts
export function buildHeaders(config, account, threadId) {
  return { accept: 'text/event-stream', 'content-type': 'application/json',
           'x-user-id': account.userId, 'x-user-token': account.userToken,
           'x-thread-id': threadId, Referer: 'https://gen.eda.cn/' }
}
```

**Browser half** never sees the credential flow in host mode. `dsh-auth` provides a client service
(`src/client/index.tsx:69`) and consumers resolve it with `ctx.get('huaqiuAuth')` against a
**structural** interface (`dsh-tool-schematic-gen/src/client/index.ts:58-64`) so packages stay
independently installable.

### 5.2 What is NOT the mechanism

- **DSH's `credentials` service** (`packages/credentials/credentials/src/types.ts:36-59`) is scoped to
  LLM-provider credentials (`{kind:'api-key', key, env}` / `{kind:'grant', payload}`) keyed by
  `<owning-plugin-scope>/<id>`. It is for model adapters, not for a product backend. Do not use it.
- **A new API-key prompt inside DSH** would regress the host-mode flow and duplicate `dsh-auth`.

### 5.3 Inside DSH vs standalone — the task's model is already implemented

```text
Inside DSH/HQ Edge                        Standalone DSH
  overlay config.hqEdgeBaseUrl              (no config)
        ↓                                         ↓
  hq-edge GET /api/v1/auth/token            auth.eda.cn iframe → postMessage
        ↓                                         ↓
  huaqiuAuth (host mode)                    huaqiuAuth (pushed mode)
        ↓                                         ↓
        └──────────────┬──────────────────────────┘
                       ↓
        x-user-id / x-user-token on the existing generator API
```

The two modes are already distinguishable at runtime:
`GET /api/v1/huaqiu/auth/config → { hostMode }` (`dsh-auth/src/routes.ts:91-94`), consumed by the
browser half to suppress the login entrypoint in host mode (`dsh-auth/src/client/index.tsx:103-111`).
A generator workspace can use the same probe to decide whether to show a login gate.

---

## 6. Runtime / Service Endpoint Injection — task §7

**Finding: there is no `HQ_EDGE_PORT`, `HQ_EDGE_URL`, or service-endpoint injection, and none is
needed.**

- The generator APIs are **remote and fixed**: `DEFAULT_COPILOTKIT_URL =
  'https://gen.eda.cn/api/copilotkit'`, `DEFAULT_EXPORT_ZIP_URL =
  'https://gen.eda.cn/api/modular_circuit/export-zip'`
  (`dsh-pcb-eda/packages/dsh-tool-schematic-gen/src/config.ts:24-27`).
- Overrides come from env (`HQ_EDA_COPILOTKIT_URL`, `HQ_EDA_EXPORT_ZIP_URL`) or overlay `config`
  (`copilotkitUrl`, `exportZipUrl`), with overlay winning
  (`src/config.ts:58-69`; `src/index.ts:45-49, 77-80`).
- The **only** plugin that needs a host endpoint is `@huaqiu/dsh-auth`, and it gets it through the
  overlay `config` channel that already ships
  (`hq-edge/apps/server/src/dsh/supervisor.ts:1080-1097`; `dsh-auth/src/host.ts:43-49`).
- Sibling plugins must reach the host via `ctx.get('hqEdge')` /
  `ctx.get('huaqiuAuth')`, never via a new env var
  (`hq-edge/apps/server/src/dsh/supervisor.ts:84-89`).

**Answer:** a plugin discovers the generator server API from `resolveConfig()` (env + overlay
`config`, both optional, production defaults baked in). For anything host-side, inject the
`huaqiuAuth` service. Do not introduce an endpoint-injection mechanism.

**The one thing a plugin *does* need at runtime is a same-origin HTTP channel**, and that mechanism
exists: `ctx.webServer.register({ kind: 'exact' | 'prefix', path, handler })`
(`packages/host/webserver/src/index.ts:108-115, 123-128`). Both Huaqiu packages use a **prefix**
route with hand-rolled sub-path parsing, because `WebRoute` has no path parameters
(`dsh-pcb-eda/packages/dsh-artifacts/src/routes.ts:11-14, 31-44`):

```text
GET /api/v1/huaqiu/artifacts/<id>          → metadata JSON
GET /api/v1/huaqiu/artifacts/<id>/content  → raw bytes
```

Browser halves call these with **relative** URLs (`/api/v1/huaqiu/artifacts/…`) — same origin, no
CORS, no port discovery (`dsh-auth/src/client/transport.ts:19-52`).

---

## 7. Standalone Compatibility — task §8

**Finding: no existing plugin distinguishes "DSH-hosted" from "standalone" for its *own* surface —
except `@huaqiu/dsh-auth`, which does exactly this and is the pattern to reuse.**

Mechanism (`dsh-auth/src/client/index.tsx:89-111`): the browser half asks the node half
`GET /api/v1/huaqiu/auth/config`, and only registers the login UI when `hostMode === false`. The
fallback on transport failure is deliberately "assume standalone" — showing a login UI is never a
security regression, but hiding one would lock the user out
(`dsh-auth/src/client/transport.ts:44-56`).

**On the proposed client factory:**

```ts
createClient({ baseUrl, authProvider })
```

This **aligns with existing conventions** but should be realised as an *auth-provider seam over
`huaqiuAuth`*, not as a second credential system. The single existing seam is
`HuaqiuAuthApi` (`dsh-auth/src/service.ts:39-70`): `isAuthenticated()`, `getAccessToken()`,
`getUserInfo()`, `validate()`, `invalidate()`, `onAuthStateChanged()`. Today both "providers" are the
same service with different resolution sources, so the honest shape is:

```text
   ┌─────────────────────────────────────────────┐
   │ generateSymbol(client, input)               │  ← generator-specific
   └───────────────────┬─────────────────────────┘
                       │ needs { userId, token }
                       ▼
             huaqiuAuth.auth.getUserInfo()
                       │
        ┌──────────────┴───────────────┐
        │ host mode                    │ pushed / persisted
        │ (hq-edge token)              │ (auth.eda.cn login)
        └──────────────────────────────┘
```

Do **not** add a literal API-key auth provider to the DSH path. The generators' *server* API already
accepts `x-user-id`/`x-user-token`; a standalone non-DSH client (CLI, CI, another app) keeps using
whatever it uses today, unchanged, because the DSH work is purely client-side.

**Regression risk to watch:** the tool `description` strings currently embed the
`needs_auth` login choreography (`dsh-tool-symbol-footprint/src/tools.ts:480-491`). Adding a
workspace does not change the tool contract, but the description should be revisited so it points at
the workspace rather than only at the sidebar button.

---

## 8. Artifact / Workspace Handoff — task §9

### 8.1 What exists today

**Artifacts.** DSH core has **no artifact concept** (no `artifact` identifier anywhere in
`packages/*/src`). The Huaqiu plugins ship their own: `@huaqiu/dsh-artifacts`
(`dsh-pcb-eda/packages/dsh-artifacts/src/service.ts:27-72`):

```ts
export type ArtifactType = 'symbol' | 'footprint' | 'schematic' | 'pcb' | 'zip'
export interface ArtifactMeta { id; type; filename; mimeType; size; createdAt; expiresAt? }
export interface HuaqiuArtifacts {
  create(input: CreateArtifactInput): Promise<CreateArtifactResult>
  get(id): Promise<ArtifactMeta | null>
  readContent(id): Promise<Uint8Array | null>
  delete(id): Promise<void>
  deleteAll(opts?: { onlyExpired?: boolean }): Promise<number>
}
```

Storage: `~/.dsh/artifacts/dsh-artifacts/<art_xxxxxxxx>/{meta.json, content}`; ids are minted
(`art_` + 16 hex) and path-hardened (`src/service.ts:85, 139-142`). Served to the browser over the
prefix route in §6. Tools return the artifact inline in their result
(`generate_symbol_from_image` → `artifact: {id, type, filename, size}`), and the HIT card renders
straight from it (`dsh-tool-symbol-footprint/src/client/hit-card.tsx:649-681`).

**Workspace navigation.** None. There is no client-side router; no `history.pushState`, no
`location.hash` usage, no route params anywhere in `packages/client/*/src`.

**Cross-view handoff that does exist** — `ui-conversation`'s one-shot `inspect` channel:

- `ChatStoreState.inspect: { callId: CallId } | null` (`src/client/contract/views.ts:30-35`)
- `ConvViewOwnerProps.inspect` / `onInspectDone` (`src/client/contract/slots.ts:345-350`)
- The chat view's `inspectCall` writes it and hard-switches the tab
  (`src/client/apply.ts:408-411`): `actions.setInspect({ callId }); actions.setView('trajectory')`

**Why that does not generalise:** `setView()` has exactly two call sites, both inside
`ui-conversation` (`src/client/apply.ts:410`, `src/client/skeleton/ConversationSession.tsx:154`), and
the chat store handle is **not** exported from `@deepseek-ai/dsh-client-ui-conversation/client`
(`src/client/index.ts` exports only `apply`, `inject`, `ConversationController`, and types). A plugin
therefore **cannot programmatically switch the active view tab.**

**Inter-plugin communication.** The sanctioned mechanism is `ctx.provide(name, impl)` +
`ctx.get(name)` against a structurally-declared interface — used by `huaqiuAuth`,
`huaqiuArtifacts`, `chatFileMentions` (`ui-conversation/src/client/contract/slots.ts:369-374`), and
`ctx.layout`. Cordis events (`ctx.emit` / `ctx.on`, e.g. `slots/changed`, `tools/change`) also exist
but are not the right tool for UI state.

### 8.2 Recommended handoff

```text
agent calls generate_schematic_from_description
        ↓
node tool → existing server API → huaqiuArtifacts.create()
        ↓
tool result JSON: { status:'generated', artifact:{id,type,filename,size}, … }
        ↓
tool.call.toolview card renders the preview (already works)
        ↓
card's "Open in Schematic Generator" button
        ↓
  ┌───────────────────────────────────────────────────┐
  │ huaqiuWorkspace.open({ view: 'huaqiu-schematic',  │
  │                        artifactId })              │  ← plugin-provided CLIENT service
  └───────────────────────────────────────────────────┘
        ↓
  generator view (conversation.view tab) reads the pending
  request from the same service on mount / on change
        ↓
  …and the user clicks the tab (the only sanctioned switch)
```

Two honest options for the last mile, because DSH gives no programmatic switch:

| Option | Mechanism | Trade-off |
|---|---|---|
| **A (recommended)** | `conversation.view` tab + plugin client service carrying the pending artifact. The card writes the id; the tab is the navigation target. If the tab is already active the artifact opens immediately. | Small extra click when the user is on Chat. Zero new primitives. |
| **B** | Also register a `shell.overlay` entry that the same service can open/close programmatically, giving a true "open in generator" full-screen surface. | More code; the surface is root-scoped (not per-session), so it must carry its own session/artifact context. |

Recommend starting with **A** and adding **B** only if the extra click proves unacceptable in review.

### 8.3 Artifact lifecycle gap

`deleteAll({ onlyExpired: true })` exists on both the DSH plugin and its hq-edge original but **nobody
calls it** — `dsh-artifacts/src/index.ts` registers the service and route only. With three workspaces
creating artifacts this becomes unbounded growth. A boot-time sweep in `apply()` is the smallest fix
and should be folded into the workspace work.

---

## 9. Proposed Three-Generator Architecture — task §10 / §12

### 9.1 Package layout

Extend `dsh-pcb-eda/packages/` with **three** new packages plus **one** shared library. Do not
collapse the three generators into one package: they are independently publishable, independently
versioned, and independently installable today, and `dsh-tool-symbol-footprint` vs
`dsh-tool-schematic-gen` already prove the split works.

```text
dsh-pcb-eda/packages/
├── dsh-auth/                        (unchanged — credential owner)
├── dsh-artifacts/                   (unchanged + boot-time sweep)
├── dsh-tool-symbol-footprint/       (existing tools; + browser workspace)
├── dsh-tool-schematic-gen/          (existing tools; + browser workspace)
├── dsh-tool-part-search/            (unchanged)
│
├── dsh-generator-runtime/           NEW — shared, browser-only, no tools
│   └── src/
│       ├── index.ts                 apply(): nothing; pure library
│       ├── register-workspace.ts    registerGeneratorWorkspace(ctx, spec) helper
│       ├── service.ts               provide('huaqiuWorkspace') — handoff + nav state
│       ├── artifact-client.ts       fetch /api/v1/huaqiu/artifacts/…
│       ├── auth.ts                  useHuaqiuAuth() structural hook
│       ├── i18n.ts                  ZH/EN pack (ZH as const; EN: Record<CopyKey,string>)
│       └── theme.ts                 CSS variable bridge (copy from hit-card's theme.ts)
│
├── dsh-workspace-symbol/            NEW
├── dsh-workspace-footprint/         NEW
└── dsh-workspace-schematic/         NEW
```

> **Alternative considered and rejected:** putting the workspace into the existing
> `dsh-tool-*` packages. Rejected because it would force a *tool* package to depend on the full
> browser workspace stack, and because `dsh-tool-part-search` proves tools-only packages are a
> legitimate shape. Keeping workspaces separate also lets a user install the tools without the UI.

### 9.2 Each generator workspace package

```text
dsh-workspace-symbol/
├── package.json
│     "main": "./lib/index.mjs"                 # node half — thin: registers nothing,
│                                               #            or a /api/v1/huaqiu/symbol proxy route
│     "exports": { ".": …, "./client": "./lib/client.js",
│                  "./cordis.patch.yml": … , "./package.json": … }
│     "dsh": {
│       "bundle": { "patch": "./cordis.patch.yml" },
│       "client": { "platform": "web",
│                   "inject": ["@deepseek-ai/dsh-client-runtime",
│                              "@deepseek-ai/dsh-client-locale",
│                              "@deepseek-ai/dsh-client-ui-conversation",
│                              "@huaqiu/dsh-generator-runtime"] }
│     }
├── cordis.patch.yml
│     - insert:
│         - id: huaqiu-workspace-symbol
│           name: '@huaqiu/dsh-workspace-symbol'
├── src/
│   ├── index.ts          export const inject = ['webServer']   # project-scoped proxy route only
│   ├── routes.ts         proxy: browser → generator API (same-origin, node adds auth headers)
│   └── client/
│       ├── index.ts      export const inject = ['slots','sessions','locale','huaqiuAuth','huaqiuWorkspace']
│       │                 apply(ctx) → registerGeneratorWorkspace(ctx, { id:'huaqiu-symbol', order:20, … })
│       ├── view.tsx      the workspace component
│       ├── store.ts      defineStore({ init, persist:'dsh.huaqiu.symbol', actions })
│       └── i18n.ts       generator-specific copy
└── test/
```

**Crucially: the workspace does NOT call the generator API directly from the browser.** The credential
lives in the node half, so the browser calls a plugin-owned `webServer` prefix route and the node half
attaches `x-user-id` / `x-user-token`. This is the same shape as
`dsh-auth`'s credential route and `dsh-artifacts`' content route, and it keeps the token out of the
browser entirely — which is strictly better than today's `dsh-auth` client-half token cache.

### 9.3 Registration sketch

```ts
// packages/dsh-workspace-symbol/src/client/index.ts
export const inject = ['slots', 'sessions', 'locale', 'huaqiuAuth', 'huaqiuWorkspace']

export function apply(ctx: ClientContext): () => void {
  const disposers: Array<() => void> = []
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'huaqiu-symbol: dictionaries')
  const t = ctx.locale.bind(NS)

  disposers.push(ctx.slots.inject('conversation.view', () => ctx.slots.register({
    name: 'conversation.view',
    id: 'huaqiu-symbol',
    order: 20,
    locale: NS,
    label: () => t('view.symbol'),
    store: createSymbolWorkspaceStore,
    inject: (sessionId: SessionId) => ({
      auth: ctx.get('huaqiuAuth')?.auth,
      workspace: ctx.get('huaqiuWorkspace'),
      sessionId,
    }),
  }, SymbolWorkspaceView) as () => void))

  injectStyles()
  return () => { for (const d of disposers) { try { d() } catch {} } ; removeStyles() }
}
```

### 9.4 SHARED vs GENERATOR-SPECIFIC

**SHARED (one implementation, reused by all three)**

```text
registerGeneratorWorkspace() helper      — slots.inject('conversation.view', …) boilerplate
huaqiuWorkspace client service           — pending-artifact handoff + nav intent
useHuaqiuAuth() structural hook          — the dsh-tool-schematic-gen hook, promoted
artifact HTTP client                     — GET /api/v1/huaqiu/artifacts/<id>[/content]
i18n pack skeleton + ZH/EN parity tests  — copy dsh-tool-schematic-gen conventions
theme bridge (CSS vars, dark/light)      — copy src/client/theme.ts
localized tab label convention           — label: () => t('view.<generator>')
order band                               — 20 / 21 / 22 (after chat=0, trajectory=10)
node proxy-route helper                  — prefix route + auth headers + JSON errors
boot-time artifact sweep                 — deleteAll({ onlyExpired: true })
```

**GENERATOR-SPECIFIC**

```text
workspace UI                    form/editor, preview, history, validation
tool schemas                    parameters + output + descriptions (LLM contracts — do not i18n)
API endpoints                   symbol / footprint / schematic paths
artifact type                   'symbol' | 'footprint' | 'schematic'
generation workflow             one-shot vs needs_confirmation vs multi-step (see below)
validation rules                dimension confirmation, ERC, pin checks
preview renderer                ecad-renderer configuration per artifact type
i18n copy                       per-generator strings
```

**The one genuinely different workflow:** `generate_footprint_from_image` returns
`status: 'needs_confirmation'` and the card becomes a dimension editor; the agent then calls
`generate_footprint_from_dimensions` with human-confirmed values
(`dsh-tool-symbol-footprint/src/tools.ts:523-560`). A Footprint **workspace** can absorb that
round-trip natively (extract → edit → generate in one surface), but the two tools must remain for the
agent path. Keep the tools; make the workspace the human path.

### 9.5 Target diagram

```text
                        DSH Web (ui-layout frame)
                                  │
        ┌─────────────────────────┼─────────────────────────┐
        │                         │                         │
  [ Chat tab ]        [ Symbol ] [ Footprint ] [ Schematic ]     ← conversation.view entries
        │                    │         │            │
        │                    └─────────┼────────────┘
        │                              │
  tool.call.toolview        @huaqiu/dsh-generator-runtime
  (existing HIT cards)      (shared slots/auth/artifact client)
        │                              │
        └──────────┬───────────────────┘
                   ▼
        node half: /api/v1/huaqiu/<generator>  (adds x-user-id / x-user-token)
                   ▼
        huaqiuAuth ──► host (hq-edge) | pushed (auth.eda.cn) | persisted file
                   ▼
        ┌──────────────────────────────────────────┐
        │  Existing Generator Server APIs          │
        │  https://gen.eda.cn/api/…                │  ← unchanged; standalone clients unaffected
        └──────────────────────────────────────────┘
                   ▼
        huaqiuArtifacts  →  GET /api/v1/huaqiu/artifacts/<id>/content
```

---

## 10. Open Questions / Risks

Only items genuinely unresolved after source inspection.

1. **No programmatic view switching.** `setView()` is private to `ui-conversation`; the chat store
   handle is not exported. Either accept a user click to change tabs (option A, §8.2), add a
   `shell.overlay` surface (option B), or request an upstream API. **Needs a product decision.**
2. **`conversation.view` is session-scoped.** A generator tab exists only while a session is current;
   there is no app-level generator entry point. `sidebar.footer.action` entries are root-scoped but
   receive no session context and cannot open a view. If "open a generator with no session" is a
   requirement, it is **not** achievable with existing primitives.
3. **Overlay `config` does not reach the browser half.** The web boot graph has no per-entry config
   channel; `dsh-client-modules` composes client entries from `package.json` `dsh.client` only
   (`packages/client/modules/src/index.ts:125-142`). Any host-supplied value must be relayed through a
   node `webServer` route — the `dsh-auth` `fetchHostMode()` precedent.
4. **Route-prefix collisions.** `WebRoute` supports only `exact` and `prefix`, and duplicates throw
   (`packages/host/webserver/src/index.ts:108-115`). Three new generator plugins must each claim a
   distinct prefix (`/api/v1/huaqiu/symbol`, `/footprint`, `/schematic`) — do not share one.
5. **Artifact growth.** `deleteAll({ onlyExpired: true })` is uncalled in `dsh-artifacts`. Should be
   fixed before three workspaces start minting artifacts.
6. **Tool `description` churn.** The `AUTH_GATE_NOTE` blocks instruct the agent to direct users to the
   *sidebar* login button. Once a workspace exists, those descriptions should point at the workspace.
   Descriptions are LLM prompt contracts — changing them needs care and a standalone regression pass.
7. **`dsh-plugin` is unpinned.** It is not a git repo and its sub-repositories are independent third
   party clones. Its plugins are useful *evidence* of what is possible but none should be treated as a
   dependency or a spec source.
8. **`open-app` claims a sidebar "APPS section"**, but the only additive sidebar seat is
   `sidebar.footer.action`. Its README describes a richer UX than the slot list supports; treat the
   slot inventory in §3.1 as authoritative over its marketing copy.

---

## 11. Implementation Plan

Phased for a **future** implementation task. Nothing here has been started.

### Phase 0 — Shared runtime library (`@huaqiu/dsh-generator-runtime`)

- Extract `useHuaqiuAuth` from `dsh-tool-schematic-gen/src/client/index.ts:85-111` into the shared
  package; keep the structural interface.
- Add `registerGeneratorWorkspace(ctx, spec)` wrapping `slots.inject('conversation.view', …)`.
- Add the artifact HTTP client over `/api/v1/huaqiu/artifacts`.
- Add the i18n skeleton with ZH/EN parity tests (copy the conventions in
  `dsh-tool-schematic-gen/src/client/i18n.ts`).
- Add the node-side proxy-route helper (prefix route + `huaqiuAuth` headers + JSON errors).
- **Exit:** a package that builds, typechecks, and is publishable with nothing registered.

### Phase 1 — Symbol Generator workspace

- Create `dsh-workspace-symbol` with the §9.2 layout; register `conversation.view`
  `id: 'huaqiu-symbol', order: 20`.
- Node half: `/api/v1/huaqiu/symbol` proxy → existing symbol API.
- Workspace UI: image/description input → generate → artifact list → preview → download.
- **Exit:** the Symbol tab appears next to Chat and Trajectory; generating from the tab produces an
  artifact visible in the same tab.

### Phase 2 — Footprint Generator workspace

- Same shape, `order: 21`, prefix `/api/v1/huaqiu/footprint`.
- Absorb the `needs_confirmation` dimension round-trip natively (extract → edit → generate).
- **Exit:** the Footprint tab supports confirm-then-generate without leaving the tab.

### Phase 3 — Schematic Generator workspace

- Same shape, `order: 22`, prefix `/api/v1/huaqiu/schematic`.
- Reuse the existing progress/SSE plumbing (`dsh-tool-schematic-gen/src/routes.ts`,
  `src/progress.ts`) — this is the one generator with long-running multi-stage output.
- **Exit:** the Schematic tab streams progress and renders the resulting project.

### Phase 4 — Tool registration alignment

- No new tools: the five existing tools stay as the agent surface.
- Update the `AUTH_GATE_NOTE` / "do not paste source" description blocks to point at the workspaces
  (careful: LLM prompt contracts; keep the `needs_auth` choreography for standalone).
- Ensure every tool result carries `artifact: {id, type, filename, size}` — symbol and footprint
  already do; verify schematic's zip path.

### Phase 5 — Agent → workspace handoff

- Implement the `huaqiuWorkspace` client service (pending-artifact + nav intent).
- Add "Open in <Generator>" to each HIT card, writing to that service.
- Each workspace reads the pending request on mount and on change.
- Decide option A vs option B (§8.2) — **this decision gates the phase.**

### Phase 6 — Standalone regression verification

- Install the plugin set into a stock DSH profile **without** the HQ Edge overlay; confirm
  `hostMode === false`, the login entrypoint appears, and the tools return `needs_auth` until login.
- Install **with** the HQ Edge overlay; confirm `hostMode === true`, no login entrypoint, and tools
  authenticate from the host token.
- Confirm a standalone (non-DSH) client of the generator server APIs is unaffected — nothing in this
  plan touches the server APIs.

### Phase 7 — Lifecycle hygiene

- Boot-time `deleteAll({ onlyExpired: true })` sweep in `dsh-artifacts`.
- Re-check the i18n parity tests, the `agentNote`/`note` channel separation
  (`dsh-tool-symbol-footprint/src/tools.ts`), and the React 18 pin
  (`react-dom ^18.3.1` everywhere except `dsh-auth`).

---

## 12. Acceptance Criteria — task §15

| Criterion | Status | Evidence |
|---|---|---|
| Existing DSH plugin architecture inspected from source | ✓ | §1, §3 |
| At least one relevant plugin analysed in detail | ✓ | §2 (`ui-trajectory`, `dsh-tool-schematic-gen`, `dsh-auth`) |
| Sidebar/toolbar integration mechanism identified | ✓ | §3.1 — only `sidebar.footer.action` is additive |
| Workspace/route mechanism identified | ✓ | §3.2 — `conversation.view` tab ring; **no client router** |
| Tool registration mechanism identified | ✓ | §4 — `ctx.tools.register(defineTool({…}))` |
| Authentication mechanism identified | ✓ | §5 — `huaqiuAuth`, host/pushed/persisted resolution |
| Backend endpoint discovery identified | ✓ | §6 — `resolveConfig()`; no `HQ_EDGE_PORT` |
| Standalone/API-key compatibility addressed | ✓ | §7 — `hostMode` probe; API-key flow lives outside DSH |
| Agent → workspace handoff investigated | ✓ | §8 — no public switch API; plugin service + tab |
| Common architecture for all three evaluated | ✓ | §9 — shared runtime + three thin workspaces |
| No production code modified | ✓ | research only |
| Every recommendation backed by file references | ✓ | throughout |
| Minimal implementation plan provided | ✓ | §11 |

## 13. Final Conclusion

> **The smallest, most idiomatic integration is: three new browser-half plugins that each register one
> `conversation.view` entry** — DSH's existing workspace primitive, the same mechanism that ships the
> Trajectory tab — **reusing the existing tool plugins unchanged as the agent surface, reusing
> `huaqiuAuth` unchanged for authentication, fronting the existing remote generator APIs through a
> plugin-owned same-origin `webServer` route so the credential never reaches the browser, and handing
> results between agent and workspace through a plugin-provided client service keyed on the
> `artifactId` the tools already return.**
>
> No new primitive, no new auth system, no new API gateway, no new event bus, no new workspace
> abstraction, and no change to the generator server APIs — so standalone API-key usage is untouched.
> The single architectural compromise is that DSH exposes no public API to switch view tabs
> programmatically (§8.1), so "Open in Schematic Generator" is a one-click gesture rather than an
> automatic jump unless a `shell.overlay` surface is added on top.
