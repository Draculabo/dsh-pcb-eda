# @huaqiu/dsh-auth

Huaqiu account plugin: browser↔node credential flow for the Huaqiu PCB EDA tool set.

- Dual-face package. Browser half: auth.eda.cn overlay iframe + strict-origin postMessage
  handling + localStorage cache + push to node. Node half: `huaqiuAuth` capability
  (`getAccessToken` / `getUserInfo`) backed by an in-memory cache fed over the
  plugin-owned `webServer` route `/api/v1/huaqiu/auth`.
- **HQ Edge host mode.** When the plugin is loaded with a `config.hqEdgeBaseUrl`
  (injected by the HQ Edge supervisor as overlay entry `config`), the node half
  fetches the operator credential directly from HQ Edge's
  `GET /api/v1/auth/token` and is authoritative on boot — no browser login
  required. Resolution order inside `getUserInfo()`: host session → pushed
  (browser) session → persisted file (`~/.dsh/auth/session.json`) → null.
  Env fallback (`HQ_EDGE_BASE_URL` / `HQ_EDGE_AUTH_PATH` / `HQ_EDGE_HOST_TTL_SECONDS`)
  covers installs without a supervisor. See `src/host.ts`.
- Node-side persistence: the last known session is written to `~/.dsh/auth/session.json`
  on every `setCredentials`, so standalone auth survives a process restart (previously
  the in-memory cache was empty until the next browser login).
- Phase 0A POC. The chosen browser→host channel is a `webServer` route
  (`apiProxy`'s dispatch table is closed — see `docs/tasks/phase0-implementation-spec.md` §7).
- Status: host mode + persistence implemented (spec `docs/tasks/dsh-auth-artifact.md`).
