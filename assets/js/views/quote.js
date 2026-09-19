/* ==========================================================================
   💰 SMART QUOTE — price the job with your reasoning visible

   The left pane collects what you know. The right pane shows one confident
   number, the working behind it, and whether the margin is worth the drive.
   The owner can always override — it is their business.
   ========================================================================== */
(function (CF) {
  'use strict';

  function el() { return CF.dom.el.apply(null, arguments); }

  var draft = null;
  var showCalc = false;
  var editingPrice = false;

  function reset(query) {
    var services = CF.q.activeServices();
    var preClient = query && query.client ? CF.store.find('clients', query.client) : null;

    // When a client is selected — explicitly or as the default — their
    // property is what we should be pricing, not a generic 1,800 sq ft house.
    var seedClient = preClient || CF.q.activeClients()[0] || null;

    draft = {
      mode: preClient ? 'existing' : (CF.q.activeClients().length ? 'existing' : 'new'),
      clientId: seedClient ? seedClient.id : null,
      leadName: '', leadPhone: '',
      serviceId: (seedClient && seedClient.preferredServiceId) || (services[0] || {}).id || null,
      sqft: (seedClient && seedClient.sqft) || 1800,
      beds: (seedClient && seedClient.beds) || 3,
      baths: (seedClient && seedClient.baths) || 2,
      condition: 'normal',
      addonIds: [],
      frequency: (seedClient && seedClient.frequency) || 'one-time',
      override: null,
      notes: ''
    };
    showCalc = false;
    editingPrice = false;
  }

  /* ---- Builder ------------------------------------------------------------------ */

  function render(query, quoteId) {
    var U = CF.ui, F = CF.fmt, Q = CF.q, go = CF.router.go;

    if (quoteId) {
      var existing = CF.store.find('quotes', quoteId);
      if (existing) return renderSaved(existing);
    }

    if (!draft) reset(query);

    var services = Q.activeServices();
    var clients = Q.activeClients();
    var addons = CF.store.all('addons');

    var page = el('div.anim-fade-up', [
      U.backLink('Back to Money', function () { draft = null; go('#/money'); }),
      el('h1.h-page.mb-5', 'Smart Quote Calculator')
    ]);

    var panelHost = el('div.quote__panel');
    var formHost = el('div.quote__form');

    page.appendChild(el('div.grid.grid-calc', [formHost, panelHost]));

    paint();
    return page;

    function paint() {
      paintForm();
      paintPanel();
    }

    function calc() {
      return CF.pricing.calculate({
        serviceId: draft.serviceId, sqft: draft.sqft,
        beds: draft.beds, baths: draft.baths,
        condition: draft.condition, addonIds: draft.addonIds,
        frequency: draft.frequency, override: draft.override
      });
    }

    /* ---- left: inputs ---- */
    function paintForm() {
      CF.dom.clear(formHost);

      if (clients.length) {
        formHost.appendChild(U.segmented({
          label: 'Who is this for',
          value: draft.mode, fill: true,
          options: [
            { value: 'existing', label: 'Existing Client' },
            { value: 'new', label: 'New Customer' }
          ],
          onChange: function (v) { draft.mode = v; paint(); }
        }));
      }

      if (draft.mode === 'existing' && clients.length) {
        formHost.appendChild(U.field({
          label: 'Client', type: 'select', value: draft.clientId,
          options: clients.map(function (c) { return { value: c.id, label: c.name }; }),
          onChange: function (v) {
            draft.clientId = v;
            var c = CF.store.find('clients', v);
            if (c) {
              if (c.sqft) draft.sqft = c.sqft;
              if (c.beds) draft.beds = c.beds;
              if (c.baths) draft.baths = c.baths;
              if (c.preferredServiceId) draft.serviceId = c.preferredServiceId;
              if (c.frequency) draft.frequency = c.frequency;
            }
            draft.override = null;
            paint();
          }
        }).node);
      } else {
        formHost.appendChild(el('div.stack.stack-3', [
          U.field({
            label: 'Customer name', value: draft.leadName, required: true,
            placeholder: 'e.g. Nina Alvarez',
            onInput: function (v) { draft.leadName = v; }
          }).node,
          U.field({
            label: 'Phone (optional)', value: draft.leadPhone, type: 'tel',
            placeholder: '(512) 555-0100',
            onInput: function (v) { draft.leadPhone = v; }
          }).node,
          el('p.meta', 'No full profile needed yet — CleanFlow creates one when they say yes.')
        ]));
      }

      formHost.appendChild(el('div.field', [
        el('div.field__label', 'Service type'),
        U.segmented({
          label: 'Service type', value: draft.serviceId, fill: true, outline: true,
          options: services.map(function (s) { return { value: s.id, label: s.name.replace(' Cleaning', '') }; }),
          onChange: function (v) { draft.serviceId = v; draft.override = null; paint(); }
        })
      ]));

      var sizeLabel = el('div.field__hint', formatSqft(draft.sqft));
      formHost.appendChild(el('div.field', [
        el('label.field__label', { for: 'quote-size' }, 'Property size'),
        el('input.range#quote-size', {
          type: 'range', min: 400, max: 6000, step: 100, value: draft.sqft,
          'aria-valuetext': formatSqft(draft.sqft),
          oninput: function (e) {
            draft.sqft = Number(e.target.value);
            draft.override = null;
            sizeLabel.textContent = formatSqft(draft.sqft);
            paintPanel();
          }
        }),
        sizeLabel
      ]));

      formHost.appendChild(el('div.grid.grid-2', [
        counter('Bedrooms', draft.beds, 0, 8, function (v) { draft.beds = v; draft.override = null; paint(); }),
        counter('Bathrooms', draft.baths, 0, 8, function (v) { draft.baths = v; draft.override = null; paint(); })
      ]));

      formHost.appendChild(el('div.field', [
        el('div.field__label', 'Condition'),
        U.segmented({
          label: 'Condition', value: draft.condition, fill: true,
          options: CF.schema.CONDITIONS.map(function (c) { return { value: c.id, label: c.label }; }),
          onChange: function (v) { draft.condition = v; draft.override = null; paint(); }
        }),
        el('div.field__hint', ({
          light:  'Well-kept, cleaned recently.',
          normal: 'Typical lived-in home.',
          heavy:  'Neglected, post-build or post-party — expect extra time.'
        })[draft.condition])
      ]));

      formHost.appendChild(el('div.field', [
        el('div.field__label', 'Add-ons'),
        el('div.stack.stack-2', addons.map(function (a) {
          return U.checkRow({
            label: a.name,
            meta: '+' + F.money(a.price),
            checked: draft.addonIds.indexOf(a.id) !== -1,
            onToggle: function () {
              var i = draft.addonIds.indexOf(a.id);
              if (i === -1) draft.addonIds.push(a.id);
              else draft.addonIds.splice(i, 1);
              draft.override = null;
              paint();
            }
          });
        }))
      ]));

      formHost.appendChild(U.field({
        label: 'How often?', type: 'select', value: draft.frequency,
        hint: 'Weekly and bi-weekly work gets an automatic loyalty discount.',
        options: CF.schema.FREQUENCIES.map(function (f) { return { value: f.id, label: f.label }; }),
        onChange: function (v) { draft.frequency = v; draft.override = null; paint(); }
      }).node);
    }

    function counter(label, value, min, max, onChange) {
      return el('div.field', [
        el('div.field__label', label),
        el('div.row.row-2', [
          el('button.btn.btn--secondary', {
            type: 'button', 'aria-label': 'Fewer ' + label.toLowerCase(),
            style: { minWidth: '44px', padding: '0' },
            disabled: value <= min,
            onclick: function () { if (value > min) onChange(value - 1); }
          }, '−'),
          el('div', {
            style: { flex: '1', textAlign: 'center', fontWeight: '800', fontSize: '16px' },
            'aria-live': 'polite'
          }, String(value)),
          el('button.btn.btn--secondary', {
            type: 'button', 'aria-label': 'More ' + label.toLowerCase(),
            style: { minWidth: '44px', padding: '0' },
            disabled: value >= max,
            onclick: function () { if (value < max) onChange(value + 1); }
          }, '+')
        ])
      ]);
    }

    /* ---- right: the number ---- */
    function paintPanel() {
      var c = calc();
      var verdict = CF.pricing.marginVerdict(c.margin);
      CF.dom.clear(panelHost);

      var priceNode;
      if (editingPrice) {
        var input = el('input.quote__price-input', {
          type: 'number', value: c.price, autofocus: true, inputmode: 'decimal',
          'aria-label': 'Quote price',
          onblur: function (e) {
            draft.override = e.target.value === '' ? null : Number(e.target.value);
            editingPrice = false;
            paintPanel();
          },
          onkeydown: function (e) { if (e.key === 'Enter') e.target.blur(); }
        });
        priceNode = el('div.row.row-2', {
          style: { justifyContent: 'center', marginTop: '10px' }
        }, [
          el('span', { style: { fontSize: '56px', fontWeight: '800' } },
            CF.store.get().settings.currencySymbol),
          input
        ]);
      } else {
        priceNode = el('button.quote__price', {
          type: 'button',
          'aria-label': 'Quote price ' + F.money(c.price) + '. Activate to edit.',
          onclick: function () { editingPrice = true; paintPanel(); }
        }, [
          F.money(c.price),
          el('span.quote__price-edit', { 'aria-hidden': 'true' }, '✎ edit')
        ]);
      }

      panelHost.appendChild(el('div.ink.ink--quote', [
        el('div.quote__eyebrow', 'Your Suggested Price'),
        el('div.quote__basis', c.overridden
          ? 'Manually set · suggested was ' + F.money(c.suggested)
          : 'Based on your pricing settings'),

        priceNode,

        // The owner quotes a pre-tax figure but bills the total; say so here so
        // the two numbers are never a surprise to either side.
        c.tax > 0 ? el('div.quote__basis', { style: { marginTop: '2px' } },
          '+ ' + F.money(c.tax) + ' ' + taxWord() + ' · client pays ' + F.money(c.total)) : null,

        el('div', { style: { marginTop: '4px' } }, [
          el('button.linkbtn.linkbtn--on-ink', {
            type: 'button',
            'aria-expanded': showCalc ? 'true' : 'false',
            onclick: function () { showCalc = !showCalc; paintPanel(); }
          }, showCalc ? 'Hide calculation' : 'See calculation')
        ]),

        showCalc ? el('div.quote__calc', [
          calcRow('Base (' + c.serviceName + ')', F.money(c.base)),
          c.sizeAdjust ? calcRow('Size adjustment', '+' + F.money(c.sizeAdjust)) : null,
          c.roomAdjust ? calcRow('Rooms adjustment',
            (c.roomAdjust > 0 ? '+' : '') + F.money(c.roomAdjust)) : null,
          c.conditionAdjust ? calcRow('Condition (' + c.conditionLabel + ')',
            (c.conditionAdjust > 0 ? '+' : '') + F.money(c.conditionAdjust)) : null,
          c.addonTotal ? calcRow('Add-ons', '+' + F.money(c.addonTotal)) : null,
          c.freqDiscount ? calcRow('Recurring discount (' + c.freqDiscountPct + '%)',
            '−' + F.money(c.freqDiscount)) : null,
          el('div.quote__calc-row.quote__calc-row--total', [
            el('span', 'Suggested'), el('span', F.money(c.suggested))
          ])
        ].filter(Boolean)) : null,

        el('div.quote__figures', [
          figure('Est. time', F.hoursLabel(c.minutes)),
          figure('Est. cost', F.money(c.cost)),
          figure('Est. profit', F.money(c.profit), 'ok'),
          figure('Margin', c.margin + '%', verdict.tone === 'ok' ? 'ok' : 'thin')
        ]),

        el('div', {
          style: {
            marginTop: '14px', fontSize: '12.5px', fontWeight: '700',
            color: verdict.tone === 'ok' ? 'var(--ok-bright)'
                 : verdict.tone === 'warn' ? 'var(--warn-dot)' : '#FF9A94'
          }
        }, verdict.text + ' · ' + F.money(c.hourlyRate) + '/hr'),

        el('div.row.row-3.mt-6', [
          el('button.btn.btn--on-ink', {
            type: 'button', style: { flex: '1' }, onclick: function () { save('draft'); }
          }, 'Save Quote'),
          el('button.btn.btn--primary', {
            type: 'button', style: { flex: '1' }, onclick: acceptAndBook
          }, draft.mode === 'new' ? 'Create Client + Book' : 'Book Job')
        ]),

        el('div.row.row-3.mt-3', { style: { justifyContent: 'center' } }, [
          el('button.linkbtn.linkbtn--on-ink', {
            type: 'button', onclick: function () { save('sent'); }
          }, 'Save & mark sent')
        ])
      ]));

      function calcRow(label, value) {
        return el('div.quote__calc-row', [el('span', label), el('span', value)]);
      }
      function figure(label, value, tone) {
        return el('div', [
          el('div.quote__fig-label', label),
          el('div.quote__fig-value' + (tone === 'ok' ? '.quote__fig-value--ok'
            : tone === 'thin' ? '.quote__fig-value--thin' : ''), value)
        ]);
      }
    }

    /* ---- save / convert ---- */

    function validate() {
      if (draft.mode === 'new' && !draft.leadName.trim()) {
        CF.ui.toast('Enter the customer\'s name to continue', { tone: 'bad' });
        var input = formHost.querySelector('input');
        if (input) input.focus();
        return false;
      }
      if (draft.mode === 'existing' && !draft.clientId) {
        CF.ui.toast('Pick a client first', { tone: 'bad' });
        return false;
      }
      return true;
    }

    function payload(c) {
      return {
        clientId: draft.mode === 'existing' ? draft.clientId : null,
        clientName: draft.mode === 'existing'
          ? Q.clientName(draft.clientId) : draft.leadName.trim(),
        clientPhone: draft.leadPhone,
        serviceId: draft.serviceId,
        sqft: draft.sqft, beds: draft.beds, baths: draft.baths,
        condition: draft.condition, addonIds: draft.addonIds.slice(),
        frequency: draft.frequency,
        price: c.price, cost: c.cost, profit: c.profit,
        margin: c.margin, minutes: c.minutes,
        tax: c.tax, total: c.total
      };
    }

    function save(status) {
      if (!validate()) return;
      var c = calc();
      var quote = CF.actions.saveQuote(Object.assign(payload(c), { status: 'draft' }));
      if (status === 'sent') CF.actions.setQuoteStatus(quote.id, 'sent');
      draft = null;
      CF.ui.toast(status === 'sent' ? 'Quote saved and marked sent' : 'Quote saved');
      go('#/money/quote/' + quote.id);
    }

    function acceptAndBook() {
      if (!validate()) return;
      var c = calc();
      var quote = CF.actions.saveQuote(Object.assign(payload(c), { status: 'sent' }));
      var result = CF.actions.acceptQuote(quote.id, { date: F.today() });
      if (!result) return;          // the write was refused; the toast explains why
      draft = null;
      CF.ui.toast('Quote accepted — job booked');
      go('#/jobs/' + result.job.id + '/edit');
    }
  }

  function formatSqft(v) {
    return Number(v).toLocaleString() + ' sq ft';
  }

  /* ---- Saved quote ------------------------------------------------------------------ */

  function renderSaved(quote) {
    var U = CF.ui, F = CF.fmt, Q = CF.q, go = CF.router.go;
    var biz = CF.store.get().business;
    var st = CF.schema.QUOTE_STATUS.filter(function (s) { return s.id === quote.status; })[0]
             || { label: quote.status, tone: 'neutral' };
    var name = quote.clientName || Q.clientName(quote.clientId);

    return el('div.anim-fade-up', { style: { maxWidth: '600px' } }, [
      el('div.no-print', [U.backLink('Back to Money', function () { go('#/money'); })]),

      el('div.card.card--roomy.paper', [
        el('div.row.between.row-4.row-wrap', [
          el('div', [
            el('div.eyebrow', 'Quote #' + quote.number),
            el('h1.h-card', { style: { marginTop: '6px' } }, name)
          ]),
          U.badge(st.label, st.tone, true)
        ]),

        biz.name ? el('div.meta.mt-2', biz.name +
          (biz.phone ? ' · ' + biz.phone : '')) : null,

        el('div.doc__block', [
          el('div.doc__label', 'Scope'),
          el('div.doc__body', [
            Q.serviceName(quote.serviceId), ' · ',
            Number(quote.sqft).toLocaleString(), ' sq ft · ',
            F.plural(quote.beds, 'bed'), ' · ', F.plural(quote.baths, 'bath'),
            (quote.addonIds || []).length
              ? el('div.mt-2', 'Includes: ' + (quote.addonIds || []).map(function (id) {
                  var a = CF.store.find('addons', id);
                  return a ? a.name : null;
                }).filter(Boolean).join(', '))
              : null
          ])
        ]),

        el('div.doc__total', [
          el('div', [
            el('div.meta', 'Frequency'),
            el('div', { style: { fontWeight: '700' } }, frequencyLabel(quote.frequency))
          ]),
          // Tax is re-derived from the current rate, not read back from the
          // quote: the client must see the number they will actually be
          // invoiced, and the invoice is raised at the rate in force then.
          quoteTax(quote) > 0
            ? el('div.right', [
                el('div.meta', F.money(quote.price) + ' + ' +
                  F.money(quoteTax(quote)) + ' ' + taxWord()),
                el('div.h-card', F.money(quote.price + quoteTax(quote)))
              ])
            : el('div.h-card', F.money(quote.price))
        ]),

        el('div.card.card--tight.mt-4.no-print', { style: { background: 'var(--surface-sunken)' } }, [
          el('div.eyebrow.mb-2', 'Your numbers (not shown to the client)'),
          el('div.deflist', [
            U.defRow('Estimated cost', F.money(quote.cost)),
            U.defRow('Estimated profit', F.money(quote.profit)),
            U.defRow('Margin', quote.margin + '%')
          ])
        ]),

        el('div.stack.stack-3.mt-5.no-print', [
          quote.status !== 'accepted' ? el('button.btn.btn--primary.btn--block.btn--lg', {
            type: 'button', onclick: accept
          }, 'Accepted → Book Job') : el('div.callout.callout--ok.center',
            '✓ Accepted and booked'),

          el('div.row.row-3', [
            quote.status === 'draft' ? el('button.btn.btn--secondary', {
              type: 'button', style: { flex: '1' },
              onclick: function () {
                CF.actions.setQuoteStatus(quote.id, 'sent');
                CF.ui.toast('Marked as sent');
                CF.shell.repaint();
              }
            }, 'Mark Sent') : null,
            quote.status !== 'declined' && quote.status !== 'accepted'
              ? el('button.btn.btn--secondary', {
                  type: 'button', style: { flex: '1' }, onclick: decline
                }, 'Mark Declined') : null
          ].filter(Boolean)),

          el('div.row.row-3', { style: { justifyContent: 'center' } }, [
            el('button.linkbtn', { type: 'button', onclick: function () { window.print(); } },
              'Print / Save PDF'),
            el('button.linkbtn', { type: 'button', onclick: copyQuote }, 'Copy as message')
          ])
        ])
      ])
    ]);

    function accept() {
      var result = CF.actions.acceptQuote(quote.id, { date: F.today() });
      if (!result) return;          // the write was refused; the toast explains why
      CF.ui.toast('Job booked' + (quote.clientId ? '' : ' and client created'));
      go('#/jobs/' + result.job.id + '/edit');
    }

    function decline() {
      CF.ui.confirm({
        title: 'Mark this quote declined?',
        message: 'It stays in your records so you can see your win rate. You can always build a new one.',
        confirmLabel: 'Mark Declined'
      }).then(function (ok) {
        if (!ok) return;
        CF.actions.setQuoteStatus(quote.id, 'declined');
        CF.ui.toast('Quote marked declined', {
          undo: function () { CF.store.undo(); CF.shell.repaint(); }
        });
        CF.shell.repaint();
      });
    }

    function copyQuote() {
      var lines = [
        'Hi ' + String(name).split(' ')[0] + ',',
        '',
        'Here\'s your quote for ' + Q.serviceName(quote.serviceId).toLowerCase() + ':',
        '',
        Q.serviceName(quote.serviceId) + ' — ' + F.money(quote.price),
        quoteTax(quote) > 0
          ? 'Plus ' + taxWord() + ' ' + F.money(quoteTax(quote)) +
            ' — total ' + F.money(quote.price + quoteTax(quote))
          : null,
        Number(quote.sqft).toLocaleString() + ' sq ft · ' +
          F.plural(quote.beds, 'bed') + ' · ' + F.plural(quote.baths, 'bath'),
        'Frequency: ' + frequencyLabel(quote.frequency),
        '',
        'Let me know if you\'d like to get booked in.',
        biz.name ? '— ' + biz.name : ''
      ];
      CF.ui.copy(lines.filter(function (l) { return l !== null; }).join('\n'), 'Quote');
    }
  }

  /** What this quote's tax comes to at today's rate — 0 when tax is off. */
  function quoteTax(quote) {
    return CF.pricing.taxOn(Number(quote.price) || 0);
  }

  function taxWord() {
    return CF.store.get().settings.taxLabel || 'Tax';
  }

  function frequencyLabel(id) {
    var f = CF.schema.FREQUENCIES.filter(function (x) { return x.id === id; })[0];
    return f ? f.label : 'One-time';
  }

  CF.views = CF.views || {};
  CF.views.quote = { render: render, reset: reset };
})(window.CF = window.CF || {});
