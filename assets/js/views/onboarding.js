/* ==========================================================================
   Onboarding — two minutes, four steps, then get out of the way

   The "See Demo" path matters as much as the setup path: most people want
   to look around before they commit their real business to a new tool.
   ========================================================================== */
(function (CF) {
  'use strict';

  function el() { return CF.dom.el.apply(null, arguments); }

  var step = 0;
  var draft = null;

  function reset() {
    step = 0;
    draft = {
      business: '', area: '', owner: '',
      currency: 'USD',
      services: { 'svc-standard': true, 'svc-deep': true, 'svc-moveout': true, 'svc-airbnb': false },
      prices: { 'svc-standard': 120, 'svc-deep': 210, 'svc-moveout': 260, 'svc-airbnb': 95 },
      clientName: '', clientAddress: '', clientPhone: ''
    };
  }

  function render() {
    if (!draft) reset();
    var host = el('div.onboard', [el('div.onboard__card.anim-fade-up', body())]);
    return host;
  }

  function repaint() { CF.shell.repaint(); }

  function body() {
    if (step === 0) return welcome();
    if (step >= 1 && step <= 4) return wizard();
    return finished();
  }

  /* ---- Step 0 ---------------------------------------------------------------- */

  function welcome() {
    return el('div', [
      el('div.row.row-3.mb-6', [
        el('div.brand__mark.brand__mark--lg', { 'aria-hidden': 'true' }, 'C'),
        el('div', { style: { fontWeight: '800', fontSize: '18px', letterSpacing: '-0.02em' } },
          'CleanFlow')
      ]),
      el('h1', { style: { fontSize: '28px', fontWeight: '800', letterSpacing: '-0.02em',
                          lineHeight: '1.2', margin: 0 } },
        'Welcome to CleanFlow 👋'),
      el('p', { style: { fontSize: '16px', color: 'var(--text-muted)', marginTop: '10px',
                         lineHeight: '1.5' } },
        'Everything for your cleaning business — clients, quotes, jobs, invoices and ' +
        'follow-ups — on this device. No account, no subscription, no internet needed.'),

      el('div.stack.stack-3.mt-8', [
        el('button.btn.btn--primary.btn--lg.btn--block.is-lifted', {
          type: 'button', autofocus: true, onclick: startDemo
        }, 'See the Demo First'),
        el('button.btn.btn--secondary.btn--lg.btn--block', {
          type: 'button', onclick: function () { step = 1; repaint(); }
        }, 'Set Up My Business'),
        el('button.linkbtn.linkbtn--quiet.btn--block', {
          type: 'button', style: { marginTop: '4px' }, onclick: restore
        }, 'Restore from a backup file')
      ]),

      el('p.meta.center.mt-5',
        'Your data stays on this device. Export a backup any time to move it or keep it safe.')
    ]);
  }

  function startDemo() {
    CF.demo.load().then(function () {
      draft = null;
      CF.router.go('#/home');
      CF.shell.repaint();
      CF.ui.toast('Exploring a demo business — nothing here is yours yet');
    });
  }

  function restore() {
    CF.shell.pickBackupFile(function () {
      draft = null;
      CF.router.go('#/home');
      CF.shell.repaint();
    });
  }

  /* ---- Steps 1–4 --------------------------------------------------------------- */

  var STEP_COPY = {
    1: ['Tell us about your business', 'This appears on your invoices, quotes and proposals.'],
    2: ['What services do you offer?', 'Pick the ones you actually sell — you can change these later.'],
    3: ['Set your starting prices', 'Rough is fine. The Smart Quote calculator adjusts from here.'],
    4: ['Add your first client', 'Optional, but it gets you to a real booking faster.']
  };

  function wizard() {
    var copy = STEP_COPY[step];
    var U = CF.ui;

    return el('div', [
      el('div.onboard__steps', [1, 2, 3, 4].map(function (n) {
        return el('div.onboard__step' + (n <= step ? '.is-done' : ''));
      })),
      el('div.onboard__eyebrow', 'Step ' + step + ' of 4'),
      el('h1.onboard__title', copy[0]),
      el('p.onboard__sub.mb-6', copy[1]),

      el('div.stack.stack-4', stepBody()),

      el('div.row.row-3.mt-8', [
        el('button.btn.btn--secondary', {
          type: 'button', onclick: function () { step--; repaint(); }
        }, 'Back'),
        el('button.btn.btn--primary', {
          type: 'button', style: { flex: '1' }, onclick: next
        }, step === 4 ? 'Finish Setup' : 'Continue')
      ]),

      step === 4 ? el('div.center.mt-3', [
        el('button.linkbtn.linkbtn--quiet', {
          type: 'button', onclick: function () { step = 5; repaint(); }
        }, 'Skip — I\'ll add clients later')
      ]) : null
    ]);

    function stepBody() {
      if (step === 1) return businessStep();
      if (step === 2) return servicesStep();
      if (step === 3) return pricesStep();
      return clientStep();
    }

    function businessStep() {
      return [
        U.field({ label: 'Business name', value: draft.business, autofocus: true, required: true,
          placeholder: 'e.g. Sparkle & Shine Cleaning Co.',
          onInput: function (v) { draft.business = v; } }).node,
        U.field({ label: 'Your name', value: draft.owner,
          placeholder: 'e.g. Sam Rivera',
          onInput: function (v) { draft.owner = v; } }).node,
        U.field({ label: 'Service area', value: draft.area,
          placeholder: 'e.g. Austin, TX & surrounding suburbs',
          onInput: function (v) { draft.area = v; } }).node,
        U.field({ label: 'Currency', type: 'select', value: draft.currency,
          options: CF.schema.CURRENCIES.map(function (c) {
            return { value: c.code, label: c.label + ' (' + c.symbol.trim() + ')' };
          }),
          onChange: function (v) { draft.currency = v; } }).node
      ];
    }

    function servicesStep() {
      return [el('div.stack.stack-2', CF.schema.defaultServices().map(function (s) {
        return U.checkRow({
          label: s.name,
          checked: !!draft.services[s.id],
          onToggle: function () {
            draft.services[s.id] = !draft.services[s.id];
            repaint();
          }
        });
      }))];
    }

    function pricesStep() {
      var chosen = CF.schema.defaultServices().filter(function (s) { return draft.services[s.id]; });
      if (!chosen.length) {
        return [el('div.callout.callout--warn',
          'No services picked. Go back a step and choose at least one.')];
      }
      return chosen.map(function (s) {
        return U.field({
          label: s.name, type: 'number', inputmode: 'decimal',
          value: draft.prices[s.id],
          prefix: symbolFor(draft.currency),
          hint: 'Your starting price for a typical job.',
          onInput: function (v) { draft.prices[s.id] = Number(v) || 0; }
        }).node;
      }).concat([
        el('p.meta', 'You can fine-tune everything later in Settings → Services & Pricing.')
      ]);
    }

    function clientStep() {
      return [
        U.field({ label: 'Client name', value: draft.clientName, autofocus: true,
          placeholder: 'e.g. Sarah Miller',
          onInput: function (v) { draft.clientName = v; } }).node,
        U.field({ label: 'Address', value: draft.clientAddress,
          placeholder: '142 Maple Ave',
          onInput: function (v) { draft.clientAddress = v; } }).node,
        U.field({ label: 'Phone', value: draft.clientPhone, type: 'tel',
          placeholder: '(512) 555-0100',
          onInput: function (v) { draft.clientPhone = v; } }).node
      ];
    }

    function next() {
      if (step === 1 && !draft.business.trim()) {
        CF.ui.toast('Enter your business name to continue', { tone: 'bad' });
        return;
      }
      if (step === 2 && !Object.keys(draft.services).some(function (k) { return draft.services[k]; })) {
        CF.ui.toast('Pick at least one service', { tone: 'bad' });
        return;
      }
      if (step === 4) { commit(); return; }
      step++;
      repaint();
    }
  }

  function symbolFor(code) {
    var c = CF.schema.CURRENCIES.filter(function (x) { return x.code === code; })[0];
    return c ? c.symbol : '$';
  }

  /* ---- Commit ---------------------------------------------------------------- */

  function commit() {
    var currency = CF.schema.CURRENCIES.filter(function (c) {
      return c.code === draft.currency;
    })[0] || CF.schema.CURRENCIES[0];

    CF.store.commit('Finish setup', function (d) {
      d.business.name = draft.business.trim();
      d.business.owner = draft.owner.trim();
      d.business.serviceArea = draft.area.trim();

      d.settings.currency = currency.code;
      d.settings.currencySymbol = currency.symbol;
      d.settings.demoMode = false;
      d.settings.onboarded = true;

      d.services = d.services.map(function (s) {
        return Object.assign({}, s, {
          active: !!draft.services[s.id],
          basePrice: draft.prices[s.id] !== undefined ? draft.prices[s.id] : s.basePrice
        });
      });
    }, { noUndo: true });

    if (draft.clientName.trim()) {
      CF.actions.createClient({
        name: draft.clientName.trim(),
        address: draft.clientAddress.trim(),
        phone: draft.clientPhone.trim(),
        status: 'active'
      });
    }

    step = 5;
    repaint();
  }

  function leave(route) {
    draft = null;
    step = 0;
    CF.router.go(route);
    CF.shell.repaint();
  }

  function finished() {
    var db = CF.store.get();
    var firstClient = CF.q.activeClients()[0];

    return el('div.center.anim-pop', { style: { padding: '12px 0' } }, [
      el('div', { style: { fontSize: '52px', marginBottom: '8px' } , 'aria-hidden': 'true' }, '🎉'),
      el('h1', { style: { fontSize: '26px', fontWeight: '800', letterSpacing: '-0.02em', margin: 0 } },
        'You\'re ready!'),
      el('p', { style: { fontSize: '15px', color: 'var(--text-muted)', marginTop: '8px',
                         lineHeight: '1.5' } },
        (db.business.name || 'Your business') + ' is set up' +
        (firstClient ? ', and ' + firstClient.name + ' is on your books' : '') +
        '. Next: build a quote or book your first job.'),

      el('div.stack.stack-3.mt-8', [
        el('button.btn.btn--primary.btn--lg.btn--block', {
          type: 'button', autofocus: true,
          onclick: function () { leave('#/home'); }
        }, 'Go to Dashboard'),
        el('button.btn.btn--secondary.btn--block', {
          type: 'button',
          onclick: function () { leave('#/money/quote'); }
        }, 'Build My First Quote')
      ]),

      el('p.meta.mt-6',
        '💡 Tip: export a backup from Settings once you have real data. ' +
        'It is the only copy that exists.')
    ]);
  }

  /**
   * True while onboarding still owns the screen. Finishing setup flips
   * `onboarded` to true, so without this the shell would swap straight to the
   * dashboard and the user would never see the final step.
   */
  function isActive() {
    var db = CF.store.get();
    if (step === 5) return true;                 // showing "You're ready!"
    return !db.settings.onboarded && !db.settings.demoMode;
  }

  CF.views = CF.views || {};
  CF.views.onboarding = { render: render, reset: reset, isActive: isActive };
})(window.CF = window.CF || {});
