/* ==========================================================================
   CleanFlow — Theme

   Three choices: follow the device, always light, always dark. The chosen one
   lives in the database like every other setting, so it travels in a backup
   and restores with everything else.

   It is *also* mirrored into localStorage under its own key. The head script
   has to pick a theme before the first pixel is painted, and the database is
   opened asynchronously — by the time it answers, a white page has already
   been on screen. The mirror is the only thing fast enough to read there. The
   database stays the source of truth; the mirror is a cache of one string.
   ========================================================================== */
(function (CF) {
  'use strict';

  var KEY = 'cleanflow:theme';
  var CHOICES = ['system', 'light', 'dark'];

  function systemPrefersDark() {
    return !!(window.matchMedia &&
              window.matchMedia('(prefers-color-scheme: dark)').matches);
  }

  /** The literal theme to paint, given a choice. */
  function resolve(choice) {
    if (choice === 'dark' || choice === 'light') return choice;
    return systemPrefersDark() ? 'dark' : 'light';
  }

  function current() {
    return document.documentElement.getAttribute('data-theme') === 'dark'
      ? 'dark' : 'light';
  }

  /** What the user picked, as opposed to what is on screen. */
  function choice() {
    var db = CF.store && CF.store.get && CF.store.get();
    var stored = db && db.settings && db.settings.theme;
    if (CHOICES.indexOf(stored) !== -1) return stored;
    var mirrored = read();
    return CHOICES.indexOf(mirrored) !== -1 ? mirrored : 'system';
  }

  function read() {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }

  function mirror(value) {
    // A blocked or full localStorage must not stop the theme changing — the
    // only cost is a flash of the other theme on the next cold start.
    try {
      if (value === 'system') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, value);
    } catch (e) {}
  }

  /** Paint a choice. Does not persist it. */
  function apply(pick) {
    var mode = resolve(pick);
    document.documentElement.setAttribute('data-theme', mode);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', mode === 'dark' ? '#0D1219' : '#3E6FD9');
    listeners.forEach(function (fn) {
      try { fn(mode, pick); } catch (e) { console.error(e); }
    });
    return mode;
  }

  /** Paint it, remember it, and mirror it for the next cold start. */
  function set(pick) {
    var value = CHOICES.indexOf(pick) !== -1 ? pick : 'system';
    mirror(value);
    apply(value);
    if (CF.store && CF.store.get && CF.store.get()) {
      CF.store.commit('Theme', function (d) { d.settings.theme = value; });
    }
    return value;
  }

  /**
   * Called once the database is open. The stored setting wins over the mirror,
   * which may be stale after a restore from someone else's backup.
   */
  function sync() {
    var db = CF.store && CF.store.get && CF.store.get();
    var stored = db && db.settings && db.settings.theme;
    if (CHOICES.indexOf(stored) === -1) stored = 'system';
    if (stored !== read() && !(stored === 'system' && !read())) mirror(stored);
    apply(stored);
    return stored;
  }

  var listeners = [];
  function onChange(fn) {
    listeners.push(fn);
    return function () {
      listeners = listeners.filter(function (l) { return l !== fn; });
    };
  }

  CF.theme = {
    CHOICES: CHOICES,
    resolve: resolve, current: current, choice: choice,
    apply: apply, set: set, sync: sync, onChange: onChange,
    systemPrefersDark: systemPrefersDark
  };
})(window.CF = window.CF || {});
