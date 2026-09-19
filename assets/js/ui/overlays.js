/* ==========================================================================
   CleanFlow — Toasts, modals, sheets and destructive-action guards
   ========================================================================== */
(function (CF) {
  'use strict';

  var el, trapFocus, announce;
  function bind() {
    el = CF.dom.el; trapFocus = CF.dom.trapFocus; announce = CF.dom.announce;
  }

  var toastHost = null;
  var openLayers = [];

  /* ---- Toast -------------------------------------------------------------- */

  function toast(message, options) {
    bind();
    var opts = options || {};
    if (!toastHost) {
      toastHost = el('div.toast-host', { role: 'status', 'aria-live': 'polite' });
      document.body.appendChild(toastHost);
    }

    var node = el('div.toast.anim-pop', [
      el('span', message),
      opts.undo ? el('button.toast__undo', {
        type: 'button',
        onclick: function () { opts.undo(); dismiss(); }
      }, opts.undoLabel || 'Undo') : null
    ]);

    // The fill tokens, not the text ones: a toast is white text on a solid
    // colour, and in the dark theme --ok-text/--bad-text are the pale versions
    // meant for ink on a tint.
    if (opts.tone === 'bad') node.style.background = 'var(--bad-fill)';
    if (opts.tone === 'ok') node.style.background = 'var(--ok-fill)';

    toastHost.appendChild(node);
    announce(message);

    var timer = null;
    function dismiss() {
      if (timer) clearTimeout(timer);
      if (node.parentNode) node.parentNode.removeChild(node);
    }
    if (!opts.sticky) {
      timer = setTimeout(dismiss, opts.duration || (opts.undo ? 6000 : 3200));
    } else {
      node.appendChild(el('button.toast__undo', {
        type: 'button', 'aria-label': 'Dismiss', onclick: dismiss
      }, 'Dismiss'));
    }
    return dismiss;
  }

  /* ---- Overlay scaffolding ------------------------------------------------ */

  /**
   * @param {object} config
   *   build(close)  -> the panel element
   *   variant       -> '' | 'top' | 'sheet' | 'right' | 'confirm'
   *   onClose       -> callback
   *   dismissible   -> clicking the scrim / Escape closes (default true)
   */
  function overlay(config) {
    bind();
    var scrim = el('div.scrim' + (config.variant ? '.scrim--' + config.variant : ''));
    var dismissible = config.dismissible !== false;
    var release = null;
    var closed = false;

    function close(result) {
      if (closed) return;
      closed = true;
      if (release) release();
      if (scrim.parentNode) scrim.parentNode.removeChild(scrim);
      openLayers = openLayers.filter(function (l) { return l !== close; });
      if (!openLayers.length) document.body.style.overflow = '';
      document.removeEventListener('keydown', onKey);
      if (config.onClose) config.onClose(result);
    }

    function onKey(e) {
      if (e.key === 'Escape' && dismissible &&
          openLayers[openLayers.length - 1] === close) {
        e.preventDefault();
        close();
      }
    }

    var panel = config.build(close);
    panel.addEventListener('click', function (e) { e.stopPropagation(); });
    scrim.appendChild(panel);

    if (dismissible) {
      scrim.addEventListener('click', function () { close(); });
    }

    document.body.appendChild(scrim);
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);
    openLayers.push(close);
    release = trapFocus(panel);

    return close;
  }

  /* ---- Modal --------------------------------------------------------------- */

  function modal(config) {
    bind();
    return overlay({
      variant: config.variant || '',
      dismissible: config.dismissible,
      onClose: config.onClose,
      build: function (close) {
        var body = typeof config.body === 'function' ? config.body(close) : config.body;
        var panel = el('div.modal.anim-pop' + (config.size ? '.modal--' + config.size : ''), {
          role: 'dialog', 'aria-modal': 'true', 'aria-label': config.title || 'Dialog'
        }, [
          config.title ? el('h2.modal__title', config.title) : null,
          config.sub ? el('p.modal__sub', config.sub) : null,
          el('div.modal__body', body),
          config.actions ? el('div.modal__foot', config.actions(close)) : null
        ]);
        return panel;
      }
    });
  }

  /* ---- Bottom sheet --------------------------------------------------------- */

  function sheet(config) {
    bind();
    return overlay({
      variant: 'sheet',
      onClose: config.onClose,
      build: function (close) {
        return el('div.sheet.anim-slide-up', {
          role: 'dialog', 'aria-modal': 'true', 'aria-label': config.title || 'Menu'
        }, [
          el('div.sheet__grip', { 'aria-hidden': 'true' }),
          config.title ? el('h2.sheet__title', config.title) : null,
          (config.items || []).map(function (item) {
            return el('button.sheet__item', {
              type: 'button',
              onclick: function () { close(); if (item.onSelect) item.onSelect(); }
            }, [
              el('span.sheet__icon', { 'aria-hidden': 'true' }, item.icon || '•'),
              el('span.sheet__label', item.label)
            ]);
          }),
          config.footer || null
        ]);
      }
    });
  }

  /* ---- Right drawer ---------------------------------------------------------- */

  function drawer(config) {
    bind();
    return overlay({
      variant: 'right',
      onClose: config.onClose,
      build: function (close) {
        // Named by the heading people can actually see, so the two can never
        // drift apart.
        var titleId = 'drawer-title-' + Math.random().toString(36).slice(2, 7);
        return el('div.drawer.anim-slide-left', {
          role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId
        }, [
          el('div.drawer__head', [
            el('h2.drawer__title', { id: titleId }, config.title || 'Panel'),
            el('button.iconbtn', {
              type: 'button', 'aria-label': 'Close', onclick: function () { close(); }
            }, '✕')
          ]),
          typeof config.body === 'function' ? config.body(close) : config.body
        ]);
      }
    });
  }

  /* ---- Destructive-action guard -----------------------------------------------
     Nothing irreversible happens without this. `danger: true` is reserved
     for actions that genuinely cannot be undone.                              */

  function confirm(config) {
    bind();
    return new Promise(function (resolve) {
      // The answer is recorded before the overlay closes. `close()` fires
      // onClose synchronously, and a promise keeps its first resolution — so
      // resolving inside the click handler would always lose to the default
      // `false` and every destructive action would silently do nothing.
      var answer = false;

      modal({
        size: 'sm',
        variant: 'confirm',
        title: config.title || 'Are you sure?',
        body: el('p', { style: { fontSize: '13.5px', color: 'var(--text-muted)', lineHeight: '1.6', margin: 0 } },
                 config.message || ''),
        actions: function (close) {
          return [
            el('button.btn.btn--secondary', {
              type: 'button',
              onclick: function () { answer = false; close(); }
            }, config.cancelLabel || 'Cancel'),
            el('button.btn' + (config.danger ? '.btn--danger' : '.btn--primary'), {
              type: 'button', autofocus: true,
              onclick: function () { answer = true; close(); }
            }, config.confirmLabel || 'Confirm')
          ];
        },
        // Escape, the scrim and Cancel all leave `answer` false, so dismissing
        // a confirmation can never be mistaken for agreeing to it.
        onClose: function () { resolve(answer); }
      });
    });
  }

  /** Copy to clipboard with a graceful fallback for file:// and old Safari. */
  function copy(text, label) {
    function done() { toast((label || 'Copied') + ' to clipboard'); }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(legacy);
    } else {
      legacy();
    }

    function legacy() {
      try {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.cssText = 'position:absolute;left:-9999px;top:0;';
        document.body.appendChild(ta);
        ta.select();
        var ok = document.execCommand('copy');
        document.body.removeChild(ta);
        if (ok) { done(); return; }
      } catch (e) { /* fall through */ }
      showCopyFallback(text, label);
    }
  }

  /** If the browser refuses, show the text so it can be copied by hand. */
  function showCopyFallback(text, label) {
    modal({
      size: 'md',
      title: label || 'Copy this message',
      sub: 'Your browser blocked automatic copying — select the text below.',
      body: el('textarea.textarea', {
        readonly: true, rows: 6, autofocus: true,
        onclick: function (e) { e.target.select(); }
      }, text),
      actions: function (close) {
        return [el('button.btn.btn--primary', { type: 'button', onclick: function () { close(); } }, 'Done')];
      }
    });
  }

  CF.ui = CF.ui || {};
  CF.ui.toast = toast;
  CF.ui.modal = modal;
  CF.ui.sheet = sheet;
  CF.ui.drawer = drawer;
  CF.ui.confirm = confirm;
  CF.ui.copy = copy;
  CF.ui.overlay = overlay;
})(window.CF = window.CF || {});
