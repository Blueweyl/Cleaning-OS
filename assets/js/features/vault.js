/* ==========================================================================
   CleanFlow — Folder backup ("Auto-Backup Folder")

   Everything else in this app lives inside the browser's storage for this
   file. Clearing site data, switching browsers or losing the profile takes
   all of it — and no amount of careful writing inside that box helps.

   So: with one permission grant, CleanFlow keeps a copy of the backup file in
   a real folder the owner picks (their Dropbox, iCloud Drive, OneDrive or a
   USB stick), and refreshes it automatically. That copy survives everything
   the browser can do to itself.

   Entirely optional and fully feature-detected. Where the File System Access
   API is missing — Firefox, Safari, older browsers — none of this appears and
   the ordinary Export button remains the way to back up.
   ========================================================================== */
(function (CF) {
  'use strict';

  var HANDLE_DB = 'cleanflow-vault';
  var HANDLE_STORE = 'handles';
  var HANDLE_KEY = 'folder';
  var MIN_INTERVAL_MS = 5 * 60 * 1000;   // don't rewrite more than every 5 min

  var handle = null;
  var lastWrite = 0;
  var busy = false;

  function supported() {
    return typeof window !== 'undefined' &&
           typeof window.showDirectoryPicker === 'function';
  }

  /* ---- Handle storage -----------------------------------------------------
     A directory handle is structured-cloneable, so IndexedDB can keep it
     across restarts. It is held apart from the main database so restoring a
     backup never drags someone else's folder permission along with it.     */

  function openHandleDb() {
    return new Promise(function (resolve, reject) {
      var req;
      try { req = indexedDB.open(HANDLE_DB, 1); }
      catch (e) { reject(e); return; }
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(HANDLE_STORE)) db.createObjectStore(HANDLE_STORE);
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function putHandle(value) {
    return openHandleDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(HANDLE_STORE, 'readwrite');
        tx.objectStore(HANDLE_STORE).put(value, HANDLE_KEY);
        tx.oncomplete = function () { db.close(); resolve(); };
        tx.onerror = function () { db.close(); reject(tx.error); };
      });
    });
  }

  function getHandle() {
    return openHandleDb().then(function (db) {
      return new Promise(function (resolve) {
        var tx = db.transaction(HANDLE_STORE, 'readonly');
        var req = tx.objectStore(HANDLE_STORE).get(HANDLE_KEY);
        req.onsuccess = function () { db.close(); resolve(req.result || null); };
        req.onerror = function () { db.close(); resolve(null); };
      });
    }).catch(function () { return null; });
  }

  /* ---- Permissions --------------------------------------------------------- */

  function permissionState(h) {
    if (!h || !h.queryPermission) return Promise.resolve('granted');
    return h.queryPermission({ mode: 'readwrite' }).catch(function () { return 'prompt'; });
  }

  function requestPermission(h) {
    if (!h || !h.requestPermission) return Promise.resolve('granted');
    return h.requestPermission({ mode: 'readwrite' }).catch(function () { return 'denied'; });
  }

  /* ---- Public -------------------------------------------------------------- */

  /** Restore a previously chosen folder on startup. Never prompts. */
  function init() {
    if (!supported()) return Promise.resolve(false);
    return getHandle().then(function (h) {
      if (!h) return false;
      handle = h;
      return permissionState(h).then(function (state) {
        return state === 'granted';
      });
    }).catch(function () { return false; });
  }

  /** Ask the owner to pick a folder. Must be called from a click. */
  function choose() {
    if (!supported()) return Promise.reject(new Error('unsupported'));
    return window.showDirectoryPicker({ id: 'cleanflow-backups', mode: 'readwrite' })
      .then(function (h) {
        handle = h;
        return putHandle(h).then(function () { return write(true); });
      });
  }

  function forget() {
    handle = null;
    lastWrite = 0;
    return putHandle(null).catch(function () {});
  }

  function isConfigured() { return !!handle; }

  function status() {
    if (!supported()) return Promise.resolve({ supported: false });
    if (!handle) return Promise.resolve({ supported: true, configured: false });
    return permissionState(handle).then(function (state) {
      return {
        supported: true,
        configured: true,
        permission: state,
        folderName: handle.name || 'chosen folder',
        lastWrite: lastWrite || null
      };
    });
  }

  /**
   * Write the current database into the folder.
   * @param {boolean} force  skip the rate limit (manual save, first setup)
   */
  function write(force) {
    if (!supported() || !handle || busy) return Promise.resolve(false);
    if (!force && Date.now() - lastWrite < MIN_INTERVAL_MS) return Promise.resolve(false);

    busy = true;
    return permissionState(handle)
      .then(function (state) {
        // Re-prompting needs a user gesture, so a background write simply
        // stands down rather than throwing.
        if (state !== 'granted') return force ? requestPermission(handle) : 'denied';
        return 'granted';
      })
      .then(function (state) {
        if (state !== 'granted') throw new Error('permission-denied');
        return handle.getFileHandle(fileName(), { create: true });
      })
      .then(function (fileHandle) { return fileHandle.createWritable(); })
      .then(function (writable) {
        return writable.write(CF.backup.serialise()).then(function () { return writable.close(); });
      })
      .then(function () {
        lastWrite = Date.now();
        busy = false;
        return true;
      })
      .catch(function (err) {
        busy = false;
        throw err;
      });
  }

  /** One file per day, so a bad day never overwrites a good week. */
  function fileName() {
    var d = new Date();
    var biz = (CF.store.get().business.name || 'cleanflow')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'cleanflow';
    return biz + '-backup-' +
      d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0') + '.json';
  }

  /** Quiet background refresh; failures are reported through status(), not toasts. */
  function maybeWrite() {
    if (!isConfigured()) return Promise.resolve(false);
    return write(false).catch(function () { return false; });
  }

  CF.vault = {
    supported: supported, init: init, choose: choose, forget: forget,
    write: write, maybeWrite: maybeWrite, status: status,
    isConfigured: isConfigured, fileName: fileName
  };
})(window.CF = window.CF || {});
