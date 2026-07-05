// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { splitHighlight } from './splitHighlight';

describe('splitHighlight', () => {
  it('splits the string around the match', () => {
    expect(splitHighlight('«users.ts» has unsaved changes.', 'users.ts'))
      .toEqual({ before: '«', match: 'users.ts', after: '» has unsaved changes.' });
  });
  it('no match → null', () => { expect(splitHighlight('x', 'y')).toBeNull(); });
  it('highlight undefined → null', () => { expect(splitHighlight('x', undefined)).toBeNull(); });
});
