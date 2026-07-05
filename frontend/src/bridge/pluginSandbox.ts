import { WORKER_PRELUDE } from './pluginPrelude';
import type { HostMessage } from './pluginProtocol';

// One Web Worker per plugin (spec §3): blob = prelude + plugin code. Pure
// transport — knows nothing about the API/registry. Trusted model: the worker
// gives execution isolation (no window/DOM/host bindings), network allowed (fetch present).
export interface Sandbox {
  post(msg: HostMessage): void;
  terminate(): void;
}

export function createSandbox(
  code: string,
  onMessage: (data: unknown) => void,
  onError: (err: string) => void,
): Sandbox {
  const source = WORKER_PRELUDE + '\n' + code;
  const blob = new Blob([source], { type: 'application/javascript' });
  const url = URL.createObjectURL(blob);
  const worker = new Worker(url);
  URL.revokeObjectURL(url);
  worker.onmessage = (e: MessageEvent) => onMessage(e.data);
  worker.onerror = (e: ErrorEvent) => onError(e.message || 'worker error');
  return {
    post: (msg) => worker.postMessage(msg),
    terminate: () => worker.terminate(),
  };
}
