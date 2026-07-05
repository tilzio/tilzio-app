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
