/* ==========================================================================
   🏠 HOME — "what needs my attention today?"

   Ordered by what it costs to ignore: the next job, the numbers, the
   action list, then today's schedule. Analytics stay out of the way.
   ========================================================================== */
(function (CF) {
  'use strict';

  function el() { return CF.dom.el.apply(null, arguments); }

  function render() {
    var U = CF.ui, F = CF.fmt, Q = CF.q;
    var go = CF.router.go;

    var clients = Q.activeClients();
    var jobs = Q.jobs();
    var isBlank = clients.length === 0 && jobs.length === 0;

    var page = el('div.anim-fade-up', [
      el('h1.h-hello', greeting()),
      el('div.sub', isBlank
        ? 'Let\'s get your first client on the books.'
        : 'Here\'s your business today.')
    ]);

    if (isBlank) {
      page.appendChild(el('div.mt-6', U.empty({
        title: 'Your day starts here 👋',
        body: 'Add a client or build a quote, and CleanFlow fills in the rest — ' +
              'jobs, invoices and follow-ups all flow from there.',
        action: { label: '+ Create Your First Quote', onClick: function () { go('#/money/quote'); } }
      })));
      page.appendChild(quickActions());
      return page;
    }

    /* ---- Next job ----------------------------------------------------- */
    var next = Q.todaysJobs()[0] || Q.upcomingJobs()[0];
    if (next) page.appendChild(el('div.mt-6', nextJobCard(next)));

    /* ---- KPIs ---------------------------------------------------------- */
    var todayList = Q.todaysJobsIncludingDone();
    var outstanding = Q.outstandingTotal();
    var followUps = Q.staleQuotes().length + Q.readyToRebook().length;

    page.appendChild(el('div.grid.grid-4.mt-4', [
      U.kpi('Jobs Today', String(todayList.length)),
      U.kpi('Expected', F.money(Q.expectedToday())),
      U.kpi('Waiting to Collect', F.money(outstanding), outstanding > 0 ? 'warn' : null),
      U.kpi('Follow-Ups', String(followUps))
    ]));

    /* ---- Needs attention ------------------------------------------------ */
    var attention = Q.needsAttention();
    page.appendChild(el('div.mt-8', [
      U.sectionHeader('Needs Your Attention'),
      attention.length
        ? el('div.list', attention.map(attentionRow))
        : el('div.callout.callout--ok', '✅ You\'re all caught up — nothing needs attention right now.')
    ]));

    /* ---- Today + activity ------------------------------------------------ */
    page.appendChild(el('div.grid.grid-split.mt-8', [
      el('div', [
        U.sectionHeader('Today\'s Jobs'),
        todayList.length
          ? el('div.list', todayList.map(todayRow))
          : U.emptySoft('Nothing on the books for today.')
      ]),
      el('div', [
        U.sectionHeader('Recent Activity'),
        recentActivity()
      ])
    ]));

    page.appendChild(quickActions());
    return page;

    /* ---- pieces ---------------------------------------------------------- */

    function greeting() {
      var h = new Date().getHours();
      var word = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
      var owner = CF.store.get().business.owner;
      return word + (owner ? ', ' + owner.split(' ')[0] : '') + ' 👋';
    }

    function nextJobCard(job) {
      var isToday = job.date === F.today();
      return el('button.nextjob', {
        type: 'button',
        onclick: function () { go('#/jobs/' + job.id); }
      }, [
        el('div.nextjob__when', [
          isToday ? 'Next Job' : F.relativeDate(job.date),
          el('br'),
          F.clockTime(job.time)
        ]),
        el('div.nextjob__rule', { 'aria-hidden': 'true' }),
        el('div.grow', [
          el('div.nextjob__client', Q.clientName(job.clientId, job.clientName)),
          el('div.nextjob__meta',
            Q.serviceName(job.serviceId, job.serviceName) + ' · ' + F.money(Q.jobTotal(job)))
        ]),
        el('span.btn.btn--primary.btn--sm', { 'aria-hidden': 'true' },
          job.status === 'in_progress' ? 'Resume' : 'View Job')
      ]);
    }

    function attentionRow(item) {
      return el('div.attention__row', [
        el('span.dot.dot--' + item.tone, { 'aria-hidden': 'true' }),
        el('div.grow', [
          el('div.listrow__title', item.title),
          el('div.listrow__sub', item.sub)
        ]),
        el('button.btn.btn--quiet.btn--sm', {
          type: 'button', onclick: function () { go(item.route); }
        }, item.cta)
      ]);
    }

    function todayRow(job) {
      var done = job.status === 'completed';
      return el('button.listrow', {
        type: 'button', onclick: function () { go('#/jobs/' + job.id); }
      }, [
        el('div.listrow__time', { style: { minWidth: '62px' } }, F.clockTime(job.time)),
        el('div.grow', [
          el('div.listrow__title', Q.clientName(job.clientId, job.clientName)),
          el('div.listrow__sub', Q.serviceName(job.serviceId, job.serviceName))
        ]),
        done ? U.badge('Done', 'ok') : el('div.listrow__price', F.money(Q.jobTotal(job)))
      ]);
    }

    function recentActivity() {
      var rows = CF.store.get().activity.slice(0, 5);
      if (!rows.length) {
        return U.emptySoft('Your activity — completed jobs, payments, quotes — will show up here.');
      }
      return el('div.card.stack.stack-3', rows.map(function (a) {
        return el('div.activity__item', [
          el('span', { 'aria-hidden': 'true' }, a.icon),
          el('div.activity__text', a.text)
        ]);
      }));
    }

    function quickActions() {
      var actions = [
        { label: 'Client',  route: '#/clients/new' },
        { label: 'Quote',   route: '#/money/quote' },
        { label: 'Job',     route: '#/jobs/new' },
        { label: 'Expense', route: null, onClick: function () { CF.views.money.expenseModal(); } }
      ];
      return el('div.mt-8', [
        U.sectionHeader('Quick Actions'),
        el('div.row.row-3.row-wrap', actions.map(function (a) {
          return el('button.btn.btn--secondary', {
            type: 'button',
            onclick: a.onClick || function () { go(a.route); }
          }, [el('span.btn__plus', { 'aria-hidden': 'true' }, '+'), a.label]);
        }))
      ]);
    }
  }

  CF.views = CF.views || {};
  CF.views.home = { render: render };
})(window.CF = window.CF || {});
