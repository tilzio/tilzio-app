import { pluginsBridge, type InstallResult } from './plugins';
import { pluginHost, activate, deactivate } from './pluginHost.svelte';

// Install or update an extension from the store registry (spec §5.2).
// For an ACTIVE plugin the worker is restarted around the install so it picks
// up the new code: deactivate → StoreInstall (Go: download + sha256 + unpack,
// state/storage survive) → activate with the NEW manifest. A fresh install
// (not active) is a plain install — enable/consent is the caller's decision.
// If the install throws for an active plugin (the common failures — download,
// sha256, oversize, manifest mismatch — touch nothing on disk, spec §5.1/§7),
// the OLD code is still on disk, so we best-effort restart the worker on the
// OLD manifest before rethrowing: a failed update must not silently kill a
// previously-working extension.
export async function storeInstall(id: string): Promise<InstallResult> {
  const wasActive = pluginHost.active.some((p) => p.id === id);
  const oldManifest = wasActive
    ? ((await pluginsBridge.list()).find((p) => p.manifest?.id === id)?.manifest ?? null)
    : null;
  if (wasActive) deactivate(id);
  try {
    const res = await pluginsBridge.storeInstall(id);
    if (res.status === 'installed' && wasActive && res.info?.manifest) {
      await activate(res.info.manifest);
    }
    return res;
  } catch (err) {
    if (wasActive && oldManifest) {
      try {
        await activate(oldManifest);
      } catch {
        // Best-effort recovery: a worker that can't restart is the
        // pre-existing degraded case (the user re-enables from the list).
      }
    }
    throw err;
  }
}
