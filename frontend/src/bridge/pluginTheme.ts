// Gruvbox tokens handed to plugin iframes as --ts-* CSS variables (spec §7).
// Mirrors frontend/src/styles/theme.css. When multi-theme lands, read these from
// getComputedStyle(document.documentElement) instead of the constant.
export const TS_THEME_TOKENS: Record<string, string> = {
  '--ts-bg': '#282828',
  '--ts-bg-elevated': '#32302f',
  '--ts-text': '#ebdbb2',
  '--ts-text-dim': '#a89984',
  '--ts-accent': '#fe8019',
  '--ts-border': '#3c3836',
  '--ts-radius': '4px',
  '--ts-green': '#b8bb26',
  '--ts-red': '#fb4934',
  '--ts-aqua': '#83a598',
  '--ts-amber': '#fabd2f',
};

// Post the theme into a plugin iframe window. Data-only; the injected host prelude
// applies matching --ts-* keys via style.setProperty.
export function postTheme(win: Window): void {
  win.postMessage({ __tsview: 1, data: { type: 'ts:theme', tokens: TS_THEME_TOKENS } }, '*');
}
