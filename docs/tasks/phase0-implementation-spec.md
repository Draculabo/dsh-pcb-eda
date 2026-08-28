# Phase 0 Implementation Task Spec — `@huaqiu/dsh-*` workspace foundation

Status: **APPROVED WITH MINOR CHANGES** (per `docs/tasks/start-p0.md`) — implementation may start
Owner: dsh-pcb-eda
References: `docs/research/migrate-hq-edge-plugins.md` (§10 phase ordering, review #7/#20), `docs/research/dsh-pcb-eda.md` (§23 auth RPC), `docs/tasks/start-p0.md` (delivery-first review — incorporated below).

This spec fixes every architectural decision an implementer would otherwise have to make implicitly while scaffolding the five packages: exact manifests, `cordis.patch.yml` rows, service IDs, route IDs, service contracts, and the stock-DSH verification commands. It covers the whole Phase 0 group: **Phase 0 (foundation) + Phase 0A (auth POC) + Phase 0B (artifacts)**.

> **Guiding principle (start-p0.md §1): Phase 0 proves the architecture works. It does not build production infrastructure that Phase 1–4 might later invalidate.**

## 0. Scope

Build the workspace and **prove the two novel/risky mechanisms before any tool depends on them**:

- Phase 0: pnpm workspace, build/test toolchain, 5 thin skeleton packages with exact manifests + patches, stock-DSH install smoke test.
- Phase 0A: browser↔node auth token propagation POC (the one genuinely novel piece).
- Phase 0B: `@huaqiu/dsh-artifacts` service + `webServer` adapter (proves the HTTP-route-mount mechanism).

Out of scope: part-search / symbol-footprint / schematic-gen tool logic (Phases 1–4), publishing (Phase 5), ECAD renderer bundling (Phase 3/4).

**Hard constraints** (from migration plan §1 + start-p0.md):
- Zero `@hqedge/*` in any `package.json` or generated bundle (CI-guarded).
- Node tools use `huaqiuArtifacts` **in-process only** — no HTTP loopback (review #2).
- Route namespace is plugin-owned: `/api/v1/huaqiu/artifacts` (review #3).
- **No publish** in Phase 0: package versions stay `0.0.0`, `publishConfig` present, CI never runs `pnpm publish` (start-p0.md §18).

---

## 1. Deliverables

| # | Deliverable | Phase | Exit criterion |
|---|---|---|---|
| D1 | pnpm workspace `dsh-pcb-eda` with 5 **thin** skeleton packages, all green `pnpm -r test && pnpm -r build` | 0 | CI passes |
| D2 | Stock-DSH install smoke test of a skeleton tool plugin (probe registers in the tool registry) | 0 | boots + `--dump-config` shows the row + tool present (manual/integration step, not CI) |
| D3 | Auth POC (browser↔node token flow): 4 grouped behaviors + wrong-origin test | 0A | all green |
| D4 | `@huaqiu/dsh-artifacts` service + `webServer` adapter + hardening tests | 0B | unit + route tests green |
| D5 | Tiny workspace README + per-package one-liner READMEs | 0 | rendered |

**Skeleton thickness (start-p0.md §2/#16)**: tool packages are extremely thin — `package.json` + `cordis.patch.yml` + `src/index.ts` + `test/index.test.ts` (+ `src/client/index.tsx` stub for dual-face ones). Client stubs only prove the bundle builds and exports the right shape (`export const inject = [...]; export function apply(ctx) {}`). **No React components.** The one exception: `dsh-auth`'s real minimal auth iframe/UI (it IS the POC).

---

## 2. Workspace layout & toolchain

```text
dsh-pcb-eda/
├── package.json                    # private root, "packageManager": "pnpm@..."
├── pnpm-workspace.yaml             # packages: ["packages/*"]
├── tsconfig.base.json              # strict, moduleResolution bundler, jsx react-jsx, target es2022
├── vitest.config.ts                # node + jsdom projects
├── .github/workflows/ci.yml        # lint → test → build → @hqedge guards → pack dry-run
└── packages/
    ├── dsh-auth/                   # @huaqiu/dsh-auth            (dual-face: node + client)
    ├── dsh-artifacts/              # @huaqiu/dsh-artifacts       (node-only + webServer adapter)
    ├── dsh-tool-part-search/       # @huaqiu/dsh-tool-part-search     (node-only)
    ├── dsh-tool-symbol-footprint/  # @huaqiu/dsh-tool-symbol-footprint (dual-face)
    └── dsh-tool-schematic-gen/     # @huaqiu/dsh-tool-schematic-gen   (dual-face)
```

Toolchain (community convention — matches `dsh-visualize` / `dsh-auth-gate`):
- **Build**: `tsdown` → `lib/index.js` (node) + `lib/client.js` (browser bundle; only when the package has a `dsh.client` half) + `lib/types/*.d.ts` via `tsc -p tsconfig.build.json`.
- **Test**: `vitest` — node tests (real node), client tests (jsdom + `@testing-library/react`).
- **Lint**: `tsc --noEmit --strict` + `eslint` (optional at first; `tsc --noEmit` is the gate).
- **Release**: `prepack: build`; publish via `pnpm publish --access public`.

Per-package source skeleton (Phase 0 only — no tool logic):

```text
packages/<pkg>/
├── package.json
├── cordis.patch.yml            # node row (bundle patch)
├── tsconfig.json               # extends ../../tsconfig.base.json
├── tsconfig.build.json         # emit types → lib/types
├── tsdown.config.ts            # entry index.ts (+ client.ts when dual-face)
├── src/
│   ├── index.ts                # node half: name/inject/apply (+ provide service for service packages)
│   └── (client/index.tsx)      # browser half stub — ONLY dsh-auth (real) + dual-face tools (empty stubs)
└── test/
    └── index.test.ts           # node-half smoke: plugin shape, apply() runs, no @hqedge import
```

---

## 3. Package manifests (exact)

All five share the same skeleton with per-package differences. Values are the community-verified shapes (`dsh-visualize`, `dsh-auth-gate`, in-box `ui-tool`).

### 3.1 `@huaqiu/dsh-auth` (dual-face service provider)

```jsonc
{
  "name": "@huaqiu/dsh-auth",
  "version": "0.0.0",
  "type": "module",
  "main": "./lib/index.js",
  "types": "./lib/types/index.d.ts",
  "exports": {
    ".": { "types": "./lib/types/index.d.ts", "default": "./lib/index.js" },
    "./client": { "types": "./lib/types/client.d.ts", "default": "./lib/client.js" },
    "./cordis.patch.yml": "./cordis.patch.yml",
    "./package.json": "./package.json"
  },
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": { "platform": "web", "inject": [
      "@deepseek-ai/dsh-client-runtime",
      "@deepseek-ai/dsh-client-connection"   // browser→host RPC wire for the token push
    ] }
  },
  "peerDependencies": {
    "@deepseek-ai/cordis": "^4.0.1",
    "@deepseek-ai/dsh-client-runtime": "*",
    "@deepseek-ai/dsh-client-connection": "*"
    // NOTE (start-p0.md §3): NO speculative @deepseek-ai/dsh-host-* peers yet.
    // The browser→node RPC mechanism is discovered in Phase 0A; only the
    // dependency the POC actually uses is added then.
  },
  "dependencies": {},
  "files": ["lib", "src", "cordis.patch.yml"],
  "scripts": {
    "build": "tsdown && tsc -p tsconfig.build.json",
    "test": "vitest run",
    "prepack": "pnpm build"
  },
  "publishConfig": { "access": "public" }
}
```

### 3.2 `@huaqiu/dsh-artifacts` (node-only service + webServer adapter)

```jsonc
{
  "name": "@huaqiu/dsh-artifacts",
  "version": "0.0.0",
  "type": "module",
  "main": "./lib/index.js",
  "types": "./lib/types/index.d.ts",
  "exports": {
    ".": { "types": "./lib/types/index.d.ts", "default": "./lib/index.js" },
    "./cordis.patch.yml": "./cordis.patch.yml",
    "./package.json": "./package.json"
  },
  "dsh": { "bundle": { "patch": "./cordis.patch.yml" } },
  "peerDependencies": {
    "@deepseek-ai/cordis": "^4.0.1",
    "@deepseek-ai/dsh-host-webserver": "*",   // node:http route registry
    "@deepseek-ai/dsh-home-paths": "*"        // dshHomePath('artifacts')
  },
  "dependencies": {},
  "files": ["lib", "src", "cordis.patch.yml"],
  "scripts": {
    "build": "tsdown && tsc -p tsconfig.build.json",
    "test": "vitest run",
    "prepack": "pnpm build"
  },
  "publishConfig": { "access": "public" }
}
```

### 3.3 `@huaqiu/dsh-tool-part-search` (node-only tool)

```jsonc
{
  "name": "@huaqiu/dsh-tool-part-search",
  "version": "0.0.0",
  "type": "module",
  "main": "./lib/index.js",
  "types": "./lib/types/index.d.ts",
  "exports": {
    ".": { "types": "./lib/types/index.d.ts", "default": "./lib/index.js" },
    "./cordis.patch.yml": "./cordis.patch.yml",
    "./package.json": "./package.json"
  },
  "dsh": { "bundle": { "patch": "./cordis.patch.yml" } },
  "peerDependencies": { "@deepseek-ai/cordis": "^4.0.1", "@deepseek-ai/dsh-tools": ">=0.1.0-rc.8 <0.2.0" },
  "dependencies": { "@huaqiu/part-search": "^1.0.0" },   // plain library, NOT peer
  "files": ["lib", "src", "cordis.patch.yml"],
  "scripts": { "build": "tsdown && tsc -p tsconfig.build.json", "test": "vitest run", "prepack": "pnpm build" },
  "publishConfig": { "access": "public" }
}
```

### 3.4 `@huaqiu/dsh-tool-symbol-footprint` (dual-face tool)

Same as 3.3 plus:
```jsonc
  "exports": { "...": { }, "./client": { "types": "./lib/types/client.d.ts", "default": "./lib/client.js" } },
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": { "platform": "web", "inject": [
      "@deepseek-ai/dsh-client-runtime",      // provides `slots` + `sessions`
      "@deepseek-ai/dsh-client-ui-slots",     // slot registry for keyed toolview
      "@deepseek-ai/dsh-client-locale",       // zh/en
      "@huaqiu/dsh-auth"                      // login button on token-expired
    ] }
  },
  "peerDependencies": {
    "@deepseek-ai/cordis": "^4.0.1",
    "@deepseek-ai/dsh-tools": ">=0.1.0-rc.8 <0.2.0",
    "@deepseek-ai/dsh-client-runtime": "*",
    "@deepseek-ai/dsh-client-ui-slots": "*",
    "@deepseek-ai/dsh-client-locale": "*",
    "@deepseek-ai/dsh-user-questions": "*",   // declared HIL service (review #4)
    "@huaqiu/dsh-auth": "^1.0.0",
    "@huaqiu/dsh-artifacts": "^1.0.0",
    "react": "^18"
  },
  "devDependencies": { "@huaqiu/ecad-renderer": "^0.2.4" }   // bundled into client.js (Phase 3)
```

### 3.5 `@huaqiu/dsh-tool-schematic-gen` (dual-face tool)

Same shape as 3.4 (peer `@huaqiu/dsh-auth`, `@huaqiu/dsh-artifacts`, client runtime packages, react); no `userQuestions` peer; no ecad-renderer yet (bundled in Phase 4).

> **Note on `@deepseek-ai/dsh-user-questions`**: verify the exact package name during Phase 0 against `packages/interaction/user-questions` — the service is in-box (`userQuestions`), and the peer row must name the providing package. Adjust if the provider is a different package.

---

## 4. `cordis.patch.yml` rows (exact)

Bundle-patch format confirmed from `dsh-auth-gate` / `dsh-visualize` / `dsh-pcb-parts-search` (`- insert:` rows; `dsh plugin --profile web add <pkg>` auto-reconciles `dsh.profile.bundles` for packages declaring `dsh.bundle`).

```yaml
# packages/dsh-auth/cordis.patch.yml
- insert:
    - id: huaqiu-auth
      name: '@huaqiu/dsh-auth'
```

```yaml
# packages/dsh-artifacts/cordis.patch.yml
- insert:
    - id: huaqiu-artifacts
      name: '@huaqiu/dsh-artifacts'
      inject: ['webServer']        # node:http route registry (@deepseek-ai/dsh-host-webserver)
```

```yaml
# packages/dsh-tool-part-search/cordis.patch.yml
- insert:
    - id: huaqiu-tool-part-search
      name: '@huaqiu/dsh-tool-part-search'
      inject: ['tools']
```

```yaml
# packages/dsh-tool-symbol-footprint/cordis.patch.yml
- insert:
    - id: huaqiu-tool-symbol-footprint
      name: '@huaqiu/dsh-tool-symbol-footprint'
      inject: ['tools', 'huaqiuAuth', 'huaqiuArtifacts', 'userQuestions']
```

```yaml
# packages/dsh-tool-schematic-gen/cordis.patch.yml
- insert:
    - id: huaqiu-tool-schematic-gen
      name: '@huaqiu/dsh-tool-schematic-gen'
      inject: ['tools', 'huaqiuAuth', 'huaqiuArtifacts']
```

---

## 5. Service IDs & route IDs (contract table)

| Kind | ID | Provider | Consumers |
|---|---|---|---|
| Service (node + client) | `huaqiuAuth` | `@huaqiu/dsh-auth` | symbol-footprint node/client, schematic-gen node |
| Service (node only) | `huaqiuArtifacts` | `@huaqiu/dsh-artifacts` | symbol-footprint node, schematic-gen node |
| HTTP route (exact) | `GET /api/v1/huaqiu/artifacts/:id` | `@huaqiu/dsh-artifacts` routes.ts | browser client (meta) |
| HTTP route (exact) | `GET /api/v1/huaqiu/artifacts/:id/content` | `@huaqiu/dsh-artifacts` routes.ts | browser client (content) |
| Client slot | `tool.call.toolview` (keyed per tool name) | dual-face tool clients | DSH UI |

**Route rules** (review #3): plugin-owned namespace `/api/v1/huaqiu/artifacts`; `webServer.register({kind:'exact', path, handler})` for both; returns disposers; duplicate `(kind,path)` must throw → test that a second registration of the same path throws.

---

## 6. Service contracts (exact TS, to be implemented in Phase 0A/0B)

### 6.1 `HuaqiuAuthService` — auth is a capability, not token transport (review #5)

```ts
export interface HuaqiuAuthService {
  auth: {
    isAuthenticated(): boolean;
    getAccessToken(): Promise<string | null>;            // componentV2 WS ?token=
    getUserInfo(): Promise<{ id: string; token: string; nickname?: string } | null>;  // gen.eda.cn x-user-id/x-user-token
    login(): Promise<void>;                              // client half: open auth.eda.cn iframe
    logout(): Promise<void>;
    onAuthStateChanged(l: () => void): () => void;
  };
}
// Contract note: getAccessToken() and getUserInfo().token are NOT promised to be
// the same credential. Each backend adapter maps its own value (§6 of migration plan).
```

Node half (`src/index.ts`): `export const inject = ['webServer']` *(only if a route is needed)*; `ctx.provide('huaqiuAuth', {...})` from an in-memory token cache; `ctx.on('dispose', ...)` clears state.
Client half (`src/client/index.tsx`): `exports.inject = ['@deepseek-ai/dsh-client-runtime', '@deepseek-ai/dsh-client-connection']`; owns the iframe + postMessage + localStorage; pushes token state to the node half over the browser→host RPC (Phase 0A pins the shape).

### 6.2 `HuaqiuArtifacts` (review #2 — service is the unit of truth; HTTP is an adapter)

```ts
export interface HuaqiuArtifacts {
  create(opts: { type: string; filename: string; content: string | Uint8Array;   // Buffer passes naturally (extends Uint8Array)
                 contentEncoding?: 'utf8' | 'base64'; ttlSeconds?: number })
    : Promise<{ id: string; type: string; filename: string; size: number }>;
  get(id: string): Promise<ArtifactMeta | null>;
  readContent(id: string): Promise<Uint8Array>;   // enough for preview artifacts (start-p0.md §7/#8 — no openStream yet)
  delete(id: string): Promise<void>;
  deleteAll(opts?: { onlyExpired?: boolean }): Promise<number>;
}
```

Node half: `export const inject = ['webServer']`; `ctx.provide('huaqiuArtifacts', service)`; register the two routes in `apply()`. `src/service.ts` ports `hq-edge/apps/server/src/artifacts/dsh-preview-artifacts.service.ts` and adds hardening (below).

---

## 7. Phase 0A — auth token-propagation POC

**Goal**: prove the browser→node credential flow end-to-end before building the full auth UI or any tool. Deliverable D3.

Flow under test:

```text
browser
   │  login iframe
   ▼
auth.eda.cn
   │  postMessage (event.origin === 'https://auth.eda.cn' — STRICT check)
   ▼
dsh-auth client (localStorage token/userInfo)
   │  browser→host RPC (dsh-client-connection ClientConnectionRpc / host apiProxy dispatch)
   ▼
dsh-auth node (in-memory cache)
   │
   ▼
huaqiuAuth.auth.getAccessToken() / getUserInfo()   ← consumed by a probe tool
```

**Implementer's task #1 (the actual unknown)**: **inspect the actual public extension point and implement the smallest supported browser→host message path, then freeze it** (start-p0.md §4). Do NOT write the implementation as though `apiProxy` is the expected answer. Research order only:
1. A custom host RPC handler registered on the `apiProxy` service (`@deepseek-ai/dsh-host-apiproxy`, service id `apiProxy`) — mirrors how `userQuestions.registerProvider(...)` plugs a provider into the host dispatch (see `packages/host/apiproxy/src/api-proxy.ts`).
2. A plugin-owned `webServer` route as a fallback channel if the dispatch face rejects plugin handlers.
3. `dsh-client-connection`'s exported `ClientConnectionRpc`/`HostApi` wire, if a public extension point exists.

Acceptance criterion is the **behavior** (browser → public DSH mechanism → node → `huaqiuAuth`), not which mechanism wins.

**Acceptance tests (grouped — start-p0.md §5)**: four essential behaviors + the security test. T1–T8 below are the implementation checklist; do not build eight layers of test infrastructure around them.

| Group | Scenario | Pass criterion | Checklist |
|---|---|---|---|
| A. Login propagation | login/message | client state → node state → `getAccessToken()`/`getUserInfo()` | T1 iframe opens + origin check passes; T2 localStorage cached; T3 node receives; T4 tool reads token |
| B. Update | new token | replaces old node state | T7 second login overwrites node cache |
| C. Logout | logout | client cleared + node cleared | T5/T6 node `getAccessToken()` → `null` |
| D. Reload | reload | existing local state restored | T8 fingerprint silent login restores (localStorage path) |
| — Security | wrong origin | postMessage from non-`auth.eda.cn` origin is ignored | negative test |

---

## 8. Phase 0B — artifacts service + `webServer` adapter

**Goal**: deliver `@huaqiu/dsh-artifacts` (D4) and prove the route-mount mechanism (mirrors the `edge-bridge` `/hq-edge` precedent).

**Service (`src/service.ts`)**: port `DshPreviewArtifactService` (fs + `meta.json` per artifact dir under `<baseDir>/dsh-artifacts/<id>/`; atomic tmp+rename; TTL) **plus the scoped hardening** (start-p0.md §6 — MVP is a localhost preview cache, not a multi-user blob server):
- `id` validated `^art_[0-9a-f]+$` before any path use; non-matching → `null`/404.
- Path traversal prevention: `filename` never in the storage path — only in `meta.json` + `Content-Disposition`; no user input in paths beyond the validated id.
- Max artifact size (config; port the existing caps).
- Atomic write (tmp+rename; no partial file on failure).
- TTL expiry (`ttlSeconds` + `deleteAll({onlyExpired})`).
- Storage default `~/.dsh/artifacts/` via `dshHomePath('artifacts')`; config `{ baseDir }` override.
- **Deferred** (start-p0.md §6): symlink-safe `realpath` containment + elaborate metadata limits — revisit only if the implementation naturally exposes a risk.

**Routes (`src/routes.ts`)**: `GET /api/v1/huaqiu/artifacts/:id` (meta JSON) and `GET /:id/content` (via `readContent()`, `Content-Disposition: attachment; filename="<meta.filename>"`); 404 on missing/invalid id. Both registered with `ctx.webServer.register({ kind:'exact', path, handler })`, disposers returned.

**Tests** (unit + route):
- create → meta shape `{id,type,filename,size}`; content round-trips (utf8 + base64 + binary).
- get/readContent/delete/deleteAll(expired).
- id validation (invalid ids rejected, incl. `../`, absolute, non-hex).
- filename never affects storage path.
- max-size enforced; atomic write leaves no partial file on failure.
- route: 200 meta, 200 content (correct Content-Disposition), 404 unknown/invalid id, duplicate `(kind,path)` registration throws.
- disposal unregisters routes (subsequent request → 404/no handler).

---

## 9. Build & test configuration (exact)

`tsconfig.base.json`:

```jsonc
{
  "compilerOptions": {
    "target": "ES2022", "module": "ESNext", "moduleResolution": "Bundler",
    "strict": true, "jsx": "react-jsx", "esModuleInterop": true,
    "skipLibCheck": true, "declaration": true, "declarationDir": "lib/types",
    "types": ["node", "vitest/globals"]
  }
}
```

`tsdown.config.ts` (dual-face example) — **regexes fixed** (start-p0.md §10):

```ts
import { defineConfig } from 'tsdown'
export default defineConfig({
  entry: ['./src/index.ts', './src/client/index.tsx'],
  format: ['esm'],
  external: [
    /^react$/, /^react\//,
    /^@deepseek-ai\//,
  ],
  // NOTE: do NOT blindly externalize /^@huaqiu\/dsh-/ in Phase 0.
  // @huaqiu/dsh-auth & @huaqiu/dsh-artifacts are separate PLUGINS resolved
  // through DSH installation (peer). Ordinary libraries (e.g. @huaqiu/part-search)
  // are bundled or declared per runtime behavior. The exact externalization
  // policy is decided in Phase 3/4 when real client bundles exist.
  outDir: 'lib',
})
```

`vitest.config.ts` (root, **single** config — start-p0.md §11): use explicit environment annotations, no multi-project system yet:

```ts
import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: {
    // node is the default; client tests add `// @vitest-environment jsdom`
    // when React tests arrive (Phase 3). No projects split in Phase 0.
  },
})
```

`pnpm-workspace.yaml`:

```yaml
packages:
  - 'packages/*'
```

---

## 10. CI (`.github/workflows/ci.yml`) — simplified (start-p0.md §12/#14)

CI proves **build/test/package correctness + no HQ Edge**, nothing more. No formal lint job (typecheck covers it), no stock-DSH installation in CI (that is a manual/integration step until a published-package workflow exists).

```yaml
on: [push, pull_request]
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm -r typecheck
      - run: pnpm -r test
      - run: pnpm -r build
      # start-p0.md §13 — two explicit @hqedge guards (manifest/source + generated):
      - run: |
          if grep -R '"@hqedge/' packages/*/package.json packages/*/src 2>/dev/null; then
            echo "FAIL: @hqedge dependency/reference found"; exit 1
          fi
      - run: |
          if grep -R '@hqedge/' packages/*/lib 2>/dev/null; then
            echo "FAIL: @hqedge reference found in generated output"; exit 1
          fi
      - run: pnpm -r pack --dry-run    # release-readiness gate (files/peer warnings)
      # CI NEVER runs pnpm publish (start-p0.md §18).
```

---

## 11. Stock-DSH verification (manual/integration, NOT CI — start-p0.md §14/#15)

`dsh` CLI is **available on public npm** as `@deepseek-ai/dsh@0.1.1-rc.2` (resolved in
Phase 0; run via `npx` to avoid a global install). The smoke test remains a
manual/integration step (not CI), but was **executed and passed** in Phase 0 for a
node-only and a dual-face package. The strongest check (start-p0.md §15) is not just
`--dump-config` but that the probe **loads and registers**:

```bash
# Phase 0 — skeleton tool package: install → startup → tool row exists → tool registry has the probe
pnpm --filter @huaqiu/dsh-tool-part-search build && pnpm --filter @huaqiu/dsh-tool-part-search pack --dry-run
export DSH_HOME="$(pwd)/.smoke/dsh-home"     # scratch home; never touch the real one
npx --yes @deepseek-ai/dsh@0.1.1-rc.2 plugin --profile web add <path-to-tarball-or-dir>
npx --yes @deepseek-ai/dsh@0.1.1-rc.2 --profile web --dump-config | grep huaqiu  # row present + inject merged
# then start DSH web and confirm the probe tool is in the registry (e.g. via a session tool-call
# or the tool list in the UI). No real API invocation needed.

# Phase 0B — artifacts (when a DSH web profile is running with dsh-artifacts mounted)
curl -s http://127.0.0.1:3080/api/v1/huaqiu/artifacts/<id>            # 200 meta
curl -s http://127.0.0.1:3080/api/v1/huaqiu/artifacts/<id>/content    # 200 content

# Phase 0A — auth (manual browser check: dsh web, trigger login, observe groups A–D)
```

> Web server default bind is `127.0.0.1:3080` (confirmed from `web-app` bundle: `webserver` row `host: ctx.webStartup.host ?? '127.0.0.1'`, `port: 3080`). Artifact MVP trust model holds on `127.0.0.1` (review #15).

---

## 12. Definition of Done (start-p0.md §19 — reduced)

### Foundation
- [ ] pnpm workspace installs; five packages resolve
- [ ] all packages typecheck; all packages build
- [ ] skeleton package can be installed into stock DSH; `--dump-config` shows the plugin
- [ ] probe tool registers in the tool registry (manual/integration check)

### Auth
- [ ] auth iframe/message works; strict origin check
- [ ] client state → node state; `getAccessToken()` works; `getUserInfo()` works
- [ ] update replaces old credentials; logout invalidates node state; reload restores client state

### Artifacts
- [ ] create/read/delete works; UTF-8 / binary / base64 work
- [ ] size limit works; ID/path validation works; TTL cleanup works
- [ ] HTTP meta route works; HTTP content route works; route disposal works

### Architecture
- [ ] no `@hqedge/*` in package manifests; no `@hqedge/*` in generated bundles
- [ ] no HTTP loopback from node tools; artifact namespace is `/api/v1/huaqiu/artifacts`
- [ ] no demo credentials; no Phase 1–4 tool implementation
- [ ] no publish executed; package versions stay `0.0.0`

---

## 13. Open questions for the implementer (must be answered, then frozen)

1. **Exact browser→host RPC shape** for the auth token push (Phase 0A task #1): inspect the public extension point and pick the smallest supported path (`apiProxy` custom handler vs `ClientConnectionRpc` extension vs `webServer` fallback route). Document the call shape and freeze it. Do not add speculative `@deepseek-ai/dsh-host-*` peers until the chosen path is proven (§3.1).
2. ~~Provider package name for `userQuestions`~~ — **resolved in Phase 0**: `@deepseek-ai/dsh-user-questions` exists on npm (`0.1.1-rc.2`). Use it in §3.4 peer deps (symbol-footprint, Phase 2).
3. **DSH runtime peer range** — **resolved in Phase 0**: `@deepseek-ai/dsh-tools` published through `0.1.1-rc.2`; range `>=0.1.0-rc.8 <0.2.0` is satisfiable. `@deepseek-ai/cordis` is `4.0.1`. Confirmed live on the npm registry.
4. **`dsh plugin --profile web add <local path>` mechanics** for out-of-tree local packages (link vs tarball) — **resolved in Phase 0**: `@deepseek-ai/dsh@0.1.1-rc.2` on public npm provides the `dsh` CLI (via `npx`). `dsh plugin --profile web add <local dir>` links the package (`link:` in the profile project) and composes its `cordis.patch.yml` into the profile tree (verified for a node-only and a dual-face package — see §14).
5. **Dev loop for client plugins** (hot reload vs `dsh web` restart) — note in the workspace README; doesn't block Phase 0.

## 14. Phase 0 implementation notes (recorded at completion)

Gates all green on `node v24.18.0` / `pnpm 11.7.0`: typecheck 0 errors, 45 tests
pass across the five packages, build clean, `check:hqedge` passes (manifests +
src + lib), `pack --dry-run` produces valid tarballs for all packages. Stock-DSH
smoke passes: both a node-only (`@huaqiu/dsh-tool-part-search`) and a dual-face
(`@huaqiu/dsh-tool-schematic-gen`) package install into a scratch `web` profile
and compose their `inject` patch.

Reconciliation of the three implementation-vs-spec deviations (all now reflected
in the committed manifests; kept here so the doc stays the source of truth):

1. **`dsh-client-runtime` removed from peerDependencies** in all three tool
   packages. It is not installable from public npm (`dsh-compact` etc. are
   missing), and the client contract is the `dsh.client.inject` string, not the
   runtime package. The client runtime is supplied by the DSH profile host.
   §3.1/§3.4/§3.5 keep the `dsh.client.inject` row; the peer is gone.
2. **`@huaqiu/dsh-auth` / `@huaqiu/dsh-artifacts` peer versions are `^0.0.0`**
   (Phase 0 does not publish; workspace `devDependencies: workspace:*` satisfy
   them). At publish time (Phase ≥ 2) bump to the real `^0.1.0` range.
3. **`@huaqiu/part-search` dependency is `^0.2.0`** in the part-search manifest
   (npm latest 0.2.6); spec's suggested `^0.2.6` is a fine follow-up bump.

Build-time adjustments made during Phase 0 that change nothing in the contract:
- tsdown emits `.mjs`/`.d.mts`; manifests' `main`/`types`/`exports` point at
  `lib/*.mjs` + `lib/*.d.mts` (+ `lib/client/index.*` and `lib/service.*`).
- tsdown uses `deps.neverBundle` (the `external` option is deprecated).
- vitest: single root config, no `include` override (default globs work from both
  the workspace root and package dirs); client tests use per-file
  `// @vitest-environment jsdom`.
- cordis lifecycle: `apply` uses `ctx.effect(() => ctx.provide(...))` and
  `ctx.effect(() => ctx.webServer.register(...))` — `effect` takes a callback
  returning the disposer. `ctx.webServer` typing comes from importing
  `@deepseek-ai/dsh-host-webserver` (its `declare module` augmentation).

Post-boot verification fixes (2026-08-28, verified green on a real `dsh web` in
both an all-5-package scratch profile and the user's 3-package default profile):

4. **Client bundle must be a self-registering classic script, not ESM.** The DSH
   client-modules host loads `/plugins/<id>/client.js?rev=<sha1>…` as a classic
   `<script>` and asserts the bundle called
   `window.__ModuleLoader__.load({ id, factory })` with a CJS
   `module.exports` — an ESM `.mjs` bundle executes but does not register
   (error: `loaded without registering "<pkg>" via __ModuleLoader__.load`).
   Fix: the three dual-face `tsdown.config.ts` use a `defineConfig([…])` array —
   node half `esm`+`dts`, client half `format:'cjs'`, `platform:'browser'`,
   `entryFileNames:'client.js'`, `dts:false`, with
   `outputOptions.banner = window.__ModuleLoader__.load({ id: <json>, factory: (require) => {`,
   `intro = var module = { exports: {} }; var exports = module.exports;`,
   `footer = return module.exports; } });`. Manifests' `exports["./client"]`
   → `{ "default": "./lib/client.js" }` (no `types` — no `.d.ts` for the bundle).
5. **The client module's exported `inject` must be REAL service names, not
   package names.** The loader turns the module's `export const inject` into
   cordis `ctx.inject([…])` dependencies. Injecting the package
   `@deepseek-ai/dsh-client-runtime` (fine in `dsh.client.inject` for graph
   ordering) made the entry wait forever on a non-existent service
   (`pending (waiting for service: @deepseek-ai/dsh-client-runtime)` →
   `web boot: 1 entry did not activate`). Stock modules inject real services
   (`slots`, `theme`, `sessions`, …). Phase 0 clients consume no service →
   `export const inject: string[] = []`.
6. **Probe tool names must be unique across the tool packages.** All three
   Phase-0 skeletons registered `huaqiu_phase0_probe`, so installing more than
   one tool package failed the boot with
   `tool "huaqiu_phase0_probe" is already registered`. Renamed to
   `huaqiu_part_search_probe` / `huaqiu_symbol_footprint_probe` /
   `huaqiu_schematic_gen_probe` (sources, tests, READMEs).

---

## §15 Phase 1 — part-search plugin (`@huaqiu/dsh-tool-part-search`) record

Phase 1 ships the first **publishable** plugin: the Huaqiu part-search tool
set as a self-contained DSH plugin (no `@hqedge/*` bridge, no HTTP proxy),
talking to the Huaqiu public API through the published `@huaqiu/part-search`
library. All changes landed in `packages/dsh-tool-part-search`.

### §15.1 Shape (implemented)
- `src/service.ts` — thin adapter `createPartSearch(options?)` →
  `PartSearchService` (defaults: `@huaqiu/part-search` client defaults). Exports
  `PartSearchServiceLike` (the four operations as an interface) so tests can
  inject a stub.
- `src/tools.ts` — `createPartSearchTools(service)` returns the four tools,
  preserving the old plugin's public contract verbatim (names, snake_case
  params, descriptions):
  `search_hqsch_parts` / `get_hqsch_part` / `get_hqsch_part_models` /
  `get_hqsch_supply_chain`; `output.schema = { type: 'json' }` with a
  single-text-block render; `timeoutMs 30_000`.
- `src/index.ts` — plugin `name = '@huaqiu/dsh-tool-part-search'`,
  `inject = ['tools']`; `apply` builds one shared service, registers the 4
  tools, returns a disposer; logs `[dsh-part-search] registered agent tools`.
- Tests: `test/index.test.ts` (shape / registration / missing-tools /
  no-`@hqedge`-dependency), `test/tools.test.ts` (snake_case→service mapping,
  undefined-stripping), `test/service.test.ts` (real library normalization
  locked against a stubbed fetch).

### §15.2 Findings worth keeping (TypeScript + DSH runtime)
1. **`defineTool` with `output.schema = { type: 'json' }` infers the execute
   return as `Promise<JsonValue>`, and typed domain interfaces do not satisfy
   `JsonValue`'s index signature.** Follow the ecosystem: do not annotate
   `execute`'s return type (let it infer), and cast the value through a local
   structural `Json` alias (`asJson`). Keep the alias local — it is
   structurally identical to `@deepseek-ai/dsh-session`'s `JsonValue`, so the
   plugin does not need `dsh-session` as a direct dependency for a type only.
2. **`{ type: 'json' }` output is validated as *lossless* JSON at runtime —
   `undefined` property values fail it.** This only surfaces in a live DSH
   call (`tool "search_hqsch_parts" returned invalid output: value is not
   lossless JSON`), not in unit tests, because `@huaqiu/part-search`'s
   normalized model carries optional fields as `undefined`
   (e.g. `huaqiuPn`, `datasheetUrl`). Fix: `asJson` does a JSON round-trip
   (`JSON.parse(JSON.stringify(value))`), which strips `undefined` properties
   and array holes. Regression-tested in `tools.test.ts`.
3. **The "no `@hqedge`" test must check imports/dependencies, not the bare
   string** — the architectural-boundary docstring legitimately mentions
   `@hqedge/*`; assert no `from '@hqedge` / `import('@hqedge` and no
   `@hqedge/*` key in the manifest instead.
4. **The error-message regex should match the message prefix, not a quoted
   token** (`toThrow(/requires the DSH/)` rather than `/tools service/`, which
   fails on the backticked `` `tools` service `` in the message).

### §15.3 Gate status (green at close of Phase 1)
- `pnpm -r typecheck` → 5/5 `Done`; `pnpm -r test` → 55 tests pass
  (part-search 14, artifacts 10, auth 26, schematic-gen 3, symbol-footprint 3).
- Live DSH (user default profile, port 3080, rebuilt `lib/index.mjs`):
  boot log `[dsh-part-search] registered agent tools { tools: 4 }`.
- End-to-end tool invocation in the web UI: asked the agent to use
  `search_hqsch_parts` for STM32F103 → tool returned real candidates
  (STM32F103ZCT6TR LQFP-144, STM32F103VBI6TR UFBGA-100, …) and the agent
  summarized them. The lossless-JSON fix (#2) was confirmed by this live call.
- Publishing `0.1.0` to npm: pending user instruction (release order per
  plan §18/§19 — auth → artifacts → part-search).
