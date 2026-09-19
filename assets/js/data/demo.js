/* ==========================================================================
   CleanFlow — Demo business

   Sparkle & Shine: a believable one-person operation mid-week. Dates are
   generated relative to today, so the demo always looks live — today has
   jobs, an invoice is genuinely overdue, and two clients have actually
   lapsed. Every Grow opportunity is earned by the data rather than faked.
   ========================================================================== */
(function (CF) {
  'use strict';

  function build() {
    var F = CF.fmt;
    var db = CF.schema.emptyDatabase();
    var today = F.today();
    var day = function (offset) { return F.addDays(today, offset); };

    db.business = {
      name: 'Sparkle & Shine Cleaning Co.',
      owner: 'Sam Rivera',
      phone: '(512) 555-0142',
      email: 'hello@sparkleandshine.co',
      address: '1200 S Lamar Blvd, Austin, TX 78704',
      serviceArea: 'Austin, TX & surrounding suburbs',
      tagline: 'Reliable, thorough, on time.'
    };

    db.settings = Object.assign(db.settings, {
      demoMode: true,
      onboarded: true,
      hourlyCost: 28,
      lastBackupAt: new Date(Date.now() - 3 * 86400000).toISOString()
    });

    var SVC = {
      standard: 'svc-standard', deep: 'svc-deep',
      moveout: 'svc-moveout', airbnb: 'svc-airbnb'
    };

    /* ---- Clients ------------------------------------------------------- */

    db.clients = [
      {
        id: 'c-sarah', name: 'Sarah Miller', phone: '(512) 555-0142',
        email: 'sarah.miller@email.com', address: '142 Maple Ave, Austin, TX',
        propertyType: 'House', sqft: 2100, beds: 3, baths: 2,
        access: 'Side gate code 4471. Key under the blue planter if the gate is latched.',
        pets: 'Friendly golden retriever (Max) — keep the back door closed.',
        preferences: 'Prefers eco-friendly products. Leave the AC off after cleaning.',
        notes: 'Works from home Tuesdays — knock rather than ring the bell.',
        preferredServiceId: SVC.standard, frequency: 'biweekly',
        status: 'active', contract: 'Signed welcome packet on file · bi-weekly agreement',
        createdAt: new Date(Date.now() - 400 * 86400000).toISOString()
      },
      {
        id: 'c-james', name: 'James Ortiz', phone: '(512) 555-0178',
        email: 'j.ortiz@email.com', address: '21 Oak Ct, Austin, TX',
        propertyType: 'Townhouse', sqft: 1650, beds: 2, baths: 2,
        access: 'Alarm code 9821, panel in the hallway closet.',
        pets: 'None.',
        preferences: 'Hates the smell of bleach — use the citrus cleaner.',
        notes: 'Travels for work; texts to confirm the day before.',
        preferredServiceId: SVC.deep, frequency: 'monthly',
        status: 'active', contract: '',
        createdAt: new Date(Date.now() - 260 * 86400000).toISOString()
      },
      {
        id: 'c-linda', name: 'Linda Park', phone: '(512) 555-0196',
        email: 'linda.park@email.com', address: '910 Cedar St, Austin, TX',
        propertyType: 'House', sqft: 2600, beds: 4, baths: 3,
        access: 'Park in the driveway. Lockbox on the side door, code 2208.',
        pets: 'Two cats — keep the upstairs bedroom door shut.',
        preferences: 'Wants the kitchen done first. Leave a note on the counter.',
        notes: 'Longest-running client. Has referred two neighbours.',
        preferredServiceId: SVC.standard, frequency: 'weekly',
        status: 'active', contract: 'Weekly standard cleaning agreement · reviewed each January',
        createdAt: new Date(Date.now() - 700 * 86400000).toISOString()
      },
      {
        id: 'c-marco', name: 'Marco Reyes', phone: '(512) 555-0110',
        email: 'marco.r@email.com', address: '55 Elm Dr, Austin, TX',
        propertyType: 'Apartment', sqft: 950, beds: 2, baths: 1,
        access: 'Empty unit — leasing office holds the key, ask for unit 55.',
        pets: 'None.', preferences: '', notes: 'Landlord pays; invoice the management company.',
        preferredServiceId: SVC.moveout, frequency: 'one-time',
        status: 'active', contract: '',
        createdAt: new Date(Date.now() - 60 * 86400000).toISOString()
      },
      {
        id: 'c-diane', name: 'Diane Cho', phone: '(512) 555-0133',
        email: 'diane.cho@email.com', address: '88 Birch Ln, Austin, TX',
        propertyType: 'Condo', sqft: 1400, beds: 2, baths: 2,
        access: 'Key under the mat. Buzzer code 12#.',
        pets: 'None.', preferences: 'Please do not move anything on the desk.',
        notes: '', preferredServiceId: SVC.standard, frequency: 'biweekly',
        status: 'active', contract: '',
        createdAt: new Date(Date.now() - 300 * 86400000).toISOString()
      },
      {
        id: 'c-ravi', name: 'Ravi Patel', phone: '(512) 555-0188',
        email: 'ravi.p@email.com', address: '300 Pine Rd, Austin, TX',
        propertyType: 'House', sqft: 1900, beds: 3, baths: 2,
        access: 'Front door keypad 5512.',
        pets: 'One small dog, crated during cleans.',
        preferences: '', notes: 'Went quiet after a schedule clash — worth one more try.',
        preferredServiceId: SVC.standard, frequency: 'biweekly',
        status: 'active', contract: '',
        createdAt: new Date(Date.now() - 500 * 86400000).toISOString()
      },
      {
        id: 'c-meridian', name: 'Meridian Coworking', phone: '(512) 555-0200',
        email: 'ops@meridianco.com', address: '400 Congress Ave, Floor 3, Austin, TX',
        propertyType: 'Office', sqft: 4200, beds: 0, baths: 4,
        access: 'Badge access after 7pm — ask reception for the contractor badge.',
        pets: 'None.', preferences: 'Nightly service, must finish before 6am.',
        notes: 'Commercial lead — proposal sent, waiting on their ops manager.',
        preferredServiceId: SVC.standard, frequency: 'weekly',
        status: 'lead', contract: '',
        createdAt: new Date(Date.now() - 20 * 86400000).toISOString()
      }
    ];

    /* ---- Jobs -----------------------------------------------------------
       Four today, a few ahead, and a completed history deep enough that
       lifetime values and rebook timers are real numbers.                  */

    function checklist(serviceId, doneCount) {
      var items = CF.actions.checklistFor(serviceId);
      return items.map(function (i, idx) {
        return Object.assign({}, i, { done: idx < (doneCount || 0) });
      });
    }

    db.jobs = [
      // --- today
      mkJob('j-1', 'c-sarah', SVC.standard, day(0), '09:00', 120, 'scheduled', 0),
      mkJob('j-2', 'c-diane', SVC.standard, day(0), '11:30', 110, 'scheduled', 0),
      mkJob('j-3', 'c-linda', SVC.deep,     day(0), '14:00', 210, 'in_progress', 4),
      mkJob('j-4', 'c-james', SVC.standard, day(0), '16:30', 120, 'scheduled', 0),
      // --- upcoming
      mkJob('j-5', 'c-marco', SVC.moveout,  day(1), '10:00', 260, 'scheduled', 0),
      mkJob('j-6', 'c-diane', SVC.standard, day(4), '09:00', 110, 'scheduled', 0),
      mkJob('j-7', 'c-linda', SVC.standard, day(7), '09:00', 110, 'scheduled', 0),
      mkJob('j-8', 'c-sarah', SVC.standard, day(14), '09:00', 120, 'scheduled', 0),
      // --- completed history
      mkDone('j-9',  'c-james', SVC.standard, day(-1),  120),
      mkDone('j-10', 'c-linda', SVC.standard, day(-3),  110),
      mkDone('j-11', 'c-sarah', SVC.standard, day(-4),  120),
      mkDone('j-12', 'c-ravi',  SVC.standard, day(-38), 115),
      mkDone('j-13', 'c-marco', SVC.moveout,  day(-52), 250),
      mkDone('j-14', 'c-linda', SVC.standard, day(-10), 110),
      mkDone('j-15', 'c-diane', SVC.standard, day(-12), 110),
      mkDone('j-16', 'c-sarah', SVC.standard, day(-18), 120),
      mkDone('j-17', 'c-linda', SVC.standard, day(-17), 110)
    ];

    function mkJob(id, clientId, serviceId, date, time, price, status, doneCount) {
      var c = db.clients.filter(function (x) { return x.id === clientId; })[0];
      var svc = db.services.filter(function (x) { return x.id === serviceId; })[0];
      var freq = c.frequency;
      return {
        id: id, clientId: clientId, clientName: c.name,
        serviceId: serviceId, serviceName: svc.name,
        date: date, time: time, price: price,
        address: c.address,
        notes: [c.access, c.pets].filter(Boolean).join(' '),
        status: status,
        recurrence: { frequency: freq, endedAt: null },
        checklist: checklist(serviceId, doneCount),
        extras: [],
        startedAt: status === 'in_progress' ? new Date(Date.now() - 32 * 60000).toISOString() : null,
        elapsedSeconds: 0, finishedAt: null, completedDate: null,
        invoiceId: null, quoteId: null,
        createdAt: new Date().toISOString()
      };
    }

    function mkDone(id, clientId, serviceId, date, price) {
      var j = mkJob(id, clientId, serviceId, date, '09:00', price, 'completed', 99);
      j.completedDate = date;
      j.finishedAt = new Date().toISOString();
      j.elapsedSeconds = 9000 + Math.round(Math.random() * 3600);
      return j;
    }

    /* ---- Invoices + payments ---------------------------------------------
       One genuinely overdue, one partly paid, the rest settled.            */

    db.invoices = [
      mkInvoice('i-1', 'j-13', 'c-marco', 250, day(-52), day(-38), []),
      mkInvoice('i-2', 'j-12', 'c-ravi',  115, day(-38), day(-24),
                [{ amount: 115, date: day(-30), method: 'Cash' }]),
      mkInvoice('i-3', 'j-17', 'c-linda', 110, day(-17), day(-3),
                [{ amount: 110, date: day(-14), method: 'Bank transfer' }]),
      mkInvoice('i-4', 'j-16', 'c-sarah', 120, day(-18), day(-4),
                [{ amount: 120, date: day(-15), method: 'Card' }]),
      mkInvoice('i-5', 'j-15', 'c-diane', 110, day(-12), day(2),
                [{ amount: 110, date: day(-9), method: 'Bank transfer' }]),
      mkInvoice('i-6', 'j-14', 'c-linda', 110, day(-10), day(4),
                [{ amount: 110, date: day(-8), method: 'Bank transfer' }]),
      mkInvoice('i-7', 'j-11', 'c-sarah', 120, day(-4), day(10),
                [{ amount: 120, date: day(-2), method: 'Card' }]),
      mkInvoice('i-8', 'j-10', 'c-linda', 110, day(-3), day(11), []),
      mkInvoice('i-9', 'j-9',  'c-james', 120, day(-1), day(13),
                [{ amount: 60, date: day(-1), method: 'Cash' }])
    ];

    function mkInvoice(id, jobId, clientId, total, issue, due, payments) {
      var c = db.clients.filter(function (x) { return x.id === clientId; })[0];
      var job = db.jobs.filter(function (x) { return x.id === jobId; })[0];
      var svcName = job ? job.serviceName : 'Cleaning';
      if (job) job.invoiceId = id;
      return {
        id: id, number: String(100 + db.invoices.length + 1),
        clientId: clientId, clientName: c.name, jobId: jobId,
        lines: [{ label: svcName, amount: total }],
        subtotal: total, tax: 0, total: total,
        issueDate: issue, dueDate: due,
        payments: payments.map(function (p, i) {
          return Object.assign({ id: id + '-p' + i }, p);
        }),
        notes: '', createdAt: new Date().toISOString()
      };
    }

    // Number them in issue order so the sequence reads sensibly.
    db.invoices.slice().sort(function (a, b) {
      return a.issueDate < b.issueDate ? -1 : 1;
    }).forEach(function (inv, i) { inv.number = String(101 + i); });
    db.counters.invoice = 101 + db.invoices.length;

    /* ---- Quotes ----------------------------------------------------------
       Two sent and going cold — that is what powers Grow's follow-up card. */

    db.quotes = [
      {
        id: 'q-1', number: '104', clientId: null,
        clientName: 'Nina Alvarez', clientPhone: '(512) 555-0161',
        serviceId: SVC.standard, sqft: 1750, beds: 3, baths: 2,
        condition: 'normal', addonIds: ['add-oven'], frequency: 'biweekly',
        price: 185, cost: 80, profit: 105, margin: 57, minutes: 175,
        status: 'sent', date: day(-5), sentDate: day(-5),
        notes: 'Referred by Linda Park.', createdAt: new Date().toISOString()
      },
      {
        id: 'q-2', number: '105', clientId: null,
        clientName: 'Tom Reid', clientPhone: '(512) 555-0174',
        serviceId: SVC.deep, sqft: 2200, beds: 3, baths: 2,
        condition: 'heavy', addonIds: ['add-fridge', 'add-windows'], frequency: 'one-time',
        price: 340, cost: 150, profit: 190, margin: 56, minutes: 330,
        status: 'sent', date: day(-7), sentDate: day(-7),
        notes: 'Post-renovation. Wants it before the 30th.', createdAt: new Date().toISOString()
      },
      {
        id: 'q-3', number: '106', clientId: 'c-meridian',
        clientName: 'Meridian Coworking', clientPhone: '(512) 555-0200',
        serviceId: SVC.standard, sqft: 4200, beds: 0, baths: 4,
        condition: 'normal', addonIds: [], frequency: 'weekly',
        price: 1450, cost: 620, profit: 830, margin: 57, minutes: 1200,
        status: 'draft', date: day(-2), sentDate: null,
        notes: 'Monthly rate for 5x/week nightly service.', createdAt: new Date().toISOString()
      },
      {
        id: 'q-4', number: '103', clientId: 'c-james',
        clientName: 'James Ortiz', clientPhone: '(512) 555-0178',
        serviceId: SVC.standard, sqft: 1650, beds: 2, baths: 2,
        condition: 'normal', addonIds: [], frequency: 'monthly',
        price: 120, cost: 52, profit: 68, margin: 57, minutes: 140,
        status: 'accepted', date: day(-30), sentDate: day(-30),
        notes: '', createdAt: new Date().toISOString()
      }
    ];
    db.counters.quote = 106;

    /* ---- Expenses -------------------------------------------------------- */

    db.expenses = [
      { id: 'e-1', amount: 86, category: 'Supplies',  note: 'Restock — microfibre, degreaser, liners', date: day(-4) },
      { id: 'e-2', amount: 54, category: 'Gas',       note: 'Fill up', date: day(-6) },
      { id: 'e-3', amount: 120, category: 'Equipment', note: 'Vacuum belt + filter replacement', date: day(-9) },
      { id: 'e-4', amount: 61, category: 'Supplies',  note: 'Bulk paper goods', date: day(-15) },
      { id: 'e-5', amount: 48, category: 'Gas',       note: 'Fill up', date: day(-17) },
      { id: 'e-6', amount: 95, category: 'Marketing', note: 'Local flyers + yard signs', date: day(-22) },
      { id: 'e-7', amount: 140, category: 'Insurance', note: 'Monthly liability premium', date: day(-25) }
    ];

    /* ---- Outreach + activity --------------------------------------------- */

    db.outreach = { 'review:c-diane': { at: new Date().toISOString(), date: day(-8) } };

    db.activity = [
      { id: 'a-1', at: new Date().toISOString(), date: day(-1), icon: '✅',
        text: 'Completed Standard Cleaning for James Ortiz' },
      { id: 'a-2', at: new Date().toISOString(), date: day(-2), icon: '💵',
        text: 'Payment received from Sarah Miller — $120' },
      { id: 'a-3', at: new Date().toISOString(), date: day(-5), icon: '📝',
        text: 'Quote saved for Nina Alvarez — $185' },
      { id: 'a-4', at: new Date().toISOString(), date: day(-6), icon: '🧾',
        text: 'Gas — $54' },
      { id: 'a-5', at: new Date().toISOString(), date: day(-8), icon: '👥',
        text: 'Added new client: Meridian Coworking' }
    ];

    return db;
  }

  /** Swap the current database for a fresh demo. Destructive by design. */
  /** Which collections hold sample records the demo invents. */
  var SEEDED = ['clients', 'jobs', 'invoices', 'quotes', 'expenses'];

  /**
   * Mark every sample record as sample.
   *
   * Someone exploring the demo will book a real job or add a real client to try
   * it out — and "Start My Business" used to delete the lot while telling them
   * "nothing real is lost". Stamping the demo means their own work can be told
   * apart from it and carried across.
   */
  function stamp(db) {
    SEEDED.forEach(function (key) {
      (db[key] || []).forEach(function (row) { if (row) row._demo = true; });
    });
    return db;
  }

  /**
   * Records the person added themselves while the demo was loaded.
   *
   * Anything the app writes goes through `store.insert`, which stamps
   * `createdAt`; the demo's sample records are literals and carry neither that
   * nor `_demo`. Both signals are checked so a demo loaded by an older build,
   * which has no `_demo` marks, is still recognised as sample data.
   */
  function ownWork(db) {
    var out = {};
    SEEDED.forEach(function (key) {
      out[key] = (db[key] || []).filter(function (row) {
        return row && !row._demo && !!row.createdAt;
      });
    });
    return out;
  }

  function ownWorkCount(db) {
    var own = ownWork(db);
    return SEEDED.reduce(function (a, k) { return a + own[k].length; }, 0);
  }

  function load() {
    CF.store.replace(stamp(build()), 'Load demo data');
    return CF.store.flush();
  }

  CF.demo = {
    build: build, load: load,
    ownWork: ownWork, ownWorkCount: ownWorkCount, SEEDED: SEEDED
  };
})(window.CF = window.CF || {});
