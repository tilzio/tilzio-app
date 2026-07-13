// SP-4 demo: a neutral showcase. Sends mock data to all slots and all widget
// types, checks the return channel (ts.ui.onEvent → commands). There is no real exec.
function render(clicks) {
  // bars
  ts.ui.update('showcase.status', { text: 'showcase', icon: '🎛', tone: 'accent' });
  // status-bar element with a command — clickable, sends the command back to the plugin
  ts.ui.update('showcase.count', { text: 'clicks: ' + clicks, command: 'showcase.ping' });
  ts.ui.update('showcase.crumb', { text: 'demo', icon: '✦', tone: 'success' });
  // bottom panel — all widgets
  ts.ui.update('showcase.panel', { widgets: [
    { type: 'text', label: 'status', text: 'all good', tone: 'success' },
    { type: 'badge', items: [
      { text: 'A 3', tone: 'warn' }, { text: '↑2', tone: 'success' }, { text: '↓0' },
    ] },
    { type: 'list', items: [
      { text: 'App.svelte', icon: 'M', tone: 'warn', command: 'showcase.ping', args: { file: 'App.svelte' } },
      { text: 'List.svelte', icon: 'A', tone: 'success' },
    ] },
    { type: 'buttons', items: [
      { text: '⟳ refresh', command: 'showcase.refresh' },
      { text: 'ping', command: 'showcase.ping' },
    ] },
    { type: 'table', columns: ['file', '+', '−'], rows: [
      ['App.svelte', '12', '3'], ['List.svelte', '40', '0'],
    ] },
    { type: 'chart', kind: 'line', values: [3, 5, 8, 7, 12, 9, 14], caption: 'CPU, %' },
    { type: 'chart', kind: 'bar', bars: [
      { label: 'ts', value: 80 }, { label: 'svelte', value: 45 }, { label: 'go', value: 60 }, { label: 'css', value: 25 },
    ], caption: 'lines by type', percent: true },
  ] });
  // right column ③ — opened via the 📊 icon (model A) or the ◧/⌘⌥B toggle
  ts.ui.update('showcase.side', { widgets: [
    { type: 'text', label: 'branch', text: 'main', tone: 'accent' },
    { type: 'chart', kind: 'ring', segments: [{ label: 'used', value: 73 }], max: 100, caption: 'disk used' },
    { type: 'chart', kind: 'ring', segments: [
      { label: 'ts', value: 40 }, { label: 'svelte', value: 30 }, { label: 'go', value: 20 }, { label: 'css', value: 10 },
    ], caption: 'languages' },
  ] });
}

var clicks = 0;
ts.onActivate(function () {
  ts.notify('Showcase activated');
  render(clicks);
});

ts.ui.onEvent(function (ev) {
  if (ev && ev.type === 'command') {
    clicks = clicks + 1;
    if (ev.command === 'showcase.refresh') ts.notify('Showcase: refreshed');
    else ts.notify('Command: ' + ev.command);
    render(clicks);
  }
});
