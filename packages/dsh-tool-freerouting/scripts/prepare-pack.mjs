import { copyFile } from 'node:fs/promises';

const root = new URL('..', import.meta.url);
// The engine itself is not packaged: KiCad ships bin\freerouting.exe. Only the
// GPL notice for that engine travels with the plugin.
await copyFile(new URL('engine/LICENSE', root), new URL('bundled/freerouting.LICENSE', root));
