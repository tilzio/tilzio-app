import { describe, it, expect } from 'vitest';
import { matchPaths, resolvePath, deriveHome, parseOsc7, joinPosix } from './pathLinks';

describe('matchPaths', () => {
  it('finds an absolute path', () => {
    const m = matchPaths('see /proj/src/app.ts for details');
    expect(m).toHaveLength(1);
    expect(m[0].path).toBe('/proj/src/app.ts');
    expect(m[0].line).toBeUndefined();
    expect('see /proj/src/app.ts for details'.slice(m[0].start, m[0].end)).toBe('/proj/src/app.ts');
  });

  it('splits a :line:col suffix off the path', () => {
    const m = matchPaths('/proj/app.ts:42:7: error');
    expect(m[0].path).toBe('/proj/app.ts');
    expect(m[0].line).toBe(42);
    expect(m[0].col).toBe(7);
    expect('/proj/app.ts:42:7: error'.slice(m[0].start, m[0].end)).toBe('/proj/app.ts:42:7');
  });

  it('parses :line without :col', () => {
    const m = matchPaths('at src/util.ts:10');
    expect(m[0].path).toBe('src/util.ts');
    expect(m[0].line).toBe(10);
    expect(m[0].col).toBeUndefined();
  });

  it('finds home and dot-relative paths', () => {
    expect(matchPaths('open ~/notes/todo.md')[0].path).toBe('~/notes/todo.md');
    expect(matchPaths('./a/b.go and ../c/d.go')[0].path).toBe('./a/b.go');
    expect(matchPaths('dir/file.ext ok')[0].path).toBe('dir/file.ext');
  });

  it('finds multiple paths on a line', () => {
    const m = matchPaths('/a/x.ts:1 and /b/y.ts:2');
    expect(m.map((p) => p.path)).toEqual(['/a/x.ts', '/b/y.ts']);
    expect(m.map((p) => p.line)).toEqual([1, 2]);
  });

  it('drops a trailing dot from a path at the end of prose', () => {
    const m = matchPaths('see /Users/me/notes.md.');
    expect(m[0].path).toBe('/Users/me/notes.md');
    expect('see /Users/me/notes.md.'.slice(m[0].start, m[0].end)).toBe('/Users/me/notes.md');
  });

  it('keeps a trailing .. segment intact', () => {
    expect(matchPaths('/a/b/..')[0].path).toBe('/a/b/..');
  });

  it('ignores a bare filename with no directory (minimise false positives)', () => {
    expect(matchPaths('just file.ts here')).toHaveLength(0);
  });

  it('ignores plain prose with no slash', () => {
    expect(matchPaths('this is normal text 1:2:3')).toHaveLength(0);
  });
});

describe('resolvePath', () => {
  it('returns an absolute path normalised', () => {
    expect(resolvePath('/proj/a/../b.ts', { cwd: '/x', home: '/Users/me' })).toBe('/proj/b.ts');
  });
  it('expands ~ via home', () => {
    expect(resolvePath('~/notes/t.md', { cwd: '/x', home: '/Users/me' })).toBe('/Users/me/notes/t.md');
    expect(resolvePath('~', { cwd: '/x', home: '/Users/me' })).toBe('/Users/me');
  });
  it('returns null for ~ when home is unknown', () => {
    expect(resolvePath('~/t.md', { cwd: '/x', home: null })).toBeNull();
  });
  it('joins a relative path against cwd', () => {
    expect(resolvePath('./a/b.go', { cwd: '/proj', home: null })).toBe('/proj/a/b.go');
    expect(resolvePath('../c/d.go', { cwd: '/proj/sub', home: null })).toBe('/proj/c/d.go');
    expect(resolvePath('dir/f.ext', { cwd: '/proj', home: null })).toBe('/proj/dir/f.ext');
  });
  it('returns null for a relative path when cwd is unknown', () => {
    expect(resolvePath('./a.go', { cwd: null, home: null })).toBeNull();
  });
});

describe('deriveHome', () => {
  it('derives macOS home', () => {
    expect(deriveHome('/Users/alice/proj/src')).toBe('/Users/alice');
  });
  it('derives Linux home and /root', () => {
    expect(deriveHome('/home/bob/x')).toBe('/home/bob');
    expect(deriveHome('/root/x')).toBe('/root');
  });
  it('returns null when not under a known home root', () => {
    expect(deriveHome('/tmp/x')).toBeNull();
    expect(deriveHome('relative/x')).toBeNull();
  });
});

describe('parseOsc7', () => {
  it('parses a file:// URI to its path', () => {
    expect(parseOsc7('file://host/Users/me/proj')).toBe('/Users/me/proj');
  });
  it('percent-decodes the path', () => {
    expect(parseOsc7('file://h/Users/me/a%20b')).toBe('/Users/me/a b');
  });
  it('accepts a bare absolute path', () => {
    expect(parseOsc7('/Users/me/proj')).toBe('/Users/me/proj');
  });
  it('rejects garbage', () => {
    expect(parseOsc7('not-a-path')).toBeNull();
  });
});

describe('joinPosix', () => {
  it('normalises . and ..', () => {
    expect(joinPosix('/a/b', '../c')).toBe('/a/c');
    expect(joinPosix('/a/b', './c')).toBe('/a/b/c');
  });
});
