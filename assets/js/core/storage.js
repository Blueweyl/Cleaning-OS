/* ==========================================================================
   CleanFlow — Persistence layer

   A solo cleaner's whole business is small: hundreds of records, not
   millions. So the entire dataset is persisted as one JSON document. That
   buys atomic writes, trivial backup/restore, and no migration ceremony.

   Two backends are used together, not as a simple either/or:

     IndexedDB     primary store. Roomy, and survives more than localStorage.
     localStorage  fallback AND a synchronous safety journal, because a page
                   can be closed mid-write and IndexedDB has no sync API.

   Every payload carries `_savedAt` and `_seq`, so when the two disagree the
   newer one wins instead of a stale copy silently replacing good data.

   The rule this file exists to enforce: a read that FAILS must never look
   like a store that is EMPTY. Confusing the two is how a day's work gets
   overwritten by a blank database.
   ========================================================================== */
(function (CF) {
  'use strict';

  var DB_NAME = 'cleanflow';
  var DB_VERSION = 1;
  var STORE = 'kv';
  var KEY = 'database';
  var LS_KEY = 'cleanflow:database';
  var LS_QUARANTINE = 'cleanflow:corrupt:';
  var OPEN_TIMEOUT = 4000;

  var mode = 'pending';      // 'idb' | 'local' | 'memory'
  var idb = null;
  var idbDead = false;       // connection closed under us (versionchange etc.)
  var memory = null;
  var lastError = null;
  var seq = 0;
  var quarantined = null;    // key of a corrupt value we set aside

  /* ---- Envelope ---------------------------------------------------------
     The stored value is the database plus a little provenance. Old payloads
     without it still load — they simply sort as oldest.                    */

  function wrap(data) {
    seq += 1;
    return {
      _cleanflow: true,
      _savedAt: new Date().toISOString(),
      _seq: seq,
      data: data
    };
  }

  function unwrap(payload) {
    if (!payload || typeof payload !== 'object') return null;
    if (payload._cleanflow && payload.data) return payload;
    // A pre-envelope payload (or a hand-edited file): treat it as oldest.
    return { _cleanflow: true, _savedAt: null, _seq: 0, data: payload };
  }

  function newer(a, b) {
    if (!a) return b;
    if (!b) return a;
    if ((a._seq || 0) !== (b._seq || 0)) return (a._seq || 0) > (b._seq || 0) ? a : b;
    var ta = a._savedAt ? Date.parse(a._savedAt) : 0;
    var tb = b._savedAt ? Date.parse(b._savedAt) : 0;
    return tb > ta ? b : a;
  }

  /* ---- IndexedDB --------------------------------------------------------- */

  function openIDB() {
    return new Promise(function (resolve, reject) {
      if (typeof indexedDB === 'undefined' || !indexedDB) {
        reject(new Error('IndexedDB unavailable'));
        return;
      }
      var req;
      try { req = indexedDB.open(DB_NAME, DB_VERSION); }
      catch (e) { reject(e); return; }

      // Some privacy configurations neither resolve nor reject.
      var settled = false;
      var timer = setTimeout(function () {
        if (!settled) { settled = true; reject(new Error('IndexedDB open timed out')); }
      }, OPEN_TIMEOUT);

      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onblocked = function () {
        if (settled) return;
        settled = true; clearTimeout(timer);
        reject(new Error('IndexedDB is blocked by another tab'));
      };
      req.onsuccess = function () {
        if (settled) { try { req.result.close(); } catch (e) {} return; }
        settled = true; clearTimeout(timer);
        var db = req.result;

        // Without these the app keeps writing into a dead handle and every
        // save fails silently.
        db.onversionchange = function () { try { db.close(); } catch (e) {} idbDead = true; };
        db.onclose = function () { idbDead = true; };

        resolve(db);
      };
      req.onerror = function () {
        if (settled) return;
        settled = true; clearTimeout(timer);
        reject(req.error || new Error('IndexedDB open failed'));
      };
    });
  }

  /** Re-open after the connection died, so one versionchange is recoverable. */
  function ensureIDB() {
    if (idb && !idbDead) return Promise.resolve(idb);
    if (idb) { try { idb.close(); } catch (e) {} idb = null; }
    return openIDB().then(function (db) { idb = db; idbDead = false; return db; });
  }

  function idbRead() {
    return ensureIDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx;
        try { tx = db.transaction(STORE, 'readonly'); }
        catch (e) { idbDead = true; reject(e); return; }
        var req = tx.objectStore(STORE).get(KEY);
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () { reject(req.error || new Error('read failed')); };
        tx.onabort = function () { reject(tx.error || new Error('read aborted')); };
      });
    });
  }

  function idbWrite(payload) {
    return ensureIDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx;
        try { tx = db.transaction(STORE, 'readwrite'); }
        catch (e) { idbDead = true; reject(e); return; }
        try { tx.objectStore(STORE).put(payload, KEY); }
        catch (e) { reject(e); return; }
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error || new Error('write failed')); };
        tx.onabort = function () { reject(tx.error || new Error('write aborted')); };
      });
    });
  }

  /* ---- localStorage -------------------------------------------------------- */

  function localAvailable() {
    try {
      var probe = '__cf__';
      localStorage.setItem(probe, '1');
      localStorage.removeItem(probe);
      return true;
    } catch (e) { return false; }
  }

  /**
   * Read localStorage. A value that will not parse is moved aside rather than
   * discarded — it may still be recoverable by hand, and it must not be
   * overwritten by the empty database the app would otherwise start with.
   */
  function localRead() {
    var raw;
    try { raw = localStorage.getItem(LS_KEY); }
    catch (e) { return { ok: false, error: e }; }
    if (!raw) return { ok: true, payload: null };
    try {
      return { ok: true, payload: unwrap(JSON.parse(raw)) };
    } catch (e) {
      var key = LS_QUARANTINE + Date.now();
      try { localStorage.setItem(key, raw); localStorage.removeItem(LS_KEY); quarantined = key; }
      catch (e2) { /* nothing more we can do; leave it in place */ }
      return { ok: false, error: new Error('Stored data was unreadable'), corrupt: true };
    }
  }

  function localWrite(payload) {
    localStorage.setItem(LS_KEY, JSON.stringify(payload));
  }

  /* ---- Public API ---------------------------------------------------------- */

  function init() {
    return openIDB()
      .then(function (db) {
        idb = db; idbDead = false;
        // An open handle is not proof a read works.
        return idbRead().then(function () { mode = 'idb'; return mode; });
      })
      .catch(function (err) {
        lastError = err;
        if (idb) { try { idb.close(); } catch (e) {} idb = null; }
        mode = localAvailable() ? 'local' : 'memory';
        return mode;
      });
  }

  /**
   * Returns { ok, data, error, corrupt, recoveredFrom }.
   *
   * `ok:false` means the stores could not be read — NOT that they are empty.
   * The caller must refuse to overwrite anything until the user has decided.
   */
  function load() {
    if (mode === 'memory') {
      return Promise.resolve({ ok: true, data: memory ? memory.data : null });
    }

    var lsResult = localAvailable() ? localRead() : { ok: true, payload: null };

    if (mode !== 'idb') {
      if (!lsResult.ok) {
        lastError = lsResult.error;
        return Promise.resolve({
          ok: false, error: lsResult.error, corrupt: !!lsResult.corrupt,
          quarantinedAs: quarantined
        });
      }
      seq = Math.max(seq, (lsResult.payload && lsResult.payload._seq) || 0);
      return Promise.resolve({ ok: true, data: lsResult.payload ? lsResult.payload.data : null });
    }

    // IndexedDB mode: consult both and keep whichever is newer. After a
    // failed IndexedDB write the app falls back to localStorage, so the two
    // can legitimately diverge — taking the stale one would lose work.
    return idbRead().then(function (raw) {
      var idbPayload = unwrap(raw);
      var lsPayload = lsResult.ok ? lsResult.payload : null;
      var winner = newer(idbPayload, lsPayload);
      seq = Math.max(seq, (idbPayload && idbPayload._seq) || 0, (lsPayload && lsPayload._seq) || 0);
      return {
        ok: true,
        data: winner ? winner.data : null,
        recoveredFrom: (winner && winner === lsPayload && idbPayload) ? 'localStorage' : null,
        corrupt: !!lsResult.corrupt,
        quarantinedAs: quarantined
      };
    }).catch(function (err) {
      lastError = err;
      // Do NOT fall back to "empty". If localStorage has something, use it.
      if (lsResult.ok && lsResult.payload) {
        mode = 'local';
        return { ok: true, data: lsResult.payload.data, recoveredFrom: 'localStorage' };
      }
      return { ok: false, error: err };
    });
  }

  /**
   * Write everywhere we can. IndexedDB is authoritative, but a localStorage
   * mirror is kept alongside it whenever it fits: it is the only store that
   * can be written synchronously when the tab is closing.
   */
  function save(data) {
    var payload = wrap(data);

    if (mode === 'memory') { memory = payload; return Promise.resolve(); }

    if (mode === 'local') {
      return new Promise(function (resolve, reject) {
        try { localWrite(payload); resolve(); }
        catch (err) { lastError = err; reject(describeWriteError(err)); }
      });
    }

    return idbWrite(payload)
      .then(function () {
        // Mirror for crash safety. Failure here is not fatal — IndexedDB
        // already holds the authoritative copy.
        try { localWrite(payload); } catch (e) { /* quota: mirror skipped */ }
      })
      .catch(function (err) {
        lastError = err;
        // IndexedDB refused. Keep the data rather than lose it: switch to
        // localStorage, which load() now knows to prefer when it is newer.
        if (localAvailable()) {
          try {
            localWrite(payload);
            mode = 'local';
            return;
          } catch (err2) { lastError = err2; throw describeWriteError(err2); }
        }
        throw describeWriteError(err);
      });
  }

  /**
   * Last-resort synchronous write, for `pagehide`/`beforeunload` where a
   * promise will not be given the chance to settle. Returns true if the data
   * is safely on disk.
   */
  function saveSync(data) {
    if (mode === 'memory') { memory = wrap(data); return false; }
    if (!localAvailable()) return false;
    try { localWrite(wrap(data)); return true; }
    catch (e) { lastError = e; return false; }
  }

  function describeWriteError(err) {
    var name = (err && err.name) || '';
    var quota = name === 'QuotaExceededError' ||
                name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
                /quota/i.test(String(err && err.message));
    var e = new Error(quota
      ? 'This device is out of space for CleanFlow. Export a backup, then free up space.'
      : 'CleanFlow could not save to this device.');
    e.cause = err;
    e.quota = quota;
    return e;
  }

  function destroy() {
    memory = null;
    try { localStorage.removeItem(LS_KEY); } catch (e) {}
    if (mode === 'idb' && idb && !idbDead) {
      return new Promise(function (resolve) {
        try {
          var tx = idb.transaction(STORE, 'readwrite');
          tx.objectStore(STORE).delete(KEY);
          tx.oncomplete = function () { resolve(); };
          tx.onerror = function () { resolve(); };
          tx.onabort = function () { resolve(); };
        } catch (e) { resolve(); }
      });
    }
    return Promise.resolve();
  }

  /** Roughly how much room localStorage has left, for the quota warning. */
  function estimate() {
    if (navigator.storage && navigator.storage.estimate) {
      return navigator.storage.estimate().catch(function () { return null; });
    }
    return Promise.resolve(null);
  }

  function describe() {
    return {
      mode: mode,
      durable: mode === 'idb' || mode === 'local',
      mirrored: mode === 'idb',
      label: mode === 'idb'   ? 'This device (IndexedDB, mirrored)'
           : mode === 'local' ? 'This device (local storage)'
           : 'Not saved — this session only',
      warning: mode === 'memory'
        ? 'Your browser is blocking local storage, so nothing will be saved ' +
          'when you close this tab. Export a backup before you leave.'
        : null,
      quarantined: quarantined,
      lastError: lastError ? String(lastError.message || lastError) : null
    };
  }

  CF.storage = {
    init: init, load: load, save: save, saveSync: saveSync,
    destroy: destroy, describe: describe, estimate: estimate
  };
})(window.CF = window.CF || {});
