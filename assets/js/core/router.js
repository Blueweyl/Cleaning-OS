/* ==========================================================================
   CleanFlow — Hash router
   Hash routing (not the History API) because this file is opened straight
   from disk, where pushState paths do not resolve.
   ========================================================================== */
(function (CF) {
  'use strict';

  var handler = null;
  var current = null;

  function parse(hash) {
    var raw = String(hash || '').replace(/^#\/?/, '');
    var queryAt = raw.indexOf('?');
    var query = {};

    if (queryAt !== -1) {
      raw.slice(queryAt + 1).split('&').forEach(function (pair) {
        if (!pair) return;
        var kv = pair.split('=');
        query[decodeURIComponent(kv[0])] = decodeURIComponent((kv[1] || '').replace(/\+/g, ' '));
      });
      raw = raw.slice(0, queryAt);
    }

    var parts = raw.split('/').filter(Boolean).map(decodeURIComponent);
    return {
      section: parts[0] || 'home',
      view: parts[1] || null,
      id: parts[2] || null,
      parts: parts,
      query: query,
      path: '#/' + parts.join('/')
    };
  }

  function go(path, options) {
    var target = String(path).indexOf('#') === 0 ? path : '#/' + String(path).replace(/^\/+/, '');
    if (options && options.replace) {
      location.replace(target);
      resolve();
    } else if (location.hash === target) {
      resolve();                       // same route — force a re-render
    } else {
      location.hash = target;
    }
  }

  function back(fallback) {
    if (history.length > 1) history.back();
    else go(fallback || '#/home');
  }

  function resolve() {
    current = parse(location.hash);
    if (handler) handler(current);
  }

  function start(fn) {
    handler = fn;
    window.addEventListener('hashchange', function () {
      resolve();
      // A new screen starts at the top, like a page navigation should.
      window.scrollTo({ top: 0, behavior: 'auto' });
    });
    if (!location.hash) location.replace('#/home');
    resolve();
  }

  function get() { return current || parse(location.hash); }

  CF.router = { start: start, go: go, back: back, get: get, parse: parse, resolve: resolve };
})(window.CF = window.CF || {});
