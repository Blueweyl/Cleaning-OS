/* ==========================================================================
   💰 MONEY — pricing, quotes, invoices, expenses, profit

   Enough to know whether the month is working. Deliberately not accounting
   software: no ledgers, no reconciliation, no chart of accounts.
   ========================================================================== */
(function (CF) {
  'use strict';

  function el() { return CF.dom.el.apply(null, arguments); }

  var tab = 'overview';
  // Reset whenever the tab changes, so asking for every invoice does not also
  // draw every expense. See ui.cappedList for why long lists wait behind a tap.
  var showAll = false;
  var monthOffset = 0;

  /* ---- Overview -------------------------------------------------------------- */

  function renderOverview() {
    var U = CF.ui, F = CF.fmt, Q = CF.q, go = CF.router.go;
    var month = Q.monthBounds(monthOffset);
    var sum = Q.summary(month.from, month.to);

    var page = el('div.anim-fade-up', [
      U.pageHeader({
        title: 'Money',
        actions: [el('button.btn.btn--primary', {
          type: 'button', onclick: function () { go('#/money/quote'); }
        }, 'Create Quote')]
      }),

      el('div.row.between.row-3.mb-4', [
        el('div.row.row-2', [
          el('button.iconbtn', {
            type: 'button', 'aria-label': 'Previous month',
            onclick: function () { monthOffset--; CF.shell.repaint(); }
          }, '‹'),
          el('div', { style: { fontWeight: '700', minWidth: '150px', textAlign: 'center' } },
            month.label),
          el('button.iconbtn', {
            type: 'button', 'aria-label': 'Next month',
            disabled: monthOffset >= 0,
            onclick: function () { if (monthOffset < 0) { monthOffset++; CF.shell.repaint(); } }
          }, '›')
        ]),
        monthOffset !== 0 ? el('button.linkbtn', {
          type: 'button', onclick: function () { monthOffset = 0; CF.shell.repaint(); }
        }, 'This month') : null
      ]),

      el('div.grid.grid-3.mb-5', [
        U.stat({ label: 'Revenue', value: F.money(sum.revenue),
                 note: sum.taxCollected > 0
                   ? F.plural(sum.jobsCompleted, 'job') + ' completed · after ' +
                     (CF.store.get().settings.taxLabel || 'tax')
                   : F.plural(sum.jobsCompleted, 'job') + ' completed' }),
        U.stat({ tone: 'ok', label: 'Estimated Profit', value: F.money(sum.profit),
                 note: 'Revenue minus expenses — a rough guide, not accounting-grade.' }),
        U.stat({ tone: 'warn', label: 'Waiting to Collect', value: F.money(sum.outstanding),
                 // This total sums every open invoice, so one that disagrees
                 // with its own lines is inside the figure. It sits above all
                 // four tabs, which is why the Money screen showed a disputed
                 // amount as settled fact on every one of them.
                 note: F.plural(Q.openInvoices().length, 'open invoice') +
                   (function () {
                     var off = Q.openInvoices().filter(function (i) {
                       return Q.invoiceInconsistent(i);
                     }).length;
                     return off
                       ? ' · ' + F.plural(off, 'invoice') + ' does not add up'
                       : '';
                   })() })
      ]),

      U.tabs({
        label: 'Money views', value: tab,
        onChange: function (v) { tab = v; showAll = false; CF.shell.repaint(); },
        options: [
          { value: 'overview', label: 'Overview' },
          { value: 'quotes',   label: 'Quotes',   count: Q.quotes().length },
          { value: 'invoices', label: 'Invoices', count: Q.invoices().length },
          { value: 'expenses', label: 'Expenses', count: Q.expenses().length }
        ]
      })
    ]);

    page.appendChild(({
      overview: overviewTab,
      quotes:   quotesTab,
      invoices: invoicesTab,
      expenses: expensesTab
    })[tab](month, sum));

    return page;
  }

  function overviewTab(month, sum) {
    var U = CF.ui, F = CF.fmt, Q = CF.q, go = CF.router.go;
    var overdue = Q.overdueInvoices();
    var stale = Q.staleQuotes();

    var attention = []
      .concat(overdue.slice(0, 4).map(function (inv) {
        return {
          title: Q.clientName(inv.clientId, inv.clientName) + ' — overdue invoice',
          sub: F.money(Q.invoiceRemaining(inv)) + ' · due ' + F.agoPhrase(inv.dueDate),
          cta: 'View', route: '#/money/invoice/' + inv.id
        };
      }))
      .concat(stale.slice(0, 3).map(function (q) {
        return {
          title: (q.clientName || Q.clientName(q.clientId)) + ' — quote follow-up',
          sub: F.money(q.price) + ' · sent ' + F.agoPhrase(q.sentDate || q.date),
          cta: 'Follow Up', route: '#/grow'
        };
      }));

    var payments = Q.paymentsIn(month.from, month.to);
    var spend = Q.expenses().filter(function (e) {
      return e.date >= month.from && e.date <= month.to;
    });

    var transactions = payments.map(function (p) {
      return { icon: '💵', label: 'Payment — ' + Q.clientName(p.clientId, p.clientName), date: p.date,
               amount: p.amount, tone: 'in' };
    }).concat(spend.map(function (e) {
      return { icon: '🧾', label: e.category + (e.note ? ' — ' + e.note : ''), date: e.date,
               amount: -e.amount, tone: 'out' };
    })).sort(function (a, b) { return a.date < b.date ? 1 : -1; }).slice(0, 12);

    return el('div', [
      el('h2.h-section.mb-3', 'Needs Attention'),
      attention.length
        ? el('div.list.mb-6', attention.map(function (a) {
            return el('div.attention__row', [
              el('div.grow', [
                el('div.listrow__title', a.title),
                el('div.listrow__sub', a.sub)
              ]),
              el('button.btn.btn--quiet.btn--sm', {
                type: 'button', onclick: function () { go(a.route); }
              }, a.cta)
            ]);
          }))
        : el('div.callout.callout--ok.mb-6', '✅ No overdue invoices or stale quotes.'),

      el('div.row.between.mb-3', [
        el('h2.h-section', 'Recent Transactions'),
        transactions.length ? el('button.linkbtn', {
          type: 'button', onclick: function () { CF.backup.exportCsv('payments'); }
        }, 'Export payments') : null
      ]),

      transactions.length
        ? el('div.list', transactions.map(function (t) {
            return el('div.listrow', [
              el('span', { 'aria-hidden': 'true' }, t.icon),
              el('div.grow', [
                el('div.listrow__title', t.label),
                el('div.meta', F.shortDate(t.date))
              ]),
              el('div.listrow__price', {
                style: { color: t.amount >= 0 ? 'var(--ok-text)' : 'var(--bad-text)' }
              }, F.money(t.amount, { signed: true }))
            ]);
          }))
        : U.emptySoft('Payments and expenses show up here once you start recording them.'),

      el('div.card.mt-6', [
        el('div.eyebrow.mb-3', month.label + ' summary'),
        el('div.deflist', [
          sum.taxCollected > 0 ? U.defRow('Collected from clients', F.money(sum.collected)) : null,
          sum.taxCollected > 0
            ? U.defRow((CF.store.get().settings.taxLabel || 'Tax') + ' collected (not yours)',
                       '−' + F.money(sum.taxCollected))
            : null,
          U.defRow('Your revenue', F.money(sum.revenue)),
          U.defRow('Expenses', F.money(sum.expenses)),
          U.defRow('Average job value', F.money(sum.averageJob)),
          U.defRow('Estimated profit', F.money(sum.profit), true),
          el('div.meta', { style: { marginTop: '4px' } },
            sum.margin + '% margin · ' + F.money(sum.outstanding) +
            ' still to collect (all time)')
        ].filter(Boolean))
      ])
    ]);
  }

  /* ---- Quotes tab ---------------------------------------------------------------- */

  function quotesTab() {
    var U = CF.ui, F = CF.fmt, Q = CF.q, go = CF.router.go;
    var rows = Q.quotes().slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; });

    if (!rows.length) {
      return U.empty({
        small: true, title: 'No quotes yet',
        body: 'Quotes you build for leads and clients show up here.',
        action: { label: '+ Create Quote', onClick: function () { go('#/money/quote'); } }
      });
    }

    return el('div', [
      el('div.row.between.mb-3', [
        el('div.meta', F.plural(rows.length, 'quote')),
        el('button.linkbtn', { type: 'button',
          onclick: function () { CF.backup.exportCsv('quotes'); } }, 'Export CSV')
      ]),
      U.cappedList({ rows: rows, noun: 'quote', showAll: showAll,
        onShowAll: function () { showAll = true; CF.shell.repaint(); },
        row: function (q) {
        var st = CF.schema.QUOTE_STATUS.filter(function (s) { return s.id === q.status; })[0]
                 || { label: q.status, tone: 'neutral' };
        return el('button.listrow', {
          type: 'button', onclick: function () { go('#/money/quote/' + q.id); }
        }, [
          el('div.grow', [
            el('div.listrow__title', q.clientName || Q.clientName(q.clientId)),
            el('div.meta', '#' + q.number + ' · ' + F.shortDate(q.date) +
              (q.status === 'sent' ? ' · sent ' + F.agoPhrase(q.sentDate || q.date) : ''))
          ]),
          el('div.right', [
            el('div.listrow__price', F.money(q.price)),
            U.badge(st.label, st.tone)
          ])
        ]);
        } })
    ]);
  }

  /* ---- Invoices tab ---------------------------------------------------------------- */

  function invoicesTab() {
    var U = CF.ui, F = CF.fmt, Q = CF.q, go = CF.router.go;
    var rows = Q.invoices().slice().sort(function (a, b) {
      return a.issueDate < b.issueDate ? 1 : -1;
    });

    if (!rows.length) {
      return U.empty({
        small: true, title: 'No invoices yet',
        body: 'Complete a job and CleanFlow raises its invoice for you.'
      });
    }

    return el('div', [
      el('div.row.between.mb-3', [
        el('div.meta', F.money(Q.outstandingTotal()) + ' outstanding across ' +
          F.plural(Q.openInvoices().length, 'invoice')),
        el('button.linkbtn', { type: 'button',
          onclick: function () { CF.backup.exportCsv('invoices'); } }, 'Export CSV')
      ]),
      U.cappedList({ rows: rows, noun: 'invoice', showAll: showAll,
        onShowAll: function () { showAll = true; CF.shell.repaint(); },
        row: function (inv) {
        var st = Q.invoiceStatus(inv);
        return el('button.listrow', {
          type: 'button', onclick: function () { go('#/money/invoice/' + inv.id); }
        }, [
          el('div.grow', [
            el('div.listrow__title', Q.clientName(inv.clientId, inv.clientName)),
            el('div.meta', '#' + inv.number + ' · ' + F.shortDate(inv.issueDate) +
              (st.id === 'overdue' ? ' · ' + F.plural(st.daysLate, 'day') + ' late' : '') +
              // This row prints inv.total, which is exactly the figure an
              // inconsistent invoice disagrees with itself about. Every other
              // screen showing it says so; a list is no less a place to be told.
              (Q.invoiceInconsistent(inv) ? ' · does not add up' : ''))
          ]),
          el('div.right', [
            el('div.listrow__price', F.money(inv.total)),
            U.badge(st.label, st.tone)
          ])
        ]);
        } })
    ]);
  }

  /* ---- Expenses tab ------------------------------------------------------------------ */

  function expensesTab(month) {
    var U = CF.ui, F = CF.fmt, Q = CF.q;
    var rows = Q.expenses().slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; });

    var byCategory = {};
    rows.filter(function (e) { return e.date >= month.from && e.date <= month.to; })
        .forEach(function (e) {
          byCategory[e.category] = (byCategory[e.category] || 0) + (Number(e.amount) || 0);
        });
    var categories = Object.keys(byCategory).sort(function (a, b) {
      return byCategory[b] - byCategory[a];
    });

    return el('div', [
      el('div.row.between.row-3.mb-4', [
        el('div.meta', rows.length ? F.plural(rows.length, 'expense') + ' recorded' : ''),
        el('div.row.row-2', [
          rows.length ? el('button.linkbtn', { type: 'button',
            onclick: function () { CF.backup.exportCsv('expenses'); } }, 'Export CSV') : null,
          el('button.btn.btn--primary.btn--sm', {
            type: 'button', onclick: function () { expenseModal(); }
          }, '+ Add Expense')
        ])
      ]),

      categories.length ? el('div.card.mb-4', [
        el('div.eyebrow.mb-3', month.label + ' by category'),
        el('div.deflist', categories.map(function (c) {
          return U.defRow(c, F.money(byCategory[c]));
        }))
      ]) : null,

      rows.length
        ? U.cappedList({ rows: rows, noun: 'expense', showAll: showAll,
            onShowAll: function () { showAll = true; CF.shell.repaint(); },
            row: function (e) {
            return el('div.listrow', [
              el('div.grow', [
                el('div.listrow__title', e.category),
                el('div.meta', F.shortDate(e.date) + (e.note ? ' · ' + e.note : ''))
              ]),
              el('div.listrow__price', F.money(e.amount)),
              el('button.iconbtn', {
                type: 'button', 'aria-label': 'Delete expense',
                onclick: function () { deleteExpense(e); }
              }, '✕')
            ]);
            } })
        : el('div.empty--soft', { style: { textAlign: 'center', padding: '36px 24px' } },
            'Log gas, supplies and other costs here — it takes seconds and makes your profit number real.')
    ]);

    function deleteExpense(e) {
      CF.ui.confirm({
        title: 'Delete this expense?',
        message: F.money(e.amount) + ' — ' + e.category + ' on ' + F.shortDate(e.date) + '.',
        confirmLabel: 'Delete', danger: true
      }).then(function (ok) {
        if (!ok) return;
        CF.store.remove('expenses', e.id, 'Delete expense');
        CF.ui.toast('Expense deleted', {
          undo: function () { CF.store.undo(); CF.shell.repaint(); }
        });
      });
    }
  }

  /* ---- Quick expense modal -------------------------------------------------------------- */

  function expenseModal() {
    var U = CF.ui, F = CF.fmt;
    var draft = { amount: '', category: 'Supplies', note: '', date: F.today() };
    var amountField;

    CF.ui.modal({
      title: 'New expense',
      body: function () {
        amountField = U.field({
          label: 'Amount', type: 'number', inputmode: 'decimal', autofocus: true,
          prefix: CF.store.get().settings.currencySymbol,
          onInput: function (v) { draft.amount = v; amountField.setError(''); }
        });

        var catHost = el('div.row.row-2.row-wrap');
        function paintCats() {
          CF.dom.clear(catHost);
          CF.schema.EXPENSE_CATEGORIES.forEach(function (c) {
            catHost.appendChild(el('button.seg__item', {
              type: 'button',
              'aria-pressed': draft.category === c ? 'true' : 'false',
              onclick: function () { draft.category = c; paintCats(); }
            }, c));
          });
        }
        paintCats();

        return el('div.stack.stack-4', [
          amountField.node,
          el('div.field', [el('div.field__label', 'Category'), catHost]),
          U.field({ label: 'Date', type: 'date', value: draft.date,
            onChange: function (v) { draft.date = v; } }).node,
          U.field({ label: 'Note (optional)', placeholder: 'e.g. Restock at the supply shop',
            onInput: function (v) { draft.note = v; } }).node
        ]);
      },
      actions: function (close) {
        return [
          el('button.btn.btn--secondary', { type: 'button', onclick: function () { close(); } }, 'Cancel'),
          el('button.btn.btn--primary', {
            type: 'button',
            onclick: function () {
              var value = Number(draft.amount);
              if (!value || value <= 0) {
                amountField.setError('Enter an amount above zero.');
                amountField.input.focus();
                return;
              }
              // The domain layer validates the date and category too, so it can
              // still refuse. Closing regardless would toast "Expense saved"
              // and offer an Undo that took back the previous action instead.
              if (!CF.actions.addExpense({
                amount: value, category: draft.category,
                note: draft.note, date: draft.date
              })) return;
              close();
              CF.ui.toast('Expense saved', {
                undo: function () { CF.store.undo(); CF.shell.repaint(); }
              });
              CF.shell.repaint();
            }
          }, 'Save Expense')
        ];
      }
    });
  }

  /* ---- Invoice detail --------------------------------------------------------------------- */

  function renderInvoice(id) {
    var U = CF.ui, F = CF.fmt, Q = CF.q, go = CF.router.go;
    var inv = CF.store.find('invoices', id);
    if (!inv || inv.deletedAt) {
      return U.empty({ title: 'That invoice is no longer here',
        action: { label: 'Back to Money', onClick: function () { go('#/money'); } } });
    }

    var biz = CF.store.get().business;
    var st = Q.invoiceStatus(inv);
    var received = Q.invoiceReceived(inv);
    var remaining = Q.invoiceRemaining(inv);
    var over = Q.invoiceOverpaid(inv);

    return el('div.anim-fade-up', { style: { maxWidth: '600px' } }, [
      el('div.no-print', [U.backLink('Back to Money', function () { go('#/money'); })]),

      el('div.card.card--roomy.paper', [
        el('div.row.between.row-4.row-wrap', [
          el('div', [
            el('div.eyebrow', 'Invoice #' + inv.number),
            el('h1.h-card', { style: { marginTop: '6px' } },
              Q.clientName(inv.clientId, inv.clientName))
          ]),
          U.badge(st.label, st.tone, true)
        ]),

        biz.name ? el('div.meta.mt-2', biz.name +
          (biz.phone ? ' · ' + biz.phone : '') +
          (biz.email ? ' · ' + biz.email : '')) : null,

        el('div.row.row-5.row-wrap.mt-4', [
          el('div', [el('div.doc__label', 'Issued'), el('div', F.shortDate(inv.issueDate))]),
          el('div', [el('div.doc__label', 'Due'), el('div', F.shortDate(inv.dueDate))])
        ]),

        el('div', {
          style: { marginTop: '22px', padding: '16px 0',
                   borderTop: '1px solid var(--border-soft)',
                   borderBottom: '1px solid var(--border-soft)' }
        }, el('div.stack.stack-3', (inv.lines || []).map(function (l) {
          return el('div.lineitem', [
            el('span.lineitem__name', l.label),
            el('span.lineitem__amt', F.money(l.amount))
          ]);
        }))),

        el('div.deflist.mt-4', [
          inv.tax ? U.defRow('Subtotal', F.money(inv.subtotal)) : null,
          // The rate is named because it can legitimately differ from Settings:
          // an invoice raised against an accepted quote is billed at the rate
          // agreed then, so without this the figure looks like a mistake.
          inv.tax ? U.defRow(
            (CF.store.get().settings.taxLabel || 'Tax') +
              (isFinite(Number(inv.taxRate)) && Number(inv.taxRate) > 0
                ? ' at ' + Number(inv.taxRate) + '%' : ''),
            F.money(inv.tax)) : null,
          U.defRow('Invoice total', F.money(inv.total)),
          U.defRow('Received', F.money(received)),
          over > 0 ? U.defRow('Overpaid', F.money(over), true) : null,
          over > 0 ? null : U.defRow('Remaining', F.money(remaining), true)
        ].filter(Boolean)),

        over > 0 ? el('div.callout.callout--warn.mt-3',
          'This invoice has been paid ' + F.money(over) + ' more than its total. ' +
          'Remove or correct a payment below, or refund the difference.') : null,

        // A restored file can arrive self-contradictory. CleanFlow will not
        // quietly rewrite a billed figure, so it points at the disagreement
        // instead and leaves the decision where it belongs.
        (function () {
          var off = Q.invoiceInconsistent(inv);
          if (!off) return null;
          return el('div.callout.callout--warn.mt-3', [
            el('div', { style: { fontWeight: '700' } }, 'This invoice does not add up'),
            el('div.mt-1', 'Its lines come to ' + F.money(off.lines) +
              (off.tax > 0 ? ' plus ' + F.money(off.tax) + ' ' +
                (CF.store.get().settings.taxLabel || 'tax') : '') +
              ', but the total recorded on it is ' + F.money(off.total) + '.'),
            el('div.mt-1', 'The figure you were billed has been left exactly as it ' +
              'was — nothing has been changed. This usually means the file was ' +
              'edited outside CleanFlow. Check it against your own copy of the ' +
              'invoice before chasing the balance.')
          ]);
        })(),

        (inv.payments || []).length ? el('div.mt-4', [
          el('div.eyebrow.mb-2', 'Payments'),
          el('div.stack.stack-2', inv.payments.map(function (p) {
            return el('div.row.between', [
              el('span.meta', F.shortDate(p.date) + ' · ' + p.method),
              el('span.row.row-2', [
                el('strong', F.money(p.amount)),
                el('button.iconbtn.no-print', {
                  type: 'button', 'aria-label': 'Remove payment',
                  style: { width: '28px', height: '28px', fontSize: '13px' },
                  onclick: function () { removePayment(p); }
                }, '✕')
              ])
            ]);
          }))
        ]) : null,

        remaining <= 0
          ? el('div.callout.callout--ok.mt-5.center', '✓ Paid in full')
          : el('button.btn.btn--primary.btn--block.btn--lg.mt-5.no-print', {
              type: 'button', onclick: paymentModal
            }, 'Record Payment'),

        el('div.row.row-3.mt-4.no-print', { style: { justifyContent: 'center' } }, [
          el('button.linkbtn', { type: 'button', onclick: function () { window.print(); } },
            'Print / Save PDF'),
          remaining > 0 ? el('button.linkbtn', {
            type: 'button', onclick: copyReminder
          }, 'Copy payment reminder') : null
        ])
      ])
    ]);

    function paymentModal() {
      var amount = String(remaining);
      var method = 'Cash';
      var amountField;

      CF.ui.modal({
        size: 'sm', title: 'Record payment',
        sub: Q.clientName(inv.clientId, inv.clientName) + ' · ' + F.money(remaining) + ' remaining',
        body: function () {
          amountField = U.field({
            label: 'Amount received', type: 'number', inputmode: 'decimal',
            value: amount, autofocus: true,
            prefix: CF.store.get().settings.currencySymbol,
            onInput: function (v) { amount = v; amountField.setError(''); }
          });
          return el('div.stack.stack-4', [
            amountField.node,
            U.field({ label: 'Method', type: 'select', value: method,
              options: CF.schema.PAYMENT_METHODS.map(function (m) { return { value: m, label: m }; }),
              onChange: function (v) { method = v; } }).node
          ]);
        },
        actions: function (close) {
          return [
            el('button.btn.btn--secondary', { type: 'button', onclick: function () { close(); } }, 'Cancel'),
            el('button.btn.btn--primary', {
              type: 'button',
              onclick: function () {
                var value = Number(amount);
                if (!value || value <= 0) {
                  amountField.setError('Enter an amount above zero.');
                  return;
                }
                if (value > remaining + 0.001) {
                  amountField.setError('That is more than the ' + F.money(remaining) + ' outstanding.');
                  return;
                }
                // The domain layer re-checks the balance against the invoice
                // as it stands now, so it can still refuse what this modal
                // thought was fine — a second tab, or a stale screen.
                if (!CF.actions.recordPayment(inv.id, value, method)) return;
                close();
                var nowPaid = Q.invoiceRemaining(CF.store.find('invoices', inv.id)) <= 0.001;
                if (nowPaid) {
                  CF.shell.setFlash({ kind: 'paid', invoiceId: inv.id, amount: value });
                  go('#/money/paid/' + inv.id);
                } else {
                  CF.ui.toast('Partial payment recorded');
                  CF.shell.repaint();
                }
              }
            }, 'Save Payment')
          ];
        }
      });
    }

    function removePayment(p) {
      CF.ui.confirm({
        title: 'Remove this payment?',
        message: F.money(p.amount) + ' recorded on ' + F.shortDate(p.date) +
                 ' will be removed and the invoice will show as owing again.',
        confirmLabel: 'Remove', danger: true
      }).then(function (ok) {
        if (!ok) return;
        CF.actions.removePayment(inv.id, p.id);
        CF.ui.toast('Payment removed', {
          undo: function () { CF.store.undo(); CF.shell.repaint(); }
        });
        CF.shell.repaint();
      });
    }

    function copyReminder() {
      var tpl = CF.store.find('templates', 'tpl-payment');
      CF.ui.copy(CF.actions.renderTemplate(tpl ? tpl.body : '', {
        client: (Q.clientName(inv.clientId, inv.clientName) || '').split(' ')[0],
        invoice: '#' + inv.number,
        amount: F.money(remaining)
      }), 'Payment reminder');
    }
  }

  /* ---- Payment success ------------------------------------------------------------------------ */

  function renderPaid(id) {
    var F = CF.fmt, Q = CF.q, go = CF.router.go;
    var inv = CF.store.find('invoices', id);
    var flash = CF.shell.getFlash() || {};
    if (!inv) { go('#/money'); return el('div'); }

    return el('div.success.anim-pop', [
      el('div.success__mark', { 'aria-hidden': 'true' }, '✓'),
      el('h1.success__title', 'Payment Recorded'),
      el('p.success__body', [
        el('strong', { style: { color: 'var(--text)' } }, F.money(flash.amount || inv.total)),
        ' received from ' + Q.clientName(inv.clientId, inv.clientName)
      ]),
      el('p.meta.mt-3', 'Invoice #' + inv.number + ' is paid in full.'),
      el('button.btn.btn--primary.btn--block.btn--lg.mt-6', {
        type: 'button', onclick: function () { go('#/grow'); }
      }, 'Ask for a review →'),
      el('button.btn.btn--secondary.btn--block.mt-3', {
        type: 'button', onclick: function () { go('#/money'); }
      }, 'Back to Money')
    ]);
  }

  CF.views = CF.views || {};
  CF.views.money = {
    renderOverview: renderOverview,
    renderInvoice: renderInvoice,
    renderPaid: renderPaid,
    expenseModal: expenseModal,
    setTab: function (t) { tab = t; }
  };
})(window.CF = window.CF || {});
