/* ==========================================================================
   CleanFlow — DOM helpers
   A tiny hyperscript builder. No framework, no virtual DOM: views return
   real elements and the shell swaps them in.
   ========================================================================== */
(function (CF) {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';

  /**
   * el('div.card', {onclick: fn}, [child, 'text'])
   * Tag supports `tag.class.class` and `tag#id` shorthand.
   */
  function el(spec, props, children) {
    var parts = String(spec).split(/(?=[.#])/);
    var tag = parts.shift() || 'div';
    var node = document.createElement(tag);

    parts.forEach(function (p) {
      if (p[0] === '.') node.classList.add(p.slice(1));
      else if (p[0] === '#') node.id = p.slice(1);
    });

    // Allow el(tag, children) with props omitted.
    if (Array.isArray(props) || typeof props === 'string' ||
        props instanceof Node || typeof props === 'number') {
      children = props;
      props = null;
    }

    if (props) applyProps(node, props);
    if (children !== undefined && children !== null) append(node, children);
    return node;
  }

  function applyProps(node, props) {
    Object.keys(props).forEach(function (key) {
      var val = props[key];
      if (val === null || val === undefined || val === false) return;

      if (key === 'class' || key === 'className') {
        String(val).split(/\s+/).filter(Boolean).forEach(function (c) {
          node.classList.add(c);
        });
      } else if (key === 'style' && typeof val === 'object') {
        Object.keys(val).forEach(function (k) { node.style[k] = val[k]; });
      } else if (key === 'dataset') {
        Object.keys(val).forEach(function (k) { node.dataset[k] = val[k]; });
      } else if (key.slice(0, 2) === 'on' && typeof val === 'function') {
        node.addEventListener(key.slice(2).toLowerCase(), val);
      } else if (key === 'html') {
        node.innerHTML = val;                       // only ever used with our own markup
      } else if (key === 'text') {
        node.textContent = val;
      } else if (key === 'value') {
        node.value = val;
      } else if (key === 'checked' || key === 'disabled' || key === 'selected') {
        node[key] = !!val;
      } else if (val === true) {
        node.setAttribute(key, '');
      } else {
        node.setAttribute(key, val);
      }
    });
  }

  function append(node, children) {
    if (Array.isArray(children)) {
      children.forEach(function (c) { append(node, c); });
      return;
    }
    if (children === null || children === undefined || children === false) return;
    if (children instanceof Node) { node.appendChild(children); return; }
    node.appendChild(document.createTextNode(String(children)));
  }

  /** Inline SVG icon from a path string. */
  function icon(path, size) {
    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', size || 18);
    svg.setAttribute('height', size || 18);
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    var p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', path);
    svg.appendChild(p);
    return svg;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
    return node;
  }

  function mount(host, child) {
    clear(host);
    if (child) append(host, child);
    return host;
  }

  function frag(children) {
    var f = document.createDocumentFragment();
    append(f, children);
    return f;
  }

  /** Trap Tab inside a container and restore focus when it closes. */
  function trapFocus(container) {
    var previous = document.activeElement;
    var SEL = 'a[href],button:not([disabled]),input:not([disabled]),' +
              'select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

    function onKey(e) {
      if (e.key !== 'Tab') return;
      var items = Array.prototype.filter.call(
        container.querySelectorAll(SEL),
        function (n) { return n.offsetParent !== null || n === document.activeElement; }
      );
      if (!items.length) return;
      var first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }

    container.addEventListener('keydown', onKey);

    var target = container.querySelector('[autofocus]') || container.querySelector(SEL);
    if (target) setTimeout(function () { target.focus(); }, 20);

    return function release() {
      container.removeEventListener('keydown', onKey);
      if (previous && previous.focus) { try { previous.focus(); } catch (e) {} }
    };
  }

  /** Announce a message to screen readers without moving focus. */
  var liveRegion = null;
  function announce(message) {
    if (!liveRegion) {
      liveRegion = el('div.sr-only', { role: 'status', 'aria-live': 'polite' });
      document.body.appendChild(liveRegion);
    }
    liveRegion.textContent = '';
    setTimeout(function () { liveRegion.textContent = message; }, 40);
  }

  CF.dom = {
    el: el, icon: icon, clear: clear, mount: mount, frag: frag,
    trapFocus: trapFocus, announce: announce
  };
})(window.CF = window.CF || {});
