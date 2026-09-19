/* ==========================================================================
   CleanFlow — Unsaved draft rescue

   The Smart Quote and the Commercial Proposal are the two screens where
   someone types for several minutes before anything is saved. Both kept that
   work in a plain variable, so a refresh, a back-swipe, an accidental reload
   after Print, or closing the tab threw all of it away with no warning and no
   way back.

   This keeps the in-progress draft in localStorage as you type and offers it
   back when you return. It is deliberately *not* part of the main database:
   a half-typed proposal is not a business record, it must never appear in a
   backup, and it must never collide with the real save. One key per screen,
   cleared the moment the draft is saved or cleared by hand.
   ========================================================================== */
(function (CF) {
  'use strict';

  var PREFIX = 'cleanflow:draft:';
  var MAX_AGE_DAYS = 14;      // older than this and it is not worth offering back

  // Said once per session, never on every keystroke.
  var warnedUnavailable = false;

  /** Storage can be unavailable (private mode, a locked-down browser). */
  function store() {
    try {
      if (!window.localStorage) return null;
      return window.localStorage;
    } catch (e) { return null; }
  }

  function save(name, data) {
    var ls = store();
    if (!ls) return announceFailure();
    try {
      ls.setItem(PREFIX + name, JSON.stringify({ at: Date.now(), data: data }));
      return true;
    } catch (e) {
      // A full quota or a locked-down browser must never break typing — but it
      // must not be silent either. Believing a draft is safe when it is not is
      // worse than knowing it isn't, so say so once and let them decide whether
      // to print or save now.
      return announceFailure();
    }
  }

  function announceFailure() {
    if (!warnedUnavailable) {
      warnedUnavailable = true;
      if (CF.ui && CF.ui.toast) {
        CF.ui.toast('This browser will not keep an unsaved draft — save or print ' +
                    'before you leave this screen', { tone: 'bad', duration: 7000 });
      }
    }
    return false;
  }

  function load(name) {
    var ls = store();
    if (!ls) return null;
    try {
      var raw = ls.getItem(PREFIX + name);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || !parsed.data) return null;
      var ageDays = (Date.now() - (Number(parsed.at) || 0)) / 86400000;
      if (!isFinite(ageDays) || ageDays > MAX_AGE_DAYS) { clear(name); return null; }
      return parsed.data;
    } catch (e) {
      clear(name);
      return null;
    }
  }

  function clear(name) {
    var ls = store();
    if (!ls) return;
    try { ls.removeItem(PREFIX + name); } catch (e) { /* nothing to do */ }
  }

  CF.drafts = { save: save, load: load, clear: clear };
})(window.CF = window.CF || {});
