/* Smart Search – form-state.js */
(function (global) {
  'use strict';
  var SS = global.SmartSearch = global.SmartSearch || {};

  /**
   * Form state collect / apply / persist / restore / reset.
   * Called from form.js after installFormCf.
   */
  SS.installFormState = function (ctx) {
    var form = ctx.form;
    var STORAGE_KEY = ctx.FORM_STORAGE_KEY;
    var normalizeAssigneeIds = ctx.normalizeAssigneeIds;
    var getDefaultFormState = ctx.getDefaultFormState;
    var hasDefinedFiltersShared = ctx.hasDefinedFiltersShared;
    var smartUrl = ctx.smartUrl;

    function collectCheckedValues(selector) {
      var nodes = form.querySelectorAll(selector);
      var out = [];
      var i;
      for (i = 0; i < nodes.length; i++) {
        if (nodes[i].checked) out.push(String(nodes[i].value || ''));
      }
      return out;
    }

    function labelForInput(input) {
      if (!input) return '';
      var lab = input.closest ? input.closest('label') : null;
      if (!lab && input.parentNode && input.parentNode.tagName && input.parentNode.tagName.toLowerCase() === 'label') {
        lab = input.parentNode;
      }
      var text = lab ? String(lab.textContent || '') : String(input.value || '');
      return text.replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
    }

    function collectCheckedLabels(selector) {
      var nodes = form.querySelectorAll(selector);
      var out = [];
      var i;
      for (i = 0; i < nodes.length; i++) {
        if (!nodes[i].checked) continue;
        var lab = labelForInput(nodes[i]);
        if (lab) out.push(lab);
      }
      return out;
    }

    function selectedRadioLabel(name, fallback) {
      var checked = form.querySelector('input[type="radio"][name="' + name + '"]:checked');
      if (!checked) return fallback || '';
      return labelForInput(checked) || fallback || '';
    }

    function collectCfValueLabels(row) {
      var out = [];
      var checks = row.querySelectorAll('.smartsearch-cf-value-ui input[type="checkbox"]:checked');
      var i;
      for (i = 0; i < checks.length; i++) {
        var lab = labelForInput(checks[i]);
        if (lab) out.push(lab);
      }
      if (out.length) return out;
      var inputs = row.querySelectorAll('.smartsearch-cf-value-ui input[type="text"], .smartsearch-cf-value-ui input[type="number"], .smartsearch-cf-value-ui input[type="date"]');
      for (i = 0; i < inputs.length; i++) {
        var raw = String(inputs[i].value || '').replace(/^\s+|\s+$/g, '');
        if (raw) out.push(raw);
      }
      return out;
    }

    function collectFormState() {
      var qInp = form.querySelector('input[name="q"]');
      var moreBtn = form.querySelector('.smartsearch-more-toggle');
      var dateField = form.querySelector('select[name="date_field"]');
      var dateFrom = form.querySelector('input[name="date_from"]');
      var dateTo = form.querySelector('input[name="date_to"]');
      // Extension point: select[name=date_preset] may be absent.
      var datePreset = form.querySelector('select[name="date_preset"]');
      var customerInp = form.querySelector('input[name="customer_q"]');
      var cf = [];
      var rows = form.querySelectorAll('.smartsearch-cf-row');
      var i;
      for (i = 0; i < rows.length; i++) {
        var sel = rows[i].querySelector('select.smartsearch-cf-id');
        if (!sel || !sel.value || sel.value === '0') continue;
        var state = ctx.collectCfRowState(rows[i]);
        var opt = sel.options[sel.selectedIndex];
        var fieldName = opt ? String(opt.text || '').replace(/^\s+|\s+$/g, '') : '';
        cf.push({
          id: String(sel.value),
          op: state.op || '',
          values: state.values || [],
          name: fieldName,
          value_labels: collectCfValueLabels(rows[i])
        });
      }
      return {
        q: qInp ? String(qInp.value || '') : '',
        mailbox_id: ctx.selectedRadioValue('mailbox_id', '0'),
        mailbox_label: selectedRadioLabel('mailbox_id', ''),
        status: collectCheckedValues('.smartsearch-status-checks input[type="checkbox"]'),
        status_labels: collectCheckedLabels('.smartsearch-status-checks input[type="checkbox"]'),
        assignee_id: collectCheckedValues('.smartsearch-assignee-checks input[type="checkbox"]'),
        assignee_labels: collectCheckedLabels('.smartsearch-assignee-checks input[type="checkbox"]'),
        folder_id: ctx.selectedRadioValue('folder_id', '0'),
        folder_label: selectedRadioLabel('folder_id', ''),
        sort: (function () {
          var sortInp = form.querySelector('input.smartsearch-sort-input[name="sort"]');
          if (sortInp && sortInp.value) return String(sortInp.value);
          try {
            var fromUrl = new URLSearchParams(window.location.search || '').get('sort');
            if (fromUrl) return String(fromUrl);
          } catch (eSort) {}
          return 'updated_desc';
        })(),
        date_field: dateField ? String(dateField.value || 'updated') : 'updated',
        date_from: dateFrom ? String(dateFrom.value || '') : '',
        date_to: dateTo ? String(dateTo.value || '') : '',
        date_preset: datePreset ? String(datePreset.value || '') : '',
        customer_q: customerInp ? String(customerInp.value || '') : '',
        waiting_reply: ctx.selectedRadioValue('waiting_reply', ''),
        waiting_reply_label: selectedRadioLabel('waiting_reply', ''),
        has_attachments: ctx.selectedRadioValue('has_attachments', ''),
        has_attachments_label: selectedRadioLabel('has_attachments', ''),
        search_in: collectCheckedValues('.smartsearch-scope-checks input[type="checkbox"]'),
        tag_ids: collectCheckedValues('.smartsearch-tags-checks input[type="checkbox"]'),
        tag_labels: collectCheckedLabels('.smartsearch-tags-checks input[type="checkbox"]'),
        cf_filters: cf,
        more_open: moreBtn ? moreBtn.getAttribute('data-expanded') === '1' : false
      };
    }

    function hasDefinedFilters(state) {
      state = state || collectFormState();
      if (typeof hasDefinedFiltersShared === 'function') {
        return !!hasDefinedFiltersShared(state);
      }
      return false;
    }

    function persistFormState() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(collectFormState()));
      } catch (ePersist) {}
      if (typeof ctx.refreshPresetSaveVisibility === 'function') {
        ctx.refreshPresetSaveVisibility();
      }
    }

    function setRadioValue(name, value) {
      var radios = form.querySelectorAll('input[type="radio"][name="' + name + '"]');
      var i;
      var found = false;
      for (i = 0; i < radios.length; i++) {
        if (String(radios[i].value) === String(value)) {
          radios[i].checked = true;
          found = true;
        } else {
          radios[i].checked = false;
        }
      }
      if (!found && radios.length) {
        radios[0].checked = true;
      }
    }

    function setCheckedValues(selector, values) {
      var map = {};
      var i;
      values = values || [];
      for (i = 0; i < values.length; i++) map[String(values[i])] = true;
      var nodes = form.querySelectorAll(selector);
      for (i = 0; i < nodes.length; i++) {
        nodes[i].checked = !!map[String(nodes[i].value || '')];
      }
    }

    function applyFormState(state) {
      if (!state || typeof state !== 'object') return;
      var qInp = form.querySelector('input[name="q"]');
      if (qInp && typeof state.q === 'string') qInp.value = state.q;

      if (typeof state.mailbox_id !== 'undefined') setRadioValue('mailbox_id', state.mailbox_id);
      if (state.status) setCheckedValues('.smartsearch-status-checks input[type="checkbox"]', state.status);
      if (typeof state.assignee_id !== 'undefined') {
        setCheckedValues('.smartsearch-assignee-checks input[type="checkbox"]', normalizeAssigneeIds(state.assignee_id));
      }
      if (typeof state.folder_id !== 'undefined') setRadioValue('folder_id', state.folder_id);
      if (typeof state.sort !== 'undefined') {
        var sortInp = form.querySelector('input.smartsearch-sort-input[name="sort"]');
        if (sortInp) sortInp.value = String(state.sort || 'updated_desc');
      }
      if (typeof state.waiting_reply !== 'undefined') setRadioValue('waiting_reply', state.waiting_reply);
      if (typeof state.has_attachments !== 'undefined') setRadioValue('has_attachments', state.has_attachments);

      var dateField = form.querySelector('select[name="date_field"]');
      var dateFrom = form.querySelector('input[name="date_from"]');
      var dateTo = form.querySelector('input[name="date_to"]');
      // Extension point: select[name=date_preset] may be absent.
      var datePresetEl = form.querySelector('select[name="date_preset"]');
      var customerInp = form.querySelector('input[name="customer_q"]');
      if (dateField && state.date_field) dateField.value = state.date_field;
      if (datePresetEl) {
        datePresetEl.value = (typeof state.date_preset !== 'undefined') ? String(state.date_preset || '') : '';
      }
      // Relative preset always re-resolves to "today-relative" absolute dates.
      if (datePresetEl && datePresetEl.value && typeof ctx.applyPresetToInputs === 'function') {
        ctx.applyPresetToInputs(datePresetEl.value);
      } else {
        if (dateFrom) dateFrom.value = state.date_from || '';
        if (dateTo) dateTo.value = state.date_to || '';
      }
      if (customerInp) customerInp.value = state.customer_q || '';

      if (state.search_in && state.search_in.length) {
        setCheckedValues('.smartsearch-scope-checks input[type="checkbox"]', state.search_in);
      } else if (state.search_in) {
        setCheckedValues('.smartsearch-scope-checks input[type="checkbox"]', ['subject', 'messages', 'notes']);
      }
      if (state.tag_ids) setCheckedValues('.smartsearch-tags-checks input[type="checkbox"]', state.tag_ids);

      // Restore CF filters.
      var wrap = form.querySelector('.smartsearch-cf-rows');
      var filters = state.cf_filters || [];
      if (wrap) {
        var rows = wrap.querySelectorAll('.smartsearch-cf-row');
        while (rows.length > 1) {
          wrap.removeChild(rows[rows.length - 1]);
          rows = wrap.querySelectorAll('.smartsearch-cf-row');
        }
        var first = wrap.querySelector('.smartsearch-cf-row');
        if (first) {
          var sel0 = first.querySelector('select.smartsearch-cf-id');
          if (sel0) sel0.value = '0';
          ctx.rebuildCfValues(first);
        }
        var fi;
        for (fi = 0; fi < filters.length; fi++) {
          if (fi > 0) ctx.addCfRow();
          rows = wrap.querySelectorAll('.smartsearch-cf-row');
          var row = rows[fi] || rows[rows.length - 1];
          if (!row) continue;
          var sel = row.querySelector('select.smartsearch-cf-id');
          if (!sel) continue;
          sel.value = String(filters[fi].id || '0');
          ctx.rebuildCfValues(row);
          ctx.applyCfRowState(row, {
            op: filters[fi].op || '',
            values: filters[fi].values || []
          });
        }
        ctx.reindexCfRows();
      }

      ctx.refreshSelectTile('mailbox_id', '.smartsearch-tile-mailbox-label');
      ctx.refreshSelectTile('folder_id', '.smartsearch-tile-folder-label');
      ctx.refreshSelectTile('waiting_reply', '.smartsearch-tile-waiting-label');
      ctx.refreshSelectTile('has_attachments', '.smartsearch-tile-attachments-label');
      ctx.refreshStatusPills();
      ctx.refreshAssigneePills();
      ctx.refreshScopePills();
      ctx.refreshTagsPills();
      ctx.refreshDateLabel();
      ctx.refreshCustomerLabel();
      ctx.refreshCfSummary();
      ctx.setMoreOpen(!!state.more_open);
      if (typeof ctx.refreshPresetSaveVisibility === 'function') {
        ctx.refreshPresetSaveVisibility();
      }
    }

    function shouldRestoreSavedState() {
      try {
        var params = new URLSearchParams(window.location.search || '');
        // Only on bare open (navbar "more"). Never overwrite a real search URL.
        var q = (params.get('q') || '').replace(/^\s+|\s+$/g, '');
        return !params.has('ss') && !q;
      } catch (eShould) {
        return true;
      }
    }

    function restoreFormStateIfNeeded() {
      if (!shouldRestoreSavedState()) return;
      var raw = null;
      try { raw = localStorage.getItem(STORAGE_KEY); } catch (eGet) { raw = null; }
      if (!raw) return;
      var state = null;
      try { state = JSON.parse(raw); } catch (eParse) { state = null; }
      if (!state) return;
      applyFormState(state);
    }

    function hideSearchResults() {
      var section = document.querySelector('.smartsearch-results-section');
      if (section) {
        section.hidden = true;
        section.setAttribute('aria-hidden', 'true');
      }
      // Drop search params so a refresh matches the idle form.
      try {
        var bare = (smartUrl || '').toString();
        if (!bare) {
          bare = window.location.pathname || '/smart-search';
        } else {
          bare = bare.split('?')[0];
        }
        if (window.history && typeof window.history.replaceState === 'function') {
          window.history.replaceState({}, document.title, bare);
        }
      } catch (eUrl) {}
    }

    function resetFormState() {
      ctx.closeAllTiles(null);
      // Restore module defaults (same as first page load), not an empty form.
      applyFormState(getDefaultFormState());
      persistFormState();
      hideSearchResults();
      if (typeof ctx.setPresetSaveOpen === 'function') ctx.setPresetSaveOpen(false);
      if (typeof ctx.setPresetLoadOpen === 'function') ctx.setPresetLoadOpen(false);
      if (ctx.fieldsUrlLocal && typeof ctx.fetchFields === 'function') ctx.fetchFields();
    }

    function bindResetButton() {
      var btn = form.querySelector('.smartsearch-reset');
      if (!btn) return;
      btn.addEventListener('click', function (ev) {
        ev.preventDefault();
        resetFormState();
      });
      document.addEventListener('smartsearch:reset-filters', function () {
        try { resetFormState(); } catch (eResetEvt) {}
      });
    }

    ctx.collectCheckedValues = collectCheckedValues;
    ctx.labelForInput = labelForInput;
    ctx.collectCheckedLabels = collectCheckedLabels;
    ctx.selectedRadioLabel = selectedRadioLabel;
    ctx.collectCfValueLabels = collectCfValueLabels;
    ctx.collectFormState = collectFormState;
    ctx.hasDefinedFilters = hasDefinedFilters;
    ctx.persistFormState = persistFormState;
    ctx.setRadioValue = setRadioValue;
    ctx.setCheckedValues = setCheckedValues;
    ctx.applyFormState = applyFormState;
    ctx.shouldRestoreSavedState = shouldRestoreSavedState;
    ctx.restoreFormStateIfNeeded = restoreFormStateIfNeeded;
    ctx.hideSearchResults = hideSearchResults;
    ctx.resetFormState = resetFormState;
    ctx.bindResetButton = bindResetButton;
  };
})(typeof window !== 'undefined' ? window : this);
