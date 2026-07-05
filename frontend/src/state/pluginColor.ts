// Palette for plugin icon tiles (Gruvbox family).
// The color is deterministic by id — no field in the manifest.

/** Gruvbox accents for rotating plugin tiles */
const PLUGIN_ACCENTS = [
  '#b8bb26', // gruvbox-yellow-green
  '#83a598', // gruvbox-aqua
  '#fabd2f', // gruvbox-yellow
  '#d3869b', // gruvbox-purple
  '#fe8019', // gruvbox-orange
  '#8ec07c', // gruvbox-green
] as const;

/**
 * Deterministic plugin tile color by its id.
 * Hash rotation over the PLUGIN_ACCENTS palette — one id always yields one color.
 */
export function pluginAccent(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) >>> 0;
  }
  return PLUGIN_ACCENTS[h % PLUGIN_ACCENTS.length];
}
