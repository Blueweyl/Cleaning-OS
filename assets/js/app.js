/* ==========================================================================
   CleanFlow — Bootstrap
   Opens storage, loads the database, mounts the shell. If any of that
   fails the user gets a plain explanation rather than a blank page.
   ========================================================================== */
(function (CF) {
  'use strict';

  function boot() {
    var root = document.getElementById('app');
    if (!root) return;

    if (CF.tabguard) CF.tabguard.start();

    CF.store.init()
      .then(function () {
        var mode = CF.storage.describe();
        CF.shell.mount(root);
        CF.shell.repaint();

        var notice = CF.store.takeLoadNotice();
        if (notice) setTimeout(function () { CF.ui.toast(notice, { duration: 7000 }); }, 900);
        if (CF.store.isLocked()) return;

        if (mode.mode === 'memory') {
          setTimeout(function () {
            CF.ui.toast(
              'This browser is blocking local storage — nothing will be saved. Export a backup before you close.',
              { tone: 'bad', sticky: true }
            );
          }, 900);
        } else if (CF.backup.backupOverdue()) {
          setTimeout(function () {
            var days = CF.backup.daysSinceBackup();
            CF.ui.toast(
              days === null
                ? 'Tip: export a backup from Settings — it is the only copy of your data.'
                : 'It has been ' + days + ' days since your last backup.',
              { duration: 6000 }
            );
          }, 1600);
        }
      })
      .catch(function (err) {
        console.error('[CleanFlow] failed to start', err);
        root.innerHTML =
          '<div style="max-width:520px;margin:80px auto;padding:32px;font-family:system-ui,sans-serif;' +
          'background:#fff;border:1px solid #E9EBEF;border-radius:18px;">' +
          '<h1 style="font-size:20px;margin:0 0 8px;">CleanFlow couldn\'t start</h1>' +
          '<p style="color:#64748B;line-height:1.6;margin:0 0 16px;">' +
          'Your browser blocked the storage CleanFlow needs. Try opening this file in ' +
          'Chrome, Edge or Firefox, and make sure you are not in a private window.</p>' +
          '<pre style="font-size:11px;background:#F5F6F8;padding:12px;border-radius:8px;' +
          'overflow:auto;color:#64748B;">' + String(err && err.message || err) + '</pre></div>';
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window.CF = window.CF || {});
