# DSH PCB EDA Plugin Research

Implementation-oriented research for the standalone plugin **`@huaqiu/dsh-pcb-eda`** (and the shared Huaqiu auth capability), based on inspection of the local repositories:

- `/Users/admin/code/deepseek-harness` — the official DeepSeek Harness (DSH) source.
- `/Users/admin/code/dsh-plugin` — the community plugin collection + 2379-entry awesome list.
- `/Users/admin/code/hq-eda-ai` — the Huaqiu EDA web app that implements the `auth.eda.cn` login and eda.cn API calls.
- `/Users/admin/code/hq-edge` — **comparison only**; the target plugin must NOT depend on it (see §15).

Every architectural claim below cites the actual file and symbol that established it. Terms used:

- `Verified` — read directly in source.
- `Recommended` — derived from the verified evidence.
- `Needs confirmation` — could not be established from local source (mostly server-side behavior of `auth.eda.cn` / `www.eda.cn`).

---

## 1. Executive Summary

- **DSH plugins are npm packages**, not forks. A package becomes a profile layer by declaring `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }`; the CLI installs it with `dsh plugin --profile <name> add <pkg>` and the profile composer applies its patch (a YAML list of Cordis entry inserts/overrides) in layer order (`deepseek-harness/packages/boot/app-boot/src/profile.ts`, `apps/cli/src/plugin.ts`).
- **One package can carry both faces**: a Node/host half (`main` → `lib/index.js`) and a browser half (`exports["./client"]` → `lib/client.js`), activated by `"dsh": { "client": { "platform": "web", "inject": [...] } }`. The browser half is served by the DSH web server at `/plugins/<id>/client.js` and registers keyed per-tool UI (rich HIT) through the `tool.call.toolview` slot (`packages/client/ui-tool/src/client/apply.ts`).
- **Node tools** are registered with `ctx.tools.register(defineTool({ ... }))` inside `apply(ctx, config)` (`packages/todo/tool-todo/src/index.ts`).
- **Huaqiu auth**: `auth.eda.cn` is embedded as a full-window iframe; login state returns over `postMessage` with a **strict origin check** (`event.origin === 'https://auth.eda.cn'`), envelope `{ data: { type: 'update_access_token', data: { token, ... } } }`; the token is persisted in `localStorage` (`token` / `userInfo`) and sent to Huaqiu APIs as an `X-Token` header (REST) or a `?token=` query param (componentV2 WebSocket). A fingerprint-based silent login restores the token when localStorage is empty. All traced in `hq-eda-ai/apps/web/src`.
- **Recommended architecture**: two published, dual-face plugins — `@huaqiu/dsh-auth` (exposes a Cordis service `huaqiuAuth` on both faces, browser half owns the iframe login + token storage, node half serves the token to tools) and `@huaqiu/dsh-pcb-eda` (registers the EDA tools + keyed toolviews, consumes `huaqiuAuth`). This mirrors the verified `hqEdge` service precedent in hq-edge (`apps/server/dsh-plugins/edge-bridge/lib/client.js`) without any HQ Edge dependency.
- **No HQ Edge anywhere**: `@huaqiu/dsh-pcb-eda` is installable on a clean DSH after `dsh plugin --profile web add @huaqiu/dsh-auth @huaqiu/dsh-pcb-eda`.

---

## 2. Repository Research

### 2.1 dsh-plugin

`/Users/admin/code/dsh-plugin` contains a mix of the awesome list, and dozens of **full plugin repositories** checked out locally:

- `awesome-dsh-plugin/data/plugins/` — **2379 metadata entries**, one YAML per plugin: `{ url, name, category, description: { en, zh } }` (verified e.g. `1624318455__dsh-plugin-tavily.yml`). This is the directory to scan when looking for a reference plugin by capability; source lives on GitHub.
- Local source checkouts (top level): `dsh-genui`, `deepseek-harness-genui`, `dsh-visualize`, `dsh-openpencil`, `dsh-mcp-panel`, `dsh-bridge`, `dsh-market`, `dsh-pcb-parts-search`, `dsh-auth-gate`, `dsh-notifier`, `dsh-context`, `dsh-plugin-mermaid`, `DSH-better-sidebar`, `Oh-My-DSH`, `deepseek-harness-remote`, and more.
- The **single most relevant** plugin for this project is `dsh-pcb-parts-search` (node-only tool that already calls an eda.cn API) — see §5/§11. The **most relevant for shared auth** is `dsh-auth-gate` (dual-face auth plugin) — see §9/§10.

### 2.2 deepseek-harness

`/Users/admin/code/deepseek-harness` is the full official source: a pnpm workspace (`pnpm-workspace.yaml`), packages under `packages/<group>/<name>` plus a `vendor/` holding forked Cordis/loader/include packages, `apps/cli` (the `dsh` binary), `apps/web` (the React frontend), `packages/client/*` (the browser plugin packages), `packages/boot/app-boot` (profile/bundle composition). Root `package.json`: `engines.node "^22.19.0 || >=24.0.0"`, `packageManager pnpm@11.7.0`.

### 2.3 hq-eda-ai

`/Users/admin/code/hq-eda-ai` is the Next.js web app (`apps/web`) for Huaqiu's EDA assistant. It contains the complete `auth.eda.cn` login implementation (`components/LoginDialog.tsx`, `lib/modular_circuit/context/UserInfoContext.tsx`), the token/fingerprint plumbing (`lib/api/fingerprint.ts`), and the eda.cn API callers (`lib/modular_circuit/utils/upload_design_block_zip.ts`, `lib/modular_circuit/utils/module_resolver.ts`, `lib/config/domain.ts`). Its own middleware (`lib/middleware/*`) is **not** reusable — it proxies to Huaqiu's private Python/Agent backends; only the auth protocol and the public eda.cn endpoints transfer to a standalone plugin.

---

## 3. DSH Plugin Architecture

A "DSH plugin" is any npm package that the profile composer can turn into Cordis entries. Two manifest fields drive everything:

```jsonc
// package.json — dual-face plugin (node + browser), e.g. dsh-auth-gate / dsh-mcp-panel / dsh-visualize
{
  "name": "@huaqiu/dsh-pcb-eda",
  "type": "module",
  "main": "lib/index.js",            // node/host half
  "exports": {
    ".": { "types": "./lib/types/index.d.ts", "default": "./lib/index.js" },
    "./client": { "types": "./lib/types/client.d.ts", "default": "./lib/client.js" },
    "./cordis.patch.yml": "./cordis.patch.yml",
    "./package.json": "./package.json"
  },
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },   // makes it installable as a profile layer
    "client": { "platform": "web", "inject": ["@deepseek-ai/dsh-client-runtime", "..."] }
  },
  "peerDependencies": {
    "@deepseek-ai/cordis": "^4.0.1",
    "@deepseek-ai/dsh-tools": ">=0.1.0-rc.0 <0.2.0"
  },
  "files": ["lib", "src", "cordis.patch.yml"]
}
```

Evidence:
- `deepseek-harness/packages/boot/app-boot/src/profile.ts` defines `DshBundleManifest { patch: string }` and `DshClientManifest`; a bundle is "an npm package whose manifest declares `dsh.bundle`", resolved by `loadProfile()`.
- `packages/client/ui-tool/package.json`, `packages/client/connection/package.json`, `dsh-plugin/dsh-auth-gate/package.json`, `dsh-plugin/dsh-visualize/package.json`, `dsh-plugin/dsh-mcp-panel/package.json` all carry `dsh.client.platform: "web"` + `inject` + `exports["./client"]`.

### 3.1 Cordis

DSH is built on a **forked Cordis** (`vendor/cordis`, version `4.0.1` verified). Plugin `apply(ctx, config)` receives a `Context`; rows in the composed entry list are mounted by `@deepseek-ai/cordis-plugin-loader` (`vendor/loader`), and patches are applied by `@deepseek-ai/cordis-plugin-include` (`vendor/include/src/index.ts`).

### 3.2 dsh.bundle — the patch contract

The bundle's `cordis.patch.yml` is a YAML list of patch operations (`vendor/include/src/index.ts` `applyEntryPatches`):

- `- insert: [ { id, name, config?, inject?, disabled? } ]` — append entries (top level, or into a group when `id` targets a group entry).
- `- { id, name?, config?, disabled?, inject?, ... }` — override an existing entry by id; `config` **replaces** the whole config; `name` mismatch warns+skips.
- `!!js <expr>` scalars are evaluated by the loader at activation (`isJsExpr`, `JsExpr` type in `vendor/include`).
- Last write wins per row; inserted rows are indexed so later patches in the same list can target them.

In-box examples:
- `packages/bundle/base/cordis.patch.yml` — inserts the whole core (`tools`, `agent`, `tool-bash`, `web`, `system-prompt`, …).
- `packages/bundle/web-app/cordis.patch.yml` — inserts the web transport + the whole browser roster (`modules`, `connection`, `ui-tool`, …) and disables host-plane rows.
- `dsh-plugin/dsh-pcb-parts-search/cordis.patch.yml`:
  ```yaml
  - insert:
      - id: tool-pcb-parts-search
        name: '@deepseek-ai/dsh-tool-pcb-parts-search'
  ```

### 3.3 Profile composition

- A profile is `$DSH_HOME/profiles/<name>/` with `package.json` (`dsh.profile.bundles`: ordered package-name list + `dependencies`) and `cordis.patch.yml` (the user's own layer).
- `loadProfile()` resolves each bundle to its `cordis.patch.yml`, parses patches, and `composeEntries()` applies them over an empty entry list in `dsh.profile.bundles` order, then the user layer, then `--patch` overlays.
- Bundles resolve **installation-first, then profile dir**; a flat fallback `$DSH_HOME/profiles/node_modules` is maintained by `healProfilesModuleFallback()` so every in-box plugin resolves from any profile.

### 3.4 Node/runtime vs Browser/UI split

- **Node half** (`main` → `lib/index.js`): runs in the DSH host process. Registers tools/services/commands, talks to external services.
- **Browser half** (`exports["./client"]` → `lib/client.js`): a client plugin package. The `dsh.client` row is part of the "browser roster" that `@deepseek-ai/dsh-client-modules` scans into `window.__DSH_BOOT__` and serves at `/plugins/<id>/client.js` (`packages/bundle/web-app/cordis.patch.yml`, `packages/client/modules`).
- A **dual-face** package (e.g. `@deepseek-ai/dsh-client-connection`) provides the same service on both faces; `packages/client/connection` has `src/index.ts` (node: binds the gateway to the webserver under `/api`) and `src/client/*` (browser: fetch/SSE client).

---

## 4. dsh.bundle

**Verified contract** (`deepseek-harness/packages/boot/app-boot/src/profile.ts`):

```jsonc
"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }
```

- `patch` is relative to the package root; it must point to the entry-list YAML.
- `dsh.profile.bundles` in the profile's `package.json` is the ordered layer list; the CLI maintains it automatically (§19).
- A dependency that does **not** declare `dsh.bundle` is installed as a plain library and the CLI warns (`apps/cli/src/plugin.ts` `reconcilePlugins`).
- `PROFILE_TEMPLATES` (`profile.ts`): `web = ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app']`, `headless = ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-headless']`. A third-party plugin is appended after these.

**Recommended for us**: `@huaqiu/dsh-auth` and `@huaqiu/dsh-pcb-eda` each ship their own `cordis.patch.yml` that inserts one row per plugin:

```yaml
- insert:
    - id: huaqiu-auth
      name: '@huaqiu/dsh-auth'
- insert:
    - id: huaqiu-pcb-eda
      name: '@huaqiu/dsh-pcb-eda'
```

---

## 5. Plugin Lifecycle

- `apply(ctx, config)` is the entry point; `config` is the row's `config` (validated by the exported `Config` schemastery schema when declared).
- Named exports `name` / `inject` are the loader contract: `export const name = 'tool-todo'`, `export const inject = ['tools']` (`packages/todo/tool-todo/src/index.ts`). The same pattern is used by `dsh-plugin/dsh-pcb-parts-search/src/index.ts` (`export const name = '@deepseek-ai/dsh-tool-pcb-parts-search'`, `inject = ['tools']`).
- Node-side **tool registration** (`defineTool` from `@deepseek-ai/dsh-tools`):
  ```ts
  ctx.tools.register(defineTool({
    name, description,
    parameters: { /* JSON-Schema-like */ },
    output: { schema, render: (args, value) => [{ type: 'text', text }] },
    execute: async (args) => value,
    presentCall: (args) => ({ card: 'generic', title, kind, rawInput }),
    timeoutMs: 15000,
  }))
  ```
- Browser-side **lifecycle**: `ctx.plugin(toolviewPlugin)` / `ctx.slots.inject(...)` with `apply(ctx)`, disposal rides `ctx.effect` (`packages/client/ui-tool/src/client/apply.ts`).

**Tool commands understood by the componentV2 backend** (from `hq-edge/apps/server/dsh-plugins/symbol-footprint/lib/index.js`, `COMMAND` map) are the protocol the standalone plugin's tools will speak; reuse them rather than re-inventing.

---

## 6. Node/Runtime Integration

How a plugin provides Node functionality without forking DSH — all verified:

- Package is a normal npm module; its `main` is loaded as a Cordis entry row (row `name` = package name, `packages/bundle/base/cordis.patch.yml`).
- Inject services by name via `inject: ['tools', 'hqEdge', 'sessions', …]` and read with `ctx.get('service')`.
- Register tools with `ctx.tools.register(defineTool(...))` (§5). Register commands (`@deepseek-ai/dsh-commands`), services (`ctx.provide('myService', impl)`), and configuration (schemastery `Config`).
- External HTTP from Node uses plain `fetch` — **the pcb-parts-search plugin already calls an eda.cn API directly from the Node tool runtime** (`dsh-plugin/dsh-pcb-parts-search/src/queryPage.ts` → `fetch('https://www.eda.cn/api/chiplet/products/queryPage')`), proving a plugin can talk to Huaqiu services directly without any proxy.
- Node debugging: the CLI runs in-process; `--inspect` on the dsh process works (see §16).

---

## 7. Browser/UI Integration

Verified mechanisms for adding UI to the DSH web surface:

1. **`dsh.client` browser plugin** (the primary mechanism). A package with `dsh.client.platform: 'web'` gets its `./client` bundle loaded in the browser; it runs in the client Cordis context and can register slots / toolviews. Evidence: `packages/client/ui-tool`, `packages/client/ui-sidebar`, `dsh-plugin/dsh-auth-gate`, `dsh-plugin/dsh-mcp-panel`, `dsh-plugin/dsh-visualize`.
2. **Slot system** (`@deepseek-ai/dsh-client-ui-slots`): the conversation node slot, the `tool.call.toolview` keyed slot, sidebar slots, settings slots (`ui-settings-plugins` row in `packages/bundle/web-app/cordis.patch.yml`).
3. **Host-plane settings** (`ui-settings-plugins` = `@deepseek-ai/dsh-client-ui-settings-plugins`): expandable cards for a plugin's config namespace (§ plugin configuration in the web-app patch comments).
4. **Keyed tool views (rich HIT)** — see §8.

---

## 8. HIT / Rich UI

**The verified DSH HIT mechanism is the keyed `tool.call.toolview` slot.** This is exactly what the footprint/symbol/schematic/ERC cards should use.

Evidence — `packages/client/ui-tool/src/client/apply.ts`:

```ts
ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({
  name: 'conversation.chat.node',
  key: 'tool-call',
  children: { 'tool.call.toolview': { kind: 'keyed', scope: 'session' } },
}, ToolCallTree))
```

and `packages/client/ui-tool/src/client/tool/toolviews/web-row.tsx` (a concrete per-tool card):

```ts
ctx.slots.inject('tool.call.toolview', function* () {
  yield ctx.slots.register({ name: 'tool.call.toolview', key: 'web_search', locale: NS }, WebRow)
  yield ctx.slots.register({ name: 'tool.call.toolview', key: 'web_fetch', locale: NS }, WebRow)
})
```

So a plugin's browser half registers a React component under `name: 'tool.call.toolview'`, `key: '<toolName>'`. The component receives `ToolCallViewProps` (`toolName, block, ...`) and renders the card.

**Which mechanism for which EDA surface** (recommendation, from the harness evidence + hq-edge precedent):

| Surface | Mechanism | Why |
|---|---|---|
| Part search results | `tool.call.huaqiu_search_parts` toolview | keyed tool card (like `web_search`/`search` rows) |
| Footprint dimension editor | toolview card + full interactive React component | same pattern as hq-edge `symbol-footprint` `client.js` (verified working) |
| Symbol editor / pin table | toolview card | same |
| Schematic generation + preview | toolview card + **iframe to viewer.eda.cn** for the rendered project | `ui-tool`-style card; iframe precedent in `hq-eda-ai` (`fmt_ecad_viewer_iframe_url`) |
| ERC findings | toolview card | same keyed slot |
| Persistent panel (e.g. project browser) | `ui-*` sidebar/settings slots | slot registry supports registered panels (`ui-sidebar`, `ui-settings-plugins`) |

Artifacts: DSH renders "produced files" under each closing assistant message via `ui-deliverables` (`@deepseek-ai/dsh-client-ui-deliverables`, `packages/bundle/web-app/cordis.patch.yml`); tools that produce files can rely on this for downloads.

**Local-first rule (from dsh-genui, prior study)**: interactive cards should do everything locally (drag, edit, validate) and only Confirm/Cancel round-trip to the model — fewer tokens, snappier UI.

---

## 9. Huaqiu Authentication

Traced in `/Users/admin/code/hq-eda-ai/apps/web/src` (host side) and **confirmed against the auth.eda.cn source itself at `/Users/admin/code/eda-cn-login`** (the login page that the iframe loads).

### 9.1 auth.eda.cn iframe

`components/LoginDialog.tsx`:

```ts
const baseUrl = "https://auth.eda.cn/?v=20260409&clickOutsideToClose=true";
const iframeUrl = `${baseUrl}&lang=${frameLang}&theme=${frameTheme}`; // lang=zh|en, theme=dark|light
```

- Embedded as a full-window `<iframe className="h-full w-full">` inside a dialog (`hideOverlay`, full screen).
- Parameters: `v` (version), `clickOutsideToClose`, `lang` (zh/en), `theme` (dark/light).
- **Confirmed from the auth.eda.cn source** (`/Users/admin/code/eda-cn-login/app/page.tsx`): the page reads `fill === 'full'` (webview full-screen mode; the `task.md` note says `fill=full` is meant for webview, not iframe) and `clickOutsideToClose === 'true'` (when set, clicking outside the dialog fires a `close_dialog` message so the host can close the iframe). A `data-iframe-mode` attribute is set on `<html>` to make the body background transparent when embedded as an iframe.

### 9.2 Login flow (message protocol)

Host side — `components/LoginDialog.tsx` `handleMessage`:

```ts
if (event.origin !== "https://auth.eda.cn") return;      // STRICT origin check
const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
if (data.data?.type === "update_access_token") {
  const userData = data.data.data;                        // { token, phone, nickname, ..., syncUrls? }
  if (userData?.token) {
    // optional syncUrls fired as 1px tracking images
    login(userData.token, userInfo);                       // UserInfoContext
    bindFingerprint(userData.token);                       // fingerprint bind
    loginSuccessNotifyKicad(userData);                     // desktop/webview bridge notify
  }
} else if (data.data?.type === "close_dialog") { onClose(); }
```

So the envelope is `{ data: { type: 'update_access_token' | 'close_dialog', data: {...} } }`, and the host must verify `event.origin === 'https://auth.eda.cn'`.

Sender side (auth.eda.cn) — **confirmed from source** (`/Users/admin/code/eda-cn-login/lib/kicadTools.ts`, `app/page.tsx`): the login page fires `loginSuccessNotifyKicad({ userId, expires_at: now + 5*24*60*60, agreeCollectIP: false, ...userInfo })`, which calls `firePassiveAction`:

```ts
// lib/kicadTools.ts — firePassiveAction()
if (window.parent && window.parent !== window) {
  window.parent.postMessage(JSON.stringify(action), "*");   // NOTE: targetOrigin "*"
}
```

So the exact wire format is `{ category: 1 /*PA_WEB_HOST*/, data: { type: 'update_access_token', data: { token, userId, expires_at, nickname, phone, ... } } }` — `token` rides inside `data.data.data` via the spread `...userInfo` (`UserInfoWithToken`), matching what the host parses. `expires_at` is `now + 5 days`, confirming the 5-day expiry rule. `close_dialog` is sent with `data: null`.

A **second, alternative channel** exists: the host exposes `window.handle_auth` (`UserInfoContext.tsx`), receiving `{ state, auth: { token, phone, nickname, userId, username, lastLoginTime } }` with states `LOGIN_FAILED | LOGOUT | ACCESS_TOKEN_UPDATED | ACCESS_TOKEN_EXPIRED`. The producer of this channel is not in the local source (`Needs confirmation` — likely the desktop host/webview or a variant of the iframe).

### 9.3 Token acquisition

- Primary: the `update_access_token` message payload `userData.token`.
- URL fallback: `?token=&phone=&nickname=&username=` query params consumed once then stripped from the URL (`UserInfoContext.tsx`).
- Silent restore (no iframe): **fingerprint login** — `components/FingerprintSilentLoginBootstrap.tsx`:
  1. `getFingerprintId()` (FingerprintJS visitor id, `lib/fingerprint/client.ts`).
  2. `getToken(fingerprintId)` → `POST {getUserRestUrl()}/api/fingerprint/getToken` → returns a bound token.
  3. `fetchUserInfo(token)` → validate; `login(token, userInfo)`.

### 9.4 Token storage

- `localStorage` keys `token` and `userInfo` (JSON) — `UserInfoContext.tsx` `login()` writes both; `logout()`/expiry removes them.
- In-memory mirror in the context. Browser-JavaScript-accessible by design.

### 9.5 Token refresh / expiration

- On load/login, the token is validated by `fetchUserInfo(token)` (`lib/api/auth.ts` → `/api/middleware/getUserInfo` with header `X-token`); failure → `logout()`.
- `handle_auth` state `ACCESS_TOKEN_EXPIRED` → `logout()`.
- `update_access_token` with `lastLoginTime` older than **5 days** → `logout()` (`UserInfoContext.tsx`).
- The componentV2 WebSocket returns a **`token-expired` frame**; hq-edge's client rejects the promise with an actionable error (`hq-edge/apps/server/dsh-plugins/symbol-footprint/lib/index.js`).

### 9.6 Logout

- `logout(isUserInitiated)` clears context + localStorage; `loginOutNotifyKicad()` posts `{category: PA_WEB_HOST, data:{type:'logout'}}` to the desktop/webview bridge (`lib/kicad/kicadTools.ts`).
- No server-side invalidation call was found (`Needs confirmation` whether auth.eda.cn invalidates on the server side).

### 9.7 Security / origin validation

- **Host-side origin check is mandatory** (the auth side does NOT restrict its parent): `event.origin !== 'https://auth.eda.cn'` → return. Required in any reimplementation.
- **auth.eda.cn does not validate the embedding parent.** **Confirmed from source** (`/Users/admin/code/eda-cn-login/lib/kicadTools.ts`): the iframe posts the login result to `window.parent` with `targetOrigin: "*"`, and the app's `next.config.js` sets only `Cache-Control` headers — **no `X-Frame-Options`, no `Content-Security-Policy: frame-ancestors`, no `middleware.ts`**. The page is embeddable from any origin and will happily postMessage the token to whatever parent embeds it. The trust boundary is therefore entirely on the host side: the plugin must check `event.origin === 'https://auth.eda.cn'` on every message (to reject spoofed/sibling frames), and should not rely on auth.eda.cn to gate who embeds it. (Deployment-level headers at the `auth.eda.cn` infra — Cloudflare/Nginx — are outside this repo and remain `Needs confirmation`, but cross-origin iframe embedding is already proven in production by web-vue, pdfVerification, and hq-eda-ai.)
- **No third-party-cookie dependency**: all SSO/login network happens inside the iframe's own origin (`auth.eda.cn` → `passport.huaqiu.com` SSO, then `auth.eda.cn/api/middleware/*` proxies with `credentials:'include'`); the parent never needs cookies, it only receives the token via postMessage and uses it via `X-Token` header / `?token=` WS. This removes the "third-party cookie for the host" concern entirely.
- **`credentials`**: the fingerprint API uses `credentials: 'include'` (`lib/api/fingerprint.ts`) — cookies are involved only for the eda.cn session *inside* the iframe's own context (SameSite behavior `Needs confirmation`).
- **Token header**: REST calls to Huaqiu services use `X-Token` (fingerprint API) / `X-token` (user-info API); the componentV2 WebSocket uses `?token=` query param (hq-edge `buildSocketUrl`).

---

## 10. Shared Huaqiu Authentication Architecture

**Recommended: Option B (a standalone dual-face auth plugin exposing a Cordis service), with a shared implementation module inside it.** Rationale from evidence:

- Auth needs a **browser component** (the `auth.eda.cn` iframe + postMessage + localStorage) and a **node component** (supplying the token to Node-side tools). Only a mounted plugin (bundle row + `dsh.client` row) can provide both. A pure library (Option A) cannot mount the iframe or register client slots.
- DSH already has the exact precedent: hq-edge's `hqEdge` is a **service provided on both faces** and consumed by every HQ plugin via `ctx.get('hqEdge')`:
  - `hq-edge/apps/server/dsh-plugins/edge-bridge/lib/client.js`: `ctx.provide('hqEdge', hqEdge)` from the **browser half**, with `hqEdge.auth.getAccessToken()` (cached), `hqEdge.api.request({method, path, body})`, and `hqEdge.project`/`hqEdge.workspace`.
  - `hq-edge/apps/server/dsh-plugins/symbol-footprint/lib/index.js`: `export const inject = ['hqEdge', 'tools']`, `resolveToken(hqEdge)` → `hqEdge.auth.getAccessToken()`.
- So `@huaqiu/dsh-auth` should register a Cordis service **`huaqiuAuth`** on both faces:

```ts
interface HuaqiuAuthService {
  auth: {
    getAccessToken(): Promise<string | null>;   // cached; null when logged out
    isAuthenticated(): boolean;
    login(): Promise<void>;                      // opens the auth.eda.cn iframe (browser face)
    logout(): Promise<void>;                     // clears token + notifies
    onAuthStateChanged(listener): () => void;
  };
  api: { request(opts: { method, path, body }): Promise<Response> }; // token-injecting Huaqiu REST proxy
}
```

- **Cross-face token flow (the one novel design point)**: the iframe login and `localStorage` live in the browser; Node-side tools need the token. Recommended: the browser half pushes the token to the node half over the DSH client↔host RPC (the `dsh-client-connection` transport / host `api-gateway` Remote mechanism — `packages/bundle/web-app/cordis.patch.yml` `connection` + `api-gateway` rows); the node half caches it in memory and serves `huaqiuAuth.auth.getAccessToken()` to tools. Expiry → the tool surfaces "please log in", the browser re-opens the iframe, pushes the refreshed token, model retries. (The exact RPC call shape is `Needs confirmation` from `dsh-client-connection`'s `client/rpc.ts` until prototyped.)
- Other Huaqiu plugins (e.g. `@huaqiu/dsh-pcb-eda`) declare `peerDependencies: { "@huaqiu/dsh-auth": "^1" }` and `inject: ['huaqiuAuth', 'tools']`.

### Option evaluation (from the task)

- **Option A — shared package only (`@huaqiu/dsh-auth` as a lib)**: `Reject`. Cannot host the iframe/client half; auth state would have to be re-implemented per plugin.
- **Option B — standalone auth plugin (`@huaqiu/dsh-auth`)**: `Recommended`. Matches the `hqEdge` service precedent; reusable by any future Huaqiu plugin; install is `dsh plugin add @huaqiu/dsh-auth`.
- **Option C — core package + plugin + consumer**: `Not needed yet`. `@huaqiu/dsh-auth` can internally be one package with `src/auth-core/` (pure token logic, unit-testable) + the plugin entry; split to `@huaqiu/dsh-auth-core` only when a second non-plugin consumer appears.

---

## 11. Huaqiu API Integration

All endpoints verified in source:

| Endpoint | Method/Auth | Source |
|---|---|---|
| Part search `https://www.eda.cn/api/chiplet/products/queryPage` | POST JSON, **no auth**, business code `200000`, nested `result[].queryPartVO.part` | `dsh-plugin/dsh-pcb-parts-search/src/queryPage.ts` |
| Upload `https://www.eda.cn/openapi/datastream/upload` | POST FormData, no auth, code `200000` → `result.url` | `hq-eda-ai/apps/web/src/lib/modular_circuit/utils/upload_design_block_zip.ts` |
| Module zips `https://www.eda.cn/<path>` | GET, no auth | `hq-eda-ai/apps/web/src/lib/modular_circuit/utils/module_resolver.ts` (`ZIP_ORIGIN`) |
| Fingerprint bind/getToken `https://gen.eda.cn/user-rest/api/fingerprint/{bind,getToken}` | POST, `credentials: 'include'`, header `X-Token`, code `200000` | `hq-eda-ai/apps/web/src/lib/api/fingerprint.ts` |
| User info `.../api/middleware/getUserInfo` | POST, header `X-token` | `hq-eda-ai/apps/web/src/lib/api/auth.ts` |
| ComponentV2 tools `wss://www.eda.cn/componentV2/chat/<channel>?token=<token>` | WebSocket, **token as query param**; `token-expired` frame | `hq-edge/apps/server/dsh-plugins/symbol-footprint/lib/index.js` |
| CopilotKit / export-zip `https://gen.eda.cn/api/copilotkit`, `https://gen.eda.cn/api/modular_circuit/export-zip` | Referer `https://gen.eda.cn/` (+ token) | `hq-edge/apps/server/dsh-plugins/schematic-gen/lib/index.js` |
| Viewer iframe `viewer.eda.cn/?zip-url=...` | GET (localhost-accessible) | `hq-eda-ai/apps/web/src/lib/modular_circuit/utils/fmt_ecad_viewer_iframe_url.ts` |

**Browser vs Node**: the pcb-parts-search and schematic-gen plugins call eda.cn **directly from the Node tool runtime** with `fetch` (no CORS issue in Node). The browser-facing calls (upload, viewer iframe) work from the browser because they are either public or same-site (edacn-hosted). **Recommendation**: keep all authenticated Huaqiu REST/WS calls in the **Node half** (tools) — the `huaqiuAuth.api.request` proxy lives in node; the browser only needs the viewer iframe (public) and the login dialog. This avoids CORS entirely and keeps the token out of more browser surfaces than necessary.

Error handling: business code check `json.code === 200000` (HTTP 200 is not enough), timeouts (`timeoutMs: 15000` in pcb-parts-search), token-expired detection.

---

## 12. Proposed dsh-pcb-eda Architecture

```
                         DSH web profile
                 ┌─────────────────────────────┐
                 │  @huaqiu/dsh-auth (plugin)  │  dual-face; browser owns iframe login + localStorage;
                 │  service: huaqiuAuth        │  node twin caches token, serves getToken() to tools
                 └─────────────┬───────────────┘
                               │ huaqiuAuth.getAccessToken()
                 ┌─────────────▼───────────────┐
                 │  @huaqiu/dsh-pcb-eda (plugin)│ dual-face
                 │  node: huaqiu_* tools        │  fetch/WS → Huaqiu APIs (www.eda.cn / gen.eda.cn / wss)
                 │  browser: tool.call.* cards  │  keyed toolviews + viewer.eda.cn iframe preview
                 └─────────────────────────────┘
```

- Tool set (registered with `defineTool`): `huaqiu_search_parts`, `huaqiu_get_part`, `huaqiu_get_datasheet`, `huaqiu_generate_symbol`, `huaqiu_generate_footprint`, `huaqiu_generate_schematic`, `huaqiu_run_erc`.
- Browser cards registered under `tool.call.huaqiu_*` keys (§8).
- No HQ Edge anywhere; `huaqiuAuth` replaces `hqEdge`.

---

## 13. Proposed Repository Layout

Adapted from the task's sketch to the **verified** dual-face conventions (compare `dsh-plugin/dsh-auth-gate`, `dsh-plugin/dsh-mcp-panel`):

```text
dsh-pcb-eda/
├── package.json              # pnpm workspace root (private)
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── .npmrc / .gitignore
├── README.md
├── LICENSE
├── docs/
│   ├── research/dsh-pcb-eda.md     # this document
│   └── tasks/...
└── packages/
    ├── dsh-auth/                   # @huaqiu/dsh-auth
    │   ├── package.json            # dsh.bundle.patch + dsh.client
    │   ├── cordis.patch.yml
    │   ├── tsconfig.json / tsconfig.client.json / tsdown.config.ts
    │   ├── src/
    │   │   ├── index.ts            # node half: huaqiuAuth service (getToken, api.request), tool huaqiu_login/logout
    │   │   ├── auth-core/          # pure: token cache, expiry, state machine (unit-testable, no DSH imports)
    │   │   └── client/
    │   │       ├── index.tsx       # browser half: apply(), iframe login, localStorage, push token to node
    │   │       └── LoginDialog.tsx # auth.eda.cn iframe + postMessage + origin check (ported from hq-eda-ai)
    │   └── test/
    └── dsh-pcb-eda/                # @huaqiu/dsh-pcb-eda
        ├── package.json            # dsh.bundle.patch + dsh.client; peer @huaqiu/dsh-auth
        ├── cordis.patch.yml
        ├── tsconfig.json / tsconfig.client.json / tsdown.config.ts
        ├── src/
        │   ├── index.ts            # registers all huaqiu_* tools; inject ['huaqiuAuth','tools']
        │   ├── huaqiu/             # api client (search/part/datasheet/symbol/footprint/schematic/erc) + ws client
        │   ├── domain/             # EDA logic (footprint dimension math, symbol pin mapping, ERC model)
        │   ├── ui/                 # card components (shared by toolviews)
        │   └── client/
        │       ├── index.tsx       # apply(): register tool.call.huaqiu_* toolviews
        │       └── cards/          # PartSearchCard, DimensionEditorCard, SymbolCard, SchematicCard, ErcCard
        └── test/
```

This is a **two-package workspace** (auth shared + pcb-eda), which directly satisfies "Huaqiu authentication may eventually be shared by other DSH plugins" without a third package.

---

## 14. Dependency Boundaries

```text
DSH (cordis 4.x, dsh-tools, dsh-client-*)  ← peerDependencies
   ↑
@huaqiu/dsh-pcb-eda   (tools + UI cards)
   ↑ inject huaqiuAuth
@huaqiu/dsh-auth      (service; browser iframe + node token)
   ↑
Huaqiu services (www.eda.cn / gen.eda.cn / auth.eda.cn / viewer.eda.cn / wss://www.eda.cn)
```

- `@huaqiu/dsh-pcb-eda` **peer-depends** on `@huaqiu/dsh-auth` (and the DSH core packages) — never a runtime `dependencies` on DSH internals.
- Neither plugin depends on `@hqedge/*` or any HQ Edge runtime.
- Domain logic (`src/domain/`) imports no DSH symbols → unit-testable in isolation (Vitest + jsdom).

---

## 15. Why HQ Edge Is Not a Dependency

`@huaqiu/dsh-pcb-eda` must be independently installable on a clean DSH. Concretely it must not require: `@hqedge/*` packages, the HQ Edge executable/service, the HQ Edge localhost port, HQ Edge configuration, or HQ Edge's artifact service.

Evidence that HQ Edge is only one possible arrangement and is not structural:

- hq-edge's plugins are `"private": true` and are **bundled into a custom dsh distribution** via `pnpm dist:edge-headless` (`hq-edge/apps/server/dsh-plugins/*`); they are not published standalone, and they hard-depend on the `hqEdge` service (`edge-bridge/lib/client.js`) that only HQ Edge provides.
- The standalone plugin instead gets its token from `@huaqiu/dsh-auth`'s `huaqiuAuth` service, which implements the same `auth.eda.cn` login that `hq-eda-ai` already proves works in a plain browser.
- The Node tool side calls eda.cn directly with `fetch` (proven by `dsh-pcb-parts-search`); no HQ Edge proxy is needed for the public endpoints, and the authenticated ones only need the token + `X-Token`/`?token=` conventions.
- The existing `README.md` in `/Users/admin/code/dsh-pcb-eda` says the plugin connects "through HQ Edge" — **this must be corrected** in the implementation task; the research conclusion is that HQ Edge is optional/removed entirely.

Clean-install statement (target):

```text
dsh plugin --profile web add @huaqiu/dsh-auth @huaqiu/dsh-pcb-eda
```

plus a Huaqiu login through the plugin's own UI/iframe.

---

## 16. Development Workflow

Fastest verified loop:

1. **Repo**: pnpm workspace (`pnpm install`). Per-package scripts mirror the verified convention (`dsh-plugin/dsh-auth-gate`):
   - `build`: `tsc -p tsconfig.build.json && tsdown && tsc -p tsconfig.client.build.json`
   - `typecheck`: `tsc -p tsconfig.json --noEmit && tsc -p tsconfig.client.json --noEmit`
   - `test`: `vitest run`
   - `prepack`: `npm run build`
2. **Install locally into DSH**: the CLI accepts a local path / `file:` / `link:` spec, anchored to the invoking cwd (`apps/cli/src/plugin.ts` `anchorPathSpec`):
   ```text
   dsh plugin --profile web add /Users/admin/code/dsh-pcb-eda/packages/dsh-pcb-eda
   dsh plugin --profile web add /Users/admin/code/dsh-pcb-eda/packages/dsh-auth
   ```
   (pnpm links the package; the profile `dsh.profile.bundles` reconciles automatically.)
3. **Restart DSH**: `dsh web` (alias `dsh --profile web`). Host-side edits require restarting the dsh process.
4. **Browser-side hot reload**: the official loop is `pnpm run dev:web` (`scripts/dev-web.ts`) — watch `tsc` (types) → `tsdown` (rewrites `lib/client.js`) → `vite build` (`apps/web/dist`); the host webserver stat-polls served bundles and broadcasts `rebuilt` frames, so the browser reloads automatically. For an out-of-tree plugin, run the same `tsdown --watch` in the plugin package; because the profile links the package and the modules server serves `/plugins/<id>/client.js` from the resolved package, a `lib/client.js` rewrite triggers the same reload. (`Needs confirmation`: exact watch wiring for an out-of-tree client plugin vs the in-repo `dev-web` script; the client-HMR row `@deepseek-ai/dsh-client-hmr` is always mounted per `packages/bundle/web-app/cordis.patch.yml`.)
5. **Debug browser**: DevTools against `http://127.0.0.1:3080`.
6. **Debug Node**: run `dsh` under `node --inspect` (or `NODE_OPTIONS=--inspect`), attach Chrome DevTools.
7. **Diagnose composition without booting**: `dsh --profile web --dump-config` (with user layer) / `--dump-default-config` (bundle layers only) — `apps/cli/src/args.ts`, `packages/boot/app-boot/src/profile.ts`.
8. **Logging**: standard `console` in the dsh process; client logs in DevTools.

---

## 17. Testing Workflow

- Unit: `vitest run` per package (`dsh-plugin/dsh-auth-gate` uses `vitest`, `jsdom` for client; `dsh-plugin/dsh-mcp-panel` same). Keep `src/auth-core/` and `src/domain/` DSH-free so they test without a loader.
- Integration (node half): use `@deepseek-ai/cordis-plugin-include` + `@deepseek-ai/cordis-plugin-loader` + a minimal `@deepseek-ai/dsh-tools` registry to compose the plugin's own `cordis.patch.yml` and assert the tool is registered (this is exactly how `dsh-plugin/dsh-pcb-parts-search` and the in-box `tool-todo` package are tested: `packages/todo/tool-todo` devDeps include the loader/include/tools).
- Client: component tests with `@testing-library/react` + `jsdom`, mock the `slots`/`connection` services (`packages/client/ui-tool/tests/*.client.spec.tsx`).
- E2E: boot `dsh --profile web` with a test profile and drive the web UI (`packages/bundle/web-app/tests/*`, `apps/cli/tests/built-bin.e2e.ts`).
- Auth: unit-test the message envelope + origin guard; fingerprint/token restore as pure functions; iframe flow needs a live/manual test (`Needs confirmation`).

---

## 18. npm Publishing Workflow

Verified conventions from the community plugins (`dsh-plugin/dsh-auth-gate`, `dsh-plugin/dsh-mcp-panel`) and the in-box packages (`packages/client/ui-tool/package.json`):

- **Package manager**: npm or pnpm both work (dsh-auth-gate uses npm, mcp-panel npm; harness uses pnpm). Use pnpm in the workspace, publish with npm/pnpm `publish`.
- **Manifest**:
  - `"type": "module"`, `"main": "lib/index.js"`, `"types": "lib/types/index.d.ts"`.
  - `exports` map with `"."`, `"./client"`, `"./cordis.patch.yml"`, `"./package.json"`.
  - `"dsh": { "bundle": { "patch": "./cordis.patch.yml" }, "client": { "platform": "web", "inject": [...] } }`.
  - `"files": ["lib", "src", "cordis.patch.yml"]` — **`cordis.patch.yml` MUST be in `files`** or installs break.
  - `"publishConfig": { "access": "public" }` for unscoped/scoped-public packages.
  - peerDependencies on `@deepseek-ai/cordis` `^4.0.1` and DSH runtime packages with ranges like `>=0.1.0-rc.0 <0.2.0` (from `dsh-plugin/dsh-mcp-panel`).
- **Build**: `tsdown` produces `lib/index.js` + `lib/client.js` + types; `tsc` emits `lib/types`. `prepack: npm run build`.
- **Versioning**: semver; the DSH ecosystem uses `0.x.y` / `0.1.1-rc.x` pre-release tags for the RC era. Recommend matching `@deepseek-ai` peer ranges (Cordis 4.x stable, dsh-tools RC).
- **Native deps**: none for these plugins; git-hosted deps build via `prepare` (pnpm blocks until allowlisted — `apps/cli/src/plugin.ts`).
- **Provenance / CI**: no harness-required provenance; can add `npm provenance` + a GitHub Actions publish workflow later (not observed in the local plugins).

Recommended exact flow:

```text
pnpm install
pnpm --filter @huaqiu/dsh-auth test && pnpm --filter @huaqiu/dsh-pcb-eda test
pnpm --filter @huaqiu/dsh-auth build && pnpm --filter @huaqiu/dsh-pcb-eda build
pnpm --filter @huaqiu/dsh-auth publish --access public
pnpm --filter @huaqiu/dsh-pcb-eda publish --access public
```

---

## 19. DSH Installation Workflow

Verified against `deepseek-harness/apps/cli/src/plugin.ts` + `args.ts` (the command is a thin pnpm forwarder; the reconcile step adds any dependency declaring `dsh.bundle` to `dsh.profile.bundles`):

```text
# local development (relative paths anchored to your cwd; file:/link: preserved)
dsh plugin --profile web add /Users/admin/code/dsh-pcb-eda/packages/dsh-pcb-eda
dsh plugin --profile web add /Users/admin/code/dsh-pcb-eda/packages/dsh-auth

# npm (published packages)
dsh plugin --profile web add @huaqiu/dsh-auth @huaqiu/dsh-pcb-eda

# GitHub (pnpm git protocol; prepare script must build; allowlisted in profile pnpm-workspace.yaml)
dsh plugin --profile web add github:Huaqiu-Electronics/dsh-pcb-eda
```

Notes:
- `dsh plugin --profile <name> add <pkg>` forwards verbatim to `pnpm add` inside the profile dir (`$DSH_HOME/profiles/<name>`, initialized on first use with `PROFILE_TEMPLATES`).
- After a successful add, `reconcilePlugins` appends the package to `dsh.profile.bundles` iff it declares `dsh.bundle.patch`; otherwise it warns "declares no dsh.bundle — installed as a plain dependency".
- Removing: `dsh plugin --profile web remove <pkg>`.
- Git-hosted plugins build on install via their `prepare` script, which pnpm blocks until the exact key is added under `allowBuilds` in the profile's `pnpm-workspace.yaml` (`apps/cli/src/plugin.ts` error message).
- The profile pnpm settings written by `initProfile` use `nodeLinker: hoisted`, `autoInstallPeers: false` (`profile.ts`).

---

## 20. GitHub Distribution Workflow

- GitHub + npm: the repo publishes both packages to npm (§18); GitHub is a source distribution channel.
- The awesome list is the discovery channel: `awesome-dsh-plugin/` has `contributing.md` + a push script (`PUSH-AND-PR.sh`) for adding a plugin entry (name, category, description). Category should be something like `eda`/`design`/`browser` (existing categories include `browser`, etc.).
- `dsh plugin add github:Huaqiu-Electronics/dsh-pcb-eda` works via pnpm's git protocol; the package's `prepare`/`prepack` must build so the installed tree contains `lib/` + `cordis.patch.yml` (the loader resolves the package from the profile's node_modules after pnpm builds it).
- Recommend: tag releases (`vX.Y.Z`), keep `cordis.patch.yml` at the package root, and keep `files` minimal (lib + patch).

---

## 21. UI / HIT Strategy

Recommendations grounded in §8:

- **Part search**: `huaqiu_search_parts` toolview card — result list → click-to-select a part (local state only), then the model proceeds. Reuse the `ToolRow`-style chrome concept from `packages/client/ui-tool`.
- **Footprint generation**: `huaqiu_generate_footprint` toolview card = interactive dimension editor + live SVG package preview + validation, Confirm/Cancel only (the exact pattern already built and verified in hq-edge `symbol-footprint/lib/client.js`; port it, replacing `hqEdge` with `huaqiuAuth` and the image/WS tool with `huaqiu_generate_footprint`).
- **Symbol generation**: `huaqiu_generate_symbol` toolview card — pin table + symbol preview + generate.
- **Schematic generation**: `huaqiu_generate_schematic` toolview card — result summary + **iframe to `viewer.eda.cn/?zip-url=...`** for the rendered project (the viewer iframe format is `viewer.eda.cn/?zip-url=<encoded>&app=<page>`, verified in `hq-eda-ai/apps/web/src/lib/modular_circuit/utils/fmt_ecad_viewer_iframe_url.ts`). The zip URL can be a localhost-fetchable artifact URL; the viewer renders it client-side.
- **ERC**: `huaqiu_run_erc` toolview card — findings list → detail → evidence → schematic location → suggested fix (expandable rows).
- Keep all interactions **local-first** (edit/validate/drag without model round-trips); only Confirm/Cancel go back to the agent — the dsh-genui rule and the hq-edge footprint implementation both follow this.

---

## 22. Future EDA Capabilities

The architecture in §12–§13 supports all of:

```text
Huaqiu Part Search → Datasheet → Symbol Generation → Footprint Generation → Schematic Generation
Schematic → Datasheet-based ERC
```

Implementation notes per capability (how it maps onto the mechanism):

| Tool | Node impl | Browser card |
|---|---|---|
| `huaqiu_search_parts` | POST `www.eda.cn/api/chiplet/products/queryPage` (public; `dsh-pcb-parts-search` is a ready reference) | `tool.call.huaqiu_search_parts` card (list → select) |
| `huaqiu_get_part` | part detail by `mpn`+`manufacturer_id` (`Needs confirmation` exact endpoint) | detail card |
| `huaqiu_get_datasheet` | datasheet URL → text/PDF extraction (`Needs confirmation` extraction service) | datasheet card |
| `huaqiu_generate_symbol` | componentV2 WS (`?token=`) or Huaqiu symbol service | symbol pin-table card |
| `huaqiu_generate_footprint` | dimension-confirm → footprint service | dimension editor card (port hq-edge footprint client) |
| `huaqiu_generate_schematic` | CopilotKit/system-design + zip (`gen.eda.cn/api/...`, `schematic-gen` reference) | summary card + viewer.eda.cn iframe |
| `huaqiu_run_erc` | ERC service over generated schematic | findings card |

Artifacts (downloadable zips/previews) flow through DSH's standard produced-files rendering (`ui-deliverables`) and the viewer iframe.

---

## 23. Risks and Open Questions

- **auth.eda.cn parent-origin policy — RESOLVED (confirmed from its source `/Users/admin/code/eda-cn-login`)**. The iframe does **not** validate its parent: it posts the login result to `window.parent` with `targetOrigin: "*"` (`lib/kicadTools.ts` `firePassiveAction`) and ships **no** `X-Frame-Options` / CSP `frame-ancestors` / middleware (`next.config.js` only sets `Cache-Control`). So embedding `https://auth.eda.cn/` from DSH at `127.0.0.1:3080` works from the auth side. The flip side: the trust boundary is 100% on the host — the plugin must check `event.origin === 'https://auth.eda.cn'` on every message (spoofed/sibling-frame defense) and should never treat auth.eda.cn as gating who embeds it. (Remaining infra-level `Needs confirmation`: headers set at the `auth.eda.cn` deployment layer, e.g. Cloudflare/Nginx — but cross-origin iframe embedding is already proven in production by web-vue, pdfVerification, and hq-eda-ai.)
- **Cross-face token push RPC** (`Needs confirmation`): exact shape for the browser half to push the token to the node half (host `api-gateway` Remote vs a custom host service). Prototype before committing the auth service API.
- **Third-party cookie / SameSite**: **resolved by design** — the auth session cookies live entirely inside the `auth.eda.cn` iframe's own context (SSO via `passport.huaqiu.com`, then `auth.eda.cn/api/middleware/*` with `credentials:'include'`); the host never touches cookies, it only receives the token via postMessage and uses `X-Token`/`?token=`.
- **`handle_auth` producer** (`Needs confirmation`): who calls `window.handle_auth` — needed only if we also support the desktop/webview bridge, which a pure DSH-web plugin does not require.
- **componentV2 protocol details** (exact frames/commands for each generation tool) are only partially in the local source; the hq-edge plugins (`symbol-footprint`, `schematic-gen`) are the working references to port.
- **Part detail / datasheet / ERC REST endpoints** (`Needs confirmation`): not present in the local repos; must be discovered from Huaqiu's services or NextChat (`/Users/admin/code/NextChat`). Note `auth.eda.cn`'s own `complete_login`/`getUserInfo` routes confirm `www.eda.cn/api/chiplet/user/login` and `www.eda.cn/api/chiplet/u/base/get` (both `X-token`, code 200000).
- **README correction**: the repo README currently claims an HQ Edge connection — update in the implementation task (§15).
- **npm peer ranges**: DSH runtime packages are pre-1.0 (`0.1.1-rc.2`); pin compatible ranges and re-verify when DSH bumps.
- **Hot reload for out-of-tree client plugins** (`Needs confirmation`): whether `client-hmr`/`dev-web` picks up an external package's `lib/client.js` rewrite or whether a `dsh web` restart is needed.

---

## 24. Recommended Implementation Plan

Phase 0 — repo scaffolding (this research is the input):
1. Create the workspace (`packages/dsh-auth`, `packages/dsh-pcb-eda`), tsconfigs, tsdown configs, vitest, CI; publish `@huaqiu/dsh-auth` stub + `@huaqiu/dsh-pcb-eda` stub with `dsh.bundle` + `dsh.client` and an empty `cordis.patch.yml`; verify `dsh plugin --profile web add <local path>` reconciles the bundle (dump `--dump-config`).

Phase 1 — auth plugin (`@huaqiu/dsh-auth`):
2. Port `LoginDialog` (iframe + origin check + message envelope) from `hq-eda-ai`; port token/localStorage + fingerprint silent login; extract pure `auth-core` (cache, expiry, state).
3. Implement node twin service `huaqiuAuth` (`getAccessToken`, `isAuthenticated`, `login`, `logout`, `onAuthStateChanged`, `api.request`); prototype the browser→node token push RPC; verify a node tool can read the token.

Phase 2 — pcb-eda core:
4. `huaqiu_search_parts` (port `dsh-pcb-parts-search` client) + `huaqiu_get_datasheet`; wire `huaqiuAuth.api`.
5. Port the footprint dimension-editor card and the componentV2 tool execution from `hq-edge/symbol-footprint` (replace `hqEdge` with `huaqiuAuth`); add `huaqiu_generate_footprint`, `huaqiu_generate_symbol`.
6. Port schematic/system-design from `hq-edge/schematic-gen`; add viewer.eda.cn iframe preview; `huaqiu_generate_schematic`.
7. ERC tool + findings card.

Phase 3 — packaging/distribution:
8. `pnpm build && test`, `publish --access public`, awesome-list entry, GitHub tags; verify clean-install on a stock DSH web profile.

---

## 25. Source References

### deepseek-harness (official DSH)
- `packages/boot/app-boot/src/profile.ts` — `DshBundleManifest`, `DshProfileManifest`, `loadProfile`, `composeEntries`, `initProfile`, `PROFILE_TEMPLATES`, `healProfilesModuleFallback`.
- `apps/cli/src/plugin.ts` — `runPlugin` (pnpm forwarder), `reconcilePlugins` (bundle auto-activation), `anchorPathSpec`.
- `apps/cli/src/args.ts` — `parseDshArgs`: `dsh web`, `dsh --profile`, `dsh plugin --profile`, `--dump-config`.
- `vendor/include/src/index.ts` — `applyEntryPatches`, `PatchOptions`, `entryListSchema`, `!!js` dialect.
- `vendor/loader` — `@deepseek-ai/cordis-plugin-loader` (`EntryOptions`).
- `packages/bundle/base/cordis.patch.yml`, `packages/bundle/web-app/cordis.patch.yml` — insert rows, browser roster, `ui-tool`, `modules`, `connection`, `api-gateway`, `webserver`, `web-runtime`, `ui-settings-plugins`, `ui-deliverables`.
- `packages/todo/tool-todo/src/index.ts` — `defineTool` node-side registration pattern.
- `packages/client/ui-tool/src/client/apply.ts` — slot registration, `tool.call.toolview` keyed slot.
- `packages/client/ui-tool/src/client/tool/toolviews/web-row.tsx` — per-tool keyed toolview registration.
- `packages/client/ui-tool/package.json`, `packages/client/connection/package.json` — `dsh.client` manifest, dual-face exports.
- `packages/client/connection/src/*` — node half (host) vs `src/client/*` (browser).
- `scripts/dev-web.ts` — watch loop (tsc → tsdown → vite), client-plugin discovery by `dsh.client.platform`.
- `package.json` — Node/pnpm/TS/tooling versions.

### dsh-plugin (collection)
- `awesome-dsh-plugin/data/plugins/*.yml` — 2379-entry metadata index (url/name/category/description).
- `dsh-pcb-parts-search/` — `package.json` (`dsh.bundle`, peer `cordis`/`dsh-tools`), `cordis.patch.yml`, `src/index.ts` (tool), `src/queryPage.ts` (`www.eda.cn/api/chiplet/products/queryPage`, code 200000).
- `dsh-auth-gate/` — dual-face auth plugin: `package.json` (`dsh.bundle` + `dsh.client`), `cordis.patch.yml`, build/publish scripts, `files`.
- `dsh-visualize/` — dual-face, `tsdown`, `exports["./client"]`, React cards.
- `dsh-mcp-panel/` — dual-face, published peer ranges.
- `dsh-bridge/`, `dsh-market/` — external-service + marketplace conventions.

### hq-eda-ai (Huaqiu auth + API)
- `apps/web/src/components/LoginDialog.tsx` — iframe URL, origin check, message envelope.
- `apps/web/src/lib/modular_circuit/context/UserInfoContext.tsx` — localStorage `token`/`userInfo`, login/logout, `handle_auth` states, 5-day rule, URL-token fallback.
- `apps/web/src/lib/api/fingerprint.ts` — `getUserRestUrl()` + bind/getToken, `credentials:'include'`, `X-Token`, code 200000.
- `apps/web/src/components/FingerprintSilentLoginBootstrap.tsx` — fingerprint silent login.
- `apps/web/src/lib/fingerprint/client.ts` — FingerprintJS visitor id.
- `apps/web/src/lib/kicad/kicadTools.ts` — `PA_WEB_HOST` bridge messages (`update_access_token`/`logout`/`launch_login_dialog`).
- `apps/web/src/lib/config/domain.ts` — base URL resolution (prod `www.eda.cn`, dev `fdatasheets.com`).
- `apps/web/src/lib/modular_circuit/utils/upload_design_block_zip.ts` — `www.eda.cn/openapi/datastream/upload`.
- `apps/web/src/lib/modular_circuit/utils/module_resolver.ts` — `ZIP_ORIGIN`, viewer iframe, module fetch.
- `apps/web/src/lib/modular_circuit/utils/fmt_ecad_viewer_iframe_url.ts` — `viewer.eda.cn/?zip-url=...&app=...`.
- `apps/web/src/lib/api/auth.ts`, `lib/middleware/api_client.ts`, `lib/middleware/agent_server.ts` — header/backend conventions (not reusable, context only).

### eda-cn-login (auth.eda.cn itself — confirms the auth protocol end-to-end)
- `lib/kicadTools.ts` — `firePassiveAction`: posts to `window.eda_host` (webview) and `window.parent.postMessage(..., "*")` (**no parent-origin restriction**); `loginSuccessNotifyKicad` → `{category:1, data:{type:'update_access_token', data}}`, `loginOutNotifyKicad` → `{type:'logout'}`, `closeDialogNotifyKicad` → `{type:'close_dialog'}`.
- `app/page.tsx` — reads URL params `fill=full` (webview mode) + `clickOutsideToClose=true`; `handleLoginSuccess` sends `{ userId, expires_at: now+5d, agreeCollectIP:false, ...userInfo }` (5-day expiry, token inside `userInfo.token`); sets `data-iframe-mode` for transparent iframe background.
- `components/LoginDialog.tsx` — responsive dialog (WeChat QR desktop + phone SMS), Radix Dialog.
- `lib/api/auth.ts` — SSO endpoints at `passport.huaqiu.com` (`register/regsms`, `smsLogin/index.html`, `wechat/qrlogin`, `wechat/qrconnect`); `completeLogin`/`fetchUserInfo` via local `/api/middleware/*`.
- `app/api/middleware/complete_login/route.ts`, `getUserInfo/route.ts` — server-side proxy: `www.eda.cn/api/chiplet/user/login` (GET, `X-token`, `credentials:'include'`) + `www.eda.cn/api/chiplet/u/base/get` (POST, `X-token`, `code===200000`).
- `lib/config/domain.ts` — `baseURL` prod `https://www.eda.cn`, dev `http://www.fdatasheets.com`, SSO `https://passport.huaqiu.com`.
- `next.config.js` — only `Cache-Control` headers; **no `X-Frame-Options` / CSP `frame-ancestors`** (embeddable). `task.md` — migration notes: iframe (not routing) from a different domain, close-by-outside flag, `fill=full` for webview.

### hq-edge (comparison only)
- `apps/server/dsh-plugins/symbol-footprint/lib/index.js` — componentV2 WS (`wss://www.eda.cn/componentV2/chat/<ch>?token=`), `token-expired`, `inject ['hqEdge','tools']`, `resolveToken`.
- `apps/server/dsh-plugins/edge-bridge/lib/client.js` — `ctx.provide('hqEdge', ...)` service precedent (auth/api/project/workspace).
- `apps/server/dsh-plugins/schematic-gen/lib/index.js` — `gen.eda.cn/api/copilotkit`, export-zip, Referer.
- `apps/server/dsh-plugins/*/package.json` — private plugins bundled via `dist:edge-headless` (NOT the standalone pattern to copy).
