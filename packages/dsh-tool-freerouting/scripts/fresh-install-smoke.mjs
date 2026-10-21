import { execaSync } from 'execa';
import { runPackageManager, usesPnpm } from './package-manager.mjs';
import { access, cp, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, toNamespacedPath } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const packageRoot = resolve(import.meta.dirname, '..');
const sourceManifest = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'));
const archive = join(
  packageRoot,
  'dist',
  `${sourceManifest.name.replace(/^@/, '').replaceAll('/', '-')}-${sourceManifest.version}.tgz`,
);
await access(archive);
const installRoot = await mkdtemp(join(tmpdir(), 'dsh-plugin-freerouting-'));
try {
  await writeFile(join(installRoot, 'package.json'), JSON.stringify({ private: true }));
  await runPackageManager(
    usesPnpm()
      ? ['add', '--ignore-scripts', '--no-lockfile', archive]
      : ['install', '--ignore-scripts', '--package-lock=false', '--no-audit', '--no-fund', archive],
    { cwd: installRoot, stdio: 'inherit' },
  );

  const installedRoot = join(installRoot, 'node_modules', sourceManifest.name);
  const manifest = JSON.parse(await readFile(join(installedRoot, 'package.json'), 'utf8'));
  if (manifest.name !== sourceManifest.name || manifest.version !== sourceManifest.version) {
    throw new Error('fresh install produced an unexpected plugin manifest');
  }
  await Promise.all(
    [
      'THIRD_PARTY_NOTICES.md',
      'lib/index.js',
      'lib/client.js',
      'lib/types/index.d.ts',
      'lib/types/contracts/preview.d.ts',
      'lib/types/runs/editor-preview.d.ts',
      'cordis.patch.yml',
      'python/kicad_helper.py',
      'python/ipc_preview.py',
      'python/windows_compute.py',
      'python/compute_host.py',
      'lib/types/runs/resource-guard.d.ts',
      'python/dependencies.lock.json',
      'bundled/freerouting.LICENSE',
    ].map((file) => access(join(installedRoot, file))),
  );
  // The engine is supplied by KiCad (bin\freerouting.exe); shipping it again
  // would add ~240 MB to every install.
  for (const enginePath of ['bundled/freerouting.jar', 'bundled/jre', 'bundled/freerouting.build.json']) {
    const shipped = await stat(join(installedRoot, enginePath)).catch((error) => {
      if (error.code === 'ENOENT') {
        return undefined;
      }
      throw error;
    });
    if (shipped) {
      throw new Error('Plugin package must not ship the engine: ' + enginePath);
    }
  }
  if (manifest.license !== 'UNLICENSED') {
    throw new Error('Installed plugin must declare UNLICENSED');
  }
  const firstPartyLicense = await stat(join(installedRoot, 'LICENSE')).catch((error) => {
    if (error.code === 'ENOENT') {
      return undefined;
    }
    throw error;
  });
  if (firstPartyLicense) {
    throw new Error('UNLICENSED plugin package must not include the repository-root MIT license');
  }
  for (const directory of ['docs', 'engine', 'src', 'tests', 'scripts', 'bundled/freerouting-source.tar.gz']) {
    const developmentDirectory = await stat(join(installedRoot, directory)).catch((error) => {
      if (error.code === 'ENOENT') {
        return undefined;
      }
      throw error;
    });
    if (developmentDirectory) {
      throw new Error('Development directory included in runtime package: ' + directory);
    }
  }
  for (const [file, source] of [
    ['bundled/freerouting.LICENSE', 'engine/LICENSE'],
    ['THIRD_PARTY_NOTICES.md', 'THIRD_PARTY_NOTICES.md'],
  ]) {
    const installedNotice = await readFile(join(installedRoot, file));
    const sourceNotice = await readFile(join(packageRoot, source));
    if (!installedNotice.equals(sourceNotice)) {
      throw new Error(`Installed license or attribution differs from source: ${file}`);
    }
  }
  const entry = await import(pathToFileURL(join(installedRoot, 'lib/index.js')).href);
  if (entry.name !== sourceManifest.name || entry.inject.join(',') !== 'tools,systemPrompt,webServer,jobs') {
    throw new Error('Installed plugin exports do not match the IPC host contract');
  }
  const bundle = await readFile(join(installedRoot, 'lib/client.js'), 'utf8');
  if (!bundle.includes('id: "@huaqiu/dsh-tool-freerouting"') || !bundle.includes('pcb_route_nets')) {
    throw new Error('Installed browser bundle has the wrong package identity or tool views');
  }
  if (!bundle.includes('布线进度') || bundle.includes('重新读取预览')) {
    throw new Error('Installed browser bundle must show routing progress without the obsolete SVG preview');
  }
  const server = await readFile(join(installedRoot, 'lib/index.js'), 'utf8');
  if (!server.includes('clear-preview') || !server.includes('preview.ses')) {
    throw new Error('Installed server bundle is missing native editor preview updates or cleanup');
  }
  const patch = await readFile(join(installedRoot, 'cordis.patch.yml'), 'utf8');
  for (const service of entry.inject) {
    if (!patch.includes("'" + service + "'")) {
      throw new Error('Installed patch is missing required DSH service: ' + service);
    }
  }
  const python = process.env.DSH_IPC_TEST_PYTHON;
  if (!python) {
    throw new Error('DSH_IPC_TEST_PYTHON is required to verify installed native dependencies');
  }
  const verifyHelperStartup = (pluginRoot) => {
    // Exercise the real CLI, not only vendor imports: CPython's automatic
    // script-directory entry can lose the extended Windows path prefix.
    // An explicitly nonexistent socket proves startup without touching a PCB.
    const reply = JSON.parse(
      execaSync(python, ['-u', toNamespacedPath(join(pluginRoot, 'python/kicad_helper.py')), 'discover'], {
        windowsHide: true,
        timeout: 15000,
        maxBuffer: 65536,
        encoding: 'utf8',
        env: { ...process.env, PYTHONNOUSERSITE: '1', PYTHONDONTWRITEBYTECODE: '1', PYTHONUTF8: '1' },
        input: JSON.stringify({ socket: 'ipc://dsh-freerouting-install-test-missing.sock', token: '' }),
      }).stdout,
    );
    if (reply.ok !== false || reply.code !== 'KICAD_UNAVAILABLE') {
      throw new Error('Installed helper CLI did not finish preflight before checking the test socket');
    }
  };
  const verifyComputeStartup = (pluginRoot) => {
    const sample = JSON.parse(
      execaSync(python, ['-B', '-u', toNamespacedPath(join(pluginRoot, 'python/compute_host.py'))], {
        windowsHide: true,
        timeout: 15000,
        maxBuffer: 65536,
        encoding: 'utf8',
        input: JSON.stringify({ command: 'sample', pids: [process.pid] }),
        env: { ...process.env, PYTHONNOUSERSITE: '1', PYTHONUTF8: '1' },
      }).stdout,
    );
    if (!(sample.available > 0) || !sample.processes.some((item) => item.pid === process.pid && item.private > 0)) {
      throw new Error('Installed process ownership helper could not inspect the live host');
    }
  };
  verifyComputeStartup(installedRoot);
  verifyHelperStartup(installedRoot);
  const vendor = join(installedRoot, 'python', 'vendor');
  const code = `import sys,json,importlib.metadata\nfrom pathlib import Path\nsys.path[:0]=[str(Path(sys.argv[1]).parent),sys.argv[1]]\nimport runtime_dependencies,kipy,pynng,google.protobuf,psutil,win32job,win32api,pywintypes\nfor native in (psutil,win32job,win32api,pywintypes):\n assert Path(native.__file__).resolve().is_relative_to(Path(sys.argv[1]).resolve())\nlock=json.loads(Path(sys.argv[2]).read_text())\nfor p in lock['packages']:\n d=importlib.metadata.distribution(p['name'])\n assert d.version==p['version'] and Path(d.locate_file('')).resolve().is_relative_to(Path(sys.argv[1]).resolve())\n`;
  execaSync(python, ['-B', '-c', code, vendor, join(installedRoot, 'python/dependencies.lock.json')], {
    windowsHide: true,
    timeout: 15000,
    maxBuffer: 65536,
  });
  // Local tarball installs via pnpm expand the absolute source path into the
  // package directory. Exercise native imports beyond Windows MAX_PATH too.
  if (process.platform === 'win32') {
    const deepRoot = join(installRoot, ...Array(4).fill('pnpm-file-dependency-'.padEnd(64, 'x')));
    await cp(join(installedRoot, 'python'), join(deepRoot, 'python'), { recursive: true });
    verifyHelperStartup(deepRoot);
    verifyComputeStartup(deepRoot);
    execaSync(
      python,
      [
        '-B',
        '-c',
        code,
        toNamespacedPath(join(deepRoot, 'python/vendor')),
        toNamespacedPath(join(deepRoot, 'python/dependencies.lock.json')),
      ],
      { windowsHide: true, timeout: 15000, maxBuffer: 65536 },
    );
  }
  // Engine provenance is validated where the engine is produced
  // (package-windows-exe.ps1), not in the plugin archive.
  process.stdout.write('Fresh DSH plugin install verified\n');
} finally {
  await rm(installRoot, { recursive: true, force: true });
}
