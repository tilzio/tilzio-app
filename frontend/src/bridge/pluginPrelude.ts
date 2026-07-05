import { PROTOCOL_VERSION } from './pluginProtocol';

// Worker-SDK code: runs in the worker BEFORE the plugin's main.js (spec §7).
// This is a STRING (not a module) — it's concatenated with the plugin code into a Blob
// from which the Worker is created. Provides a global `ts` over postMessage-RPC. The version is baked in.
export const WORKER_PRELUDE = `(function () {
  var V = ${PROTOCOL_VERSION};
  var seq = 0;
  var pending = new Map();
  var onActivateCb = null, onDeactivateCb = null, onUiEventCb = null, onStateChangedCb = null;
  var onViewMsgCb = null;
  var subSeq = 0;
  var outSubs = new Map();   // subId -> { cb, dec }
  var exitSubs = new Map();  // subId -> cb
  // CSI (ESC [ … final) | OSC (ESC ] … BEL). EVERY backslash is doubled — this is the prelude's
  // template string; in the worker's CODE it yields a valid regex /\x1b\[…/g.
  var ANSI_RE = /\\x1b\\[[0-9;?]*[ -\\/]*[@-~]|\\x1b\\][^\\x07]*\\x07/g;

  self.onmessage = function (e) {
    var m = e.data;
    if (!m || m.v !== V) return;
    if (m.type === 'rpc-result') {
      var p = pending.get(m.id);
      if (!p) return;
      pending.delete(m.id);
      if (m.ok) p.resolve(m.result); else p.reject(new Error(m.error || 'rpc error'));
    } else if (m.type === 'event') {
      if (m.name === 'activate') { if (onActivateCb) onActivateCb(m.data); }
      else if (m.name === 'deactivate') { if (onDeactivateCb) onDeactivateCb(m.data); }
      else if (m.name === 'ui-event') { if (onUiEventCb) onUiEventCb(m.data); }
      else if (m.name === 'state-changed') { if (onStateChangedCb) onStateChangedCb(m.data); }
      else if (m.name === 'terminal-output') {
        var os = outSubs.get(m.data.subId);
        if (os) { try { os.cb(os.dec.decode(m.data.bytes, { stream: true })); } catch (_) {} }
      }
      else if (m.name === 'terminal-exit') {
        var ec = exitSubs.get(m.data.subId);
        if (ec) { exitSubs.delete(m.data.subId); try { ec(m.data.code); } catch (_) {} }  // delete BEFORE the call — even a throwing cb won't leave a subscription behind
      }
      else if (m.name === 'view-message') {
        if (onViewMsgCb) { try { onViewMsgCb(m.data.payload, m.data.paneId); } catch (_) {} }
      }
    }
  };

  function rpc(method, args) {
    return new Promise(function (resolve, reject) {
      var id = ++seq;
      pending.set(id, { resolve: resolve, reject: reject });
      self.postMessage({ v: V, type: 'rpc', id: id, method: method, args: args || [] });
    });
  }

  self.ts = {
    onActivate: function (cb) { onActivateCb = cb; },
    onDeactivate: function (cb) { onDeactivateCb = cb; },
    ui: {
      update: function (contribId, data) { return rpc('ui.update', [contribId, data]); },
      onEvent: function (cb) { onUiEventCb = cb; }
    },
    storage: {
      get: function (key) { return rpc('storage.get', [key]); },
      set: function (key, val) { return rpc('storage.set', [key, val]); }
    },
    notify: function (msg) { return rpc('notify', [msg]); },
    exec: function (bin, args, opts) { return rpc('exec', [bin, args || [], opts || {}]); },
    state: {
      get: function () { return rpc('state.get', []); },
      onChange: function (cb) { onStateChangedCb = cb; }
    },
    terminal: {
      paste: function (paneId, text) { return rpc('terminal.paste', [paneId, text]); },
      run: function (paneId, command) { return rpc('terminal.run', [paneId, command]); },
      read: function (paneId) { return rpc('terminal.read', [paneId]); },
      onOutput: function (paneId, cb) {
        var id = 'o' + (++subSeq);
        outSubs.set(id, { cb: cb, dec: new TextDecoder() });
        rpc('terminal.subscribeOutput', [paneId, id]).catch(function () { outSubs.delete(id); });  // subscribe failure → local cleanup
        return function () { outSubs.delete(id); rpc('terminal.unsubscribe', [id]).catch(function () {}); };
      },
      onExit: function (paneId, cb) {
        var id = 'e' + (++subSeq);
        exitSubs.set(id, cb);
        rpc('terminal.subscribeExit', [paneId, id]).catch(function () { exitSubs.delete(id); });
        return function () { exitSubs.delete(id); rpc('terminal.unsubscribe', [id]).catch(function () {}); };
      },
      stripAnsi: function (text) { return String(text).replace(ANSI_RE, ''); }
    },
    view: {
      post: function (paneId, msg) { return rpc('view.post', [paneId, msg]); },
      onMessage: function (cb) { onViewMsgCb = cb; return function () { onViewMsgCb = null; }; }
    }
  };
})();`;
