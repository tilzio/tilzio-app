// SP-3 demo plugin: shows the happy path (ui.update / storage / notify) and
// the worker boundary (no window/document/Wails bindings; fetch is allowed — trusted).
ts.onActivate(async function () {
  ts.notify('Demo activated');
  var n = (await ts.storage.get('count')) || 0;
  n = n + 1;
  await ts.storage.set('count', n);
  var back = await ts.storage.get('count');
  ts.ui.update('demo.status', { text: 'activations: ' + back });
});

ts.ui.onEvent(function (ev) {
  if (ev && ev.action === 'probe') {
    var probe = {
      window: typeof window,            // 'undefined' — no host window
      document: typeof document,        // 'undefined' — no DOM
      wails: typeof globalThis.wails,   // 'undefined' — no bindings
      fetch: typeof fetch,              // 'function' — network is allowed (trusted feature)
    };
    ts.ui.update('demo.probe', probe);
    ts.notify('Probe: window=' + probe.window + ' fetch=' + probe.fetch);
  }
});
