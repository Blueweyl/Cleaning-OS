/* ==========================================================================
   CleanFlow — Persistence layer

   A solo cleaner's whole business is small: hundreds of records, not
   millions. So the entire dataset is persisted as one JSON document. That
   buys atomic writes, trivial backup/restore, and no migration ceremony.

   IndexedDB is the primary store. localStorage is the fallback, because
   Chrome blocks IndexedDB on `file://` origins and this product is sold as
   a download that people open by double-clicking. Whichever one works, the
   app behaves identically — and `describe()` reports which is live so
   Settings can tell the truth about where data lives.
   ========================================================================== */
(function (CF) {
  'use strict';

  var DB_NAME = 'cleanflow';
  var DB_VERSION = 1;
  var STORE = 'kv';
  var KEY = 'database';
  var LS_KEY = 'cleanflow:database';

  var mode = 'pending';   // 'idb' | 'local' | 'memory'
  var idb = null;
  var memory = null;
  var lastError = null;

  /* ---- IndexedDB ------------------------------------------------------- */

  function openIDB() {
    return new Promise(function (resolve, reject) {
      if (typeof indexedDB === 'undefined' || !indexedDB) {
        reject(new Error('IndexedDB unavailable'));
        return;
      }
      var req;
      try { req = indexedDB.open(DB_NAME, DB_VERSION); }
      catch (e) { reject(e); return; }

      // Some browsers neither resolve nor reject on a blocked file:// origin.
      var settled = false;
      var timer = setTimeout(function () {
        if (!settled) { settled = true; reject(new Error('IndexedDB open timed out')); }
      }, 3000);

      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = function () {
        if (settled) { try { req.result.close(); } catch (e) {} return; }
        settled = true; clearTimeout(timer);
        resolve(req.result);
      };
      req.onerror = function () {
        if (settled) return;
        settled = true; clearTimeout(timer);
        reject(req.error || new Error('IndexedDB open failed'));
      };
    });
  }

  function idbRead() {
    return new Promise(function (resolve, reject) {
      var tx = idb.transaction(STORE, 'readonly');
      var req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = function () { resolve(req.result || null); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function idbWrite(value) {
    return new Promise(function (resolve, reject) {
      var tx = idb.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, KEY);
      tx.oncomplete = function () { resolve(); };
      tx.onerror = function () { reject(tx.error); };
      tx.onabort = function () { reject(tx.error || new Error('write aborted')); };
    });
  }

  /* ---- localStorage ---------------------------------------------------- */

  function localAvailable() {
    try {
      var probe = '__cf__';
      localStorage.setItem(probe, '1');
      localStorage.removeItem(probe);
      return true;
    } catch (e) { return false; }
  }

  /* ---- Public API ------------------------------------------------------ */

  /**
   * Pick a backend. Resolves to the mode actually in use. Never rejects —
   * an in-memory fallback keeps the app usable even in a locked-down
   * browser, and `describe()` warns the user that nothing will persist.
   */
  function init() {
    return openIDB()
      .then(function (db) {
        idb = db;
        // Prove a write actually lands — an open handle is not enough
        // on some privacy-hardened configurations.
        return idbRead().then(function () { mode = 'idb'; return mode; });
      })
      .catch(function (err) {
        lastError = err;
        if (idb) { try { idb.close(); } catch (e) {} idb = null; }
        if (localAvailable()) { mode = 'local'; return mode; }
        mode = 'memory';
        return mode;
      });
  }

  function load() {
    if (mode === 'idb') {
      return idbRead().catch(function (err) {
        lastError = err;
        return null;
      });
    }
    if (mode === 'local') {
      return Promise.resolve().then(function () {
        var raw = localStorage.getItem(LS_KEY);
        if (!raw) return null;
        try { return JSON.parse(raw); }
        catch (e) { lastError = e; return null; }
      });
    }
    return Promise.resolve(memory);
  }

  function save(data) {
    if (mode === 'idb') {
      return idbWrite(data).catch(function (err) {
        // A failed IndexedDB write must not silently lose the day's work.
        lastError = err;
        if (localAvailable()) {
          mode = 'local';
          return save(data);
        }
        throw err;
      });
    }
    if (mode === 'local') {
      return Promise.resolve().then(function () {
        try {
          localStorage.setItem(LS_KEY, JSON.stringify(data));
        } catch (err) {
          lastError = err;
          throw err;       // quota exceeded — the caller surfaces this
        }
      });
    }
    memory = data;
    return Promise.resolve();
  }

  /** Wipe the persisted copy. The caller is responsible for confirming. */
  function destroy() {
    memory = null;
    try { localStorage.removeItem(LS_KEY); } catch (e) {}
    if (mode === 'idb' && idb) {
      return new Promise(function (resolve) {
        try {
          var tx = idb.transaction(STORE, 'readwrite');
          tx.objectStore(STORE).delete(KEY);
          tx.oncomplete = function () { resolve(); };
          tx.onerror = function () { resolve(); };
        } catch (e) { resolve(); }
      });
    }
    return Promise.resolve();
  }

  function describe() {
    return {
      mode: mode,
      durable: mode === 'idb' || mode === 'local',
      label: mode === 'idb'   ? 'This device (IndexedDB)'
           : mode === 'local' ? 'This device (local storage)'
           : 'Not saved — this session only',
      warning: mode === 'memory'
        ? 'Your browser is blocking local storage, so nothing will be saved ' +
          'when you close this tab. Export a backup before you leave.'
        : null,
      lastError: lastError ? String(lastError.message || lastError) : null
    };
  }

  CF.storage = {
    init: init, load: load, save: save, destroy: destroy, describe: describe
  };
})(window.CF = window.CF || {});
