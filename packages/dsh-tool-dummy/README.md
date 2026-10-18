# @huaqiu/dsh-tool-dummy

A deliberately minimal DSH plugin whose only job is to be **discoverable**.

It is the fixture for hq-edge's remote plugin discovery pipeline: hq-edge
fetches the centralized release manifest, compares it against the active
bundle, and offers installs / updates / current states in the PluginUpdate
view. This package lets that whole loop be exercised end to end with a
plugin that is known-good but carries no product behaviour of its own.

## What it does

- **Node half** — answers `GET /api/v1/huaqiu/dummy` with
  `{ name, version, route, time }`, where `version` is the *published*
  version read from `package.json`.
- **Browser half** — one sidebar toolbutton in the Huaqiu family block
  ("Dummy 插件") that opens a probe panel. The panel calls the route above
  and shows which build answered.

If both halves render and the reported version matches what you published,
the discovery → install → activate loop worked.

## Compatibility surface

`webServer` is the only injected service — no `hqEdge` bridge, no
credentials, no agent tools. In the release manifest it is therefore
`requiresHqEdge: false` with no version bounds, so it is offered on every
host and never blocked by the HQ Edge version check.

## Testing the discovery loop

1. Publish the package (the release lane is lockstep: bump to the current
   `pluginSetVersion` and add the entry to `plugins-release-manifest.json`,
   which the pre-publish gate validates):
   ```bash
   pnpm check:publish
   ```
2. Let hq-edge re-fetch the manifest (PluginUpdate view → refresh, or
   `POST /api/v1/plugin-updates/check`). A brand-new plugin that is not in
   the active bundle shows up in the **待处理 / Actionable** group with state
   `install`; after install + activation it moves to **已是最新 / Up to date**
   with state `current`; bumping the manifest version turns it into `update`.
3. Open the sidebar row → probe panel: the payload proves which published
   build is live.

## Local dev

```bash
pnpm --filter @huaqiu/dsh-tool-dummy build   # lib/ is what the runtime loads
pnpm --filter @huaqiu/dsh-tool-dummy test
```
