import { describe, it, expect } from 'vitest';
import {
  PROTOCOL_VERSION, rpcResult, rpcError, hostEvent, isRpcRequest,
} from './pluginProtocol';

describe('pluginProtocol', () => {
  it('rpcResult sets the version, ok=true and result', () => {
    expect(rpcResult(5, { a: 1 })).toEqual({
      v: PROTOCOL_VERSION, type: 'rpc-result', id: 5, ok: true, result: { a: 1 },
    });
  });

  it('rpcError sets ok=false and the message', () => {
    expect(rpcError(7, 'boom')).toEqual({
      v: PROTOCOL_VERSION, type: 'rpc-result', id: 7, ok: false, error: 'boom',
    });
  });

  it('hostEvent wraps the name and data', () => {
    expect(hostEvent('activate', { pluginId: 'p1' })).toEqual({
      v: PROTOCOL_VERSION, type: 'event', name: 'activate', data: { pluginId: 'p1' },
    });
  });

  it('isRpcRequest lets a valid request through', () => {
    expect(isRpcRequest({ v: PROTOCOL_VERSION, type: 'rpc', id: 1, method: 'notify', args: [] })).toBe(true);
  });

  it('isRpcRequest rejects a foreign version / shape / null', () => {
    expect(isRpcRequest({ v: 999, type: 'rpc', id: 1, method: 'x', args: [] })).toBe(false);
    expect(isRpcRequest({ v: PROTOCOL_VERSION, type: 'rpc', id: 1, method: 'x' })).toBe(false);
    expect(isRpcRequest({ v: PROTOCOL_VERSION, type: 'event', id: 1, method: 'x', args: [] })).toBe(false);
    expect(isRpcRequest(null)).toBe(false);
    expect(isRpcRequest('nope')).toBe(false);
  });
});
