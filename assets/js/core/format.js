/* ==========================================================================
   CleanFlow — Formatting helpers
   Currency, dates and small string utilities. Currency is driven by
   settings so a buyer outside the US sees their own symbol.
   ========================================================================== */
(function (CF) {
  'use strict';

  var DAY = 86400000;

  /* ---- Currency ------------------------------------------------------- */

  function settings() {
    return (CF.store && CF.store.get && CF.store.get().settings) || {};
  }

  /** $1,450 — no cents unless the amount actually has them. */
  function money(amount, opts) {
    var s = settings();
    // A stray Infinity (a divide-by-zero upstream) must not reach the screen
    // as "$∞" on something a client is looking at.
    var value = Number(amount);
    if (!isFinite(value)) value = 0;
    var symbol = s.currencySymbol || '$';
    var showCents = opts && opts.cents !== undefined
      ? opts.cents
      : Math.abs(value % 1) > 0.001;

    var abs = Math.abs(value);
    var body = abs.toLocaleString(s.locale || undefined, {
      minimumFractionDigits: showCents ? 2 : 0,
      maximumFractionDigits: showCents ? 2 : 0
    });

    var sign = value < 0 ? '-' : (opts && opts.signed && value > 0 ? '+' : '');
    return s.currencyAfter ? sign + body + symbol : sign + symbol + body;
  }

  /** Strip currency formatting back to a number. */
  function parseMoney(text) {
    if (typeof text === 'number') return text;
    var n = parseFloat(String(text == null ? '' : text).replace(/[^0-9.\-]/g, ''));
    return isNaN(n) ? 0 : n;
  }

  /* ---- Dates ----------------------------------------------------------
     Dates are stored as 'YYYY-MM-DD' strings — no timezone drift, which
     matters when a cleaner in another country opens their own backup.     */

  function today() { return toKey(new Date()); }

  function toKey(date) {
    var d = date instanceof Date ? date : new Date(date);
    return d.getFullYear() + '-' +
           pad(d.getMonth() + 1) + '-' +
           pad(d.getDate());
  }

  function fromKey(key) {
    if (!key) return null;
    var p = String(key).split('-');
    if (p.length < 3) return null;
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  /**
   * Is this a real calendar date we are willing to store?
   *
   * `fromKey` is forgiving by design — it feeds `new Date`, so '2026-13-45'
   * quietly becomes February 2027 and '2026-02-30' becomes March 2nd. That is
   * fine for arithmetic but wrong for a date a person typed or a restored file
   * supplied: the value must round-trip unchanged, or it is not the date it
   * claims to be. The year window keeps a mistyped '0226' out, which would
   * otherwise land in a month bucket no report will ever ask for.
   */
  function isDateKey(key) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(key || ''))) return false;
    var d = fromKey(key);
    if (!d || isNaN(d.getTime())) return false;
    if (toKey(d) !== String(key)) return false;
    var y = d.getFullYear();
    return y >= 2000 && y <= 2100;
  }

  /** A date key we can store, or the fallback when the input is not one. */
  function safeDateKey(key, fallback) {
    return isDateKey(key) ? String(key) : (fallback === undefined ? today() : fallback);
  }

  function addDays(key, days) {
    var d = fromKey(key) || new Date();
    d.setDate(d.getDate() + days);
    return toKey(d);
  }

  /**
   * Step whole calendar months, keeping the day of the month where it can.
   * Jan 31 + 1 month is Feb 28, not Mar 3 — a client booked for the last day
   * of the month should not creep into the next one.
   *
   * `anchorDay` is the day the schedule is really pinned to. Without it a
   * clamped date becomes the new anchor and the schedule ratchets earlier for
   * good: Jan 31 → Feb 28 → Mar 28 → Apr 28. Pass the original day and the
   * clamp only applies to the short months it has to.
   */
  function addMonths(key, months, anchorDay) {
    var d = fromKey(key);
    if (!d) return key;
    var day = Number(anchorDay) || d.getDate();
    var target = new Date(d.getFullYear(), d.getMonth() + months, 1);
    var lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    target.setDate(Math.min(day, lastDay));
    return toKey(target);
  }

  function daysBetween(a, b) {
    var da = fromKey(a), db = fromKey(b);
    if (!da || !db) return 0;
    return Math.round((db - da) / DAY);
  }

  /** 'Sep 24' or 'Sep 24, 2027' when it is not the current year. */
  function shortDate(key) {
    var d = fromKey(key);
    if (!d) return '';
    var opts = { month: 'short', day: 'numeric' };
    if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
    return d.toLocaleDateString(undefined, opts);
  }

  function longDate(key) {
    var d = fromKey(key);
    if (!d) return '';
    return d.toLocaleDateString(undefined, {
      weekday: 'long', month: 'long', day: 'numeric'
    });
  }

  /** 'Today', 'Tomorrow', 'Yesterday' or a short date. */
  function relativeDate(key) {
    var diff = daysBetween(today(), key);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    if (diff === -1) return 'Yesterday';
    if (diff > 1 && diff < 7) {
      var d = fromKey(key);
      return d ? d.toLocaleDateString(undefined, { weekday: 'long' }) : shortDate(key);
    }
    return shortDate(key);
  }

  /** '3 days ago', 'in 2 days', 'today'. */
  function agoPhrase(key) {
    var diff = daysBetween(key, today());
    if (diff === 0) return 'today';
    if (diff === 1) return 'yesterday';
    if (diff > 1) return diff + ' days ago';
    if (diff === -1) return 'tomorrow';
    return 'in ' + Math.abs(diff) + ' days';
  }

  /** '9:00 AM' from '09:00'. */
  function clockTime(hhmm) {
    if (!hhmm) return '';
    var p = String(hhmm).split(':');
    var h = Number(p[0]), m = Number(p[1] || 0);
    if (isNaN(h)) return hhmm;
    var suffix = h >= 12 ? 'PM' : 'AM';
    var h12 = h % 12 === 0 ? 12 : h % 12;
    return h12 + ':' + pad(m) + ' ' + suffix;
  }

  /** Job headline: 'Today 9:00 AM'. */
  function whenLabel(date, time) {
    var d = relativeDate(date);
    return time ? d + ' ' + clockTime(time) : d;
  }

  /** Seconds -> '1:04:22' or '32:14'. */
  function duration(seconds) {
    var s = Math.max(0, Math.floor(seconds || 0));
    var h = Math.floor(s / 3600);
    var m = Math.floor((s % 3600) / 60);
    var sec = s % 60;
    return h > 0 ? h + ':' + pad(m) + ':' + pad(sec) : m + ':' + pad(sec);
  }

  /** Minutes -> '2h 30m'. */
  function hoursLabel(minutes) {
    var m = Math.max(0, Math.round(minutes || 0));
    var h = Math.floor(m / 60);
    var r = m % 60;
    if (!h) return r + 'm';
    return r ? h + 'h ' + r + 'm' : h + 'h';
  }

  /* ---- Strings --------------------------------------------------------- */

  function initials(name) {
    // Skip words that start with punctuation ("&", "-") so a business like
    // "Sparkle & Shine" reads as SS rather than S&.
    return String(name || '')
      .trim().split(/\s+/)
      .map(function (w) { return (w.match(/[A-Za-z0-9]/) || [''])[0]; })
      .filter(Boolean)
      .join('').slice(0, 2).toUpperCase() || '?';
  }

  function plural(count, one, many) {
    return count + ' ' + (count === 1 ? one : (many || one + 's'));
  }

  function titleCase(s) {
    return String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);
  }

  function percent(part, whole) {
    if (!whole) return 0;
    return Math.round((part / whole) * 100);
  }

  CF.fmt = {
    money: money, parseMoney: parseMoney,
    today: today, toKey: toKey, fromKey: fromKey, addDays: addDays,
    isDateKey: isDateKey, safeDateKey: safeDateKey,
    addMonths: addMonths,
    daysBetween: daysBetween, shortDate: shortDate, longDate: longDate,
    relativeDate: relativeDate, agoPhrase: agoPhrase,
    clockTime: clockTime, whenLabel: whenLabel,
    duration: duration, hoursLabel: hoursLabel,
    initials: initials, plural: plural, titleCase: titleCase, percent: percent
  };
})(window.CF = window.CF || {});
