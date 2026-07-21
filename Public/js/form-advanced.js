/* Smart Search – form-advanced.js */
(function (global) {
  'use strict';
  var SS = global.SmartSearch = global.SmartSearch || {};

  /**
   * Advanced tile chrome: scope/tags pills, date/customer labels + binds.
   * Called from form.js after installFormTiles.
   */
  SS.installFormAdvanced = function (ctx) {
    var form = ctx.form;
    var clearNode = ctx.clearNode;
    var I18N = ctx.I18N || {};

    function pad2(n) {
      return (n < 10 ? '0' : '') + n;
    }

    function formatYmd(d) {
      return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
    }

    function startOfDay(d) {
      return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    }

    /** Mirror of ParsesBasicFilters::resolveDatePreset (local timezone). */
    function resolveDatePreset(preset, now) {
      preset = String(preset || '').toLowerCase().replace(/^\s+|\s+$/g, '');
      now = now || new Date();
      var today = startOfDay(now);
      var from;
      var to;
      if (preset === 'today') {
        from = today;
        to = today;
      } else if (preset === 'yesterday') {
        from = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
        to = from;
      } else if (preset === 'last_7_days') {
        to = today;
        from = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6);
      } else if (preset === 'last_30_days') {
        to = today;
        from = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29);
      } else if (preset === 'this_month') {
        from = new Date(today.getFullYear(), today.getMonth(), 1);
        to = today;
      } else if (preset === 'last_month') {
        from = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        to = new Date(today.getFullYear(), today.getMonth(), 0);
      } else {
        return { from: '', to: '' };
      }
      return { from: formatYmd(from), to: formatYmd(to) };
    }

    function datePresetLabel(preset) {
      var map = {
        today: I18N.datePresetToday || 'Today',
        yesterday: I18N.datePresetYesterday || 'Yesterday',
        last_7_days: I18N.datePresetLast7Days || 'Last 7 days',
        last_30_days: I18N.datePresetLast30Days || 'Last 30 days',
        this_month: I18N.datePresetThisMonth || 'This month',
        last_month: I18N.datePresetLastMonth || 'Last month'
      };
      return map[preset] || preset;
    }

    function applyPresetToInputs(preset) {
      var fromInp = form.querySelector('input[name="date_from"]');
      var toInp = form.querySelector('input[name="date_to"]');
      if (!fromInp || !toInp) return;
      if (!preset) return;
      var range = resolveDatePreset(preset);
      fromInp.value = range.from || '';
      toInp.value = range.to || '';
    }

    function refreshScopePills() {
      var host = form.querySelector('.smartsearch-scope-pills');
      if (!host) return;
      var checks = form.querySelectorAll('.smartsearch-scope-checks input[type="checkbox"]:checked');
      clearNode(host);
      if (!checks.length || checks.length === 3) {
        var muted = document.createElement('span');
        muted.className = 'smartsearch-muted';
        muted.appendChild(document.createTextNode((I18N.subject || 'Subject') + ', ' + (I18N.messages || 'Messages') + ', ' + (I18N.notes || 'Notes')));
        host.appendChild(muted);
        return;
      }
      var i;
      for (i = 0; i < checks.length; i++) {
        var lab = checks[i].parentNode ? String(checks[i].parentNode.textContent || '').replace(/^\s+|\s+$/g, '') : String(checks[i].value || '');
        ctx.appendRemovablePill(host, lab, 'scope', checks[i].value);
      }
    }

    function refreshTagsPills() {
      var host = form.querySelector('.smartsearch-tags-pills');
      if (!host) return;
      var checks = form.querySelectorAll('.smartsearch-tags-checks input[type="checkbox"]:checked');
      clearNode(host);
      if (!checks.length) {
        var muted = document.createElement('span');
        muted.className = 'smartsearch-muted';
        muted.appendChild(document.createTextNode(I18N.any || 'Any'));
        host.appendChild(muted);
        return;
      }
      var i;
      for (i = 0; i < checks.length; i++) {
        var lab = checks[i].parentNode ? String(checks[i].parentNode.textContent || '').replace(/^\s+|\s+$/g, '') : String(checks[i].value || '');
        ctx.appendRemovablePill(host, lab, 'tag', checks[i].value);
      }
    }

    function refreshDateLabel() {
      var host = form.querySelector('.smartsearch-tile-date-label');
      if (!host) return;
      var fieldSel = form.querySelector('select[name="date_field"]');
      var fromInp = form.querySelector('input[name="date_from"]');
      var toInp = form.querySelector('input[name="date_to"]');
      var presetSel = form.querySelector('select[name="date_preset"]');
      var datePreset = presetSel ? String(presetSel.value || '') : '';
      var field = fieldSel ? String(fieldSel.value || 'updated') : 'updated';
      var from = fromInp ? String(fromInp.value || '') : '';
      var to = toInp ? String(toInp.value || '') : '';
      var basis = field === 'created' ? (I18N.createdDate || 'Created date') : (I18N.lastUpdated || 'Last updated');
      clearNode(host);
      if (datePreset) {
        host.appendChild(document.createTextNode(basis + ': ' + datePresetLabel(datePreset)));
        return;
      }
      if (from || to) {
        host.appendChild(document.createTextNode(basis + ': ' + (from || '…') + ' – ' + (to || '…')));
      } else {
        var muted = document.createElement('span');
        muted.className = 'smartsearch-muted';
        muted.appendChild(document.createTextNode(I18N.any || 'Any'));
        host.appendChild(muted);
      }
    }

    function refreshCustomerLabel() {
      var host = form.querySelector('.smartsearch-tile-customer-label');
      var inp = form.querySelector('input[name="customer_q"]');
      if (!host) return;
      var val = inp ? String(inp.value || '').replace(/^\s+|\s+$/g, '') : '';
      clearNode(host);
      if (val) {
        host.appendChild(document.createTextNode(val));
      } else {
        var muted = document.createElement('span');
        muted.className = 'smartsearch-muted';
        muted.appendChild(document.createTextNode(I18N.any || 'Any'));
        host.appendChild(muted);
      }
    }

    function bindAdvancedTiles() {
      var scopeChecks = form.querySelector('.smartsearch-scope-checks');
      if (scopeChecks) {
        scopeChecks.addEventListener('change', function () {
          refreshScopePills();
          if (typeof ctx.persistFormState === 'function') ctx.persistFormState();
        });
      }
      var tagsChecks = form.querySelector('.smartsearch-tags-checks');
      if (tagsChecks) {
        tagsChecks.addEventListener('change', function () {
          refreshTagsPills();
          if (typeof ctx.persistFormState === 'function') ctx.persistFormState();
        });
      }
      var dateField = form.querySelector('select[name="date_field"]');
      var dateFrom = form.querySelector('input[name="date_from"]');
      var dateTo = form.querySelector('input[name="date_to"]');
      var datePreset = form.querySelector('select[name="date_preset"]');
      var syncingDates = false;

      function onPresetChange() {
        if (!datePreset) return;
        var preset = String(datePreset.value || '');
        syncingDates = true;
        try {
          if (preset) {
            applyPresetToInputs(preset);
          }
        } finally {
          syncingDates = false;
        }
        refreshDateLabel();
        if (typeof ctx.persistFormState === 'function') ctx.persistFormState();
      }

      function onAbsoluteDateChange() {
        if (syncingDates) return;
        // Manual range => leave relative preset.
        if (datePreset && datePreset.value) {
          datePreset.value = '';
        }
        refreshDateLabel();
        if (typeof ctx.persistFormState === 'function') ctx.persistFormState();
      }

      function onDateFieldChange() {
        refreshDateLabel();
        if (typeof ctx.persistFormState === 'function') ctx.persistFormState();
      }

      if (dateField) dateField.addEventListener('change', onDateFieldChange);
      if (dateFrom) dateFrom.addEventListener('change', onAbsoluteDateChange);
      if (dateTo) dateTo.addEventListener('change', onAbsoluteDateChange);
      if (datePreset) datePreset.addEventListener('change', onPresetChange);

      var customerInp = form.querySelector('input[name="customer_q"]');
      if (customerInp) {
        customerInp.addEventListener('input', function () {
          refreshCustomerLabel();
        });
        customerInp.addEventListener('change', function () {
          refreshCustomerLabel();
          if (typeof ctx.persistFormState === 'function') ctx.persistFormState();
        });
      }
    }

    ctx.resolveDatePreset = resolveDatePreset;
    ctx.applyPresetToInputs = applyPresetToInputs;
    ctx.refreshScopePills = refreshScopePills;
    ctx.refreshTagsPills = refreshTagsPills;
    ctx.refreshDateLabel = refreshDateLabel;
    ctx.refreshCustomerLabel = refreshCustomerLabel;
    ctx.bindAdvancedTiles = bindAdvancedTiles;
  };
})(typeof window !== 'undefined' ? window : this);
