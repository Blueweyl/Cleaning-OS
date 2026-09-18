/* ==========================================================================
   CleanFlow — Salvage

   When stored data or a backup file will not parse, the usual cause is a
   write that was cut off part-way: the beginning is perfectly good JSON and
   only the tail is missing. "Your data is gone" is the wrong answer to that.

   Two passes, cheapest first:
     1. Trim back to the last point where the JSON balances and re-parse.
     2. Failing that, scrape whole `{...}` records out of the text and sort
        them into collections by the fields they carry.

   Everything recovered is fed through the normal schema migration, so a
   salvaged database is indistinguishable from a healthy one afterwards.
   ========================================================================== */
(function (CF) {
  'use strict';

  var MAX_INPUT = 40 * 1024 * 1024;   // refuse to chew through absurd input

  /**
   * @returns {null|{data, method, counts, partial}}
   *   null when nothing usable could be read.
   */
  function attempt(text) {
    if (typeof text !== 'string' || !text.length || text.length > MAX_INPUT) return null;

    // Trimming produces structurally sound JSON, so it is preferred — but it
    // can succeed and still recover nothing. The records live late in the
    // file, so a cut that lands before them leaves a valid object with empty
    // collections. When that happens, scraping finds what trimming dropped,
    // so both are tried and whichever rescues more records wins.
    var trimmed = trimToBalanced(text);
    var trimResult = trimmed ? finish(trimmed, 'trimmed', true) : null;
    var trimCount = trimResult ? countAll(trimResult.data) : 0;

    if (trimResult && trimCount > 0 && isWholeFile(text, trimmed)) {
      return trimResult;                       // nothing was lost; no need to scrape
    }

    var scraped = scrapeRecords(text);
    var scrapeResult = (scraped && countAll(scraped) > 0) ? finish(scraped, 'scraped', true) : null;
    var scrapeCount = scrapeResult ? countAll(scrapeResult.data) : 0;

    if (!trimCount && !scrapeCount) return null;

    // A tie goes to the trimmed copy: it keeps settings, services and
    // checklists that loose-record scraping cannot reassemble.
    if (trimCount >= scrapeCount) return trimResult;

    // Scraping found more records — but the trimmed copy may still hold the
    // business settings, so merge the two rather than discarding either.
    if (trimResult) return merge(trimResult, scrapeResult);
    return scrapeResult;
  }

  /** Did the trim keep the whole input (i.e. it was valid all along)? */
  function isWholeFile(text, parsed) {
    try { return JSON.stringify(parsed).length >= text.trim().length * 0.98; }
    catch (e) { return false; }
  }

  /** Records from the scrape, everything else from the structurally valid trim. */
  function merge(trimResult, scrapeResult) {
    var base = trimResult.data;
    var extra = scrapeResult.data;
    ['clients', 'jobs', 'invoices', 'quotes', 'expenses'].forEach(function (key) {
      var seen = Object.create(null);
      var combined = [];
      base[key].concat(extra[key]).forEach(function (r) {
        if (!r || !r.id || seen[r.id]) return;
        seen[r.id] = true;
        combined.push(r);
      });
      base[key] = combined;
    });
    return {
      data: base,
      method: 'trimmed + scraped',
      partial: true,
      counts: {
        clients: base.clients.length, jobs: base.jobs.length,
        invoices: base.invoices.length, quotes: base.quotes.length,
        expenses: base.expenses.length
      }
    };
  }

  function finish(raw, method, partial) {
    var data = raw && raw.data && raw._cleanflow ? raw.data : raw;
    var migrated = CF.schema.migrate(data);
    return {
      data: migrated,
      method: method,
      partial: partial,
      counts: {
        clients:  migrated.clients.length,
        jobs:     migrated.jobs.length,
        invoices: migrated.invoices.length,
        quotes:   migrated.quotes.length,
        expenses: migrated.expenses.length
      }
    };
  }

  function countAll(obj) {
    if (!obj) return 0;
    return ['clients', 'jobs', 'invoices', 'quotes', 'expenses'].reduce(function (a, k) {
      return a + (Array.isArray(obj[k]) ? obj[k].length : 0);
    }, 0);
  }

  /* ---- Pass 1: trim to the last balanced point ---------------------------
     Walks the text once tracking depth and string state, remembering every
     offset where the structure was closed. Then closes the open braces and
     brackets at the furthest such point and tries to parse.                */

  function trimToBalanced(text) {
    var depth = 0, inString = false, escaped = false;
    var stack = [];
    var lastComplete = -1;
    var checkpoints = [];

    for (var i = 0; i < text.length; i++) {
      var ch = text[i];

      if (inString) {
        if (escaped) { escaped = false; }
        else if (ch === '\\') { escaped = true; }
        else if (ch === '"') { inString = false; }
        continue;
      }

      if (ch === '"') { inString = true; continue; }
      if (ch === '{' || ch === '[') { stack.push(ch); depth++; continue; }
      if (ch === '}' || ch === ']') {
        stack.pop(); depth--;
        if (depth === 0) lastComplete = i;
        continue;
      }
      // A comma at shallow depth is a safe place to cut a partial array.
      if (ch === ',' && depth > 0 && depth <= 4) checkpoints.push({ at: i, stack: stack.slice() });
    }

    // The whole thing was valid after all.
    if (lastComplete === text.length - 1) {
      try { return JSON.parse(text); } catch (e) { /* fall through */ }
    }
    if (lastComplete > 0) {
      try { return JSON.parse(text.slice(0, lastComplete + 1)); } catch (e) { /* fall through */ }
    }

    // Try the latest checkpoints, newest first — that keeps the most records.
    for (var c = checkpoints.length - 1; c >= 0 && c > checkpoints.length - 400; c--) {
      var cp = checkpoints[c];
      var candidate = text.slice(0, cp.at) + closers(cp.stack);
      try {
        var parsed = JSON.parse(candidate);
        if (parsed && typeof parsed === 'object') return parsed;
      } catch (e) { /* keep walking back */ }
    }
    return null;
  }

  function closers(stack) {
    var out = '';
    for (var i = stack.length - 1; i >= 0; i--) out += stack[i] === '{' ? '}' : ']';
    return out;
  }

  /* ---- Pass 2: scrape individual records ---------------------------------
     Last resort for badly mangled text. Pulls out every balanced `{...}` that
     has an `id`, then files each one by the fields it carries.             */

  function scrapeRecords(text) {
    var found = [];
    for (var i = 0; i < text.length; i++) {
      if (text[i] !== '{') continue;
      var end = matchBrace(text, i);
      if (end === -1) continue;
      var slice = text.slice(i, end + 1);
      if (slice.length > 200000) { i = end; continue; }
      try {
        var obj = JSON.parse(slice);
        if (obj && typeof obj === 'object' && typeof obj.id === 'string') found.push(obj);
      } catch (e) { /* not a whole record */ }
      i = end;                       // never re-scan the inside of a record
      if (found.length > 100000) break;
    }
    if (!found.length) return null;

    var out = { clients: [], jobs: [], invoices: [], quotes: [], expenses: [] };
    found.forEach(function (r) {
      var bucket = classify(r);
      if (bucket) out[bucket].push(r);
    });
    return out;
  }

  function matchBrace(text, start) {
    var depth = 0, inString = false, escaped = false;
    for (var i = start; i < text.length; i++) {
      var ch = text[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') { inString = true; continue; }
      if (ch === '{') depth++;
      else if (ch === '}') { depth--; if (depth === 0) return i; }
    }
    return -1;
  }

  /** Work out what a loose record is from the fields it has. */
  function classify(r) {
    if (r.payments !== undefined || (r.lines !== undefined && r.total !== undefined)) return 'invoices';
    if (r.margin !== undefined && r.price !== undefined) return 'quotes';
    if (r.checklist !== undefined || r.serviceId !== undefined && r.date !== undefined && r.status !== undefined) return 'jobs';
    if (r.category !== undefined && r.amount !== undefined) return 'expenses';
    if (r.name !== undefined && (r.address !== undefined || r.phone !== undefined ||
        r.frequency !== undefined || r.status !== undefined)) return 'clients';
    return null;
  }

  /** Try to salvage whatever is sitting in this browser's quarantine. */
  function fromQuarantine(key) {
    var raw;
    try { raw = localStorage.getItem(key); } catch (e) { return null; }
    if (!raw) return null;
    return attempt(raw);
  }

  function quarantineKeys() {
    var keys = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf('cleanflow:corrupt:') === 0) keys.push(k);
      }
    } catch (e) { /* storage unavailable */ }
    return keys.sort().reverse();
  }

  CF.salvage = {
    attempt: attempt,
    fromQuarantine: fromQuarantine,
    quarantineKeys: quarantineKeys
  };
})(window.CF = window.CF || {});
