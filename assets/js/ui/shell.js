/* ==========================================================================
   CleanFlow — Application shell
   Chrome (nav, search, quick add), route dispatch, and the single repaint
   path every view calls after it changes something.
   ========================================================================== */
(function (CF) {
  'use strict';

  function el() { return CF.dom.el.apply(null, arguments); }

  var root = null;
  var contentHost = null;
  var flash = null;
  var repaintQueued = false;

  var NAV = [
    { key: 'home',    icon: '🏠', label: 'Home',    route: '#/home' },
    { key: 'clients', icon: '👥', label: 'Clients', route: '#/clients' },
    { key: 'jobs',    icon: '📅', label: 'Jobs',    route: '#/jobs' },
    { key: 'money',   icon: '💰', label: 'Money',   route: '#/money' },
    { key: 'grow',    icon: '🚀', label: 'Grow',    route: '#/grow' }
  ];

  /* ---- Boot ------------------------------------------------------------- */

  function mount(hostEl) {
    root = hostEl;
    CF.router.start(function () { repaint(); });
    CF.store.subscribe(function () { /* views repaint explicitly */ });

    // Never lose the last few hundred milliseconds of typing.
    window.addEventListener('beforeunload', function () { CF.store.flush(); });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') CF.store.flush();
    });

    // Global keyboard shortcuts, skipped while typing.
    document.addEventListener('keydown', function (e) {
      var tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (e.metaKey || e.ctrlKey) {
        if (e.key === 'k') { e.preventDefault(); openSearch(); }
        return;
      }
      if (e.key === '/') { e.preventDefault(); openSearch(); }
    });
  }

  /** Coalesce repaints so a burst of changes renders once. */
  function repaint() {
    if (repaintQueued) return;
    repaintQueued = true;
    requestAnimationFrame(function () {
      repaintQueued = false;
      draw();
    });
  }

  function draw() {
    var db = CF.store.get();
    CF.views.jobs.stopTimer();

    // Onboarding owns the whole screen until it hands over — including its
    // final "You're ready!" step, which runs after settings are already saved.
    if (CF.views.onboarding.isActive()) {
      CF.dom.mount(root, CF.views.onboarding.render());
      return;
    }

    var route = CF.router.get();
    CF.dom.mount(root, el('div.app', [
      db.settings.demoMode ? demoBanner() : null,
      topbar(route),
      contentHost = el('main#main.page', { tabindex: '-1' }, screenFor(route)),
      bottomNav(route)
    ]));
  }

  /* ---- Route dispatch ----------------------------------------------------- */

  function screenFor(route) {
    var V = CF.views;
    var s = route.section, v = route.view, id = route.id, q = route.query;

    try {
      if (s === 'home') return V.home.render();

      if (s === 'clients') {
        if (v === 'new') return V.clients.renderForm(null);
        if (v && id === 'edit') return V.clients.renderForm(v);
        if (v) return V.clients.renderProfile(v);
        return V.clients.renderList();
      }

      if (s === 'jobs') {
        if (v === 'new') return V.jobs.renderForm(null, q);
        if (v && id === 'edit') return V.jobs.renderForm(v, q);
        if (v && id === 'clean') return V.jobs.renderClean(v);
        if (v && id === 'done') return V.jobs.renderDone(v);
        if (v) return V.jobs.renderDetail(v);
        return V.jobs.renderList();
      }

      if (s === 'money') {
        if (v === 'quote') return V.quote.render(q, id);
        if (v === 'invoice' && id) return V.money.renderInvoice(id);
        if (v === 'paid' && id) return V.money.renderPaid(id);
        if (v === 'quotes' || v === 'invoices' || v === 'expenses') {
          V.money.setTab(v);
          return V.money.renderOverview();
        }
        return V.money.renderOverview();
      }

      if (s === 'grow') {
        if (v === 'proposal') return V.grow.renderProposal();
        return V.grow.render();
      }
    } catch (err) {
      console.error('[CleanFlow] view failed', err);
      return errorScreen(err);
    }

    return notFound();
  }

  function notFound() {
    return CF.ui.empty({
      title: 'That screen doesn\'t exist',
      body: 'The link may be out of date. Everything lives under the five tabs.',
      action: { label: 'Go Home', onClick: function () { CF.router.go('#/home'); } }
    });
  }

  function errorScreen(err) {
    return el('div', [
      CF.ui.empty({
        title: 'Something went wrong on this screen',
        body: 'Your data is safe. Try going back, and export a backup if this keeps happening.',
        action: { label: 'Go Home', onClick: function () { CF.router.go('#/home'); } }
      }),
      el('details.mt-5', { style: { maxWidth: '560px', margin: '20px auto 0' } }, [
        el('summary.meta', { style: { cursor: 'pointer' } }, 'Technical details'),
        el('pre', {
          style: { fontSize: '11px', overflow: 'auto', background: 'var(--chip)',
                   padding: '12px', borderRadius: '8px', color: 'var(--text-muted)' }
        }, String(err && (err.stack || err.message) || err))
      ])
    ]);
  }

  /* ---- Chrome ------------------------------------------------------------- */

  function demoBanner() {
    return el('div.demo-banner.no-print', [
      el('span', '🧪 Demo Business — you\'re exploring sample data.'),
      el('button.btn.btn--primary.btn--sm', {
        type: 'button', onclick: startRealBusiness
      }, 'Start My Business')
    ]);
  }

  function startRealBusiness() {
    CF.ui.confirm({
      title: 'Start your own business?',
      message: 'The demo data is cleared and CleanFlow walks you through a two-minute setup. ' +
               'Nothing here is yours yet, so nothing real is lost.',
      confirmLabel: 'Start Fresh'
    }).then(function (ok) {
      if (!ok) return;
      CF.store.replace(CF.schema.emptyDatabase(), 'Start fresh');
      CF.views.onboarding.reset();
      CF.router.go('#/home');
      repaint();
    });
  }

  function topbar(route) {
    var db = CF.store.get();
    var overdueBackup = CF.backup.backupOverdue();

    return el('header.topbar.no-print', [
      el('div.row.row-8', { style: { gap: '32px' } }, [
        el('a.brand', { href: '#/home', 'aria-label': 'CleanFlow home' }, [
          el('div.brand__mark', { 'aria-hidden': 'true' }, 'C'),
          el('span.brand__name', { style: { color: 'var(--text)' } }, 'CleanFlow')
        ]),
        el('nav.navlinks.desktop-only', { 'aria-label': 'Main' },
          NAV.map(function (n) {
            return el('button.navlink', {
              type: 'button',
              'aria-current': route.section === n.key ? 'page' : null,
              onclick: function () { CF.router.go(n.route); }
            }, [
              el('span.navlink__icon', { 'aria-hidden': 'true' }, n.icon),
              n.label
            ]);
          }))
      ]),

      el('div.row.row-3', [
        el('button.iconbtn', {
          type: 'button', 'aria-label': 'Search (press / )', onclick: openSearch
        }, '🔍'),
        el('button.btn.btn--sm.desktop-only', {
          type: 'button',
          style: { background: 'var(--brand-tint)', color: 'var(--brand)', fontWeight: '800' },
          onclick: openQuickAdd
        }, '+ New'),
        el('button.avatarbtn', {
          type: 'button',
          'aria-label': 'Settings' + (overdueBackup ? ' — backup overdue' : ''),
          style: overdueBackup ? { boxShadow: '0 0 0 2px var(--warn-text)' } : null,
          onclick: function () { CF.views.settings.open(); }
        }, CF.fmt.initials(db.business.name || 'CleanFlow'))
      ])
    ]);
  }

  function bottomNav(route) {
    var items = [NAV[0], NAV[1], null, NAV[2], NAV[3]];
    return el('nav.bottomnav.no-print', { 'aria-label': 'Main' },
      items.map(function (n) {
        if (!n) {
          return el('button.bottomnav__item', {
            type: 'button', 'aria-label': 'Quick add', onclick: openQuickAdd
          }, [el('span.bottomnav__fab', { 'aria-hidden': 'true' }, '+')]);
        }
        return el('button.bottomnav__item', {
          type: 'button',
          'aria-current': route.section === n.key ? 'page' : null,
          onclick: function () { CF.router.go(n.route); }
        }, [
          el('span.bottomnav__icon', { 'aria-hidden': 'true' }, n.icon),
          el('span.bottomnav__label', n.label)
        ]);
      }));
  }

  /* ---- Quick add ---------------------------------------------------------- */

  function openQuickAdd() {
    CF.ui.sheet({
      title: 'Quick Add',
      items: [
        { icon: '💰', label: 'New Quote',   onSelect: function () { CF.router.go('#/money/quote'); } },
        { icon: '📅', label: 'Book a Job',  onSelect: function () { CF.router.go('#/jobs/new'); } },
        { icon: '👥', label: 'New Client',  onSelect: function () { CF.router.go('#/clients/new'); } },
        { icon: '🧾', label: 'New Expense', onSelect: function () { CF.views.money.expenseModal(); } },
        { icon: '🚀', label: 'Build Proposal', onSelect: function () { CF.router.go('#/grow/proposal'); } }
      ]
    });
  }

  /* ---- Search -------------------------------------------------------------- */

  function openSearch() {
    var results = [];
    var activeIndex = 0;
    var listHost, input;

    CF.ui.overlay({
      variant: 'top',
      build: function (close) {
        input = el('input.searchbox__input', {
          type: 'search', autofocus: true,
          placeholder: 'Search clients, jobs, quotes, invoices…',
          'aria-label': 'Search',
          oninput: function (e) { run(e.target.value); },
          onkeydown: function (e) {
            if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
            else if (e.key === 'Enter' && results[activeIndex]) {
              e.preventDefault();
              close();
              CF.router.go(results[activeIndex].route);
            }
          }
        });

        listHost = el('div.searchbox__list');
        run('');

        return el('div.searchbox', {
          role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Search'
        }, [
          el('div.searchbox__head', input),
          listHost
        ]);

        function run(term) {
          results = term.trim() ? CF.q.search(term) : [];
          activeIndex = 0;
          paint(term);
        }

        function move(delta) {
          if (!results.length) return;
          activeIndex = (activeIndex + delta + results.length) % results.length;
          paint(input.value);
        }

        function paint(term) {
          CF.dom.clear(listHost);
          if (!term.trim()) {
            listHost.appendChild(el('div.center', {
              style: { padding: '30px 14px', fontSize: '13.5px', color: 'var(--text-faint)' }
            }, 'Start typing a client, job, quote or invoice.'));
            return;
          }
          if (!results.length) {
            listHost.appendChild(el('div.center', {
              style: { padding: '30px 14px', fontSize: '13.5px', color: 'var(--text-faint)' }
            }, 'No matches for "' + term + '".'));
            return;
          }
          results.forEach(function (r, i) {
            listHost.appendChild(el('button.searchbox__item' + (i === activeIndex ? '.is-active' : ''), {
              type: 'button',
              onclick: function () { close(); CF.router.go(r.route); }
            }, [
              el('span', { 'aria-hidden': 'true', style: { fontSize: '16px' } }, r.icon),
              el('span.grow', [
                el('span', { style: { display: 'block', fontSize: '14px', fontWeight: '700' } }, r.title),
                el('span.meta', r.sub)
              ]),
              el('span.searchbox__type', r.type)
            ]));
          });
        }
      }
    });
  }

  /* ---- Restore flow --------------------------------------------------------- */

  /** Pick a backup file, show what is in it, then confirm before replacing. */
  function pickBackupFile(onDone) {
    var input = el('input', {
      type: 'file', accept: 'application/json,.json',
      style: { display: 'none' }
    });

    input.addEventListener('change', function () {
      var file = input.files && input.files[0];
      if (file) inspect(file);
      if (input.parentNode) input.parentNode.removeChild(input);
    });

    document.body.appendChild(input);
    input.click();

    function inspect(file) {
      CF.backup.inspectFile(file).then(function (info) {
        var c = info.counts;
        CF.ui.confirm({
          title: 'Restore this backup?',
          message: (info.businessName ? '"' + info.businessName + '" — ' : '') +
                   (info.exportedAt
                     ? 'exported ' + CF.fmt.agoPhrase(CF.fmt.toKey(info.exportedAt)) + '. '
                     : '') +
                   'It contains ' + c.clients + ' clients, ' + c.jobs + ' jobs, ' +
                   c.invoices + ' invoices, ' + c.quotes + ' quotes and ' +
                   c.expenses + ' expenses. ' +
                   'Everything currently on this device is replaced.',
          confirmLabel: 'Restore', danger: true
        }).then(function (ok) {
          if (!ok) return;
          CF.backup.applyRestore(info.data).then(function () {
            CF.ui.toast('Backup restored', {
              undo: function () { CF.store.undo(); repaint(); }
            });
            if (onDone) onDone();
            repaint();
          });
        });
      }).catch(function (err) {
        CF.ui.modal({
          size: 'sm', title: 'Couldn\'t read that file',
          body: el('p', { style: { fontSize: '13.5px', color: 'var(--text-muted)', lineHeight: '1.6' } },
            String(err.message || err)),
          actions: function (close) {
            return [el('button.btn.btn--primary', {
              type: 'button', onclick: function () { close(); }
            }, 'OK')];
          }
        });
      });
    }
  }

  /* ---- Flash (one-shot data between screens) ---------------------------------- */

  function setFlash(value) { flash = value; }
  function getFlash() { return flash; }

  CF.shell = {
    mount: mount,
    repaint: repaint,
    openSearch: openSearch,
    openQuickAdd: openQuickAdd,
    pickBackupFile: pickBackupFile,
    setFlash: setFlash,
    getFlash: getFlash
  };
})(window.CF = window.CF || {});
