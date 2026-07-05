// The plugin logic lives in a Worker — the source of truth for each tile's state (by paneId).
// The UI in the iframe (view.html) communicates via ts.view. The worker keeps a per-paneId log,
// so when the iframe reloads (drag / tab switch) the state is restored.
ts.onActivate(function () {
  var logs = {}; // paneId -> [log lines]
  function add(paneId, text) { (logs[paneId] = logs[paneId] || []).push(text); return text; }
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
