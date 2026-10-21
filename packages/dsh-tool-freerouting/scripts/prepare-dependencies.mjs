import { execa } from 'execa';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const python = process.env.DSH_IPC_TEST_PYTHON;
const jdk = process.env.DSH_ENGINE_TEST_JDK;
if (!python) {
  throw new Error('Set DSH_IPC_TEST_PYTHON to KiCad Python 3.11');
}
// The plugin package ships no engine, so the source-built JAR and its JRE are
// opt-in: they are only needed for the KiCad-side artifact built by
// scripts/package-windows-exe.ps1.
const buildEngine = process.env.DSH_PREPARE_ENGINE === '1';
if (buildEngine && !jdk) {
  throw new Error('DSH_PREPARE_ENGINE=1 requires DSH_ENGINE_TEST_JDK to point at a full JDK 25');
}
const args = [
  '-B',
  join(root, 'scripts/prepare_dependencies.py'),
  '--python',
  python,
  '--cache',
  process.env.DSH_BUILD_CACHE || join(root, '.build-cache'),
];
if (buildEngine) {
  args.push('--jdk', jdk);
}
await execa(python, args, {
  cwd: root,
  windowsHide: true,
  timeout: 30 * 60 * 1000,
  stdio: 'inherit',
  env: { PYTHONUTF8: '1', PYTHONDONTWRITEBYTECODE: '1' },
});
