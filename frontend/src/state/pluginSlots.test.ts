import { describe, it, expect } from 'vitest';
import { statusBarItems, breadcrumbItems, activityBarButtons, panelsFor, pluginViews, type PluginView } from './pluginSlots';
import { parseContributes } from './pluginContributions';

function view(id: string, contributesRaw: unknown, ui: Record<string, unknown> = {}): PluginView {
  return { id, contributes: parseContributes(contributesRaw), ui };
}

describe('statusBarItems', () => {
  it('groups by align, sorts by priority, resolves data', () => {
    const p = view('p', {
      statusBar: [
        { id: 'b', align: 'left', priority: 20 },
        { id: 'a', align: 'left', priority: 10 },
        { id: 'r', align: 'right', priority: 0 },
      ],
    }, {
      a: { text: 'AAA', icon: '🅰' }, b: { text: 'BBB' }, r: { text: 'RRR', tone: 'accent', command: 'go' },
    });
    const { left, right } = statusBarItems([p]);
    expect(left.map((i) => i.text)).toEqual(['AAA', 'BBB']); // priority 10 before 20
    expect(left[0]).toMatchObject({ pluginId: 'p', id: 'a', text: 'AAA', icon: '🅰' });
    expect(right[0]).toMatchObject({ id: 'r', text: 'RRR', tone: 'accent', command: 'go' });
  });

  it('an item without data (no text/icon) is not shown', () => {
    const p = view('p', { statusBar: [{ id: 'x', align: 'left', priority: 0 }] }, {});
    expect(statusBarItems([p]).left).toEqual([]);
  });

  it('color: a valid #rrggbb makes it into the data', () => {
    const p = view('p', { statusBar: [{ id: 'a', align: 'left', priority: 0 }] }, { a: { text: 'A', tone: 'accent', color: '#ABCDEF' } });
    expect(statusBarItems([p]).left[0]).toMatchObject({ text: 'A', tone: 'accent', color: '#abcdef' });
  });

  it('color: an invalid one is ignored (field absent)', () => {
    const p = view('p', { statusBar: [{ id: 'a', align: 'left', priority: 0 }] }, { a: { text: 'A', color: 'red' } });
    expect(statusBarItems([p]).left[0].color).toBeUndefined();
  });

  it('aggregates several plugins and sorts by priority across them', () => {
    const p1 = view('p1', { statusBar: [{ id: 'x', align: 'left', priority: 30 }] }, { x: { text: 'X' } });
    const p2 = view('p2', { statusBar: [{ id: 'y', align: 'left', priority: 5 }] }, { y: { text: 'Y' } });
    const { left } = statusBarItems([p1, p2]);
    expect(left.map((i) => i.text)).toEqual(['Y', 'X']); // priority 5 (p2) before 30 (p1)
  });

  it('runtime priority overrides the manifest one and changes the sort', () => {
    const p = view('p', {
      statusBar: [
        { id: 'a', align: 'left', priority: 10 },
        { id: 'b', align: 'left', priority: 20 },
      ],
    }, {
      a: { text: 'A', priority: 99 },  // runtime 99 → goes after B
      b: { text: 'B' },                // manifest 20
    });
    expect(statusBarItems([p]).left.map((i) => i.text)).toEqual(['B', 'A']);
  });
  it('without runtime priority the manifest one is kept', () => {
    const p = view('p', { statusBar: [{ id: 'a', align: 'left', priority: 5 }] }, { a: { text: 'A' } });
    expect(statusBarItems([p]).left[0].priority).toBe(5);
  });
  it('an invalid runtime priority (not a number) is ignored', () => {
    const p = view('p', { statusBar: [{ id: 'a', align: 'left', priority: 7 }] }, { a: { text: 'A', priority: 'x' } });
    expect(statusBarItems([p]).left[0].priority).toBe(7);
  });
});

describe('breadcrumbItems', () => {
  it('resolves from ui, skips items without data', () => {
    const p = view('p', { breadcrumb: [{ id: 'c' }, { id: 'd' }] }, { c: { text: 'HI', icon: '🌿' } });
    const out = breadcrumbItems([p]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ pluginId: 'p', id: 'c', text: 'HI', icon: '🌿' });
  });
});

describe('activityBarButtons', () => {
  it('takes icon/title/opens from the manifest (no data needed)', () => {
    const p = view('p', { activityBar: [{ id: 'btn', icon: '🎛', title: 'T', opens: 'panel' }] });
    expect(activityBarButtons([p])).toEqual([{ pluginId: 'p', id: 'btn', icon: '🎛', title: 'T', opens: 'panel' }]);
  });
});

describe('panelsFor', () => {
  it('filters by location and sanitizes widgets from ui', () => {
    const p = view('p', {
      panels: [{ id: 'pb', location: 'bottom', title: 'B' }, { id: 'pr', location: 'right', title: 'R' }],
    }, {
      pb: { widgets: [{ type: 'text', text: 'hi' }] },
      pr: { widgets: [{ type: 'bogus' }] },
    });
    const bottom = panelsFor([p], 'bottom');
    expect(bottom).toHaveLength(1);
    expect(bottom[0]).toMatchObject({ pluginId: 'p', id: 'pb', title: 'B' });
    expect(bottom[0].widgets).toEqual([{ type: 'text', text: 'hi', tone: 'default' }]);
    const right = panelsFor([p], 'right');
    expect(right[0].widgets).toEqual([]); // bogus dropped
  });
});

it('pluginViews flattens declared views across plugins', () => {
  const plugins = [{
    id: 'p1',
    contributes: { activityBar: [], statusBar: [], breadcrumb: [], panels: [],
      views: [{ id: 'main', title: 'T', entry: 'v.html' }] },
    ui: {},
  }];
  expect(pluginViews(plugins as any)).toEqual([{ pluginId: 'p1', viewId: 'main', title: 'T', entry: 'v.html' }]);
});

// --- Task 4: alert/fill/group + panel header ---
const mk = (ui: Record<string, unknown>, statusBar: any[] = [], panels: any[] = []): PluginView => ({
  id: 'p', ui, contributes: { activityBar: [], statusBar, breadcrumb: [], panels, commands: [] } as any,
});

it('status item resolves alert/fill/group', () => {
  const p = mk({ 'p.sb': { text: 'x', alert: true, fill: true, group: 'g1' } }, [{ id: 'p.sb', align: 'left', priority: 10 }]);
  const it = statusBarItems([p]).left[0];
  expect(it.alert).toBe(true); expect(it.fill).toBe(true); expect(it.group).toBe('g1');
});
it('panel resolves header', () => {
  const p = mk({ 'p.panel': { widgets: [], header: { title: 'T', icon: '⏱', actions: [{ icon: '⚙', command: 'p.s' }] } } }, [], [{ id: 'p.panel', location: 'right', title: 'T', render: 'widgets' }]);
  const panel = panelsFor([p], 'right')[0];
  expect(panel.header).toEqual({ title: 'T', icon: '⏱', actions: [{ icon: '⚙', command: 'p.s' }] });
});

describe('panelsFor carries render/entry (SP-B docked)', () => {
  const view = (panels: any[]) => ([{ id: 'p', contributes: { activityBar: [], statusBar: [], breadcrumb: [], panels, views: [] }, ui: {} }]);
  it('passes iframe render + entry through', () => {
    const out = panelsFor(view([{ id: 'd', location: 'right', title: 'D', render: 'iframe', entry: 'panel.html' }]) as any, 'right');
    expect(out[0]).toMatchObject({ id: 'd', render: 'iframe', entry: 'panel.html' });
  });
  it('widget panel resolves render widgets, no entry', () => {
    const out = panelsFor(view([{ id: 'w', location: 'right', title: 'W', render: 'widgets' }]) as any, 'right');
    expect(out[0].render).toBe('widgets');
    expect(out[0].entry).toBeUndefined();
  });
});
