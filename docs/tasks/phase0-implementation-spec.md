# Phase 0 Implementation Task Spec — `@huaqiu/dsh-*` workspace foundation

Status: **FOR REVIEW** (do not implement until approved)
Owner: dsh-pcb-eda
References: `docs/research/migrate-hq-edge-plugins.md` (§10 phase ordering, review #7/#20), `docs/research/dsh-pcb-eda.md` (§23 auth RPC).

This spec fixes every architectural decision an implementer would otherwise have to make implicitly while scaffolding the five packages: exact manifests, `cordis.patch.yml` rows, service IDs, route IDs, service contracts, and the stock-DSH verification commands. It covers the whole Phase 0 group: **Phase 0 (foundation) + Phase 0A (auth POC) + Phase 0B (artifacts)**.

---

## 0. Scope

Build the workspace and **prove the two novel/risky mechanisms before any tool depends on them**:

- Phase 0: pnpm workspace, build/test toolchain, 5 skeleton packages with exact manifests + patches, stock-DSH install smoke test.
- Phase 0A: browser↔node auth token propagation POC (the one genuinely novel piece).
- Phase 0B: `@huaqiu/dsh-artifacts` service + `webServer` adapter (proves the HTTP-route-mount mechanism).

Out of scope: part-search / symbol-footprint / schematic-gen tool logic (Phases 1–4), publishing (Phase 5), ECAD renderer bundling (Phase 3/4).

**Hard constraints** (from migration plan §1):
- Zero `@hqedge/*` in any `package.json` or generated bundle (CI-guarded).
- Node tools use `huaqiuArtifacts` **in-process only** — no HTTP loopback (review #2).
- Route namespace is plugin-owned: `/api/v1/huaqiu/artifacts` (review #3).

---

## 1. Deliverables

| # | Deliverable | Phase | Exit criterion |
|---|---|---|---|
| D1 | pnpm workspace `dsh-pcb-eda` with 5 skeleton packages, all green `pnpm -r test && pnpm -r build` | 0 | CI passes |
| D2 | Stock-DSH install smoke test of a skeleton tool plugin | 0 | boots + `--dump-config` shows the row |
| D3 | Auth POC (browser↔node token flow) with 8 acceptance tests | 0A | all 8 green |
| D4 | `@huaqiu/dsh-artifacts` service + `webServer` adapter + security tests | 0B | unit + route tests green |
| D5 | Updated workspace README + per-package skeleton READMEs | 0 | rendered |

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
├── tsdown.config.ts            # entry index.ts (+ client.ts when dual-face); external: react, @deepseek-ai/*, @huaqiu/dsh-*
├── vitest.config.ts            # optional per-package override
├── src/
│   ├── index.ts                # node half: name/inject/apply (+ provide service for service packages)
│   └── (client/index.tsx)      # browser half, only for dsh-auth / dual-face tools
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
    "@deepseek-ai/dsh-client-connection": "*",
    "@deepseek-ai/dsh-host-apiproxy": "*",    // host dispatch face (token-set/invalidate RPC)
    "@deepseek-ai/dsh-host-webserver": "*"    // if a route is used for token refresh
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

**Implementer's task #1 (the actual unknown)**: pin the exact browser→host RPC call shape. Candidate mechanisms, in preference order:
1. A custom host RPC handler registered on the `apiProxy` service (`@deepseek-ai/dsh-host-apiproxy`, service id `apiProxy`) — mirrors how `userQuestions.registerProvider(...)` plugs a provider into the host dispatch (see `packages/host/apiproxy/src/api-proxy.ts`).
2. A plugin-owned `webServer` route as a fallback channel if the dispatch face rejects plugin handlers.
3. `dsh-client-connection`'s exported `ClientConnectionRpc`/`HostApi` wire, if a public extension point exists.

**Acceptance tests (all 8 — review #6):**

| # | Scenario | Pass criterion |
|---|---|---|
| T1 | Login | iframe opens; postMessage received with origin check passing |
| T2 | Token received | client caches `token`/`userInfo` in localStorage |
| T3 | Node receives token | node half cache is populated (probe tool reads it) |
| T4 | Tool reads token | `huaqiuAuth.auth.getAccessToken()` returns the pushed value |
| T5 | Logout | `logout()` clears client + node state |
| T6 | Node invalidation | after logout, node `getAccessToken()` → `null` |
| T7 | Token refresh/update | a second login overwrites the node cache |
| T8 | Reload persistence | reload → fingerprint silent login restores token (localStorage path) |

**Also verify** (security, review #15): a postMessage from a non-`auth.eda.cn` origin is rejected (negative test).

---

## 8. Phase 0B — artifacts service + `webServer` adapter

**Goal**: deliver `@huaqiu/dsh-artifacts` (D4) and prove the route-mount mechanism (mirrors the `edge-bridge` `/hq-edge` precedent).

**Service (`src/service.ts`)**: port `DshPreviewArtifactService` (fs + `meta.json` per artifact dir under `<baseDir>/dsh-artifacts/<id>/`; atomic tmp+rename; TTL) **plus hardening** (review #15/#16):
- `id` validated `^art_[0-9a-f]+$` before any path use; non-matching → `null`/404.
- `filename` never in the storage path — only in `meta.json` + `Content-Disposition`.
- Max artifact size + max metadata size (config; port the existing 512 KiB/1 MiB caps).
- TTL expiry (`ttlSeconds` + `deleteAll({onlyExpired})`).
- Symlink-safe access (`lstat`/`realpath` containment under `baseDir`).
- Storage default `~/.dsh/artifacts/` via `dshHomePath('artifacts')`; config `{ baseDir }` override.

**Routes (`src/routes.ts`)**: `GET /api/v1/huaqiu/artifacts/:id` (meta JSON) and `GET /:id/content` (stream, `Content-Disposition: attachment; filename="<meta.filename>"`); 404 on missing/invalid id. Both registered with `ctx.webServer.register({ kind:'exact', path, handler })`, disposers returned.

**Tests** (unit + route):
- create → meta shape `{id,type,filename,size}`; content round-trips (utf8 + base64 + binary).
- get/readContent/openStream/delete/deleteAll(expired).
- id validation (invalid ids rejected, incl. `../`, absolute, non-hex).
- filename never affects storage path.
- max-size / max-meta-size enforced; atomic write leaves no partial file on failure.
- symlink access blocked.
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

`tsdown.config.ts` (dual-face example):

```ts
import { defineConfig } from 'tsdown'
export default defineConfig({
  entry: ['./src/index.ts', './src/client/index.tsx'],
  format: ['esm'],
  external: [/^react$/, /^@deepseek-ai\//, /^@huaqiu\/dsh-/],  // everything else BUNDLED
  outDir: 'lib',
})
```

`vitest.config.ts` (root): two projects — `node` (environment: node) and `client` (environment: jsdom, setup: `@testing-library/react`). Per-package `test/` trees run under the matching project via name filters.

`pnpm-workspace.yaml`:

```yaml
packages:
  - 'packages/*'
```

---

## 10. CI (`.github/workflows/ci.yml`)

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
      - run: pnpm -r lint          # tsc --noEmit --strict (or per-package)
      - run: pnpm -r test          # vitest run
      - run: pnpm -r build
      # review #1 — the two @hqedge guards:
      - run: |
          if pnpm -r why @hqedge | grep -q '@hqedge'; then echo "FAIL: @hqedge resolved" && exit 1; fi
      - run: |
          if grep -R "@hqedge/" packages/*/lib 2>/dev/null | grep -q .; then echo "FAIL: @hqedge in bundles" && exit 1; fi
      - run: pnpm -r pack --dry-run   # release-readiness gate (files/peer warnings)
```

---

## 11. Stock-DSH verification commands (must pass at the end of each sub-phase)

```bash
# Phase 0 — skeleton tool package
pnpm --filter @huaqiu/dsh-tool-part-search build && pnpm --filter @huaqiu/dsh-tool-part-search pack --dry-run
dsh plugin --profile web add <path-to-tarball-or-dir>   # or link for local dev
dsh --profile web --dump-config | grep huaqiu           # row present

# Phase 0B — artifacts
# (run a DSH web profile; the artifacts plugin must be mounted)
curl -s http://127.0.0.1:3080/api/v1/huaqiu/artifacts/<id>            # 200 meta
curl -s http://127.0.0.1:3080/api/v1/huaqiu/artifacts/<id>/content    # 200 content

# Phase 0A — auth
# (manual browser check: dsh web, trigger login, observe T1–T8)

# Final (Phase 5, also a Phase 0 sanity anchor):
dsh plugin --profile web add @huaqiu/dsh-auth @huaqiu/dsh-artifacts @huaqiu/dsh-tool-part-search @huaqiu/dsh-tool-symbol-footprint @huaqiu/dsh-tool-schematic-gen
dsh --profile web --dump-config     # all five rows
```

> Web server default bind is `127.0.0.1:3080` (confirmed from `web-app` bundle: `webserver` row `host: ctx.webStartup.host ?? '127.0.0.1'`, `port: 3080`). Artifact MVP trust model holds on `127.0.0.1` (review #15).

---

## 12. Definition of Done (Phase 0 group)

- [ ] D1–D5 all green (workspace builds, tests pass, CI passes).
- [ ] Phase 0 smoke test: skeleton part-search package installs on a stock DSH and shows in `--dump-config`.
- [ ] Phase 0A: all 8 auth-flow tests green + origin-check negative test; exact browser→host RPC shape documented in code.
- [ ] Phase 0B: artifacts unit + route tests green; route namespace is `/api/v1/huaqiu/artifacts`; hardening enforced and tested.
- [ ] CI contains the two `@hqedge` guards and a `pack --dry-run` gate.
- [ ] No tool logic beyond stubs; no publish executed (Phase 5).

---

## 13. Open questions for the implementer (must be answered, then frozen)

1. **Exact browser→host RPC shape** for the auth token push (Phase 0A task #1): `apiProxy` custom handler vs `ClientConnectionRpc` extension vs `webServer` fallback route. Pick one, document the call shape, and freeze it.
2. **Provider package name for `userQuestions`** in the peer deps (`@deepseek-ai/dsh-user-questions` vs actual) — resolve against `packages/interaction/user-questions` in Phase 0 and correct §3.4.
3. **DSH runtime peer range** for `@deepseek-ai/dsh-tools` / cordis — confirm the current published `0.1.1-rc.x` range still matches (migration plan §11).
4. **`dsh plugin --profile web add <local path>` mechanics** for out-of-tree local packages (link vs tarball) — verify once in Phase 0; this unblocks all later phases.
5. **Dev loop for client plugins** (hot reload vs `dsh web` restart) — note in the workspace README; doesn't block Phase 0.

---

*End of Phase 0 implementation task spec — ready for review.*
