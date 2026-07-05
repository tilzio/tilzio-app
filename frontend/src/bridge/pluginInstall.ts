import { pluginsBridge, type InstallResult, type ConflictInfo } from './plugins';
import { activate, deactivate, pluginHost } from './pluginHost.svelte';

// Installation outcome for the UI: installed=true — the plugin is in the registry (disabled, or
// re-activated on the new code when updated); installed=false — the user declined the
// replacement on conflict. Errors are thrown as exceptions (caught by the caller).
export interface InstallOutcome { installed: boolean }

// onConflict is called when the id is already installed (overwrite=false returned a conflict).
// Returns Promise<boolean>: true = replace (retry with overwrite=true), false = cancel.
export interface InstallOpts { onConflict: (c: ConflictInfo) => Promise<boolean> }

// The shared tail of both entry points: parse the first result; on conflict ask,
// and (if agreed) reinstall with overwrite, re-activating the active plugin.
async function complete(
  first: InstallResult,
  retry: (overwrite: boolean) => Promise<InstallResult>,
  opts: InstallOpts,
): Promise<InstallOutcome> {
  if (first.status === 'installed') return { installed: true };
  // status === 'conflict' → the conflict field is guaranteed present (Go contract
  // service.go: Conflict is set exactly for this status).
  const c = first.conflict!;
  const ok = await opts.onConflict(c);
  if (!ok) return { installed: false };
  // Update: if the plugin is currently active — take down the worker BEFORE replacing the code
  // and bring the new one up AFTER (otherwise the old worker would keep running the replaced main.js).
  const wasActive = pluginHost.active.some((p) => p.id === c.id);
  if (wasActive) deactivate(c.id);
  const second = await retry(true);
  if (second.status === 'installed' && wasActive && second.info?.manifest) {
    await activate(second.info.manifest);
  }
  return { installed: second.status === 'installed' };
}

// Install from bytes (drag-drop / file selection).
export async function installBytes(bytes: Uint8Array, opts: InstallOpts): Promise<InstallOutcome> {
  const first = await pluginsBridge.installZip(bytes, false);
  return complete(first, (ow) => pluginsBridge.installZip(bytes, ow), opts);
}

// Install from an https URL.
export async function installUrl(url: string, opts: InstallOpts): Promise<InstallOutcome> {
  const first = await pluginsBridge.installURL(url, false);
  return complete(first, (ow) => pluginsBridge.installURL(url, ow), opts);
}

// Remove a plugin: if it's currently active — take down the worker BEFORE the Go removal (otherwise
// the worker would keep running the removed code), then the Go `uninstall` by FOLDER NAME (dir works
// even for broken plugins without a manifest/id). The Go storage is preserved (it returns on
// reinstalling the same id). Errors are thrown as exceptions (caught by the caller).
export async function uninstallPlugin(id: string | null, dir: string): Promise<void> {
  if (id && pluginHost.active.some((p) => p.id === id)) deactivate(id);
  await pluginsBridge.uninstall(dir);
}
