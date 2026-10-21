import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { preparePublishInputs } from '../publish-inputs.mjs';

const VENDOR = {
  'python/vendor/win32/lib/pywintypes.py': 'vendor',
  'python/dependencies.lock.json': JSON.stringify({ packages: [] }),
};

async function sourceCheckout(t) {
  const root = await mkdtemp(join(tmpdir(), 'freerouting-publish-inputs-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

async function writeFiles(root, files) {
  for (const [name, content] of Object.entries(files)) {
    await mkdir(dirname(join(root, name)), { recursive: true });
    await writeFile(join(root, name), content);
  }
}

// Exercise the real package-manager subprocess boundary without building the
// vendor tree here; full preparation runs in package:plugin.
async function preparationCommand(t, root, files) {
  const entry = join(root, 'fixture-pnpm.mjs');
  await writeFile(join(root, 'fixture-runtime.json'), JSON.stringify(files));
  await writeFile(
    entry,
    `import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
assert.deepEqual(process.argv.slice(2), ['run', 'prepare:dependencies']);
const files = JSON.parse(await readFile('fixture-runtime.json', 'utf8'));
await writeFile('prepared.txt', 'prepared');
for (const [name, content] of Object.entries(files)) {
  await mkdir(dirname(name), { recursive: true });
  await writeFile(name, content);
}
`,
  );
  const original = process.env.npm_execpath;
  process.env.npm_execpath = entry;
  t.after(() => {
    if (original === undefined) {
      delete process.env.npm_execpath;
    } else {
      process.env.npm_execpath = original;
    }
  });
}

for (const platform of ['darwin', 'linux']) {
  test('a clean ' + platform + ' checkout fails with Windows preparation instructions', async (t) => {
    const root = await sourceCheckout(t);
    await assert.rejects(preparePublishInputs(root, platform), (error) => {
      assert.match(error.message, /Windows Python vendor tree/);
      assert.match(error.message, /python\/vendor/);
      return true;
    });
  });

  test('a ' + platform + ' publisher can reuse a prepared Windows vendor tree', async (t) => {
    const root = await sourceCheckout(t);
    await writeFiles(root, VENDOR);
    await preparePublishInputs(root, platform);
    await assert.rejects(access(join(root, 'prepared.txt')), { code: 'ENOENT' });
  });
}

test('a Windows publisher prepares missing inputs before returning', async (t) => {
  const root = await sourceCheckout(t);
  await preparationCommand(t, root, VENDOR);
  await preparePublishInputs(root, 'win32');
  assert.equal(await readFile(join(root, 'prepared.txt'), 'utf8'), 'prepared');
  await access(join(root, 'python/vendor/win32/lib/pywintypes.py'));
});

test('an existing prepared Windows vendor tree is reused without another build', async (t) => {
  const root = await sourceCheckout(t);
  await writeFiles(root, VENDOR);
  await preparationCommand(t, root, VENDOR);
  await preparePublishInputs(root, 'win32');
  await assert.rejects(access(join(root, 'prepared.txt')), { code: 'ENOENT' });
});

test('a preparation subprocess that leaves the vendor tree missing is rejected', async (t) => {
  const root = await sourceCheckout(t);
  await preparationCommand(t, root, {});
  await assert.rejects(preparePublishInputs(root, 'win32'), { code: 'ENOENT' });
});
