/* ==========================================================================
   🚀 GROW — the work your own client list is already worth chasing

   Every money figure on this screen is potential, not earned: a client whose
   interval has lapsed, a quote nobody has answered. MONEY is the screen for
   what actually came in.

   Every card is earned by real data: a lapsed interval, an unanswered
   quote, a finished job with no review asked. Each one carries a message
   you can copy and send in seconds.
   ========================================================================== */
(function (CF) {
  'use strict';

  function el() { return CF.dom.el.apply(null, arguments); }

  function render() {
    var U = CF.ui, F = CF.fmt, Q = CF.q, go = CF.router.go;

    var rebook = Q.readyToRebook();
    var followUp = Q.staleQuotes();
    var reviews = Q.readyForReview();
    var referrals = Q.referralCandidates();

    var potential = rebook.reduce(function (a, r) { return a + r.estimatedValue; }, 0) +
                    followUp.reduce(function (a, q) { return a + (q.price || 0); }, 0);

    var page = el('div.anim-fade-up', [
      el('h1.h-page', 'Grow Your Business'),
      // Every figure on this screen is work that has *not* been agreed: a
      // client who is due but has not said yes, a quote that has not been
      // answered. Saying "$645 is sitting here" put an unearned number in the
      // same visual language as the real totals in MONEY, which is how a solo
      // owner ends up planning around money nobody has promised them.
      el('div.sub.mb-6', potential > 0
        ? 'Up to ' + F.money(potential) + ' of potential work is waiting on a ' +
          'follow-up. Nothing here is booked or confirmed yet — these are ' +
          'estimates based on your usual prices.'
        : 'A few simple actions could bring in real revenue this week.')
    ]);

    var cards = [
      rebook.length ? rebookCard() : null,
      followUp.length ? followUpCard() : null,
      reviews.length ? reviewCard() : null,
      referrals.length ? referralCard() : null
    ].filter(Boolean);

    if (!cards.length) {
      page.appendChild(U.empty({
        title: 'Nothing to chase right now',
        body: Q.activeClients().length
          ? 'Every client is booked, every quote is answered and every review has been asked for. ' +
            'Opportunities appear here automatically as jobs finish and intervals lapse.'
          : 'Once you have clients and completed jobs, CleanFlow surfaces rebooking, review ' +
            'and referral opportunities right here.'
      }));
    } else {
      // Cards size to their content rather than stretching to the tallest in
      // the row — an opportunity card padded with empty space reads as broken.
      page.appendChild(el('div.grid.grid-2.mb-6', {
        style: { alignItems: 'start' }
      }, cards));
    }

    page.appendChild(proposalBanner());
    page.appendChild(templateLibrary());
    return page;

    /* ---- cards ------------------------------------------------------------- */

    function card(config) {
      return el('div.opp', [
        el('div.opp__title', config.icon + ' ' + config.title),
        config.revenue ? el('div.opp__revenue', [
          'Potential value: ', el('b', F.money(config.revenue)),
          el('span.opp__revenue-note', ' · estimated, not booked')
        ]) : null,
        el('div.opp__why', config.why),
        el('div.stack.stack-2.mt-4', config.items)
      ]);
    }

    function oppItem(config) {
      var done = !!CF.store.get().outreach[config.key];
      return el('div.opp__item', [
        el('div.row.between.row-2.row-wrap', [
          el('div.opp__item-label', config.label),
          el('div.row.row-2', [
            config.primary ? el('button.btn.btn--sm', {
              type: 'button',
              style: { background: 'var(--brand-tint-2)', border: '1px solid var(--brand-border)',
                       color: 'var(--brand-text)' },
              onclick: config.primary.onClick
            }, config.primary.label) : null,
            el('button.btn.btn--secondary.btn--sm', {
              type: 'button', onclick: config.onCopy
            }, 'Copy')
          ])
        ]),
        done
          ? el('div.opp__done', [
              '✓ Marked contacted',
              el('button.linkbtn', {
                type: 'button',
                style: { fontSize: '11.5px', marginLeft: '8px', color: 'var(--text-faint)' },
                onclick: function () {
                  CF.actions.clearContacted(config.key);
                  CF.shell.repaint();
                }
              }, 'undo')
            ])
          : el('button.linkbtn', {
              type: 'button',
              style: { fontSize: '11.5px', textDecoration: 'none', padding: '4px 0' },
              onclick: function () {
                CF.actions.markContacted(config.key);
                CF.shell.repaint();
              }
            }, 'Mark contacted')
      ]);
    }

    function rebookCard() {
      return card({
        icon: '💰',
        title: F.plural(rebook.length, 'client') + ' ready to rebook',
        revenue: rebook.reduce(function (a, r) { return a + r.estimatedValue; }, 0),
        why: 'Their normal cleaning interval has passed and nothing is booked ahead.',
        items: rebook.slice(0, 5).map(function (r) {
          return oppItem({
            key: 'rebook:' + r.client.id + ':' + r.lastJobDate,
            label: r.client.name + ' — ' + F.plural(r.daysSince, 'day') + ' since last visit',
            primary: {
              label: 'Book Again',
              onClick: function () { go('#/jobs/new?client=' + r.client.id); }
            },
            onCopy: function () {
              copyTemplate('tpl-rebook', {
                client: firstName(r.client.name),
                days: r.daysSince
              }, 'Rebook message');
            }
          });
        })
      });
    }

    function followUpCard() {
      return card({
        icon: '💬',
        title: F.plural(followUp.length, 'quote') + ' need follow-up',
        revenue: followUp.reduce(function (a, q) { return a + (q.price || 0); }, 0),
        why: 'Sent a few days ago with no answer yet. One nudge wins more of these than you\'d think.',
        items: followUp.slice(0, 5).map(function (q) {
          var name = q.clientName || Q.clientName(q.clientId);
          return oppItem({
            key: 'followup:' + q.id,
            label: name + ' — sent ' + F.agoPhrase(q.sentDate || q.date),
            primary: {
              label: 'Open',
              onClick: function () { go('#/money/quote/' + q.id); }
            },
            onCopy: function () {
              copyTemplate('tpl-followup', {
                client: firstName(name),
                amount: F.money(q.price)
              }, 'Follow-up message');
            }
          });
        })
      });
    }

    function reviewCard() {
      return card({
        icon: '⭐',
        title: F.plural(reviews.length, 'customer') + ' ready for a review request',
        why: 'They had a clean recently and you haven\'t asked yet. Reviews are how new clients find you.',
        items: reviews.slice(0, 5).map(function (r) {
          return oppItem({
            key: 'review:' + r.client.id,
            label: r.client.name + ' — ' + F.plural(r.stats.jobsCompleted, 'job') + ' completed',
            onCopy: function () {
              copyTemplate('tpl-review', { client: firstName(r.client.name) }, 'Review request');
            }
          });
        })
      });
    }

    function referralCard() {
      return card({
        icon: '🤝',
        title: F.plural(referrals.length, 'referral opportunity', 'referral opportunities'),
        why: 'Long-standing clients who keep rebooking — the people most likely to recommend you.',
        items: referrals.slice(0, 5).map(function (r) {
          return oppItem({
            key: 'referral:' + r.client.id,
            label: 'Ask ' + r.client.name + ' — ' +
                   F.plural(r.stats.jobsCompleted, 'job') + ' together',
            onCopy: function () {
              copyTemplate('tpl-referral', { client: firstName(r.client.name) }, 'Referral message');
            }
          });
        })
      });
    }

    /* ---- extras --------------------------------------------------------------- */

    function proposalBanner() {
      return el('div.ink.row.between.row-5.row-wrap', [
        el('div', [
          el('div', { style: { fontSize: '17px', fontWeight: '800' } },
            'Commercial Proposal Generator'),
          el('div', { style: { fontSize: '13.5px', color: 'var(--ink-muted)', marginTop: '4px' } },
            'Create a professional printable proposal for offices, gyms and retail clients.')
        ]),
        el('button.btn.btn--primary', {
          type: 'button', onclick: function () { go('#/grow/proposal'); }
        }, 'Build Proposal')
      ]);
    }

    function templateLibrary() {
      return el('div.mt-8', [
        U.sectionHeader('Message Templates'),
        el('p.meta.mb-3', 'Edit these once and every Copy button uses your own words.'),
        el('div.stack.stack-2', CF.store.all('templates').map(function (t) {
          return el('div.listrow', [
            el('div.grow', [
              el('div.listrow__title', t.name),
              el('div.listrow__sub.truncate', t.body)
            ]),
            el('button.btn.btn--secondary.btn--sm', {
              type: 'button', onclick: function () { editTemplate(t); }
            }, 'Edit')
          ]);
        }))
      ]);
    }

    function editTemplate(t) {
      var body = t.body;
      CF.ui.modal({
        size: 'md', title: 'Edit: ' + t.name,
        sub: 'Use {client}, {business}, {amount}, {days} and {referralOffer} as placeholders.',
        body: function () {
          return U.field({
            label: 'Message', value: body, multiline: true, rows: 6, autofocus: true,
            onInput: function (v) { body = v; }
          }).node;
        },
        actions: function (close) {
          return [
            el('button.btn.btn--secondary', { type: 'button', onclick: function () { close(); } }, 'Cancel'),
            el('button.btn.btn--primary', {
              type: 'button',
              onclick: function () {
                CF.store.update('templates', t.id, { body: body }, 'Edit template');
                close();
                CF.ui.toast('Template saved');
                CF.shell.repaint();
              }
            }, 'Save')
          ];
        }
      });
    }

    function copyTemplate(templateId, vars, label) {
      var t = CF.store.find('templates', templateId);
      CF.ui.copy(CF.actions.renderTemplate(t ? t.body : '', vars), label);
    }

    function firstName(name) { return String(name || '').split(' ')[0]; }
  }

  /* ---- Commercial proposal --------------------------------------------------------- */

  var proposal = null;

  function blankProposal() {
    return {
      client: '', property: '',
      scope: 'Nightly trash removal, kitchen & breakroom sanitation, restroom deep clean, ' +
             'common area vacuuming and surface disinfecting.',
      frequency: '5x / week',
      price: '', period: 'month',
      terms: 'Net 15 · 90-day minimum commitment · cancel anytime after.',
      number: CF.store.get().counters.proposal + 1
    };
  }

  /** Has anything actually been typed, or is this still the starting text? */
  function proposalStarted(p) {
    if (!p) return false;
    var blank = blankProposal();
    return ['client', 'property', 'scope', 'frequency', 'price', 'terms']
      .some(function (k) { return String(p[k] || '') !== String(blank[k] || ''); });
  }

  function renderProposal() {
    var U = CF.ui, F = CF.fmt, go = CF.router.go;
    var biz = CF.store.get().business;

    // A proposal takes real typing and is never saved as a record — the next
    // step is Print. A reload after that (or a back-swipe on a phone) used to
    // wipe it with nothing to recover. Pick the draft back up instead.
    if (!proposal) proposal = CF.drafts.load('proposal') || blankProposal();

    function remember() {
      if (proposalStarted(proposal)) CF.drafts.save('proposal', proposal);
      else CF.drafts.clear('proposal');
    }

    var preview = el('div.paper');

    function paintPreview() {
      CF.dom.mount(preview, el('div', [
        el('div.doc__head', [
          el('div.doc__biz', biz.name || 'Your Business Name'),
          el('div.doc__ref', 'Proposal #CP-' + proposal.number)
        ]),
        el('div.doc__block', [
          el('div.doc__label', 'Prepared for'),
          el('div.doc__value', proposal.client || 'Client name'),
          proposal.property ? el('div.meta.mt-1', proposal.property) : null
        ]),
        el('div.doc__block', [
          el('div.doc__label', 'Scope of work'),
          el('div.doc__body', proposal.scope)
        ]),
        el('div.doc__total', [
          el('div', { style: { fontSize: '13.5px', color: 'var(--text-muted)' } },
            'Frequency: ' + proposal.frequency),
          el('div.h-card', proposal.price
            ? F.money(F.parseMoney(proposal.price)) + '/' + proposal.period
            : '—')
        ]),
        el('div.doc__terms', 'Terms: ' + proposal.terms),
        biz.phone || biz.email ? el('div.doc__terms', { style: { marginTop: '8px' } },
          [biz.phone, biz.email].filter(Boolean).join(' · ')) : null
      ]));
    }

    function bind(label, key, opts) {
      var cfg = Object.assign({
        label: label, value: proposal[key],
        onInput: function (v) { proposal[key] = v; remember(); paintPreview(); }
      }, opts || {});
      return U.field(cfg).node;
    }

    function discard() {
      proposal = null;
      CF.drafts.clear('proposal');
      CF.shell.repaint();
    }

    paintPreview();

    return el('div.anim-fade-up', [
      el('div.no-print', [
        U.backLink('Back to Grow', function () { go('#/grow'); }),
        el('h1.h-page.mb-5', 'Commercial Proposal')
      ]),

      el('div.grid.grid-calc', [
        el('div.card.card--roomy.stack.stack-4.no-print', [
          bind('Client', 'client', { placeholder: 'e.g. Meridian Coworking', autofocus: true }),
          bind('Property', 'property', { placeholder: '3rd floor office suite' }),
          bind('Scope of work', 'scope', { multiline: true, rows: 4 }),
          bind('Frequency', 'frequency', { placeholder: '5x / week' }),
          el('div.grid.grid-2', [
            bind('Price', 'price', { type: 'number', inputmode: 'decimal',
              prefix: CF.store.get().settings.currencySymbol }),
            U.field({
              label: 'Per', type: 'select', value: proposal.period,
              options: [
                { value: 'month', label: 'Month' },
                { value: 'week', label: 'Week' },
                { value: 'visit', label: 'Visit' }
              ],
              onChange: function (v) { proposal.period = v; remember(); paintPreview(); }
            }).node
          ]),
          bind('Terms', 'terms', { multiline: true, rows: 2 }),

          !biz.name ? el('div.callout.callout--warn',
            'Add your business name in Settings so it appears at the top of this proposal.') : null,

          el('div.row.row-3', [
            el('button.btn.btn--primary', {
              type: 'button', style: { flex: '1' },
              onclick: function () { window.print(); }
            }, 'Print / Save PDF'),
            el('button.btn.btn--secondary', {
              type: 'button',
              onclick: function () {
                if (!proposalStarted(proposal)) { discard(); return; }
                CF.ui.confirm({
                  title: 'Clear this proposal?',
                  message: 'Everything you have typed here will be discarded. ' +
                           'Print or save a PDF first if you still need it.',
                  confirmLabel: 'Clear It', cancelLabel: 'Keep Typing', danger: true
                }).then(function (ok) { if (ok) discard(); });
              }
            }, 'Clear')
          ])
        ]),
        preview
      ])
    ]);
  }

  CF.views = CF.views || {};
  CF.views.grow = { render: render, renderProposal: renderProposal };
})(window.CF = window.CF || {});
