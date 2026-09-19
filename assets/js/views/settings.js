/* ==========================================================================
   Settings — business details, services, pricing, and the data you own

   The Backup & Data block is the most important thing in this panel. There
   is no cloud copy, so this is where the product is honest about that and
   makes exporting a one-tap habit.
   ========================================================================== */
(function (CF) {
  'use strict';

  function el() { return CF.dom.el.apply(null, arguments); }

  function open() {
    CF.ui.drawer({
      title: 'Settings',
      body: function (close) { return panel(close); }
    });
  }

  function panel(close) {
    var host = el('div.stack.stack-6');
    paint();
    return host;

    function paint() {
      CF.dom.clear(host);
      var db = CF.store.get();
      var F = CF.fmt, U = CF.ui;

      /* ---- Demo notice ---- */
      if (db.settings.demoMode) {
        host.appendChild(el('div.callout.callout--warn', [
          el('div.callout__title', '🧪 You\'re in the demo'),
          el('div.callout__body',
            'This is sample data for Sparkle & Shine. Starting your own business clears it.'),
          el('button.btn.btn--primary.btn--block.btn--sm.mt-3', {
            type: 'button', onclick: function () { startReal(close); }
          }, 'Start My Business')
        ]));
      }

      /* ---- Business ---- */
      host.appendChild(group('Business', [
        row('Business name', db.business.name || 'Not set', function () {
          editText('Business name', db.business.name, function (v) {
            CF.store.commit('Edit business', function (d) { d.business.name = v; });
          });
        }),
        row('Your name', db.business.owner || 'Not set', function () {
          editText('Your name', db.business.owner, function (v) {
            CF.store.commit('Edit business', function (d) { d.business.owner = v; });
          });
        }),
        row('Phone', db.business.phone || 'Not set', function () {
          editText('Phone', db.business.phone, function (v) {
            CF.store.commit('Edit business', function (d) { d.business.phone = v; });
          });
        }),
        row('Email', db.business.email || 'Not set', function () {
          editText('Email', db.business.email, function (v) {
            CF.store.commit('Edit business', function (d) { d.business.email = v; });
          });
        }),
        row('Service area', db.business.serviceArea || 'Not set', function () {
          editText('Service area', db.business.serviceArea, function (v) {
            CF.store.commit('Edit business', function (d) { d.business.serviceArea = v; });
          });
        })
      ]));

      /* ---- Appearance ---- */
      host.appendChild(group('Appearance', [themeRow()]));

      /* ---- Money settings ---- */
      var currency = CF.schema.CURRENCIES.filter(function (c) {
        return c.code === db.settings.currency;
      })[0] || CF.schema.CURRENCIES[0];

      host.appendChild(group('Money', [
        row('Currency', currency.label + ' (' + currency.symbol.trim() + ')', editCurrency),
        // A rate outside 0-100 cannot be typed in, but a restored or edited file
        // can carry one. Billing caps it at 100%, so showing a bare "450%" here
        // tells the owner they are charging something they are not.
        row('Tax', db.settings.taxEnabled
          ? db.settings.taxLabel + ' ' + db.settings.taxRate + '%' +
            (validRate(db.settings.taxRate) ? '' : ' — not valid, tap to fix')
          : 'Off', editTax),
        row('Invoice terms', F.plural(db.settings.invoiceTermsDays, 'day'), function () {
          editNumber('Invoice terms (days)', db.settings.invoiceTermsDays, function (v) {
            CF.store.commit('Edit terms', function (d) { d.settings.invoiceTermsDays = v; });
          });
        }),
        row('Your hourly cost', F.money(db.settings.hourlyCost), function () {
          editNumber('Your hourly cost', db.settings.hourlyCost, function (v) {
            CF.store.commit('Edit cost', function (d) { d.settings.hourlyCost = v; });
          }, 'Used to estimate profit on quotes. Include your time, supplies and travel.');
        }),
        row('Round prices to', F.money(db.settings.roundTo), function () {
          editNumber('Round prices to nearest', db.settings.roundTo, function (v) {
            CF.store.commit('Edit rounding', function (d) { d.settings.roundTo = Math.max(1, v); });
          });
        })
      ]));

      /* ---- Services ---- */
      host.appendChild(group('Services & Pricing',
        CF.store.all('services').map(function (s) {
          return row(
            s.name + (s.active === false ? ' (off)' : ''),
            F.money(s.basePrice),
            function () { editService(s); }
          );
        }).concat([
          el('button.btn.btn--secondary.btn--block.btn--sm', {
            type: 'button', onclick: addService
          }, '+ Add a service')
        ])
      ));

      /* ---- Add-ons ---- */
      host.appendChild(group('Add-ons',
        CF.store.all('addons').map(function (a) {
          return row(a.name, '+' + F.money(a.price), function () { editAddon(a); });
        }).concat([
          el('button.btn.btn--secondary.btn--block.btn--sm', {
            type: 'button', onclick: addAddon
          }, '+ Add an add-on')
        ])
      ));

      /* ---- Checklists ---- */
      host.appendChild(group('Cleaning Checklists',
        CF.store.all('checklists').map(function (c) {
          return row(c.name, F.plural(c.items.length, 'step'), function () { editChecklist(c); });
        })
      ));

      /* ---- Follow-up timing ---- */
      host.appendChild(group('Follow-up timing', [
        row('Nudge quotes after', F.plural(db.settings.quoteFollowUpDays, 'day'), function () {
          editNumber('Nudge unanswered quotes after (days)', db.settings.quoteFollowUpDays,
            function (v) {
              CF.store.commit('Edit timing', function (d) { d.settings.quoteFollowUpDays = v; });
            });
        }),
        row('Rebook grace period', F.plural(db.settings.rebookGraceDays, 'day'), function () {
          editNumber('Days past due before "ready to rebook"', db.settings.rebookGraceDays,
            function (v) {
              CF.store.commit('Edit timing', function (d) { d.settings.rebookGraceDays = v; });
            });
        }),
        row('Referral offer', db.settings.referralOffer || 'Not set', function () {
          editText('Referral thank-you offer', db.settings.referralOffer, function (v) {
            CF.store.commit('Edit offer', function (d) { d.settings.referralOffer = v; });
          }, 'e.g. $20 — used in your referral message template.');
        })
      ]));

      /* ---- Backup & data ---- */
      host.appendChild(backupSection());

      /* ---- Danger zone ---- */
      host.appendChild(dangerZone());

      host.appendChild(el('p.meta.center', 'CleanFlow · runs entirely on this device'));
    }

    /* ---- building blocks ------------------------------------------------- */

    /**
     * Theme picker. A segmented control rather than a row-and-modal because
     * it is the one setting where you want to see the result the instant you
     * touch it — the whole screen is the preview.
     */
    function themeRow() {
      var host = el('div.seg.seg--outline', {
        role: 'group', 'aria-label': 'Appearance'
      });
      var options = [
        { value: 'system', label: 'System' },
        { value: 'light',  label: 'Light' },
        { value: 'dark',   label: 'Dark' }
      ];

      function paint() {
        var picked = CF.theme.choice();
        CF.dom.clear(host);
        options.forEach(function (o) {
          host.appendChild(el('button.seg__item', {
            type: 'button',
            // Sized by its own label rather than forced to a third of the
            // drawer: at 360px an equal split clipped "System" to "Syst…".
            style: { flex: '1 1 auto', minWidth: 'max-content' },
            'aria-pressed': picked === o.value ? 'true' : 'false',
            onclick: function () {
              CF.theme.set(o.value);
              paint();
              // Repaint the app behind the drawer so every screen is already
              // in the new theme when this closes.
              CF.shell.repaint();
            }
          }, o.label));
        });
      }
      paint();

      return el('div.stack.stack-2', [
        host,
        el('div.meta',
          'System follows your phone or computer. Printed invoices and quotes ' +
          'always come out on white paper.')
      ]);
    }

    function group(title, rows) {
      return el('div', [
        el('div.eyebrow.mb-3', title),
        el('div.stack.stack-2', rows)
      ]);
    }

    function row(label, value, onClick) {
      return el(onClick ? 'button' : 'div', {
        type: onClick ? 'button' : null,
        class: 'row between',
        style: {
          padding: '13px 14px', background: 'var(--surface-sunken)',
          border: '1px solid var(--border-soft)', borderRadius: 'var(--r-md)',
          cursor: onClick ? 'pointer' : 'default', width: '100%',
          font: 'inherit', color: 'inherit', textAlign: 'left', gap: '12px'
        },
        onclick: onClick || null
      }, [
        el('span', { style: { fontSize: '13.5px', fontWeight: '600' } }, label),
        el('span', { style: { fontSize: '13px', color: 'var(--text-faint)' } }, value)
      ]);
    }

    function backupSection() {
      var db = CF.store.get();
      var storage = CF.storage.describe();
      var overdue = CF.backup.backupOverdue();

      return el('div', [
        el('div.eyebrow.mb-3', 'Backup & Data'),

        el('div.callout.callout--info.mb-3',
          '🔒 Stored on this device only — CleanFlow never syncs to the cloud. ' +
          'Export backups to protect or move your data.'),

        storage.warning
          ? el('div.callout.callout--bad.mb-3', storage.warning)
          : null,

        storage.mirrorNote
          ? el('div.callout.callout--warn.mb-3', storage.mirrorNote)
          : null,

        overdue ? el('div.callout.callout--warn.mb-3',
          CF.backup.daysSinceBackup() === null
            ? 'You have never backed up. It takes one tap and one file.'
            : 'It has been ' + CF.fmt.plural(CF.backup.daysSinceBackup(), 'day') +
              ' since your last backup.') : null,

        el('div.stack.stack-2.mb-3', [
          row('Where your data lives', storage.label),
          row('Last backup', CF.backup.lastBackupLabel())
        ]),

        el('div.row.row-2.mb-3', [
          el('button.btn.btn--primary', {
            type: 'button', style: { flex: '1' },
            onclick: function () {
              var name = CF.backup.exportBackup();
              CF.ui.toast('Backup saved: ' + name);
              paint();
            }
          }, 'Back Up Now'),
          el('button.btn.btn--secondary', {
            type: 'button', style: { flex: '1' },
            onclick: function () { CF.shell.pickBackupFile(function () { close(); }); }
          }, 'Restore')
        ]),

        vaultSection(),

        el('div.field__label', 'Export a spreadsheet'),
        el('div.row.row-2.row-wrap', ['clients', 'jobs', 'invoices', 'quotes', 'expenses', 'payments']
          .map(function (kind) {
            return el('button.btn.btn--secondary.btn--sm', {
              type: 'button',
              onclick: function () {
                var name = CF.backup.exportCsv(kind);
                CF.ui.toast(name ? 'Exported ' + name : 'Nothing to export');
              }
            }, CF.fmt.titleCase(kind));
          }))
      ]);
    }

    /**
     * The one backup that outlives the browser. Hidden entirely where the
     * File System Access API is missing, so nobody is shown a dead button.
     */
    function vaultSection() {
      if (!CF.vault || !CF.vault.supported()) {
        return el('div.callout.callout--info.mb-3',
          '💡 Tip: keep your exported backups in a cloud-synced folder ' +
          '(Dropbox, iCloud, OneDrive). That copy survives even if this ' +
          'browser\'s data is cleared.');
      }

      var host = el('div.mb-3');
      paintVault();
      return host;

      function paintVault() {
        CF.vault.status().then(function (st) {
          CF.dom.clear(host);

          if (!st.configured) {
            host.appendChild(el('div.callout.callout--info', [
              el('div.callout__title', '📁 Auto-Backup Folder'),
              el('div', { style: { fontSize: '12.5px', lineHeight: '1.6' } },
                'Pick a folder once — ideally one that syncs to the cloud — and ' +
                'CleanFlow keeps a fresh backup in it automatically. This is the ' +
                'only copy that survives clearing your browser data.'),
              el('button.btn.btn--primary.btn--block.btn--sm.mt-3', {
                type: 'button', onclick: pick
              }, 'Choose a Folder')
            ]));
            return;
          }

          var needsPermission = st.permission !== 'granted';
          host.appendChild(el('div.callout.callout--' + (needsPermission ? 'warn' : 'ok'), [
            el('div.callout__title', '📁 Auto-Backup Folder'),
            el('div', { style: { fontSize: '12.5px', lineHeight: '1.6' } },
              needsPermission
                ? 'Saving to "' + st.folderName + '" is paused — your browser needs ' +
                  'you to allow access again.'
                : 'Backing up to "' + st.folderName + '"' +
                  (st.lastWrite ? ' · last copy ' + CF.fmt.agoPhrase(CF.fmt.toKey(new Date(st.lastWrite))) : '')),
            el('div.row.row-2.mt-3', [
              el('button.btn.btn--primary.btn--sm', {
                type: 'button', style: { flex: '1' },
                onclick: function () {
                  CF.vault.write(true).then(function () {
                    CF.ui.toast('Saved a copy to ' + st.folderName);
                    paintVault();
                  }).catch(function () {
                    CF.ui.toast('Could not write to that folder', { tone: 'bad' });
                    paintVault();
                  });
                }
              }, needsPermission ? 'Reconnect' : 'Save Now'),
              el('button.btn.btn--secondary.btn--sm', {
                type: 'button',
                onclick: function () {
                  CF.vault.forget().then(function () {
                    CF.ui.toast('Folder backup turned off');
                    paintVault();
                  });
                }
              }, 'Turn Off')
            ])
          ]));
        }).catch(function () { CF.dom.clear(host); });
      }

      function pick() {
        CF.vault.choose().then(function () {
          CF.ui.toast('Folder backup is on — a copy is saved there automatically');
          paintVault();
        }).catch(function (err) {
          if (err && (err.name === 'AbortError' || err.name === 'NotAllowedError')) return;
          CF.ui.toast('Could not set up that folder', { tone: 'bad' });
        });
      }
    }

    function dangerZone() {
      var db = CF.store.get();
      return el('div', [
        el('div.eyebrow.mb-3', { style: { color: 'var(--bad-text)' } }, 'Danger Zone'),
        el('div.stack.stack-2', [
          el('button.btn.btn--secondary.btn--block', {
            type: 'button', onclick: function () { loadDemo(close); }
          }, db.settings.demoMode ? 'Reset demo data' : 'Load demo data'),
          el('button.btn.btn--secondary.btn--block', {
            type: 'button',
            style: { color: 'var(--bad-text)', borderColor: '#F0D4D2' },
            onclick: function () { eraseEverything(close); }
          }, 'Erase everything and start over')
        ]),
        el('p.meta.mt-2', db.settings.demoMode
          ? 'Resetting puts the sample data back and keeps anything you added yourself. ' +
            'Erasing clears everything. Export a backup first if you might want it back.'
          : 'Both of these replace all current data. Export a backup first if you might want it back.')
      ]);
    }

    /* ---- editors ---------------------------------------------------------- */

    function editText(label, value, onSave, hint) {
      var next = value || '';
      CF.ui.modal({
        size: 'sm', title: label,
        body: function () {
          return CF.ui.field({
            label: null, value: next, autofocus: true, hint: hint,
            onInput: function (v) { next = v; }
          }).node;
        },
        actions: function (closeModal) {
          return [
            el('button.btn.btn--secondary', { type: 'button', onclick: function () { closeModal(); } }, 'Cancel'),
            el('button.btn.btn--primary', {
              type: 'button',
              onclick: function () { onSave(next.trim()); closeModal(); paint(); CF.shell.repaint(); }
            }, 'Save')
          ];
        }
      });
    }

    /**
     * A price or duration typed into a service or add-on.
     *
     * These fields used `Number(v) || 0`, which lets a negative through
     * unchanged and turns 1e999 into Infinity. A service saved that way booked
     * every later job at a negative or infinite price.
     */
    function validRate(v) {
      var n = Number(v);
      return isFinite(n) && n >= 0 && n <= 100;
    }

    function positiveNumber(v, cap) {
      var n = Number(v);
      if (!isFinite(n) || n < 0) return 0;
      return Math.min(n, cap);
    }

    function editNumber(label, value, onSave, hint) {
      var next = value;
      CF.ui.modal({
        size: 'sm', title: label,
        body: function () {
          return CF.ui.field({
            label: null, value: next, type: 'number', inputmode: 'decimal',
            autofocus: true, hint: hint,
            onInput: function (v) { next = v; }
          }).node;
        },
        actions: function (closeModal) {
          return [
            el('button.btn.btn--secondary', { type: 'button', onclick: function () { closeModal(); } }, 'Cancel'),
            el('button.btn.btn--primary', {
              type: 'button',
              onclick: function () {
                var n = Number(next);
                if (isNaN(n) || n < 0) { CF.ui.toast('Enter a number', { tone: 'bad' }); return; }
                onSave(n); closeModal(); paint(); CF.shell.repaint();
              }
            }, 'Save')
          ];
        }
      });
    }

    function editCurrency() {
      var code = CF.store.get().settings.currency;
      CF.ui.modal({
        size: 'sm', title: 'Currency',
        sub: 'Changes how every amount is displayed. It does not convert existing numbers.',
        body: function () {
          return CF.ui.field({
            label: null, type: 'select', value: code, autofocus: true,
            options: CF.schema.CURRENCIES.map(function (c) {
              return { value: c.code, label: c.label + ' (' + c.symbol.trim() + ')' };
            }),
            onChange: function (v) { code = v; }
          }).node;
        },
        actions: function (closeModal) {
          return [
            el('button.btn.btn--secondary', { type: 'button', onclick: function () { closeModal(); } }, 'Cancel'),
            el('button.btn.btn--primary', {
              type: 'button',
              onclick: function () {
                var c = CF.schema.CURRENCIES.filter(function (x) { return x.code === code; })[0];
                CF.store.commit('Change currency', function (d) {
                  d.settings.currency = c.code;
                  d.settings.currencySymbol = c.symbol;
                });
                closeModal(); paint(); CF.shell.repaint();
              }
            }, 'Save')
          ];
        }
      });
    }

    function editTax() {
      var s = CF.store.get().settings;
      var next = { enabled: s.taxEnabled, rate: s.taxRate, label: s.taxLabel };
      // Starting this true meant that opening the editor on a rate a restored
      // file had left out of range and pressing Save committed it again,
      // unchanged and unquestioned. It reflects the value on screen from the
      // outset, so Save is refused until the rate is actually valid.
      var rateValid = validRate(s.taxRate);
      // Declared out here because the Save handler lives in a sibling closure
      // and has to be able to re-show the error.
      var rateField = null;
      CF.ui.modal({
        size: 'sm', title: 'Tax',
        sub: 'Applied to new invoices. Existing invoices keep the tax they were raised with.',
        body: function () {
          rateField = CF.ui.field({
            label: 'Rate (%)', value: next.rate, type: 'number', inputmode: 'decimal',
            min: 0, max: 100,
            hint: 'A percentage, e.g. 8.25 — not the amount.',
            onInput: function (v) {
              var n = Number(v);
              // A stray minus sign here would quietly discount every invoice.
              if (v !== '' && (!isFinite(n) || n < 0 || n > 100)) {
                rateField.setError('Enter a rate between 0 and 100.');
                // Keep the last good rate. Falling back to 0 meant that typing
                // 150, reading the error and saving anyway charged no tax from
                // then on — the opposite of what was asked for, with nothing
                // said. Save is blocked instead, so the number cannot be lost.
                rateValid = false;
                return;
              }
              rateField.setError('');
              rateValid = true;
              next.rate = isFinite(n) ? n : 0;
            }
          });
          var labelField = CF.ui.field({
            label: 'What do you call it?', value: next.label,
            placeholder: 'Tax, VAT, GST…',
            onInput: function (v) { next.label = v; }
          });
          var toggle = CF.ui.checkRow({
            label: 'Charge tax on invoices', checked: next.enabled,
            onToggle: function () {
              next.enabled = !next.enabled;
              toggle.setAttribute('aria-pressed', next.enabled ? 'true' : 'false');
              toggle.querySelector('.checkrow__box').textContent = next.enabled ? '✓' : '';
            }
          });
          if (!rateValid) rateField.setError('Enter a rate between 0 and 100.');
          return el('div.stack.stack-4', [toggle, rateField.node, labelField.node]);
        },
        actions: function (closeModal) {
          return [
            el('button.btn.btn--secondary', { type: 'button', onclick: function () { closeModal(); } }, 'Cancel'),
            el('button.btn.btn--primary', {
              type: 'button',
              onclick: function () {
                if (!rateValid) {
                  if (rateField) rateField.setError('Enter a rate between 0 and 100.');
                  CF.ui.toast('Fix the tax rate before saving', { tone: 'bad' });
                  return;
                }
                CF.store.commit('Edit tax', function (d) {
                  d.settings.taxEnabled = next.enabled;
                  d.settings.taxRate = next.rate;
                  d.settings.taxLabel = next.label || 'Tax';
                });
                closeModal(); paint(); CF.shell.repaint();
              }
            }, 'Save')
          ];
        }
      });
    }

    function editService(s) {
      var next = { name: s.name, basePrice: s.basePrice, estMinutes: s.estMinutes,
                   active: s.active !== false, checklistId: s.checklistId };
      CF.ui.modal({
        size: 'sm', title: 'Edit service',
        body: function () {
          var activeRow = CF.ui.checkRow({
            label: 'Offer this service', checked: next.active,
            onToggle: function () {
              next.active = !next.active;
              activeRow.setAttribute('aria-pressed', next.active ? 'true' : 'false');
              activeRow.querySelector('.checkrow__box').textContent = next.active ? '✓' : '';
            }
          });
          return el('div.stack.stack-4', [
            CF.ui.field({ label: 'Name', value: next.name, autofocus: true,
              onInput: function (v) { next.name = v; } }).node,
            CF.ui.field({ label: 'Base price', value: next.basePrice, type: 'number',
              inputmode: 'decimal', prefix: CF.store.get().settings.currencySymbol,
              onInput: function (v) { next.basePrice = positiveNumber(v, 10000000); } }).node,
            CF.ui.field({ label: 'Typical time (minutes)', value: next.estMinutes, type: 'number',
              inputmode: 'numeric',
              hint: 'Drives the time and profit estimates on quotes.',
              onInput: function (v) { next.estMinutes = positiveNumber(v, 20160); } }).node,
            CF.ui.field({ label: 'Checklist', type: 'select', value: next.checklistId,
              options: CF.store.all('checklists').map(function (c) {
                return { value: c.id, label: c.name };
              }),
              onChange: function (v) { next.checklistId = v; } }).node,
            activeRow
          ]);
        },
        actions: function (closeModal) {
          return [
            el('button.btn.btn--secondary', { type: 'button', onclick: function () { closeModal(); } }, 'Cancel'),
            el('button.btn.btn--primary', {
              type: 'button',
              onclick: function () {
                CF.store.update('services', s.id, next, 'Edit service');
                closeModal(); paint(); CF.shell.repaint();
              }
            }, 'Save')
          ];
        }
      });
    }

    function addService() {
      var created = CF.store.insert('services', {
        name: 'New Service', basePrice: 100, estMinutes: 120,
        checklistId: (CF.store.all('checklists')[0] || {}).id, active: true
      }, 'Add service');
      paint();
      editService(created);
    }

    function editAddon(a) {
      var next = { name: a.name, price: a.price, minutes: a.minutes };
      CF.ui.modal({
        size: 'sm', title: 'Edit add-on',
        body: function () {
          return el('div.stack.stack-4', [
            CF.ui.field({ label: 'Name', value: next.name, autofocus: true,
              onInput: function (v) { next.name = v; } }).node,
            CF.ui.field({ label: 'Price', value: next.price, type: 'number', inputmode: 'decimal',
              prefix: CF.store.get().settings.currencySymbol,
              onInput: function (v) { next.price = positiveNumber(v, 10000000); } }).node,
            CF.ui.field({ label: 'Extra time (minutes)', value: next.minutes, type: 'number',
              inputmode: 'numeric',
              onInput: function (v) { next.minutes = positiveNumber(v, 20160); } }).node
          ]);
        },
        actions: function (closeModal) {
          return [
            el('button.btn.btn--secondary', {
              type: 'button',
              style: { color: 'var(--bad-text)' },
              onclick: function () {
                closeModal();
                CF.ui.confirm({
                  title: 'Delete "' + a.name + '"?',
                  message: 'It disappears from the Smart Quote add-on list. Quotes already saved keep it.',
                  confirmLabel: 'Delete', danger: true
                }).then(function (ok) {
                  if (!ok) return;
                  CF.store.remove('addons', a.id, 'Delete add-on');
                  paint();
                  CF.ui.toast('Add-on deleted', {
                    undo: function () { CF.store.undo(); paint(); CF.shell.repaint(); }
                  });
                });
              }
            }, 'Delete'),
            el('button.btn.btn--primary', {
              type: 'button',
              onclick: function () {
                CF.store.update('addons', a.id, next, 'Edit add-on');
                closeModal(); paint(); CF.shell.repaint();
              }
            }, 'Save')
          ];
        }
      });
    }

    function addAddon() {
      var created = CF.store.insert('addons',
        { name: 'New Add-on', price: 20, minutes: 20 }, 'Add add-on');
      paint();
      editAddon(created);
    }

    function editChecklist(c) {
      var text = c.items.join('\n');
      CF.ui.modal({
        size: 'md', title: c.name,
        sub: 'One step per line. This is the checklist you tick off during a clean.',
        body: function () {
          return el('div.stack.stack-4', [
            CF.ui.field({ label: 'Template name', value: c.name,
              onInput: function (v) { c._newName = v; } }).node,
            CF.ui.field({
              label: 'Steps', value: text, multiline: true, rows: 12, autofocus: true,
              onInput: function (v) { text = v; }
            }).node
          ]);
        },
        actions: function (closeModal) {
          return [
            el('button.btn.btn--secondary', { type: 'button', onclick: function () { closeModal(); } }, 'Cancel'),
            el('button.btn.btn--primary', {
              type: 'button',
              onclick: function () {
                var items = text.split('\n')
                  .map(function (l) { return l.trim(); })
                  .filter(Boolean);
                if (!items.length) {
                  CF.ui.toast('A checklist needs at least one step', { tone: 'bad' });
                  return;
                }
                CF.store.update('checklists', c.id, {
                  items: items,
                  name: (c._newName || c.name).trim() || c.name
                }, 'Edit checklist');
                closeModal(); paint();
                CF.ui.toast('Checklist saved — jobs already booked keep their own copy');
              }
            }, 'Save')
          ];
        }
      });
    }

    /* ---- destructive ---------------------------------------------------- */

    function startReal(closeDrawer) {
      CF.ui.confirm({
        title: 'Start your own business?',
        message: 'The Sparkle & Shine demo data is cleared and you start with a clean slate. ' +
                 'Nothing here is yours yet, so nothing real is lost.',
        confirmLabel: 'Start Fresh'
      }).then(function (ok) {
        if (!ok) return;
        CF.store.replace(CF.schema.emptyDatabase(), 'Start fresh');
        CF.views.onboarding.reset();
        closeDrawer();
        CF.router.go('#/home');
        CF.shell.repaint();
      });
    }

    function loadDemo(closeDrawer) {
      var db = CF.store.get();
      var inDemo = !!db.settings.demoMode;
      // Work of their own, added while the demo was loaded. Not counted by
      // `hasReal` below, which is about replacing a real business — but it is
      // just as much theirs, and resetting used to delete it without a word.
      var ownCount = inDemo ? CF.demo.ownWorkCount(db) : 0;
      var hasReal = !inDemo && (CF.q.activeClients().length || CF.q.jobs().length);

      CF.ui.confirm({
        title: hasReal ? 'Replace your data with the demo?'
             : ownCount ? 'Reset the sample data?'
             : 'Load demo data?',
        message: hasReal
          ? 'This wipes your real clients, jobs and invoices and replaces them with sample data. ' +
            'Export a backup first if you want to keep any of it.'
          : ownCount
            ? 'The sample clients, jobs and invoices go back to how they started. The ' +
              CF.fmt.plural(ownCount, 'record') + ' you added yourself ' +
              (ownCount === 1 ? 'is' : 'are') + ' kept.'
            : 'Loads the Sparkle & Shine sample business so you can explore every screen with real-looking data.',
        confirmLabel: hasReal ? 'Replace Everything'
                    : ownCount ? 'Reset Samples' : 'Load Demo',
        danger: hasReal
      }).then(function (ok) {
        if (!ok) return;
        // Resetting from inside the demo keeps their own work; loading the demo
        // over a real business is an explicit replacement they just confirmed.
        (ownCount ? CF.demo.reset() : CF.demo.load()).then(function () {
          closeDrawer();
          CF.router.go('#/home');
          CF.shell.repaint();
          CF.ui.toast(ownCount
            ? 'Sample data reset — your ' + CF.fmt.plural(ownCount, 'record') + ' kept'
            : 'Demo loaded', {
            undo: function () { CF.store.undo(); CF.shell.repaint(); }
          });
        });
      });
    }

    function eraseEverything(closeDrawer) {
      CF.ui.confirm({
        title: 'Erase everything?',
        message: 'Every client, job, quote, invoice and expense is permanently deleted from this device. ' +
                 'This cannot be undone once you close the app.',
        confirmLabel: 'Erase Everything', danger: true
      }).then(function (ok) {
        if (!ok) return;
        // Second gate: irreversible and irreplaceable deserves two.
        CF.ui.confirm({
          title: 'Last chance',
          message: 'Have you exported a backup? Once this is gone there is no cloud copy to recover from.',
          confirmLabel: 'Yes, erase it', cancelLabel: 'Back up first', danger: true
        }).then(function (sure) {
          if (!sure) {
            CF.backup.exportBackup();
            CF.ui.toast('Backup exported — nothing was erased');
            paint();
            return;
          }
          CF.store.replace(CF.schema.emptyDatabase(), 'Erase everything');
          CF.views.onboarding.reset();
          closeDrawer();
          CF.router.go('#/home');
          CF.shell.repaint();
          CF.ui.toast('Everything erased');
        });
      });
    }
  }

  CF.views = CF.views || {};
  CF.views.settings = { open: open };
})(window.CF = window.CF || {});
