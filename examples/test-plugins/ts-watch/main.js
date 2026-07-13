// SP-A demo: watches the active console. read() — backfill, onOutput — live
// matches lines against a pattern, notify + list of matches; onExit — exit code.
var pattern = 'error';
var matches = [];
var buf = '';               // un-terminated tail (raw, no trailing \n) awaiting the next chunk
var off = null, offExit = null;
var watchedPaneId = null;   // which pane we're currently attached to — so we DON'T reattach (and don't recompute history) on every state.onChange
var attachGen = 0;          // attach token: a newer watch() invalidates awaits of an older one (no double subscription)
var MAX_MATCHES = 100;      // keep only the last N matches (unbounded growth otherwise)
var MAX_TAIL = 65536;       // cap the un-terminated tail at 64 KiB

function activePane(snap) {
  var sp = (snap.spaces || []).find(function (s) { return s.id === snap.activeSpaceId; });
  if (!sp) return null;
  var tab = (sp.tabs || []).find(function (t) { return t.id === sp.activeTabId; });
  if (!tab) return null;
  return tab.leaves.find(function (l) { return l.id === tab.activePaneId; }) || tab.leaves[0] || null;
}

function render(note) {
  ts.ui.update('watch.panel', { header: { title: 'Terminal Watch' }, widgets: [
    { type: 'text', label: 'pattern', text: pattern, tone: 'accent' },
    { type: 'buttons', items: [{ text: 'set: error', command: 'watch.p.error' }, { text: 'set: PASS', command: 'watch.p.pass' }] },
    note ? { type: 'text', text: note, tone: 'warn' } :
    (matches.length ? { type: 'list', items: matches.slice(-20).map(function (m) { return { text: m }; }) }
                    : { type: 'text', text: 'no matches', tone: 'success' }),
  ] });
  ts.ui.update('watch.sb', { text: '👁 ' + matches.length });
}

// Processes ONE new chunk: strips ANSI over tail+chunk (an escape can span the chunk
// boundary), splits into complete lines, counts matches. Only the new chunk plus the
// capped tail is reprocessed — never the whole accumulated history. notify=true —
// sends a notification (LIVE output); for backfill notify=false, to avoid spamming
// with history when reattaching to another pane.
function scan(chunk, notify) {
  var lines = ts.terminal.stripAnsi(buf + chunk).split('\n');
  buf = lines.pop();                       // tail without \n — keep accumulating
  if (buf.length > MAX_TAIL) buf = buf.slice(-MAX_TAIL);
  lines.forEach(function (ln) {
    if (pattern && ln.indexOf(pattern) >= 0) {
      matches.push(ln);
      if (notify) ts.notify({ title: 'Watch: ' + pattern, body: ln.slice(0, 120), tone: 'warn' });
    }
  });
  if (matches.length > MAX_MATCHES) matches.splice(0, matches.length - MAX_MATCHES);
  render();
}

function detach() {
  if (off) { off(); off = null; }
  if (offExit) { offExit(); offExit = null; }
}

async function watch() {
  // Race guard: two rapid state.onChange calls could both pass the id check while
  // awaiting → double subscription with the first one leaking. Any await below is
  // followed by a token check: a newer watch() owns the pane, the older call bails.
  var gen = ++attachGen;
  var snap = await ts.state.get();
  if (gen !== attachGen) return;                   // superseded while awaiting the snapshot
  var pane = activePane(snap);
  var id = pane ? pane.id : null;
  if (id && id === watchedPaneId && off) return;   // the active pane hasn't changed — DON'T reattach (otherwise history recompute + notify spam)
  detach();
  watchedPaneId = id;
  matches = [];                                    // new pane → fresh counter (fix: don't accumulate the previous pane's history)
  buf = '';
  if (!pane) { render('no active pane'); return; }
  try {
    var backfill = await ts.terminal.read(pane.id);
    if (gen !== attachGen) return;                 // superseded during read — the newer call subscribes, not us
    scan(backfill, false);                         // count history, but without notify
    off = ts.terminal.onOutput(pane.id, function (chunk) { scan(chunk, true); });
    offExit = ts.terminal.onExit(pane.id, function (code) { ts.ui.update('watch.sb', { text: '👁 done(' + code + ')' }); });
  } catch (e) {
    if (gen !== attachGen) return;
    watchedPaneId = null; render('pane not live');   // not live → reset, so we retry on the next onChange
  }
}

// Force a reattach (pattern change): reset the binding so watch()
// re-reads the current pane's backfill under the new pattern.
function rewatch() { watchedPaneId = null; watch(); }

ts.onActivate(watch);
ts.state.onChange(function () { watch(); });   // the active pane changed → reattach (after ⌘R of the same id — switch tabs to resubscribe)
ts.ui.onEvent(function (ev) {
  if (!ev || ev.type !== 'command') return;
  if (ev.command === 'watch.p.error') { pattern = 'error'; rewatch(); }
  if (ev.command === 'watch.p.pass') { pattern = 'PASS'; rewatch(); }
});
