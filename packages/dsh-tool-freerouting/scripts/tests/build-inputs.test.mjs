import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateEngineBuild, verifyBuildInputs } from '../build-inputs.mjs';

const source = { version: '2.5.0', patch_sources: { 'SesWriter.java': 'fixed-source' } };
const provenance = { source, upstream_tests_passed: true, output_sha256: 'built-jar' };

test('accepts a source-matching, checked engine build', () => {
  validateEngineBuild(provenance, source, 'built-jar');
});

test('rejects a JAR changed after the successful source build', () => {
  assert.throws(() => validateEngineBuild(provenance, source, 'different-jar'), /corrupt/);
});

test('rejects provenance from different patch sources', () => {
  const changedSource = { ...source, patch_sources: { 'SesWriter.java': 'new-source' } };
  assert.throws(() => validateEngineBuild(provenance, changedSource, 'built-jar'), /stale/);
});

test('rejects a build that omitted the upstream regression checks', () => {
  assert.throws(
    () => validateEngineBuild({ ...provenance, upstream_tests_passed: false }, source, 'built-jar'),
    /missing/,
  );
});

test('a source checkout reports how to prepare missing runtime inputs', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'freerouting-missing-inputs-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'engine'));
  await copyFile(new URL('../../engine/source.lock.json', import.meta.url), join(root, 'engine/source.lock.json'));
  await assert.rejects(verifyBuildInputs(root), (error) => {
    assert.match(error.message, /prepare:dependencies/);
    assert.match(error.message, /Windows/);
    assert.equal(error.cause.code, 'ENOENT');
    return true;
  });
});
