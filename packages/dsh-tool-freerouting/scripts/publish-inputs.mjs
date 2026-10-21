import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { runPackageManager } from './package-manager.mjs';

// The plugin package no longer ships the FreeRouting engine or its JRE: KiCad
// provides bin\freerouting.exe. A release therefore only needs the Windows
// Python vendor tree, which cannot be produced on macOS/Linux.
async function verifyPublishInputs(root) {
  await access(join(root, 'python/vendor/win32/lib/pywintypes.py'));
  await access(join(root, 'python/dependencies.lock.json'));
}

export async function preparePublishInputs(root, platform = process.platform) {
  try {
    await verifyPublishInputs(root);
    return;
  } catch (error) {
    if (platform !== 'win32') {
      throw new Error(
        'This checkout is missing the Windows Python vendor tree needed for a release. ' +
          'Prepare it on Windows with ' +
          'pnpm --filter @huaqiu/dsh-tool-freerouting package:plugin, copy python/vendor/ ' +
          'into the matching checkout, then rerun prepare:publish.',
        { cause: error },
      );
    }
  }
  await runPackageManager(['run', 'prepare:dependencies'], { cwd: root, stdio: 'inherit' });
  await verifyPublishInputs(root);
}
