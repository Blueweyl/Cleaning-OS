/* ==========================================================================
   CleanFlow — Reusable UI pieces
   Field, segmented control, badge, empty state, page header. Views compose
   these rather than hand-rolling markup, which is what keeps every screen
   looking like the same product.
   ========================================================================== */
(function (CF) {
  'use strict';

  function el() { return CF.dom.el.apply(null, arguments); }

  var seq = 0;
  function nextId(prefix) { return (prefix || 'f') + '-' + (++seq); }

  /* ---- Fields --------------------------------------------------------------- */

  /**
   * field({ label, value, onInput, type, placeholder, hint, error, required })
   * Returns { node, input, setError }.
   */
  function field(config) {
    var id = config.id || nextId('field');
    var errorId = id + '-error';
    var hintId = id + '-hint';

    var tag = config.multiline ? 'textarea.textarea' : (config.type === 'select' ? 'select.select' : 'input.input');
    var props = {
      id: id,
      value: config.value === null || config.value === undefined ? '' : config.value,
      placeholder: config.placeholder || null,
      'aria-describedby': [config.hint ? hintId : null, config.error ? errorId : null]
        .filter(Boolean).join(' ') || null
    };

    // A placeholder is not a label: it disappears the moment someone types and
    // screen readers are not obliged to announce it. A field with no visible
    // label needs a real accessible name.
    if (config.ariaLabel) props['aria-label'] = config.ariaLabel;

    if (!config.multiline && config.type !== 'select') props.type = config.type || 'text';
    if (config.inputmode) props.inputmode = config.inputmode;
    if (config.min !== undefined) props.min = config.min;
    if (config.max !== undefined) props.max = config.max;
    if (config.step !== undefined) props.step = config.step;
    if (config.rows) props.rows = config.rows;
    if (config.autofocus) props.autofocus = true;
    if (config.required) props.required = true;
    if (config.disabled) props.disabled = true;
    if (config.sunken) props.class = 'input--sunken';

    // Validate on blur, not on keystroke — nobody likes being shouted at
    // halfway through typing their own name.
    if (config.onInput) props.oninput = function (e) { config.onInput(e.target.value, e); };
    if (config.onChange) props.onchange = function (e) { config.onChange(e.target.value, e); };
    if (config.onBlur) props.onblur = function (e) { config.onBlur(e.target.value, e); };

    var input = el(tag, props, config.type === 'select'
      ? (config.options || []).map(function (o) {
          return el('option', {
            value: o.value,
            selected: String(o.value) === String(config.value)
          }, o.label);
        })
      : (config.multiline ? String(props.value) : null));

    if (config.multiline) input.value = props.value;

    var errorNode = el('div.field__error', { id: errorId, role: 'alert' }, config.error || '');
    errorNode.style.display = config.error ? '' : 'none';

    var node = el('div.field', [
      config.label ? el('label.field__label', { for: id }, [
        config.label,
        config.required ? el('span', { 'aria-hidden': 'true',
          style: { color: 'var(--bad-text)', marginLeft: '3px' } }, '*') : null
      ]) : null,
      config.prefix
        ? el('div.input-group', [el('span.input-group__prefix', config.prefix), input])
        : input,
      config.hint ? el('div.field__hint', { id: hintId }, config.hint) : null,
      errorNode
    ]);

    function setError(message) {
      errorNode.textContent = message || '';
      errorNode.style.display = message ? '' : 'none';
      input.setAttribute('aria-invalid', message ? 'true' : 'false');
      if (message) input.setAttribute('aria-describedby', errorId);
    }

    return { node: node, input: input, setError: setError, id: id };
  }

  /* ---- Segmented control ------------------------------------------------------ */

  /**
   * segmented({ options: [{value,label}], value, onChange, fill, outline, label })
   */
  function segmented(config) {
    var group = el('div.seg' +
      (config.fill ? '.seg--fill' : '') +
      (config.outline ? '.seg--outline' : '') +
      (config.scroll ? '.scroll-x' : ''), {
      role: 'group',
      'aria-label': config.label || 'Options'
    });

    (config.options || []).forEach(function (opt) {
      var on = String(opt.value) === String(config.value);
      group.appendChild(el('button.seg__item', {
        type: 'button',
        'aria-pressed': on ? 'true' : 'false',
        onclick: function () { if (config.onChange) config.onChange(opt.value); }
      }, opt.label));
    });

    return group;
  }

  /** Tab bar — same control, different role semantics. */
  function tabs(config) {
    var bar = el('div.tabs.scroll-x', { role: 'tablist', 'aria-label': config.label || 'Views' });
    (config.options || []).forEach(function (opt) {
      var on = String(opt.value) === String(config.value);
      bar.appendChild(el('button.seg__item', {
        type: 'button', role: 'tab',
        'aria-selected': on ? 'true' : 'false',
        'aria-pressed': on ? 'true' : 'false',
        onclick: function () { if (config.onChange) config.onChange(opt.value); }
      }, opt.count !== undefined && opt.count !== null
          ? opt.label + ' (' + opt.count + ')'
          : opt.label));
    });
    return bar;
  }

  /* ---- Checkbox row ------------------------------------------------------------ */

  function checkRow(config) {
    return el('button.checkrow', {
      type: 'button',
      'aria-pressed': config.checked ? 'true' : 'false',
      onclick: config.onToggle
    }, [
      el('span.checkrow__box', { 'aria-hidden': 'true' }, config.checked ? '✓' : ''),
      el('span.checkrow__label', config.label),
      config.meta ? el('span.checkrow__price', config.meta) : null
    ]);
  }

  /* ---- Badge -------------------------------------------------------------------- */

  function badge(label, tone, large) {
    return el('span.badge.badge--' + (tone || 'neutral') + (large ? '.badge--lg' : ''), label);
  }

  function statusBadge(status, large) {
    if (!status) return null;
    return badge(status.label, status.tone, large);
  }

  /* ---- Empty state --------------------------------------------------------------- */

  function empty(config) {
    return el('div.empty', [
      el('h3.empty__title' + (config.small ? '.empty__title--sm' : ''), config.title),
      config.body ? el('p.empty__body', config.body) : null,
      config.action ? el('button.btn.btn--primary', {
        type: 'button', onclick: config.action.onClick
      }, config.action.label) : null
    ]);
  }

  function emptySoft(text) {
    return el('div.empty--soft', text);
  }

  function loading(text) {
    return el('div.loading', [
      el('div.spinner', { 'aria-hidden': 'true' }),
      el('span', text || 'Loading…')
    ]);
  }

  /* ---- Page header ----------------------------------------------------------------- */

  function pageHeader(config) {
    return el('div.row.between.row-4.row-wrap.mb-5', [
      el('div', [
        el('h1.h-page', config.title),
        config.sub ? el('div.sub', config.sub) : null
      ]),
      config.actions ? el('div.row.row-3.row-wrap', config.actions) : null
    ]);
  }

  function sectionHeader(title, action) {
    return el('div.row.between.row-3.mb-3', [
      el('h2.h-section', title),
      action || null
    ]);
  }

  function backLink(label, onClick) {
    return el('button.back-link', { type: 'button', onclick: onClick },
      ['← ', label]);
  }

  /* ---- Stat tiles -------------------------------------------------------------------- */

  function kpi(label, value, tone) {
    return el('div.kpi', [
      el('div.kpi__label', label),
      el('div.kpi__value' + (tone === 'warn' ? '.kpi__value--warn' : ''), value)
    ]);
  }

  function stat(config) {
    return el('div.stat' + (config.tone ? '.stat--' + config.tone : ''), [
      el('div.stat__label', config.label),
      el('div.stat__value', config.value),
      config.note ? el('div.stat__note', config.note) : null
    ]);
  }

  /* ---- Misc --------------------------------------------------------------------------- */

  function avatar(name, large) {
    return el('div.avatar' + (large ? '.avatar--lg' : ''), { 'aria-hidden': 'true' },
      CF.fmt.initials(name));
  }

  function progress(percent) {
    return el('div.progress', {
      role: 'progressbar', 'aria-valuenow': percent,
      'aria-valuemin': '0', 'aria-valuemax': '100'
    }, [el('div.progress__bar', { style: { width: percent + '%' } })]);
  }

  function defRow(label, value, isTotal) {
    return el('div.defrow' + (isTotal ? '.defrow--total' : ''), [
      el('span', label),
      el('span' + (isTotal ? '' : '.defrow__value'), value)
    ]);
  }

  /** The amber access/pets/parking panel a cleaner reads on the doorstep. */
  function accessNote(text) {
    if (!text) return null;
    return el('div.callout.callout--warn', [
      el('div.callout__title', '⚠ ACCESS, PETS & PARKING'),
      el('div.callout__body', text)
    ]);
  }

  CF.ui = CF.ui || {};
  Object.assign(CF.ui, {
    field: field, segmented: segmented, tabs: tabs, checkRow: checkRow,
    badge: badge, statusBadge: statusBadge,
    empty: empty, emptySoft: emptySoft, loading: loading,
    pageHeader: pageHeader, sectionHeader: sectionHeader, backLink: backLink,
    kpi: kpi, stat: stat, avatar: avatar, progress: progress,
    defRow: defRow, accessNote: accessNote
  });
})(window.CF = window.CF || {});
