import { afterEach, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { resolvePortableEngine } from '../src/runs/engine-command.js';

const directories: string[] = [];
const previousOverride = process.env.DSH_FREEROUTING_EXE;

afterEach(async () => {
  if (previousOverride === undefined) {
    delete process.env.DSH_FREEROUTING_EXE;
  } else {
    process.env.DSH_FREEROUTING_EXE = previousOverride;
  }
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function kicadBinWith(engine: boolean): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'fr-kicad-bin-'));
  directories.push(root);
  const bin = join(root, 'bin');
  await mkdir(bin, { recursive: true });
  await writeFile(join(bin, 'kicad.exe'), 'kicad');
  if (engine) {
    await writeFile(join(bin, 'freerouting.exe'), 'engine');
  }
  return bin;
}

it('finds the single-file engine next to kicad.exe', async () => {
  const bin = await kicadBinWith(true);
  expect(process.env.DSH_FREEROUTING_EXE).toBeUndefined();
  expect(resolvePortableEngine(bin)).toBe(join(bin, 'freerouting.exe'));
});

it('returns undefined when the KiCad bin directory has no engine', async () => {
  const bin = await kicadBinWith(false);
  expect(process.env.DSH_FREEROUTING_EXE).toBeUndefined();
  expect(resolvePortableEngine(bin)).toBeUndefined();
});

it('prefers the DSH_FREEROUTING_EXE override', async () => {
  const bin = await kicadBinWith(true);
  const override = join(bin, 'custom-engine.exe');
  await writeFile(override, 'engine');
  process.env.DSH_FREEROUTING_EXE = override;
  expect(resolvePortableEngine(bin)).toBe(override);
});
