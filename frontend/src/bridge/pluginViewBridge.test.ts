import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { pluginViewBridge } from './pluginViewBridge';

function fakeWin(): Window {
  const w: any = { postMessage: vi.fn() };
  return w as Window;
}

describe('pluginViewBridge', () => {
  beforeEach(() => pluginViewBridge.__resetForTests());

  it('postToFrame delivers to the registered iframe window by frameId', () => {
    const win = fakeWin();
    pluginViewBridge.register('pane1', 'p1', win);
    pluginViewBridge.postToFrame('pane1', { hello: 1 });
    expect(win.postMessage as any).toHaveBeenCalledWith({ __tsview: 1, data: { hello: 1 } }, '*');
  });

  it('buffers messages sent before register, flushes on register in order', () => {
    pluginViewBridge.postToFrame('pane1', { n: 1 });
    pluginViewBridge.postToFrame('pane1', { n: 2 });
    const win = fakeWin();
    pluginViewBridge.register('pane1', 'p1', win);
    expect((win.postMessage as any).mock.calls.map((c: any[]) => c[0].data)).toEqual([{ n: 1 }, { n: 2 }]);
  });

  it('routes an inbound iframe message to the worker stamped with frameId', () => {
    const poster = vi.fn();
    pluginViewBridge.setWorkerPoster(poster);
    const win = fakeWin();
    pluginViewBridge.register('pane1', 'p1', win);
    pluginViewBridge.__handleMessageForTests({ source: win, data: { __tsview: 1, data: { ping: true } } } as any);
    expect(poster).toHaveBeenCalledWith('p1', expect.objectContaining({
      type: 'event', name: 'view-message',
      data: { frameId: 'pane1', payload: { ping: true } },
    }));
  });

  it('ignores messages from unknown sources and non-__tsview payloads', () => {
    const poster = vi.fn();
    pluginViewBridge.setWorkerPoster(poster);
    pluginViewBridge.register('pane1', 'p1', fakeWin());
    pluginViewBridge.__handleMessageForTests({ source: fakeWin(), data: { __tsview: 1, data: {} } } as any);
    pluginViewBridge.__handleMessageForTests({ source: null, data: { foo: 1 } } as any);
    expect(poster).not.toHaveBeenCalled();
  });

  it('drops a pane\'s buffered messages when it unregisters before the iframe loads', () => {
    pluginViewBridge.postToFrame('paneX', { stale: 1 });   // buffered before register (iframe not loaded yet)
    pluginViewBridge.unregister('paneX');                 // pane closed before loading (onDestroy without window)
    const win = fakeWin();
    pluginViewBridge.register('paneX', 'p1', win);        // late registration must NOT flush the stale buffer
    expect(win.postMessage as any).not.toHaveBeenCalled();
  });

  it('unregisterPlugin drops all of a plugin\'s panes', () => {
    const a = fakeWin(); const b = fakeWin();
    pluginViewBridge.register('paneA', 'p1', a);
    pluginViewBridge.register('paneB', 'p1', b);
    pluginViewBridge.unregisterPlugin('p1');
    pluginViewBridge.postToFrame('paneA', { x: 1 });
    expect(a.postMessage as any).not.toHaveBeenCalled();
  });

  it('window-guarded unregister: a stale onDestroy does not wipe a re-registered pane (remount)', () => {
    const w1 = fakeWin(); const w2 = fakeWin();
    pluginViewBridge.register('pane1', 'p1', w1);
    pluginViewBridge.register('pane1', 'p1', w2);   // remount re-registered same paneId, new window
    pluginViewBridge.unregister('pane1', w1);                // old component's onDestroy with its (stale) window
    pluginViewBridge.postToFrame('pane1', { x: 1 });
    expect(w2.postMessage as any).toHaveBeenCalledWith({ __tsview: 1, data: { x: 1 } }, '*');
    pluginViewBridge.unregister('pane1', w2);                // real close
    (w2.postMessage as any).mockClear();
    pluginViewBridge.postToFrame('pane1', { y: 2 });          // now buffered (no live reg)
    expect(w2.postMessage as any).not.toHaveBeenCalled();
  });
});

// @vitest-environment jsdom
describe('pluginViewBridge frameId (SP-B docked)', () => {
  afterEach(() => pluginViewBridge.__resetForTests());

  it('postToFrame delivers to the registered window by frameId', () => {
    const post = vi.fn();
    const win = { postMessage: post } as unknown as Window;
    pluginViewBridge.register('panel:right:p:dash', 'p', win);
    pluginViewBridge.postToFrame('panel:right:p:dash', { hello: 1 });
    expect(post).toHaveBeenCalledWith({ __tsview: 1, data: { hello: 1 } }, '*');
  });
  it('inbound iframe message relays with frameId to the worker', () => {
    const posted: any[] = [];
    pluginViewBridge.setWorkerPoster((pid, ev) => posted.push({ pid, ev }));
    const win = { postMessage: vi.fn() } as unknown as Window;
    pluginViewBridge.register('panel:right:p:dash', 'p', win);
    pluginViewBridge.__handleMessageForTests({ data: { __tsview: 1, data: { x: 9 } }, source: win } as unknown as MessageEvent);
    expect(posted[0].pid).toBe('p');
    expect(posted[0].ev.name).toBe('view-message');
    expect(posted[0].ev.data).toEqual({ frameId: 'panel:right:p:dash', payload: { x: 9 } });
  });
});
