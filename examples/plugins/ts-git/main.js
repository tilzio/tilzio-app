// SP-5 git plugin (acceptance demo): real branch/changes via ts.exec('git', …),
// pull button (ts.terminal.run — executes, with Enter) and "paste status"
// (ts.terminal.paste — inserts text WITHOUT Enter). cwd comes from
// ts.state.get() — the starting cwd of the active pane (spec R1: a live cwd on `cd` is not
// tracked; git searches for .git up the tree). Replaces the showcase's mock data.

function activePane(snap) {
  var sp = (snap.spaces || []).find(function (s) { return s.id === snap.activeSpaceId; });
  if (!sp) return null;
  var tab = (sp.tabs || []).find(function (t) { return t.id === sp.activeTabId; });
  if (!tab) return null;
  return tab.leaves.find(function (l) { return l.id === tab.activePaneId; }) || tab.leaves[0] || null;
}

function statusItems(out) {
  return out.split('\n')
    .filter(function (l) { return l.length > 0; })
    .map(function (l) { return { text: l }; });
}

async function refresh() {
  var snap = await ts.state.get();
  var pane = activePane(snap);
  if (!pane) {
    ts.ui.update('git.branch', { text: '🌿 —' });
    ts.ui.update('git.panel', { widgets: [{ type: 'text', text: 'No active pane' }] });
    return;
  }
  var cwd = pane.cwd;
  var br = await ts.exec('git', ['branch', '--show-current'], { cwd: cwd });
  if (br.code !== 0) {
    ts.ui.update('git.branch', { text: '🌿 no git', tone: 'warn' });
    ts.ui.update('git.panel', { widgets: [{ type: 'text', label: cwd, text: 'Not a git repository', tone: 'warn' }] });
    return;
  }
  var branch = br.stdout.trim() || '(detached HEAD)';
  ts.ui.update('git.branch', { text: '🌿 ' + branch, tone: 'accent' });

  // br.code!==0 (not a git repository) is already caught above → git is valid here.
  var st = await ts.exec('git', ['status', '--porcelain'], { cwd: cwd });
  var items = statusItems(st.stdout);
  ts.ui.update('git.panel', { widgets: [
    { type: 'text', label: 'branch', text: branch + '  ·  ' + cwd, tone: 'accent' },
    items.length
      ? { type: 'list', items: items }
      : { type: 'text', text: 'No changes', tone: 'success' },
    { type: 'buttons', items: [
      { text: '⤓ git pull (run)', command: 'git.pull' },
      { text: '⎘ paste «git status» (without Enter)', command: 'git.pasteStatus' },
      { text: '🔒 allow-list probe (ls)', command: 'git.probeDenied' },
    ] },
  ] });
}

ts.onActivate(refresh);
// Switched tab/pane → refresh (the active pane's cwd may have changed).
ts.state.onChange(function () { refresh(); });
ts.ui.onEvent(async function (ev) {
  if (!ev || ev.type !== 'command') return;
  if (ev.command === 'git.refresh') { refresh(); return; } // the panel already refreshes via onChange; the command is groundwork for the command palette
  if (ev.command === 'git.pull') {
    var snap = await ts.state.get();
    var pane = activePane(snap);
    if (pane) ts.terminal.run(pane.id, 'git pull'); // run = executes in the console (with Enter)
    return;
  }
  if (ev.command === 'git.pasteStatus') {
    var snap2 = await ts.state.get();
    var pane2 = activePane(snap2);
    if (pane2) ts.terminal.paste(pane2.id, 'git status'); // paste = inserts WITHOUT Enter (the user presses it)
    return;
  }
  if (ev.command === 'git.probeDenied') {
    // Boundary probe: 'ls' is NOT in manifest.exec (["git"]) → the Go broker must reject it.
    try {
      await ts.exec('ls', [], {});
      ts.notify('⚠ ERROR: ls executed — the allow-list did NOT work!');
    } catch (e) {
      ts.notify('✓ ls rejected (outside the allow-list): ' + (e && e.message ? e.message : e));
    }
  }
});
