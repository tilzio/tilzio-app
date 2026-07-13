import { type AppState, type PaneNode, type Space, type Split, type Tab, type UiState, initialState } from './types';
import { collectLeaves } from './selectors';
import { clampSidebarWidth } from './sidebar';
import { clampBottomPanelHeight } from './bottomPanel';
import { clampRightAreaWidth } from './rightArea';
import { clampFontSize } from './appearance';

export function serialize(s: AppState): string {
  return JSON.stringify(s);
}

// --- Salvage + normalize (instead of all-or-nothing) -----------------------
// A hard failure here nukes the workspace: loadOrDefault → initialState → the
// 500ms autosave overwrites layout.json. So per-node/tab/space corruption is
// repaired or dropped individually; deserialize throws ONLY when nothing salvages.

// Per-node salvage: a normalized node, or null when hopeless (bad shape).
// Splits: dir coerced to 'h'|'v'; hopeless children dropped (none left → null);
// ratio replaced with equal shares unless it is an array of finite numbers >= 0
// matching children.length with sum > 0. Leaves: string kind + string id —
// unknown kinds are accepted for forward-compat (render dispatcher handles them).
function normalizeNode(n: unknown): PaneNode | null {
  if (!n || typeof n !== 'object') return null;
  const node = n as Record<string, unknown>;
  if (node.kind === 'split') {
    if (!Array.isArray(node.children)) return null;
    const children = node.children.map(normalizeNode).filter((c): c is PaneNode => c !== null);
    if (children.length === 0) return null;
    const dir: 'h' | 'v' = node.dir === 'h' || node.dir === 'v' ? node.dir : 'h';
    const r = node.ratio;
    const ratioOk = Array.isArray(r)
      && r.length === children.length
      && r.every((x) => typeof x === 'number' && Number.isFinite(x) && x >= 0)
      && (r as number[]).reduce((a, b) => a + b, 0) > 0;
    const ratio = ratioOk ? (r as number[]) : children.map(() => 1 / children.length);
    return { ...(node as unknown as Split), dir, children, ratio };
  }
  return typeof node.kind === 'string' && typeof node.id === 'string' ? (n as PaneNode) : null;
}

// Per-tab salvage: null when the root shape is hopeless. activePaneId must be a
// leaf of the tab (else the first leaf); zoomedPaneId likewise (else null — a
// dangling zoom would hide ALL cells: SplitContainer renders only the zoomed one).
function normalizeTab(t: unknown): Tab | null {
  if (!t || typeof t !== 'object') return null;
  const tab = t as Record<string, unknown>;
  const root = normalizeNode(tab.root);
  if (!root) return null;
  const leaves = collectLeaves(root);
  const ids = new Set(leaves.map((l) => l.id));
  const activePaneId =
    typeof tab.activePaneId === 'string' && ids.has(tab.activePaneId) ? tab.activePaneId : leaves[0].id;
  const zoomedPaneId =
    typeof tab.zoomedPaneId === 'string' && ids.has(tab.zoomedPaneId) ? tab.zoomedPaneId : null;
  return { ...(t as Tab), root, activePaneId, zoomedPaneId };
}

// Per-space salvage: null when hopeless (no string id / no tabs array / all tabs
// hopeless). activeTabId must exist among the surviving tabs (else the first one).
function normalizeSpace(sp: unknown): Space | null {
  if (!sp || typeof sp !== 'object') return null;
  const s = sp as Record<string, unknown>;
  if (typeof s.id !== 'string' || !Array.isArray(s.tabs)) return null;
  const tabs = s.tabs.map(normalizeTab).filter((t): t is Tab => t !== null);
  if (tabs.length === 0) return null;
  const activeTabId =
    typeof s.activeTabId === 'string' && tabs.some((t) => t.id === s.activeTabId)
      ? s.activeTabId
      : tabs[0].id;
  return { ...(sp as Space), tabs, activeTabId };
}

// Clamp bounds mirror the reducers' setters (setSidebarWidth/setBottomPanelHeight/
// setRightAreaWidth/set*FontSize) — the same ranges the UI enforces.
const UI_NUMERIC_CLAMPS: Record<string, (n: number) => number> = {
  sidebarWidth: clampSidebarWidth,
  bottomPanelHeight: clampBottomPanelHeight,
  rightAreaWidth: clampRightAreaWidth,
  uiFontSize: clampFontSize,
  termFontSize: clampFontSize,
  editorFontSize: clampFontSize,
};

// Clamp PRESENT numeric ui fields to their documented ranges; a present but
// non-numeric value is dropped (readUi then supplies the default). Absent or
// non-object ui stays absent (legacy layout.json without ui).
function normalizeUi(ui: unknown): UiState | undefined {
  if (!ui || typeof ui !== 'object') return undefined;
  const out: Record<string, unknown> = { ...(ui as Record<string, unknown>) };
  for (const [key, clamp] of Object.entries(UI_NUMERIC_CLAMPS)) {
    if (!(key in out)) continue;
    const v = out[key];
    if (typeof v === 'number') out[key] = clamp(v);
    else delete out[key];
  }
  return out as unknown as UiState;
}

export function deserialize(json: string): AppState {
  const obj = JSON.parse(json) as unknown;
  if (!obj || typeof obj !== 'object') throw new Error('invalid layout shape');
  const a = obj as Record<string, unknown>;
  if (!Array.isArray(a.spaces)) throw new Error('invalid layout shape');
  const spaces = a.spaces.map(normalizeSpace).filter((sp): sp is Space => sp !== null);
  if (spaces.length === 0) throw new Error('invalid layout shape'); // nothing salvages
  const activeSpaceId =
    typeof a.activeSpaceId === 'string' && spaces.some((sp) => sp.id === a.activeSpaceId)
      ? a.activeSpaceId
      : spaces[0].id;
  const out: AppState = { ...(obj as AppState), activeSpaceId, spaces };
  const ui = normalizeUi(a.ui);
  if (ui === undefined) delete out.ui;
  else out.ui = ui;
  return out;
}

export function loadOrDefault(json: string | null): AppState {
  if (!json) return initialState();
  try {
    return deserialize(json);
  } catch {
    return initialState();
  }
}
