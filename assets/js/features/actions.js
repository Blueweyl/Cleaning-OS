/* ==========================================================================
   CleanFlow — Domain actions

   The verbs of the business: book, start, complete, invoice, get paid,
   rebook. Views call these; they never write to the store directly. That
   keeps the workflow — Client → Quote → Book → Clean → Paid → Rebook —
   in one readable file.
   ========================================================================== */
(function (CF) {
  'use strict';

  var S  = function () { return CF.store; };
  var F  = function () { return CF.fmt; };

  /**
   * Say no out loud. A domain rule that refuses a write silently looks to the
   * person tapping the button exactly like a bug, so every refusal below says
   * why in the same place it returns null.
   */
  function warn(message) {
    if (CF.ui && CF.ui.toast) CF.ui.toast(message, { tone: 'bad' });
    return null;
  }

  /* ---- Clients ----------------------------------------------------------- */

  var MAX_NAME = 120;
  var MAX_TEXT = 2000;

  /**
   * Tidy what a person typed without second-guessing it.
   *
   * Names arrived with their padding intact, so "  Sarah" sorted before
   * everyone and a tab pasted from a spreadsheet broke both the layout and the
   * CSV. Sizes arrived unchecked, and a bedroom count of -5 produced a $5
   * quote. Nothing here changes a value a person could plausibly have meant.
   */
  function cleanClientFields(data) {
    var out = Object.assign({}, data);

    if (out.name !== undefined) out.name = tidyLine(out.name, MAX_NAME);
    ['phone', 'email', 'address', 'propertyType'].forEach(function (k) {
      if (out[k] !== undefined) out[k] = tidyLine(out[k], MAX_NAME * 2);
    });
    ['access', 'pets', 'preferences', 'notes', 'contract'].forEach(function (k) {
      if (out[k] !== undefined) out[k] = tidyBlock(out[k], MAX_TEXT);
    });

    if (out.beds !== undefined)  out.beds  = clampCount(out.beds, 0, 30, 2);
    if (out.baths !== undefined) out.baths = clampCount(out.baths, 0, 30, 1);
    if (out.sqft !== undefined)  out.sqft  = clampSqft(out.sqft);

    return out;
  }

  /** One line: no tabs or newlines, no runs of spaces, no padding. */
  function tidyLine(value, max) {
    var s = String(value === null || value === undefined ? '' : value)
      .replace(/[\u0000-\u001F\u007F]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return s.length > max ? s.slice(0, max).trim() : s;
  }

  /** Multi-line: keep the line breaks, drop the other control characters. */
  function tidyBlock(value, max) {
    var s = String(value === null || value === undefined ? '' : value)
      .replace(/\r\n?/g, '\n')
      .replace(/[\u0000-\u0009\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    return s.length > max ? s.slice(0, max).trim() : s;
  }

  function clampCount(value, min, max, fallback) {
    var n = Number(value);
    if (!isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, Math.round(n)));
  }

  /**
   * A money amount we are willing to write down, or null when it is not one.
   *
   * `Number(x) || 0` was doing this job, and it let two things through that
   * cost real accuracy: `Infinity` (which is not `|| 0`, so it survived and
   * turned every total downstream into `$∞`), and negative numbers, which on
   * an extra charge produced an invoice for minus four hundred dollars.
   * Amounts are also rounded to whole cents here — a payment of 0.005 is not
   * money, and storing it makes a balance that can never reach zero.
   */
  var MAX_AMOUNT = 10000000;
  // A cleaning job measured in more than a fortnight of minutes is a typo.
  var MAX_MINUTES = 20160;
  // Ten years of credit is already far past any real payment term.
  var MAX_TERM_DAYS = 3650;

  function money(value) {
    var n = Number(value);
    if (!isFinite(n) || n <= 0) return null;
    // Above the cap this used to clamp, so typing 1e20 booked a charge of
    // $10,000,000 and said nothing. A figure the owner typed is either the
    // figure or a mistake; quietly substituting a different one is the thing
    // this whole layer exists to prevent. storedAmount still clamps, because a
    // value already in the database has to be made usable somehow.
    if (n > MAX_AMOUNT) return null;
    var cents = Math.round(n * 100) / 100;
    return cents > 0 ? cents : null;
  }

  /**
   * An amount read back from a stored record: never negative, never infinite.
   *
   * Used where the value is already in the database rather than being typed.
   * A restored file carried a job priced at -800 and one at 1e308; both reached
   * an invoice, one billing minus eight hundred and eighty dollars and the
   * other overflowing its total to Infinity — which `outstandingTotal` then
   * spread across the whole Money screen.
   */
  /**
   * A stored list, guaranteed to be one.
   *
   * `(job.extras || [])` looks safe and is not: a restored or hand-edited file
   * holding `extras: "none"` sails past the `||` and throws on `.map`, which
   * took down invoice creation mid-transaction. `migrate` repairs these on
   * restore, but the domain layer must not assume it was the only way in.
   */
  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function storedAmount(value) {
    var n = Number(value);
    if (!isFinite(n) || n <= 0) return 0;
    return Math.round(Math.min(n, MAX_AMOUNT) * 100) / 100;
  }

  /**
   * One of the methods we offer, matched however it was typed or restored, or
   * the owner's own wording kept as a short clean label. Never an object, a
   * number or something with a tab in it — this lands in a CSV column.
   */
  function paymentMethod(value) {
    if (value === null || value === undefined) return 'Cash';
    if (typeof value === 'object') return 'Cash';
    var raw = tidyLine(value, 40);
    if (!raw) return 'Cash';
    var known = null;
    CF.schema.PAYMENT_METHODS.forEach(function (m) {
      if (m.toLowerCase() === raw.toLowerCase()) known = m;
    });
    // Not one of ours, but a buyer may genuinely be paid another way; keep
    // their wording rather than relabelling their money.
    return known || raw;
  }

  /** One of the expense categories, matched loosely, or the owner's own word. */
  function expenseCategory(value) {
    if (value === null || value === undefined || typeof value === 'object') return 'Other';
    var raw = tidyLine(value, 40);
    if (!raw) return 'Other';
    var known = null;
    CF.schema.EXPENSE_CATEGORIES.forEach(function (c) {
      if (c.toLowerCase() === raw.toLowerCase()) known = c;
    });
    return known || raw;
  }

  function clampSqft(value) {
    if (value === '' || value === null || value === undefined) return null;
    var n = Number(value);
    if (!isFinite(n) || n <= 0) return null;
    return Math.min(200000, Math.round(n));
  }

  /** A name reduced to what a duplicate check should compare. */
  function nameKey(name) {
    return tidyLine(name, MAX_NAME).toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  /** Digits only, so "(512) 555-0100" and "5125550100" are the same number. */
  function phoneKey(phone) {
    var digits = String(phone || '').replace(/\D/g, '');
    return digits.length >= 7 ? digits.slice(-10) : '';
  }

  /**
   * Clients that look like the one being entered. Reported, never enforced —
   * two households really can share a name.
   */
  function likelyDuplicates(data, excludeId) {
    var nk = nameKey(data.name);
    var pk = phoneKey(data.phone);
    if (!nk && !pk) return [];
    return CF.q.activeClients().filter(function (c) {
      if (c.id === excludeId) return false;
      if (nk && nameKey(c.name) === nk) return true;
      return !!(pk && phoneKey(c.phone) === pk);
    });
  }

  function createClient(data) {
    data = cleanClientFields(data || {});
    return S().insert('clients', Object.assign({
      name: '', phone: '', email: '', address: '',
      propertyType: 'House', sqft: null, beds: 2, baths: 1,
      access: '', pets: '', preferences: '', notes: '',
      preferredServiceId: (CF.q.activeServices()[0] || {}).id || null,
      frequency: 'one-time',
      status: 'active',
      contract: '',
      archivedAt: null
    }, data), 'Add client', {
      icon: '👥', text: 'Added new client: ' + (data.name || 'Unnamed')
    });
  }

  /** Jobs still ahead of today for this client — what archiving has to settle. */
  function futureWorkFor(clientId) {
    var t = F().today();
    return CF.q.liveJobs().filter(function (j) {
      return j.clientId === clientId && j.status !== 'completed' && j.date >= t;
    });
  }

  /**
   * Archiving says "this client has stopped". Their history stays, but their
   * future bookings must not: leaving them behind put an ex-client's clean on
   * Today's schedule and kept rebooking them forever.
   *
   * Unpaid invoices are deliberately untouched — you still want that money.
   */
  function archiveClient(id) {
    var c = S().find('clients', id);
    if (!c) return null;
    var pending = futureWorkFor(id);

    return S().transaction('Archive client', function () {
      pending.forEach(function (j) {
        S().update('jobs', j.id, {
          status: 'cancelled',
          recurrence: Object.assign({}, j.recurrence, { endedAt: new Date().toISOString() })
        }, 'Cancel job');
      });
      return S().update('clients', id, { archivedAt: new Date().toISOString() },
        'Archive client', {
          icon: '📦',
          text: 'Archived ' + c.name + (pending.length
            ? ' — history kept, ' + F().plural(pending.length, 'upcoming job') + ' cancelled'
            : ' — history kept')
        });
    });
  }

  function unarchiveClient(id) {
    return S().update('clients', id, { archivedAt: null }, 'Restore client');
  }

  /* ---- Jobs --------------------------------------------------------------- */

  /** Copy the service's SOP into the job so later template edits can't
      rewrite the history of work already done. */
  function checklistFor(serviceId) {
    var svc = S().find('services', serviceId);
    var tpl = svc && S().find('checklists', svc.checklistId);
    if (!tpl) tpl = S().all('checklists')[0];
    if (!tpl) return [];
    return tpl.items.map(function (label, i) {
      return { id: 'ci-' + i + '-' + Math.random().toString(36).slice(2, 6), label: label, done: false };
    });
  }

  /**
   * The window a cleaning job can plausibly sit in. A typo like "0226-03-04"
   * from a date field, or a paste into a restored file, would otherwise put a
   * job 1,800 years out where no list will ever show it.
   */
  function saneDate(key, fallback) {
    return F().safeDateKey(key, fallback);
  }

  function bookJob(data) {
    var client = data.clientId ? S().find('clients', data.clientId) : null;
    var svc = S().find('services', data.serviceId) || CF.q.activeServices()[0];

    var job = Object.assign({
      clientId: client ? client.id : null,
      clientName: client ? client.name : (data.clientName || ''),
      serviceId: svc ? svc.id : null,
      serviceName: svc ? svc.name : '',
      date: F().today(),
      time: '09:00',
      price: svc ? svc.basePrice : 0,
      address: client ? client.address : '',
      notes: buildJobNotes(client),
      status: 'scheduled',
      recurrence: { frequency: (client && client.frequency) || 'one-time', endedAt: null },
      checklist: checklistFor(svc ? svc.id : null),
      extras: [],
      startedAt: null, finishedAt: null, elapsedSeconds: 0,
      completedDate: null, invoiceId: null, quoteId: null
    }, data);

    if (!job.checklist || !job.checklist.length) job.checklist = checklistFor(job.serviceId);
    job.date = saneDate(job.date, F().today());

    // The defaults above resolve the client and service, but `data` is the last
    // argument to Object.assign, so a raw id in the input overwrote the resolved
    // one and that resolution never applied. A job could be booked against a
    // client or service id that does not exist. The names are kept — they are
    // what the job was booked as — and a dangling id is dropped.
    if (job.clientId && !client) {
      job.clientName = job.clientName || '';
      job.clientId = null;
    }
    if (job.serviceId && !S().find('services', job.serviceId)) {
      job.serviceName = job.serviceName || (svc ? svc.name : '');
      job.serviceId = svc ? svc.id : null;
    }

    // Every other money action validates its amount; this one took whatever it
    // was handed. A service saved with a base price of -50 booked jobs at -$50,
    // which the dashboard then showed as "Standard Cleaning -$50", and Infinity
    // or 1e20 went in just as readily. A booking is not a refund, so the price
    // is floored at zero and capped like any other stored amount.
    job.price = storedAmount(job.price);

    // The price is snapshotted at booking so that editing a service later
    // cannot rewrite what a past job was worth. The planned duration was not:
    // jobMinutes() fell through to the service's *current* estimate, so
    // changing Standard Cleaning from 150 minutes to 999 rewrote how long
    // every job ever booked was supposed to take, completed ones included —
    // and with them the clash check on any day they sit on. Snapshotted the
    // same way the price is. A job already in the file keeps falling back to
    // its service, because inventing a figure for it would be the same fault
    // in the other direction.
    var mins = Math.round(Number(job.estMinutes));
    if (!isFinite(mins) || mins <= 0) mins = svc ? Math.round(Number(svc.estMinutes)) : NaN;
    job.estMinutes = isFinite(mins) && mins > 0 ? Math.min(mins, MAX_MINUTES) : null;

    return S().insert('jobs', job, 'Book job', {
      icon: '📅',
      text: 'Booked ' + (job.serviceName || 'job') + ' for ' +
            (job.clientName || CF.q.clientName(job.clientId)) +
            ' on ' + F().shortDate(job.date)
    });
  }

  /** Access, pets and parking are what a cleaner actually needs on arrival. */
  function buildJobNotes(client) {
    if (!client) return '';
    return [client.access, client.pets, client.preferences]
      .filter(Boolean).join(' ');
  }

  /**
   * The only states a clean can move between. Everything else is a
   * double-tap, a stale screen or a hand-edited file, and is refused here so
   * the UI is not the only thing holding the workflow together.
   *
   *   scheduled  → in_progress → completed
   *              ↘ cancelled  ↙
   *
   * `completed` and `cancelled` are terminal: a completed job owns an invoice
   * and a cancelled one does not, so reopening either leaves the books and the
   * schedule disagreeing about what happened.
   */
  function startJob(id) {
    var job = S().find('jobs', id);
    if (!job) return null;
    if (job.status === 'completed') {
      return warn('That job is already finished');
    }
    if (job.status === 'cancelled') {
      // Starting a cancelled job put it back on the clock while every list
      // still treated it as called off.
      return warn('That job was cancelled — rebook it to clean it');
    }
    // Already running: tapping START a second time (a double-tap, or a stale
    // job screen) used to reset startedAt and throw away every second worked
    // since the first tap. Leave the running clock exactly as it is.
    if (job.status === 'in_progress' && job.startedAt) return job;

    return S().update('jobs', id, {
      status: 'in_progress',
      startedAt: new Date().toISOString()
    }, 'Start job');
  }

  /**
   * Bank the running time and stop the clock.
   *
   * This used to do its own arithmetic, which meant it did not share
   * `elapsedSeconds`' guard against a clock that has moved backwards. A device
   * whose clock jumped back a day — a DST correction, a manual fix, a flat
   * battery — banked *minus* 21 hours over the two real hours worked, and the
   * cleaner's time was gone. One source of truth for the sum now.
   */
  function pauseJob(id) {
    var job = S().find('jobs', id);
    if (!job || !job.startedAt) return job;
    // start and resume both refuse a terminal job; pause did not, and a
    // cancelled or completed job left with a stale startedAt — a crash mid-clean,
    // a restored file, a second tab — banked an hour of work onto a record whose
    // invoice was already raised. A terminal job's clock is history.
    if (job.status === 'completed' || job.status === 'cancelled') return job;
    return S().update('jobs', id, {
      startedAt: null,
      elapsedSeconds: elapsedSeconds(job)
    }, 'Pause timer');
  }

  /**
   * Restart a paused clock. This had no guard at all, so it would put a
   * running timer on a cancelled job, or on a completed one that already had
   * its invoice raised — and resuming a job that was *already* running reset
   * the clock, silently discarding the time worked since it started.
   */
  function resumeJob(id) {
    var job = S().find('jobs', id);
    if (!job) return null;
    if (job.status === 'completed') return warn('That job is already finished');
    if (job.status === 'cancelled') return warn('That job was cancelled');
    if (job.status !== 'in_progress') return startJob(id);
    if (job.startedAt) return job;      // already running; don't reset the clock
    return S().update('jobs', id, { startedAt: new Date().toISOString() }, 'Resume timer');
  }

  /** A clean nobody would claim to have worked in one sitting. */
  var IMPLAUSIBLE_SECONDS = 12 * 3600;

  function elapsedSeconds(job) {
    if (!job) return 0;
    var banked = Number(job.elapsedSeconds) || 0;
    if (banked < 0) banked = 0;
    if (!job.startedAt) return banked;

    var since = Math.floor((Date.now() - new Date(job.startedAt).getTime()) / 1000);
    // A clock that moved backwards (or a timezone change) makes this negative;
    // never let it eat into time already banked.
    if (!isFinite(since) || since < 0) since = 0;
    return banked + since;
  }

  /** True when the recorded time is long enough to be a forgotten timer. */
  function timerLooksForgotten(job) {
    return elapsedSeconds(job) > IMPLAUSIBLE_SECONDS;
  }

  /**
   * The record of what was actually cleaned.
   *
   * Once a job is closed this is history: the invoice has been raised from it
   * and sent. Unticking an item afterwards left the job claiming work was not
   * done while the client held a bill saying it was. A cancelled job was never
   * worked at all, so it has nothing to tick.
   */
  function toggleChecklistItem(jobId, itemId) {
    var job = S().find('jobs', jobId);
    if (!job) return null;
    if (job.status === 'completed') {
      return warn('That job is finished — its checklist is part of your records now');
    }
    if (job.status === 'cancelled') return warn('That job was cancelled');
    var next = asArray(job.checklist).map(function (i) {
      return i.id === itemId ? Object.assign({}, i, { done: !i.done }) : i;
    });
    return S().update('jobs', jobId, { checklist: next }, 'Checklist', null);
  }

  /**
   * An extra on top of the agreed price — the fridge, the oven, the garage.
   *
   * Validated here rather than only in the modal: a negative amount used to be
   * accepted, and because the invoice is the sum of its lines, one -500 extra
   * raised an invoice for -$400. The label is tidied for the same reason
   * client names are — it goes into an invoice line and a CSV column, and a
   * pasted cell arrived with tabs, newlines and 300 characters of it.
   */
  function addExtraCharge(jobId, label, amount) {
    var job = S().find('jobs', jobId);
    if (!job) return null;
    if (job.status === 'completed') {
      // The invoice is already raised from these lines; adding to them now
      // would change a total the client has been given.
      return warn('That job is closed — add this to the invoice instead');
    }
    if (job.status === 'cancelled') {
      return warn('That job was cancelled — there is nothing to charge for');
    }
    var value = money(amount);
    if (value === null) {
      warn('Enter a charge above zero');
      return null;
    }
    var extras = asArray(job.extras).concat([{
      id: S().uid('ex'),
      label: tidyLine(label, MAX_NAME) || 'Extra',
      amount: value
    }]);
    return S().update('jobs', jobId, { extras: extras }, 'Add charge');
  }

  function removeExtraCharge(jobId, extraId) {
    var job = S().find('jobs', jobId);
    if (!job) return null;
    if (job.status === 'completed') {
      // The invoice was built from these lines and the client has it. Dropping
      // one now left the job and the bill describing different work.
      return warn('That job is closed — its charges are on an invoice already');
    }
    if (job.status === 'cancelled') {
      // addExtraCharge already refuses a cancelled job. Removing from one was
      // still allowed, so a called-off visit's record could be edited after the
      // fact while nothing else about it could be.
      return warn('That job was cancelled — its record is closed');
    }
    return S().update('jobs', jobId, {
      extras: asArray(job.extras).filter(function (e) { return e && e.id !== extraId; })
    }, 'Remove charge');
  }

  /**
   * Finish the clean: stamp the job, raise the invoice, and roll the
   * recurring schedule forward so the next visit is already on the books.
   *
   * All three happen inside one transaction, so Undo takes back the whole
   * thing. Grouped this way because they are one decision to the user: undoing
   * only the last step would leave the job completed and the invoice raised
   * while quietly deleting the next booking.
   */
  function completeJob(jobId, options) {
    var job = S().find('jobs', jobId);
    if (!job) return null;
    // Already closed: return what exists rather than re-stamping a finished
    // job with today's date and a fresh duration.
    if (job.status === 'completed') {
      return {
        job: job,
        invoice: job.invoiceId ? S().find('invoices', job.invoiceId) : null,
        nextJob: null
      };
    }

    // The UI disables the button until every item is ticked; this is the same
    // rule at the layer that actually writes, so an imported or hand-edited
    // file cannot close a job whose work was never recorded as done.
    var progress = CF.q.checklistProgress(job);
    if (!(options && options.force) && progress.total > 0 && !progress.complete) {
      if (CF.ui && CF.ui.toast) {
        CF.ui.toast('Finish every checklist item before closing this job', { tone: 'bad' });
      }
      return null;
    }

    var seconds = elapsedSeconds(job);
    var invoice = null;
    var nextJob = null;

    var done = S().transaction('Complete job', function () {
      S().update('jobs', jobId, {
        status: 'completed',
        finishedAt: new Date().toISOString(),
        startedAt: null,
        elapsedSeconds: seconds,
        completedDate: F().today()
      }, 'Complete job');

      invoice = createInvoiceForJob(jobId);
      nextJob = rollRecurring(jobId);

      S().logActivity({
        icon: '✅',
        text: 'Completed ' + (job.serviceName || 'job') + ' for ' +
              CF.q.clientName(job.clientId, job.clientName)
      });
      return true;
    });

    if (!done) return null;   // the write was refused; nothing was changed

    return { job: S().find('jobs', jobId), invoice: invoice, nextJob: nextJob };
  }

  /** Schedule the next visit for a recurring job. */
  function rollRecurring(jobId) {
    var job = S().find('jobs', jobId);
    if (!job || !job.recurrence) return null;
    var freq = job.recurrence.frequency;
    if (!freq || freq === 'one-time' || job.recurrence.endedAt) return null;

    var days = CF.q.intervalDays(freq);
    if (!days) return null;

    // Step from the date the visit was *due*, not the day it happened to be
    // closed, so a clean finished late does not push the whole schedule back.
    // Then skip forward past today, because booking the next visit into a date
    // that has already gone is how a job lands in "Needs Closing" at birth.
    var from = job.date || job.completedDate;
    // The day of the month the schedule is pinned to, carried forward so a
    // clamp in February does not move the client permanently earlier.
    var anchorDay = job.recurrence.anchorDay || dayOfMonth(from);
    var next = CF.q.nextOccurrence(from, freq, F().today(), anchorDay);

    // A repeat can be given a last date. Without this the only way to stop a
    // schedule was to remember to end it by hand, forever.
    if (job.recurrence.until && next && next > job.recurrence.until) return null;

    return bookJob({
      clientId: job.clientId,
      clientName: job.clientName,
      serviceId: job.serviceId,
      serviceName: job.serviceName,
      date: next || F().addDays(job.completedDate || job.date, days),
      time: job.time,
      price: job.price,
      estMinutes: job.estMinutes || null,
      address: job.address,
      notes: job.notes,
      recurrence: {
        frequency: freq, endedAt: null, anchorDay: anchorDay,
        until: job.recurrence.until || null
      },
      checklist: checklistFor(job.serviceId)
    });
  }

  function dayOfMonth(key) {
    var d = F().fromKey(key);
    return d ? d.getDate() : null;
  }

  function endRecurring(jobId) {
    var job = S().find('jobs', jobId);
    if (!job) return null;
    return S().update('jobs', jobId, {
      recurrence: Object.assign({}, job.recurrence, { endedAt: new Date().toISOString() })
    }, 'End recurring');
  }

  /**
   * Push this visit out by one interval. Skipping an already-overdue job used
   * to move it from one past date to another — three taps to get a job that
   * was three weeks late back into the future — so the date always lands ahead
   * of today.
   */
  function skipNextOccurrence(jobId) {
    var job = S().find('jobs', jobId);
    if (!job) return null;
    var freq = (job.recurrence && job.recurrence.frequency) || 'weekly';
    var anchorDay = (job.recurrence && job.recurrence.anchorDay) || dayOfMonth(job.date);
    var next = CF.q.nextOccurrence(job.date, freq, F().today(), anchorDay) ||
               F().addDays(F().today(), CF.q.intervalDays(freq) || 7);
    return S().update('jobs', jobId, { date: next }, 'Skip next');
  }

  function cancelJob(jobId) {
    var job = S().find('jobs', jobId);
    if (!job) return null;
    // A completed job has an invoice against it. Cancelling the job would
    // leave that invoice live and payable with nothing to explain it.
    if (job.status === 'completed') return warn('That job is finished — it cannot be cancelled');
    if (job.status === 'cancelled') return job;   // already called off
    return S().update('jobs', jobId, { status: 'cancelled' }, 'Cancel job', {
      icon: '🚫', text: 'Cancelled job for ' + CF.q.clientName(job.clientId, job.clientName)
    });
  }

  /* ---- Invoices ------------------------------------------------------------ */

  /**
   * The tax rate this job's invoice must be billed at.
   *
   * Normally the rate in force today. But when the job came from a quote the
   * client accepted, the rate agreed then is the rate that applies — otherwise
   * raising the rate in Settings between acceptance and the clean silently
   * billed more than was agreed. A quote accepted at 5% and completed after a
   * change to 10% was invoiced $440 against an agreed $420.
   *
   * Returns null when there is no agreement to honour, meaning "use today's".
   */
  function agreedTaxRate(job) {
    if (!job || !job.quoteId) return null;
    var quote = S().find('quotes', job.quoteId);
    if (!quote || quote.status !== 'accepted') return null;
    if (quote.taxEnabledAtAccept === false) return 0;
    var rate = Number(quote.taxRateAtAccept);
    if (!isFinite(rate) || rate < 0) return null;
    return Math.min(rate, 100);
  }

  /** A day count from settings: honour 0, fall back only when it is unusable. */
  function terms(value, fallback) {
    var n = Number(value);
    if (!isFinite(n) || n < 0) return fallback;
    return Math.min(Math.round(n), MAX_TERM_DAYS);
  }

  function createInvoiceForJob(jobId) {
    var job = S().find('jobs', jobId);
    if (!job) return null;

    // Already invoiced: hand back the same invoice rather than issuing a second
    // one. But the pointer can outlive what it points at — a rescued backup can
    // bring back a completed job whose invoice the damage destroyed, and a
    // hand-edited file can do the same. That used to return nothing at all, so
    // "Create Invoice" sat on the job doing nothing and the work could never be
    // billed. A pointer to an invoice that is gone is not an invoice.
    if (job.invoiceId) {
      var existing = S().find('invoices', job.invoiceId);
      if (existing) return existing;
    }

    var s = S().get().settings;
    // Amounts come out of stored records, which a restore or a hand-edit can
    // have filled with anything. A negative or infinite line is not a bill.
    var lines = [{
      label: tidyLine(job.serviceName || CF.q.serviceName(job.serviceId), MAX_NAME) || 'Cleaning',
      amount: storedAmount(job.price)
    }].concat(asArray(job.extras).map(function (e) {
      return {
        label: tidyLine(e && e.label, MAX_NAME) || 'Extra',
        amount: storedAmount(e && e.amount)
      };
    }));

    var subtotal = storedAmount(lines.reduce(function (a, l) { return a + l.amount; }, 0));

    // Honour the rate agreed with the client where there is one.
    var agreed = agreedTaxRate(job);
    var tax = agreed === null
      ? CF.pricing.taxOn(subtotal)
      : Math.round(subtotal * agreed) / 100;
    if (!isFinite(tax) || tax < 0) tax = 0;

    var invoice = S().insert('invoices', {
      number: S().nextNumber('invoice'),
      clientId: job.clientId,
      clientName: job.clientName || CF.q.clientName(job.clientId),
      jobId: job.id,
      lines: lines,
      subtotal: subtotal,
      tax: tax,
      // Recorded so the invoice can say what rate it was billed at, and so a
      // later Settings change is visibly not what this bill used.
      taxRate: agreed === null ? CF.pricing.taxRate() : agreed,
      taxAgreedAtQuote: agreed !== null,
      total: Math.round((subtotal + tax) * 100) / 100,
      issueDate: F().today(),
      // `|| 14` meant a stored 0 silently became a fortnight, so Settings read
      // "0 days" while the invoice fell due two weeks later. Zero is a real
      // answer here — due on issue.
      dueDate: F().addDays(F().today(), terms(s.invoiceTermsDays, 14)),
      payments: [],
      notes: ''
    }, 'Create invoice', {
      icon: '🧾',
      text: 'Invoice raised for ' + (job.clientName || CF.q.clientName(job.clientId)) +
            ' — ' + F().money(Math.round((subtotal + tax) * 100) / 100)
    });

    S().update('jobs', jobId, { invoiceId: invoice.id }, 'Link invoice');
    return invoice;
  }

  /**
   * Money in against an invoice.
   *
   * Every rule here used to live only in the payment modal, which meant a
   * restored backup, a second tab or a mistyped date could put a figure in the
   * ledger that the modal would have refused:
   *
   *  - `Infinity` passed the old `<= 0` check and made every total `$∞`.
   *  - Overpayment was a UI check against a captured balance, so two payments
   *    recorded from two tabs could both pass and take the invoice past its
   *    total with nothing on screen to explain it.
   *  - A malformed date was stored verbatim. It still counted on the invoice,
   *    but `paymentsIn` buckets by month and silently dropped it — the invoice
   *    read paid while Money said the money never arrived.
   */
  function recordPayment(invoiceId, amount, method, date) {
    var inv = S().find('invoices', invoiceId);
    if (!inv) return null;

    var value = money(amount);
    if (value === null) {
      warn('Enter an amount above zero');
      return null;
    }

    // Re-read the balance from the invoice as it is right now, not from
    // whatever the screen was showing when the modal opened.
    var remaining = CF.q.invoiceRemaining(inv);
    if (value > remaining + 0.005) {
      warn(remaining > 0
        ? 'That is more than the ' + F().money(remaining) + ' still owed'
        : 'That invoice is already paid in full');
      return null;
    }

    var when = F().safeDateKey(date, F().today());

    var payments = asArray(inv.payments).concat([{
      id: S().uid('pay'),
      amount: value,
      method: paymentMethod(method),
      date: when
    }]);

    var updated = S().update('invoices', invoiceId, { payments: payments },
      'Record payment', {
        icon: '💵',
        text: 'Payment received from ' + (inv.clientName || CF.q.clientName(inv.clientId)) +
              ' — ' + F().money(value)
      });

    return updated;
  }

  function removePayment(invoiceId, paymentId) {
    var inv = S().find('invoices', invoiceId);
    if (!inv) return null;
    return S().update('invoices', invoiceId, {
      payments: asArray(inv.payments).filter(function (p) { return p && p.id !== paymentId; })
    }, 'Remove payment');
  }

  /* ---- Quotes --------------------------------------------------------------- */

  /**
   * A scope figure on a quote: square feet, bedrooms, bathrooms.
   *
   * These go straight onto the document the client reads, which rendered
   * "NaN sq ft - null beds - undefined baths" when a restored or hand-edited
   * quote carried junk. A scope figure that cannot be read is replaced by the
   * same default a new quote starts from.
   */
  function scopeFigure(value, fallback, max) {
    var n = Number(value);
    if (!isFinite(n) || n < 0) return fallback;
    return Math.min(Math.round(n), max);
  }

  function saveQuote(data) {
    var clean = Object.assign({}, data);

    // The client can be gone by the time this saves: a quote typed before a
    // restore lands afterwards, and the id it was typed against belongs to a
    // business that is no longer here. bookJob already resolves its client and
    // drops a dead id; this did not, so the quote arrived attached to nobody.
    // The typed name is kept — it is what the quote was for — and the dangling
    // id is dropped so nothing points at a record that does not exist.
    if (clean.clientId && !S().find('clients', clean.clientId)) {
      clean.clientName = clean.clientName || CF.q.clientName(clean.clientId, '');
      clean.clientId = null;
    }

    if ('sqft'  in clean) clean.sqft  = scopeFigure(clean.sqft, 1200, 200000);
    if ('beds'  in clean) clean.beds  = scopeFigure(clean.beds, 2, 30);
    if ('baths' in clean) clean.baths = scopeFigure(clean.baths, 1, 30);

    var quote = S().insert('quotes', Object.assign({
      number: S().nextNumber('quote'),
      clientId: null, clientName: '', clientPhone: '',
      serviceId: null, sqft: 1200, beds: 2, baths: 1,
      condition: 'normal', addonIds: [], frequency: 'one-time',
      price: 0, cost: 0, profit: 0, margin: 0, minutes: 0,
      // Recorded for the audit trail. The quote screen re-derives tax from the
      // current rate so what the client is shown is what they will be invoiced.
      tax: 0, total: 0,
      status: 'draft',
      date: F().today(),
      sentDate: null,
      notes: ''
    }, clean), 'Save quote', {
      icon: '📝',
      text: 'Quote saved for ' + (data.clientName || CF.q.clientName(data.clientId)) +
            ' — ' + F().money(data.price)
    });
    return quote;
  }

  /* The only statuses a quote can hold. Everything that reads a quote — the
     lists, the follow-up nudges, acceptQuote's freeze guard — branches on these
     four, so a fifth value makes a quote invisible to all of them. */
  var QUOTE_STATUSES = ['draft', 'sent', 'accepted', 'declined'];

  function setQuoteStatus(quoteId, status) {
    // This wrote whatever it was handed: "SENT", "approved", 42, null, {} and a
    // string with a control character in it all became a quote's status, and a
    // quote in a status nothing recognises is a quote nothing will ever show.
    if (typeof status !== 'string' || QUOTE_STATUSES.indexOf(status) === -1) {
      return warn('That is not a quote status');
    }

    // Accepting is an agreement, so it is where a quote's story ends. The screen
    // already hides Mark Sent and Mark Declined on an accepted quote, but only
    // the screen did: moving one back to sent or declined here left the booked
    // job standing and took the quote out of `accepted`, which is the state
    // acceptQuote checks to know it has already been honoured. Accepting it a
    // second time then booked a second clean for one agreed price — the same
    // double-booking the double-tap guard exists to prevent, reached the long
    // way round. Cancelling the work is a change to the job, not a rewrite of
    // what was agreed.
    var current = S().find('quotes', quoteId);
    if (current && current.status === 'accepted' && status !== 'accepted') {
      return warn('This quote was accepted and booked, so its status cannot change');
    }

    var patch = { status: status };
    if (status === 'sent') patch.sentDate = F().today();
    return S().update('quotes', quoteId, patch, 'Quote ' + status);
  }

  /**
   * Accepting a quote is the hinge of the whole product: it turns a lead
   * into a client and a price into a booking, in one step.
   */
  function acceptQuote(quoteId, bookingDetails) {
    var quote = S().find('quotes', quoteId);
    if (!quote) return null;

    // Accepting twice is the same decision twice, not two bookings. A
    // double-tap on "Accepted → Book Job" used to create a second client and a
    // second job every time — three taps, three cleans on the calendar for one
    // agreed price. Hand back what the first acceptance produced instead.
    if (quote.status === 'accepted') {
      var booked = existingJobForQuote(quote.id);
      if (booked) return { clientId: quote.clientId, job: booked, alreadyAccepted: true };
      // Accepted but its job is gone (deleted, or an older file): fall through
      // and book the work again rather than leaving the quote with nothing.
    }

    return S().transaction('Accept quote', function () {
      return doAcceptQuote(quote, bookingDetails);
    });
  }

  /** The job this quote was turned into, if it still exists. */
  function existingJobForQuote(quoteId) {
    return S().all('jobs').filter(function (j) {
      return j.quoteId === quoteId && j.status !== 'cancelled';
    })[0] || null;
  }

  function doAcceptQuote(quote, bookingDetails) {
    var quoteId = quote.id;
    var clientId = quote.clientId;
    if (!clientId) {
      var created = createClient({
        name: quote.clientName || 'New client',
        phone: quote.clientPhone || '',
        sqft: quote.sqft, beds: quote.beds, baths: quote.baths,
        preferredServiceId: quote.serviceId,
        frequency: quote.frequency || 'one-time',
        status: 'active'
      });
      clientId = created.id;
      S().update('quotes', quoteId, { clientId: clientId }, 'Link quote to client');
    }

    // Freeze the money at the moment it was agreed. The quote screen shows a
    // live tax figure while a quote is still open — right, because that is what
    // the client will be invoiced — but once accepted these are the numbers
    // both sides shook hands on, and a later Settings change must not rewrite
    // them. `taxRateAtAccept` is kept so the document can show the rate that
    // applied, not today's.
    //
    // Freezing happens once. Rebooking a quote whose job was cancelled comes
    // back through here, and re-freezing at the rate in force *then* rewrote
    // the agreement: a total agreed at 5% became a total at 25% because the
    // owner had changed their rate in between.
    var patch = { status: 'accepted' };
    if (quote.taxRateAtAccept === undefined || quote.taxRateAtAccept === null) {
      var agreedTax = CF.pricing.taxOn(Number(quote.price) || 0);
      patch.acceptedAt = new Date().toISOString();
      patch.tax = agreedTax;
      patch.total = Math.round(((Number(quote.price) || 0) + agreedTax) * 100) / 100;
      patch.taxRateAtAccept = CF.pricing.taxRate();
      patch.taxEnabledAtAccept = !!S().get().settings.taxEnabled;
    }
    S().update('quotes', quoteId, patch, 'Accept quote');

    var job = bookJob(Object.assign({
      clientId: clientId,
      serviceId: quote.serviceId,
      price: quote.price,
      quoteId: quote.id,
      recurrence: { frequency: quote.frequency || 'one-time', endedAt: null }
    }, bookingDetails || {}));

    return { clientId: clientId, job: job };
  }

  /* ---- Expenses -------------------------------------------------------------- */

  /**
   * Money out. This had no validation at all, and it sits directly under the
   * profit figure: a single expense of `Infinity` or `'abc'` made the month's
   * expenses and profit non-finite, so the whole Money screen read as nothing.
   * A negative expense quietly added to profit instead of subtracting from it.
   */
  function addExpense(data) {
    var d = data || {};
    var amount = money(d.amount);
    if (amount === null) {
      warn('Enter an amount above zero for this expense');
      return null;
    }
    var row = Object.assign({}, d, {
      amount: amount,
      category: expenseCategory(d.category === undefined ? 'Supplies' : d.category),
      note: tidyBlock(d.note === undefined ? '' : d.note, MAX_TEXT),
      date: F().safeDateKey(d.date, F().today())
    });
    return S().insert('expenses', row, 'Add expense', {
      icon: '🧾',
      text: row.category + ' — ' + F().money(row.amount)
    });
  }

  /* ---- Outreach (Grow) -------------------------------------------------------- */

  function markContacted(key) {
    S().commit('Mark contacted', function (d) {
      d.outreach[key] = { at: new Date().toISOString(), date: F().today() };
    });
  }

  function clearContacted(key) {
    S().commit('Undo contacted', function (d) { delete d.outreach[key]; });
  }

  /**
   * Fill a message template. Unknown tokens are stripped rather than left
   * as `{client}` in a message someone is about to send a paying customer.
   */
  /**
   * One token's value, fit to appear in a message sent to a client.
   *
   * Checking only for undefined and null let NaN, Infinity, "[object Object]"
   * and a comma-joined array through into text the owner copies and sends. A
   * value that cannot be written out as a word or a figure is left blank
   * instead: an empty gap reads as a mistake, "[object Object]" reads as
   * something worse.
   */
  function fillable(value) {
    if (value === undefined || value === null) return '';
    if (typeof value === 'number') return isFinite(value) ? String(value) : '';
    if (typeof value === 'boolean') return value ? 'yes' : 'no';
    if (typeof value !== 'string') return '';
    return value;
  }

  function renderTemplate(body, vars) {
    var biz = S().get().business;
    var s = S().get().settings;
    var all = Object.assign({
      business: biz.name || 'my cleaning service',
      owner: biz.owner || '',
      referralOffer: s.referralOffer || ''
    }, vars || {});

    return String(body === 0 ? '0' : (body || ''))
      .replace(/\{(\w+)\}/g, function (match, key) {
        return fillable(all[key]);
      })
      // Tidy the gap a removed token leaves ("invoice  for" -> "invoice for")
      // without flattening the owner's own layout. /\s{2,}/ did both: a message
      // written with paragraphs arrived as a single run-on line.
      .replace(/[^\S\r\n]{2,}/g, ' ')
      .replace(/[^\S\r\n]+(\r?\n)/g, '$1')
      .replace(/(\r?\n){3,}/g, '\n\n')
      .trim();
  }

  CF.actions = {
    createClient: createClient,
    cleanClientFields: cleanClientFields,
    likelyDuplicates: likelyDuplicates, futureWorkFor: futureWorkFor, archiveClient: archiveClient, unarchiveClient: unarchiveClient,
    bookJob: bookJob, startJob: startJob, pauseJob: pauseJob, resumeJob: resumeJob,
    elapsedSeconds: elapsedSeconds, timerLooksForgotten: timerLooksForgotten,
    toggleChecklistItem: toggleChecklistItem,
    addExtraCharge: addExtraCharge, removeExtraCharge: removeExtraCharge,
    completeJob: completeJob, cancelJob: cancelJob,
    rollRecurring: rollRecurring, endRecurring: endRecurring,
    skipNextOccurrence: skipNextOccurrence,
    createInvoiceForJob: createInvoiceForJob, recordPayment: recordPayment,
    removePayment: removePayment,
    saveQuote: saveQuote, setQuoteStatus: setQuoteStatus, acceptQuote: acceptQuote,
    QUOTE_STATUSES: QUOTE_STATUSES,
    addExpense: addExpense,
    markContacted: markContacted, clearContacted: clearContacted,
    renderTemplate: renderTemplate, checklistFor: checklistFor
  };
})(window.CF = window.CF || {});
