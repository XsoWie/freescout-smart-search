/* Smart Search – form-cf.js */
(function (global) {
  'use strict';
  var SS = global.SmartSearch = global.SmartSearch || {};

  /**
   * CF rows / bind / add / summary / rebuild values shell.
   * Called from form.js after installFormCfValues.
   */
  SS.installFormCf = function (ctx) {
    var form = ctx.form;
    var clearNode = ctx.clearNode;
    var I18N = ctx.I18N || {};

    function cfOpLabel(op) {
      var map = {
        is: I18N.opIs || 'is',
        contains: I18N.opContains || 'contains',
        equals: I18N.opEquals || 'equals',
        gt: I18N.opGt || 'greater than',
        lt: I18N.opLt || 'less than',
        between: I18N.opBetween || 'between',
        on: I18N.opOn || 'on',
        before: I18N.opBefore || 'before',
        after: I18N.opAfter || 'after',
        contains_any: I18N.opContainsAny || 'contains any',
        empty: I18N.emptyNotSet || 'Empty / not set'
      };
      return map[op] || op;
    }

    function cfOpBrief(op) {
      if (op === 'is' || op === 'equals' || op === 'on') return '=';
      if (op === 'gt') return '>';
      if (op === 'lt') return '<';
      return cfOpLabel(op);
    }

    function defaultCfOp(type) {
      type = parseInt(type, 10) || 0;
      if (type === 1) return 'is';
      if (type === 3) return 'contains';
      if (type === 4) return 'equals';
      if (type === 5) return 'on';
      if (type === 7 || type === 8) return 'contains_any';
      return 'contains';
    }

    function opsForType(type) {
      type = parseInt(type, 10) || 0;
      if (type === 1) return ['is', 'empty'];
      if (type === 2) return ['is', 'contains', 'empty'];
      if (type === 3) return ['contains', 'empty'];
      if (type === 4) return ['equals', 'gt', 'lt', 'between', 'empty'];
      if (type === 5) return ['on', 'before', 'after', 'between', 'empty'];
      if (type === 7) return ['contains_any', 'empty'];
      if (type === 8) return ['contains_any', 'empty'];
      return ['contains', 'empty'];
    }

    function cfHasRealOptions(field) {
      if (!field) return false;
      var type = parseInt(field.type, 10) || 0;
      if (type !== 1 && type !== 8) return false;
      var options = field.options && typeof field.options === 'object' ? field.options : null;
      if (!options) return false;
      var keys = Object.keys(options);
      if (!keys.length) return false;
      if (keys.length === 1 && String(keys[0]) === 'autosuggest') return false;
      return true;
    }

    function fieldById(id) {
      var i;
      var fieldsCache = ctx.fieldsCache || [];
      id = parseInt(id, 10) || 0;
      for (i = 0; i < fieldsCache.length; i++) {
        if (parseInt(fieldsCache[i].id, 10) === id) return fieldsCache[i];
      }
      return null;
    }

    // Attach helpers before value-UI rebuild paths call them via ctx.
    ctx.cfOpLabel = cfOpLabel;
    ctx.cfOpBrief = cfOpBrief;
    ctx.defaultCfOp = defaultCfOp;
    ctx.opsForType = opsForType;
    ctx.cfHasRealOptions = cfHasRealOptions;
    ctx.fieldById = fieldById;

    function refreshCfSummary() {
      var host = form.querySelector('.smartsearch-cf-summary');
      var rows = form.querySelectorAll('.smartsearch-cf-row');
      if (!host) return;
      clearNode(host);
      var pillCount = 0;
      var i;
      for (i = 0; i < rows.length; i++) {
        var row = rows[i];
        var sel = row.querySelector('select.smartsearch-cf-id');
        if (!sel || !sel.value || sel.value === '0') continue;
        var opt = sel.options[sel.selectedIndex];
        var fieldName = opt ? String(opt.text || '').replace(/^\s+|\s+$/g, '') : '';
        if (!fieldName) continue;

        var field = fieldById(sel.value);
        var type = field ? (parseInt(field.type, 10) || 0) : (parseInt(row.getAttribute('data-type'), 10) || 0);
        var opSel = row.querySelector('select.smartsearch-cf-op');
        var op = opSel && opSel.value ? String(opSel.value) : defaultCfOp(type);
        var pillText = fieldName;

        if (op === 'empty') {
          pillText = fieldName + ' ' + cfOpLabel('empty');
        } else {
          var valueLabels = [];
          var checks = row.querySelectorAll('.smartsearch-cf-value-ui input[type="checkbox"]:checked');
          var ci;
          for (ci = 0; ci < checks.length; ci++) {
            var labNode = checks[ci].parentNode;
            var labText = labNode ? String(labNode.textContent || '').replace(/^\s+|\s+$/g, '') : '';
            if (labText) valueLabels.push(labText);
          }
          var textInputs = row.querySelectorAll('.smartsearch-cf-value-ui input[type="text"], .smartsearch-cf-value-ui input[type="number"], .smartsearch-cf-value-ui input[type="date"]');
          var ti;
          for (ti = 0; ti < textInputs.length; ti++) {
            var raw = String(textInputs[ti].value || '').replace(/^\s+|\s+$/g, '');
            if (!raw) continue;
            if (type === 7 && textInputs[ti].type === 'text') {
              var parts = raw.split(/\s*,\s*/);
              var pi;
              for (pi = 0; pi < parts.length; pi++) {
                var part = String(parts[pi] || '').replace(/^\s+|\s+$/g, '');
                if (part) valueLabels.push(part);
              }
            } else {
              valueLabels.push(raw);
            }
          }
          if (valueLabels.length) {
            var brief = cfOpBrief(op);
            if (op === 'between' && valueLabels.length >= 2) {
              pillText += ' ' + brief + ' ' + valueLabels[0] + '–' + valueLabels[1];
            } else {
              pillText += ' ' + brief + ' ' + valueLabels.join(' | ');
            }
          }
        }
        ctx.appendRemovablePill(host, pillText, 'cf', String(i));
        pillCount++;
      }
      if (!pillCount) {
        var muted = document.createElement('span');
        muted.className = 'smartsearch-muted';
        muted.appendChild(document.createTextNode(I18N.any || 'Any'));
        host.appendChild(muted);
      }
    }

    function collectCfRowState(row) {
      var state = { op: '', values: [] };
      if (!row) return state;
      var opSel = row.querySelector('select.smartsearch-cf-op');
      if (opSel && opSel.value) state.op = String(opSel.value);
      var checks = row.querySelectorAll('.smartsearch-cf-value-ui input[type="checkbox"]:checked');
      var i;
      for (i = 0; i < checks.length; i++) {
        state.values.push(String(checks[i].value || ''));
      }
      var inputs = row.querySelectorAll('.smartsearch-cf-value-ui input[type="text"], .smartsearch-cf-value-ui input[type="number"], .smartsearch-cf-value-ui input[type="date"]');
      for (i = 0; i < inputs.length; i++) {
        state.values.push(String(inputs[i].value || ''));
      }
      return state;
    }

    function applyCfRowState(row, state) {
      if (!row || !state) return;
      var opSel = row.querySelector('select.smartsearch-cf-op');
      if (opSel && state.op) {
        var opts = opSel.options;
        var found = false;
        var i;
        for (i = 0; i < opts.length; i++) {
          if (opts[i].value === state.op) { found = true; break; }
        }
        if (found) {
          opSel.value = state.op;
          ctx.rebuildCfValueUi(row, state.op);
        }
      }
      var vals = state.values || [];
      if (!vals.length) {
        refreshCfSummary();
        return;
      }
      var checks = row.querySelectorAll('.smartsearch-cf-value-ui input[type="checkbox"]');
      for (i = 0; i < checks.length; i++) {
        if (vals.indexOf(String(checks[i].value || '')) >= 0) {
          checks[i].checked = true;
        }
      }
      var inputs = row.querySelectorAll('.smartsearch-cf-value-ui input[type="text"], .smartsearch-cf-value-ui input[type="number"], .smartsearch-cf-value-ui input[type="date"]');
      for (i = 0; i < inputs.length; i++) {
        if (typeof vals[i] !== 'undefined') {
          inputs[i].value = vals[i];
        }
      }
      ctx.refreshCfValueBtn(row);
      refreshCfSummary();
    }

    function rebuildCfValues(row, preserveState) {
      var prev = preserveState ? collectCfRowState(row) : null;
      var sel = row.querySelector('select.smartsearch-cf-id');
      var valuesHost = row.querySelector('.smartsearch-cf-values');
      if (!sel || !valuesHost) return;
      var idx = row.getAttribute('data-index') || '0';
      var id = sel.value || '0';
      ctx.closeAllCfValuePopovers();
      clearNode(valuesHost);
      if (!id || id === '0') {
        valuesHost.style.display = 'none';
        row.setAttribute('data-type', '0');
        refreshCfSummary();
        if (typeof ctx.repositionOpenTile === 'function') ctx.repositionOpenTile();
        return;
      }
      valuesHost.style.display = '';
      var field = fieldById(id);
      var type = field ? (parseInt(field.type, 10) || 0) : 0;
      row.setAttribute('data-type', String(type));

      var opSel = document.createElement('select');
      opSel.className = 'form-control input-sm smartsearch-cf-op';
      opSel.name = 'cf_filters[' + idx + '][op]';
      opSel.setAttribute('aria-label', I18N.operator || 'Operator');
      var allowed = opsForType(type);
      var defOp = (prev && prev.op && allowed.indexOf(prev.op) >= 0) ? prev.op : defaultCfOp(type);
      var ai;
      for (ai = 0; ai < allowed.length; ai++) {
        var o = document.createElement('option');
        o.value = allowed[ai];
        o.appendChild(document.createTextNode(cfOpLabel(allowed[ai])));
        if (allowed[ai] === defOp) o.selected = true;
        opSel.appendChild(o);
      }
      valuesHost.appendChild(opSel);

      opSel.addEventListener('change', function () {
        ctx.rebuildCfValueUi(row, opSel.value);
      });

      ctx.ensureCfValueShell(row);
      ctx.rebuildCfValueUi(row, defOp);
      if (prev) applyCfRowState(row, prev);
    }

    function reindexCfRows() {
      var rows = form.querySelectorAll('.smartsearch-cf-row');
      var i;
      for (i = 0; i < rows.length; i++) {
        rows[i].setAttribute('data-index', String(i));
        var sel = rows[i].querySelector('select.smartsearch-cf-id');
        if (sel) sel.name = 'cf_filters[' + i + '][id]';
        var inputs = rows[i].querySelectorAll('[name^="cf_filters["]');
        var j;
        for (j = 0; j < inputs.length; j++) {
          var n = inputs[j].name || '';
          if (n.indexOf('[id]') !== -1) inputs[j].name = 'cf_filters[' + i + '][id]';
          else if (n.indexOf('[op]') !== -1) inputs[j].name = 'cf_filters[' + i + '][op]';
          else if (n.indexOf('[values]') !== -1) inputs[j].name = 'cf_filters[' + i + '][values][]';
        }
      }
    }

    function bindCfRow(row) {
      var sel = row.querySelector('select.smartsearch-cf-id');
      var removeBtn = row.querySelector('.smartsearch-cf-remove');
      var valuesHost = row.querySelector('.smartsearch-cf-values');
      var triggerWrap = row.querySelector('.smartsearch-cf-value-trigger-wrap');
      if (sel) {
        sel.addEventListener('change', function () {
          rebuildCfValues(row);
        });
      }
      if (triggerWrap) {
        ctx.bindCfValueTrigger(row, triggerWrap);
      }
      if (valuesHost && !valuesHost.getAttribute('data-bound-summary')) {
        valuesHost.setAttribute('data-bound-summary', '1');
        valuesHost.addEventListener('change', function (ev) {
          var t = ev && ev.target ? ev.target : null;
          if (t && t.classList && t.classList.contains('smartsearch-cf-op')) {
            ctx.rebuildCfValueUi(row, t.value);
            return;
          }
          ctx.refreshCfValueBtn(row);
          refreshCfSummary();
          if (ctx.openCfValueWrap && row.contains(ctx.openCfValueWrap)) {
            ctx.placeCfValuePopover(ctx.openCfValueWrap);
          }
        });
        valuesHost.addEventListener('input', function () {
          ctx.refreshCfValueBtn(row);
          refreshCfSummary();
        });
      }
      if (removeBtn) {
        removeBtn.addEventListener('click', function () {
          var rows = form.querySelectorAll('.smartsearch-cf-row');
          if (rows.length <= 1) {
            if (sel) sel.value = '0';
            rebuildCfValues(row);
            return;
          }
          ctx.closeAllCfValuePopovers();
          row.parentNode.removeChild(row);
          reindexCfRows();
          refreshCfSummary();
          if (typeof ctx.repositionOpenTile === 'function') ctx.repositionOpenTile();
        });
      }
      ctx.refreshCfValueBtn(row);
    }

    function addCfRow() {
      var wrap = form.querySelector('.smartsearch-cf-rows');
      if (!wrap) return;
      var rows = wrap.querySelectorAll('.smartsearch-cf-row');
      var template = rows[0];
      if (!template) return;
      ctx.closeAllCfValuePopovers();
      var clone = template.cloneNode(true);
      var sel = clone.querySelector('select.smartsearch-cf-id');
      if (sel) sel.value = '0';
      var values = clone.querySelector('.smartsearch-cf-values');
      if (values) {
        clearNode(values);
        values.style.display = 'none';
        values.removeAttribute('data-bound-summary');
      }
      var boundTrigger = clone.querySelector('.smartsearch-cf-value-trigger-wrap');
      if (boundTrigger) boundTrigger.removeAttribute('data-bound-trigger');
      clone.classList.remove('is-open');
      clone.setAttribute('data-type', '0');
      wrap.appendChild(clone);
      reindexCfRows();
      bindCfRow(clone);
      refreshCfSummary();
      if (typeof ctx.repositionOpenTile === 'function') ctx.repositionOpenTile();
      if (typeof clone.scrollIntoView === 'function') {
        try { clone.scrollIntoView({ block: 'nearest' }); } catch (eScroll) { clone.scrollIntoView(false); }
      }
    }

    ctx.refreshCfSummary = refreshCfSummary;
    ctx.collectCfRowState = collectCfRowState;
    ctx.applyCfRowState = applyCfRowState;
    ctx.rebuildCfValues = rebuildCfValues;
    ctx.reindexCfRows = reindexCfRows;
    ctx.bindCfRow = bindCfRow;
    ctx.addCfRow = addCfRow;
  };
})(typeof window !== 'undefined' ? window : this);
