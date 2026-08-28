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

**Acceptance criteria** (review #1/#19 — must hold at the end, enforced by CI):

```text
dsh-pcb-eda
      │
      ├── @huaqiu/dsh-auth
      ├── @huaqiu/dsh-artifacts
      ├── @huaqiu/dsh-tool-part-search
      ├── @huaqiu/dsh-tool-symbol-footprint
      └── @huaqiu/dsh-tool-schematic-gen

NO @hqedge/* anywhere
```

- **Zero `@hqedge/*` dependency** in any published `package.json` — CI: `pnpm -r why @hqedge` must exit non-zero (fail if any package resolves it).
- **Zero `@hqedge/` in generated bundles** — CI: `grep -R "@hqedge/" packages/*/lib` must find nothing (a dependency can disappear from `package.json` while remaining bundled).
- **Final hard acceptance test**: on a completely clean DSH (no hq-edge bridge / HQ Edge server / HQ Edge API), install all five, boot, load, register all 9 tools, and exercise each capability (see §10 Phase 5).

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

Five published packages in one pnpm workspace under `/Users/admin/code/dsh-pcb-eda`:

```text
dsh-pcb-eda/
├── package.json / pnpm-workspace.yaml / tsconfig.base.json / vitest.config.ts
└── packages/
    ├── dsh-auth/                 # @huaqiu/dsh-auth            — shared auth plugin (dual-face)
    ├── dsh-artifacts/            # @huaqiu/dsh-artifacts       — local ECAD artifact service (node service + webServer adapter)
    ├── dsh-tool-part-search/     # @huaqiu/dsh-tool-part-search     — node-only
    ├── dsh-tool-symbol-footprint/# @huaqiu/dsh-tool-symbol-footprint — dual-face
    └── dsh-tool-schematic-gen/   # @huaqiu/dsh-tool-schematic-gen   — dual-face
```

**Dependency graph** (review #1 — DSH is the runtime boundary; HQ Edge disappears from the graph; `@huaqiu/part-search` is a normal library dependency):

```text
                         DSH
                          │
             ┌────────────┼─────────────┐
             │            │             │
          dsh-auth     dsh-artifacts   dsh-tools
             │            │             │
             ├────────────┴──────┐      │
             │                   │      │
      symbol-footprint      schematic-gen
             │                   │
             └──────────┬────────┘
                        │
                 part-search
                        │
                @huaqiu/part-search
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
- Node: `export const name`, `export const inject = ['huaqiuAuth', 'huaqiuArtifacts', 'tools']` (symbol-footprint adds `'userQuestions'` — see §7.2), `export function apply(ctx, config)`, tools via `ctx.tools.register(defineTool({...}))` (`@deepseek-ai/dsh-tools`).
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

### 5.1 `@huaqiu/dsh-artifacts` — a first-class service, HTTP is only an adapter (review #2/#3)

```
src/
  index.ts              # name, inject ['webServer']; apply(ctx, config):
                        #   provide 'huaqiuArtifacts' service + register webServer routes
  service.ts            # port of DshPreviewArtifactService (fs + meta.json) + path hardening
  routes.ts             # webServer adapter: GET /:id (meta) + GET /:id/content (stream)
  storage.ts            # default baseDir = dshHomePath('artifacts') → ~/.dsh/artifacts/
                        #   (@deepseek-ai/dsh-home-paths resolveDshHome/dshHomePath), config-overridable
```

The service is the single unit of truth; the HTTP routes are just one adapter around it (review #2):

```text
HuaqiuArtifacts            ← interface below; independently testable
       │
       ├── Node consumer   ← tools call ctx.get('huaqiuArtifacts').create(...) in-process (HARD RULE, no HTTP loopback)
       └── webServer adapter ← same-origin GET /api/v1/huaqiu/artifacts/:id[/content]
```

```ts
interface HuaqiuArtifacts {
  create(opts: { type: string; filename: string; content: string | Uint8Array | Buffer;
                 contentEncoding?: 'utf8' | 'base64'; ttlSeconds?: number })
    : Promise<{ id: string; type: string; filename: string; size: number }>;
  get(id: string): Promise<ArtifactMeta | null>;
  readContent(id: string): Promise<Uint8Array>;
  openStream(id: string): ReadableStream;
  delete(id: string): Promise<void>;
  deleteAll(opts?: { onlyExpired?: boolean }): Promise<number>;
}
```

- **Node tools use the service in-process** (`ctx.get('huaqiuArtifacts').create({...})`) — replaces `hqEdge.api.request({ method:'POST', path:'/api/v1/dsh/artifacts' })` 1:1 and returns the identical `{ id, type, filename, size }` metadata shape, so tool results stay byte-compatible with today. The tool plugins declare it in `inject` (`['huaqiuAuth','huaqiuArtifacts','tools']`) and keep the inline-content fallback when the service is somehow absent (defensive `try/catch`).
- **Route namespace owned by the plugin** (review #3): use `/api/v1/huaqiu/artifacts/<id>` + `/content`, **not** `/api/v1/dsh/artifacts` — the resource belongs to the Huaqiu plugin, not DSH; avoids creating a de-facto global DSH API namespace and sidesteps future duplicate-route throws.
- **Browser fetches same-origin** (`fetch('/api/v1/huaqiu/artifacts/<id>')` / `/content`) — no CORS, no token; the client halves only change their transport (`hqEdge.api.request` GET → plain `fetch`); the card logic is untouched.
- **No browser half required** — the client fetches the URLs directly.
- Storage default `~/.dsh/artifacts/` (`dshHomePath('artifacts')`), overridable by plugin config `{ baseDir }` or env `DSH_HOME`. Its own `cordis.patch.yml` inserts one node row:
  ```yaml
  - insert:
      - id: huaqiu-artifacts
        name: '@huaqiu/dsh-artifacts'
        inject: ['webServer']      # node:http route registry (official @deepseek-ai/dsh-host-webserver)
  ```

**Path & size hardening** (review #15/#16 — must be in the service + its tests):
- `id` must match `^art_[0-9a-f]+$` — validated before any path join; `get`/`readContent` on a non-matching id → `null`/404 (never interpolate into the path).
- `filename` **never** participates in the storage path — only `<id>/content` + `<id>/meta.json`; filename lives in `meta.json` and is used only for `Content-Disposition`.
- Enforce: max artifact size, max metadata size, TTL, atomic write (tmp+rename), symlink-safe access (`lstat` guard / `realpath` containment under `baseDir`).
- **Security model** (review #15): unguessable id + **local-only DSH web server** (`127.0.0.1`) + size limits + TTL + path-traversal protection is the MVP; if the web server ever binds `0.0.0.0`, add an auth gate (defer — see §11).

### 5.2 symbol-footprint

- Node tool result: `{ status:'generated', kind, artifact:{id,type,filename,size}, fileUrl, filename, content?, note?, serviceMessage? }` — **unchanged from today**: `finishGeneration` now stores via `huaqiuArtifacts.create` instead of `hqEdge.api.request`; `artifact` present when storage succeeds, `content` inline as the data-loss fallback.
- Client preview: `fetch('/api/v1/huaqiu/artifacts/<id>/content')` → text → render with `@huaqiu/ecad-renderer` (or inline `content`). Download: same URL → blob → save. No `hqEdge.api`, no external fetch.

### 5.3 schematic-gen

- Node system tool result: `{ status:'generated', kind:'system', design_name, module_count, connection_count, module_names, zip_bytes, zipArtifact:{id,type,filename,size}, zip?, note? }` — `zipArtifact` is the **single source of truth** for both preview and download (the earlier hq-edge fix), stored via `huaqiuArtifacts.create` (content base64-encoded for the zip, as today). Inline `zip` data-URL ≤1 MiB fallback only when storage fails.
- Client: `fetch('/api/v1/huaqiu/artifacts/<id>/content')` → zip URL/blob → `renderProjectFromZip` (root schematic) + download. Multi-sheet schematic tool keeps per-sheet inline `schFiles` (+ optional `fileUrl`).
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

- Browser half: `auth.eda.cn` iframe (`?v=&lang=&theme=&clickOutsideToClose=true`), **`event.origin === 'https://auth.eda.cn'` check**, `update_access_token` envelope `{category:1,data:{type:'update_access_token',data}}`, localStorage `token`/`userInfo`, fingerprint silent login, 5-day expiry, `close_dialog`. Pushes token to node half via the DSH host RPC (prototype in Phase 0A; see `dsh-pcb-eda.md` §23).
- Node half: in-memory token cache, `getAccessToken()`/`getUserInfo()` served to tools.
- **Auth is a capability, not a token transport** (review #5): the auth plugin does **not** promise `getAccessToken()` and `getUserInfo().token` are the same credential. Each backend adapter decides what it needs:
  ```text
  componentV2 (symbol-footprint WS)   → auth.getAccessToken()   (the ?token= value)
  gen.eda.cn (schematic-gen headers)  → auth.getUserInfo()      → { id, token } (x-user-id / x-user-token)
  ```
  The semantic contract the plugins rely on is only:
  ```text
  auth.isAuthenticated()  → boolean         (cheap, sync)
  auth.getAccessToken()   → string|null     (componentV2 WS token)
  auth.getUserInfo()      → {id,token,nickname?} | null   (gen.eda.cn identity)
  ```
  This keeps `@huaqiu/dsh-auth` uncoupled from either backend; a backend change only touches its adapter.
- **schematic-gen uses `getUserInfo()`** for `x-user-id`/`x-user-token` (the demo account is removed — §8).

---

## 7. Per-Plugin Migration Plan

### 7.1 part-search (easiest — validates the tool-plugin packaging)

Target: `@huaqiu/dsh-tool-part-search` (node-only, no client).

```
src/
  index.ts            # name, inject ['tools'], apply(); registers 4 tools via defineTool
  service.ts          # createPartSearchService() — @huaqiu/part-search wrapper (language/defaults, single instance)
  tools.ts            # 4 defineTool()s: snake_case args → service.* calls; output { schema, render }
test/
  index.test.ts       # port of lib/index.test.ts: tool shape, args translation, no hqEdge
```

- **Don't over-split** (review #9): start with `index.ts / service.ts / tools.ts` and split only if the files grow — the important separation is **`@huaqiu/part-search` service ↓ DSH tool adapter**, not one file per tool.
- Replace `hqEdge.api.request` bodies with `service.searchParts(...)` / `getPart(...)` / `getEdaModels(...)` / `getSupplyChain(...)` from `@huaqiu/part-search` (published; add as `dependencies` — not peer, it's a library).
- Keep the 4 public tool names and the exact snake_case schemas (agent-facing contract unchanged).
- Keep `TOOL_TIMEOUT_MS` (30 s) and business-code handling (`code === 200000`).
- Port tests: assert tool shape + that `service.*` is invoked with translated args (inject a fake service).

### 7.2 symbol-footprint (largest — protocol + HIL + rich client)

Target: `@huaqiu/dsh-tool-symbol-footprint` (dual-face).

```
src/
  index.ts                 # name, inject ['huaqiuAuth','huaqiuArtifacts','tools','userQuestions'];
                           #   apply() registers 3 tools
  saas/
    protocol.ts            # CMD / FRAME / ACTION consts, consumeFrame, findAction
    socket.ts              # callComponentAgent() (WS RPC, budgets, token-expired) — port as-is
    endpoint.ts            # resolveEndpoint (host whitelist), buildSocketUrl
    images.ts              # resolveImageDataUrl, guessImageMime, size caps
    artifacts.ts           # extractFileUrl, fetchArtifactText (→ now feeds fileUrl/content)
    commands.ts            # buildCommand (chat/base64_images/history=[])
  domain/                  # ← PURE TS, zero React/DOM (review #10) → exhaustively unit-tested
    dimensions.ts          # normalizeDimensions, renderDimensionsForHuman,
                           #   parseDimensionOverrides, classify/validate, bgaGrid, packageSilhouette
    packageTypes.ts        # PACKAGE_TYPES
  tools/
    generateSymbol.ts      # runGenerateSymbol
    generateFootprintFromImage.ts   # 3-phase + HIL (ask() via injected ctx.userQuestions)
    generateFootprintFromDimensions.ts
  client/
    index.tsx              # apply(): inject tool.call.toolview for the 3 keys; locale zh/en
    project.ts             # projectToolCall, parseGenResult, resultTextOf (pure TS — state machine)
    transport.ts           # artifact fetch (fetch '/api/v1/huaqiu/artifacts/<id>[/content]'),
                           #   sessions sendHumanAnswer, download→blob
    components/GenHitCard.tsx   # header/summary/actions (download/regenerate/inspect)
    components/DimensionEditor.tsx  # FIRST-CLASS reusable component (props API below)
    components/Preview.tsx  # @huaqiu/ecad-renderer mount
    i18n.ts                # zh/en packs (port COPY)
test/
  index.test.ts, domain/*.test.ts, client.test.ts (jsdom + @testing-library/react)
```

- Node: `inject ['huaqiuAuth','huaqiuArtifacts','tools','userQuestions']`; token via `huaqiuAuth.auth.getAccessToken()`; **artifact storage via `ctx.get('huaqiuArtifacts').create(...)`** (in-process, replaces `createPreviewArtifact`/`hqEdge.api` POST) — `finishGeneration` returns the same `artifact:{id,type,filename,size}` + `fileUrl` + inline-`content` fallback shape as today.
- **`userQuestions` is DECLARED in `inject`, not opportunistic** (review #4): the dimension workflow fundamentally requires HIL, so the plugin declares the dependency (`ctx.userQuestions.ask(...)`). *Exception (explicit product decision)*: if we later want **headless** DSH where the tool works without HIL, flip to opportunistic `ctx.get('userQuestions')` — but that is not the current target.
- **Single-HIL invariant (formal, review #12)**: exactly **one** interactive channel per generation — node `ask()` (authoritative) → React HIT renders the same interaction → client submits via the `sessions` conversation channel → tool resumes. Never a second popup (the earlier hq-edge "duplicate question" bug).
- **React migration: extract layers, don't translate the 1,885-line classic script literally** (review #10). The client splits into `project.ts` (pure state machine) → `domain/` (pure geometry: extraction, classification, override validation, BGA grid, silhouette, handle movement, normalization) + `transport.ts` (artifacts/sessions/download) → thin React components. `domain/dimensions.ts` is **UI-independent** and unit-tested before React is involved.
- **`DimensionEditor` is a first-class reusable component** (review #11), not buried in GenHitCard:
  ```tsx
  <DimensionEditor
    geometry={geometry}
    dimensions={dimensions}
    onChange={...}
    onConfirm={...}
    onCancel={...}
  />
  ```
  HIT layout: `Preview` → `Dimensions/DimensionEditor` → `Actions (Regenerate / Accept / Download)`.
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

- **Credentials — resolve early, structured AUTH_REQUIRED** (review #13): remove the baked-in demo account. Before any CopilotKit request the tool calls `resolveCredentials()`:
  ```text
  resolveCredentials()
       ├── env override (HQ_EDA_USER_ID / HQ_EDA_USER_TOKEN)   ← dev/CI ONLY (§8)
       ├── authenticated Huaqiu user (huaqiuAuth.auth.getUserInfo())
       └── otherwise → tool result { status:'AUTH_REQUIRED', ... }  ← never a late 401/403/SSE timeout
  ```
  `state.user_id`/`state.token` filled from the same source. A structured `AUTH_REQUIRED` result also makes the HIT trivially renderable (show "Sign in to Huaqiu" instead of an error dump).
- Artifact: store the zip via `huaqiuArtifacts.create({ type:'zip', filename, content: base64, contentEncoding:'base64' })` → `zipArtifact` (single source of truth, §5.1/§5.3); external datastream-upload → `zipUrl` is only a fallback if no artifacts plugin is mounted.
- Client: `fetch('/api/v1/huaqiu/artifacts/<id>/content')` → `renderProjectFromZip` (root schematic) + download; sheet tool renders per-sheet inline `schFiles`.

---

## 8. Security & Secrets (migration must not regress)

- **Remove the hardcoded demo eda.cn account** from schematic-gen (§7.3). Never ship a real token.
- Keep: componentV2 host whitelist + endpoint validation; `auth.eda.cn` origin check; image size cap (4 MiB) and artifact fetch cap (512 KiB); dimension-override key validation (only keys the extractor returned); token never logged.
- **Auth is a capability, not token plumbing** (§6): `@huaqiu/dsh-auth` exposes `isAuthenticated()` / `getAccessToken()` / `getUserInfo()`; each backend adapter maps its own credential. The plugin never promises the two tokens are the same value.
- **Env credential override is dev/CI ONLY** (review #14): `HQ_EDA_USER_ID`/`HQ_EDA_USER_TOKEN` are a **test/diagnostic escape hatch**, documented as such — never the recommended setup. Production priority: `huaqiuAuth.auth.getUserInfo()`.
- `@huaqiu/part-search` is public/unauthenticated (kiapi.eda.cn) — no secrets there.
- **Artifact security model** (review #15): unguessable id (`^art_[0-9a-f]+$`) + **local-only DSH web server** (`127.0.0.1`) + size limits + TTL + path-traversal/symlink protection = MVP. If the web server ever binds `0.0.0.0`, add an auth gate (deferred, §11). Do not attach the token to artifact URLs; if an external `fileUrl` is ever used as fallback and is token-gated, route it through `huaqiuAuth.api` server-side instead.

---

## 9. Publishing Workflow

**Release dependency order** (review #18) — publish in this exact sequence:

```text
@huaqiu/dsh-auth
        ↓
@huaqiu/dsh-artifacts
        ↓
@huaqiu/dsh-tool-part-search
        ↓
@huaqiu/dsh-tool-symbol-footprint
        ↓
@huaqiu/dsh-tool-schematic-gen
```

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
- **Compatibility / installation matrix** (review #18 — test before releasing a new version):

  | Test              | Auth | Artifacts | Part | Symbol | Schematic |
  | ----------------- | ---: | --------: | ---: | -----: | --------: |
  | Node load         |    ✓ |         ✓ |    ✓ |      ✓ |         ✓ |
  | Stock DSH         |    ✓ |         ✓ |    ✓ |      ✓ |         ✓ |
  | Web profile       |    ✓ |         ✓ |    — |      ✓ |         ✓ |
  | Tool call         |    ✓ |         ✓ |    ✓ |      ✓ |         ✓ |
  | Client bundle     |    ✓ |         — |    — |      ✓ |         ✓ |
  | Clean npm install |    ✓ |         ✓ |    ✓ |      ✓ |         ✓ |

  Commands: `dsh plugin --profile web add ...`, `dsh --profile web --dump-config`, then **actual tool invocation** — not just load.
- **Bundle-size gate** (review #17): add a release check that prints `lib/client.js` size + gzip size per package so ecad-renderer duplication can't quietly grow; keep the bundled-renderer decision (no `dsh-ecad-viewer` yet — premature abstraction).

---

## 10. Phased Implementation Plan (review #7/#20 ordering)

- **Phase 0 — DSH foundation**: workspace scaffolding (5 packages, tsdown/tsc/vitest, CI); **exact package manifests + `cordis.patch.yml` rows + service/route IDs first** (see `docs/tasks/phase0-implementation-spec.md`); clean **stock-DSH install smoke test** (`dsh plugin --profile web add` a skeleton → boot → `--dump-config`) so the packaging contract is proven before building on it.
- **Phase 0A — auth token-propagation POC** (review #6): auth.eda.cn iframe → postMessage (origin check) → browser token state → browser→node RPC → `getAccessToken()`/`getUserInfo()`. Test: login / token received / node receives / tool reads / logout / node invalidation / token refresh / reload persistence. Only after green do we build the full auth UI/service.
- **Phase 0B — `@huaqiu/dsh-artifacts`**: fs+json service (`~/.dsh/artifacts/`, TTL, size/path security) + `webServer` adapter (`/api/v1/huaqiu/artifacts/:id`, `/:id/content`) + `huaqiuArtifacts` in-process service + browser fetch/download tests. Validates the webServer-mount mechanism early.
- **Phase 1 — part-search** (no auth/browser/artifacts/HIL/WS/React/renderer): smallest vertical slice — package → patch → DSH load → `ctx.tools` → `defineTool` → publish → stock install → tool invocation. Deliver `@huaqiu/dsh-tool-part-search`.
- **Phase 2 — symbol-footprint node** (TS port of protocol + auth + artifacts + declared `userQuestions` HIL + pure `domain/dimensions`): deliver the 3 tools, unit tests green, single-HIL works.
- **Phase 3 — symbol-footprint client** (layered React: project.ts → domain + transport → GenHitCard + first-class DimensionEditor + ECAD preview + sessions actions); single-HIL verification; port tests.
- **Phase 4 — schematic-gen node + client** (CopilotKit TS + `resolveCredentials()`/AUTH_REQUIRED + zip via `huaqiuArtifacts` + `renderProjectFromZip` card); remove demo creds; deliver both tools.
- **Phase 5 — release + hard acceptance test** (review #19): on a **completely clean DSH** (no hq-edge bridge / HQ Edge server / HQ Edge API), install all five, then verify:

```text
✓ DSH boots                ✓ all plugins load           ✓ all 9 tools register
✓ part search works        ✓ auth login works           ✓ symbol generation works
✓ dimension HIL works      ✓ footprint generation works ✓ artifact preview works
✓ artifact download works  ✓ schematic generation works ✓ project preview works
✓ schematic download works ✓ no HQ Edge process running ✓ no @hqedge dependency exists
```

  Plus: dependency-graph audit (`pnpm -r why @hqedge` fails), bundle audit (`grep -R "@hqedge/" packages/*/lib` empty), security audit, README/docs rewrite (currently wrongly claims an HQ Edge connection), GitHub tags, publish.

---

## 11. Risks & Open Questions

- **`webServer` route contract**: resolved — plugin-owned namespace `/api/v1/huaqiu/artifacts` (review #3) avoids the duplicate-route throw and any de-facto global DSH API namespace. Verify reachability on the stock web profile in Phase 0B (it is — `webserver` row in `web-app` bundle, `@deepseek-ai/dsh-host-webserver`).
- **Artifact storage location + lifecycle**: default `~/.dsh/artifacts/` (`dshHomePath('artifacts')`); reuse existing `ttlSeconds` + `deleteAll({onlyExpired})`; confirm disposal unregisters routes + cleans service (the webserver invariant plugin already checks route cleanup on fiber teardown).
- **Deployment boundary** (review #15): `webServer` can bind `127.0.0.1` or `0.0.0.0`. Opaque-id artifacts are an acceptable MVP on `127.0.0.1`; on `0.0.0.0` we need an auth/authorization story before release. Confirm the stock DSH bind in Phase 0B.
- **`fileUrl` / datastream-upload fetchability** (fallback path only, `Needs confirmation`): if the artifacts plugin is not mounted, the tool falls back to `fileUrl`/inline content; whether those URLs are browser-fetchable cross-origin remains unverified. Local artifacts remove this concern for the primary path.
- **Client bundle size / ecad-renderer duplication**: bundling `@huaqiu/ecad-renderer` into both tool plugins duplicates it; acceptable at first (add the size/gzip gate, §9), revisit via a shared client row + `dsh.client.external` only if it grows — **do not introduce `dsh-ecad-viewer` yet** (review #17).
- **`userQuestions` availability on web profile**: now **declared in `inject`** (review #4); confirm it is present on the stock web profile (it is in-box: `packages/interaction/user-questions`). The single-HIL invariant (§7.2) is enforced.
- **Browser→node token push RPC**: exact DSH host-RPC shape (prototype in Phase 0A — the whole point of the POC).
- **CopilotKit auth**: real eda.cn account required (demo removed); `gen.eda.cn` may gate by Referer/cookie — verify header-based auth works from Node; tools resolve credentials early with structured `AUTH_REQUIRED` (§7.3).
- **Tool-result size limits**: keeping the zip out of the JSON (artifact id instead) avoids the inline-base64 truncation failure that motivated the artifact store; keep the ≤1 MiB inline fallback + a `note` when neither artifact nor inline is possible.
- **Package versioning**: DSH runtime is pre-1.0 (`0.1.1-rc.x`); pin compatible peer ranges and re-verify on DSH bumps.
- **Hot reload for out-of-tree client plugins** (`Needs confirmation`): `client-hmr`/`dev-web` vs `dsh web` restart for external packages.
