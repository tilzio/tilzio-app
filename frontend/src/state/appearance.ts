// Appearance (settings ⚙): a palette of color presets + a "name|hex → hex" resolver,
// a set of font presets + a stack resolver, size clamp. Pure module (no Svelte),
// unit-tested like state/ratio.ts. Single source for SettingsDialog / App / readUi.
import { ALERT_COLORS } from './alertColors';

// Color value in UiState: a preset name (COLOR_PRESETS key) OR '#rrggbb'.
export type ColorValue = string;

// A single palette of presets for all three configurable colors. The base 6 come from
// alertColors (one source), plus orange (the default for the active pane).
export const COLOR_PRESETS: Record<string, string> = {
  orange: '#fe8019',
  ...ALERT_COLORS, // cyan, magenta, purple, green, red, amber
  aqua: '#83a598', // info color of the new design (NOT an alert preset)
};

// Defaults (preset names) for readUi.
export const ACTIVE_DEFAULT: ColorValue = 'orange';
export const EXIT_DEFAULT: ColorValue = 'red';
export const ALERT_DEFAULT: ColorValue = 'cyan';
// Default hex values for the resolveColor fallback (if the value is invalid).
export const ACTIVE_DEFAULT_HEX = COLOR_PRESETS[ACTIVE_DEFAULT]!;
export const EXIT_DEFAULT_HEX = COLOR_PRESETS[EXIT_DEFAULT]!;
export const ALERT_DEFAULT_HEX = COLOR_PRESETS[ALERT_DEFAULT]!;

const HEX6 = /^#[0-9a-fA-F]{6}$/;

// Preset name or hex → hex. Invalid/undefined → fallbackHex.
export function resolveColor(v: ColorValue | undefined, fallbackHex: string): string {
  if (!v) return fallbackHex;
  if (v.startsWith('#')) return HEX6.test(v) ? v : fallbackHex;
  return COLOR_PRESETS[v] ?? fallbackHex;
}

// Title fonts: 9 presets (8 macOS system fonts + JetBrains Mono) with fallbacks.
export const FONT_PRESETS = [
  { key: 'mono',      label: 'Mono',          stack: 'ui-monospace, Menlo, monospace' },
  { key: 'jetbrains', label: 'JetBrains Mono', stack: "'JetBrains Mono', ui-monospace, Menlo, monospace" },
  { key: 'sans',     label: 'Sans',     stack: 'system-ui, -apple-system, sans-serif' },
  { key: 'serif',    label: 'Serif',    stack: 'Georgia, serif' },
  { key: 'courier',  label: 'Courier',  stack: '"Courier New", monospace' },
  { key: 'avenir',   label: 'Avenir',   stack: 'Avenir, "Avenir Next", sans-serif' },
  { key: 'palatino', label: 'Palatino', stack: 'Palatino, "Palatino Linotype", serif' },
  { key: 'rounded',  label: 'Rounded',  stack: '"Arial Rounded MT Bold", "Helvetica Rounded", sans-serif' },
  { key: 'chalk',    label: 'Chalk',    stack: '"Chalkboard SE", "Comic Sans MS", cursive' },
] as const;

export type FontKey = typeof FONT_PRESETS[number]['key'];
export const FONT_DEFAULT: FontKey = 'jetbrains';

const FONT_STACK_BY_KEY: Record<string, string> =
  Object.fromEntries(FONT_PRESETS.map((f) => [f.key, f.stack]));

// Preset key → CSS font-family stack. Unknown/undefined → mono.
export function fontStack(key: FontKey | undefined): string {
  return (key && FONT_STACK_BY_KEY[key]) || FONT_STACK_BY_KEY[FONT_DEFAULT];
}

export const FONT_SIZE_MIN = 9;
export const FONT_SIZE_MAX = 24;
export const FONT_SIZE_DEFAULT = 13;

// Clamp the size to [MIN, MAX] (rounding); NaN/0/invalid → default.
export function clampFontSize(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return FONT_SIZE_DEFAULT;
  return Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, Math.round(n)));
}
