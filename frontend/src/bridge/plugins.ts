import { Call } from '@wailsio/runtime';
import { base64ToBytes, bytesToBase64 } from '../base64';

// The Plugins service bindings (SP-2) are generated on `wails3 dev`; to avoid depending
// on the generated module at compile time, we call by name via Call.ByName
// ('package.struct.method'). The exact prefix depends on generation — we resolve it
// through the idempotent PluginsList: with the CORRECT prefix List does not fail (it just
// scans folders), so any probe error = wrong prefix. This way there's no need to
// parse the Wails error format (it throws a plain Error with the response text, not a
// native ReferenceError).
const PREFIX_CANDIDATES = ['main.PluginsApp', 'github.com/tilzio/tilzio.PluginsApp', 'tilzio.PluginsApp'];
let resolvedPrefix: string | null = null;

async function resolvePrefix(): Promise<string> {
  if (resolvedPrefix) return resolvedPrefix;
  let lastErr: unknown;
  for (const p of PREFIX_CANDIDATES) {
    try {
      await Call.ByName(`${p}.PluginsList`);
      resolvedPrefix = p;
      return p;
    } catch (e) {
      lastErr = e; // wrong prefix (or wrong service) → try the next one
    }
  }
  throw lastErr ?? new Error('plugins service binding not found');
}

async function callPlugin<T>(method: string, ...args: unknown[]): Promise<T> {
  const prefix = await resolvePrefix();
  return (await Call.ByName(`${prefix}.${method}`, ...args)) as T;
}

// Test seam: reset the prefix cache between unit tests.
export function __resetPrefixForTests(): void {
  resolvedPrefix = null;
}

export interface PluginManifest {
  id: string; name: string; version: string; engine: string; entry: string;
  permissions?: string[]; exec?: string[]; contributes?: unknown;
}
export interface PluginInfo {
  dir: string; manifest: PluginManifest | null; enabled: boolean; permissions: string[]; err: string;
}
export interface ExecResult { stdout: string; stderr: string; code: number; truncated: boolean }

// id conflict on install (the same id is already installed). Exact fields = json tags of Go
// plugins.Conflict (service.go). Not an error — a normal outcome, the frontend will ask the user.
export interface ConflictInfo { id: string; existingVersion: string; newVersion: string }
// Summary of the plugin's storage for the details page = json tags of Go plugins.StorageInfo.
export interface StorageInfo { keys: number; bytes: number }
// Install outcome = json tags of Go plugins.InstallResult. info — on "installed",
// conflict — on "conflict" (overwrite was false).
export interface InstallResult {
  status: 'installed' | 'conflict';
  info?: PluginInfo;
  conflict?: ConflictInfo;
}

// Typed wrapper over the Plugins service (mirroring bridge/core.ts over App.*).
export const pluginsBridge = {
  list: (): Promise<PluginInfo[]> => callPlugin<PluginInfo[]>('PluginsList'),
  setEnabled: (id: string, on: boolean): Promise<void> => callPlugin<void>('PluginSetEnabled', id, on),
  // PluginReadFile returns base64 (like App.LoadScrollback) → decode to bytes; the UTF-8 text
  // decode is done by the consumer (pluginHost), just as core.ts returns scrollback bytes.
  readFile: async (id: string, rel: string): Promise<Uint8Array> =>
    base64ToBytes(await callPlugin<string>('PluginReadFile', id, rel)),
  // storage keeps a JSON string (256 KiB quota in Go). A missing key is returned by Go
  // as ErrNotFound ("plugins: not found") → treated as null (no value),
  // other errors are propagated. get → parse; set → stringify.
  storageGet: async (id: string, key: string): Promise<unknown> => {
    let json: string;
    try {
      json = await callPlugin<string>('PluginStorageGet', id, key);
    } catch (e) {
      if (e instanceof Error && /not found/i.test(e.message)) return null;
      throw e;
    }
    if (!json) return null;
    try { return JSON.parse(json); } catch { return null; }
  },
  storageSet: (id: string, key: string, val: unknown): Promise<void> =>
    callPlugin<void>('PluginStorageSet', id, key, JSON.stringify(val ?? null)),
  // exec via the Go broker (allow-list enforced in Go, spec §3). args — an array of strings
  // (NO shell interpretation); cwd — the working directory. Returns captured output.
  exec: (id: string, bin: string, args: string[], cwd: string): Promise<ExecResult> =>
    callPlugin<ExecResult>('PluginExec', id, bin, args, cwd),
  // Install from zip: the frontend encodes bytes to base64 (mirroring PluginReadFile,
  // which returns base64), Go decodes, validates, installs. overwrite=false → on an
  // id match it returns status:"conflict" (NOT throw); true → replace.
  installZip: (bytes: Uint8Array, overwrite: boolean): Promise<InstallResult> =>
    callPlugin<InstallResult>('PluginInstallZip', bytesToBase64(bytes), overwrite),
  // Install from an https URL (Go downloads it itself, same unpack path).
  installURL: (url: string, overwrite: boolean): Promise<InstallResult> =>
    callPlugin<InstallResult>('PluginInstallURL', url, overwrite),
  // Uninstall a plugin by FOLDER NAME (PluginInfo.dir, NOT id — that's the Go contract; works
  // even for broken plugins without manifest/id). Go keeps storage (returned on reinstall).
  uninstall: (dir: string): Promise<void> => callPlugin<void>('PluginUninstall', dir),
  // Summary of the plugin's storage (key count + size) for the details page.
  storageInfo: (id: string): Promise<StorageInfo> => callPlugin<StorageInfo>('PluginStorageInfo', id),
  // Clear the plugin's storage (reset settings to defaults). Enabled state and permissions
  // are not touched (Go StorageClear). Recreating the worker is done by the orchestrator
  // resetPluginStorage (pluginManage).
  storageClear: (id: string): Promise<void> => callPlugin<void>('PluginStorageClear', id),
};
