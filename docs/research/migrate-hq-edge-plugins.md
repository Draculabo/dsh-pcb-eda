# Migrating hq-edge Plugins → Standalone React+TS DSH Plugins

Implementation plan for migrating the HQ Edge bundled plugins to **official DSH** as
self-contained, published, **React + TypeScript** plugins following community
best practices. Companion to `docs/research/dsh-pcb-eda.md` (architecture/auth research).
Source inputs:

- `/Users/admin/code/hq-edge/apps/server/dsh-plugins/{part-search,symbol-footprint,schematic-gen}`
- `/Users/admin/code/hq-edge/apps/server/src/artifacts/dsh-preview-artifacts.service.ts` + `routes/dsh-artifacts.ts` (preview artifact store — **already fs+json, no SQLite**)
- `/Users/admin/code/hq-edge/apps/server/dsh-plugins/edge-bridge/lib/index.js` (webServer-mount precedent)
- `/Users/admin/code/hq-edge/packages/part-search` (`@huaqiu/part-search` — **published to npm**)
- `/Users/admin/code/deepseek-harness` (`packages/host/webserver` — `ctx.webServer` route registry; `packages/util/home-paths` — `dshHomePath`; DSH runtime conventions)
- `/Users/admin/code/dsh-plugin` (community plugin conventions)

---

## 1. Scope & Goals

**In scope** — migrate & publish as standalone DSH plugins:

| Plugin | Tools | Node half | Browser half |
|---|---|---|---|
| **part-search** | `search_hqsch_parts`, `get_hqsch_part`, `get_hqsch_part_models`, `get_hqsch_supply_chain` | yes | none |
| **symbol-footprint** | `generate_symbol_from_image`, `generate_footprint_from_image`, `generate_footprint_from_dimensions` | yes | generation HIT + dimension editor |
| **schematic-gen** | `generate_schematic_from_description`, `generate_system_module_graph` | yes | generation HIT + project preview |

**Out of scope** — `erc` (stays in hq-edge for now).

**Constraints**
1. **Self-contained**: installable on a clean DSH (`dsh plugin --profile web add <pkg>`), zero `@hqedge/*` / HQ Edge runtime dependency.
2. **React + TypeScript**: rewrite the plain-JS node + browser halves following community DSH plugin best practices (the HQ-Edge-only "zero-import classic-script" constraints do NOT apply on official DSH).
3. **Auth** comes from the shared `@huaqiu/dsh-auth` plugin (recommended in `dsh-pcb-eda.md` §10) — never from HQ Edge.
4. **ERC** explicitly not planned this phase.

---

## 2. Current-State Inventory (verified in hq-edge source)

### 2.1 part-search — `@hqedge/dsh-tool-part-search`

- Node-only; `inject = ['hqEdge', 'tools']`; 4 tools; no client half.
- Each tool calls `hqEdge.api.request({ method:'POST', path: partSearchPath(op) })` → HQ Edge `/api/hqsch/parts/{search,detail,models,supply-chain}` (an express facade over `@huaqiu/part-search`).
- `partSearchPath()` is the only path contract; agent-facing snake_case args are translated to the service's camelCase body (`pageSize`, `requireEdaModel`, `manufacturerId`…).
- **Upstream is `@huaqiu/part-search` (published npm)** — `packages/part-search/src/client.ts`:
  - Base `https://kiapi.eda.cn`, headers `Referer: https://www.eda.cn/`, `x-language`, **public, unauthenticated**, `code === 200000`.
  - `search: /api/chiplet/products/kicad/queryPage`, `detail: /api/chiplet/kicad/productDetail`, `supplyChain: /api/chiplet/kicad/searchSupplyChain`; `getEdaModels` = `productDetail` + normalize `cadUrlList`/`simUrlList`.
- Tests (`lib/index.test.ts`) assert: tool shape, path/body translation, and **no direct upstream URL in plugin code** (that constraint disappears once we depend on `@huaqiu/part-search` directly).

### 2.2 symbol-footprint — `@hqedge/dsh-tool-symbol-footprint`

- Node `index.js` (~1450 lines, plain JS): `inject = ['hqEdge','tools']`; speaks **componentV2 WebSocket** `wss://www.eda.cn/componentV2/chat/<channel>?token=<token>` (host whitelist `www.eda.cn` / `www.fdatasheets.com`; endpoint override `HQ_EDA_COMPONENT_WS_URL`).
  - Commands: `agent.image.parse_symbol`, `agent.footprint.dimensions.generate`, `agent.footprint.generate`.
  - Frames: streaming(1) / streaming_end(2) / agent(6) / token_expired(12); actions awaited: `symbol_button`, `footprint_button`, `footprint_dimensions`, `pkgTypeNotFound`.
  - HIL: `ctx.get('userQuestions').ask(...)` (opportunistic, not injected) for dimension confirm/edit/cancel and direct-footprint accept/decline; free-text `custom` carries `key=value` corrections validated by `parseDimensionOverrides`.
  - Token: `hqEdge.auth.getAccessToken()` (only WS auth). Images: `resolveImageDataUrl` (data:/http(s)/local path → `data:<mime>;base64`, 4 MiB cap). Artifacts: `fetchArtifactText` (512 KiB cap) → `createPreviewArtifact` POST `/api/v1/dsh/artifacts`.
  - Tools: `generate_symbol_from_image`, `generate_footprint_from_image` (3-phase with HIL), `generate_footprint_from_dimensions`.
- Client `client.js` (~1885 lines, **classic-script `window.__ModuleLoader__.load`**): keyed `tool.call.toolview` for the 3 tool names; `projectToolCall()` state machine; **interactive dimension editor** (SVG package silhouette + draggable handles + numeric inputs, `pickGeometry`, `bgaGrid`, `packageSilhouette`, `classifyDimensions`, `validateDimensions`…); ECAD preview via `@huaqiu/ecad-renderer`; artifact resolve via `hqEdge.api.request` GET `/api/v1/dsh/artifacts/<id>` + `/content`; regenerate + human-answer via `ctx.get('sessions')` conversation send; locale zh/en.
  - `exports.inject = ['slots','locale','sessions','hqEdge']`.

### 2.3 schematic-gen — `@hqedge/dsh-tool-schematic-gen`

- Node `index.js` (~700 lines, plain JS): `inject = ['hqEdge','tools']`; speaks **CopilotKit SSE** `https://gen.eda.cn/api/copilotkit` (agents `schemagen`, `modular_circuit`) + `https://gen.eda.cn/api/modular_circuit/export-zip` (POST moduleGraph → zip binary).
  - Auth: `x-user-id` / `x-user-token` headers + `state.user_id` / `state.token` — **a different credential than the componentV2 WS token**, currently a **baked-in demo account** (`DEFAULT_USER_ID='6215935'`, `DEFAULT_USER_TOKEN='4785376f-…'`), overridable by `HQ_EDA_USER_ID`/`HQ_EDA_USER_TOKEN`.
  - `hqEdge` is used **only** for storing the project zip as a `zip` artifact (`createPreviewArtifact`) so the client can preview + download it; fallbacks inline the zip as a `data:` URL (≤1 MiB) or write a temp path.
  - Tools: `generate_schematic_from_description`, `generate_system_module_graph`.
- Client `client.js` (~1354 lines, classic-script): keyed `tool.call.toolview` for the 2 tool names; `projectToolCall()`; summary card (design name / sheet count / module & connection counts); **multi-sheet tab bar**; ECAD preview via `@huaqiu/ecad-renderer` `renderProjectFromZip(zipUrl)` (zip → root schematic); download zip from artifact content URL (or inline data-URL fallback) / sheet `.kicad_sch`; regenerate via `sessions`.

### 2.4 What `hqEdge` actually provides (the dependency to replace)

Verified from `edge-bridge/lib/index.js` (`createNodeHqEdge`) + `client.js`:

| Service face | Used by plugins for |
|---|---|
| `auth.getAccessToken()` | symbol-footprint WS `?token=` |
| `api.request({method,path,body})` | part-search (proxy), artifact store CRUD (`/api/v1/dsh/artifacts*`) |
| `project.getCurrent()` | only `resolveSessionId` for artifact tagging (best-effort, non-critical) |
| `workspace` | unused by these three |

`slots`, `locale`, `sessions`, `tools`, `userQuestions` are all **official DSH services** and remain available.

---

## 3. Target Architecture (React + TS, community conventions)

Four published packages in one pnpm workspace under `/Users/admin/code/dsh-pcb-eda`:

```text
dsh-pcb-eda/
├── package.json / pnpm-workspace.yaml / tsconfig.base.json / vitest.config.ts
└── packages/
    ├── dsh-auth/                 # @huaqiu/dsh-auth            — shared auth plugin (dual-face)
    ├── dsh-artifacts/            # @huaqiu/dsh-artifacts       — local ECAD artifact store (node-only + webServer routes)
    ├── dsh-tool-part-search/     # @huaqiu/dsh-tool-part-search     — node-only
    ├── dsh-tool-symbol-footprint/# @huaqiu/dsh-tool-symbol-footprint — dual-face
    └── dsh-tool-schematic-gen/   # @huaqiu/dsh-tool-schematic-gen   — dual-face
```

Each tool package declares (verified manifest shape from `dsh-plugin/dsh-pcb-parts-search`, `dsh-visualize`, `dsh-auth-gate`, and the in-box `ui-tool`):

```jsonc
{
  "name": "@huaqiu/dsh-tool-symbol-footprint",
  "type": "module",
  "main": "lib/index.js",
  "exports": {
    ".": { "types": "./lib/types/index.d.ts", "default": "./lib/index.js" },
    "./client": { "types": "./lib/types/client.d.ts", "default": "./lib/client.js" },
    "./cordis.patch.yml": "./cordis.patch.yml",
    "./package.json": "./package.json"
  },
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": {
      "platform": "web",
      "inject": [
        "@deepseek-ai/dsh-client-runtime",   // provides `slots` + `sessions` services (src/client/slots.ts, sessions/service.ts)
        "@deepseek-ai/dsh-client-ui-slots",  // the slot registry (register/inject) the keyed toolview needs
        "@deepseek-ai/dsh-client-locale",    // `locale` service for zh/en packs
        "@huaqiu/dsh-auth"                   // client half of the auth plugin (login button on token-expired)
      ]
    }
  },
  "peerDependencies": {
    "@deepseek-ai/cordis": "^4.0.1",
    "@deepseek-ai/dsh-tools": ">=0.1.0-rc.8 <0.2.0",
    "@deepseek-ai/dsh-client-runtime": "*",
    "@deepseek-ai/dsh-client-ui-slots": "*",
    "@deepseek-ai/dsh-client-locale": "*",
    "@huaqiu/dsh-auth": "^1.0.0",
    "@huaqiu/dsh-artifacts": "^1.0.0",
    "react": "^18"
  },
  "dependencies": { "@huaqiu/part-search": "^1.0.0" },   // plain lib (part-search only)
  "devDependencies": { "@huaqiu/ecad-renderer": "^0.2.4" }, // BUNDLED into lib/client.js (see below)
  "files": ["lib", "src", "cordis.patch.yml"],
  "publishConfig": { "access": "public" }
}
```

**ECAD renderer packaging (corrected)** — `@huaqiu/ecad-renderer` is a plain ESM lib (no `dsh.client`), so it is **bundled into the plugin's `lib/client.js`** by tsdown/esbuild, externalizing only `react` + `@deepseek-ai/*` + `@huaqiu/dsh-*`. It becomes a `devDependency` (build input), not a runtime peer. This keeps the plugin self-contained and offline (no CDN dependency). If bundle size/duplication across the two rendering tool plugins becomes a concern, a future shared client row (`@huaqiu/dsh-ecad-viewer` with `dsh.client` + consumed via `dsh.client.external`) avoids the copy — the module system supports `dsh.client.external: string[]` for cross-client-plugin code edges, but that requires the renderer to ship a `/plugins/<id>/client.js` bundle, which it does not today.

Per-package `cordis.patch.yml`:

```yaml
- insert:
    - id: huaqiu-tool-symbol-footprint
      name: '@huaqiu/dsh-tool-symbol-footprint'
```

**Key convention change from hq-edge**: on official DSH the "zero-import / classic-script client" constraint is **gone**. Use the real DSH APIs:
- Node: `export const name`, `export const inject = ['huaqiuAuth', 'huaqiuArtifacts', 'tools']`, `export function apply(ctx, config)`, tools via `ctx.tools.register(defineTool({...}))` (`@deepseek-ai/dsh-tools`).
- Client: `exports.inject = ['@deepseek-ai/dsh-client-runtime', '@deepseek-ai/dsh-client-ui-slots', '@deepseek-ai/dsh-client-locale', '@huaqiu/dsh-auth']`, `exports.apply = (ctx) => ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({ name:'tool.call.toolview', key, locale }, Component))` (the `packages/client/ui-tool` pattern).
- Build: `tsdown` (→ `lib/index.js` + `lib/client.js`) + `tsc -p tsconfig.build.json` (→ types); `vitest` node + jsdom client tests; `prepack: build`.

---

## 4. Dependency Replacement Map

| HQ Edge dependency | Standalone replacement |
|---|---|
| `hqEdge.auth.getAccessToken()` (WS) | `huaqiuAuth.auth.getAccessToken()` from `@huaqiu/dsh-auth` (same value: the eda.cn session token) |
| `hqEdge.auth.getAccessToken()` + user id (gen.eda.cn headers) | `huaqiuAuth.auth.getUserInfo()` → `{ id, token }` (schematic-gen `x-user-id`/`x-user-token` + `state.user_id`/`state.token`) — **or** env `HQ_EDA_USER_ID`/`HQ_EDA_USER_TOKEN` override |
| `hqEdge.api.request` part-search proxy | direct `@huaqiu/part-search` (published, public, no auth) — a plain **`dependencies`** lib |
| `hqEdge.api.request` artifact store (`/api/v1/dsh/artifacts*`) | **Port as a local plugin `@huaqiu/dsh-artifacts`** — in-process service for node tools + same-origin `webServer` GET routes for the browser (see §5). Already filesystem+JSON, **no SQLite** |
| `hqEdge.project.getCurrent()` (session tagging) | drop — non-critical, never used for gating |
| `@huaqiu/ecad-renderer` (HQ-Edge-served runtime + CDN fallback) | **bundle into `lib/client.js`** (tsdown external only `react`/`@deepseek-ai/*`/`@huaqiu/dsh-*`); `devDependency`, not a runtime peer (see §3) |
| `slots`, `locale`, `sessions`, `tools`, `userQuestions` | unchanged — official DSH services: `slots`+`sessions` from `@deepseek-ai/dsh-client-runtime`, `locale` from `@deepseek-ai/dsh-client-locale`, `tools`/`userQuestions` node-side |

---

## 5. Artifact / Preview / Download Design — local `@huaqiu/dsh-artifacts` plugin

**Answer to "can we port the artifacts service to a DSH plugin and host locally?": YES — and it is the recommended design.** Two verified facts make it a near drop-in:

1. **The preview artifact store is already filesystem+JSON, not SQLite.** `hq-edge/apps/server/src/artifacts/dsh-preview-artifacts.service.ts` stores one dir per artifact:
   ```
   <baseDir>/dsh-artifacts/<id>/   id = 'art_' + 16 hex (uuid-derived), opaque
     meta.json   # { id, type, filename, mimeType, size, createdAt, expiresAt?, sessionId? }
     content     # raw bytes (string → UTF-8; Buffer/Uint8Array as-is)
   ```
   atomic writes (tmp+rename), TTL expiry, `create/get/readContent/openStream/delete/deleteAll`. **No SQLite anywhere.** (The SQLite+Kysely `@hqedge/artifacts` package is the separate **BOM/ERC** project-artifact runtime — used by the ERC plugin, out of scope this phase.)

2. **DSH plugins can mount HTTP routes on DSH's own web server** via the official `@deepseek-ai/dsh-host-webserver` service (`ctx.webServer`, always in the web-app bundle):
   ```ts
   ctx.webServer.register({ kind: 'exact' | 'prefix', path, handler }) // → disposer
   ctx.webServer.registerUpgrade({ path, handler })                    // → WebSocket routes
   ```
   duplicate `(kind, path)` throws; match order exact → longest prefix → fallback. **Precedent**: hq-edge's own `edge-bridge/lib/index.js` node half already mounts the `/hq-edge` prefix route on DSH's `webServer` ("webServer is DSH's node:http route registry (packages/host/webserver)") — the exact mechanism we reuse.

### 5.1 `@huaqiu/dsh-artifacts` plugin design (node-only + webServer routes)

```
src/
  index.ts              # name, inject ['webServer']; apply(ctx, config):
                        #   provide 'huaqiuArtifacts' service + register webServer routes
  service.ts            # port of DshPreviewArtifactService verbatim (fs + meta.json)
  routes.ts             # GET /:id (meta) + GET /:id/content (stream) handlers
  storage.ts            # default baseDir = dshHomePath('artifacts') → ~/.dsh/artifacts/
                        #   (@deepseek-ai/dsh-home-paths resolveDshHome/dshHomePath), config-overridable
```

- **Node tools use the service in-process** (`ctx.get('huaqiuArtifacts').create({ type, filename, content })`) — no HTTP loopback needed (both are node-half plugins in the same process). This replaces `hqEdge.api.request({ method:'POST', path:'/api/v1/dsh/artifacts' })` 1:1 and returns the identical `{ id, type, filename, size }` metadata shape, so tool results stay byte-compatible with today. The tool plugins declare it in `inject` (`['huaqiuAuth','huaqiuArtifacts','tools']`) and keep the inline-content fallback when the service is somehow absent (defensive `try/catch`).
- **Browser fetches same-origin** (`fetch('/api/v1/dsh/artifacts/<id>')` / `/content`) — no CORS, no token, opaque-id lookup exactly as hq-edge's design. The client halves only change their transport (`hqEdge.api.request` GET → plain `fetch`); the card logic is untouched.
- **No browser half required** — the client fetches the URLs directly. A thin `huaqiuArtifacts` client service could be added later if desired.
- Storage default `~/.dsh/artifacts/` (`dshHomePath('artifacts')`), overridable by plugin config `{ baseDir }` or env `DSH_HOME`. Its own `cordis.patch.yml` inserts one node row:
  ```yaml
  - insert:
      - id: huaqiu-artifacts
        name: '@huaqiu/dsh-artifacts'
        inject: ['webServer']      # node:http route registry (official @deepseek-ai/dsh-host-webserver)
  ```

### 5.2 symbol-footprint

- Node tool result: `{ status:'generated', kind, artifact:{id,type,filename,size}, fileUrl, filename, content?, note?, serviceMessage? }` — **unchanged from today**: `finishGeneration` now stores via `huaqiuArtifacts.create` instead of `hqEdge.api.request`; `artifact` present when storage succeeds, `content` inline as the data-loss fallback.
- Client preview: `fetch('/api/v1/dsh/artifacts/<id>/content')` → text → render with `@huaqiu/ecad-renderer` (or inline `content`). Download: same URL → blob → save. No `hqEdge.api`, no external fetch.

### 5.3 schematic-gen

- Node system tool result: `{ status:'generated', kind:'system', design_name, module_count, connection_count, module_names, zip_bytes, zipArtifact:{id,type,filename,size}, zip?, note? }` — `zipArtifact` is the **single source of truth** for both preview and download (the earlier hq-edge fix), stored via `huaqiuArtifacts.create` (content base64-encoded for the zip, as today). Inline `zip` data-URL ≤1 MiB fallback only when storage fails.
- Client: `fetch('/api/v1/dsh/artifacts/<id>/content')` → zip URL/blob → `renderProjectFromZip` (root schematic) + download. Multi-sheet schematic tool keeps per-sheet inline `schFiles` (+ optional `fileUrl`).
- part-search: no artifacts (JSON text via `@huaqiu/part-search`), unchanged.

### 5.4 Why local artifacts > direct external `fileUrl` (the earlier §5 alternative)

Local artifacts keep the exact hq-edge UX and remove every external assumption:
- no dependence on `www.eda.cn`/`file.eda.cn` cross-origin fetchability or CORS;
- works fully offline;
- opaque-id lookup (same trust model as today);
- the client's existing artifact-id → content-URL logic ports unchanged.

Direct `fileUrl`/datastream-upload remains a valid **fallback when no storage is wanted** (e.g. headless), but the local plugin is the primary design.

---

## 6. `@huaqiu/dsh-auth` — the shared auth foundation

Full design in `dsh-pcb-eda.md` §9/§10. Summary of what the three plugins need from it:

```ts
interface HuaqiuAuthService {
  auth: {
    getAccessToken(): Promise<string | null>;      // eda.cn session token (cached)
    getUserInfo(): Promise<{ id: string; token: string; nickname?: string } | null>;
    isAuthenticated(): boolean;
    login(): Promise<void>;                         // browser half: auth.eda.cn iframe
    logout(): Promise<void>;
    onAuthStateChanged(l): () => void;
  };
  api: { request(o: {method:string; path:string; body?:unknown}): Promise<any> }; // X-Token REST proxy (optional)
}
```

- Browser half: `auth.eda.cn` iframe (`?v=&lang=&theme=&clickOutsideToClose=true`), **`event.origin === 'https://auth.eda.cn'` check**, `update_access_token` envelope `{category:1,data:{type:'update_access_token',data}}`, localStorage `token`/`userInfo`, fingerprint silent login, 5-day expiry, `close_dialog`. Pushes token to node half via the DSH host RPC (prototype; see `dsh-pcb-eda.md` §23).
- Node half: in-memory token cache, `getAccessToken()`/`getUserInfo()` served to tools, `api.request` with `X-Token`.
- **schematic-gen specifically needs `getUserInfo().id`** for `x-user-id` (the demo account is removed — §8).

---

## 7. Per-Plugin Migration Plan

### 7.1 part-search (easiest — validates the tool-plugin packaging)

Target: `@huaqiu/dsh-tool-part-search` (node-only, no client).

```
src/
  index.ts            # name, inject ['tools'], apply(); registers 4 tools via defineTool
  tools/search.ts     # snake_case args → @huaqiu/part-search input; output { schema, render }
  tools/detail.ts
  tools/models.ts
  tools/supply-chain.ts
  huaqiu.ts           # createPartSearchService() with language/defaults; single instance
test/
  index.test.ts       # port of lib/index.test.ts: tool shape, args translation, no hqEdge
```

- Replace `hqEdge.api.request` bodies with `service.searchParts(...)` / `getPart(...)` / `getEdaModels(...)` / `getSupplyChain(...)` from `@huaqiu/part-search` (published; add as `dependencies` — not peer, it's a library).
- Keep the 4 public tool names and the exact snake_case schemas (agent-facing contract unchanged).
- Keep `TOOL_TIMEOUT_MS` (30 s) and business-code handling (`code === 200000`).
- Port tests: assert tool shape + that `service.*` is invoked with translated args (inject a fake service).

### 7.2 symbol-footprint (largest — protocol + HIL + rich client)

Target: `@huaqiu/dsh-tool-symbol-footprint` (dual-face).

```
src/
  index.ts                 # name, inject ['huaqiuAuth','huaqiuArtifacts','tools']; apply() registers 3 tools
  saas/
    protocol.ts            # CMD / FRAME / ACTION consts, consumeFrame, findAction
    socket.ts              # callComponentAgent() (WS RPC, budgets, token-expired) — port as-is
    endpoint.ts            # resolveEndpoint (host whitelist), buildSocketUrl
    images.ts              # resolveImageDataUrl, guessImageMime, size caps
    artifacts.ts           # extractFileUrl, fetchArtifactText (→ now feeds fileUrl/content)
    commands.ts            # buildCommand (chat/base64_images/history=[])
  domain/
    dimensions.ts          # normalizeDimensions, renderDimensionsForHuman,
                           #   parseDimensionOverrides, confirm*/direct HIL helpers
    packageTypes.ts        # PACKAGE_TYPES
  tools/
    generateSymbol.ts      # runGenerateSymbol
    generateFootprintFromImage.ts   # 3-phase + HIL
    generateFootprintFromDimensions.ts
  hil/
    userQuestions.ts       # ctx.get('userQuestions') seam (same opportunistic pattern)
  client/
    index.tsx              # apply(): inject tool.call.toolview for the 3 keys; locale zh/en
    project.ts             # projectToolCall, parseGenResult, resultTextOf (pure TS)
    cards/GenHitCard.tsx   # header/summary/actions (download/regenerate/inspect)
    cards/DimensionEditor.tsx  # rich editor (SVG + numeric) — port pickGeometry/bgaGrid/etc.
    ecad/Preview.tsx       # @huaqiu/ecad-renderer mount; fetch fileUrl/content → render
    download.ts            # fetch fileUrl → blob → save; regenerate via sessions
    i18n.ts                # zh/en packs (port COPY)
test/
  index.test.ts, client.test.ts, saas/*.test.ts, domain/*.test.ts
```

- Node: `inject ['huaqiuAuth','huaqiuArtifacts','tools']`; token via `huaqiuAuth.auth.getAccessToken()`; **artifact storage via `ctx.get('huaqiuArtifacts').create(...)`** (in-process, replaces `createPreviewArtifact`/`hqEdge.api` POST) — `finishGeneration` returns the same `artifact:{id,type,filename,size}` + `fileUrl` + inline-`content` fallback shape as today.
- `userQuestions` stays opportunistic (`ctx.get('userQuestions')`, not injected) — the HIL contract is unchanged. Keep the **single** HIL: node `ask()` is authoritative; the client dimension editor submits through the `sessions` conversation channel (existing `sendHumanAnswer`). Do not re-add a second popup (the earlier hq-edge "duplicate question" bug).
- Client: React + TS, keyed toolviews via `ctx.slots.inject('tool.call.toolview', ...)`, `sessions` for regenerate/human-answer, ECAD preview component, dimension editor ported 1:1 (pure geometry math stays pure → unit-testable).
- Port every unit test; add client component tests with `@testing-library/react` + jsdom.

### 7.3 schematic-gen (protocol + zip preview)

Target: `@huaqiu/dsh-tool-schematic-gen` (dual-face).

```
src/
  index.ts                 # name, inject ['huaqiuAuth','huaqiuArtifacts','tools']; apply() registers 2 tools
  saas/
    copilotkit.ts          # resolveConfig, buildHeaders, buildRunBody, consumeCopilotkit (SSE),
                           #   applyDelta, handleEvent, extractSchematic, extractModuleGraph
    exportZip.ts           # exportModuleGraphZip (→ Buffer)
    datastream.ts          # (fallback only) upload zip → external zipUrl
  tools/
    generateSchematic.ts   # runGenerateSchematic
    generateSystem.ts      # runGenerateSystem (+ huaqiuArtifacts.create for the zip)  
  client/
    index.tsx              # apply(): tool.call.toolview for the 2 keys; locale
    project.ts             # projectToolCall, parseGenResult
    cards/GenHitCard.tsx   # summary (design/sheets/modules/connections)
    cards/SheetTabs.tsx    # multi-sheet tab bar
    ecad/Preview.tsx       # renderProjectFromZip(zipUrl) / per-sheet render
    download.ts            # zipUrl / sheet fileUrl → blob
    i18n.ts
test/
  index.test.ts, saas/*.test.ts, client.test.ts
```

- **Credentials**: remove the baked-in demo account. Node resolves `x-user-id`/`x-user-token` from `huaqiuAuth.auth.getUserInfo()` (the logged-in eda.cn account) with env override `HQ_EDA_USER_ID`/`HQ_EDA_USER_TOKEN`; fail the tool with a "log in to Huaqiu first" error when neither is present. `state.user_id`/`state.token` filled from the same source.
- Artifact: store the zip via `huaqiuArtifacts.create({ type:'zip', filename, content: base64, contentEncoding:'base64' })` → `zipArtifact` (single source of truth, §5.1/§5.3); external datastream-upload → `zipUrl` is only a fallback if no artifacts plugin is mounted.
- Client: `fetch('/api/v1/dsh/artifacts/<id>/content')` → `renderProjectFromZip` (root schematic) + download; sheet tool renders per-sheet inline `schFiles`.

---

## 8. Security & Secrets (migration must not regress)

- **Remove the hardcoded demo eda.cn account** from schematic-gen (§7.3). Never ship a real token.
- Keep: componentV2 host whitelist + endpoint validation; `auth.eda.cn` origin check; image size cap (4 MiB) and artifact fetch cap (512 KiB); dimension-override key validation (only keys the extractor returned); token never logged.
- `@huaqiu/part-search` is public/unauthenticated (kiapi.eda.cn) — no secrets there.
- Artifacts are served same-origin by opaque id with **no auth gate** (same trust model as hq-edge: ids are random uuids, localhost-only). Do not attach the token to artifact URLs; if an external `fileUrl` is ever used as fallback and is token-gated, route it through `huaqiuAuth.api` server-side instead (§11).

---

## 9. Publishing Workflow

Per package (community conventions, `dsh-plugin/dsh-auth-gate` reference):

```text
pnpm install
pnpm -r test && pnpm -r build
pnpm --filter @huaqiu/dsh-auth publish --access public
pnpm --filter @huaqiu/dsh-artifacts publish --access public
pnpm --filter @huaqiu/dsh-tool-part-search publish --access public
pnpm --filter @huaqiu/dsh-tool-symbol-footprint publish --access public
pnpm --filter @huaqiu/dsh-tool-schematic-gen publish --access public
```

- `cordis.patch.yml` MUST be in `files`.
- `dependencies` vs `peerDependencies` (corrected): `@huaqiu/part-search` → **`dependencies`** (plain leaf lib, no shared state — self-contained install); `@huaqiu/ecad-renderer` → **`devDependencies`** (bundled into `lib/client.js`, not needed at runtime); `@huaqiu/dsh-auth`, `@huaqiu/dsh-artifacts` → **peer** (co-installed plugins, like the auth-gate pattern); DSH runtime + `react` + client runtime packages → peer with verified ranges.
- Verify install: `dsh plugin --profile web add @huaqiu/dsh-auth @huaqiu/dsh-artifacts @huaqiu/dsh-tool-part-search @huaqiu/dsh-tool-symbol-footprint @huaqiu/dsh-tool-schematic-gen` on a stock DSH, then `dsh --profile web --dump-config` shows all five rows.

---

## 10. Phased Implementation Plan

- **Phase 0 — foundation**: workspace scaffolding (5 packages, tsdown/tsc/vitest, CI); `@huaqiu/dsh-auth` browser iframe + node twin service (prototype the browser→node token push RPC first — the only genuinely novel piece).
- **Phase 0.5 — `@huaqiu/dsh-artifacts`**: port `DshPreviewArtifactService` (fs+json, `~/.dsh/artifacts/`) + `ctx.webServer` GET routes (`/api/v1/dsh/artifacts/:id`, `/:id/content`) + `huaqiuArtifacts` in-process service. Validates the webServer-mount mechanism early (mirrors the edge-bridge `/hq-edge` precedent) before any tool depends on it.
- **Phase 1 — part-search** (no auth, no UI): validates tool-plugin packaging + publish + clean-install. Deliver `@huaqiu/dsh-tool-part-search`.
- **Phase 2 — symbol-footprint node** (TS port of protocol + HIL + `huaqiuAuth` token + `huaqiuArtifacts` storage): deliver the 3 tools, unit tests green, HIL works via `userQuestions`.
- **Phase 3 — symbol-footprint client** (React HIT: GenHitCard + DimensionEditor + ECAD preview + sessions actions); port client tests.
- **Phase 4 — schematic-gen node + client** (CopilotKit TS + zip via `huaqiuArtifacts` + `renderProjectFromZip` card); remove demo creds; deliver both tools.
- **Phase 5 — release**: publish all five, awesome-list entries, GitHub tags, clean-install verification, README rewrite (currently wrongly claims an HQ Edge connection).

---

## 11. Risks & Open Questions

- **`webServer` route contract** (`Needs confirmation` in practice): `ctx.webServer.register` throws on duplicate `(kind, path)` — a future plugin could collide on `/api/v1/dsh/artifacts`; use a distinctive path (e.g. `/api/v1/huaqiu/artifacts`) or document the reservation. Verify the route is reachable on the stock web profile (it is — `webserver` row in `web-app` bundle, `@deepseek-ai/dsh-host-webserver`).
- **Artifact storage location + lifecycle**: default `~/.dsh/artifacts/` (`dshHomePath('artifacts')`); decide TTL/housekeeping (reuse the existing `ttlSeconds` + `deleteAll({onlyExpired})`); confirm disposal unregisters routes + cleans service (the webserver invariant plugin already checks route cleanup on fiber teardown).
- **`fileUrl` / datastream-upload fetchability** (fallback path only, `Needs confirmation`): if the artifacts plugin is not mounted, the tool falls back to `fileUrl`/inline content; whether those URLs are browser-fetchable cross-origin remains unverified. Local artifacts remove this concern for the primary path.
- **Client bundle size / ecad-renderer duplication**: bundling `@huaqiu/ecad-renderer` into both tool plugins duplicates it; acceptable at first, revisit via a shared `@huaqiu/dsh-ecad-viewer` client row + `dsh.client.external` if the bundle grows (the module system supports it — `WebBootEntry.external` — but the renderer would need a `/plugins/<id>/client.js` bundle, which it does not ship today).
- **`userQuestions` + rich-editor HIL**: keep exactly one interactive channel to avoid the earlier hq-edge duplicate-popup bug; confirm `userQuestions` is present on the stock web profile (it is in-box: `packages/interaction/user-questions`).
- **Browser→node token push RPC**: exact DSH host-RPC shape (prototype in Phase 0).
- **CopilotKit auth**: real eda.cn account required (demo removed); `gen.eda.cn` may gate by Referer/cookie — verify header-based auth works from Node.
- **Tool-result size limits**: keeping the zip out of the JSON (artifact id instead) avoids the inline-base64 truncation failure that motivated the artifact store; keep the ≤1 MiB inline fallback + a `note` when neither artifact nor inline is possible.
- **Package versioning**: DSH runtime is pre-1.0 (`0.1.1-rc.x`); pin compatible peer ranges and re-verify on DSH bumps.
- **Hot reload for out-of-tree client plugins** (`Needs confirmation`): `client-hmr`/`dev-web` vs `dsh web` restart for external packages.
