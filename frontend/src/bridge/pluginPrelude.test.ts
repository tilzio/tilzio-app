import { describe, it, expect } from 'vitest';
import { WORKER_PRELUDE } from './pluginPrelude';
import { PROTOCOL_VERSION } from './pluginProtocol';

describe('WORKER_PRELUDE', () => {
  it('is a non-empty string with the protocol version baked in', () => {
    expect(typeof WORKER_PRELUDE).toBe('string');
    expect(WORKER_PRELUDE).toContain(`var V = ${PROTOCOL_VERSION};`);
  });

  it('declares the ts.* MVP API', () => {
    for (const token of ['self.ts', 'onActivate', 'onDeactivate', 'ui', 'update', 'onEvent', 'storage', 'notify']) {
      expect(WORKER_PRELUDE).toContain(token);
    }
  });

  // Behavioral test: the prelude is an untyped JS string, a token-search doesn't catch
  // logic bugs. We execute it in a fake `self` (as in the worker) and check the RPC cycle.
  function runPrelude() {
    const posts: any[] = [];
    const self: any = { postMessage: (m: any) => posts.push(m), onmessage: null, ts: null };
    new Function('self', WORKER_PRELUDE)(self);
    return { self, posts };
  }

  it('rpc: notify posts a request and resolves on rpc-result', async () => {
    const { self, posts } = runPrelude();
    const p = self.ts.notify('hello');
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({ v: PROTOCOL_VERSION, type: 'rpc', method: 'notify', args: ['hello'] });
    self.onmessage({ data: { v: PROTOCOL_VERSION, type: 'rpc-result', id: posts[0].id, ok: true, result: 'ok' } });
    await expect(p).resolves.toBe('ok');
  });

  it('rpc: rejects on ok:false', async () => {
    const { self, posts } = runPrelude();
    const p = self.ts.storage.get('k');
    self.onmessage({ data: { v: PROTOCOL_VERSION, type: 'rpc-result', id: posts[0].id, ok: false, error: 'nope' } });
    await expect(p).rejects.toThrow('nope');
  });

  it('event activate calls the registered onActivate', () => {
    const { self } = runPrelude();
    let got: any = null;
    self.ts.onActivate((d: any) => { got = d; });
    self.onmessage({ data: { v: PROTOCOL_VERSION, type: 'event', name: 'activate', data: { pluginId: 'p1' } } });
    expect(got).toEqual({ pluginId: 'p1' });
  });

  it('ts.exec sends an rpc with method "exec" and [bin, args, opts]', () => {
    const { self, posts } = runPrelude();
    self.ts.exec('git', ['branch'], { cwd: '/r' });
    const rpc = posts.find((p: any) => p.type === 'rpc' && p.method === 'exec');
    expect(rpc).toBeTruthy();
    expect(rpc.args).toEqual(['git', ['branch'], { cwd: '/r' }]);
  });

  it('ts.state.get sends an rpc with method "state.get"', () => {
    const { self, posts } = runPrelude();
    self.ts.state.get();
    expect(posts.some((p: any) => p.type === 'rpc' && p.method === 'state.get')).toBe(true);
  });

  it('ts.terminal.paste/run send rpc without/with intent', () => {
    const { self, posts } = runPrelude();
    self.ts.terminal.paste('p1', 'x');
    self.ts.terminal.run('p1', 'y');
    expect(posts.some((p: any) => p.method === 'terminal.paste' && p.args[0] === 'p1' && p.args[1] === 'x')).toBe(true);
    expect(posts.some((p: any) => p.method === 'terminal.run' && p.args[1] === 'y')).toBe(true);
  });

  it('ts.state.onChange callback fires on a state-changed event', () => {
    const { self } = runPrelude();
    let got: any = null;
    self.ts.state.onChange((s: any) => { got = s; });
    self.onmessage({ data: { v: PROTOCOL_VERSION, type: 'event', name: 'state-changed', data: { activeSpaceId: 'sp1' } } });
    expect(got).toEqual({ activeSpaceId: 'sp1' });
  });

  it('ts.terminal.read sends rpc terminal.read', () => {
    const { self, posts } = runPrelude();
    self.ts.terminal.read('p1');
    expect(posts.some((p: any) => p.method === 'terminal.read' && p.args[0] === 'p1')).toBe(true);
  });

  it('onOutput: subscribeOutput + per-sub stream-decode (multibyte across the boundary) + off()', () => {
    const { self, posts } = runPrelude();
    const got: string[] = [];
    const off = self.ts.terminal.onOutput('p1', (c: string) => got.push(c));
    const sub = posts.find((p: any) => p.method === 'terminal.subscribeOutput');
    expect(sub).toBeTruthy();
    const subId = sub.args[1];
    // U+00E9 (é) = UTF-8 C3 A9, split across two events
    self.onmessage({ data: { v: PROTOCOL_VERSION, type: 'event', name: 'terminal-output', data: { subId, bytes: new Uint8Array([0xc3]) } } });
    self.onmessage({ data: { v: PROTOCOL_VERSION, type: 'event', name: 'terminal-output', data: { subId, bytes: new Uint8Array([0xa9]) } } });
    expect(got.join('')).toBe('\u00e9');       // reassembled, without U+FFFD
    off();
    self.onmessage({ data: { v: PROTOCOL_VERSION, type: 'event', name: 'terminal-output', data: { subId, bytes: new Uint8Array([0x41]) } } });
    expect(got.join('')).toBe('\u00e9');           // after off() it's not delivered
    expect(posts.some((p: any) => p.method === 'terminal.unsubscribe' && p.args[0] === subId)).toBe(true);
  });

  it('onExit: subscribeExit + event yields the code', () => {
    const { self, posts } = runPrelude();
    let code = -1;
    self.ts.terminal.onExit('p1', (c: number) => { code = c; });
    const sub = posts.find((p: any) => p.method === 'terminal.subscribeExit');
    expect(sub).toBeTruthy();
    self.onmessage({ data: { v: PROTOCOL_VERSION, type: 'event', name: 'terminal-exit', data: { subId: sub.args[1], code: 137 } } });
    expect(code).toBe(137);
  });

  it('stripAnsi removes CSI/SGR, text intact', () => {
    const { self } = runPrelude();
    // real ESC bytes (\x1b) — otherwise there's nothing to strip
    expect(self.ts.terminal.stripAnsi('\x1b[31merror\x1b[0m ok')).toBe('error ok');
  });
});
