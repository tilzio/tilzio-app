import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createSandbox } from './pluginSandbox';

class FakeWorker {
  static last: FakeWorker | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: ((e: { message: string }) => void) | null = null;
  posted: unknown[] = [];
  terminated = false;
  constructor(public url: string) { FakeWorker.last = this; }
  postMessage(m: unknown) { this.posted.push(m); }
  terminate() { this.terminated = true; }
}

beforeEach(() => {
  FakeWorker.last = null;
  vi.stubGlobal('Worker', FakeWorker);
  vi.stubGlobal('Blob', class { constructor(public parts: unknown[], public opts: unknown) {} });
  vi.stubGlobal('URL', { createObjectURL: () => 'blob:fake', revokeObjectURL: () => {} });
});

afterEach(() => vi.unstubAllGlobals());

describe('createSandbox', () => {
  it('creates a worker, proxies post and terminate', () => {
    const sb = createSandbox('self.x=1', () => {}, () => {});
    expect(FakeWorker.last).not.toBeNull();
    sb.post({ v: 1, type: 'event', name: 'activate', data: {} });
    expect(FakeWorker.last!.posted).toHaveLength(1);
    sb.terminate();
    expect(FakeWorker.last!.terminated).toBe(true);
  });

  it('onMessage forwards data from worker', () => {
    const msgs: unknown[] = [];
    createSandbox('', (d) => msgs.push(d), () => {});
    FakeWorker.last!.onmessage!({ data: { hello: 1 } });
    expect(msgs).toEqual([{ hello: 1 }]);
  });

  it('onError forwards message', () => {
    const errs: string[] = [];
    createSandbox('', () => {}, (e) => errs.push(e));
    FakeWorker.last!.onerror!({ message: 'boom' });
    expect(errs).toEqual(['boom']);
  });
});
