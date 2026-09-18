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
  var saveError = null;
  var MAX_UNDO = 25;

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
      .then(function (stored) {
        db = CF.schema.migrate(stored);
        return db;
      });
  }

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

  /* ---- Persistence ------------------------------------------------------ */

  function flush() {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    if (!pendingSave) return Promise.resolve();
    pendingSave = false;
    return CF.storage.save(db)
      .then(function () { saveError = null; })
      .catch(function (err) {
        saveError = err;
        console.error('[CleanFlow] save failed', err);
        if (CF.ui && CF.ui.toast) {
          CF.ui.toast('Could not save to this device — export a backup now', { tone: 'bad', sticky: true });
        }
      });
  }

  function schedule() {
    pendingSave = true;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 400);
  }

  function lastSaveError() { return saveError; }

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
    if (!opts.noUndo) pushUndo(label);

    mutator(db);

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
    schedule();
    notify();
    return entry.label || true;
  }

  /** Replace the whole database — restore from backup, reset, seed demo. */
  function replace(next, label) {
    pushUndo(label || 'Replace data');
    db = CF.schema.migrate(next);
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
    flush: flush, lastSaveError: lastSaveError, uid: uid
  };
})(window.CF = window.CF || {});
