/* Smart Search – form-cf-values.js */
(function (global) {
  'use strict';
  var SS = global.SmartSearch = global.SmartSearch || {};

  /**
   * CF value popover / chips / value-UI rebuild.
   * Called from form.js after installFormTiles (before installFormCf).
   */
  SS.installFormCfValues = function (ctx) {
    var form = ctx.form;
    var clearNode = ctx.clearNode;
    var I18N = ctx.I18N || {};

    function resetCfValuePopoverStyle(popover) {
      if (!popover) return;
      popover.style.position = '';
      popover.style.left = '';
      popover.style.top = '';
      popover.style.bottom = '';
      popover.style.width = '';
      popover.style.maxWidth = '';
      popover.style.maxHeight = '';
      popover.style.zIndex = '';
    }

    function closeAllCfValuePopovers(exceptWrap) {
      var wraps = form.querySelectorAll('.smartsearch-cf-value-trigger-wrap.is-open');
      var i;
      for (i = 0; i < wraps.length; i++) {
        if (exceptWrap && wraps[i] === exceptWrap) continue;
        wraps[i].classList.remove('is-open');
        var btn = wraps[i].querySelector('.smartsearch-cf-value-btn');
        var pop = wraps[i].querySelector('.smartsearch-cf-value-popover');
        if (btn) btn.setAttribute('aria-expanded', 'false');
        if (pop) {
          pop.hidden = true;
          resetCfValuePopoverStyle(pop);
        }
      }
      if (!exceptWrap || !exceptWrap.classList.contains('is-open')) {
        ctx.openCfValueWrap = null;
      }
    }

    function placeCfValuePopover(wrap) {
      if (!wrap) return;
      var btn = wrap.querySelector('.smartsearch-cf-value-btn');
      var popover = wrap.querySelector('.smartsearch-cf-value-popover');
      if (!btn || !popover) return;
      var rect = btn.getBoundingClientRect();
      var vpW = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
      var vpH = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
      var margin = 8;
      var gap = 4;
      var width = Math.max(Math.round(rect.width), 220);
      width = Math.min(width, vpW - (margin * 2));
      var left = Math.round(rect.left);
      if (left + width > vpW - margin) {
        left = Math.max(margin, vpW - margin - width);
      }
      if (left < margin) left = margin;

      popover.hidden = false;
      popover.style.position = 'fixed';
      popover.style.left = left + 'px';
      popover.style.width = width + 'px';
      popover.style.maxWidth = (vpW - (margin * 2)) + 'px';
      popover.style.top = '-9999px';
      popover.style.bottom = 'auto';
      popover.style.maxHeight = 'none';
      popover.style.zIndex = '10120';

      var popH = Math.ceil(popover.getBoundingClientRect().height) || 160;
      var spaceBelow = vpH - rect.bottom - margin;
      var spaceAbove = rect.top - margin;
      var openUp = spaceBelow < Math.min(popH + gap, 200) && spaceAbove > spaceBelow;
      var maxH = Math.max(120, openUp ? spaceAbove - gap : spaceBelow - gap);
      popover.style.maxHeight = maxH + 'px';
      if (openUp) {
        popover.style.top = 'auto';
        popover.style.bottom = Math.max(margin, vpH - rect.top + gap) + 'px';
      } else {
        popover.style.bottom = 'auto';
        popover.style.top = Math.round(rect.bottom + gap) + 'px';
      }
    }

    function openCfValuePopover(wrap) {
      if (!wrap) return;
      closeAllCfValuePopovers(wrap);
      wrap.classList.add('is-open');
      var btn = wrap.querySelector('.smartsearch-cf-value-btn');
      if (btn) btn.setAttribute('aria-expanded', 'true');
      placeCfValuePopover(wrap);
      ctx.openCfValueWrap = wrap;
    }

    function toggleCfValuePopover(wrap) {
      if (!wrap) return;
      if (wrap.classList.contains('is-open')) {
        closeAllCfValuePopovers();
      } else {
        openCfValuePopover(wrap);
      }
    }

    function appendCfValueChip(host, text, meta) {
      var chip = document.createElement('span');
      chip.className = 'smartsearch-cf-value-chip';
      chip.setAttribute('data-kind', meta.kind || '');
      if (typeof meta.value !== 'undefined') chip.setAttribute('data-value', String(meta.value));
      if (typeof meta.index !== 'undefined') chip.setAttribute('data-index', String(meta.index));
      var textEl = document.createElement('span');
      textEl.className = 'smartsearch-cf-value-chip-text';
      textEl.appendChild(document.createTextNode(text));
      // Use <span>, not <button>: nested buttons inside .smartsearch-cf-value-btn are invalid HTML.
      var xBtn = document.createElement('span');
      xBtn.className = 'smartsearch-cf-value-chip-x';
      xBtn.setAttribute('role', 'button');
      xBtn.setAttribute('tabindex', '0');
      xBtn.setAttribute('aria-label', I18N.removeField || 'Remove');
      xBtn.appendChild(document.createTextNode('\u00d7'));
      chip.appendChild(textEl);
      chip.appendChild(xBtn);
      host.appendChild(chip);
    }

    function removeCfValueChip(row, chip) {
      if (!row || !chip) return;
      var kind = chip.getAttribute('data-kind') || '';
      var value = chip.getAttribute('data-value');
      var idx = parseInt(chip.getAttribute('data-index'), 10);
      var i;
      if (kind === 'check') {
        var checks = row.querySelectorAll('.smartsearch-cf-value-ui input[type="checkbox"]');
        for (i = 0; i < checks.length; i++) {
          if (String(checks[i].value || '') === String(value || '')) {
            checks[i].checked = false;
            break;
          }
        }
      } else if (kind === 'between') {
        var betweenInputs = row.querySelectorAll('.smartsearch-cf-value-ui input[type="text"], .smartsearch-cf-value-ui input[type="number"], .smartsearch-cf-value-ui input[type="date"]');
        for (i = 0; i < betweenInputs.length; i++) betweenInputs[i].value = '';
      } else if (kind === 'tags') {
        var tagInp = row.querySelector('.smartsearch-cf-value-ui input[type="text"]');
        if (tagInp) {
          var parts = String(tagInp.value || '').split(/\s*,\s*/);
          var kept = [];
          for (i = 0; i < parts.length; i++) {
            var part = String(parts[i] || '').replace(/^\s+|\s+$/g, '');
            if (part && part !== String(value || '')) kept.push(part);
          }
          tagInp.value = kept.join(', ');
        }
      } else if (kind === 'input' && !isNaN(idx)) {
        var inputs = row.querySelectorAll('.smartsearch-cf-value-ui input[type="text"], .smartsearch-cf-value-ui input[type="number"], .smartsearch-cf-value-ui input[type="date"]');
        if (inputs[idx]) inputs[idx].value = '';
      }
      refreshCfValueBtn(row);
      if (typeof ctx.refreshCfSummary === 'function') ctx.refreshCfSummary();
      if (typeof ctx.persistFormState === 'function') {
        try { ctx.persistFormState(); } catch (ePersistChip) {}
      }
    }

    function refreshCfValueBtn(row) {
      if (!row) return;
      var wrap = row.querySelector('.smartsearch-cf-value-trigger-wrap');
      var label = row.querySelector('.smartsearch-cf-value-btn-label');
      var opSel = row.querySelector('select.smartsearch-cf-op');
      if (!wrap || !label) return;
      var op = opSel && opSel.value ? String(opSel.value) : '';
      if (op === 'empty') {
        wrap.style.display = 'none';
        return;
      }
      wrap.style.display = '';

      var type = parseInt(row.getAttribute('data-type'), 10) || 0;
      var labels = [];
      var checks = row.querySelectorAll('.smartsearch-cf-value-ui input[type="checkbox"]:checked');
      var i;
      for (i = 0; i < checks.length; i++) {
        var labNode = checks[i].parentNode;
        var labText = labNode ? String(labNode.textContent || '').replace(/^\s+|\s+$/g, '') : '';
        if (labText) labels.push(labText);
      }
      if (!labels.length) {
        var inputs = row.querySelectorAll('.smartsearch-cf-value-ui input[type="text"], .smartsearch-cf-value-ui input[type="number"], .smartsearch-cf-value-ui input[type="date"]');
        var vals = [];
        for (i = 0; i < inputs.length; i++) {
          vals.push(String(inputs[i].value || '').replace(/^\s+|\s+$/g, ''));
        }
        if (op === 'between') {
          if (vals[0] || vals[1]) labels.push((vals[0] || '…') + '–' + (vals[1] || '…'));
        } else if (type === 7 && vals[0]) {
          var parts = vals[0].split(/\s*,\s*/);
          for (i = 0; i < parts.length; i++) {
            var part = String(parts[i] || '').replace(/^\s+|\s+$/g, '');
            if (part) labels.push(part);
          }
        } else {
          for (i = 0; i < vals.length; i++) {
            if (vals[i]) labels.push(vals[i]);
          }
        }
      }

      clearNode(label);
      if (!labels.length) {
        label.classList.add('is-placeholder');
        label.appendChild(document.createTextNode(ctx.chooseValuesLabel));
        wrap.classList.remove('has-value');
      } else {
        // Plain text in the value trigger (chips only belong on tile summaries).
        label.classList.remove('is-placeholder');
        label.appendChild(document.createTextNode(labels.join(' | ')));
        wrap.classList.add('has-value');
      }
    }

    function findCfChipFromEventTarget(start, stopAt) {
      var t = start;
      var chipX = null;
      var chip = null;
      while (t && t !== stopAt) {
        if (t.classList) {
          if (t.classList.contains('smartsearch-cf-value-chip-x')) chipX = t;
          if (t.classList.contains('smartsearch-cf-value-chip')) {
            chip = t;
            break;
          }
        }
        t = t.parentNode;
      }
      return chipX && chip ? chip : null;
    }

    function bindCfValueTrigger(row, wrap) {
      if (!wrap || wrap.getAttribute('data-bound-trigger') === '1') return;
      wrap.setAttribute('data-bound-trigger', '1');
      var btn = wrap.querySelector('.smartsearch-cf-value-btn');
      var popover = wrap.querySelector('.smartsearch-cf-value-popover');
      if (btn) {
        btn.addEventListener('click', function (ev) {
          var chip = findCfChipFromEventTarget(ev.target, btn);
          if (chip) {
            ev.preventDefault();
            ev.stopPropagation();
            removeCfValueChip(row, chip);
            return;
          }
          ev.preventDefault();
          ev.stopPropagation();
          toggleCfValuePopover(wrap);
        });
        btn.addEventListener('keydown', function (ev) {
          var key = ev.key || '';
          var code = ev.keyCode || 0;
          if (key !== 'Enter' && key !== ' ' && key !== 'Spacebar' && code !== 13 && code !== 32) return;
          var chip = findCfChipFromEventTarget(ev.target, btn);
          if (!chip) return;
          ev.preventDefault();
          ev.stopPropagation();
          removeCfValueChip(row, chip);
        });
      }
      if (popover) {
        popover.addEventListener('click', function (ev) {
          ev.stopPropagation();
        });
        popover.addEventListener('wheel', function (ev) {
          ev.stopPropagation();
        }, { passive: true });
      }
    }

    function ensureCfValueShell(row) {
      var valuesHost = row.querySelector('.smartsearch-cf-values');
      if (!valuesHost) return null;
      var triggerWrap = valuesHost.querySelector('.smartsearch-cf-value-trigger-wrap');
      if (!triggerWrap) {
        triggerWrap = document.createElement('div');
        triggerWrap.className = 'smartsearch-cf-value-trigger-wrap';
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-default btn-sm smartsearch-cf-value-btn';
        btn.setAttribute('aria-expanded', 'false');
        btn.setAttribute('aria-haspopup', 'dialog');
        var btnLabel = document.createElement('span');
        btnLabel.className = 'smartsearch-cf-value-btn-label';
        btnLabel.appendChild(document.createTextNode(ctx.chooseValuesLabel));
        var caret = document.createElement('span');
        caret.className = 'smartsearch-cf-value-btn-caret glyphicon glyphicon-chevron-down';
        caret.setAttribute('aria-hidden', 'true');
        btn.appendChild(btnLabel);
        btn.appendChild(caret);
        var popover = document.createElement('div');
        popover.className = 'smartsearch-cf-value-popover';
        popover.hidden = true;
        var valueUi = document.createElement('div');
        valueUi.className = 'smartsearch-cf-value-ui';
        popover.appendChild(valueUi);
        triggerWrap.appendChild(btn);
        triggerWrap.appendChild(popover);
        valuesHost.appendChild(triggerWrap);
        bindCfValueTrigger(row, triggerWrap);
      }
      return triggerWrap;
    }

    function rebuildCfValueUi(row, preferredOp) {
      var sel = row.querySelector('select.smartsearch-cf-id');
      var valuesHost = row.querySelector('.smartsearch-cf-values');
      if (!sel || !valuesHost) return;
      var idx = row.getAttribute('data-index') || '0';
      var id = sel.value || '0';
      var opSel = valuesHost.querySelector('select.smartsearch-cf-op');
      var triggerWrap = ensureCfValueShell(row);
      var valueUi = triggerWrap ? triggerWrap.querySelector('.smartsearch-cf-value-ui') : null;
      if (!valueUi || !opSel) return;

      var field = ctx.fieldById(id);
      var type = field ? (parseInt(field.type, 10) || 0) : 0;
      var op = preferredOp || opSel.value || ctx.defaultCfOp(type);
      var allowed = ctx.opsForType(type);
      if (allowed.indexOf(op) < 0) op = ctx.defaultCfOp(type);
      opSel.value = op;

      clearNode(valueUi);
      if (op === 'empty') {
        closeAllCfValuePopovers();
        triggerWrap.style.display = 'none';
        refreshCfValueBtn(row);
        if (typeof ctx.refreshCfSummary === 'function') ctx.refreshCfSummary();
        if (typeof ctx.repositionOpenTile === 'function') ctx.repositionOpenTile();
        return;
      }
      triggerWrap.style.display = '';

      var hasOpts = ctx.cfHasRealOptions(field);
      var options = hasOpts && field.options ? field.options : null;

      if (hasOpts && (op === 'is' || op === 'contains_any') && options) {
        var list = document.createElement('div');
        list.className = 'smartsearch-check-list';
        var key;
        for (key in options) {
          if (!Object.prototype.hasOwnProperty.call(options, key)) continue;
          if (String(key) === 'autosuggest') continue;
          var lab = document.createElement('label');
          lab.className = 'checkbox';
          var inp = document.createElement('input');
          inp.type = 'checkbox';
          inp.name = 'cf_filters[' + idx + '][values][]';
          // Type 1 stores keys; type 8 stores labels.
          inp.value = (type === 8) ? String(options[key]) : String(key);
          lab.appendChild(inp);
          lab.appendChild(document.createTextNode(' ' + String(options[key])));
          list.appendChild(lab);
        }
        valueUi.appendChild(list);
      } else if (type === 4) {
        if (op === 'between') {
          var wrapN = document.createElement('div');
          wrapN.className = 'smartsearch-cf-between';
          var fromN = document.createElement('input');
          fromN.type = 'number';
          fromN.step = 'any';
          fromN.className = 'form-control input-sm';
          fromN.name = 'cf_filters[' + idx + '][values][]';
          fromN.placeholder = I18N.fromLabel || 'From';
          var sepN = document.createElement('span');
          sepN.className = 'smartsearch-cf-between-sep';
          sepN.appendChild(document.createTextNode('–'));
          var toN = document.createElement('input');
          toN.type = 'number';
          toN.step = 'any';
          toN.className = 'form-control input-sm';
          toN.name = 'cf_filters[' + idx + '][values][]';
          toN.placeholder = I18N.toLabel || 'To';
          wrapN.appendChild(fromN);
          wrapN.appendChild(sepN);
          wrapN.appendChild(toN);
          valueUi.appendChild(wrapN);
        } else {
          var numInp = document.createElement('input');
          numInp.type = 'number';
          numInp.step = 'any';
          numInp.className = 'form-control input-sm';
          numInp.name = 'cf_filters[' + idx + '][values][]';
          numInp.placeholder = I18N.valuePlaceholder || 'Value';
          valueUi.appendChild(numInp);
        }
      } else if (type === 5) {
        if (op === 'between') {
          var wrapD = document.createElement('div');
          wrapD.className = 'smartsearch-cf-between';
          var fromD = document.createElement('input');
          fromD.type = 'date';
          fromD.className = 'form-control input-sm';
          fromD.name = 'cf_filters[' + idx + '][values][]';
          var sepD = document.createElement('span');
          sepD.className = 'smartsearch-cf-between-sep';
          sepD.appendChild(document.createTextNode('–'));
          var toD = document.createElement('input');
          toD.type = 'date';
          toD.className = 'form-control input-sm';
          toD.name = 'cf_filters[' + idx + '][values][]';
          wrapD.appendChild(fromD);
          wrapD.appendChild(sepD);
          wrapD.appendChild(toD);
          valueUi.appendChild(wrapD);
        } else {
          var dateInp = document.createElement('input');
          dateInp.type = 'date';
          dateInp.className = 'form-control input-sm';
          dateInp.name = 'cf_filters[' + idx + '][values][]';
          valueUi.appendChild(dateInp);
        }
      } else if (type === 7) {
        var tagInp = document.createElement('input');
        tagInp.type = 'text';
        tagInp.className = 'form-control input-sm';
        tagInp.name = 'cf_filters[' + idx + '][values][]';
        tagInp.placeholder = I18N.fieldValuesTextPlaceholder || 'Value1, Value2…';
        valueUi.appendChild(tagInp);
      } else {
        // Type 2/3 text (+ autosuggest-only options for type 2)
        var textInp = document.createElement('input');
        textInp.type = 'text';
        textInp.className = 'form-control input-sm';
        textInp.name = 'cf_filters[' + idx + '][values][]';
        textInp.placeholder = I18N.valuePlaceholder || 'Value';
        valueUi.appendChild(textInp);
      }
      refreshCfValueBtn(row);
      if (typeof ctx.refreshCfSummary === 'function') ctx.refreshCfSummary();
      if (triggerWrap.classList.contains('is-open')) {
        placeCfValuePopover(triggerWrap);
      }
      if (typeof ctx.repositionOpenTile === 'function') ctx.repositionOpenTile();
    }

    ctx.resetCfValuePopoverStyle = resetCfValuePopoverStyle;
    ctx.closeAllCfValuePopovers = closeAllCfValuePopovers;
    ctx.placeCfValuePopover = placeCfValuePopover;
    ctx.openCfValuePopover = openCfValuePopover;
    ctx.toggleCfValuePopover = toggleCfValuePopover;
    ctx.appendCfValueChip = appendCfValueChip;
    ctx.removeCfValueChip = removeCfValueChip;
    ctx.refreshCfValueBtn = refreshCfValueBtn;
    ctx.findCfChipFromEventTarget = findCfChipFromEventTarget;
    ctx.bindCfValueTrigger = bindCfValueTrigger;
    ctx.ensureCfValueShell = ensureCfValueShell;
    ctx.rebuildCfValueUi = rebuildCfValueUi;
  };
})(typeof window !== 'undefined' ? window : this);
