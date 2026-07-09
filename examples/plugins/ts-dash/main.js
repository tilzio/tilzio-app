// Minimal worker for the ts-dash docked-panel demo.
// Every Tilzio plugin needs a worker entry (manifest "entry"), even one whose UI
// is a self-contained iframe. The panel (panel.html) styles itself with the host's
// --ts-* theme tokens and runs its own JS; this worker just handles the lifecycle
// and acknowledges the panel's button clicks over the ts.view bridge.
ts.onActivate(() => {});

ts.view.onMessage((msg, frameId) => {
  // panel.html posts { ran: n } when "Run checks" is clicked. A real plugin would
  // compute something and reply via ts.view.post(frameId, ...); the demo is static.
});
