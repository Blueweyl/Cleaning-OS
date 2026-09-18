/* ==========================================================================
   CleanFlow — Backup, restore and CSV export

   There is no cloud and no account, so the backup file IS the safety net.
   Restore is deliberately cautious: the file is validated and summarised,
   and the caller must confirm before anything is overwritten.
   ========================================================================== */
(function (CF) {
  'use strict';

  var FILE_TAG = 'cleanflow-backup';

  function download(filename, text, mime) {
    var blob = new Blob([text], { type: (mime || 'text/plain') + ';charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 200);
  }

  function stamp() {
    var d = new Date();
    return d.getFullYear() + '-' +
           String(d.getMonth() + 1).padStart(2, '0') + '-' +
           String(d.getDate()).padStart(2, '0');
  }

  function slug(text) {
    return String(text || 'cleanflow').toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'cleanflow';
  }

  /* ---- Full backup -------------------------------------------------------- */

  function exportBackup() {
    var db = CF.store.get();
    var payload = {
      _format: FILE_TAG,
      _version: CF.schema.VERSION,
      _exportedAt: new Date().toISOString(),
      _app: 'CleanFlow',
      data: db
    };
    var name = slug(db.business.name) + '-backup-' + stamp() + '.json';
    download(name, JSON.stringify(payload, null, 2), 'application/json');

    CF.store.commit('Backup', function (d) {
      d.settings.lastBackupAt = new Date().toISOString();
    }, { noUndo: true });

    return name;
  }

  /**
   * Read a backup file without applying it, so the UI can show the user
   * what they are about to overwrite themselves with.
   */
  function inspectFile(file) {
    return new Promise(function (resolve, reject) {
      if (!file) { reject(new Error('No file selected')); return; }
      if (file.size > 25 * 1024 * 1024) {
        reject(new Error('That file is unusually large for a CleanFlow backup.'));
        return;
      }
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error('Could not read that file.')); };
      reader.onload = function () {
        var parsed;
        try { parsed = JSON.parse(reader.result); }
        catch (e) {
          reject(new Error('That does not look like a CleanFlow backup — it is not valid JSON.'));
          return;
        }

        var data = parsed && parsed._format === FILE_TAG ? parsed.data : parsed;
        if (!data || typeof data !== 'object' || !Array.isArray(data.clients)) {
          reject(new Error('That file is missing CleanFlow data. Pick the .json backup CleanFlow created.'));
          return;
        }

        resolve({
          data: data,
          exportedAt: parsed._exportedAt || null,
          businessName: (data.business && data.business.name) || '',
          counts: {
            clients:  (data.clients  || []).filter(notDeleted).length,
            jobs:     (data.jobs     || []).filter(notDeleted).length,
            invoices: (data.invoices || []).filter(notDeleted).length,
            quotes:   (data.quotes   || []).filter(notDeleted).length,
            expenses: (data.expenses || []).filter(notDeleted).length
          }
        });
      };
      reader.readAsText(file);
    });
  }

  function notDeleted(r) { return r && !r.deletedAt; }

  /** Apply an inspected backup. Undo still works immediately afterwards. */
  function applyRestore(data) {
    CF.store.replace(data, 'Restore backup');
    CF.store.logActivity({ icon: '⬇️', text: 'Restored data from a backup file' });
    return CF.store.flush();
  }

  /* ---- CSV ---------------------------------------------------------------- */

  function csvCell(value) {
    var s = value === null || value === undefined ? '' : String(value);
    // A leading =, +, - or @ makes spreadsheets treat text as a formula.
    if (/^[=+\-@]/.test(s)) s = "'" + s;
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function toCsv(headers, rows) {
    var out = [headers.map(csvCell).join(',')];
    rows.forEach(function (r) { out.push(r.map(csvCell).join(',')); });
    return out.join('\r\n');
  }

  function exportCsv(kind) {
    var db = CF.store.get();
    var name = slug(db.business.name) + '-' + kind + '-' + stamp() + '.csv';
    var csv = '';

    if (kind === 'clients') {
      csv = toCsv(
        ['Name', 'Phone', 'Email', 'Address', 'Property', 'Beds', 'Baths',
         'Service', 'Frequency', 'Status', 'Jobs completed', 'Lifetime value', 'Notes'],
        CF.q.activeClients().map(function (c) {
          var st = CF.q.clientStats(c.id);
          return [c.name, c.phone, c.email, c.address, c.propertyType, c.beds, c.baths,
                  CF.q.serviceName(c.preferredServiceId, ''), c.frequency, c.status,
                  st.jobsCompleted, st.lifetimeValue, c.notes];
        })
      );
    } else if (kind === 'jobs') {
      csv = toCsv(
        ['Date', 'Time', 'Client', 'Service', 'Price', 'Extras', 'Total', 'Status', 'Address', 'Notes'],
        CF.q.sortByWhen(CF.q.jobs(), 'desc').map(function (j) {
          var extras = (j.extras || []).reduce(function (a, e) { return a + (Number(e.amount) || 0); }, 0);
          return [j.date, j.time, CF.q.clientName(j.clientId, j.clientName),
                  CF.q.serviceName(j.serviceId, j.serviceName), j.price, extras,
                  CF.q.jobTotal(j), j.status, j.address, j.notes];
        })
      );
    } else if (kind === 'invoices') {
      csv = toCsv(
        ['Number', 'Issued', 'Due', 'Client', 'Total', 'Received', 'Remaining', 'Status'],
        CF.q.invoices().map(function (i) {
          return ['#' + i.number, i.issueDate, i.dueDate,
                  CF.q.clientName(i.clientId, i.clientName), i.total,
                  CF.q.invoiceReceived(i), CF.q.invoiceRemaining(i),
                  CF.q.invoiceStatus(i).label];
        })
      );
    } else if (kind === 'expenses') {
      csv = toCsv(
        ['Date', 'Category', 'Amount', 'Note'],
        CF.q.expenses().slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; })
          .map(function (e) { return [e.date, e.category, e.amount, e.note]; })
      );
    } else if (kind === 'quotes') {
      csv = toCsv(
        ['Number', 'Date', 'Client', 'Service', 'Price', 'Est. cost', 'Est. profit', 'Margin %', 'Status'],
        CF.q.quotes().map(function (q) {
          return ['#' + q.number, q.date, q.clientName || CF.q.clientName(q.clientId),
                  CF.q.serviceName(q.serviceId, ''), q.price, q.cost, q.profit, q.margin, q.status];
        })
      );
    } else if (kind === 'payments') {
      csv = toCsv(
        ['Date', 'Client', 'Invoice', 'Amount', 'Method'],
        CF.q.paymentsIn().map(function (p) {
          return [p.date, CF.q.clientName(p.clientId), '#' + p.invoiceNumber, p.amount, p.method];
        })
      );
    } else {
      return null;
    }

    download(name, '﻿' + csv, 'text/csv');   // BOM so Excel reads UTF-8
    return name;
  }

  /* ---- Backup nagging ------------------------------------------------------ */

  function daysSinceBackup() {
    var last = CF.store.get().settings.lastBackupAt;
    if (!last) return null;
    return Math.floor((Date.now() - new Date(last).getTime()) / 86400000);
  }

  function backupOverdue() {
    var db = CF.store.get();
    var hasRealWork = CF.q.activeClients().length > 0 || CF.q.jobs().length > 0;
    if (!hasRealWork || db.settings.demoMode) return false;
    var days = daysSinceBackup();
    if (days === null) return true;
    return days >= (db.settings.backupReminderDays || 7);
  }

  function lastBackupLabel() {
    var last = CF.store.get().settings.lastBackupAt;
    if (!last) return 'Never';
    var days = daysSinceBackup();
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    return days + ' days ago';
  }

  CF.backup = {
    exportBackup: exportBackup,
    inspectFile: inspectFile,
    applyRestore: applyRestore,
    exportCsv: exportCsv,
    download: download,
    backupOverdue: backupOverdue,
    daysSinceBackup: daysSinceBackup,
    lastBackupLabel: lastBackupLabel
  };
})(window.CF = window.CF || {});
