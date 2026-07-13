// The plugin logic lives in a Worker — the source of truth for each tile's state (by paneId).
// The UI in the iframe (view.html) communicates via ts.view. The worker keeps a per-paneId log,
// so when the iframe reloads (drag / tab switch) the state is restored.
ts.onActivate(function () {
  var logs = {}; // paneId -> [log lines]
  // Cap: keep the last 200 lines per pane (unbounded growth otherwise). The logs are
  // keyed by VIEW frame ids (iframe tiles), not terminal panes — ts.terminal.onExit
  // does not apply to them, so there is no exit hook to delete an entry on; the cap
  // is the bound.
  var MAX_LINES = 200;
  function add(paneId, text) {
    var l = logs[paneId] = logs[paneId] || [];
    l.push(text);
    if (l.length > MAX_LINES) l.splice(0, l.length - MAX_LINES);
    return text;
  }
  ts.view.onMessage(function (msg, paneId) {
    if (!msg || !msg.type) return;
    if (msg.type === 'sync') {                 // iframe loaded → return the accumulated log
      ts.view.post(paneId, { type: 'restore', lines: logs[paneId] || [] });
    } else if (msg.type === 'hello') {
      ts.view.post(paneId, { type: 'line', text: add(paneId, 'worker: Hello from the worker 👋') });
    } else if (msg.type === 'ping') {
      ts.view.post(paneId, { type: 'line', text: add(paneId, 'pong (rtt ' + (Date.now() - msg.at) + 'ms)') });
    }
  });
});
