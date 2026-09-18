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

  /** The exact bytes of a backup file — shared by download and folder copy. */
  function serialise() {
    return JSON.stringify({
      _format: FILE_TAG,
      _version: CF.schema.VERSION,
      _exportedAt: new Date().toISOString(),
      _app: 'CleanFlow',
      data: CF.store.get()
    }, null, 2);
  }

  function exportBackup(options) {
    var opts = options || {};
    var db = CF.store.get();
    var name = slug(db.business.name) + '-' +
               (opts.suffix || 'backup') + '-' + stamp() + '.json';
    download(name, serialise(), 'application/json');

    // A pre-restore safety copy is not the user's own backup habit, so it
    // must not reset the "last backed up" reminder.
    if (!opts.silent) {
      CF.store.commit('Backup', function (d) {
        d.settings.lastBackupAt = new Date().toISOString();
      }, { noUndo: true });
    }

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

        var tagged = !!(parsed && parsed._format === FILE_TAG);
        var data = tagged ? parsed.data : parsed;

        var verdict = validateShape(data, tagged);
        if (!verdict.ok) { reject(new Error(verdict.message)); return; }

        var fileVersion = tagged ? Number(parsed._version) : Number(data && data.schemaVersion);

        resolve({
          data: data,
          tagged: tagged,
          exportedAt: (tagged && parsed._exportedAt) || null,
          businessName: (data.business && data.business.name) || '',
          version: isFinite(fileVersion) ? fileVersion : null,
          // A file from a newer CleanFlow may carry fields this build drops on
          // save. The user is told rather than quietly downgraded.
          newerThanApp: isFinite(fileVersion) && fileVersion > CF.schema.VERSION,
          warnings: verdict.warnings,
          counts: {
            clients:  countLive(data.clients),
            jobs:     countLive(data.jobs),
            invoices: countLive(data.invoices),
            quotes:   countLive(data.quotes),
            expenses: countLive(data.expenses)
          }
        });
      };
      reader.readAsText(file);
    });
  }

  function notDeleted(r) { return r && typeof r === 'object' && !r.deletedAt; }

  function countLive(list) {
    return Array.isArray(list) ? list.filter(notDeleted).length : 0;
  }

  /**
   * Is this actually a CleanFlow backup?
   *
   * An untagged file has to look convincingly like one before we let it
   * replace somebody's business — any JSON with a `clients` array used to
   * sail through. Records that are not objects, or have no id, are counted
   * and reported instead of being imported as junk.
   */
  var COLLECTIONS = ['clients', 'jobs', 'invoices', 'quotes', 'expenses', 'services'];

  function validateShape(data, tagged) {
    var warnings = [];

    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return { ok: false, message: 'That file does not contain CleanFlow data. ' +
        'Pick the .json backup CleanFlow created.' };
    }

    var present = COLLECTIONS.filter(function (k) { return Array.isArray(data[k]); });
    var hasSettings = data.settings && typeof data.settings === 'object';
    var hasBusiness = data.business && typeof data.business === 'object';

    // A tagged file only needs one recognisable collection. An untagged one
    // has to clear a higher bar, because anything could be handing us JSON.
    var convincing = tagged
      ? present.length >= 1
      : (present.length >= 3 && (hasSettings || hasBusiness));

    if (!convincing) {
      return { ok: false, message: present.length
        ? 'That file is missing most of a CleanFlow backup, so restoring it ' +
          'would wipe your data and put almost nothing back. Pick the .json ' +
          'file CleanFlow exported.'
        : 'That file does not contain CleanFlow data. Pick the .json backup ' +
          'CleanFlow created.' };
    }

    var badTotal = 0;
    present.forEach(function (key) {
      var bad = data[key].filter(function (r) {
        return !r || typeof r !== 'object' || Array.isArray(r) || !r.id;
      }).length;
      if (bad) { badTotal += bad; warnings.push(bad + ' unreadable ' + key.slice(0, -1) + ' record(s)'); }
    });

    // Entirely made of junk is a corrupt file, not a recoverable one.
    var totalRows = present.reduce(function (a, k) { return a + data[k].length; }, 0);
    if (totalRows > 0 && badTotal === totalRows) {
      return { ok: false, message: 'Every record in that file is unreadable, so it ' +
        'cannot be restored. Try an older backup.' };
    }

    return { ok: true, warnings: warnings };
  }

  /** Apply an inspected backup. Undo still works immediately afterwards. */
  function applyRestore(data) {
    CF.store.replace(data, 'Restore backup');
    CF.store.logActivity({ icon: '⬇️', text: 'Restored data from a backup file' });
    return CF.store.flush();
  }

  /* ---- CSV ---------------------------------------------------------------- */

  /**
   * One CSV cell.
   *
   * Numbers are written through untouched — quoting a negative amount as
   * text ("'-54") is what turns an accountant's SUM column into gibberish.
   * Only text is screened for the leading characters that make Excel, Sheets
   * and Numbers evaluate a cell as a formula, and the check looks past any
   * leading whitespace, tab or newline used to smuggle one in.
   */
  function csvCell(value) {
    if (value === null || value === undefined) return '';

    if (typeof value === 'number') {
      return isFinite(value) ? String(value) : '';
    }
    if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';

    var s = String(value);

    // \u0000-\u001F covers tab, CR and LF; \u00A0 and friends cover the
    // non-breaking spaces that get pasted in from the web.
    if (/^[\s\u0000-\u001F\u00A0\u2000-\u200B\uFEFF]*[=+\-@\t\r]/.test(s)) {
      s = "'" + s;
    }

    if (/["\r\n,]/.test(s)) {
      // Normalise embedded breaks to CRLF so Excel keeps the row together.
      s = s.replace(/\r\n|\r|\n/g, '\r\n');
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  /** Amounts must reach the spreadsheet as numbers, not decorated strings. */
  function csvNumber(value) {
    var n = Number(value);
    return isFinite(n) ? n : 0;
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
                  csvNumber(st.jobsCompleted), csvNumber(st.lifetimeValue), c.notes];
        })
      );
    } else if (kind === 'jobs') {
      csv = toCsv(
        ['Date', 'Time', 'Client', 'Service', 'Price', 'Extras', 'Total', 'Status', 'Address', 'Notes'],
        CF.q.sortByWhen(CF.q.jobs(), 'desc').map(function (j) {
          var extras = (j.extras || []).reduce(function (a, e) { return a + (Number(e.amount) || 0); }, 0);
          return [j.date, j.time, CF.q.clientName(j.clientId, j.clientName),
                  CF.q.serviceName(j.serviceId, j.serviceName), csvNumber(j.price),
                  csvNumber(extras), csvNumber(CF.q.jobTotal(j)),
                  j.status, j.address, j.notes];
        })
      );
    } else if (kind === 'invoices') {
      csv = toCsv(
        ['Number', 'Issued', 'Due', 'Client', 'Subtotal', 'Tax', 'Total',
         'Received', 'Remaining', 'Status'],
        CF.q.invoices().map(function (i) {
          // Older invoices predate the stored subtotal; derive it so the
          // column is never blank in a spreadsheet that sums it.
          var tax = Number(i.tax) || 0;
          var subtotal = i.subtotal === undefined || i.subtotal === null
            ? (Number(i.total) || 0) - tax
            : Number(i.subtotal) || 0;
          return ['#' + i.number, i.issueDate, i.dueDate,
                  CF.q.clientName(i.clientId, i.clientName),
                  csvNumber(subtotal), csvNumber(tax), csvNumber(i.total),
                  csvNumber(CF.q.invoiceReceived(i)), csvNumber(CF.q.invoiceRemaining(i)),
                  CF.q.invoiceStatus(i).label];
        })
      );
    } else if (kind === 'expenses') {
      csv = toCsv(
        ['Date', 'Category', 'Amount', 'Note'],
        CF.q.expenses().slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; })
          .map(function (e) { return [e.date, e.category, csvNumber(e.amount), e.note]; })
      );
    } else if (kind === 'quotes') {
      csv = toCsv(
        ['Number', 'Date', 'Client', 'Service', 'Price', 'Est. cost', 'Est. profit', 'Margin %', 'Status'],
        CF.q.quotes().map(function (q) {
          return ['#' + q.number, q.date, q.clientName || CF.q.clientName(q.clientId),
                  CF.q.serviceName(q.serviceId, ''), csvNumber(q.price), csvNumber(q.cost),
                  csvNumber(q.profit), csvNumber(q.margin), q.status];
        })
      );
    } else if (kind === 'payments') {
      csv = toCsv(
        ['Date', 'Client', 'Invoice', 'Amount', 'Method'],
        CF.q.paymentsIn().map(function (p) {
          return [p.date, CF.q.clientName(p.clientId, p.clientName),
                  '#' + p.invoiceNumber, csvNumber(p.amount), p.method];
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
    exportBackup: exportBackup, serialise: serialise,
    inspectFile: inspectFile,
    applyRestore: applyRestore,
    exportCsv: exportCsv,
    download: download,
    backupOverdue: backupOverdue,
    daysSinceBackup: daysSinceBackup,
    lastBackupLabel: lastBackupLabel
  };
})(window.CF = window.CF || {});
