import { pluginsBridge, type PluginManifest } from './plugins';
import { activate, deactivate, pluginHost } from './pluginHost.svelte';

// Enable a plugin: persist to the Go registry (plugins.json, survives ⌘Q) + start the worker.
// Order matters: first record the intent in the registry, then activate.
export async function enablePlugin(manifest: PluginManifest): Promise<void> {
  await pluginsBridge.setEnabled(manifest.id, true);
  await activate(manifest);
}

// Disable: persist + deactivate the worker. SP-4 contributions disappear on their own (active[] is reactive).
export async function disablePlugin(id: string): Promise<void> {
  await pluginsBridge.setEnabled(id, false);
  deactivate(id);
}

// Reset the plugin's settings to defaults: clear its storage (Go) and, if the plugin
// is currently active, recreate the worker (deactivate→activate) — it re-reads the empty
// storage and writes the defaults. The manifest is needed for re-activation; null or an
// inactive plugin → clear only (defaults apply on the next launch).
// The clear→deactivate→activate order is mandatory: a running worker holds settings
// in JS memory, so without recreation clearing the Go storage would have no effect.
export async function resetPluginStorage(manifest: PluginManifest | null, id: string): Promise<void> {
  await pluginsBridge.storageClear(id);
  if (manifest && pluginHost.active.some((p) => p.id === id)) {
    deactivate(id);
    await activate(manifest);
  }
}
