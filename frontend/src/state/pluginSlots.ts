// Pure selectors: from active plugins (declarations + ui data), assemble the
// render-ready items for each slot (spec §6). No Svelte/reactivity.
import type { Contributions } from './pluginContributions';
import { cleanStr, cleanTone, cleanHexColor, cleanIconPath, sanitizeWidgets, asObj, asArray, type Tone, type Widget } from './widgets';

export interface PluginView { id: string; contributes: Contributions; ui: Record<string, unknown> }

export interface ResolvedStatusItem { pluginId: string; id: string; align: 'left' | 'right'; priority: number; text: string; icon?: string; iconPath?: string; iconColor?: string; tone: Tone; command?: string; color?: string; alert?: boolean; fill?: boolean; group?: string }
export interface ResolvedBreadcrumbItem { pluginId: string; id: string; text: string; icon?: string; tone: Tone; command?: string; color?: string }
export interface ResolvedActivityButton { pluginId: string; id: string; icon: string; iconPath?: string; title: string; opens: string }
export interface ResolvedPanel { pluginId: string; id: string; title: string; location: 'bottom' | 'right'; render?: 'widgets' | 'iframe'; entry?: string; widgets: Widget[]; header?: { title?: string; icon?: string; actions: { icon: string; command: string; args?: unknown }[] } }

// A bar item (status/breadcrumb) is shown only when its data has text or an icon.
function barData(ui: Record<string, unknown>, id: string): { text: string; icon?: string; iconPath?: string; iconColor?: string; tone: Tone; command?: string; color?: string; alert?: boolean; fill?: boolean; group?: string } | null {
  const d = asObj(ui[id]);
  const text = cleanStr(d.text);
  const icon = d.icon !== undefined ? cleanStr(d.icon, 8) : undefined;
  const iconPath = cleanIconPath(d.iconPath);
  if (!text && !icon && !iconPath) return null;
  const out: { text: string; icon?: string; iconPath?: string; iconColor?: string; tone: Tone; command?: string; color?: string; alert?: boolean; fill?: boolean; group?: string } = { text, tone: cleanTone(d.tone) };
  if (icon) out.icon = icon;
  if (iconPath) {
    out.iconPath = iconPath;
    const ic = cleanHexColor(d.iconColor);
    if (ic) out.iconColor = ic;
  }
  if (typeof d.command === 'string') out.command = cleanStr(d.command, 100);
  const color = cleanHexColor(d.color);
  if (color) out.color = color;
  if (d.alert === true) out.alert = true;
  if (d.fill === true) out.fill = true;
  if (typeof d.group === 'string' && d.group) out.group = cleanStr(d.group, 32);
  return out;
}

export function statusBarItems(plugins: PluginView[]): { left: ResolvedStatusItem[]; right: ResolvedStatusItem[] } {
  const all: ResolvedStatusItem[] = [];
  for (const p of plugins) {
    for (const d of p.contributes.statusBar) {
      const data = barData(p.ui, d.id);
      if (!data) continue;
      const raw = asObj(p.ui[d.id]);
      const priority = (typeof raw.priority === 'number' && Number.isFinite(raw.priority)) ? raw.priority : d.priority;
      all.push({ pluginId: p.id, id: d.id, align: d.align, priority, ...data });
    }
  }
  const byPriority = (a: ResolvedStatusItem, b: ResolvedStatusItem) => a.priority - b.priority;
  return {
    left: all.filter((i) => i.align === 'left').sort(byPriority),
    right: all.filter((i) => i.align === 'right').sort(byPriority),
  };
}

export function breadcrumbItems(plugins: PluginView[]): ResolvedBreadcrumbItem[] {
  const out: ResolvedBreadcrumbItem[] = [];
  for (const p of plugins) {
    for (const d of p.contributes.breadcrumb) {
      const data = barData(p.ui, d.id);
      if (data) out.push({ pluginId: p.id, id: d.id, ...data });
    }
  }
  return out;
}

export function activityBarButtons(plugins: PluginView[]): ResolvedActivityButton[] {
  const out: ResolvedActivityButton[] = [];
  for (const p of plugins) {
    for (const d of p.contributes.activityBar) {
      out.push({ pluginId: p.id, id: d.id, icon: d.icon, ...(d.iconPath ? { iconPath: d.iconPath } : {}), title: d.title, opens: d.opens });
    }
  }
  return out;
}

export function pluginViews(plugins: PluginView[]): { pluginId: string; viewId: string; title: string; entry: string }[] {
  const out: { pluginId: string; viewId: string; title: string; entry: string }[] = [];
  for (const p of plugins) {
    for (const d of p.contributes.views) {
      out.push({ pluginId: p.id, viewId: d.id, title: d.title, entry: d.entry });
    }
  }
  return out;
}

export function panelsFor(plugins: PluginView[], location: 'bottom' | 'right'): ResolvedPanel[] {
  const out: ResolvedPanel[] = [];
  for (const p of plugins) {
    for (const d of p.contributes.panels) {
      if (d.location !== location) continue;
      const pd = asObj(p.ui[d.id]);
      const h = asObj(pd.header);
      const actions = asArray(h.actions).slice(0, 8).map((a) => { const x = asObj(a); return { icon: cleanStr(x.icon, 8), command: cleanStr(x.command, 100), ...(x.args !== undefined ? { args: x.args } : {}) }; }).filter((a) => a.command);
      const header = (h.title !== undefined || h.icon !== undefined || actions.length) ? { ...(h.title !== undefined ? { title: cleanStr(h.title, 40) } : {}), ...(h.icon !== undefined ? { icon: cleanStr(h.icon, 8) } : {}), actions } : undefined;
      out.push({ pluginId: p.id, id: d.id, title: d.title, location, render: d.render, ...(d.entry ? { entry: d.entry } : {}), widgets: d.render === 'iframe' ? [] : sanitizeWidgets(p.ui[d.id]), ...(header ? { header } : {}) });
    }
  }
  return out;
}
