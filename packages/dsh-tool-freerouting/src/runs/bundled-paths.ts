import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Package `bundled/` directory; this file lives in lib/ or src/runs/ at runtime. */
export function getBundledRoot(): string {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const candidates = [join(currentDir, '..', 'bundled'), join(currentDir, '..', '..', 'bundled')];
  const primary = join(currentDir, '..', 'bundled');
  return candidates.find((candidate) => existsSync(join(candidate, 'freerouting.jar'))) ?? primary;
}

/** Resolve paths for bundled JRE and JAR */
export function getBundledPaths(): { javaExe: string; jarPath: string } {
  const root = getBundledRoot();
  return { javaExe: join(root, 'jre', 'bin', 'java.exe'), jarPath: join(root, 'freerouting.jar') };
}

/** Check if bundled resources exist */
export function hasBundledResources(): boolean {
  const { javaExe, jarPath } = getBundledPaths();
  return (
    existsSync(javaExe) &&
    existsSync(jarPath) &&
    existsSync(join(dirname(dirname(javaExe)), 'lib', 'jvm.cfg')) &&
    existsSync(join(dirname(dirname(javaExe)), 'lib', 'modules'))
  );
}
