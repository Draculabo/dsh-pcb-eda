import { copyFile } from 'node:fs/promises';

const root = new URL('..', import.meta.url);
// First-party code follows the workspace license; refresh it before every pack.
await copyFile(new URL('../../LICENSE', root), new URL('LICENSE', root));
// The engine itself is not packaged: KiCad ships bin\freerouting.exe. Only the
// GPL notice for that engine travels with the plugin.
await copyFile(new URL('engine/LICENSE', root), new URL('bundled/freerouting.LICENSE', root));
