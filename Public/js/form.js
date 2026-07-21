/* Smart Search – form.js */
(function (global) {
  'use strict';
  var SS = global.SmartSearch = global.SmartSearch || {};

  SS.onReady(function () {
    try {
      var S = SS.initShared();
      var fieldsUrl = S.fieldsUrl;
      var presetsUrl = S.presetsUrl;
      var clearNode = S.clearNode;
      var FORM_STORAGE_KEY = S.FORM_STORAGE_KEY;
      var getDefaultFormState = S.getDefaultFormState;
      var normalizeAssigneeIds = S.normalizeAssigneeIds;
      var getCsrfToken = S.getCsrfToken;
      var truncateSummary = S.truncateSummary || function (text, maxLen) {
        text = (text || '').toString().replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
        maxLen = maxLen || 100;
        if (text.length <= maxLen) return text;
        return text.slice(0, Math.max(0, maxLen - 1)).replace(/\s+\S*$/, '') + '…';
      };
      var hasDefinedFiltersShared = S.hasDefinedFilters;
      var I18N = S.I18N || {};
      var smartUrl = S.smartUrl;

      function bindsmartsearchMailboxFields() {
        try {
          var form = document.querySelector('form.smartsearch-form');
          if (!form) return;

          var grid = form.querySelector('.smartsearch-filter-grid');
          var fieldsCache = [];
          var cfRowsHost = form.querySelector('.smartsearch-cf-rows');
          var chooseValuesLabel = (cfRowsHost && cfRowsHost.getAttribute('data-choose-values'))
            || I18N.chooseValues
            || 'Choose values…';
          try {
            var fieldsHost = form.querySelector('.smartsearch-cf-rows[data-fields]')
              || form.querySelector('[data-fields]')
              || grid;
            if (fieldsHost && fieldsHost.getAttribute('data-fields')) {
              fieldsCache = JSON.parse(fieldsHost.getAttribute('data-fields') || '[]') || [];
            }
            if (fieldsHost && fieldsHost.getAttribute('data-choose-values')) {
              chooseValuesLabel = fieldsHost.getAttribute('data-choose-values');
            }
          } catch (e0) {
            fieldsCache = [];
          }

          var ctx = {
            form: form,
            grid: grid,
            fieldsCache: fieldsCache,
            openTilePanel: null,
            openCfValueWrap: null,
            chooseValuesLabel: chooseValuesLabel,
            fieldsUrlLocal: fieldsUrl,
            presetsUrl: presetsUrl,
            clearNode: clearNode,
            I18N: I18N,
            FORM_STORAGE_KEY: FORM_STORAGE_KEY,
            getDefaultFormState: getDefaultFormState,
            normalizeAssigneeIds: normalizeAssigneeIds,
            getCsrfToken: getCsrfToken,
            truncateSummary: truncateSummary,
            hasDefinedFiltersShared: hasDefinedFiltersShared,
            smartUrl: smartUrl
          };

          if (typeof SS.installFormTiles === 'function') SS.installFormTiles(ctx);
          if (typeof SS.installFormAdvanced === 'function') SS.installFormAdvanced(ctx);
          if (typeof SS.installFormCfValues === 'function') SS.installFormCfValues(ctx);
          if (typeof SS.installFormCf === 'function') SS.installFormCf(ctx);
          if (typeof SS.installFormState === 'function') SS.installFormState(ctx);
          if (typeof SS.installFormPresets === 'function') SS.installFormPresets(ctx);

          function fetchFields() {
            if (!ctx.fieldsUrlLocal) return;
            var mailboxId = ctx.selectedRadioValue('mailbox_id', '0');
            var xhr = new XMLHttpRequest();
            xhr.open('GET', ctx.fieldsUrlLocal + '?mailbox_id=' + encodeURIComponent(mailboxId), true);
            xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
            xhr.setRequestHeader('Cache-Control', 'no-cache');
            xhr.onreadystatechange = function () {
              if (xhr.readyState !== 4) return;
              var payload = {};
              try { payload = JSON.parse(xhr.responseText || '{}'); } catch (e) { payload = {}; }
              ctx.fieldsCache = (payload && payload.fields) ? payload.fields : [];
              // Refresh option lists in existing CF rows (keep selected ids).
              var rows = form.querySelectorAll('.smartsearch-cf-row');
              var i;
              for (i = 0; i < rows.length; i++) {
                var sel = rows[i].querySelector('select.smartsearch-cf-id');
                if (!sel) continue;
                var selected = sel.value || '0';
                while (sel.firstChild) sel.removeChild(sel.firstChild);
                var empty = document.createElement('option');
                empty.value = '0';
                empty.appendChild(document.createTextNode(I18N.chooseField || 'Choose field…'));
                sel.appendChild(empty);
                var j;
                for (j = 0; j < ctx.fieldsCache.length; j++) {
                  var opt = document.createElement('option');
                  opt.value = String(ctx.fieldsCache[j].id || 0);
                  opt.setAttribute('data-type', String(ctx.fieldsCache[j].type || 0));
                  opt.appendChild(document.createTextNode(String(ctx.fieldsCache[j].name || '')));
                  if (opt.value === selected) opt.selected = true;
                  sel.appendChild(opt);
                }
                if (!sel.value) sel.value = '0';
                ctx.rebuildCfValues(rows[i], true);
              }
              ctx.refreshCfSummary();
            };
            xhr.send(null);
          }
          ctx.fetchFields = fetchFields;

          ctx.bindTiles();
          ctx.bindMoreToggle();
          ctx.bindAdvancedTiles();
          ctx.bindResetButton();
          ctx.bindPresetControls();

          var statusChecks = form.querySelector('.smartsearch-status-checks');
          if (statusChecks) {
            statusChecks.addEventListener('change', function () {
              ctx.refreshStatusPills();
              ctx.persistFormState();
            });
          }
          var assigneeChecks = form.querySelector('.smartsearch-assignee-checks');
          if (assigneeChecks) {
            assigneeChecks.addEventListener('change', function () {
              ctx.refreshAssigneePills();
              ctx.persistFormState();
            });
          }
          ctx.bindOptionList('mailbox_id', '.smartsearch-tile-mailbox-label', function () {
            fetchFields();
            ctx.persistFormState();
          });
          ctx.bindOptionList('folder_id', '.smartsearch-tile-folder-label', ctx.persistFormState);
          ctx.bindOptionList('waiting_reply', '.smartsearch-tile-waiting-label', ctx.persistFormState);
          ctx.bindOptionList('has_attachments', '.smartsearch-tile-attachments-label', ctx.persistFormState);

          var cfRows = form.querySelectorAll('.smartsearch-cf-row');
          var ri;
          for (ri = 0; ri < cfRows.length; ri++) ctx.bindCfRow(cfRows[ri]);
          var addBtn = form.querySelector('.smartsearch-cf-add');
          if (addBtn) addBtn.addEventListener('click', function () {
            ctx.addCfRow();
            ctx.persistFormState();
          });

          // On submit, drop empty CF rows (id=0) so they don't pollute the query.
          form.addEventListener('submit', function () {
            var rows = form.querySelectorAll('.smartsearch-cf-row');
            var i;
            for (i = 0; i < rows.length; i++) {
              var sel = rows[i].querySelector('select.smartsearch-cf-id');
              if (sel && (!sel.value || sel.value === '0')) {
                var inputs = rows[i].querySelectorAll('input, select');
                var j;
                for (j = 0; j < inputs.length; j++) inputs[j].disabled = true;
              }
            }
            ctx.persistFormState();
          });

          form.addEventListener('change', function () {
            ctx.persistFormState();
          });

          ctx.refreshStatusPills();
          ctx.refreshAssigneePills();
          ctx.refreshScopePills();
          ctx.refreshTagsPills();
          ctx.refreshDateLabel();
          ctx.refreshCustomerLabel();
          ctx.refreshCfSummary();
          ctx.refreshPresetSaveVisibility();
          if (ctx.fieldsUrlLocal) fetchFields();
          if (ctx.shouldRestoreSavedState()) {
            ctx.restoreFormStateIfNeeded();
          } else {
            // Keep saved state in sync with the submitted search.
            ctx.persistFormState();
          }
        } catch (e) {
          // Never break the Smart Search page.
        }
      }

      bindsmartsearchMailboxFields();
    } catch (e) {}
  });

})(typeof window !== 'undefined' ? window : this);
