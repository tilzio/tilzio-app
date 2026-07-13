import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./files', () => ({
  files: { statFile: vi.fn() },
}));

import { linkCwd, linkHome, checkPathExists, __resetForTests } from './linkResolve';
import { files } from './files';

beforeEach(() => {
  __resetForTests();
  vi.clearAllMocks();
});

describe('linkCwd', () => {
  it('stores and reads per-pane cwd; delete clears it', () => {
    linkCwd.set('p1', '/proj');
    expect(linkCwd.get('p1')).toBe('/proj');
    linkCwd.delete('p1');
    expect(linkCwd.get('p1')).toBeUndefined();
  });
  it('ignores an empty cwd (would resolve to a false /rel)', () => {
    linkCwd.set('p1', '');
    expect(linkCwd.get('p1')).toBeUndefined();
  });
});

describe('linkHome', () => {
  it('derives home once from an absolute path and keeps it', () => {
    linkHome.setFrom('/Users/me/proj/src');
    expect(linkHome.get()).toBe('/Users/me');
    linkHome.setFrom('/tmp/x');
    expect(linkHome.get()).toBe('/Users/me');
  });
  it('stays null for a path with no known home root', () => {
    linkHome.setFrom('/tmp/x');
    expect(linkHome.get()).toBeNull();
  });
});

describe('checkPathExists', () => {
  it('returns true for an existing file and caches the result', async () => {
    (files.statFile as ReturnType<typeof vi.fn>).mockResolvedValue({ exists: true, isDir: false });
    expect(await checkPathExists('/proj/a.ts')).toBe(true);
    expect(await checkPathExists('/proj/a.ts')).toBe(true);
    expect(files.statFile).toHaveBeenCalledTimes(1);
  });
  it('returns false for a directory', async () => {
    (files.statFile as ReturnType<typeof vi.fn>).mockResolvedValue({ exists: true, isDir: true });
    expect(await checkPathExists('/proj/dir')).toBe(false);
  });
  it('returns false for a missing path', async () => {
    (files.statFile as ReturnType<typeof vi.fn>).mockResolvedValue({ exists: false, isDir: false });
    expect(await checkPathExists('/nope')).toBe(false);
  });
  it('returns false when statFile rejects', async () => {
    (files.statFile as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('boom'));
    expect(await checkPathExists('/err')).toBe(false);
  });
  it('caches a false result and does not re-call statFile', async () => {
    (files.statFile as ReturnType<typeof vi.fn>).mockResolvedValue({ exists: false, isDir: false });
    expect(await checkPathExists('/gone')).toBe(false);
    expect(await checkPathExists('/gone')).toBe(false);
    expect(files.statFile).toHaveBeenCalledTimes(1);
  });
  it('shares one in-flight statFile for concurrent calls (Promise cache)', async () => {
    (files.statFile as ReturnType<typeof vi.fn>).mockResolvedValue({ exists: true, isDir: false });
    const [a, b] = await Promise.all([checkPathExists('/proj/x.ts'), checkPathExists('/proj/x.ts')]);
    expect(a).toBe(true);
    expect(b).toBe(true);
    expect(files.statFile).toHaveBeenCalledTimes(1);
  });
});

describe('checkPathExists — TTL + cap', () => {
  afterEach(() => vi.useRealTimers());

  it('re-checks an entry after the TTL expires (files created later become clickable)', async () => {
    vi.useFakeTimers();
    (files.statFile as ReturnType<typeof vi.fn>).mockResolvedValue({ exists: false, isDir: false });
    expect(await checkPathExists('/proj/new.ts')).toBe(false);
    expect(await checkPathExists('/proj/new.ts')).toBe(false); // still cached
    expect(files.statFile).toHaveBeenCalledTimes(1);
    // The file is created later; after the TTL the cache must re-stat.
    (files.statFile as ReturnType<typeof vi.fn>).mockResolvedValue({ exists: true, isDir: false });
    vi.advanceTimersByTime(31_000);
    expect(await checkPathExists('/proj/new.ts')).toBe(true);
    expect(files.statFile).toHaveBeenCalledTimes(2);
  });

  it('serves a fresh entry from cache within the TTL', async () => {
    vi.useFakeTimers();
    (files.statFile as ReturnType<typeof vi.fn>).mockResolvedValue({ exists: true, isDir: false });
    await checkPathExists('/proj/a.ts');
    vi.advanceTimersByTime(29_000); // < 30s → still fresh
    await checkPathExists('/proj/a.ts');
    expect(files.statFile).toHaveBeenCalledTimes(1);
  });

  it('evicts the oldest entry once the cap (500) is exceeded', async () => {
    (files.statFile as ReturnType<typeof vi.fn>).mockResolvedValue({ exists: true, isDir: false });
    for (let i = 0; i < 500; i++) await checkPathExists(`/f${i}`);
    expect(files.statFile).toHaveBeenCalledTimes(500);
    await checkPathExists('/f0'); // hit — still cached at exactly the cap
    expect(files.statFile).toHaveBeenCalledTimes(500);
    await checkPathExists('/f500'); // 501st entry → evicts the oldest (/f0)
    expect(files.statFile).toHaveBeenCalledTimes(501);
    await checkPathExists('/f0'); // evicted → re-stat
    expect(files.statFile).toHaveBeenCalledTimes(502);
    await checkPathExists('/f499'); // never evicted → cache hit
    expect(files.statFile).toHaveBeenCalledTimes(502);
  });
});
