import { describe, it, expect } from 'vitest';
import { parseContributes, EMPTY_CONTRIBUTIONS } from './pluginContributions';

describe('parseContributes', () => {
  it('undefined / non-object → empty slots', () => {
    expect(parseContributes(undefined)).toEqual(EMPTY_CONTRIBUTIONS);
    expect(parseContributes(42)).toEqual(EMPTY_CONTRIBUTIONS);
  });

  it('ignores unknown slots, parses known ones', () => {
    const c = parseContributes({
      unknownSlot: [{ id: 'z' }],
      activityBar: [{ id: 'a.btn', icon: '🎛', title: 'A', opens: 'a.panel' }],
    });
    expect(c.activityBar).toEqual([{ id: 'a.btn', icon: '🎛', title: 'A', opens: 'a.panel' }]);
    expect(c.statusBar).toEqual([]);
  });

  it('activityBar: valid iconPath is kept; markup or oversized data is dropped', () => {
    const path = 'M4.21 17.5A9 9 0 1 1 19.79 17.5Z';
    const c = parseContributes({ activityBar: [
      { id: 'a', icon: '◷', title: 'A', opens: 'p', iconPath: path },
      { id: 'b', icon: '◷', title: 'B', opens: 'p', iconPath: '<script>alert(1)</script>' },
      { id: 'c', icon: '◷', title: 'C', opens: 'p', iconPath: 'M'.repeat(5000) },
    ] });
    expect(c.activityBar[0]).toEqual({ id: 'a', icon: '◷', title: 'A', opens: 'p', iconPath: path });
    expect(c.activityBar[1]).toEqual({ id: 'b', icon: '◷', title: 'B', opens: 'p' });
    expect(c.activityBar[2]).toEqual({ id: 'c', icon: '◷', title: 'C', opens: 'p' });
  });

  it('statusBar: align defaults to left, priority defaults to 0', () => {
    const c = parseContributes({ statusBar: [{ id: 's1' }, { id: 's2', align: 'right', priority: 5 }] });
    expect(c.statusBar).toEqual([
      { id: 's1', align: 'left', priority: 0 },
      { id: 's2', align: 'right', priority: 5 },
    ]);
  });

  it('panels: location defaults to bottom, render=widgets', () => {
    const c = parseContributes({ panels: [{ id: 'p1', title: 'P' }, { id: 'p2', location: 'right', title: 'Q' }] });
    expect(c.panels).toEqual([
      { id: 'p1', location: 'bottom', title: 'P', render: 'widgets' },
      { id: 'p2', location: 'right', title: 'Q', render: 'widgets' },
    ]);
  });

  it('drops items without a string id', () => {
    const c = parseContributes({ breadcrumb: [{ id: 'b1' }, { foo: 1 }, { id: 2 }] });
    expect(c.breadcrumb).toEqual([{ id: 'b1', align: 'right' }]);
  });

  it('parses contributes.views with id/title/entry, drops idless', () => {
    const c = parseContributes({ views: [
      { id: 'main', title: 'My Tool', entry: 'view.html' },
      { title: 'no id' },
    ] });
    expect(c.views).toEqual([{ id: 'main', title: 'My Tool', entry: 'view.html' }]);
  });
  it('EMPTY_CONTRIBUTIONS has views: []', () => {
    expect(EMPTY_CONTRIBUTIONS.views).toEqual([]);
  });
});

describe('PanelDecl render/entry (SP-B docked)', () => {
  it('defaults render to widgets when omitted', () => {
    const c = parseContributes({ panels: [{ id: 'a', location: 'right', title: 'A' }] });
    expect(c.panels[0]).toMatchObject({ id: 'a', location: 'right', render: 'widgets' });
    expect(c.panels[0].entry).toBeUndefined();
  });
  it('parses an iframe panel with entry', () => {
    const c = parseContributes({ panels: [{ id: 'd', location: 'right', title: 'D', render: 'iframe', entry: 'panel.html' }] });
    expect(c.panels[0]).toMatchObject({ id: 'd', render: 'iframe', entry: 'panel.html' });
  });
  it('drops an iframe panel with no entry (keeps siblings)', () => {
    const c = parseContributes({ panels: [
      { id: 'bad', location: 'right', title: 'B', render: 'iframe' },
      { id: 'ok', location: 'right', title: 'O' },
    ] });
    expect(c.panels.map((p) => p.id)).toEqual(['ok']);
  });
});
