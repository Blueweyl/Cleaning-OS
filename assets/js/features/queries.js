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

  /** Scheduled but the date has passed — easy to forget, so surface it. */
  function overdueJobs() {
    var t = F().today();
    return sortByWhen(liveJobs().filter(function (j) {
      return j.date < t && j.status === 'scheduled';
    }));
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

  function jobTotal(job) {
    if (!job) return 0;
    var extras = (job.extras || []).reduce(function (a, e) {
      return a + (Number(e.amount) || 0);
    }, 0);
    return (Number(job.price) || 0) + extras;
  }

  function checklistProgress(job) {
    var items = (job && job.checklist) || [];
    var done = items.filter(function (i) { return i.done; }).length;
    return {
      done: done,
      total: items.length,
      percent: items.length ? Math.round((done / items.length) * 100) : 0,
      complete: items.length > 0 && done === items.length
    };
  }

  /* ---- Invoices ---------------------------------------------------------- */

  function invoices() { return S().all('invoices'); }

  function invoiceReceived(inv) {
    if (!inv) return 0;
    return (inv.payments || []).reduce(function (a, p) {
      return a + (Number(p.amount) || 0);
    }, 0);
  }

  function invoiceRemaining(inv) {
    return Math.max(0, (Number(inv.total) || 0) - invoiceReceived(inv));
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
    return openInvoices().reduce(function (a, i) { return a + invoiceRemaining(i); }, 0);
  }

  /* ---- Quotes ------------------------------------------------------------ */

  function quotes() { return S().all('quotes'); }

  function quotesByStatus(status) {
    return quotes().filter(function (q) { return q.status === status; });
  }

  /** Sent, unanswered, and old enough to be worth a nudge. */
  function staleQuotes() {
    var days = S().get().settings.quoteFollowUpDays || 3;
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
      (inv.payments || []).forEach(function (p) {
        if (inRange(p.date, from, to)) {
          out.push({
            id: p.id, date: p.date, amount: Number(p.amount) || 0,
            method: p.method, invoiceId: inv.id,
            invoiceNumber: inv.number, clientId: inv.clientId
          });
        }
      });
    });
    return out.sort(function (a, b) { return a.date < b.date ? 1 : -1; });
  }

  function summary(from, to) {
    var revenue = paymentsIn(from, to).reduce(function (a, p) { return a + p.amount; }, 0);
    var spend = expenses().filter(function (e) { return inRange(e.date, from, to); })
      .reduce(function (a, e) { return a + (Number(e.amount) || 0); }, 0);

    var jobsDone = jobs().filter(function (j) {
      return j.status === 'completed' && inRange(j.completedDate || j.date, from, to);
    });

    return {
      revenue: revenue,
      expenses: spend,
      profit: revenue - spend,
      margin: revenue > 0 ? Math.round(((revenue - spend) / revenue) * 100) : 0,
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
    var grace = S().get().settings.rebookGraceDays || 7;
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
        sub: F().shortDate(j.date) + ' · still marked scheduled',
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

    activeClients().forEach(function (c) {
      if (match(c.name) || match(c.phone) || match(c.email) || match(c.address)) {
        hits.push({
          type: 'Client', icon: '👥', title: c.name,
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
    recurringJobs: recurringJobs, completedJobs: completedJobs,
    jobsForClient: jobsForClient, jobTotal: jobTotal, checklistProgress: checklistProgress,
    sortByWhen: sortByWhen,
    invoices: invoices, invoiceReceived: invoiceReceived, invoiceRemaining: invoiceRemaining,
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
