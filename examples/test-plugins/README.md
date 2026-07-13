# Tilzio test/demo plugins

Dev fixtures and API demos for smoke-testing the plugin sandbox and docked
panels: ts-demo/ts-showcase (sandbox runtime), ts-dash (docked panel),
ts-watch (terminal observation, SP-A), ts-brain (iframe panel + worker state).
The real extension (ts-usage) lives in `examples/plugins/` and in the
`tilzio-extensions` repo.

## ts-demo (SP-3)

Demonstrates the sandbox runtime: it activates in a Web Worker, sends `ui.update`/`notify`,
persists via `ts.storage`; the "Probe boundary" button in the dev showcase shows that the
worker cannot see `window`/`document`/Wails bindings (while `fetch` is available — the trusted model).

### Install for a smoke test (macOS)

    cp -R examples/test-plugins/ts-demo "$HOME/Library/Application Support/Tilzio/plugins/ts-demo"

Run `wails3 dev`, then enable the plugin in the webview devtools console:

    import('@wailsio/runtime').then(r => r.Call.ByName('main.PluginsApp.PluginSetEnabled', 'dev.term.demo', true))

(if you get a `ReferenceError` — try the `tilzio.PluginsApp` prefix; the same one that works in `bridge/plugins.ts`.)

Restart `wails3 dev`. The plugin activates automatically (it is enabled).
