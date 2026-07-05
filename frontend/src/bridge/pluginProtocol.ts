// Versioned postMessage-RPC between the host and the plugin's worker (spec §5).
// Pure module: only types and message constructors, no side effects.
export const PROTOCOL_VERSION = 1;

// worker → host: a ts.* API call.
export interface RpcRequest {
  v: number;
  type: 'rpc';
  id: number;
  method: string;
  args: unknown[];
}

// host → worker: reply to a call.
export interface RpcResult {
  v: number;
  type: 'rpc-result';
  id: number;
  ok: boolean;
  result?: unknown;
  error?: string;
}

// host → worker: a lifecycle / UI event.
// 'state-changed' is reserved for SP-5 (ts.state.onChange) — spec §5.
export type HostEventName = 'activate' | 'deactivate' | 'ui-event' | 'state-changed' | 'terminal-output' | 'terminal-exit' | 'view-message';
export interface HostEvent {
  v: number;
  type: 'event';
  name: HostEventName;
  data: unknown;
}

export type HostMessage = RpcResult | HostEvent;

export function rpcResult(id: number, result: unknown): RpcResult {
  return { v: PROTOCOL_VERSION, type: 'rpc-result', id, ok: true, result };
}

export function rpcError(id: number, error: string): RpcResult {
  return { v: PROTOCOL_VERSION, type: 'rpc-result', id, ok: false, error };
}

export function hostEvent(name: HostEventName, data: unknown): HostEvent {
  return { v: PROTOCOL_VERSION, type: 'event', name, data };
}

// Guard: is this a valid rpc request from the worker (protocol version + shape).
export function isRpcRequest(m: unknown): m is RpcRequest {
  if (typeof m !== 'object' || m === null) return false;
  const r = m as Record<string, unknown>;
  return r.v === PROTOCOL_VERSION && r.type === 'rpc'
    && typeof r.id === 'number' && typeof r.method === 'string'
    && Array.isArray(r.args);
}
