import { describe, it, expect } from 'vitest';
import { parseOpens } from './pluginOpens';

describe('parseOpens', () => {
  it('view:<id> → view', () => expect(parseOpens('view:main')).toEqual({ kind: 'view', target: 'main' }));
  it('bare id → panel', () => expect(parseOpens('watch.panel')).toEqual({ kind: 'panel', target: 'watch.panel' }));
  it('empty → panel with empty target', () => expect(parseOpens('')).toEqual({ kind: 'panel', target: '' }));
});
