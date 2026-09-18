/* ==========================================================================
   CleanFlow — Smart Quote pricing

   Takes what you know about a job and suggests a price you can defend,
   then shows the working so the number never feels arbitrary. Every input
   comes from the owner's own settings — nothing is hard-coded to one
   market.
   ========================================================================== */
(function (CF) {
  'use strict';

  /** sq ft above this is included in the base price. */
  var SIZE_BASELINE = 1200;
  var SIZE_RATE_PER_100 = 6;     // added per 100 sq ft over baseline
  var BED_BASELINE = 2;
  var BATH_BASELINE = 1;
  var PER_BED = 12;
  var PER_BATH = 10;

  function settings() { return CF.store.get().settings; }

  /**
   * Tax on an amount, in whole cents.
   *
   * The rate is clamped: a mistyped "-8.25" in Settings would otherwise turn
   * every invoice into a silent discount, and nothing in the UI would say so.
   */
  function taxRate() {
    var r = Number(settings().taxRate);
    if (!isFinite(r) || r <= 0) return 0;
    return Math.min(r, 100);
  }

  function taxOn(amount) {
    if (!settings().taxEnabled) return 0;
    var base = Number(amount);
    if (!isFinite(base)) return 0;
    return Math.round(base * taxRate()) / 100;
  }

  function round(value) {
    var step = settings().roundTo || 5;
    if (step <= 1) return Math.round(value);
    return Math.round(value / step) * step;
  }

  /**
   * @param {object} input
   *   serviceId, sqft, beds, baths, condition ('light'|'normal'|'heavy'),
   *   addonIds[], override (number|null), frequency
   * @returns {object} full breakdown — nothing hidden from the UI
   */
  function calculate(input) {
    var s = settings();
    var svc = CF.store.find('services', input.serviceId) ||
              CF.q.activeServices()[0] || { basePrice: 120, estMinutes: 150, name: 'Cleaning' };

    var base = Number(svc.basePrice) || 0;

    // Size — only charged above the baseline, never a discount below it.
    var sqft = Number(input.sqft) || SIZE_BASELINE;
    var sizeAdjust = Math.round(
      Math.max(0, (sqft - SIZE_BASELINE) / 100) * SIZE_RATE_PER_100
    );

    // Rooms — beds and baths drive time more than floor area does.
    var beds = Number(input.beds) || BED_BASELINE;
    var baths = Number(input.baths) || BATH_BASELINE;
    var roomAdjust = (beds - BED_BASELINE) * PER_BED + (baths - BATH_BASELINE) * PER_BATH;

    // Condition.
    var cond = CF.schema.CONDITIONS.filter(function (c) {
      return c.id === (input.condition || 'normal');
    })[0] || { adjust: 0, label: 'Normal' };
    var conditionAdjust = cond.adjust;

    // Add-ons.
    var addonIds = input.addonIds || [];
    var addonRows = CF.store.all('addons').filter(function (a) {
      return addonIds.indexOf(a.id) !== -1;
    });
    var addonTotal = addonRows.reduce(function (a, x) { return a + (Number(x.price) || 0); }, 0);
    var addonMinutes = addonRows.reduce(function (a, x) { return a + (Number(x.minutes) || 0); }, 0);

    // Recurring work is worth a modest discount — it is guaranteed income.
    var freqDiscountPct = ({ weekly: 10, biweekly: 5 })[input.frequency] || 0;

    var subtotal = base + sizeAdjust + roomAdjust + conditionAdjust + addonTotal;
    var freqDiscount = Math.round(subtotal * (freqDiscountPct / 100));
    var suggested = round(Math.max(0, subtotal - freqDiscount));

    var hasOverride = input.override !== null &&
                      input.override !== undefined &&
                      input.override !== '' &&
                      !isNaN(Number(input.override));
    var price = hasOverride ? Math.max(0, Number(input.override)) : suggested;

    // Time estimate scales with the same signals as price.
    var baseMinutes = Number(svc.estMinutes) || 150;
    var sizeFactor = Math.max(0.7, sqft / SIZE_BASELINE);
    var condFactor = cond.id === 'heavy' ? 1.3 : cond.id === 'light' ? 0.85 : 1;
    var minutes = Math.round(baseMinutes * sizeFactor * condFactor + addonMinutes);

    // Cost: labour hours if the owner has set an hourly cost, otherwise a
    // simple ratio of price. Both are estimates and the UI says so.
    var hourlyCost = Number(s.hourlyCost) || 0;
    var cost = hourlyCost > 0
      ? Math.round((minutes / 60) * hourlyCost)
      : Math.round(price * (Number(s.costRatio) || 0.43));

    var profit = price - cost;
    var margin = price > 0 ? Math.round((profit / price) * 100) : 0;

    var tax = taxOn(price);

    return {
      serviceName: svc.name,
      base: base,
      sizeAdjust: sizeAdjust,
      roomAdjust: roomAdjust,
      conditionAdjust: conditionAdjust,
      conditionLabel: cond.label,
      addonTotal: addonTotal,
      addonRows: addonRows,
      freqDiscountPct: freqDiscountPct,
      freqDiscount: freqDiscount,
      suggested: suggested,
      price: price,
      overridden: hasOverride && price !== suggested,
      minutes: minutes,
      cost: cost,
      profit: profit,
      margin: margin,
      tax: tax,
      total: Math.round((price + tax) * 100) / 100,
      hourlyRate: minutes > 0 ? Math.round((price / (minutes / 60))) : 0
    };
  }

  /**
   * A plain-language read on whether the margin is healthy. Solo cleaners
   * routinely underprice; this is the cheapest possible guard against it.
   */
  function marginVerdict(margin) {
    if (margin >= 55) return { tone: 'ok',   text: 'Healthy margin' };
    if (margin >= 40) return { tone: 'ok',   text: 'Solid margin' };
    if (margin >= 25) return { tone: 'warn', text: 'Thin — check your time estimate' };
    return { tone: 'bad', text: 'Too thin to be worth the drive' };
  }

  /** Line items for an invoice generated from a quote or job. */
  function lineItems(calc, input) {
    var rows = [{ label: calc.serviceName, amount: calc.price - calc.addonTotal + calc.freqDiscount }];
    calc.addonRows.forEach(function (a) {
      rows.push({ label: a.name, amount: Number(a.price) || 0 });
    });
    if (calc.freqDiscount > 0) {
      rows.push({
        label: 'Recurring discount (' + calc.freqDiscountPct + '%)',
        amount: -calc.freqDiscount
      });
    }
    return rows;
  }

  CF.pricing = {
    calculate: calculate,
    marginVerdict: marginVerdict,
    taxOn: taxOn, taxRate: taxRate,
    lineItems: lineItems,
    SIZE_BASELINE: SIZE_BASELINE
  };
})(window.CF = window.CF || {});
