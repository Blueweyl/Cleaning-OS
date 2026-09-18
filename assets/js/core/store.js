/* ==========================================================================
   CleanFlow — Store

   Holds the whole database in memory, persists it after every change, and
   notifies subscribers so the shell can re-render. Writes are debounced
   and coalesced: typing in a notes field does not hammer the disk.

   Deletion is deliberately hard to do by accident. `remove()` soft-deletes
   by stamping `deletedAt`, and everything that reads records filters those
   out. A snapshot is taken before every mutation so Undo always has
   somewhere to go back to.
   ========================================================================== */
(function (CF) {
  'use strict';

  var db = null;
  var listeners = [];
  var undoStack = [];
  var saveTimer = null;
  var pendingSave = false;
  var saveInFlight = false;
  var saveError = null;
  var retryCount = 0;
  var locked = null;         // set when the stored data could not be read
  var loadNotice = null;
  var MAX_UNDO = 25;
  var MAX_RETRY_DELAY = 30000;
  var writeSeq = 0;   // bumped on every change, so a slow write knows it is stale

  /* ---- Ids ------------------------------------------------------------- */

  function uid(prefix) {
    return (prefix || 'id') + '-' +
           Date.now().toString(36) + '-' +
           Math.random().toString(36).slice(2, 8);
  }

  /* ---- Lifecycle -------------------------------------------------------- */

  function init() {
    return CF.storage.init()
      .then(function () { return CF.storage.load(); })
      .then(function (result) {
        // A failed read is not an empty store. Boot into a locked, read-only
        // state instead of handing the user a blank database that the next
        // keystroke would write over the top of their real data.
        if (!result.ok) {
          locked = {
            reason: result.corrupt ? 'corrupt' : 'unreadable',
            error: result.error,
            quarantinedAs: result.quarantinedAs || null
          };
          db = CF.schema.migrate(null);
          invalidateDerived();
          return db;
        }
        locked = null;
        loadNotice = result.recoveredFrom
          ? 'Recovered your most recent changes from this device\'s backup copy.'
          : (result.corrupt ? 'Some stored data was unreadable and has been set aside.' : null);
        db = CF.schema.migrate(result.data);
        invalidateDerived();
        return db;
      });
  }

  /* ---- Safety lock --------------------------------------------------------
     While locked, nothing is written to disk. The user is told what happened
     and offered the only two safe ways out: restore a backup, or start fresh
     (which they must confirm).                                              */

  function isLocked() { return !!locked; }
  function lockInfo() { return locked; }
  function takeLoadNotice() { var n = loadNotice; loadNotice = null; return n; }

  /** Deliberately clear the lock — the user has chosen to overwrite. */
  function unlock() { locked = null; schedule(); }

  function get() { return db; }

  function subscribe(fn) {
    listeners.push(fn);
    return function () {
      listeners = listeners.filter(function (l) { return l !== fn; });
    };
  }

  function notify() {
    listeners.forEach(function (fn) {
      try { fn(db); } catch (e) { console.error('[CleanFlow] listener failed', e); }
    });
  }

  /**
   * Drop anything derived from the database. Called on every mutation, not
   * from a change subscriber — a `silent` commit skips notify(), and a cached
   * index that outlives the data it summarises is a correctness bug.
   */
  function invalidateDerived() {
    if (CF.q && CF.q.invalidate) CF.q.invalidate();
  }

  /* ---- Persistence ------------------------------------------------------ */

  /**
   * Persist now. The pending flag is only cleared once the write has actually
   * landed — clearing it up front means a failed save is never retried and the
   * change is lost with nothing left to say so.
   */
  function flush() {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    if (locked) return Promise.resolve();          // never write over data we could not read
    if (!pendingSave) return Promise.resolve();
    if (saveInFlight) return Promise.resolve();    // the in-flight write will pick up the latest db

    saveInFlight = true;
    var snapshotSeq = writeSeq;

    return CF.storage.save(db)
      .then(function () {
        saveInFlight = false;
        // Only settled if nothing changed while the write was in flight.
        if (writeSeq === snapshotSeq) pendingSave = false;
        else schedule();
        retryCount = 0;
        if (saveError) {
          saveError = null;
          if (CF.ui && CF.ui.toast) CF.ui.toast('Saved — your data is safe again', { tone: 'ok' });
        }
        notifySaveState();
      })
      .catch(function (err) {
        saveInFlight = false;
        saveError = err;                 // pendingSave stays true
        console.error('[CleanFlow] save failed', err);

        // Back off, but keep trying: a quota error often clears once the user
        // frees space, and a locked database usually frees up on its own.
        retryCount += 1;
        var delay = Math.min(500 * Math.pow(2, retryCount - 1), MAX_RETRY_DELAY);
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(flush, delay);

        if (retryCount === 1 && CF.ui && CF.ui.toast) {
          CF.ui.toast(err && err.quota
            ? 'This device is out of space — export a backup now'
            : 'Could not save to this device — export a backup now',
            { tone: 'bad', sticky: true });
        }
        notifySaveState();
      });
  }

  function schedule() {
    pendingSave = true;
    writeSeq += 1;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 400);
  }

  /**
   * Synchronous last chance, for `pagehide`. Promises do not get to settle
   * while a tab is closing, so an async save can simply never run.
   */
  function flushSync() {
    if (locked || !pendingSave) return true;
    var ok = CF.storage.saveSync(db);
    if (ok) { pendingSave = false; retryCount = 0; }
    return ok;
  }

  function hasUnsavedChanges() { return pendingSave || saveInFlight; }
  function lastSaveError() { return saveError; }

  var saveStateListeners = [];
  function onSaveState(fn) {
    saveStateListeners.push(fn);
    return function () {
      saveStateListeners = saveStateListeners.filter(function (l) { return l !== fn; });
    };
  }
  function notifySaveState() {
    saveStateListeners.forEach(function (fn) {
      try { fn({ error: saveError, pending: pendingSave, retries: retryCount }); }
      catch (e) { console.error(e); }
    });
  }

  /* ---- Mutation --------------------------------------------------------- */

  /**
   * The only way the database changes.
   *   commit('Booked job', function (d) { d.jobs.push(job); })
   * Options:
   *   silent   — persist but do not re-render (rare; used for timers)
   *   noUndo   — do not push a snapshot (used for bulk/irreversible ops)
   */
  function commit(label, mutator, options) {
    var opts = options || {};

    // A second tab must not overwrite the tab that is actually being used.
    if (CF.tabguard && !CF.tabguard.canWrite()) {
      if (CF.ui && CF.ui.toast) {
        CF.ui.toast('CleanFlow is open in another tab — changes here are not saved', { tone: 'bad' });
      }
      return db;
    }

    if (locked) {
      if (CF.ui && CF.ui.toast) {
        CF.ui.toast('Your saved data could not be read — resolve that first', { tone: 'bad' });
      }
      return db;
    }

    if (!opts.noUndo) pushUndo(label);

    mutator(db);
    invalidateDerived();

    if (!opts.skipActivity && opts.activity) logActivity(opts.activity);

    schedule();
    if (!opts.silent) notify();
    return db;
  }

  function pushUndo(label) {
    undoStack.push({ label: label, snapshot: JSON.stringify(db) });
    if (undoStack.length > MAX_UNDO) undoStack.shift();
  }

  function canUndo() { return undoStack.length > 0; }

  function undo() {
    var entry = undoStack.pop();
    if (!entry) return false;
    db = JSON.parse(entry.snapshot);
    invalidateDerived();
    schedule();
    notify();
    return entry.label || true;
  }

  /** Replace the whole database — restore from backup, reset, seed demo. */
  function replace(next, label) {
    // Restoring or resetting is the user's explicit decision to overwrite,
    // so it is also what releases a read-failure lock.
    locked = null;
    pushUndo(label || 'Replace data');
    db = CF.schema.migrate(next);
    invalidateDerived();
    schedule();
    notify();
    return db;
  }

  /* ---- Activity log ------------------------------------------------------ */

  function logActivity(entry) {
    if (!entry) return;
    db.activity.unshift({
      id: uid('act'),
      at: new Date().toISOString(),
      date: CF.fmt.today(),
      icon: entry.icon || '•',
      text: entry.text,
      link: entry.link || null
    });
    if (db.activity.length > 200) db.activity.length = 200;
  }

  /* ---- Generic collection access ----------------------------------------
     Every read goes through `all()` so soft-deleted records stay invisible
     without each view having to remember to filter.                        */

  function all(collection) {
    return (db[collection] || []).filter(function (r) { return !r.deletedAt; });
  }

  function find(collection, id) {
    if (!id) return null;
    var list = db[collection] || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) return list[i];
    }
    return null;
  }

  function insert(collection, record, label, activity) {
    var row = Object.assign({ id: uid(collection.slice(0, 3)) }, record);
    row.createdAt = row.createdAt || new Date().toISOString();
    commit(label || ('Add ' + collection), function (d) {
      d[collection].unshift(row);
    }, { activity: activity });
    return row;
  }

  function update(collection, id, patch, label, activity) {
    var found = null;
    commit(label || ('Update ' + collection), function (d) {
      var list = d[collection] || [];
      for (var i = 0; i < list.length; i++) {
        if (list[i].id === id) {
          list[i] = Object.assign({}, list[i], patch, {
            updatedAt: new Date().toISOString()
          });
          found = list[i];
          break;
        }
      }
    }, { activity: activity });
    return found;
  }

  /** Soft delete. The record stays in the file so Undo and history work. */
  function remove(collection, id, label, activity) {
    return update(collection, id,
      { deletedAt: new Date().toISOString() },
      label || ('Delete ' + collection),
      activity);
  }

  function restore(collection, id, label) {
    return update(collection, id, { deletedAt: null }, label || 'Restore');
  }

  /** Sequential, human-friendly document numbers. */
  function nextNumber(kind) {
    var n = (db.counters[kind] || 100) + 1;
    db.counters[kind] = n;
    schedule();
    return String(n);
  }

  CF.store = {
    init: init, get: get, subscribe: subscribe, notify: notify,
    commit: commit, undo: undo, canUndo: canUndo, replace: replace,
    all: all, find: find, insert: insert, update: update,
    remove: remove, restore: restore,
    nextNumber: nextNumber, logActivity: logActivity,
    flush: flush, flushSync: flushSync, lastSaveError: lastSaveError,
    hasUnsavedChanges: hasUnsavedChanges, onSaveState: onSaveState,
    isLocked: isLocked, lockInfo: lockInfo, unlock: unlock,
    takeLoadNotice: takeLoadNotice, uid: uid
  };
})(window.CF = window.CF || {});
