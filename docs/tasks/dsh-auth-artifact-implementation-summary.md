# dsh-auth / dsh-artifacts — implementation summary

Implements the smallest change that satisfies `docs/tasks/dsh-auth-artifact.md`
(the spec). Phase 1 inspection (`dsh-auth-artifact-phase1-findings.md`) showed the
spec is ~70% already built; this closes the remaining gaps. Delivered
2026-09-01, pinned to `dsh-pcb-eda@2d2dd9e`, `hq-edge@361e3d5`.

## Files changed (dsh-pcb-eda)

### `@huaqiu/dsh-auth`
- **`src/host.ts`** (new): `HuaqiuAuthConfig`, `resolveHostConfig()` (overlay >
  env > default), `HostSessionResolver` (loopback GET + TTL cache + `clear()`),
  `normalizeHostUser()` (tolerates `userId`/`id`/`user_id`).
- **`src/service.ts`**: `InMemoryHuaqiuAuthService` now takes `(config, opts)`.
  `getUserInfo()` resolves host → pushed → persisted → null. Node-side persistence
  to `~/.dsh/auth/session.json` (atomic tmp+rename) on every `setCredentials`,
  read as a fallback, cleared on `invalidate()`. `isAuthenticated()` also honors
  the persisted session. No change to the `HuaqiuAuthApi` method set.
- **`src/index.ts`**: `apply(ctx, config?)` — overlay `config` flows to the
  service (the supervisor's host-mode channel). Exports `HuaqiuAuthConfig`.
- **`package.json`**: added dependency `@deepseek-ai/dsh-home-paths` (already
  external via tsdown; already present in the DSH runtime profile).
- **`README.md`**: host-mode + persistence section.
- **`test/host.test.ts`** (new): config precedence, resolver (cache/TTL/clear/
  normalize/error), host-priority, persisted read + clear.

### `@huaqiu/dsh-tool-symbol-footprint`
- **`src/client/index.ts`**: dropped the direct `localStorage` read; the
  `needs_auth` card now consumes the `huaqiuAuth` client service (fixes spec
  §10, risk R1/R7). `inject` now includes `'huaqiuAuth'`.
- **`src/protocol.ts`**: `CallComponentAgentOptions.onTokenExpired?` — fired on
  the `TOKEN_EXPIRED` frame.
- **`src/tools.ts`**: passes `onTokenExpired: () => void env.auth.logout()` to
  the three component-agent calls (reactive invalidation, spec §6.5).

### `@huaqiu/dsh-tool-schematic-gen`
- **`src/sse.ts`**: `ConsumeOptions.onUnauthorized?` — fired on HTTP 401 from the
  design API.
- **`src/tools.ts`**: passes `onUnauthorized: () => void env.auth.logout()` to
  both `consumeCopilotkit` calls.

### `@huaqiu/dsh-artifacts`
- **`src/index.ts`**: boot-time `deleteAll({ onlyExpired: true })` sweep (risk
  R6 — `~/.dsh/artifacts` no longer grows without bound). `log` promoted to an
  export so `index.ts` can use it.
- **`test/index.test.ts`**: `apply()` boot-sweep test.

## APIs introduced
- **`HuaqiuAuthConfig`** — `{ hqEdgeBaseUrl?, hostAuthPath?, hostSessionTtlSeconds? }`.
  Delivered as overlay `config` (preferred) or env (`HQ_EDGE_BASE_URL` /
  `HQ_EDGE_AUTH_PATH` / `HQ_EDGE_HOST_TTL_SECONDS`).
- **`onTokenExpired`** / **`onUnauthorized`** — internal protocol/sse hooks; the
  plugins translate them to `auth.logout()` (which === `invalidate()`), so no new
  public `HuaqiuAuthApi` method was needed.

## HQ Edge integration (hq-edge)
- **`apps/server/src/routes/auth.ts`**: `GET /api/v1/auth/token` now returns
  `{ token, userId }` (backward compatible — `.token` consumers unchanged).
  Unblocks `schematic-gen`'s `x-user-id` in host mode (risk R2).
- **`apps/server/src/dsh/supervisor.ts`**: sibling plugins whose package name is
  `@huaqiu/dsh-auth` (alias `@hqedge/dsh-auth`) now receive
  `config: { hqEdgeBaseUrl }` in the materialized overlay — same channel the
  bridge already uses. Forward-compatible: harmless until the auth plugin is
  actually staged during the plugin swap.

## Remaining work (intentionally out of scope)
- **Bridging hq-edge's other artifact store** (`packages/artifacts/`, SQLite+Kysely
  ERC/BOM) into `@huaqiu/dsh-artifacts` — per §13/§14 and your explicit decision,
  left separate. Not a split-brain: user-wide opaque preview blobs vs
  project-scoped structured records.
- **Static host token, no refresh** — HQ Edge's token is operator-supplied and
  unvalidated, so "reliable token validation" is limited to reactive
  invalidation on 401 / `token_expired`. Full validation needs an eda.cn
  introspection endpoint (spec should not promise it).
- **Orphaned `~/.hq-edge/dsh-artifacts`** from the root move to `~/.dsh/artifacts`
  — accepted per your decision (TTL previews, no migration).
