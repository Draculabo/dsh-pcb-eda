# @huaqiu/dsh-auth

Huaqiu account plugin: browser↔node credential flow for the Huaqiu PCB EDA tool set.

- Dual-face package. Browser half: auth.eda.cn overlay iframe + strict-origin postMessage
  handling + localStorage cache + push to node. Node half: `huaqiuAuth` capability
  (`getAccessToken` / `getUserInfo`) backed by an in-memory cache fed over the
  plugin-owned `webServer` route `/api/v1/huaqiu/auth`.
- Phase 0A POC. The chosen browser→host channel is a `webServer` route
  (`apiProxy`'s dispatch table is closed — see `docs/tasks/phase0-implementation-spec.md` §7).
- Status: Phase 0A.
