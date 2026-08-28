# @huaqiu/dsh-artifacts

Huaqiu artifact storage plugin for DSH: persist generated KiCad files (symbols,
footprints, schematics, project zips) and serve them back over the profile's
`webServer` so the DSH web UI can preview/download them.

## What it provides

- Node service `ctx.huaqiuArtifacts` — a filesystem-backed artifact store with
  metadata (`meta.json`), atomic writes, TTL expiry, a `maxBytes` cap, and strict
  id validation (`^art_[0-9a-f]+$`). Filenames never affect the storage path.
- HTTP routes under `/api/v1/huaqiu/artifacts`:
  - `GET /api/v1/huaqiu/artifacts/<id>` — artifact metadata
  - `GET /api/v1/huaqiu/artifacts/<id>/content` — raw content with
    `Content-Disposition: inline` for browser preview
- Injects `webServer` (via `cordis.patch.yml`).

Port of `hq-edge`'s `DshPreviewArtifactService` with zero dependency on the HQ
Edge monorepo (storage root defaults to `dshHomePath('artifacts')`).

## Usage

```ts
// Node half (DSH plugin). Service is provided by the plugin entry:
ctx.huaqiuArtifacts.create({ type: 'symbol', filename: 's.kicad_sym', content })
ctx.huaqiuArtifacts.readContent(id)
```

```ts
// Direct service use (no cordis):
import { HuaqiuArtifactService } from '@huaqiu/dsh-artifacts/service'
const svc = new HuaqiuArtifactService({ baseDir: '/tmp/artifacts' })
```

## Status

Phase 0B — service + routes implemented and tested (10 tests). The `zip` artifact
type already supports the system-design project zip; tool-level integration lands
in Phases 1–3.
