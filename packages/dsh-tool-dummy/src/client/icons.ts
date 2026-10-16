/**
 * Inline SVG glyphs for the dummy plugin (stroke-based, `currentColor`).
 *
 * Kept local on purpose: the dummy must stay dependency-light so a discovery
 * test can never fail for a reason unrelated to discovery itself.
 */

const FLASK_PATHS = [
  // Flask silhouette: neck, flare, rounded belly.
  'M6 2h4v3.2l2.6 5.4a2.8 2.8 0 0 1-2.5 4H5.9a2.8 2.8 0 0 1-2.5-4L6 5.2z',
  // Liquid line.
  'M4.6 9.8h6.8',
]

const CLOSE_PATHS = ['M3.5 3.5l9 9', 'M12.5 3.5l-9 9']

function strokeGlyph(size: number, paths: readonly string[], strokeWidth = 1): string {
  const d = paths.map((p) => `<path d="${p}"/>`).join('')
  return `<svg viewBox="0 0 16 16" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${d}</svg>`
}

/** Sidebar row glyph: a flask — reads as "test fixture" at 16px. */
export const FLASK_ICON = (size = 16): string => strokeGlyph(size, FLASK_PATHS)

/** Panel close glyph (matches the shell's medium-weight close icon). */
export const CLOSE_ICON = (size = 14): string => strokeGlyph(size, CLOSE_PATHS, 1.3)
