/* ==========================================================================
   👥 CLIENTS — a CRM that fits in your head

   The list answers "who are they and when do I see them next". The profile
   uses progressive disclosure: the four things you need on the doorstep are
   open, everything else is one tap away.
   ========================================================================== */
(function (CF) {
  'use strict';

  function el() { return CF.dom.el.apply(null, arguments); }

  var filter = 'all';
  var term = '';
  var openSection = 'access';

  /* ---- List ---------------------------------------------------------------- */

  function renderList() {
    var U = CF.ui, F = CF.fmt, Q = CF.q, go = CF.router.go;
    var all = Q.activeClients();

    var page = el('div.anim-fade-up', [
      U.pageHeader({
        title: 'Clients',
        sub: all.length ? F.plural(all.length, 'client') : null,
        actions: [
          all.length ? el('button.btn.btn--secondary.btn--sm', {
            type: 'button', onclick: function () { CF.backup.exportCsv('clients'); }
          }, 'Export CSV') : null,
          el('button.btn.btn--primary', {
            type: 'button', onclick: function () { go('#/clients/new'); }
          }, '+ New Client')
        ].filter(Boolean)
      })
    ]);

    if (!all.length) {
      page.appendChild(U.empty({
        title: 'Your first client starts here 👋',
        body: 'Add them once and CleanFlow reuses their details for quotes, jobs ' +
              'and invoices — you\'ll never re-type an address again.',
        action: { label: '+ Add First Client', onClick: function () { go('#/clients/new'); } }
      }));
      return page;
    }

    /* ---- filters ---- */
    var rebookIds = Q.readyToRebook().map(function (r) { return r.client.id; });
    var counts = {
      all: all.length,
      active: all.filter(function (c) { return c.status === 'active'; }).length,
      lead: all.filter(function (c) { return c.status === 'lead'; }).length,
      rebook: rebookIds.length
    };

    var search = U.field({
      label: null, value: term, type: 'search',
      placeholder: 'Search name, phone or address…',
      onInput: function (v) { term = v; repaintRows(); }
    });
    search.node.style.flex = '1';
    search.node.style.maxWidth = '340px';

    page.appendChild(el('div.row.row-3.row-wrap.mb-4', [
      search.node,
      U.segmented({
        label: 'Filter clients',
        value: filter,
        outline: true,
        options: [
          { value: 'all',    label: 'All (' + counts.all + ')' },
          { value: 'active', label: 'Active (' + counts.active + ')' },
          { value: 'rebook', label: 'Ready to Rebook (' + counts.rebook + ')' },
          { value: 'lead',   label: 'Leads (' + counts.lead + ')' }
        ],
        onChange: function (v) { filter = v; CF.shell.repaint(); }
      })
    ]));

    var tableHost = el('div');
    page.appendChild(tableHost);
    repaintRows();

    var archived = Q.archivedClients();
    if (archived.length) {
      page.appendChild(el('div.mt-6.center', [
        el('button.linkbtn.linkbtn--quiet', {
          type: 'button', onclick: function () { showArchived(archived); }
        }, 'View ' + F.plural(archived.length, 'archived client'))
      ]));
    }

    return page;

    function visible() {
      var q = term.trim().toLowerCase();
      return all.filter(function (c) {
        if (filter === 'active' && c.status !== 'active') return false;
        if (filter === 'lead' && c.status !== 'lead') return false;
        if (filter === 'rebook' && rebookIds.indexOf(c.id) === -1) return false;
        if (!q) return true;
        return [c.name, c.phone, c.email, c.address].some(function (v) {
          return String(v || '').toLowerCase().indexOf(q) !== -1;
        });
      });
    }

    function repaintRows() {
      var rows = visible();
      CF.dom.mount(tableHost, rows.length ? table(rows) : U.empty({
        small: true,
        title: 'No clients match that',
        body: term ? 'Try a different name, or clear the search.'
                   : 'Nothing in this filter yet.'
      }));
    }

    function table(rows) {
      return el('div.table', [
        el('div.table__head', { 'aria-hidden': 'true' }, [
          el('div', 'Name'), el('div', 'Service'),
          el('div', 'Next Cleaning'), el('div', 'Status')
        ])
      ].concat(rows.map(function (c) {
        var stats = Q.clientStats(c.id);
        var isRebook = rebookIds.indexOf(c.id) !== -1;
        var next = stats.nextJob
          ? F.relativeDate(stats.nextJob.date)
          : (isRebook ? 'Ready to rebook' : 'Not scheduled');

        return el('button.table__row', {
          type: 'button', onclick: function () { go('#/clients/' + c.id); }
        }, [
          el('div.row.row-3', [U.avatar(c.name), el('div.listrow__title', c.name)]),
          el('div', { style: { fontSize: '13.5px', color: 'var(--text-3)' } },
            Q.serviceName(c.preferredServiceId, '—')),
          el('div', { style: { fontSize: '13.5px', color: isRebook ? 'var(--warn-text)' : 'var(--text-3)' } }, next),
          el('div', statusBadge(c, isRebook))
        ]);
      })));
    }

    function statusBadge(c, isRebook) {
      if (isRebook) return U.badge('Ready to Rebook', 'warn');
      if (c.status === 'lead') return U.badge('Lead', 'brand');
      if (c.status === 'inactive') return U.badge('Inactive', 'neutral');
      return U.badge('Active', 'ok');
    }

    function showArchived(list) {
      CF.ui.modal({
        size: 'md', title: 'Archived clients',
        sub: 'Their history is kept. Restore one to bring them back to your list.',
        body: el('div.stack.stack-2', list.map(function (c) {
          return el('div.listrow', [
            el('div.grow', [
              el('div.listrow__title', c.name),
              el('div.listrow__sub', 'Archived ' + F.agoPhrase(F.toKey(c.archivedAt)))
            ]),
            el('button.btn.btn--secondary.btn--sm', {
              type: 'button',
              onclick: function () {
                CF.actions.unarchiveClient(c.id);
                CF.ui.toast(c.name + ' restored');
              }
            }, 'Restore')
          ]);
        })),
        actions: function (close) {
          return [el('button.btn.btn--secondary', { type: 'button', onclick: function () { close(); } }, 'Close')];
        }
      });
    }
  }

  /* ---- Profile ------------------------------------------------------------- */

  function renderProfile(id) {
    var U = CF.ui, F = CF.fmt, Q = CF.q, go = CF.router.go;
    var c = CF.store.find('clients', id);

    if (!c || c.deletedAt) {
      return U.empty({
        title: 'That client is no longer here',
        body: 'They may have been deleted. Head back to your client list.',
        action: { label: 'Back to Clients', onClick: function () { go('#/clients'); } }
      });
    }

    var stats = Q.clientStats(c.id);
    var history = Q.jobsForClient(c.id);

    return el('div.anim-fade-up', [
      U.backLink('Back to Clients', function () { go('#/clients'); }),

      el('div.row.between.row-5.row-wrap.mb-6', [
        el('div.row.row-4', [
          U.avatar(c.name, true),
          el('div', [
            el('h1.h-card', c.name),
            el('div.sub', [
              Q.serviceName(c.preferredServiceId, 'No service set'), ' · ',
              frequencyLabel(c.frequency)
            ])
          ])
        ]),
        el('div.row.row-3.row-wrap', [
          el('button.btn.btn--secondary', {
            type: 'button', onclick: function () { go('#/clients/' + c.id + '/edit'); }
          }, 'Edit'),
          el('button.btn.btn--secondary', {
            type: 'button', onclick: function () { go('#/money/quote?client=' + c.id); }
          }, 'Create Quote'),
          el('button.btn.btn--primary', {
            type: 'button', onclick: function () { go('#/jobs/new?client=' + c.id); }
          }, 'Book Job')
        ])
      ]),

      el('div.grid.grid-3.mb-6', [
        U.stat({ label: 'Lifetime Value', value: F.money(stats.lifetimeValue) }),
        U.stat({ label: 'Jobs Completed', value: String(stats.jobsCompleted) }),
        U.stat({
          label: 'Next Cleaning',
          value: stats.nextJob ? F.relativeDate(stats.nextJob.date) : 'Not scheduled'
        })
      ]),

      stats.outstanding > 0
        ? el('div.callout.callout--warn.mb-4',
            F.money(stats.outstanding) + ' still outstanding from this client.')
        : null,

      el('div.stack.stack-3', sections().map(accordion)),

      el('div.mt-6.center', [
        el('button.linkbtn.linkbtn--quiet', {
          type: 'button', onclick: archive
        }, 'Archive Client')
      ])
    ]);

    function sections() {
      var rows = [];

      rows.push({ key: 'access', title: 'Access, Pets & Parking', build: function () {
        var lines = [
          c.access ? ['Access', c.access] : null,
          c.pets ? ['Pets', c.pets] : null,
          c.preferences ? ['Preferences', c.preferences] : null
        ].filter(Boolean);
        if (!lines.length) return el('div.faint', 'Nothing noted yet — add access codes, pets and parking here so you never have to remember them.');
        return el('div.stack.stack-2', lines.map(function (l) {
          return el('div', [el('strong', l[0] + ': '), l[1]]);
        }));
      } });

      rows.push({ key: 'contact', title: 'Contact', build: function () {
        var lines = [];
        if (c.phone) lines.push(el('div', ['Phone: ', el('a', { href: 'tel:' + c.phone }, c.phone)]));
        if (c.email) lines.push(el('div', ['Email: ', el('a', { href: 'mailto:' + c.email }, c.email)]));
        if (c.address) lines.push(el('div', 'Address: ' + c.address));
        return lines.length ? el('div.stack.stack-1', lines) : el('div.faint', 'No contact details yet.');
      } });

      rows.push({ key: 'property', title: 'Property Details', build: function () {
        var bits = [
          c.propertyType,
          c.sqft ? F.money ? (c.sqft + ' sq ft') : null : null,
          c.beds ? F.plural(c.beds, 'bed') : null,
          c.baths ? F.plural(c.baths, 'bath') : null
        ].filter(Boolean);
        return bits.length ? el('div', bits.join(' · ')) : el('div.faint', 'No property details yet.');
      } });

      rows.push({ key: 'history', title: 'Job & Payment History', build: function () {
        if (!history.length) return el('div.faint', 'No jobs yet.');
        return el('div.stack.stack-2', history.slice(0, 8).map(function (j) {
          return el('button.listrow', {
            type: 'button', style: { padding: '10px 12px' },
            onclick: function () { go('#/jobs/' + j.id); }
          }, [
            el('div.grow', [
              el('div.listrow__title', { style: { fontSize: '13.5px' } },
                Q.serviceName(j.serviceId, j.serviceName)),
              el('div.listrow__sub', F.shortDate(j.date))
            ]),
            el('div.listrow__price', { style: { fontSize: '13.5px' } }, F.money(Q.jobTotal(j))),
            U.badge(statusLabel(j.status), statusTone(j.status))
          ]);
        }));
      } });

      rows.push({ key: 'notes', title: 'Notes', build: function () {
        return c.notes ? el('div', c.notes) : el('div.faint', 'No notes yet.');
      } });

      rows.push({ key: 'contract', title: 'Contract & Welcome Info', build: function () {
        return c.contract ? el('div', c.contract) : el('div.faint', 'No contract details recorded.');
      } });

      return rows;
    }

    function accordion(sec) {
      var isOpen = openSection === sec.key;
      var body = el('div.acc__body');
      if (isOpen) body.appendChild(sec.build());

      return el('div.acc', [
        el('button.acc__head', {
          type: 'button',
          'aria-expanded': isOpen ? 'true' : 'false',
          onclick: function () {
            openSection = isOpen ? null : sec.key;
            CF.shell.repaint();
          }
        }, [
          el('span.acc__title', sec.title),
          el('span.acc__chev', { 'aria-hidden': 'true' }, isOpen ? '−' : '+')
        ]),
        isOpen ? body : null
      ]);
    }

    function archive() {
      // Say out loud what happens to work already on the calendar. Archiving
      // silently used to leave an ex-client's clean sitting on Today's list.
      var pending = CF.actions.futureWorkFor(c.id);
      var owed = CF.q.openInvoices().filter(function (i) { return i.clientId === c.id; });

      var lines = ['They come off your active list but every job, invoice and note is kept. ' +
                   'You can restore them at any time.'];
      if (pending.length) {
        lines.push(CF.fmt.plural(pending.length, 'upcoming job') +
                   ' will be cancelled and any repeat stopped.');
      }
      if (owed.length) {
        lines.push(CF.fmt.money(owed.reduce(function (a, i) {
          return a + CF.q.invoiceRemaining(i);
        }, 0)) + ' still owed stays on your books to collect.');
      }

      CF.ui.confirm({
        title: 'Archive ' + c.name + '?',
        message: lines.join(' '),
        confirmLabel: 'Archive'
      }).then(function (ok) {
        if (!ok) return;
        CF.actions.archiveClient(c.id);
        CF.router.go('#/clients');
        CF.ui.toast(c.name + ' archived', {
          undo: function () { CF.store.undo(); CF.shell.repaint(); }
        });
      });
    }
  }

  function statusLabel(id) {
    var s = CF.schema.JOB_STATUS.filter(function (x) { return x.id === id; })[0];
    return s ? s.label : id;
  }
  function statusTone(id) {
    var s = CF.schema.JOB_STATUS.filter(function (x) { return x.id === id; })[0];
    return s ? s.tone : 'neutral';
  }
  function frequencyLabel(id) {
    var f = CF.schema.FREQUENCIES.filter(function (x) { return x.id === id; })[0];
    return f ? f.label : 'One-time';
  }

  /* ---- Create / edit form --------------------------------------------------- */

  function renderForm(id) {
    var U = CF.ui, Q = CF.q, go = CF.router.go;
    var existing = id ? CF.store.find('clients', id) : null;
    var isEdit = !!existing;

    var draft = Object.assign({
      name: '', phone: '', email: '', address: '',
      propertyType: 'House', sqft: '', beds: 2, baths: 1,
      access: '', pets: '', preferences: '', notes: '',
      preferredServiceId: (Q.activeServices()[0] || {}).id || '',
      frequency: 'one-time', status: 'active', contract: ''
    }, existing || {});

    var dupeAcknowledged = false;
    var emailField;

    var nameField = U.field({
      label: 'Client name', value: draft.name, required: true, autofocus: !isEdit,
      placeholder: 'e.g. Sarah Miller',
      onInput: function (v) { draft.name = v; nameField.setError(''); }
    });

    var form = el('form.stack.stack-5', {
      // The browser's own validation bubble is a tooltip that vanishes and is
      // easy to miss one-handed in someone's kitchen. Validation is handled in
      // save() instead, so every message appears inline under its field, in the
      // same voice as the rest of the app, and stays there.
      novalidate: true,
      onsubmit: function (e) { e.preventDefault(); save(); }
    }, [
      el('div.card.card--roomy.stack.stack-4', [
        el('h2.h-section', 'Who they are'),
        nameField.node,
        el('div.grid.grid-2', [
          U.field({ label: 'Phone', value: draft.phone, type: 'tel',
            placeholder: '(512) 555-0100',
            onInput: function (v) { draft.phone = v; } }).node,
          (emailField = U.field({ label: 'Email', value: draft.email, type: 'email',
            placeholder: 'name@email.com',
            onInput: function (v) { draft.email = v; emailField.setError(''); } })).node
        ]),
        U.field({ label: 'Address', value: draft.address,
          placeholder: '142 Maple Ave, Austin, TX',
          onInput: function (v) { draft.address = v; } }).node
      ]),

      el('div.card.card--roomy.stack.stack-4', [
        el('h2.h-section', 'Their property'),
        el('div.grid.grid-2', [
          U.field({ label: 'Property type', type: 'select', value: draft.propertyType,
            options: CF.schema.PROPERTY_TYPES.map(function (t) { return { value: t, label: t }; }),
            onChange: function (v) { draft.propertyType = v; } }).node,
          U.field({ label: 'Size (sq ft)', value: draft.sqft, type: 'number',
            inputmode: 'numeric', placeholder: '1800',
            onInput: function (v) { draft.sqft = v; } }).node
        ]),
        el('div.grid.grid-2', [
          U.field({ label: 'Bedrooms', value: draft.beds, type: 'number', min: 0, max: 20,
            inputmode: 'numeric', onInput: function (v) { draft.beds = Number(v); } }).node,
          U.field({ label: 'Bathrooms', value: draft.baths, type: 'number', min: 0, max: 20,
            inputmode: 'numeric', onInput: function (v) { draft.baths = Number(v); } }).node
        ])
      ]),

      el('div.card.card--roomy.stack.stack-4', [
        el('h2.h-section', 'Getting in'),
        el('p.meta', { style: { marginTop: '-8px' } },
          'This is what shows on the job card when you arrive.'),
        U.field({ label: 'Access instructions', value: draft.access, multiline: true, rows: 2,
          placeholder: 'Side gate code 4471. Key under the blue planter.',
          onInput: function (v) { draft.access = v; } }).node,
        U.field({ label: 'Pets', value: draft.pets, multiline: true, rows: 2,
          placeholder: 'Friendly golden retriever — keep the back door closed.',
          onInput: function (v) { draft.pets = v; } }).node,
        U.field({ label: 'Cleaning preferences', value: draft.preferences, multiline: true, rows: 2,
          placeholder: 'Eco-friendly products only. Kitchen first.',
          onInput: function (v) { draft.preferences = v; } }).node
      ]),

      el('div.card.card--roomy.stack.stack-4', [
        el('h2.h-section', 'Service & status'),
        el('div.grid.grid-2', [
          U.field({ label: 'Preferred service', type: 'select', value: draft.preferredServiceId,
            options: Q.activeServices().map(function (s) { return { value: s.id, label: s.name }; }),
            onChange: function (v) { draft.preferredServiceId = v; } }).node,
          U.field({ label: 'Frequency', type: 'select', value: draft.frequency,
            options: CF.schema.FREQUENCIES.map(function (f) { return { value: f.id, label: f.label }; }),
            onChange: function (v) { draft.frequency = v; } }).node
        ]),
        U.field({ label: 'Status', type: 'select', value: draft.status,
          options: CF.schema.CLIENT_STATUS.map(function (s) { return { value: s.id, label: s.label }; }),
          onChange: function (v) { draft.status = v; } }).node,
        U.field({ label: 'Contract / welcome info', value: draft.contract, multiline: true, rows: 2,
          placeholder: 'Signed welcome packet on file · bi-weekly agreement',
          onInput: function (v) { draft.contract = v; } }).node,
        U.field({ label: 'Notes', value: draft.notes, multiline: true, rows: 3,
          placeholder: 'Anything else worth remembering.',
          onInput: function (v) { draft.notes = v; } }).node
      ]),

      el('div.row.row-3.row-wrap', [
        el('button.btn.btn--primary.btn--lg', { type: 'submit' },
          isEdit ? 'Save Changes' : 'Add Client'),
        el('button.btn.btn--secondary.btn--lg', {
          type: 'button', onclick: function () { go(isEdit ? '#/clients/' + id : '#/clients'); }
        }, 'Cancel')
      ])
    ]);

    return el('div.anim-fade-up.page--narrow', { style: { maxWidth: '640px' } }, [
      U.backLink(isEdit ? 'Back to ' + existing.name : 'Back to Clients',
        function () { go(isEdit ? '#/clients/' + id : '#/clients'); }),
      el('h1.h-page.mb-5', isEdit ? 'Edit client' : 'New client'),
      form
    ]);

    function save() {
      // Tidy first, then validate what will actually be stored — otherwise a
      // name of pure whitespace passes the check and saves as empty.
      var clean = CF.actions.cleanClientFields(draft);

      if (!clean.name) {
        nameField.setError('Enter the client\'s name to continue.');
        nameField.input.focus();
        return;
      }
      if (clean.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(clean.email)) {
        emailField.setError('That email address does not look complete.');
        emailField.input.focus();
        return;
      }

      var dupes = CF.actions.likelyDuplicates(clean, isEdit ? id : null);
      if (dupes.length && !dupeAcknowledged) {
        askAboutDuplicate(dupes[0], clean);
        return;
      }
      commitSave(clean);
    }

    function commitSave(clean) {
      if (isEdit) {
        CF.store.update('clients', id, clean, 'Edit client');
        CF.ui.toast('Client updated');
        go('#/clients/' + id);
      } else {
        var created = CF.actions.createClient(clean);
        CF.ui.toast(created.name + ' added');
        go('#/clients/' + created.id);
      }
    }

    /**
     * Two records for one household is the quiet way a client's history splits
     * in half. Offered, not enforced — two families really can share a name.
     */
    function askAboutDuplicate(match, clean) {
      var why = CF.actions.likelyDuplicates({ name: '', phone: clean.phone },
        isEdit ? id : null).length
        ? 'the same phone number' : 'the same name';

      CF.ui.confirm({
        title: 'You may already have this client',
        message: match.name + ' has ' + why + '. Adding another record splits ' +
                 'their job history and invoices between the two.',
        confirmLabel: 'Add Anyway',
        cancelLabel: 'Open ' + match.name
      }).then(function (ok) {
        if (ok) { dupeAcknowledged = true; commitSave(clean); }
        else go('#/clients/' + match.id);
      });
    }
  }

  CF.views = CF.views || {};
  CF.views.clients = {
    renderList: renderList,
    renderProfile: renderProfile,
    renderForm: renderForm
  };
})(window.CF = window.CF || {});
