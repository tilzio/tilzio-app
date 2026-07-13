import { pluginsBridge } from './plugins';
import { pushToast } from './toast.svelte';
import { cleanStr, cleanTone } from '../state/widgets';
import { coreBridge } from './core';
import { ptyEvents } from './ptyEvents';
import { store } from '../state/store.svelte';
import { stateSnapshot } from '../state/pluginState';
import { findLeafInApp } from '../state/selectors';
import { pluginViewBridge } from './pluginViewBridge';

// Harmless MVP methods (spec §6) + sensitive SP-5 ones (exec/state/terminal).
// Unknown method → error (this is ROUTING, not a permission gate — trusted §2).
export const KNOWN_METHODS = new Set<string>([
  'ui.update', 'ui.onEvent', 'storage.get', 'storage.set', 'notify',
  // SP-5 capabilities:
  'exec', 'state.get', 'state.onChange', 'terminal.paste', 'terminal.run',
  // SP-A terminal observation:
  'terminal.read', 'terminal.subscribeOutput', 'terminal.subscribeExit', 'terminal.unsubscribe',
  // SP-B iframe view:
  'view.post',
]);

export function isKnownMethod(method: string): boolean {
  return KNOWN_METHODS.has(method);
}

// Dispatch context: pluginId + a callback that writes ui data (provided by pluginHost so
// pluginApi doesn't depend on the manager).
export interface ApiContext {
  pluginId: string;
  setUi(contribId: string, data: unknown): void;
  permissions?: string[];   // declared permissions; fail-closed check (no field → empty array → deny)
}

export async function dispatch(ctx: ApiContext, method: string, args: unknown[]): Promise<unknown> {
  switch (method) {
    case 'ui.update': {
      const [contribId, data] = args as [string, unknown];
      ctx.setUi(String(contribId), data);
      return undefined;
    }
    case 'ui.onEvent':
      // The subscription is recorded in the worker (prelude); the host has nothing to do.
      return undefined;
    case 'notify': {
      const [payload] = args as [unknown];
      if (payload && typeof payload === 'object') {
        const o = payload as Record<string, unknown>;
        pushToast(ctx.pluginId, { title: cleanStr(o.title, 120), ...(o.body !== undefined ? { body: cleanStr(o.body, 200) } : {}), tone: cleanTone(o.tone), ...(o.icon !== undefined ? { icon: cleanStr(o.icon, 8) } : {}) });
      } else { pushToast(ctx.pluginId, String(payload)); }
      return undefined;
    }
    case 'storage.get': {
      const [key] = args as [unknown];
      return pluginsBridge.storageGet(ctx.pluginId, String(key));
    }
    case 'storage.set': {
      const [key, val] = args as [unknown, unknown];
      return pluginsBridge.storageSet(ctx.pluginId, String(key), val);
    }
    case 'exec': {
      const [bin, execArgs, opts] = args as [unknown, unknown, { cwd?: unknown } | undefined];
      const list = Array.isArray(execArgs) ? execArgs.map(String) : [];
      const cwd = opts && typeof opts === 'object' && opts.cwd != null ? String(opts.cwd) : '';
      return pluginsBridge.exec(ctx.pluginId, String(bin), list, cwd);
    }
    case 'state.get':
      return stateSnapshot(store.app);
    case 'state.onChange':
      // The subscription is recorded in the worker (prelude); the host has nothing to do (like ui.onEvent).
      return undefined;
    case 'terminal.paste': {
      if (!(ctx.permissions ?? []).includes('terminal:write')) throw new Error('permission terminal:write not declared');
      const [paneId, text] = args as [unknown, unknown];
      if (!ptyEvents.isLive(String(paneId))) throw new Error('pane not live');
      await coreBridge.write(String(paneId), String(text)); // as-is, no \n
      return undefined;
    }
    case 'terminal.run': {
      if (!(ctx.permissions ?? []).includes('terminal:write')) throw new Error('permission terminal:write not declared');
      const [paneId, command] = args as [unknown, unknown];
      if (!ptyEvents.isLive(String(paneId))) throw new Error('pane not live');
      await coreBridge.write(String(paneId), String(command) + '\n'); // +one Enter; internal \n are NOT stripped — cleanliness is the plugin's job (R3, trusted)
      return undefined;
    }
    case 'terminal.read': {
      if (!(ctx.permissions ?? []).includes('terminal:read')) throw new Error('permission terminal:read not declared');
      const [paneId] = args as [unknown];
      const leaf = findLeafInApp(store.app, String(paneId));
      if (!leaf) throw new Error('unknown pane');
      if (leaf.kind !== 'terminal') throw new Error('not a terminal');
      const bytes = await coreBridge.loadScrollback(String(paneId));   // ring→disk, no isLive gate (spec §3.2)
      return new TextDecoder().decode(bytes);
    }
    case 'terminal.subscribeOutput':
    case 'terminal.subscribeExit': {
      if (!(ctx.permissions ?? []).includes('terminal:read')) throw new Error('permission terminal:read not declared');
      const [paneId, subId] = args as [unknown, unknown];
      if (!ptyEvents.isLive(String(paneId))) throw new Error('pane not live');
      ptyEvents.subscribePlugin(ctx.pluginId, String(paneId), String(subId), method === 'terminal.subscribeExit' ? 'exit' : 'output');
      return undefined;
    }
    case 'terminal.unsubscribe': {
      const [subId] = args as [unknown];
      ptyEvents.unsubscribePluginSub(ctx.pluginId, String(subId));
      return undefined;
    }
    case 'view.post': {
      const [frameId, msg] = args as [unknown, unknown];
      // ctx.pluginId as owner: a plugin can only post into ITS OWN frames (mismatch → drop).
      pluginViewBridge.postToFrame(String(frameId), msg, ctx.pluginId);
      return undefined;
    }
    default:
      throw new Error(`unknown method: ${method}`);
  }
}
