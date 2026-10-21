import { runPackageManager } from './package-manager.mjs';
import { access, mkdir, readFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('..', import.meta.url);
// The plugin ships no engine: KiCad provides bin\freerouting.exe, or the user
// points DSH_FREEROUTING_EXE at one. Only plugin code, Python helpers and their
// vendor libraries enter the archive.
const required = [
  'package.json',
  'cordis.patch.yml',
  'lib/index.js',
  'lib/client.js',
  'python/kicad_helper.py',
  'python/dependencies.lock.json',
  'python/vendor/win32/lib/pywintypes.py',
];
await Promise.all(required.map((path) => access(new URL(path, root))));

const manifest = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
if (manifest.name !== '@huaqiu/dsh-tool-freerouting') {
  throw new Error('unexpected DSH plugin package name');
}
const clientBundle = await readFile(new URL('lib/client.js', root), 'utf8');
if (!clientBundle.includes('window.__ModuleLoader__.load')) {
  throw new Error('client bundle is missing the DSH browser module loader wrapper');
}
if (/require\(["']zod(?:\/mini)?["']\)/.test(clientBundle)) {
  throw new Error('client bundle must inline zod for the DSH browser runtime');
}

const dist = new URL('dist/', root);
await mkdir(dist, { recursive: true });
// Installed DSH profiles may still refer to a previous local tarball. Preserve
// other versions so the plugin manager can resolve the old install during upgrade.
const archiveName = `${manifest.name.replace(/^@/, '').replaceAll('/', '-')}-${manifest.version}.tgz`;
await rm(new URL(archiveName, dist), { force: true });

await runPackageManager(['pack', '--pack-destination', 'dist'], {
  cwd: fileURLToPath(root),
  stdio: 'inherit',
});
