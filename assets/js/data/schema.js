/* ==========================================================================
   CleanFlow — Schema, defaults and enumerations
   One place that answers "what shape is a client / job / invoice?"
   ========================================================================== */
(function (CF) {
  'use strict';

  var SCHEMA_VERSION = 1;

  var CURRENCIES = [
    { code: 'USD', symbol: '$',  label: 'US Dollar' },
    { code: 'CAD', symbol: '$',  label: 'Canadian Dollar' },
    { code: 'AUD', symbol: '$',  label: 'Australian Dollar' },
    { code: 'GBP', symbol: '£',  label: 'British Pound' },
    { code: 'EUR', symbol: '€',  label: 'Euro' },
    { code: 'NZD', symbol: '$',  label: 'New Zealand Dollar' },
    { code: 'PHP', symbol: '₱',  label: 'Philippine Peso' },
    { code: 'SGD', symbol: '$',  label: 'Singapore Dollar' },
    { code: 'ZAR', symbol: 'R',  label: 'South African Rand' },
    { code: 'AED', symbol: 'AED ', label: 'UAE Dirham' }
  ];

  var FREQUENCIES = [
    { id: 'one-time',  label: 'One-time',  days: 0 },
    { id: 'weekly',    label: 'Weekly',    days: 7 },
    { id: 'biweekly',  label: 'Bi-weekly', days: 14 },
    { id: 'monthly',   label: 'Monthly',   days: 30 },
    { id: 'quarterly', label: 'Quarterly', days: 90 }
  ];

  var CLIENT_STATUS = [
    { id: 'active',   label: 'Active',   tone: 'ok' },
    { id: 'lead',     label: 'Lead',     tone: 'brand' },
    { id: 'inactive', label: 'Inactive', tone: 'neutral' }
  ];

  var JOB_STATUS = [
    { id: 'scheduled',   label: 'Scheduled',   tone: 'brand' },
    { id: 'in_progress', label: 'In Progress', tone: 'warn' },
    { id: 'completed',   label: 'Completed',   tone: 'ok' },
    { id: 'cancelled',   label: 'Cancelled',   tone: 'neutral' }
  ];

  var QUOTE_STATUS = [
    { id: 'draft',    label: 'Draft',    tone: 'neutral' },
    { id: 'sent',     label: 'Sent',     tone: 'brand' },
    { id: 'accepted', label: 'Accepted', tone: 'ok' },
    { id: 'declined', label: 'Declined', tone: 'bad' }
  ];

  var PROPERTY_TYPES = ['House', 'Apartment', 'Condo', 'Townhouse', 'Office', 'Airbnb', 'Other'];

  var CONDITIONS = [
    { id: 'light',  label: 'Light',  adjust: -10 },
    { id: 'normal', label: 'Normal', adjust: 0 },
    { id: 'heavy',  label: 'Heavy',  adjust: 45 }
  ];

  var EXPENSE_CATEGORIES = ['Supplies', 'Gas', 'Equipment', 'Marketing', 'Insurance', 'Other'];

  var PAYMENT_METHODS = ['Cash', 'Bank transfer', 'Card', 'Check', 'Other'];

  /* ---- Default services ------------------------------------------------ */

  function defaultServices() {
    return [
      { id: 'svc-standard', name: 'Standard Cleaning',  basePrice: 120, estMinutes: 150, checklistId: 'cl-standard', active: true },
      { id: 'svc-deep',     name: 'Deep Cleaning',      basePrice: 210, estMinutes: 270, checklistId: 'cl-deep',     active: true },
      { id: 'svc-moveout',  name: 'Move-Out Cleaning',  basePrice: 260, estMinutes: 300, checklistId: 'cl-moveout',  active: true },
      { id: 'svc-airbnb',   name: 'Airbnb Turnover',    basePrice: 95,  estMinutes: 90,  checklistId: 'cl-airbnb',   active: true },
      { id: 'svc-office',   name: 'Office / Commercial', basePrice: 180, estMinutes: 180, checklistId: 'cl-office',  active: false }
    ];
  }

  function defaultAddons() {
    return [
      { id: 'add-fridge',  name: 'Inside Fridge',     price: 20, minutes: 25 },
      { id: 'add-oven',    name: 'Inside Oven',       price: 25, minutes: 30 },
      { id: 'add-windows', name: 'Interior Windows',  price: 35, minutes: 40 },
      { id: 'add-laundry', name: 'Laundry (1 load)',  price: 15, minutes: 20 },
      { id: 'add-cabinets',name: 'Inside Cabinets',   price: 30, minutes: 35 }
    ];
  }

  /* ---- Default checklist templates (SOPs) ------------------------------ */

  function defaultChecklists() {
    return [
      { id: 'cl-standard', name: 'Standard Clean', items: [
        'Kitchen — counters, sink, stovetop',
        'Bathroom 1 — toilet, shower, sink, mirror',
        'Bathroom 2 — toilet, shower, sink, mirror',
        'Bedrooms — dust, make beds, tidy',
        'Living areas — dust, tidy surfaces',
        'Floors — vacuum all carpet',
        'Floors — mop hard surfaces',
        'Trash & recycling out'
      ] },
      { id: 'cl-deep', name: 'Deep Clean', items: [
        'Kitchen — degrease stovetop & backsplash',
        'Kitchen — wipe cabinet fronts',
        'Kitchen — clean small appliances',
        'Bathrooms — descale shower & taps',
        'Bathrooms — scrub grout lines',
        'Baseboards & door frames wiped',
        'Light switches & handles disinfected',
        'Window sills & tracks',
        'Ceiling fans & vents dusted',
        'Behind & under furniture',
        'Floors — vacuum edges & corners',
        'Floors — mop with deep clean solution',
        'Trash & recycling out'
      ] },
      { id: 'cl-moveout', name: 'Move-Out Clean', items: [
        'All cabinets & drawers emptied and wiped inside',
        'Inside fridge & freezer',
        'Inside oven & broiler',
        'Dishwasher interior & filter',
        'All appliance exteriors',
        'Bathrooms — full descale & sanitise',
        'All closets wiped out',
        'Baseboards, doors & frames',
        'Light fixtures & switch plates',
        'Windows — interior glass & tracks',
        'Walls — spot clean marks',
        'Floors — vacuum & mop throughout',
        'Garage / patio swept',
        'Final walkthrough & photos'
      ] },
      { id: 'cl-airbnb', name: 'Airbnb Turnover', items: [
        'Strip & remake all beds with fresh linen',
        'Fresh towels set out',
        'Bathroom — sanitise & restock toiletries',
        'Kitchen — dishes away, surfaces wiped',
        'Restock coffee, tea & essentials',
        'Check for guest belongings left behind',
        'Trash & recycling out',
        'Floors — vacuum & mop',
        'Staging photos for listing',
        'Report any damage to host'
      ] },
      { id: 'cl-office', name: 'Office / Commercial', items: [
        'Desks & workstations wiped',
        'Meeting rooms reset',
        'Kitchen & breakroom sanitised',
        'Restrooms — full clean & restock',
        'Common areas vacuumed',
        'Glass doors & partitions',
        'High-touch surfaces disinfected',
        'All bins emptied & liners replaced',
        'Reception tidied',
        'Lights off & doors secured'
      ] }
    ];
  }

  /* ---- Message templates (Grow) ---------------------------------------- */

  function defaultTemplates() {
    return [
      { id: 'tpl-rebook',   name: 'Rebook',
        body: "Hi {client}! It's been {days} days since your last cleaning with {business}. " +
              "Would you like me to get you back on the schedule? I have a couple of slots open this week." },
      { id: 'tpl-followup', name: 'Quote follow-up',
        body: "Hi {client}, just checking in on the cleaning quote I sent ({amount}). " +
              "Happy to answer any questions or adjust anything — no pressure either way!" },
      { id: 'tpl-review',   name: 'Review request',
        body: "Hi {client}, thanks so much for trusting {business} with your home! " +
              "If you have a spare minute, a quick review would mean a lot and helps other people find me." },
      { id: 'tpl-referral', name: 'Referral ask',
        body: "Hi {client}, so glad you're happy with the cleanings! " +
              "If you know anyone who could use a reliable cleaner, I'd love an introduction — " +
              "and I'll take {referralOffer} off your next clean as a thank you." },
      { id: 'tpl-payment',  name: 'Payment reminder',
        body: "Hi {client}, just a friendly nudge that invoice {invoice} for {amount} is still open. " +
              "Let me know if you'd like a different payment method — thanks!" },
      { id: 'tpl-confirm',  name: 'Booking confirmation',
        body: "Hi {client}, confirming your {service} on {date} at {time}. " +
              "Total is {amount}. See you then! — {business}" }
    ];
  }

  /* ---- Business defaults ----------------------------------------------- */

  function defaultBusiness() {
    return {
      name: '', owner: '', phone: '', email: '',
      address: '', serviceArea: '',
      tagline: 'Reliable, thorough, on time.'
    };
  }

  function defaultSettings() {
    return {
      currency: 'USD',
      currencySymbol: '$',
      currencyAfter: false,
      locale: '',
      // 'system' follows the device; 'light' and 'dark' override it.
      theme: 'system',
      taxEnabled: false,
      taxRate: 0,
      taxLabel: 'Tax',
      hourlyCost: 28,          // what an hour of work costs you
      costRatio: 0.43,         // fallback cost estimate as a share of price
      rebookGraceDays: 7,      // how long past due before "ready to rebook"
      quoteFollowUpDays: 3,
      invoiceTermsDays: 14,
      referralOffer: '$20',
      roundTo: 5,              // round suggested prices to the nearest $5
      demoMode: false,
      onboarded: false,
      lastBackupAt: null,
      backupReminderDays: 7
    };
  }

  /** A brand-new, empty database. */
  /**
   * Key order matters here, because JSON.stringify follows it and a write
   * that gets cut off loses the tail. The owner's irreplaceable records are
   * written first; the defaults that CleanFlow can simply regenerate —
   * services, checklists, message templates — go last, where truncation
   * costs nothing.
   */
  function emptyDatabase() {
    return {
      schemaVersion: SCHEMA_VERSION,
      business: defaultBusiness(),
      settings: defaultSettings(),

      // Irreplaceable: written first so damage reaches it last.
      clients: [],
      jobs: [],
      invoices: [],
      quotes: [],
      expenses: [],
      payments: [],
      counters: { invoice: 100, quote: 100, proposal: 100 },
      outreach: {},
      activity: [],

      // Regenerable defaults; migrate() puts them back if they go missing.
      services: defaultServices(),
      addons: defaultAddons(),
      checklists: defaultChecklists(),
      templates: defaultTemplates()
    };
  }

  /**
   * Fill in anything a stored database is missing. Runs on every load, so
   * an older backup restored into a newer build still opens cleanly.
   */
  /**
   * Drop anything that is not a usable record: nulls, strings, arrays and
   * objects with no id all crash the views downstream. Duplicate ids are
   * collapsed to the first occurrence so lookups stay deterministic.
   */
  function sanitiseRecords(list) {
    if (!Array.isArray(list)) return null;
    var seen = Object.create(null);
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      if (!r || typeof r !== 'object' || Array.isArray(r)) continue;
      if (!r.id || typeof r.id !== 'string') continue;
      if (seen[r.id]) continue;
      seen[r.id] = true;
      out.push(r);
    }
    return out;
  }

  function migrate(data) {
    var base = emptyDatabase();
    if (!data || typeof data !== 'object' || Array.isArray(data)) return base;

    var out = {};
    Object.keys(base).forEach(function (key) {
      var incoming = data[key];
      if (incoming === undefined || incoming === null) { out[key] = base[key]; return; }
      if (Array.isArray(base[key])) {
        var cleaned = sanitiseRecords(incoming);
        out[key] = cleaned === null ? base[key] : cleaned;
      } else if (typeof base[key] === 'object') {
        out[key] = (incoming && typeof incoming === 'object' && !Array.isArray(incoming))
          ? Object.assign({}, base[key], incoming)
          : base[key];
      } else {
        out[key] = incoming;
      }
    });

    // Counters must stay ahead of the documents already issued, or restoring
    // an older backup starts handing out invoice numbers that already exist.
    out.counters = Object.assign({}, base.counters, out.counters);
    out.counters.invoice = highestNumber(out.invoices, out.counters.invoice);
    out.counters.quote   = highestNumber(out.quotes,   out.counters.quote);

    // A restored file must never arrive with no way to quote work.
    // A truncated file loses its tail, which is now where the regenerable
    // defaults live — so put them back rather than opening with no services.
    if (!out.services.length)   out.services = defaultServices();
    if (!out.addons.length)     out.addons = defaultAddons();
    if (!out.checklists.length) out.checklists = defaultChecklists();
    if (!out.templates.length)  out.templates = defaultTemplates();

    out.schemaVersion = SCHEMA_VERSION;
    return out;
  }

  function highestNumber(rows, current) {
    var top = Number(current) || 100;
    (rows || []).forEach(function (r) {
      var n = parseInt(r && r.number, 10);
      if (isFinite(n) && n > top) top = n;
    });
    return top;
  }

  CF.schema = {
    VERSION: SCHEMA_VERSION,
    CURRENCIES: CURRENCIES,
    FREQUENCIES: FREQUENCIES,
    CLIENT_STATUS: CLIENT_STATUS,
    JOB_STATUS: JOB_STATUS,
    QUOTE_STATUS: QUOTE_STATUS,
    PROPERTY_TYPES: PROPERTY_TYPES,
    CONDITIONS: CONDITIONS,
    EXPENSE_CATEGORIES: EXPENSE_CATEGORIES,
    PAYMENT_METHODS: PAYMENT_METHODS,
    defaultServices: defaultServices,
    defaultAddons: defaultAddons,
    defaultChecklists: defaultChecklists,
    defaultTemplates: defaultTemplates,
    defaultSettings: defaultSettings,
    defaultBusiness: defaultBusiness,
    emptyDatabase: emptyDatabase,
    migrate: migrate,
    sanitiseRecords: sanitiseRecords
  };
})(window.CF = window.CF || {});
