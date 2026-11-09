/**
 * Fixed Lingxi game bridge. Injected verbatim into every reviewed game build.
 * The audit report records this file's sha256; the parent page verifies it on READY.
 * No network access, no storage, no cookies, no dynamic code execution.
 */
(function () {
  'use strict';

  var CHANNEL = 'lingxi-game';
  var VERSION = '1.0.0';
  var state = { sessionId: null, bridgeHash: null, completed: false, timer: null };

  function post(type, payload) {
    if (!state.sessionId) return;
    parent.postMessage(
      { channel: CHANNEL, type: type, sessionId: state.sessionId, payload: payload || {} },
      '*'
    );
  }

  window.addEventListener('message', function (event) {
    var msg = event.data;
    if (!msg || msg.channel !== CHANNEL || msg.type !== 'INIT') return;
    if (state.sessionId) return;
    state.sessionId = msg.sessionId;
    state.bridgeHash = msg.payload && msg.payload.bridgeHash;
    window.dispatchEvent(new CustomEvent('lingxi:init', { detail: msg.payload || {} }));
    post('READY', { bridgeHash: state.bridgeHash, bridgeVersion: VERSION });
    state.timer = setInterval(function () { post('HEARTBEAT', {}); }, 30000);
  });

  window.LingxiGame = {
    progress: function (payload) { post('PROGRESS', payload); },
    error: function (code, message) { post('ERROR', { code: code, message: message }); },
    complete: function (result) {
      if (state.completed) return;
      state.completed = true;
      if (state.timer) clearInterval(state.timer);
      post('COMPLETE', result);
    }
  };
})();
