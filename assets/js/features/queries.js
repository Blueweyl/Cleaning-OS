/* ==========================================================================
   CleanFlow — Derived data

   Everything the screens display but nothing stores: today's schedule, what
   needs attention, invoice status, growth opportunities. Keeping this in
   one place means Home, Money and Grow can never disagree about whether an
   invoice is overdue.
   ========================================================================== */
(function (CF) {
  'use strict';

  var S = function () { return CF.store; };
  var F = function () { return CF.fmt; };

  /* ---- Per-client index ---------------------------------------------------
     clientStats() used to scan every job and every invoice, and the Home and
     Grow screens call it once per client. That is fine for a working solo
     cleaner and quadratic for anyone with years of history. The index is
     built once per change and thrown away whenever the store moves.        */

  var index = null;

  function invalidate() { index = null; }

  function buildIndex() {
    var byClientJobs = Object.create(null);
    var byClientInvoices = Object.create(null);

    (S().get().jobs || []).forEach(function (j) {
      if (!j || j.deletedAt || !j.clientId) return;
      (byClientJobs[j.clientId] || (byClientJobs[j.clientId] = [])).push(j);
    });
    (S().get().invoices || []).forEach(function (i) {
      if (!i || i.deletedAt || !i.clientId) return;
      (byClientInvoices[i.clientId] || (byClientInvoices[i.clientId] = [])).push(i);
    });

    return { jobs: byClientJobs, invoices: byClientInvoices };
  }

  function idx() {
    if (!index) index = buildIndex();
    return index;
  }

  // store.js calls invalidate() directly on every mutation — including the
  // ones that skip notify() — so there is no subscriber to fall out of sync.

  /* ---- Lookups ---------------------------------------------------------- */

  function client(id)  { return S().find('clients', id); }
  function service(id) { return S().find('services', id); }

  function clientName(id, fallback) {
    var c = client(id);
    return c ? c.name : (fallback || 'Unknown client');
  }

  function serviceName(id, fallback) {
    var s = service(id);
    return s ? s.name : (fallback || 'Cleaning');
  }

  function activeClients() {
    return S().all('clients').filter(function (c) { return !c.archivedAt; });
  }

  function archivedClients() {
    return S().all('clients').filter(function (c) { return !!c.archivedAt; });
  }

  function activeServices() {
    return S().all('services').filter(function (s) { return s.active !== false; });
  }

  /* ---- Jobs -------------------------------------------------------------- */

  function jobs() { return S().all('jobs'); }

  function liveJobs() {
    return jobs().filter(function (j) { return j.status !== 'cancelled'; });
  }

  function sortByWhen(list, direction) {
    var dir = direction === 'desc' ? -1 : 1;
    return list.slice().sort(function (a, b) {
      var da = (a.date || '') + ' ' + (a.time || '00:00');
      var dbb = (b.date || '') + ' ' + (b.time || '00:00');
      return da < dbb ? -dir : da > dbb ? dir : 0;
    });
  }

  function todaysJobs() {
    var t = F().today();
    return sortByWhen(liveJobs().filter(function (j) {
      return j.date === t && j.status !== 'completed';
    }));
  }

  function todaysJobsIncludingDone() {
    var t = F().today();
    return sortByWhen(liveJobs().filter(function (j) { return j.date === t; }));
  }

  function upcomingJobs() {
    var t = F().today();
    return sortByWhen(liveJobs().filter(function (j) {
      return j.date > t && j.status !== 'completed';
    }));
  }

  /**
   * Past its date and still not closed — easy to forget, so surface it.
   *
   * Includes jobs left `in_progress`, not just `scheduled` ones. A clean that
   * was started and never closed matched no bucket at all: not today's (wrong
   * date), not upcoming (past), not completed, not overdue. The job and its
   * money simply disappeared from the app the next morning.
   */
  function overdueJobs() {
    var t = F().today();
    return sortByWhen(liveJobs().filter(function (j) {
      return j.date < t && (j.status === 'scheduled' || j.status === 'in_progress');
    }));
  }

  /** A clean that is still running but was not started today. */
  function stalledJobs() {
    var t = F().today();
    return liveJobs().filter(function (j) {
      return j.status === 'in_progress' && j.date < t;
    });
  }

  /**
   * The next date on or after `from` that keeps a repeating schedule's shape.
   * Weekly and bi-weekly step in days; monthly and quarterly step in calendar
   * months, so "the 15th" stays the 15th instead of sliding backwards by a day
   * or two every visit the way a flat 30-day step does.
   */
  function nextOccurrence(dateKey, frequency, notBefore, anchorDay) {
    var days = intervalDays(frequency);
    if (!days) return null;

    var months = frequency === 'monthly' ? 1 : frequency === 'quarterly' ? 3 : 0;

    // Always measured from the original date rather than from the last result,
    // so repeated steps cannot compound a clamp or a rounding.
    function step(n) {
      return months ? F().addMonths(dateKey, months * n, anchorDay)
                    : F().addDays(dateKey, days * n);
    }

    var n = 1;
    var next = step(1);
    if (!notBefore) return next;

    // Skip whole intervals until the date is genuinely ahead. Bounded so a
    // date from years back cannot spin here.
    while (next <= notBefore && n < 500) {
      n += 1;
      next = step(n);
    }
    return next;
  }

  /**
   * The repeating schedules still running — one row per live occurrence, not
   * every historical visit that happened to belong to a recurring job.
   */
  function recurringJobs() {
    return sortByWhen(liveJobs().filter(function (j) {
      return j.recurrence && j.recurrence.frequency &&
             j.recurrence.frequency !== 'one-time' && !j.recurrence.endedAt &&
             j.status !== 'completed';
    }));
  }

  function completedJobs() {
    return sortByWhen(jobs().filter(function (j) {
      return j.status === 'completed';
    }), 'desc');
  }

  function jobsForClient(clientId) {
    return sortByWhen(jobs().filter(function (j) {
      return j.clientId === clientId;
    }), 'desc');
  }

  /** How long this job is expected to take, in minutes. */
  function jobMinutes(job) {
    if (!job) return 0;
    var svc = service(job.serviceId);
    return Number(job.estMinutes) || (svc && Number(svc.estMinutes)) || 120;
  }

  function toMinutes(hhmm) {
    var parts = String(hhmm || '09:00').split(':');
    var h = Number(parts[0]), m = Number(parts[1] || 0);
    if (!isFinite(h)) h = 9;
    if (!isFinite(m)) m = 0;
    return h * 60 + m;
  }

  /**
   * Other jobs whose time on the same day overlaps this one.
   *
   * Solo cleaners sometimes stack deliberately (a helper, a quick top-up), so
   * this reports rather than forbids — but booking two 9am cleans with nothing
   * said is how a client gets stood up.
   */
  function conflictsFor(candidate) {
    if (!candidate || !candidate.date || !candidate.time) return [];
    var startA = toMinutes(candidate.time);
    var endA = startA + (Number(candidate.minutes) || 0);

    return liveJobs().filter(function (j) {
      if (j.id === candidate.excludeId) return false;
      if (j.date !== candidate.date) return false;
      if (j.status === 'completed') return false;
      var startB = toMinutes(j.time);
      var endB = startB + jobMinutes(j);
      return startA < endB && startB < endA;
    }).sort(function (a, b) { return toMinutes(a.time) - toMinutes(b.time); });
  }

  function jobTotal(job) {
    if (!job) return 0;
    var extras = (Array.isArray(job.extras) ? job.extras : []).reduce(function (a, e) {
      return a + (Number(e.amount) || 0);
    }, 0);
    return (Number(job.price) || 0) + extras;
  }

  function checklistProgress(job) {
    // Must be a list: a stored `checklist: "done"` would report a length of 4
    // from the string and then throw on filter.
    var items = (job && Array.isArray(job.checklist)) ? job.checklist : [];
    var done = items.filter(function (i) { return i && i.done; }).length;
    return {
      done: done,
      total: items.length,
      percent: items.length ? Math.round((done / items.length) * 100) : 0,
      complete: items.length > 0 && done === items.length
    };
  }

  /* ---- Invoices ---------------------------------------------------------- */

  function invoices() { return S().all('invoices'); }

  /** Money received against an invoice. Never negative, never non-finite. */
  function invoiceReceived(inv) {
    if (!inv) return 0;
    var list = Array.isArray(inv.payments) ? inv.payments : [];
    var sum = list.reduce(function (a, p) {
      var n = Number(p && p.amount);
      return a + (isFinite(n) && n > 0 ? n : 0);
    }, 0);
    return isFinite(sum) ? Math.round(sum * 100) / 100 : 0;
  }

  function invoiceRemaining(inv) {
    var total = Number(inv && inv.total);
    if (!isFinite(total) || total < 0) total = 0;
    return Math.round(Math.max(0, total - invoiceReceived(inv)) * 100) / 100;
  }

  /**
   * Anything received beyond the invoice total. `invoiceRemaining` floors at
   * zero — which is right for "what is still owed" but means an overpayment
   * would otherwise vanish, leaving a Received figure larger than the total
   * and nothing on screen to explain it.
   */
  function invoiceOverpaid(inv) {
    if (!inv) return 0;
    var over = invoiceReceived(inv) - (Number(inv.total) || 0);
    return over > 0.005 ? Math.round(over * 100) / 100 : 0;
  }

  /**
   * Does this invoice's own total disagree with the lines it is made of?
   *
   * Restoring never rewrites a figure that reads as a number, because an
   * invoice is a record of what was billed and not ours to correct. But a file
   * that has been hand-edited, truncated mid-write or merged by a sync tool can
   * arrive self-contradictory, and saying nothing about it is how someone
   * chases the wrong balance for a month. Reported here so the screen can point
   * at it and let the owner decide.
   *
   * Returns null when the invoice adds up, or by how much it is out.
   */
  function invoiceInconsistent(inv) {
    if (!inv || !Array.isArray(inv.lines) || !inv.lines.length) return null;
    var lines = inv.lines.reduce(function (a, l) { return a + safeAmount(l && l.amount); }, 0);
    var subtotal = safeAmount(inv.subtotal);
    var tax = safeAmount(inv.tax);
    var total = safeAmount(inv.total);
    var expected = Math.round((lines + tax) * 100) / 100;
    var out = {
      lines: cents(lines), subtotal: cents(subtotal), tax: cents(tax),
      total: cents(total), expected: expected,
      subtotalOff: Math.abs(subtotal - lines) > 0.005,
      totalOff: Math.abs(total - expected) > 0.005
    };
    return (out.subtotalOff || out.totalOff) ? out : null;
  }

  /**
   * Status is always derived, never stored — so it cannot go stale while
   * the app sits closed over a weekend.
   */
  function invoiceStatus(inv) {
    if (!inv) return { id: 'unpaid', label: 'Unpaid', tone: 'bad' };
    var remaining = invoiceRemaining(inv);
    if (remaining <= 0.001) return { id: 'paid', label: 'Paid', tone: 'ok' };

    var received = invoiceReceived(inv);
    var overdue = inv.dueDate && inv.dueDate < F().today();

    if (overdue) {
      return {
        id: 'overdue', tone: 'bad',
        label: received > 0 ? 'Overdue (partial)' : 'Overdue',
        daysLate: F().daysBetween(inv.dueDate, F().today())
      };
    }
    if (received > 0) return { id: 'partial', label: 'Partly paid', tone: 'warn' };
    return { id: 'unpaid', label: 'Unpaid', tone: 'brand' };
  }

  function openInvoices() {
    return invoices().filter(function (i) { return invoiceRemaining(i) > 0.001; });
  }

  function overdueInvoices() {
    return openInvoices().filter(function (i) {
      return invoiceStatus(i).id === 'overdue';
    }).sort(function (a, b) { return (a.dueDate || '') < (b.dueDate || '') ? -1 : 1; });
  }

  function outstandingTotal() {
    return Math.round(openInvoices().reduce(function (a, i) {
      return a + invoiceRemaining(i);
    }, 0) * 100) / 100;
  }

  /* ---- Quotes ------------------------------------------------------------ */

  function quotes() { return S().all('quotes'); }

  /** A day count from settings: 0 means 0, anything unusable means the default. */
  function dayCount(value, fallback) {
    var n = Number(value);
    return isFinite(n) && n >= 0 ? Math.round(n) : fallback;
  }

  function quotesByStatus(status) {
    return quotes().filter(function (q) { return q.status === status; });
  }

  /** Sent, unanswered, and old enough to be worth a nudge. */
  function staleQuotes() {
    // A stored 0 is a real choice — nudge straight away — but `|| 3` turned it
    // back into three days while Settings still displayed "0 days".
    var days = dayCount(S().get().settings.quoteFollowUpDays, 3);
    var t = F().today();
    return quotesByStatus('sent').filter(function (q) {
      var since = q.sentDate || q.date;
      return since && F().daysBetween(since, t) >= days;
    }).sort(function (a, b) {
      return (a.sentDate || a.date) < (b.sentDate || b.date) ? -1 : 1;
    });
  }

  /* ---- Money -------------------------------------------------------------- */

  function expenses() { return S().all('expenses'); }

  function inRange(dateKey, from, to) {
    if (!dateKey) return false;
    if (from && dateKey < from) return false;
    if (to && dateKey > to) return false;
    return true;
  }

  function monthBounds(offset) {
    var now = new Date();
    var d = new Date(now.getFullYear(), now.getMonth() + (offset || 0), 1);
    var end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return {
      from: F().toKey(d),
      to: F().toKey(end),
      label: d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    };
  }

  /** All payments received, flattened out of their invoices. */
  function paymentsIn(from, to) {
    var out = [];
    invoices().forEach(function (inv) {
      // A restored or hand-edited file can hold anything here. `payments`
      // arriving as a string used to throw and take the Money screen with it.
      var list = Array.isArray(inv.payments) ? inv.payments : [];
      list.forEach(function (p) {
        if (p && typeof p === 'object' && inRange(p.date, from, to)) {
          out.push({
            id: p.id, date: p.date, amount: safeAmount(p.amount),
            method: p.method, invoiceId: inv.id,
            invoiceNumber: inv.number,
            clientId: inv.clientId,
            // Jobs booked by name only have no clientId; without this the
            // payment reads "Unknown client" in the ledger and the CSV.
            clientName: inv.clientName || '',
            taxShare: paymentTaxShare(inv, p)
          });
        }
      });
    });
    return out.sort(function (a, b) { return a.date < b.date ? 1 : -1; });
  }

  /**
   * How much of one payment is tax the owner is holding for the tax office.
   * Apportioned by the invoice's own tax share, so a part payment carries a
   * proportionate part of the tax.
   */
  function paymentTaxShare(inv, payment) {
    var tax = Number(inv && inv.tax) || 0;
    var total = Number(inv && inv.total) || 0;
    var amount = Number(payment && payment.amount) || 0;
    if (tax <= 0 || total <= 0) return 0;
    return Math.round(amount * (tax / total) * 100) / 100;
  }

  function cents(n) {
    var v = Number(n);
    return isFinite(v) ? Math.round(v * 100) / 100 : 0;
  }

  /** A stored amount read for display or totalling: finite and not negative. */
  function safeAmount(value) {
    var n = Number(value);
    return isFinite(n) && n > 0 ? n : 0;
  }

  function summary(from, to) {
    var pays = paymentsIn(from, to);
    var collected = pays.reduce(function (a, p) { return a + p.amount; }, 0);

    // Sales tax passes through the business; it was never income. Counting it
    // as revenue overstates profit by the entire tax bill, which is exactly
    // the number a solo owner is trying to plan around.
    var taxCollected = pays.reduce(function (a, p) { return a + (p.taxShare || 0); }, 0);
    var revenue = cents(collected - taxCollected);

    // One expense of Infinity used to make this — and therefore profit, and
    // therefore every figure on the Money screen — non-finite.
    var spend = expenses().filter(function (e) { return e && inRange(e.date, from, to); })
      .reduce(function (a, e) { return a + safeAmount(e.amount); }, 0);

    var jobsDone = jobs().filter(function (j) {
      return j.status === 'completed' && inRange(j.completedDate || j.date, from, to);
    });

    var profit = cents(revenue - spend);

    return {
      collected: cents(collected),
      taxCollected: cents(taxCollected),
      revenue: revenue,
      expenses: cents(spend),
      profit: profit,
      margin: revenue > 0 ? Math.round((profit / revenue) * 100) : 0,
      outstanding: outstandingTotal(),
      jobsCompleted: jobsDone.length,
      averageJob: jobsDone.length
        ? Math.round(jobsDone.reduce(function (a, j) { return a + jobTotal(j); }, 0) / jobsDone.length)
        : 0
    };
  }

  function expectedToday() {
    return todaysJobsIncludingDone().reduce(function (a, j) { return a + jobTotal(j); }, 0);
  }

  /* ---- Client rollups ------------------------------------------------------ */

  function clientStats(clientId) {
    var mine = idx().jobs[clientId] || [];
    var theirInvoices = idx().invoices[clientId] || [];
    var today = F().today();

    var doneCount = 0, lastDone = null, next = null, paid = 0, outstanding = 0;

    for (var i = 0; i < mine.length; i++) {
      var j = mine[i];
      if (j.status === 'completed') {
        doneCount++;
        var when = j.completedDate || j.date;
        if (!lastDone || when > lastDone) lastDone = when;
      } else if (j.status !== 'cancelled' && j.date >= today) {
        if (!next || j.date < next.date) next = j;
      }
    }

    for (var k = 0; k < theirInvoices.length; k++) {
      paid += invoiceReceived(theirInvoices[k]);
      outstanding += invoiceRemaining(theirInvoices[k]);
    }

    return {
      jobsCompleted: doneCount,
      lifetimeValue: paid,
      lastJobDate: lastDone,
      nextJob: next,
      outstanding: outstanding
    };
  }

  /** How many days should pass between visits for this client. */
  function intervalDays(freqId) {
    var f = CF.schema.FREQUENCIES.filter(function (x) { return x.id === freqId; })[0];
    return f ? f.days : 0;
  }

  /**
   * Clients whose normal interval has lapsed with nothing booked ahead.
   * One-time clients count once they are 45 days cold.
   */
  function readyToRebook() {
    var grace = dayCount(S().get().settings.rebookGraceDays, 7);
    var t = F().today();

    return activeClients().map(function (c) {
      var stats = clientStats(c.id);
      if (stats.nextJob) return null;
      if (!stats.lastJobDate) return null;
      if (c.status === 'inactive') return null;

      var interval = intervalDays(c.frequency) || 45;
      var elapsed = F().daysBetween(stats.lastJobDate, t);
      if (elapsed < interval + grace) return null;

      var svc = service(c.preferredServiceId);
      return {
        client: c,
        daysSince: elapsed,
        lastJobDate: stats.lastJobDate,
        estimatedValue: svc ? svc.basePrice : 0
      };
    }).filter(Boolean).sort(function (a, b) { return b.daysSince - a.daysSince; });
  }

  /** Recently finished, invoice settled, never asked for a review. */
  function readyForReview() {
    var t = F().today();
    var outreach = S().get().outreach || {};
    return completedJobs().filter(function (j) {
      if (!j.clientId) return false;
      var age = F().daysBetween(j.completedDate || j.date, t);
      if (age < 1 || age > 30) return false;
      return !outreach['review:' + j.clientId];
    }).filter(function (j, i, arr) {
      // one entry per client — the most recent job wins
      return arr.findIndex(function (x) { return x.clientId === j.clientId; }) === i;
    }).map(function (j) {
      return { client: client(j.clientId), job: j, stats: clientStats(j.clientId) };
    }).filter(function (r) { return !!r.client; });
  }

  /** Long-standing happy clients are the best referral source. */
  function referralCandidates() {
    var outreach = S().get().outreach || {};
    return activeClients().map(function (c) {
      var stats = clientStats(c.id);
      if (stats.jobsCompleted < 3) return null;
      if (outreach['referral:' + c.id]) return null;
      return { client: c, stats: stats };
    }).filter(Boolean)
      .sort(function (a, b) { return b.stats.jobsCompleted - a.stats.jobsCompleted; })
      .slice(0, 6);
  }

  /* ---- Needs attention ------------------------------------------------------
     Ordered by how much it costs the owner to ignore it: money they are
     owed first, then work at risk, then growth.                             */

  function needsAttention() {
    var items = [];
    var t = F().today();

    overdueInvoices().slice(0, 4).forEach(function (inv) {
      var st = invoiceStatus(inv);
      items.push({
        tone: 'bad',
        title: 'Overdue invoice — ' + clientName(inv.clientId, inv.clientName),
        sub: F().money(invoiceRemaining(inv)) + ' · ' +
             F().plural(st.daysLate || 0, 'day') + ' overdue',
        cta: 'View',
        route: '#/money/invoice/' + inv.id
      });
    });

    overdueJobs().slice(0, 3).forEach(function (j) {
      items.push({
        tone: 'hot',
        title: 'Unfinished job — ' + clientName(j.clientId, j.clientName),
        sub: F().shortDate(j.date) + ' · ' + (j.status === 'in_progress'
               ? 'timer still running' : 'still marked scheduled'),
        cta: 'Open',
        route: '#/jobs/' + j.id
      });
    });

    staleQuotes().slice(0, 3).forEach(function (q) {
      items.push({
        tone: 'warn',
        title: 'Quote follow-up — ' + (q.clientName || clientName(q.clientId)),
        sub: F().money(q.price) + ' · sent ' + F().agoPhrase(q.sentDate || q.date),
        cta: 'Follow Up',
        route: '#/grow'
      });
    });

    readyToRebook().slice(0, 3).forEach(function (r) {
      items.push({
        tone: 'warn',
        title: r.client.name + ' is ready to rebook',
        sub: 'Last cleaned ' + F().plural(r.daysSince, 'day') + ' ago',
        cta: 'Rebook',
        route: '#/jobs/new?client=' + r.client.id
      });
    });

    var next = todaysJobs()[0];
    if (next) {
      items.push({
        tone: 'ok',
        title: 'Today — ' + clientName(next.clientId, next.clientName),
        sub: F().clockTime(next.time) + ' · ' + serviceName(next.serviceId, next.serviceName),
        cta: 'View Job',
        route: '#/jobs/' + next.id
      });
    }

    return items;
  }

  /* ---- Search ------------------------------------------------------------- */

  function search(term) {
    var q = String(term || '').trim().toLowerCase();
    if (q.length < 1) return [];
    var hits = [];

    function match(text) { return String(text || '').toLowerCase().indexOf(q) !== -1; }

    // Archived clients are searchable too. Archiving someone should not make
    // their history impossible to find — that is the reason it is kept.
    S().all('clients').forEach(function (c) {
      if (match(c.name) || match(c.phone) || match(c.email) || match(c.address)) {
        hits.push({
          type: 'Client', icon: '👥',
          title: c.name + (c.archivedAt ? ' (archived)' : ''),
          sub: [serviceName(c.preferredServiceId, ''), c.address].filter(Boolean).join(' · '),
          route: '#/clients/' + c.id
        });
      }
    });

    liveJobs().forEach(function (j) {
      var name = clientName(j.clientId, j.clientName);
      if (match(name) || match(j.notes) || match(j.address)) {
        hits.push({
          type: 'Job', icon: '📅', title: name,
          sub: serviceName(j.serviceId, j.serviceName) + ' · ' + F().whenLabel(j.date, j.time),
          route: '#/jobs/' + j.id
        });
      }
    });

    invoices().forEach(function (i) {
      var name = clientName(i.clientId, i.clientName);
      if (match(name) || match('#' + i.number)) {
        hits.push({
          type: 'Invoice', icon: '🧾', title: name,
          sub: 'Invoice #' + i.number + ' · ' + F().money(i.total),
          route: '#/money/invoice/' + i.id
        });
      }
    });

    quotes().forEach(function (qt) {
      var name = qt.clientName || clientName(qt.clientId);
      if (match(name)) {
        hits.push({
          type: 'Quote', icon: '📝', title: name,
          sub: F().money(qt.price) + ' · ' + F().titleCase(qt.status),
          route: '#/money/quote/' + qt.id
        });
      }
    });

    return hits.slice(0, 10);
  }

  CF.q = {
    client: client, service: service, clientName: clientName, serviceName: serviceName,
    activeClients: activeClients, archivedClients: archivedClients, activeServices: activeServices,
    jobs: jobs, liveJobs: liveJobs, todaysJobs: todaysJobs,
    todaysJobsIncludingDone: todaysJobsIncludingDone,
    upcomingJobs: upcomingJobs, overdueJobs: overdueJobs,
    stalledJobs: stalledJobs, nextOccurrence: nextOccurrence,
    jobMinutes: jobMinutes, conflictsFor: conflictsFor,
    recurringJobs: recurringJobs, completedJobs: completedJobs,
    jobsForClient: jobsForClient, jobTotal: jobTotal, checklistProgress: checklistProgress,
    sortByWhen: sortByWhen,
    invoices: invoices, invoiceReceived: invoiceReceived, invoiceRemaining: invoiceRemaining,
    invoiceOverpaid: invoiceOverpaid, invoiceInconsistent: invoiceInconsistent,
    invoiceStatus: invoiceStatus, openInvoices: openInvoices, overdueInvoices: overdueInvoices,
    outstandingTotal: outstandingTotal,
    quotes: quotes, quotesByStatus: quotesByStatus, staleQuotes: staleQuotes,
    expenses: expenses, paymentsIn: paymentsIn, summary: summary,
    monthBounds: monthBounds, expectedToday: expectedToday,
    clientStats: clientStats, intervalDays: intervalDays,
    readyToRebook: readyToRebook, readyForReview: readyForReview,
    referralCandidates: referralCandidates,
    needsAttention: needsAttention, search: search,
    invalidate: invalidate
  };
})(window.CF = window.CF || {});
