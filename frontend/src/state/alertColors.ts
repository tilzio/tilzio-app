// Alert color palette (console highlight + badges). The key is stored in
// AppState.ui.alertColor; the hex is applied as the CSS variable --alert.
export const ALERT_COLORS = {
  cyan: '#2bd9c4',
  magenta: '#ff5fbf',
  purple: '#c77dff',
  green: '#b8bb26',
  red: '#fb4934',
  amber: '#fabd2f',
} as const;

export type AlertColorKey = keyof typeof ALERT_COLORS;
export const DEFAULT_ALERT_COLOR: AlertColorKey = 'cyan';

export function alertColorHex(key: AlertColorKey | undefined): string {
  return ALERT_COLORS[key as AlertColorKey] ?? ALERT_COLORS[DEFAULT_ALERT_COLOR];
}
