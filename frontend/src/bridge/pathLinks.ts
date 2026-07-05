// Pure detection and resolution of file paths in terminal output (Stage C, spec §6.2/§6.4).
// No I/O or DOM — existence is validated separately (linkResolve.checkPathExists).

export interface PathMatch {
  start: number; // index of the token's start in the string
  end: number;   // index of the token's end (including the :line:col suffix)
  path: string;  // path without the suffix
  line?: number;
  col?: number;
}

// Strict regex: the token must START like a path — `/…`, `~/…`, `./…`, `../…`
// or `segment/…` (relative with a slash). A bare `file.ts` is NOT a path (minimise
// false positives; §6.2). The tail is ordinary path characters; optional `:line[:col]` suffix.
// Designed for ONE terminal line (80–500 chars) — not for the whole buffer at once.
const TOKEN =
  /(?:~\/|\.\.?\/|\/|[\w@%+.-]+\/)[\w@%+./-]*(?::\d+(?::\d+)?)?/g;
const SUFFIX = /:(\d+)(?::(\d+))?$/;
// Trailing dots from prose ("see /a/b.ts.") — we trim them, WITHOUT touching a `/..`
// segment (in that case a `/` precedes the dots, so the lookbehind doesn't fire).
const TRAILING_DOTS = /(?<=[^/.])\.+$/;

export function matchPaths(line: string): PathMatch[] {
  const out: PathMatch[] = [];
  for (const m of line.matchAll(TOKEN)) {
    const token = m[0].replace(TRAILING_DOTS, '');
    const start = m.index ?? 0;
    const end = start + token.length;
    let path = token;
    let lineNo: number | undefined;
    let colNo: number | undefined;
    const sfx = SUFFIX.exec(token);
    if (sfx) {
      path = token.slice(0, sfx.index);
      lineNo = Number(sfx[1]);
      colNo = sfx[2] != null ? Number(sfx[2]) : undefined;
    }
    if (!path.includes('/')) continue;
    out.push({ start, end, path, line: lineNo, col: colNo });
  }
  return out;
}

// Collapses `.`/`..`: `base` is POSIX-absolute, `rel` is a relative segment.
// An absolute `rel` is NOT supported (it concatenates, doesn't replace) — use resolvePath for that.
export function joinPosix(base: string, rel: string): string {
  const segs = (base + '/' + rel).split('/');
  const stack: string[] = [];
  for (const s of segs) {
    if (s === '' || s === '.') continue;
    if (s === '..') stack.pop();
    else stack.push(s);
  }
  return '/' + stack.join('/');
}

export interface ResolveCtx {
  cwd: string | null;  // the pane's live cwd (OSC 7) or the leaf's start cwd
  home: string | null; // the derived home or null
}

// Turns a raw token into an absolute path (or null if there isn't enough context).
export function resolvePath(raw: string, ctx: ResolveCtx): string | null {
  if (raw.startsWith('/')) return joinPosix('/', raw);
  if (raw === '~' || raw.startsWith('~/')) {
    if (!ctx.home) return null;
    return raw === '~' ? ctx.home : joinPosix(ctx.home, raw.slice(2));
  }
  if (!ctx.cwd) return null;
  return joinPosix(ctx.cwd, raw);
}

// Derives the home root from an absolute path (best-effort, target macOS).
export function deriveHome(abs: string): string | null {
  let m = /^(\/Users\/[^/]+)/.exec(abs);
  if (m) return m[1];
  m = /^(\/home\/[^/]+)/.exec(abs);
  if (m) return m[1];
  if (abs === '/root' || abs.startsWith('/root/')) return '/root';
  return null;
}

// OSC 7 payload → absolute shell path (or null). `file://host/path` or a bare `/path`.
// The percent-decode is intentional (legitimate OSC 7 sends a normal file://); the path is
// still validated by StatFile (§6.4), so the decode introduces no threat.
export function parseOsc7(data: string): string | null {
  if (data.startsWith('file://')) {
    try {
      return decodeURIComponent(new URL(data).pathname) || null;
    } catch {
      return null;
    }
  }
  return data.startsWith('/') ? data : null;
}
