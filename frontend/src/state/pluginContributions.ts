// Contribution declarations from manifest.contributes (spec §4). Pure parser/validator:
// opaque JSON → typed slots; broken items and unknown slots are dropped.
import { cleanStr, cleanNum, asArray, asObj } from './widgets';

export interface ActivityBarItem { id: string; icon: string; title: string; opens: string }
export interface StatusBarItem { id: string; align: 'left' | 'right'; priority: number }
export interface BreadcrumbItem { id: string; align: 'right' }
export interface PanelDecl { id: string; location: 'bottom' | 'right'; title: string; render: 'widgets' }
export interface ViewDecl { id: string; title: string; entry: string }
export interface Contributions {
  activityBar: ActivityBarItem[];
  statusBar: StatusBarItem[];
  breadcrumb: BreadcrumbItem[];
  panels: PanelDecl[];
  views: ViewDecl[];
}

export const EMPTY_CONTRIBUTIONS: Contributions = { activityBar: [], statusBar: [], breadcrumb: [], panels: [], views: [] };

// An item is valid only with a non-empty string id.
function withId(raw: unknown): Record<string, unknown> | null {
  const o = asObj(raw);
  return typeof o.id === 'string' && o.id.length > 0 ? o : null;
}

export function parseContributes(raw: unknown): Contributions {
  const c = asObj(raw);
  return {
    activityBar: asArray(c.activityBar).map(withId).filter((o): o is Record<string, unknown> => o !== null)
      .map((o) => ({ id: o.id as string, icon: cleanStr(o.icon, 8), title: cleanStr(o.title), opens: cleanStr(o.opens) })),
    statusBar: asArray(c.statusBar).map(withId).filter((o): o is Record<string, unknown> => o !== null)
      .map((o) => ({ id: o.id as string, align: o.align === 'right' ? 'right' : 'left', priority: cleanNum(o.priority) })),
    breadcrumb: asArray(c.breadcrumb).map(withId).filter((o): o is Record<string, unknown> => o !== null)
      .map((o) => ({ id: o.id as string, align: 'right' as const })),
    panels: asArray(c.panels).map(withId).filter((o): o is Record<string, unknown> => o !== null)
      .map((o) => ({ id: o.id as string, location: o.location === 'right' ? 'right' : 'bottom', title: cleanStr(o.title), render: 'widgets' as const })),
    views: asArray(c.views).map(withId).filter((o): o is Record<string, unknown> => o !== null)
      .map((o) => ({ id: o.id as string, title: cleanStr(o.title), entry: cleanStr(o.entry) })),
  };
}
