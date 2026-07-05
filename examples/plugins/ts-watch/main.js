// SP-A demo: watches the active console. read() — backfill, onOutput — live
// matches lines against a pattern, notify + list of matches; onExit — exit code.
var pattern = 'error';
var matches = [];
var buf = '';
var off = null, offExit = null;
var watchedPaneId = null;   // which pane we're currently attached to — so we DON'T reattach (and don't recompute history) on every state.onChange

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

// Splits the accumulated buf into complete lines, counts matches. notify=true —
// sends a notification (LIVE output); for backfill notify=false, to avoid spamming
// with history when reattaching to another pane.
function scan(notify) {
  var lines = ts.terminal.stripAnsi(buf).split('\n');
  buf = lines.pop();                       // tail without \n — keep accumulating
  lines.forEach(function (ln) {
    if (pattern && ln.indexOf(pattern) >= 0) {
      matches.push(ln);
      if (notify) ts.notify({ title: 'Watch: ' + pattern, body: ln.slice(0, 120), tone: 'warn' });
    }
  });
  render();
}

function detach() {
  if (off) { off(); off = null; }
  if (offExit) { offExit(); offExit = null; }
}

async function watch() {
  var snap = await ts.state.get();
  var pane = activePane(snap);
  var id = pane ? pane.id : null;
  if (id && id === watchedPaneId && off) return;   // the active pane hasn't changed — DON'T reattach (otherwise history recompute + notify spam)
  detach();
  watchedPaneId = id;
  matches = [];                                    // new pane → fresh counter (fix: don't accumulate the previous pane's history)
  buf = '';
  if (!pane) { render('no active pane'); return; }
  try {
    buf = ts.terminal.stripAnsi(await ts.terminal.read(pane.id));   // backfill
    scan(false);                                                    // count history, but without notify
    off = ts.terminal.onOutput(pane.id, function (chunk) { buf += chunk; scan(true); });
    offExit = ts.terminal.onExit(pane.id, function (code) { ts.ui.update('watch.sb', { text: '👁 done(' + code + ')' }); });
  } catch (e) { watchedPaneId = null; render('pane not live'); }    // not live → reset, so we retry on the next onChange
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
