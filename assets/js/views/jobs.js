/* ==========================================================================
   📅 JOBS — Book → Start → Checklist → Complete → Invoice

   The list is four honest buckets. The detail screen is a doorstep card:
   address, access notes, price, one obvious button. Active cleaning is
   built for a phone held in one hand.
   ========================================================================== */
(function (CF) {
  'use strict';

  function el() { return CF.dom.el.apply(null, arguments); }

  var view = 'today';
  var manageOpenId = null;
  var timerHandle = null;

  /* ---- List ----------------------------------------------------------------- */

  function renderList() {
    var U = CF.ui, F = CF.fmt, Q = CF.q, go = CF.router.go;

    var buckets = {
      today:     Q.todaysJobsIncludingDone(),
      upcoming:  Q.upcomingJobs(),
      recurring: Q.recurringJobs(),
      completed: Q.completedJobs()
    };
    var overdue = Q.overdueJobs();
    var rows = buckets[view] || [];

    var page = el('div.anim-fade-up', [
      U.pageHeader({
        title: 'Jobs',
        actions: [
          el('button.btn.btn--secondary.btn--sm', {
            type: 'button', onclick: function () { CF.backup.exportCsv('jobs'); }
          }, 'Export CSV'),
          el('button.btn.btn--primary', {
            type: 'button', onclick: function () { go('#/jobs/new'); }
          }, '+ Book Job')
        ]
      })
    ]);

    if (overdue.length && view === 'today') {
      page.appendChild(el('div.callout.callout--warn.mb-4', [
        el('strong', F.plural(overdue.length, 'job') + ' from a past date is still open. '),
        el('button.linkbtn', {
          type: 'button', onclick: function () { view = 'overdue'; CF.shell.repaint(); }
        }, 'Review them')
      ]));
    }

    if (view === 'overdue') buckets.overdue = overdue;
    rows = buckets[view] || [];

    page.appendChild(U.tabs({
      label: 'Job views',
      value: view,
      onChange: function (v) { view = v; manageOpenId = null; CF.shell.repaint(); },
      options: [
        { value: 'today',     label: 'Today',     count: buckets.today.length },
        { value: 'upcoming',  label: 'Upcoming',  count: buckets.upcoming.length },
        { value: 'recurring', label: 'Recurring', count: buckets.recurring.length },
        { value: 'completed', label: 'Completed', count: buckets.completed.length }
      ].concat(overdue.length ? [{ value: 'overdue', label: 'Needs Closing', count: overdue.length }] : [])
    }));

    if (!rows.length) {
      page.appendChild(U.empty({
        small: true,
        title: emptyCopy()[0],
        body: emptyCopy()[1],
        action: { label: '+ Book a Job', onClick: function () { go('#/jobs/new'); } }
      }));
      return page;
    }

    page.appendChild(el('div.list', rows.map(jobCard)));
    return page;

    function emptyCopy() {
      return ({
        today:     ['Nothing on the books today', 'A clear day. Book a job and it shows up here.'],
        upcoming:  ['No upcoming jobs', 'Jobs you schedule ahead of time appear here.'],
        recurring: ['No recurring jobs yet', 'Set a job to repeat and the next visit books itself when you finish one.'],
        completed: ['No completed jobs yet', 'Finished jobs and their invoices land here.'],
        overdue:   ['Nothing needs closing', 'Every past job has been completed or cancelled.']
      })[view] || ['Nothing here yet', ''];
    }

    function jobCard(job) {
      var status = statusOf(job);
      var isRecurringView = view === 'recurring';
      var open = manageOpenId === job.id;

      var card = el('div.card.card--flush', [
        el('button.listrow', {
          type: 'button',
          style: { border: 'none', borderRadius: '0' },
          onclick: function () { go('#/jobs/' + job.id); }
        }, [
          el('div.listrow__time', isRecurringView
            ? frequencyLabel(job.recurrence && job.recurrence.frequency)
            : F.whenLabel(job.date, job.time)),
          el('div.listrow__rule', { 'aria-hidden': 'true' }),
          el('div.grow', [
            el('div.listrow__title', Q.clientName(job.clientId, job.clientName)),
            el('div.listrow__sub', Q.serviceName(job.serviceId, job.serviceName))
          ]),
          el('div.listrow__price', F.money(Q.jobTotal(job))),
          U.badge(status.label, status.tone)
        ])
      ]);

      if (isRecurringView) {
        card.appendChild(el('button.linkbtn', {
          type: 'button',
          style: { display: 'block', width: '100%', textAlign: 'left',
                   padding: '10px 20px', borderTop: '1px solid var(--border-softer)',
                   textDecoration: 'none', fontSize: '12.5px' },
          'aria-expanded': open ? 'true' : 'false',
          onclick: function () {
            manageOpenId = open ? null : job.id;
            CF.shell.repaint();
          }
        }, (open ? '− ' : '+ ') + 'Manage Recurring'));

        if (open) card.appendChild(recurringActions(job));
      }

      return card;
    }

    function recurringActions(job) {
      return el('div.grid.grid-2', {
        style: { gap: '8px', padding: '0 20px 16px' }
      }, [
        act('Reschedule', function () { go('#/jobs/' + job.id + '/edit'); }),
        act('Skip Next', function () {
          CF.actions.skipNextOccurrence(job.id);
          CF.ui.toast('Skipped to ' + F.shortDate(CF.store.find('jobs', job.id).date), {
            undo: undoLast
          });
        }),
        act('Change Price', function () { go('#/jobs/' + job.id + '/edit'); }),
        act('End Recurring', function () {
          CF.ui.confirm({
            title: 'End this recurring schedule?',
            message: 'Future visits for ' + Q.clientName(job.clientId, job.clientName) +
                     ' stop being booked automatically. This job itself stays on your calendar.',
            confirmLabel: 'End Schedule', danger: true
          }).then(function (ok) {
            if (!ok) return;
            CF.actions.endRecurring(job.id);
            CF.ui.toast('Recurring schedule ended', { undo: undoLast });
          });
        }, 'danger')
      ]);

      function act(label, onClick, tone) {
        return el('button.btn.btn--quiet.btn--sm', {
          type: 'button', onclick: onClick,
          style: tone === 'danger' ? { color: 'var(--bad-text)' } : null
        }, label);
      }
    }
  }

  function undoLast() { CF.store.undo(); CF.shell.repaint(); }

  function statusOf(job) {
    var s = CF.schema.JOB_STATUS.filter(function (x) { return x.id === job.status; })[0];
    return s || { label: job.status, tone: 'neutral' };
  }

  function frequencyLabel(id) {
    var f = CF.schema.FREQUENCIES.filter(function (x) { return x.id === id; })[0];
    return f ? f.label : 'One-time';
  }

  /* ---- Detail ---------------------------------------------------------------- */

  function renderDetail(id) {
    var U = CF.ui, F = CF.fmt, Q = CF.q, go = CF.router.go;
    var job = CF.store.find('jobs', id);

    if (!job || job.deletedAt) {
      return U.empty({
        title: 'That job is no longer here',
        action: { label: 'Back to Jobs', onClick: function () { go('#/jobs'); } }
      });
    }

    var status = statusOf(job);
    var progress = Q.checklistProgress(job);
    var invoice = job.invoiceId ? CF.store.find('invoices', job.invoiceId) : null;

    return el('div.anim-fade-up', { style: { maxWidth: '640px' } }, [
      U.backLink('Back to Jobs', function () { go('#/jobs'); }),

      el('div.card.card--roomy', [
        el('div.row.between.row-3.row-wrap', [
          el('div', [
            el('h1.h-card', Q.clientName(job.clientId, job.clientName)),
            job.address ? el('div.sub', job.address) : null
          ]),
          U.badge(status.label, status.tone, true)
        ]),

        el('div.row.row-5.row-wrap', {
          style: { marginTop: '16px', padding: '14px 0',
                   borderTop: '1px solid var(--border-soft)',
                   borderBottom: '1px solid var(--border-soft)' }
        }, [
          fact('SERVICE', Q.serviceName(job.serviceId, job.serviceName)),
          fact('PRICE', F.money(Q.jobTotal(job))),
          fact('WHEN', F.whenLabel(job.date, job.time)),
          job.recurrence && job.recurrence.frequency !== 'one-time' && !job.recurrence.endedAt
            ? fact('REPEATS', frequencyLabel(job.recurrence.frequency)) : null
        ]),

        U.accessNote(job.notes) ? el('div.mt-4', U.accessNote(job.notes)) : null,

        (job.extras || []).length ? el('div.mt-4.card.card--tight', [
          el('div.eyebrow.mb-3', 'Extra charges'),
          el('div.stack.stack-2', job.extras.map(function (e) {
            return U.defRow(e.label, F.money(e.amount));
          }))
        ]) : null,

        progress.total ? el('div.mt-5', [
          el('div.row.between.mb-2', [
            el('span.meta', progress.done + '/' + progress.total + ' checklist items'),
            el('span.meta', progress.percent + '%')
          ]),
          U.progress(progress.percent)
        ]) : null,

        el('div.mt-5', primaryAction()),

        el('div.mt-4', [
          el('details', [
            el('summary', {
              style: { cursor: 'pointer', fontSize: '13px', fontWeight: '700',
                       color: 'var(--brand)', padding: '8px 0', listStyle: 'none' }
            }, 'More actions'),
            el('div.grid.grid-2.mt-3', [
              el('button.btn.btn--quiet.btn--sm', {
                type: 'button', onclick: function () { go('#/jobs/' + job.id + '/edit'); }
              }, 'Edit / Reschedule'),
              el('button.btn.btn--quiet.btn--sm', {
                type: 'button', onclick: addCharge
              }, 'Add Charge'),
              job.clientId ? el('button.btn.btn--quiet.btn--sm', {
                type: 'button', onclick: function () { go('#/clients/' + job.clientId); }
              }, 'View Client') : null,
              job.status !== 'completed' ? el('button.btn.btn--quiet.btn--sm', {
                type: 'button',
                style: { color: 'var(--bad-text)' },
                onclick: cancel
              }, 'Cancel Job') : null
            ].filter(Boolean))
          ])
        ])
      ])
    ]);

    function fact(label, value) {
      return el('div', [
        el('div', { style: { fontSize: '12px', color: 'var(--text-faint)', fontWeight: '600' } }, label),
        el('div', { style: { fontSize: '14px', fontWeight: '700', marginTop: '3px' } }, value)
      ]);
    }

    function primaryAction() {
      if (job.status === 'completed') {
        return invoice
          ? el('button.btn.btn--primary.btn--block.btn--lg', {
              type: 'button', onclick: function () { go('#/money/invoice/' + invoice.id); }
            }, 'View Invoice · ' + F.money(invoice.total))
          : el('button.btn.btn--primary.btn--block.btn--lg', {
              type: 'button',
              onclick: function () {
                var inv = CF.actions.createInvoiceForJob(job.id);
                go('#/money/invoice/' + inv.id);
              }
            }, 'Create Invoice');
      }
      if (job.status === 'cancelled') {
        return el('div.callout.callout--info', 'This job was cancelled.');
      }
      return el('button.btn.btn--primary.btn--block.btn--xl', {
        type: 'button',
        onclick: function () {
          if (job.status !== 'in_progress') CF.actions.startJob(job.id);
          go('#/jobs/' + job.id + '/clean');
        }
      }, job.status === 'in_progress' ? 'RESUME CLEANING' : 'START CLEANING');
    }

    function addCharge() {
      var amount = '', label = 'Extra';
      CF.ui.modal({
        title: 'Add a charge',
        sub: 'Gets added to this job and its invoice.',
        body: function () {
          var amt = U.field({ label: 'Amount', type: 'number', inputmode: 'decimal',
            prefix: CF.store.get().settings.currencySymbol, autofocus: true,
            onInput: function (v) { amount = v; } });
          var lbl = U.field({ label: 'What for?', value: 'Extra', placeholder: 'e.g. Inside fridge',
            onInput: function (v) { label = v; } });
          return el('div.stack.stack-4', [amt.node, lbl.node]);
        },
        actions: function (close) {
          return [
            el('button.btn.btn--secondary', { type: 'button', onclick: function () { close(); } }, 'Cancel'),
            el('button.btn.btn--primary', {
              type: 'button',
              onclick: function () {
                var value = Number(amount);
                if (!value || value <= 0) { CF.ui.toast('Enter an amount above zero', { tone: 'bad' }); return; }
                CF.actions.addExtraCharge(job.id, label || 'Extra', value);
                close();
                CF.ui.toast('Added ' + F.money(value), { undo: undoLast });
              }
            }, 'Add Charge')
          ];
        }
      });
    }

    function cancel() {
      CF.ui.confirm({
        title: 'Cancel this job?',
        message: 'The job for ' + Q.clientName(job.clientId, job.clientName) +
                 ' on ' + F.shortDate(job.date) + ' will be marked cancelled. ' +
                 'It stays in your history.',
        confirmLabel: 'Cancel Job', cancelLabel: 'Keep It', danger: true
      }).then(function (ok) {
        if (!ok) return;
        CF.actions.cancelJob(job.id);
        go('#/jobs');
        CF.ui.toast('Job cancelled', { undo: undoLast });
      });
    }
  }

  /* ---- Active cleaning -------------------------------------------------------- */

  function renderClean(id) {
    var U = CF.ui, F = CF.fmt, Q = CF.q, go = CF.router.go;
    var job = CF.store.find('jobs', id);

    if (!job || job.deletedAt) {
      return U.empty({ title: 'That job is no longer here',
        action: { label: 'Back to Jobs', onClick: function () { go('#/jobs'); } } });
    }
    if (job.status === 'completed') { go('#/jobs/' + id); return el('div'); }

    var progress = Q.checklistProgress(job);
    var timerNode = el('div', {
      style: { fontSize: '22px', fontWeight: '800', color: 'var(--brand)',
               fontVariantNumeric: 'tabular-nums' },
      role: 'timer', 'aria-label': 'Time on this job'
    }, F.duration(CF.actions.elapsedSeconds(job)));

    startTimer(function () {
      var live = CF.store.find('jobs', id);
      if (!live) return stopTimer();
      timerNode.textContent = F.duration(CF.actions.elapsedSeconds(live));
    });

    var running = !!job.startedAt;

    return el('div.anim-fade-up', { style: { maxWidth: '520px' } }, [
      U.backLink('Back to job', function () { go('#/jobs/' + id); }),

      el('div.row.between.row-3.mb-4', [
        el('div', [
          el('h1', { style: { fontSize: '19px', fontWeight: '800', margin: 0 } },
            Q.clientName(job.clientId, job.clientName)),
          el('div', { style: { fontSize: '13px', color: 'var(--text-muted)' } },
            Q.serviceName(job.serviceId, job.serviceName))
        ]),
        el('div.row.row-3', [
          timerNode,
          el('button.iconbtn', {
            type: 'button',
            'aria-label': running ? 'Pause timer' : 'Resume timer',
            onclick: function () {
              if (running) CF.actions.pauseJob(id); else CF.actions.resumeJob(id);
              CF.shell.repaint();
            }
          }, running ? '⏸' : '▶')
        ])
      ]),

      // A timer left running overnight would otherwise be recorded as the real
      // duration of the clean and quietly wreck every hourly figure after it.
      CF.actions.timerLooksForgotten(job) ? el('div.callout.callout--warn.mb-4', [
        el('strong', 'That timer has been running a long time. '),
        'It looks like it was left on. ',
        el('button.linkbtn', {
          type: 'button',
          onclick: function () {
            CF.ui.confirm({
              title: 'Reset the timer for this clean?',
              message: 'The recorded time goes back to zero. Nothing else about ' +
                       'the job changes.',
              confirmLabel: 'Reset Timer'
            }).then(function (ok) {
              if (!ok) return;
              CF.store.update('jobs', id, { elapsedSeconds: 0, startedAt: null },
                'Reset timer');
              CF.ui.toast('Timer reset', {
                undo: function () { CF.store.undo(); CF.shell.repaint(); }
              });
              CF.shell.repaint();
            });
          }
        }, 'Reset it')
      ]) : null,

      U.accessNote(job.notes) ? el('div.mb-4', U.accessNote(job.notes)) : null,

      el('div.card', { style: { padding: '20px 20px 8px' } }, [
        el('div.row.between.mb-3', { style: { alignItems: 'baseline' } }, [
          el('div', { style: { fontSize: '14px', fontWeight: '700', color: 'var(--text-2)' } },
            progress.done + '/' + progress.total + ' Complete'),
          el('div', { style: { fontSize: '14px', fontWeight: '800', color: 'var(--brand)' } },
            progress.percent + '%')
        ]),
        el('div.mb-5', U.progress(progress.percent)),
        el('div.stack', (job.checklist || []).map(function (item) {
          return el('button.checklist__item', {
            type: 'button',
            'aria-pressed': item.done ? 'true' : 'false',
            onclick: function () {
              CF.actions.toggleChecklistItem(job.id, item.id);
              CF.shell.repaint();
            }
          }, [
            el('span.checklist__box', { 'aria-hidden': 'true' }, item.done ? '✓' : ''),
            el('span.checklist__label', item.label)
          ]);
        }))
      ]),

      el('div.center.mt-3', [
        el('button.linkbtn', {
          type: 'button',
          style: { textDecoration: 'none' },
          onclick: function () { go('#/jobs/' + id); }
        }, '+ Add Charge')
      ]),

      el('button.btn.btn--primary.btn--block.btn--xl.mt-2', {
        type: 'button',
        disabled: !progress.complete,
        'aria-disabled': progress.complete ? 'false' : 'true',
        title: progress.complete ? '' : 'Finish every checklist item first',
        onclick: complete
      }, 'COMPLETE JOB → CREATE INVOICE'),

      !progress.complete ? el('p.meta.center.mt-2',
        F.plural(progress.total - progress.done, 'item') + ' left before you can close this job.') : null
    ]);

    function complete() {
      if (!progress.complete) {
        CF.ui.toast('Finish all checklist items first');
        return;
      }
      stopTimer();
      var result = CF.actions.completeJob(job.id);
      if (!result) return;          // the write was refused; the toast explains why
      CF.shell.setFlash({
        kind: 'job-complete',
        jobId: job.id,
        invoiceId: result.invoice ? result.invoice.id : null,
        nextJobId: result.nextJob ? result.nextJob.id : null
      });
      go('#/jobs/' + job.id + '/done');
    }
  }

  /* ---- Completion screen ------------------------------------------------------- */

  function renderDone(id) {
    var U = CF.ui, F = CF.fmt, Q = CF.q, go = CF.router.go;
    var job = CF.store.find('jobs', id);
    if (!job) { go('#/jobs'); return el('div'); }

    var flash = CF.shell.getFlash() || {};
    var invoice = job.invoiceId ? CF.store.find('invoices', job.invoiceId) : null;
    var nextJob = flash.nextJobId ? CF.store.find('jobs', flash.nextJobId) : null;
    var progress = Q.checklistProgress(job);

    return el('div.success.anim-pop', [
      el('div.success__mark', { 'aria-hidden': 'true' }, '✓'),
      el('h1.success__title', 'Cleaning Complete'),
      el('p.success__body', [
        progress.total + '/' + progress.total + ' tasks · ',
        el('strong', { style: { color: 'var(--text)' } },
          F.money(Q.jobTotal(job)) + ' to collect')
      ]),

      nextJob ? el('div.callout.callout--info.mt-5', { style: { textAlign: 'left' } },
        '🔁 Next visit for ' + Q.clientName(job.clientId, job.clientName) +
        ' is already booked for ' + F.relativeDate(nextJob.date) + '.') : null,

      invoice ? el('button.btn.btn--primary.btn--block.btn--lg.mt-6', {
        type: 'button', onclick: function () { go('#/money/invoice/' + invoice.id); }
      }, 'View Invoice #' + invoice.number) : null,

      el('button.btn.btn--secondary.btn--block.mt-3', {
        type: 'button', onclick: function () { go('#/jobs'); }
      }, 'Back to Jobs')
    ]);
  }

  /* ---- Book / edit form --------------------------------------------------------- */

  function renderForm(id, query) {
    var U = CF.ui, F = CF.fmt, Q = CF.q, go = CF.router.go;
    var existing = id ? CF.store.find('jobs', id) : null;
    var isEdit = !!existing;
    var clients = Q.activeClients();
    var services = Q.activeServices();

    if (!clients.length && !isEdit) {
      return U.empty({
        title: 'Add a client first',
        body: 'Jobs belong to a client, so CleanFlow can reuse their address and access notes.',
        action: { label: '+ Add a Client', onClick: function () { go('#/clients/new'); } }
      });
    }

    var preselect = (query && query.client) || null;
    var draft = Object.assign({
      clientId: preselect || (clients[0] || {}).id || null,
      serviceId: (services[0] || {}).id || null,
      date: F.today(), time: '09:00',
      price: (services[0] || {}).basePrice || 0,
      address: '', notes: '',
      frequency: 'one-time', until: ''
    }, existing ? {
      clientId: existing.clientId, serviceId: existing.serviceId,
      date: existing.date, time: existing.time, price: existing.price,
      address: existing.address, notes: existing.notes,
      frequency: (existing.recurrence && existing.recurrence.frequency) || 'one-time',
      until: (existing.recurrence && existing.recurrence.until) || ''
    } : {});

    if (!isEdit && draft.clientId) applyClientDefaults(draft.clientId, true);

    var priceField, addressField, notesField;

    var body = el('div.stack.stack-5');

    function build() {
      CF.dom.clear(body);

      var clientField = U.field({
        label: 'Client', type: 'select', value: draft.clientId, required: true,
        options: clients.map(function (c) { return { value: c.id, label: c.name }; }),
        onChange: function (v) { draft.clientId = v; applyClientDefaults(v); build(); }
      });

      var serviceField = U.field({
        label: 'Service', type: 'select', value: draft.serviceId, required: true,
        options: services.map(function (s) {
          return { value: s.id, label: s.name + ' — ' + F.money(s.basePrice) };
        }),
        onChange: function (v) {
          draft.serviceId = v;
          var svc = CF.store.find('services', v);
          if (svc && !isEdit) draft.price = svc.basePrice;
          build();
        }
      });

      priceField = U.field({
        label: 'Price', type: 'number', value: draft.price, inputmode: 'decimal',
        prefix: CF.store.get().settings.currencySymbol,
        hint: 'Starts from the service base price — change it for this job only.',
        onInput: function (v) { draft.price = v; }
      });

      addressField = U.field({
        label: 'Address', value: draft.address,
        placeholder: 'Where is this clean?',
        onInput: function (v) { draft.address = v; }
      });

      notesField = U.field({
        label: 'Access, pets & parking', value: draft.notes, multiline: true, rows: 3,
        hint: 'Pre-filled from the client. Anything you add here shows on the job card.',
        onInput: function (v) { draft.notes = v; }
      });

      body.appendChild(el('div.card.card--roomy.stack.stack-4', [
        clientField.node,
        serviceField.node,
        el('div.grid.grid-2', [
          U.field({ label: 'Date', type: 'date', value: draft.date, required: true,
            min: '2000-01-01', max: '2100-12-31',
            onChange: function (v) { draft.date = v; build(); } }).node,
          U.field({ label: 'Start time', type: 'time', value: draft.time,
            onChange: function (v) { draft.time = v; build(); } }).node
        ]),
        priceField.node,
        U.field({ label: 'Repeats', type: 'select', value: draft.frequency,
          hint: 'On a repeating job, finishing one visit books the next automatically.',
          options: CF.schema.FREQUENCIES.map(function (f) { return { value: f.id, label: f.label }; }),
          onChange: function (v) { draft.frequency = v; build(); } }).node,

        // Without a last date the only way to stop a repeat is to remember to
        // end it by hand — easy to forget on a contract with a known end.
        draft.frequency !== 'one-time'
          ? U.field({ label: 'Repeat until (optional)', type: 'date', value: draft.until,
              hint: 'Leave blank to keep repeating. The last visit booked will be on or before this date.',
              onChange: function (v) { draft.until = v; } }).node
          : null
      ].filter(Boolean)));

      var clash = Q.conflictsFor({
        date: draft.date, time: draft.time,
        minutes: Q.jobMinutes({ serviceId: draft.serviceId }),
        excludeId: id || null
      });
      if (clash.length) {
        body.appendChild(el('div.callout.callout--warn', [
          el('strong', '⚠ That overlaps ' + F.plural(clash.length, 'job') + ' already booked. '),
          clash.slice(0, 3).map(function (j) {
            return el('div.meta', F.clockTime(j.time) + ' · ' +
              Q.clientName(j.clientId, j.clientName) + ' · ' +
              F.hoursLabel(Q.jobMinutes(j)));
          }),
          el('div.meta', { style: { marginTop: '6px' } },
            'You can still book it — CleanFlow will not stop you.')
        ]));
      }

      body.appendChild(el('div.card.card--roomy.stack.stack-4', [
        addressField.node,
        notesField.node
      ]));

      body.appendChild(el('div.row.row-3.row-wrap', [
        el('button.btn.btn--primary.btn--lg', { type: 'button', onclick: save },
          isEdit ? 'Save Changes' : 'Book Job'),
        el('button.btn.btn--secondary.btn--lg', {
          type: 'button', onclick: function () { go(isEdit ? '#/jobs/' + id : '#/jobs'); }
        }, 'Cancel')
      ]));
    }

    function applyClientDefaults(clientId, initial) {
      var c = CF.store.find('clients', clientId);
      if (!c) return;
      draft.address = c.address || '';
      draft.notes = [c.access, c.pets, c.preferences].filter(Boolean).join(' ');
      if (initial || !isEdit) {
        if (c.preferredServiceId) draft.serviceId = c.preferredServiceId;
        var svc = CF.store.find('services', draft.serviceId);
        if (svc) draft.price = svc.basePrice;
        if (c.frequency) draft.frequency = c.frequency;
      }
    }

    function save() {
      if (!draft.clientId) { CF.ui.toast('Pick a client first', { tone: 'bad' }); return; }

      var when = F.fromKey(draft.date);
      if (!when || isNaN(when.getTime()) ||
          when.getFullYear() < 2000 || when.getFullYear() > 2100) {
        CF.ui.toast('That date does not look right — check the year', { tone: 'bad' });
        return;
      }
      if (draft.until && draft.until < draft.date) {
        CF.ui.toast('The repeat end date is before the first visit', { tone: 'bad' });
        return;
      }

      var payload = {
        clientId: draft.clientId,
        clientName: Q.clientName(draft.clientId),
        serviceId: draft.serviceId,
        serviceName: Q.serviceName(draft.serviceId),
        date: draft.date, time: draft.time,
        price: Number(draft.price) || 0,
        address: draft.address, notes: draft.notes,
        recurrence: {
          frequency: draft.frequency, endedAt: null,
          until: draft.frequency === 'one-time' ? null : (draft.until || null),
          anchorDay: (F.fromKey(draft.date) || new Date()).getDate()
        }
      };

      if (isEdit) {
        // Swapping service mid-job would silently discard ticked items.
        if (draft.serviceId !== existing.serviceId &&
            Q.checklistProgress(existing).done === 0) {
          payload.checklist = CF.actions.checklistFor(draft.serviceId);
        }
        CF.store.update('jobs', id, payload, 'Edit job');
        CF.ui.toast('Job updated');
        go('#/jobs/' + id);
      } else {
        var job = CF.actions.bookJob(payload);
        CF.ui.toast('Job booked for ' + F.relativeDate(job.date), { undo: undoLast });
        go('#/jobs/' + job.id);
      }
    }

    build();

    return el('div.anim-fade-up', { style: { maxWidth: '640px' } }, [
      U.backLink(isEdit ? 'Back to job' : 'Back to Jobs',
        function () { go(isEdit ? '#/jobs/' + id : '#/jobs'); }),
      el('h1.h-page.mb-5', isEdit ? 'Edit job' : 'Book a job'),
      body
    ]);
  }

  /* ---- Timer plumbing ------------------------------------------------------------ */

  function startTimer(tick) {
    stopTimer();
    timerHandle = setInterval(tick, 1000);
  }
  function stopTimer() {
    if (timerHandle) { clearInterval(timerHandle); timerHandle = null; }
  }

  CF.views = CF.views || {};
  CF.views.jobs = {
    renderList: renderList,
    renderDetail: renderDetail,
    renderClean: renderClean,
    renderDone: renderDone,
    renderForm: renderForm,
    stopTimer: stopTimer
  };
})(window.CF = window.CF || {});
