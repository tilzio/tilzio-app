import { pluginsBridge, type InstallResult } from './plugins';
import { pluginHost, activate, deactivate } from './pluginHost.svelte';

// Install or update an extension from the store registry (spec §5.2).
// For an ACTIVE plugin the worker is restarted around the install so it picks
// up the new code: deactivate → StoreInstall (Go: download + sha256 + unpack,
// state/storage survive) → activate with the NEW manifest. A fresh install
// (not active) is a plain install — enable/consent is the caller's decision.
// If the install throws for an active plugin, the worker stays deactivated:
// the old folder may already be gone, and a worker on stale code is worse
// than a disabled one (the user re-enables from the list).
export async function storeInstall(id: string): Promise<InstallResult> {
  const wasActive = pluginHost.active.some((p) => p.id === id);
  if (wasActive) deactivate(id);
  const res = await pluginsBridge.storeInstall(id);
  if (res.status === 'installed' && wasActive && res.info?.manifest) {
    await activate(res.info.manifest);
  }
  return res;
}
