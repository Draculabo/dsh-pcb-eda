# Standalone Symbol & Footprint Generator Apps — Research

**Question.** Add two sidebar tool buttons to the DSH Web UI that open **Symbol
Gen** and **Footprint Gen** as standalone workspaces. Upload/paste an image →
generate → preview the result on a canvas → download. Footprint Gen additionally
has a geometry editor. Both persist and reload history. Both must be **reusable**:
a React view with a thin DSH wrapper, separately servable so it can be loaded in
a webview inside the EDA desktop app.

**Reference material.** The plugin under study is
`/Users/admin/code/dsh-pcb-eda/packages/dsh-tool-symbol-footprint`. The sidebar
reference given was `/Users/admin/code/dsh-plugin/dsh-web/packages/dsh-task-board`.

DSH citations are against the pinned commit
`9731443e6b58cfe0abd009c5cea236069763ace5`
(`/Users/admin/code/hq-edge/config/dsh.lock.yaml:14`), cloned locally at
`/Users/admin/code/deepseek-harness`.

---

## 1. Verdict

| Question | Answer |
| --- | --- |
| Copy task-board's DOM injection? | **No.** It works around a limitation that no longer exists. Use official slots. |
| Which slots? | `sidebar.footer.action` for the button + `shell.overlay` for the workspace. Both `scope: 'root'`. |
| Where does generation run? | **Node half**, unchanged. The app is a client of a new plugin-owned HTTP API. |
| Where does history live? | A **new history index** alongside `dsh-artifacts`, not inside it (the artifact store has no `list()`). |
| How is the app made reusable? | Three layers: a portable React app + a **ports** interface + two adapters (DSH, standalone). |
| Can it be a pure static bundle? | **No** — `wss://www.eda.cn` rejects a non-eda.cn origin. "Served separately" must mean *a separate server*, not *no server*. |

The single most expensive mistake available here is to trust task-board's
in-source rationale and build DOM injection. See §3.

---

## 2. What the plugin is today

`dsh-tool-symbol-footprint` is a **tool plugin, not an app plugin**. It has two
halves and no standalone surface.

**Node half** (`src/index.ts`). `inject = ['tools', 'huaqiuAuth', 'huaqiuArtifacts']`
(`src/index.ts:41`; mirrored in `cordis.patch.yml:9`). Registers three agent tools
(`src/tools.ts:606-612`):

- `generate_symbol_from_image` — image → `.kicad_sym`
- `generate_footprint_from_image` — image → dimensions → **human** → footprint
- `generate_footprint_from_dimensions` — confirmed dimensions → `.kicad_mod`

They talk to `wss://www.eda.cn/componentV2/chat` (`src/protocol.ts:47`). The token
comes from the `huaqiuAuth` service; results are stored via `huaqiuArtifacts`.

**Browser half** (`src/client/index.ts`). `inject = ['slots', 'sessions', 'huaqiuAuth']`
(`:39`). Registers a keyed `tool.call.toolview` for each of the three tool names
(`:164-169`) rendering `GenHit` — a **result card inside a chat message**
(`src/client/hit-card.tsx:643`). It is not a workspace; it has no entry point of
its own and only exists once the agent has called a tool.

**So the gap is not "add a button".** It is: give the same generation pipeline a
first-class, agent-free entry point, and give it durable history.

### 2.1 What is already reusable, with no work

This matters a lot for scoping. Three substantial pieces are already written and
are either pure or trivially decoupled:

| Piece | Location | State |
| --- | --- | --- |
| Dimension model — bounds, clamp, parse/format, W/H picking, BGA grid, validation, pin count, tolerances | `src/client/dims.ts` | **Pure. Zero imports.** (header comment: "Pure geometry/dimension model") Move verbatim. |
| Geometry editor — SVG package silhouette, draggable W/H/WH handles, two-way-bound numeric fields, essential/advanced grouping, validation strip | `hit-card.tsx:294-587` (+ `packageSilhouette` `:129-206`, `pointerToViewBox` `:279-291`) | Move, but decouple the `Translate` param. |
| Preview + download — KiCad s-expr parse → `ecad-renderer` canvas; blob download | `src/client/ecad.ts` | Move; make the artifact base URL injectable (`:26` hardcodes `/api/v1/huaqiu/artifacts`). |

The footprint geometry editor the request asks for **already exists** — it is
currently trapped inside a chat card. Extracting it is the largest single
schedule saving available.

---

## 3. The sidebar: do not copy task-board

### 3.1 Task-board's premise is factually wrong

`dsh-task-board/src/client/sidebar-entry-core.ts:4-9` states:

> dsh's sidebar shell exposes no slot an external plugin can register into
> (`sidebar.workspaces` / `sidebar.settings` are single-occupant and already
> taken), so the entry row is injected between the shell's New Session button
> and the workspace browser.

Half true. `sidebar.workspaces` and `sidebar.settings` **are** single-occupant
(`packages/client/ui-sidebar/src/client/contract/slots.ts:35`, `:41`). But the
generalisation to "no slot at all" is false, and the file's own dependency list
proves it: task-board's `package.json:31-41` injects
`@deepseek-ai/dsh-client-ui-slots`, and `src/client/index.ts:171` registers into
`web-ui.plugin.item` — a slot.

There **is** an additive sidebar slot:

> `deepseek-harness/packages/client/ui-sidebar/src/client/contract/slots.ts:46`
> ```ts
> 'sidebar.footer.action': { kind: 'list'; scope: 'root'; owner: SidebarFooterActionOwnerProps }
> ```

Declared at `ui-sidebar/src/client/index.ts:61`, rendered at
`ui-sidebar/src/client/SidebarRoot.tsx:214`. Owner props are just
`{ wide: boolean }` (`slots.ts:83-86`) — whether the sidebar renders wide content
or the 56px rail. `dsh-auth` in **this very monorepo** already registers into it
(`packages/dsh-auth/src/client/index.tsx:109`).

The consequence of task-board's choice is 234 lines of MutationObserver
self-healing (`sidebar-entry-core.ts:143-234`) plus 147 lines of center-column
takeover with sibling eviction and cross-plugin activation events
(`panel-mount-core.ts:71-147`).All of that is cost incurred to avoid a
registration call.

### 3.2 The canonical pattern, already in use twice

Two shipped plugins do exactly what this request describes — sidebar button
toggling a full surface — via two slots and shared open state:

> `dsh-web-files/src/client.tsx:559-564` and `:574-578`
> ```tsx
> slots.inject('shell.overlay', () => slots.register(
>   { name: 'shell.overlay', id: 'web-files' },
>   function Overlay() { ... <FilesPanel open={shared.open} .../> },
> ))
> slots.inject('sidebar.footer.action', () => slots.register(
>   { name: 'sidebar.footer.action', id: 'web-files', order: -1 },
>   function Action({ wide }) { ... <FilesAction open={shared.open} .../> },
> ))
> ```

`dsh-web-terminal/src/client.tsx:299-313` is identical. Note the comment at
`dsh-web-files/src/client.tsx:571-573`: `order` decides list position, "rather
than by which plugin happened to compose first" — so ordering our two buttons is
a number, not a load-order accident.

`shell.overlay` is documented precisely for this
(`ui-layout/src/client/index.ts:80-85`):

> Frame-wide floating layer, above every column and outside their scroll
> containers. … This is the additive seat for a frame-wide surface of your own:
> a fresh `id` is added beside the shipped entries instead of replacing them.

Two caveats to design around: the layer is **click-through** (entries must opt
back into pointer events), and it is an overlay, not a column.

### 3.3 Why not `conversation.view`

`conversation.view` is the official center-column slot
(`ui-conversation/src/client/contract/slots.ts:117`, list, `scope: 'session'`),
rendered as **tabs** beside Chat (`skeleton/ConversationSession.tsx:187-192`,
tab list at `apply.ts:120-129`), with `openView(view, focus)` for programmatic
switching (`slots.ts:203-210`). It is the better fit for a *session-scoped*
workspace. It is the wrong fit here:

- **It needs a live session.** `ConversationSession.tsx:187`:
  `if (session.blank && conversationPhase(session, conversation) === 'blank') return null`.
  With no session, the app is simply unreachable.
- **View selection is per-session.** `ConversationStoreState.view` lives in the
  per-session store (`contract/views.ts:20`) and `activateView` re-resolves on
  session activation (`apply.ts:132-135`). Switching sessions would close the
  generator.
- **History is app-global by requirement.** A root-scope surface matches
  root-scope state.

### 3.4 Recommendation

Register **two** `sidebar.footer.action` entries (`id: 'huaqiu-symbol-gen'`,
`id: 'huaqiu-footprint-gen'`, adjacent `order` values) and **two** `shell.overlay`
entries with the same ids. Shared open state via a tiny store, exactly as
`dsh-web-files` does. No MutationObserver, no DOM scanning, no sibling eviction.

If a true column takeover later proves necessary, `conversation.view` is the
supported upgrade path — but it needs a session story first.

---

## 4. Where generation runs: the node half stays authoritative

The app must not reimplement the pipeline, and must not hold the token.

### 4.1 The house pattern is already here

Two packages in this monorepo already expose node-side capabilities to the
browser over plugin-owned `ctx.webServer` routes:

> `packages/dsh-artifacts/src/index.ts:22`, `:39-43`
> ```ts
> export const inject = ['webServer'] as const
> ctx.effect(() => ctx.webServer.register({
>   kind: 'prefix', path: ARTIFACTS_ROUTE_PREFIX, handler: createArtifactsHandler(service),
> }))
> ```
> `packages/dsh-auth/src/index.ts:17`, `:37-41` — same shape, `AUTH_ROUTE_PREFIX`.

Browser side, `dsh-auth/src/client/transport.ts:20-59` is a plain `fetch` client
against `/api/v1/huaqiu/auth`. `dsh-artifacts/src/routes.ts:18` uses
`/api/v1/huaqiu/artifacts`. Both are same-origin: no CORS, no external dependency.

`dsh-tool-symbol-footprint` notably does **not** do this today — its node half has
no `webServer` dependency. Adding routes means adding `'webServer'` to **both**
`src/index.ts:41` and `cordis.patch.yml:9` (the loader holds the entry until
injected services exist; see the comment at `cordis.patch.yml:2-5`).

Also note `dsh-task-board/src/host-routes.ts:97-107` as a reference for the
**route fence**: loopback socket + `Host` + origin-equality + a browser
same-origin marker. Worth copying — these routes proxy a credentialed SaaS call.

### 4.2 The job API

Generation takes up to 180 s (symbol) and 900 s (footprint, human pause
included) — `src/tools.ts:77-81`. A plain request/response would stall behind
proxies and give no progress. Use a job + SSE shape, mirroring task-board's
`state` / `action` / `events` trio (`host-routes.ts:129-190`):

```
POST   /api/v1/huaqiu/sfgen/jobs                 → { jobId }          (202)
GET    /api/v1/huaqiu/sfgen/jobs/<id>            → JobState
GET    /api/v1/huaqiu/sfgen/jobs/<id>/events     → SSE progress
DELETE /api/v1/huaqiu/sfgen/jobs/<id>            → abort
GET    /api/v1/huaqiu/sfgen/config               → { hostMode, capabilities, limits }
GET    /api/v1/huaqiu/sfgen/history              → HistoryPage
GET    /api/v1/huaqiu/sfgen/history/<id>         → HistoryEntry
PATCH  /api/v1/huaqiu/sfgen/history/<id>         → rename / favourite
DELETE /api/v1/huaqiu/sfgen/history/<id>
```

The three job kinds map 1:1 onto functions that **already exist**:

| Job kind | Existing function |
| --- | --- |
| `symbol` | `runGenerateSymbol` — `src/tools.ts:304` |
| `extract-dimensions` | `runGenerateFootprintFromImage` — `src/tools.ts:386` |
| `generate-footprint` | `runGenerateFootprintFromDimensions` — `src/tools.ts:333` |

All three are plain `async (args, exec, env) => Record<string, unknown>` against a
`SymbolFootprintEnv` (`src/tools.ts:97-110`) that the node half already builds
(`src/index.ts:95-107`). `exec.signal` gives cancellation for free. **No new
generation logic is required** — only a job wrapper and an HTTP transport.

Two things to settle:

- **`needs_confirmation` becomes an app state, not an agent protocol.** Today the
  card hands confirmation back to the model via `sessions.prompt`
  (`hit-card.tsx:715-743`). Standalone, the app *is* the driver: show the
  geometry editor, then call `generate-footprint` itself. The single-HIL invariant
  ("a footprint is generated ONLY from dimensions a human has seen",
  `src/tools.ts:380-384`) is preserved — a human still confirms before generation.
- **`runGenerateFootprintFromImage` has a fast path.** If the service recognises a
  standard package it returns `footprint_button` and the function generates
  immediately via `handleDirectFootprint` (`src/tools.ts:435-437`). For the app
  that is fine (present it as auto-generated, reviewable) but it means
  `extract-dimensions` can return a finished footprint. Either accept it or add a
  thin extraction-only wrapper that returns the raw action. **Decision needed.**

---

## 5. History: the artifact store cannot support it

`HuaqiuArtifacts` (`packages/dsh-artifacts/src/service.ts:66-72`):

```ts
create(input)  get(id)  readContent(id)  delete(id)  deleteAll(opts)
```

**There is no `list()`.** History is an enumeration problem, and the current
store cannot enumerate. Do not fix this by bolting query methods onto
`dsh-artifacts`: this monorepo deliberately keeps two artifact systems separate
(fs+json user-wide `<dshHome>/dsh-artifacts`, consumed by
`@huaqiu/dsh-artifacts`; and the project-scoped SQLite one under
`packages/artifacts/`), and artifacts are a **content-addressed preview cache**,
not a user-facing record.

**Recommendation: a separate history index that references artifact ids.**

```
<dshHome>/sfgen/history.json        # append-only index
<dshHome>/sfgen/inputs/<id>.webp    # downscaled input image
```

```ts
interface HistoryEntry {
  id: string
  kind: 'symbol' | 'footprint'
  createdAt: string
  status: 'generated' | 'failed' | 'cancelled'
  input: { imageId?: string; instruction?: string; pkgType?: string; dimensions?: Record<string, number> }
  edited?: Record<string, boolean>          // which dimensions the human changed
  result?: { artifactId: string; filename: string; fileUrl: string; size: number }
  error?: string
}
```

Three concrete constraints:

1. **`ArtifactType` has no `image` member** (`dsh-artifacts/src/service.ts:27`:
   `'symbol' | 'footprint' | 'schematic' | 'pcb' | 'zip'`). Input images cannot go
   through the artifact store. Store downscaled thumbnails in the history store,
   size-capped (the generator's own input cap is 4 MiB — `src/protocol.ts:63`).
2. **No TTL, or history links break.** `createPreviewArtifact`
   (`src/tools.ts:148-158`) calls `artifacts.create` **without** `ttlSeconds`, so
   `expiresAt` is undefined and the boot-time expired-only sweep
   (`dsh-artifacts/src/index.ts:49-54`) never touches them. Good — but this is an
   undeclared invariant. If anyone adds a TTL, history entries silently 404.
   Encode it as a test.
3. **The store is user-wide, not project-scoped** (`service.ts:128`,
   `dshHomePath('artifacts')`). History inherits that. If per-project history is
   wanted later, that is a separate decision — do not conflate it with this work.

In the browser, keep only UI state (open panel, current draft, last query) in
`localStorage`, as `dsh-task-board` does with `LocalStorageTaskStore`
(`src/core/store.ts`, wired at `src/client/index.ts:204`). Durable history stays
node-side so it survives across browsers and is shared with the standalone host.

---

## 6. Reusability: three layers, one HTTP client

### 6.1 The blocker

The browser half is **not** a standalone app and cannot be made into one by
rebuilding it. `tsdown.config.ts:29-31`:

```js
banner:  `window.__ModuleLoader__.load({ id: "@huaqiu/dsh-tool-symbol-footprint", factory: (require) => {`,
footer:  'return module.exports; } });',
intro:   'var module = { exports: {} }; var exports = module.exports;',
```

It is a CJS chunk that self-registers with a `__ModuleLoader__` global supplied
by the DSH web shell. There is no `index.html`, no mount call, and
`deps.neverBundle` (`tsdown.config.ts:26`) externalises `react`/`react-dom`, so
the host must supply React at runtime. Confirmed negatives across
`dsh-pcb-eda`: **zero `.html` files, no vite/esbuild/webpack config, no IIFE or
standalone ESM browser entry, no static-server script.**

The fix is not a new bundle config. It is a **layering** change.

### 6.2 The three layers

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 1 — the app (portable)                               │
│  React + TypeScript. No DSH imports. No node:*. No fs.      │
│  SymbolGenView, FootprintGenView, GeometryEditor,           │
│  PreviewStage, HistoryPanel, UploadDrop                     │
│  Consumes: SfGenPorts   Consumes: a Translate fn            │
└──────────────────────────┬──────────────────────────────────┘
                           │ SfGenPorts (the whole contract)
        ┌──────────────────┴───────────────────┐
        ▼                                      ▼
┌───────────────────────┐          ┌──────────────────────────┐
│ DSH adapter           │          │ Standalone adapter       │
│ thin cordis apply()   │          │ index.html + mount +     │
│ → slots registrations │          │ URL-param bootstrap      │
│ + inject SfGenPorts   │          │ + inject SfGenPorts      │
└───────────┬───────────┘          └────────────┬─────────────┘
            │ fetch, same origin                │ fetch, same origin
            ▼                                   ▼
   /api/v1/huaqiu/sfgen/*              /api/v1/huaqiu/sfgen/*
   (node half of the plugin)           (standalone Node server)
```

```ts
export interface SfGenPorts {
  config(): Promise<{ hostMode: boolean; limits: { imageBytes: number } }>
  startJob(req: StartJobRequest, signal?: AbortSignal): Promise<JobState>
  jobEvents(jobId: string, onEvent: (e: JobEvent) => void): () => void
  abortJob(jobId: string): Promise<void>
  history(query: HistoryQuery): Promise<HistoryPage>
  historyEntry(id: string): Promise<HistoryEntry | null>
  patchHistory(id: string, patch: HistoryPatch): Promise<HistoryEntry>
  deleteHistory(id: string): Promise<void>
  artifactContent(artifactId: string): Promise<string>
  inputImage(imageId: string): Promise<string>        // data URL
}
```

**The two adapters ship the same HTTP client against different origins.** The
standalone adapter is not a fork; it is one function with a different `base`.
That is what makes "reusable" real rather than aspirational.

### 6.3 What must change to make Layer 1 portable

| Blocker | Location | Fix |
| --- | --- | --- |
| `import { readFile } from 'node:fs/promises'` — top-level | `src/protocol.ts:20` | Lazy import behind `ImageDeps.readFileImpl`, which already exists (`:360`, used at `:375`). |
| `Buffer.from` / `Buffer.isBuffer` — not global in browsers | `src/protocol.ts:408`, `:416`, `:426-428` | Use `Uint8Array` + a base64 helper. Small, contained. |
| `resolveEndpoint` reads `process.env` | `src/protocol.ts:82-102` | Already takes an injectable `env`; pass it in. |
| `new WebSocket(url)` | `src/protocol.ts:277` | **Not a blocker** — global in both. But see §7.1. |
| Hardcoded artifact base URL | `src/client/ecad.ts:26` | Inject via ports. |
| `Translate` threaded through editor props | `hit-card.tsx:295`, `:323` | Replace with a `copy: CopyPack` object; keeps the app i18n-agnostic. |

Everything else is already clean: `consumeFrame` (`:131`), `findAction` (`:158`),
`buildCommand` (`:514`), `extractFileUrl` (`:446`), `artifactFilenameFor` (`:530`)
are pure, and `socketFactory` / `fetchImpl` / `readFileImpl` are already seams
(`:186`, `:359-362`).

---

## 7. Standalone serving for the EDA webview

### 7.1 "Served separately" must mean a separate server, not a static bundle

This is the one hard constraint in the whole design, and it is worth stating
plainly because the requirement as phrased is ambiguous.

The generation endpoint is `wss://www.eda.cn/componentV2/chat`
(`src/protocol.ts:47`), host-whitelisted to `www.eda.cn` and
`www.fdatasheets.com` (`:50`, enforced at `:95-100`). A browser page served from
`localhost`, a CDN, or `file://` **will send an `Origin` that eda.cn rejects**.
Node's `WebSocket` does not send `Origin`; the browser's always does. No amount of
bundling fixes this — it is a server-side policy on a host we do not control.

Secondarily, the token rides as a `?token=` query parameter
(`src/protocol.ts:108-118`). In a pure browser app that puts a long-lived
credential in a URL, where it lands in logs and history.

**Therefore: the standalone target is a small Node server that serves the app
bundle *and* proxies generation.** Same origin, token held server-side, history
on disk. This is not a workaround — it is the established pattern in this
codebase.

### 7.2 The precedent already exists, twice

- **hq-sch (CEF).** `jupiter2/.../copilot/webview/copilot_view.h:8` includes
  `<QCefView.h>`. It already navigates to a loopback DSH URL:
  `webview_copilot_panel_container_impl.h:517-525` —
  `"http://localhost:%1/dsh/"`, polling `/dsh/ready`. Served by
  `hq-edge/apps/server/src/index.ts:62` (`app.use('/dsh', dshBootstrapRouter)`)
  bound to `localhost` (`:107`).
- **Electron (DSH desktop).** `dsh-plugin-desktop/README.md:11` — "Both
  presentation modes reuse the existing **loopback Web carrier**… Electron loads
  that **same-origin page in a sandboxed renderer**. There is **no Electron-owned
  plugin roster, preload bridge, or raw Electron API in the renderer**."
  Host→page config travels as URL query params, not IPC
  (`src/client/environment.ts:22-38`).

There is **no** precedent for a DSH plugin's client half booting standalone
without a host. Every working precedent loads a loopback URL served by a live
host. Follow it.

### 7.3 Token handoff is already solved

The EDA host pushes the credential in after load; it never arrives in the initial
URL.

- JS → native: `eda-cn-login/lib/kicadTools.ts:25-35` posts to
  `window.eda_host.postMessage(...)` (CEF-injected) **and**
  `window.parent.postMessage(..., '*')` for iframe embedding. Vocabulary at
  `:9-15` (`update_access_token`, `launch_login_dialog`, `logout`, …).
- native → JS: `hq-sch/.../webview/cef_view_controller.cpp:16` injects
  `typeof handle_auth === 'function' && handle_auth(<json>)`; consumed at
  `copilot_view.cpp:466-472`.
- Host context as URL params: `add_parameter_to_url.h:35-38` injects
  `host_name, host_version, editor_name, locale, session_id, chat_id, theme,
  gateway_port, variant_host_name`.

So the standalone bootstrap should read `locale` and `theme` from
`URLSearchParams` — exactly what `eda-cn-login` already does
(`app/page.tsx:15`, `components/ui/ThemeContext.tsx:25`,
`LanguageContext.tsx:26`) — and receive the token via the `handle_auth` /
`eda_host` channel. That gives the app host-matched locale and theme for free.

### 7.4 Recommended topology

Do not build a new server from scratch. Reuse the node half's pure logic behind
the same routes:

```
@huaqiu/sfgen-server   (new, thin)
  ├── serves  packages/sfgen-app/dist/          (static)
  └── mounts  the same /api/v1/huaqiu/sfgen/*   routes
        ├── generation  → runGenerateSymbol / runGenerateFootprintFrom*
        ├── auth        → a token provider (see below)
        └── history     → the file store from §5
```

Token providers, in the order `dsh-auth` already defines them
(`packages/dsh-auth/src/host.ts:34-52`, `src/service.ts:203-211`):

1. **HQ Edge host mode** — `GET {hqEdgeBaseUrl}/api/v1/auth/token`
   (`host.ts:34`, served by `hq-edge/apps/server/src/routes/auth.ts:37`). If EDA
   already runs hq-edge, this is zero new work and the app needs no login UI.
2. **Standalone** — EDA hands the token over via `handle_auth` /
   `eda_host.postMessage`; the server exposes a `POST /session` push route
   mirroring `dsh-auth/src/client/transport.ts:25-37`.
3. **Browser login fallback** — the auth.eda.cn iframe + postMessage flow, for a
   plain browser with no EDA host.

Note `service.ts:248`: "Never persist to the standalone store while running under
a host." Keep that discipline in the server.

---

## 8. UX design

### 8.1 Shared shell

Both apps are one surface with a `kind` switch: header (title, status dot),
input panel, result stage, history rail. The symbol app is the footprint app
minus the editor step — build the shell once.

### 8.2 Symbol Gen

```
[ Upload / paste drop zone ]  ← file picker, drag-drop, Ctrl+V, or URL
   optional instruction: "3-pin LDO, pin 1 is VIN"
        │  Generate
        ▼
[ Progress: streaming status ]   ← SSE from /jobs/<id>/events
        ▼
[ Canvas preview — interactive, from ecad-renderer ]
[ ⭳ Download .kicad_sym ]  [ ↻ Regenerate ]  [ Save to history ]
```

### 8.3 Footprint Gen

```
[ Upload / paste drop zone ]  + optional package_type hint
        │  Extract dimensions
        ▼
[ GEOMETRY EDITOR ]  ← the piece that already exists
   SVG silhouette (bga / qfn / son / qfp / plcc / sop / dip / sot23)
   draggable W · H · WH handles; two-way-bound numeric fields
   essential vs. advanced groups; per-field AI/edited tags
   tolerance display; validation strip
        │  Confirm  (human has now seen the values → invariant holds)
        ▼
[ Generation ]  →  [ Canvas preview ]  →  [ Download .kicad_mod ]
```

Behaviour to preserve from the current card: the AI/extracted value is shown
alongside a marker when the human edited it (`hit-card.tsx:453-455`), which is
what makes the confirmation meaningful rather than ceremonial.

### 8.4 History

A left rail or drawer: thumbnails, kind badge, package type, timestamp, status.
Click reopen → restores the input image and the result preview. Actions: rename,
delete, re-open, download. Server-side pagination from day one (`HistoryQuery`
with `limit`/`cursor`) — the store is on disk and unbounded otherwise.

Keyboard and accessibility: follow `dsh-web-terminal/src/client.tsx:315-321`
(a shortcut for a surface people otherwise forget exists) and give the overlay
surface `role="dialog"` with Escape-to-close.

---

## 9. Proposed layout

New packages in `dsh-pcb-eda`, keeping the DSH-dependency boundary clean:

```
packages/
  sfgen-app/                    # NEW — portable, zero DSH imports
    src/
      core/                     # pure: job state machine, history model
      views/                    # SymbolGenView, FootprintGenView
      editor/                   # ← moved from hit-card.tsx:129-587
      preview/                  # ← moved from src/client/ecad.ts
      ports.ts                  # SfGenPorts
      http-ports.ts             # the ONE fetch client, base-injectable
      copy/                     # ZH + EN packs (see §10)
    index.html, vite.config.ts  # standalone entry

  sfgen-server/                 # NEW — standalone host (§7.4)
    src/index.ts                # static + /api/v1/huaqiu/sfgen/*

  dsh-tool-symbol-footprint/    # EXTENDED — the DSH adapter
    src/
      index.ts                  # + 'webServer'; keep the 3 agent tools
      jobs.ts                   # job runner over runGenerate* (no new logic)
      routes.ts                 # + /api/v1/huaqiu/sfgen/*
      history.ts                # the file store from §5
      client/
        index.ts                # + 2× sidebar.footer.action, 2× shell.overlay
        ports.ts                # createDshPorts() → the shared http client
```

The plugin keeps its three agent tools untouched; the app and the agent share one
generation pipeline. That is the point.

---

## 10. Conventions to honour

These are house rules from this monorepo; breaking them will fail review.

- **i18n**: `ZH as const` → `type CopyKey = keyof typeof ZH` →
  `EN: Record<CopyKey, string>`, so a missing EN key is a **compile error**.
  Export `COPY_KEYS` for parity tests. zh is the fallback everywhere, and
  punctuation is i18n (`：` vs `: `).
- **Key-derived labels stay English.** Resolve backend ids at *render* time
  through a canonical map (see `dsh-tool-schematic-gen/src/client/trace-names.ts`);
  unknown names pass through verbatim.
- **Tool `description`s are LLM prompt contracts** — never i18n, never reword.
  The three existing ones carry an `AUTH_GATE_NOTE` (`src/tools.ts:480-489`)
  that the agent depends on.
- **Two result text channels.** `agentNote` is agent-only and must **never** be
  rendered (`hit-card.tsx:796-797`); `note` is user-safe. Regression test:
  `test/agent-note.test.tsx`. The app must inherit this discipline — it consumes
  the same results and could easily leak an agent directive into the UI.
- **Do not import `huaqiuAuth` across packages** — declare it structurally
  (see `src/client/index.ts:65-71` for the existing structural declaration).
- **React version.** `dsh-tool-symbol-footprint` is React 18  `sfgen-app` should target 18 to
  match the plugin it ships inside.
- **Node half has no UI locale.** `hitlLanguage` is deployment configuration
  (`src/index.ts:51-58`, `src/hitl-i18n.ts`). Keep it that way.

---

## 11. Phased plan

**Phase 0 — portable core (no UI change).**
New `sfgen-app` package. Move `dims.ts` verbatim. Move editor + preview,
decoupling `Translate` and the artifact base URL. Add `ports.ts` + `http-ports.ts`.
Add the copy packs and a parity test. *Exit: `sfgen-app` typechecks with zero DSH
imports.*

**Phase 1 — node-side job API.**
Add `'webServer'` to `src/index.ts:41` and `cordis.patch.yml:9`. Add `jobs.ts`
wrapping `runGenerateSymbol` / `runGenerateFootprintFromImage` /
`runGenerateFootprintFromDimensions` — no new generation logic. Add `routes.ts`
with the loopback + origin fence from `dsh-task-board/src/host-routes.ts:97-107`.
*Exit: `curl` a symbol generation end to end.*

**Phase 2 — history.**
Add the file store (§5). Wire `finishGeneration` to append an entry
(`src/tools.ts:161`). Add the no-TTL invariant test. *Exit: history survives a
DSH restart.*

**Phase 3 — DSH surfaces.**
Two `sidebar.footer.action` + two `shell.overlay` registrations with shared open
state. Wire `createDshPorts()`. *Exit: both apps work in DSH with no agent
involvement.*

**Phase 4 — standalone.**
`sfgen-server` + `index.html` + vite build. URL-param locale/theme bootstrap.
Token provider chain (host → push → browser login).
*Exit: hq-sch's CEF view can `navigateToUrl` the app and generate.*

**Phase 5 — de-duplication.**
Point `GenHit` at the shared editor and preview components so the chat card and
the app cannot drift. Keep `tool.call.toolview` as-is.

---

## 12. Risks and open questions

| # | Risk | Notes / mitigation |
| --- | --- | --- |
| 1 | **eda.cn rejects non-eda.cn origins** | Blocks the pure-static-bundle reading of "standalone". Not fixable client-side. Confirm early — it decides Phase 4's shape. |
| 2 | `shell.overlay` is click-through and not a column | Entries must opt into pointer events. If a true column takeover is required, `conversation.view` is the upgrade path but needs a session story (§3.3). |
| 3 | `runGenerateFootprintFromImage` may generate directly | The `extract-dimensions` job can return a finished footprint (`src/tools.ts:435-437`). Accept or add an extraction-only wrapper. **Decision needed.** |
| 4 | History links depend on artifacts never expiring | Undeclared invariant (§5). Encode as a test. |
| 5 | `ArtifactType` has no image member | Input images need their own store. |
| 7 | Long jobs vs. proxy timeouts | 180 s / 900 s. Job + SSE, not a blocking request. |
| 8 | Task-board's DOM-injection rationale is authoritative-looking | Anyone reading it in isolation will copy it. This report is the counter-argument; link it from the plugin README. |
| 9 | Unverified | `shell.overlay` z-order/stacking when two entries are open at once, and behaviour on a 56px rail (`wide === false`) — needs a spike in Phase 3. |

---

## 13. Source references

**This monorepo — `dsh-pcb-eda`**

- `packages/dsh-tool-symbol-footprint/src/index.ts:41` — node `inject`; `:51-58` hitlLanguage
- `.../src/tools.ts:77-81` timeouts; `:97-110` `SymbolFootprintEnv`; `:148-158` artifact store call; `:161-213` `finishGeneration`; `:304`, `:333`, `:386` the three bodies; `:380-384` single-HIL invariant; `:435-437` direct-footprint fast path; `:480-489` AUTH_GATE_NOTE; `:606-612` registrations
- `.../src/protocol.ts:20` node:fs import; `:47`/`:50` endpoint + host whitelist; `:63` 4 MiB cap; `:108-118` token in query; `:131`/`:158`/`:514`/`:446`/`:530` pure helpers; `:186`/`:359-362` existing DI seams; `:277` WebSocket; `:408`/`:416`/`:426-428` Buffer
- `.../src/client/index.ts:39` client `inject`; `:65-71` structural `huaqiuAuth`; `:164-169` toolview registration
- `.../src/client/hit-card.tsx:129-206` silhouette; `:294-587` geometry editor; `:643` GenHit; `:715-743` HIL prompt-back; `:796-797` agentNote never rendered
- `.../src/client/ecad.ts:26` hardcoded artifact URL; `:72-90` render; `:102-116` download
- `.../src/client/dims.ts` — pure dimension model (whole file)
- `.../tsdown.config.ts:26` neverBundle; `:29-31` ModuleLoader banner
- `.../cordis.patch.yml:9` node inject list
- `packages/dsh-artifacts/src/index.ts:22`, `:39-43`, `:49-54`; `src/service.ts:27` ArtifactType; `:66-72` `HuaqiuArtifacts` (no `list()`); `:128` user-wide root
- `packages/dsh-auth/src/index.ts:17`, `:37-41`; `src/client/index.tsx:109` sidebar registration; `src/client/transport.ts:20-59`; `src/host.ts:34-52`; `src/service.ts:203-211`, `:248`

**DSH — `deepseek-harness` @ `9731443e` (slots)**

- `packages/client/ui-sidebar/src/client/contract/slots.ts:35`, `:41` single-occupant seats; `:46` `sidebar.footer.action`; `:83-86` owner props
- `packages/client/ui-sidebar/src/client/index.ts:61` runtime declaration; `src/client/SidebarRoot.tsx:214` render site
- `packages/client/ui-layout/src/client/index.ts:52` sidebar; `:65` conversation; `:80-85` `shell.overlay` doc; `:86` declaration
- `packages/client/ui-conversation/src/client/contract/slots.ts:117` `conversation.view`; `:203-210` owner props; `contract/views.ts:20` per-session view state; `skeleton/ConversationSession.tsx:187` blank-session guard; `src/client/apply.ts:120-135` tabs + activateView
- `packages/client/ui-slots/src/index.ts:26` empty `SlotMap` (declaration merging); `:511-540` KindOptions; `:558-581` BaseOptions; `:772-816` `register`
- `packages/client/ui-renderer/src/client/registry.ts:172` `inject` (declaration-wait); `:239` slot declaration via `register({ children })`

**Reference plugins — `dsh-plugin/dsh-web`**

- `market/shell/packages/dsh-web-files/src/client.tsx:559-564` overlay; `:571-578` footer action + `order`
- `market/shell/packages/dsh-web-terminal/src/client.tsx:299-313` same pattern; `:315-321` shortcut
- `packages/dsh-task-board/src/client/sidebar-entry-core.ts:4-9` **the incorrect premise**; `:143-234` observer
- `packages/dsh-task-board/src/client/panel-mount-core.ts:71-147` center-column takeover
- `packages/dsh-task-board/src/host-routes.ts:97-107` route fence; `:129-190` state/action/events

**EDA / standalone**

- `hq-sch/.../copilot/webview/copilot_view.h:8` QCefView; `webview_copilot_panel_container_impl.h:517-525` loopback URL; `cef_view_controller.cpp:16` `handle_auth` injection; `copilot_view.cpp:466-472` token receipt; `add_parameter_to_url.h:35-38` host URL params
- `eda-cn-login/lib/kicadTools.ts:9-15` command vocabulary; `:25-35` `eda_host.postMessage` + `window.parent`
- `hq-edge/apps/server/src/index.ts:62`, `:107`; `src/routes/auth.ts:37` `GET /api/v1/auth/token`
- `deepseek-harness-desktop/dsh-plugin-desktop/README.md:11`, `:151`, `:239`; `src/client/environment.ts:22-38` URL-param config
