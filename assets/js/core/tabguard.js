/* ==========================================================================
   CleanFlow — Single-writer guard

   Each tab holds the whole database in memory and writes it back whole. Two
   tabs open on the same machine therefore clobber each other: whichever
   saves last wins, and the other tab's work disappears with no warning.

   Opening the file twice is an easy thing for a buyer to do by accident, so
   this elects one writer. The first tab keeps working exactly as before; a
   second tab goes read-only and says why, with a one-tap way to take over.

   BroadcastChannel where available, a localStorage heartbeat everywhere else
   (including file:// in older browsers). No dependencies either way.
   ========================================================================== */
(function (CF) {
  'use strict';

  var CHANNEL = 'cleanflow-tabs';
  var LOCK_KEY = 'cleanflow:writer';
  var HEARTBEAT_MS = 2000;
  var STALE_MS = 6000;

  var tabId = 'tab-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  var isWriter = true;
  var channel = null;
  var timer = null;
  var listeners = [];

  function now() { return Date.now(); }

  function readLock() {
    try {
      var raw = localStorage.getItem(LOCK_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function writeLock() {
    try {
      localStorage.setItem(LOCK_KEY, JSON.stringify({ id: tabId, at: now() }));
      return true;
    } catch (e) { return false; }
  }

  function releaseLock() {
    var lock = readLock();
    if (lock && lock.id === tabId) {
      try { localStorage.removeItem(LOCK_KEY); } catch (e) {}
    }
  }

  function setWriter(value) {
    if (isWriter === value) return;
    isWriter = value;
    listeners.forEach(function (fn) {
      try { fn(isWriter); } catch (e) { console.error(e); }
    });
  }

  function start() {
    // No localStorage means no way to coordinate — and also no persistence
    // worth protecting, so stay out of the way.
    var lock = readLock();
    var claimed = false;

    if (!lock || (now() - (lock.at || 0)) > STALE_MS || lock.id === tabId) {
      claimed = writeLock();
      setWriter(claimed !== false);
    } else {
      setWriter(false);
    }

    if (typeof BroadcastChannel !== 'undefined') {
      try {
        channel = new BroadcastChannel(CHANNEL);
        channel.onmessage = function (e) {
          var msg = e && e.data;
          if (!msg || msg.from === tabId) return;
          if (msg.type === 'claim') {
            // Another tab took over. Stand down rather than race it.
            if (isWriter) setWriter(false);
          } else if (msg.type === 'ping' && isWriter) {
            channel.postMessage({ type: 'here', from: tabId });
          }
        };
        channel.postMessage({ type: 'ping', from: tabId });
      } catch (e) { channel = null; }
    }

    timer = setInterval(function () {
      if (isWriter) { writeLock(); return; }
      // The writing tab may have been closed; take over once its lock goes stale.
      var current = readLock();
      if (!current || (now() - (current.at || 0)) > STALE_MS) takeOver(true);
    }, HEARTBEAT_MS);

    window.addEventListener('pagehide', releaseLock);
    window.addEventListener('beforeunload', releaseLock);
  }

  /** Become the writing tab. `quiet` skips telling the other tab, for takeover
      after it has already gone away. */
  function takeOver(quiet) {
    writeLock();
    if (!quiet && channel) {
      try { channel.postMessage({ type: 'claim', from: tabId }); } catch (e) {}
    }
    setWriter(true);
  }

  function canWrite() { return isWriter; }
  function onChange(fn) {
    listeners.push(fn);
    return function () { listeners = listeners.filter(function (l) { return l !== fn; }); };
  }

  CF.tabguard = {
    start: start, canWrite: canWrite, takeOver: takeOver,
    onChange: onChange, id: function () { return tabId; }
  };
})(window.CF = window.CF || {});
