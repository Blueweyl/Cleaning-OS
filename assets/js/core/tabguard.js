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
  var PROBE_MS = 1200;    // how long to wait for the current writer to answer

  var tabId = 'tab-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  var isWriter = true;
  var myLockAt = 0;         // when this tab last wrote the lock
  var channel = null;
  var timer = null;
  var listeners = [];
  var sawWriter = false;

  function now() { return Date.now(); }

  function readLock() {
    try {
      var raw = localStorage.getItem(LOCK_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function writeLock() {
    try {
      var at = now();
      localStorage.setItem(LOCK_KEY, JSON.stringify({ id: tabId, at: at }));
      myLockAt = at;
      return true;
    } catch (e) { return false; }
  }

  function releaseLock() {
    var lock = readLock();
    if (lock && lock.id === tabId) {
      try { localStorage.removeItem(LOCK_KEY); } catch (e) {}
    }
  }

  /** Another tab holds the lock right now. */
  function someoneElseHoldsIt() {
    var held = readLock();
    return !!(held && held.id !== tabId && (now() - (held.at || 0)) <= STALE_MS);
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
          } else if (msg.type === 'here') {
            sawWriter = true;
          }
        };
        channel.postMessage({ type: 'ping', from: tabId });

        // Waiting for the heartbeat to go stale takes ~6.5s when the writing
        // tab is frozen rather than closed. Asking it directly answers in a
        // fraction of that: silence means nobody is home.
        if (!isWriter) {
          sawWriter = false;
          setTimeout(function () {
            // Re-read the lock. Nobody answering the ping does not prove
            // nobody has claimed: two tabs whose probes time out together
            // would otherwise both take over, and both write.
            if (!isWriter && !sawWriter && !someoneElseHoldsIt()) takeOver(true);
          }, PROBE_MS);
        }
      } catch (e) { channel = null; }
    }

    timer = setInterval(function () {
      if (isWriter) {
        // Holding the lock is not the same as still owning it. Two tabs can
        // claim in the same instant — each sets itself writer before the
        // other's claim message lands, so neither stands down — and this tick
        // used to just rewrite the lock and carry on. Three tabs all believed
        // they were the writer, and all three wrote.
        //
        // The stored lock is the single source of truth, and it is checked
        // before it is renewed. A lock written at or after this tab's own last
        // write belongs to whoever claimed most recently, so this tab yields.
        // Every tab reaches the same verdict from the same value, which leaves
        // exactly one writer and cannot oscillate.
        var held = readLock();
        if (held && held.id !== tabId &&
            (now() - (held.at || 0)) <= STALE_MS &&
            (held.at || 0) >= myLockAt) {
          setWriter(false);
          return;
        }
        writeLock();
        return;
      }

      // The writing tab may have been closed; take over once its lock goes stale.
      var current = readLock();
      if (!current || (now() - (current.at || 0)) > STALE_MS) { takeOver(true); return; }

      // It may also still be open but wedged. Ask, and take over if it does
      // not answer before the next tick.
      if (channel) {
        sawWriter = false;
        try { channel.postMessage({ type: 'ping', from: tabId }); } catch (e) {}
        setTimeout(function () {
          if (!isWriter && !sawWriter && !someoneElseHoldsIt()) takeOver(true);
        }, PROBE_MS);
      }
    }, HEARTBEAT_MS);

    window.addEventListener('pagehide', releaseLock);
    window.addEventListener('beforeunload', releaseLock);
  }

  /**
   * Become the writing tab. `quiet` skips telling the other tab, for takeover
   * after it has already gone away.
   *
   * The database is re-read from disk first. This tab has been sitting on the
   * copy it loaded when it opened, and the tab that was writing has moved on
   * since: without the refresh, the first save after a takeover wrote this
   * stale snapshot over the other tab's newer work, and a payment recorded
   * there was simply gone. The lock is only granted once the refresh settles,
   * so nothing can be written from the old copy in between.
   */
  function takeOver(quiet) {
    var claim = function () {
      writeLock();
      if (!quiet && channel) {
        try { channel.postMessage({ type: 'claim', from: tabId }); } catch (e) {}
      }
      setWriter(true);
    };

    if (isWriter || !CF.store || !CF.store.refreshFromDisk) { claim(); return; }

    // A refresh that fails leaves this tab on the copy it already had, which is
    // the same position it was in a moment ago — so it still takes the lock
    // rather than being left unable to write at all.
    CF.store.refreshFromDisk().then(claim, claim);
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
