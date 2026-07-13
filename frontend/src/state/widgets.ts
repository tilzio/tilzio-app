// Widget set for plugin panels (spec §5). Pure module: types + sanitizers.
// Plugin data is DATA: everything is coerced to the expected shape, broken values are dropped.
export type Tone = 'default' | 'accent' | 'success' | 'warn' | 'error' | 'pending';
const TONES: ReadonlySet<string> = new Set(['default', 'accent', 'success', 'warn', 'error', 'pending']);
const MAX_WIDGETS = 500;   // max number of widgets in a panel
const MAX_ITEMS = 2000;    // max length of any inner array (guard against RangeError)
const MAX_WIDGET_DEPTH = 8; // max nesting depth of reorder→widgets (guard against stack overflow)

export interface TextWidget { type: 'text'; text: string; label?: string; tone?: Tone }
export interface BadgeWidget { type: 'badge'; items: { text: string; tone?: Tone }[] }
export interface ListItem { text: string; icon?: string; badge?: string; tone?: Tone; command?: string; args?: unknown }
export interface ListWidget { type: 'list'; items: ListItem[] }
export interface ButtonItem { text: string; command: string; args?: unknown }
export interface ButtonsWidget { type: 'buttons'; items: ButtonItem[] }
export interface TableWidget { type: 'table'; columns: string[]; rows: string[][] }
export type ChartWidget =
  | { type: 'chart'; kind: 'line'; values: number[]; caption?: string }
  | { type: 'chart'; kind: 'bar'; bars: { label: string; value: number; tone?: Tone }[]; caption?: string; percent?: boolean }
  | { type: 'chart'; kind: 'ring'; segments: { label: string; value: number; tone?: Tone }[]; max?: number; caption?: string };
export interface ColorRowWidget { type: 'colorRow'; label?: string; value: string; command: string }
export interface MeterWidget { type: 'meter'; value: number; max: number; label?: string; text?: string; caption?: string; tone?: Tone; color?: string }
export interface ToggleWidget { type: 'toggle'; label?: string; value: boolean; command: string }
export interface SegmentedWidget { type: 'segmented'; label?: string; value: string; options: { value: string; label: string }[]; command: string }
export interface ReorderItem { id: string; text?: string; icon?: string; widgets?: Widget[]; alert?: boolean }
export interface ReorderWidget { type: 'reorder'; command: string; items: ReorderItem[]; card?: boolean }
export type Widget = TextWidget | BadgeWidget | ListWidget | ButtonsWidget | TableWidget | ChartWidget | ColorRowWidget | MeterWidget | ToggleWidget | SegmentedWidget | ReorderWidget;

// --- sanitizers (exported — reused in pluginSlots/pluginContributions) ---
export function cleanStr(v: unknown, max = 200): string {
  try { return String(v ?? '').slice(0, max); } catch { return ''; }
}
export function cleanNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
export function cleanTone(v: unknown): Tone {
  return TONES.has(v as string) ? (v as Tone) : 'default';
}
const HEX6 = /^#[0-9a-fA-F]{6}$/;
// Strict #rrggbb (lowercased) or undefined. Guards against CSS injection into inline styles.
export function cleanHexColor(v: unknown): string | undefined {
  return typeof v === 'string' && HEX6.test(v) ? v.toLowerCase() : undefined;
}
// SVG path data for an inline 24×24 icon (status chips, activity buttons). Whitelisted to
// path-data characters only (never markup) and length-capped — real brand marks
// (Simple Icons) run ~2.7k chars, so 4096 leaves headroom without inviting abuse.
const ICON_PATH_RE = /^[MmLlHhVvCcSsQqTtAaZz0-9\s,.\-+eE]+$/;
export function cleanIconPath(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const s = v.trim();
  if (!s || s.length > 4096 || !ICON_PATH_RE.test(s)) return undefined;
  return s;
}

export function toneColor(tone: Tone = 'default'): string {
  switch (tone) {
    case 'accent': return 'var(--accent)';
    case 'success': return 'var(--green)';
    case 'warn': return 'var(--amber)';
    case 'error': return 'var(--red)';
    case 'pending': return 'var(--cyan)';  // cyan tone for the pending state
    default: return 'var(--text)';
  }
}

export function asArray(v: unknown): unknown[] { return Array.isArray(v) ? v : []; }
export function asObj(v: unknown): Record<string, unknown> { return (v && typeof v === 'object') ? v as Record<string, unknown> : {}; }

function sanitizeWidget(raw: unknown, depth = 0): Widget | null {
  if (depth > MAX_WIDGET_DEPTH) return null; // nesting of reorder is too deep → drop (do not crash)
  const w = asObj(raw);
  switch (w.type) {
    case 'text':
      return { type: 'text', text: cleanStr(w.text), ...(w.label !== undefined ? { label: cleanStr(w.label) } : {}), tone: cleanTone(w.tone) };
    case 'badge':
      return { type: 'badge', items: asArray(w.items).slice(0, MAX_ITEMS).map((it) => { const o = asObj(it); return { text: cleanStr(o.text), tone: cleanTone(o.tone) }; }) };
    case 'list':
      return { type: 'list', items: asArray(w.items).slice(0, MAX_ITEMS).map((it) => {
        const o = asObj(it);
        const item: ListItem = { text: cleanStr(o.text), tone: cleanTone(o.tone) };
        if (o.icon !== undefined) item.icon = cleanStr(o.icon, 8);
        if (o.badge !== undefined) item.badge = cleanStr(o.badge, 16);
        if (typeof o.command === 'string') { item.command = cleanStr(o.command, 100); item.args = o.args; }
        return item;
      }) };
    case 'buttons':
      return { type: 'buttons', items: asArray(w.items).slice(0, MAX_ITEMS)
        .map((it) => asObj(it))
        .filter((o) => typeof o.command === 'string')
        .map((o) => ({ text: cleanStr(o.text), command: cleanStr(o.command, 100), args: o.args })) };
    case 'table':
      return { type: 'table',
        columns: asArray(w.columns).slice(0, MAX_ITEMS).map((c) => cleanStr(c)),
        rows: asArray(w.rows).slice(0, MAX_ITEMS).map((r) => asArray(r).slice(0, MAX_ITEMS).map((c) => cleanStr(c))) };
    case 'chart': {
      if (w.kind === 'line') return { type: 'chart', kind: 'line', values: asArray(w.values).slice(0, MAX_ITEMS).map(cleanNum), ...(w.caption !== undefined ? { caption: cleanStr(w.caption) } : {}) };
      if (w.kind === 'bar') return { type: 'chart', kind: 'bar', bars: asArray(w.bars).slice(0, MAX_ITEMS).map((b) => { const o = asObj(b); return { label: cleanStr(o.label), value: cleanNum(o.value), ...(o.tone !== undefined ? { tone: cleanTone(o.tone) } : {}) }; }), ...(w.caption !== undefined ? { caption: cleanStr(w.caption) } : {}), ...(w.percent === true ? { percent: true } : {}) };
      if (w.kind === 'ring') return { type: 'chart', kind: 'ring', segments: asArray(w.segments).slice(0, MAX_ITEMS).map((s) => { const o = asObj(s); return { label: cleanStr(o.label), value: cleanNum(o.value), ...(o.tone !== undefined ? { tone: cleanTone(o.tone) } : {}) }; }), ...(w.max !== undefined ? { max: cleanNum(w.max) } : {}), ...(w.caption !== undefined ? { caption: cleanStr(w.caption) } : {}) };
      return null;
    }
    case 'colorRow':
      return { type: 'colorRow', value: cleanStr(w.value, 32), command: cleanStr(w.command, 100), ...(w.label !== undefined ? { label: cleanStr(w.label) } : {}) };
    case 'meter': {
      const rawMax = w.max !== undefined ? cleanNum(w.max) : 100;
      const m: MeterWidget = { type: 'meter', value: cleanNum(w.value), max: rawMax > 0 ? rawMax : 100 };
      if (w.label !== undefined) m.label = cleanStr(w.label, 32);
      if (w.text !== undefined) m.text = cleanStr(w.text, 24);
      if (w.caption !== undefined) m.caption = cleanStr(w.caption, 48);
      if (w.tone !== undefined) m.tone = cleanTone(w.tone);
      const color = cleanHexColor(w.color);
      if (color) m.color = color;
      return m;
    }
    case 'toggle':
      return { type: 'toggle', value: Boolean(w.value), command: cleanStr(w.command, 100), ...(w.label !== undefined ? { label: cleanStr(w.label) } : {}) };
    case 'segmented':
      return { type: 'segmented', value: cleanStr(w.value, 100), command: cleanStr(w.command, 100),
        options: asArray(w.options).slice(0, MAX_ITEMS).map((o) => { const x = asObj(o); return { value: cleanStr(x.value, 100), label: cleanStr(x.label) }; }),
        ...(w.label !== undefined ? { label: cleanStr(w.label) } : {}) };
    case 'reorder':
      return { type: 'reorder', command: cleanStr(w.command, 100), ...(w.card === true ? { card: true } : {}), items: asArray(w.items).slice(0, MAX_ITEMS).map((it) => {
        const o = asObj(it);
        if (typeof o.id !== 'string' || o.id === '') return null;
        const item: ReorderItem = { id: cleanStr(o.id, 100) };
        if (o.text !== undefined) item.text = cleanStr(o.text);
        if (o.icon !== undefined) item.icon = cleanStr(o.icon, 8);
        if (Array.isArray(o.widgets)) item.widgets = o.widgets.slice(0, MAX_WIDGETS).map((x) => sanitizeWidget(x, depth + 1)).filter((x): x is Widget => x !== null);
        if (o.alert === true) item.alert = true;
        return item;
      }).filter((x): x is ReorderItem => x !== null) };
    default:
      return null;
  }
}

// Accepts data from ui[panelId] = { widgets: [...] }; returns the valid widgets.
export function sanitizeWidgets(raw: unknown): Widget[] {
  const widgets = asObj(raw).widgets;
  if (!Array.isArray(widgets)) return [];
  return widgets.slice(0, MAX_WIDGETS).map((w) => sanitizeWidget(w, 0)).filter((w): w is Widget => w !== null);
}
