import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { getBundledRoot } from './bundled-paths.js';

/**
 * Locate the single-file engine wrapper built by
 * `scripts/package-windows-exe.ps1 -Type portable`.
 *
 * The wrapper embeds the jpackage app image (launcher + app/freerouting.jar +
 * runtime/) and unpacks it once into `%LOCALAPPDATA%\FreeRouting\engine`.
 * It accepts plain FreeRouting arguments, so callers must not pass `-jar`,
 * `-Xmx` or other JVM flags that only make sense when starting Java directly.
 *
 * Search order: explicit environment override, the KiCad `bin` directory the
 * plugin already runs from, then the plugin's own `bundled/` directory.
 */
export function resolvePortableEngine(kicadBinDirectory?: string): string | undefined {
  const candidates: string[] = [];
  const configured = process.env.DSH_FREEROUTING_EXE;
  if (configured) {
    candidates.push(configured);
  }
  if (kicadBinDirectory) {
    // KiCad packaging installs the engine next to kicad.exe.
    candidates.push(join(kicadBinDirectory, 'freerouting.exe'));
  }
  candidates.push(join(getBundledRoot(), 'freerouting.exe'));
  return candidates.find((candidate) => existsSync(candidate));
}
