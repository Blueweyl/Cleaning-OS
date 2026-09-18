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

  /* ---- Clients ----------------------------------------------------------- */

  function createClient(data) {
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

  function archiveClient(id) {
    var c = S().find('clients', id);
    if (!c) return null;
    return S().update('clients', id, { archivedAt: new Date().toISOString() },
      'Archive client', { icon: '📦', text: 'Archived ' + c.name + ' — history kept' });
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

  function startJob(id) {
    return S().update('jobs', id, {
      status: 'in_progress',
      startedAt: new Date().toISOString()
    }, 'Start job');
  }

  function pauseJob(id) {
    var job = S().find('jobs', id);
    if (!job || !job.startedAt) return job;
    var elapsed = (job.elapsedSeconds || 0) +
                  Math.floor((Date.now() - new Date(job.startedAt).getTime()) / 1000);
    return S().update('jobs', id, { startedAt: null, elapsedSeconds: elapsed }, 'Pause timer');
  }

  function resumeJob(id) {
    return S().update('jobs', id, { startedAt: new Date().toISOString() }, 'Resume timer');
  }

  function elapsedSeconds(job) {
    if (!job) return 0;
    var banked = job.elapsedSeconds || 0;
    if (!job.startedAt) return banked;
    return banked + Math.floor((Date.now() - new Date(job.startedAt).getTime()) / 1000);
  }

  function toggleChecklistItem(jobId, itemId) {
    var job = S().find('jobs', jobId);
    if (!job) return null;
    var next = (job.checklist || []).map(function (i) {
      return i.id === itemId ? Object.assign({}, i, { done: !i.done }) : i;
    });
    return S().update('jobs', jobId, { checklist: next }, 'Checklist', null);
  }

  function addExtraCharge(jobId, label, amount) {
    var job = S().find('jobs', jobId);
    if (!job) return null;
    var extras = (job.extras || []).concat([{
      id: S().uid('ex'), label: label || 'Extra', amount: Number(amount) || 0
    }]);
    return S().update('jobs', jobId, { extras: extras }, 'Add charge');
  }

  function removeExtraCharge(jobId, extraId) {
    var job = S().find('jobs', jobId);
    if (!job) return null;
    return S().update('jobs', jobId, {
      extras: (job.extras || []).filter(function (e) { return e.id !== extraId; })
    }, 'Remove charge');
  }

  /**
   * Finish the clean: stamp the job, raise the invoice, and roll the
   * recurring schedule forward so the next visit is already on the books.
   */
  function completeJob(jobId) {
    var job = S().find('jobs', jobId);
    if (!job) return null;

    var seconds = elapsedSeconds(job);
    var invoice = null;
    var nextJob = null;

    S().commit('Complete job', function () {
      CF.store.update('jobs', jobId, {
        status: 'completed',
        finishedAt: new Date().toISOString(),
        startedAt: null,
        elapsedSeconds: seconds,
        completedDate: F().today()
      }, 'Complete job');
    }, { noUndo: true });

    invoice = createInvoiceForJob(jobId);
    nextJob = rollRecurring(jobId);

    S().logActivity({
      icon: '✅',
      text: 'Completed ' + (job.serviceName || 'job') + ' for ' +
            CF.q.clientName(job.clientId, job.clientName)
    });

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

    return bookJob({
      clientId: job.clientId,
      clientName: job.clientName,
      serviceId: job.serviceId,
      serviceName: job.serviceName,
      date: F().addDays(job.completedDate || job.date, days),
      time: job.time,
      price: job.price,
      address: job.address,
      notes: job.notes,
      recurrence: { frequency: freq, endedAt: null },
      checklist: checklistFor(job.serviceId)
    });
  }

  function endRecurring(jobId) {
    var job = S().find('jobs', jobId);
    if (!job) return null;
    return S().update('jobs', jobId, {
      recurrence: Object.assign({}, job.recurrence, { endedAt: new Date().toISOString() })
    }, 'End recurring');
  }

  function skipNextOccurrence(jobId) {
    var job = S().find('jobs', jobId);
    if (!job) return null;
    var days = CF.q.intervalDays(job.recurrence && job.recurrence.frequency) || 7;
    return S().update('jobs', jobId, { date: F().addDays(job.date, days) }, 'Skip next');
  }

  function cancelJob(jobId) {
    var job = S().find('jobs', jobId);
    if (!job) return null;
    return S().update('jobs', jobId, { status: 'cancelled' }, 'Cancel job', {
      icon: '🚫', text: 'Cancelled job for ' + CF.q.clientName(job.clientId, job.clientName)
    });
  }

  /* ---- Invoices ------------------------------------------------------------ */

  function createInvoiceForJob(jobId) {
    var job = S().find('jobs', jobId);
    if (!job) return null;
    if (job.invoiceId) return S().find('invoices', job.invoiceId);

    var s = S().get().settings;
    var lines = [{
      label: job.serviceName || CF.q.serviceName(job.serviceId),
      amount: Number(job.price) || 0
    }].concat((job.extras || []).map(function (e) {
      return { label: e.label, amount: Number(e.amount) || 0 };
    }));

    var subtotal = lines.reduce(function (a, l) { return a + l.amount; }, 0);
    var tax = s.taxEnabled ? Math.round(subtotal * (Number(s.taxRate) || 0)) / 100 : 0;

    var invoice = S().insert('invoices', {
      number: S().nextNumber('invoice'),
      clientId: job.clientId,
      clientName: job.clientName || CF.q.clientName(job.clientId),
      jobId: job.id,
      lines: lines,
      subtotal: subtotal,
      tax: tax,
      total: Math.round((subtotal + tax) * 100) / 100,
      issueDate: F().today(),
      dueDate: F().addDays(F().today(), s.invoiceTermsDays || 14),
      payments: [],
      notes: ''
    }, 'Create invoice', {
      icon: '🧾',
      text: 'Invoice raised for ' + (job.clientName || CF.q.clientName(job.clientId)) +
            ' — ' + F().money(subtotal + tax)
    });

    S().update('jobs', jobId, { invoiceId: invoice.id }, 'Link invoice');
    return invoice;
  }

  function recordPayment(invoiceId, amount, method, date) {
    var inv = S().find('invoices', invoiceId);
    if (!inv) return null;
    var value = Number(amount) || 0;
    if (value <= 0) return null;

    var payments = (inv.payments || []).concat([{
      id: S().uid('pay'),
      amount: value,
      method: method || 'Cash',
      date: date || F().today()
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
      payments: (inv.payments || []).filter(function (p) { return p.id !== paymentId; })
    }, 'Remove payment');
  }

  /* ---- Quotes --------------------------------------------------------------- */

  function saveQuote(data) {
    var quote = S().insert('quotes', Object.assign({
      number: S().nextNumber('quote'),
      clientId: null, clientName: '', clientPhone: '',
      serviceId: null, sqft: 1200, beds: 2, baths: 1,
      condition: 'normal', addonIds: [], frequency: 'one-time',
      price: 0, cost: 0, profit: 0, margin: 0, minutes: 0,
      status: 'draft',
      date: F().today(),
      sentDate: null,
      notes: ''
    }, data), 'Save quote', {
      icon: '📝',
      text: 'Quote saved for ' + (data.clientName || CF.q.clientName(data.clientId)) +
            ' — ' + F().money(data.price)
    });
    return quote;
  }

  function setQuoteStatus(quoteId, status) {
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

    S().update('quotes', quoteId, { status: 'accepted' }, 'Accept quote');

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

  function addExpense(data) {
    return S().insert('expenses', Object.assign({
      amount: 0, category: 'Supplies', note: '', date: F().today()
    }, data), 'Add expense', {
      icon: '🧾',
      text: (data.category || 'Expense') + ' — ' + F().money(data.amount)
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
  function renderTemplate(body, vars) {
    var biz = S().get().business;
    var s = S().get().settings;
    var all = Object.assign({
      business: biz.name || 'my cleaning service',
      owner: biz.owner || '',
      referralOffer: s.referralOffer || ''
    }, vars || {});

    return String(body || '')
      .replace(/\{(\w+)\}/g, function (match, key) {
        return all[key] !== undefined && all[key] !== null ? String(all[key]) : '';
      })
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  CF.actions = {
    createClient: createClient, archiveClient: archiveClient, unarchiveClient: unarchiveClient,
    bookJob: bookJob, startJob: startJob, pauseJob: pauseJob, resumeJob: resumeJob,
    elapsedSeconds: elapsedSeconds, toggleChecklistItem: toggleChecklistItem,
    addExtraCharge: addExtraCharge, removeExtraCharge: removeExtraCharge,
    completeJob: completeJob, cancelJob: cancelJob,
    rollRecurring: rollRecurring, endRecurring: endRecurring,
    skipNextOccurrence: skipNextOccurrence,
    createInvoiceForJob: createInvoiceForJob, recordPayment: recordPayment,
    removePayment: removePayment,
    saveQuote: saveQuote, setQuoteStatus: setQuoteStatus, acceptQuote: acceptQuote,
    addExpense: addExpense,
    markContacted: markContacted, clearContacted: clearContacted,
    renderTemplate: renderTemplate, checklistFor: checklistFor
  };
})(window.CF = window.CF || {});
