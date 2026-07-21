/* Smart Search – core.js */
(function (global) {
  'use strict';
  var SS = global.SmartSearch = global.SmartSearch || {};

  SS.onReady = function (fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      fn();
    }
  };

  SS.initShared = function () {
    if (SS._sharedReady) {
      return SS;
    }
        var cfg = document.getElementById('smartsearch-config');
        var smartUrl = cfg ? (cfg.getAttribute('data-search-url') || '') : '';
        var suggestUrl = cfg ? (cfg.getAttribute('data-suggest-url') || '') : '';
        // Default to NOT touching core search if config node is missing.
        // (Fail-safe for unexpected layouts / older FreeScout versions.)
        var useCore = cfg ? (cfg.getAttribute('data-use-core') === '1') : false;
        var hideCore = cfg ? (cfg.getAttribute('data-hide-core') === '1') : false;
        var showInline = cfg ? (cfg.getAttribute('data-show-inline') === '1') : true;

        // Lightweight i18n (CSP-safe): strings are rendered server-side into data-* attrs.
        function getCfgAttr(name, fallback) {
          try {
            if (!cfg) return fallback;
            var v = cfg.getAttribute(name);
            if (typeof v !== 'string') return fallback;
            v = v.toString();
            return v ? v : fallback;
          } catch (e) {
            return fallback;
          }
        }

        function clearNode(node) {
          try {
            while (node && node.firstChild) {
              node.removeChild(node.firstChild);
            }
          } catch (e) {}
        }
        var fieldsUrl = cfg ? (cfg.getAttribute('data-fields-url') || '') : '';
        var recentMetaUrl = cfg ? (cfg.getAttribute('data-recent-meta-url') || '') : '';
        var presetsUrl = cfg ? (cfg.getAttribute('data-presets-url') || '') : '';
        var FORM_STORAGE_KEY = 'freescout.smartsearch.form.v1';
        var defaultStatuses = [];
        var defaultMailboxId = '0';
        try {
          defaultStatuses = JSON.parse(getCfgAttr('data-default-statuses', '[1,2]')) || [];
        } catch (eDefSt) {
          defaultStatuses = [1, 2];
        }
        if (!Array.isArray(defaultStatuses)) defaultStatuses = [1, 2];
        defaultStatuses = defaultStatuses.map(function (v) { return String(v); });
        defaultMailboxId = String(getCfgAttr('data-default-mailbox-id', '0') || '0');

        function getDefaultFormState() {
          return {
            q: '',
            mailbox_id: defaultMailboxId,
            status: defaultStatuses.slice(),
            assignee_id: [],
            folder_id: '0',
            sort: 'updated_desc',
            date_field: 'updated',
            date_preset: '',
            date_from: '',
            date_to: '',
            customer_q: '',
            waiting_reply: '',
            has_attachments: '',
            search_in: ['subject', 'messages', 'notes'],
            tag_ids: [],
            cf_filters: [],
            more_open: false
          };
        }

        function readSavedFormState() {
          try {
            var raw = localStorage.getItem(FORM_STORAGE_KEY);
            if (!raw) return null;
            var state = JSON.parse(raw);
            return (state && typeof state === 'object') ? state : null;
          } catch (eRead) {
            return null;
          }
        }

        function getSearchFormState() {
          return readSavedFormState() || getDefaultFormState();
        }

        function normalizeAssigneeIds(value) {
          if (Array.isArray(value)) {
            return value.map(function (v) { return String(v); }).filter(function (v) {
              return v !== '' && v !== '0';
            });
          }
          if (typeof value === 'undefined' || value === null || value === '' || String(value) === '0') {
            return [];
          }
          return [String(value)];
        }

        function appendFormStateToParams(params, state) {
          if (!params || !state) return params;
          params.set('ss', '1');
          if (typeof state.mailbox_id !== 'undefined') params.set('mailbox_id', String(state.mailbox_id));
          var statuses = state.status || [];
          var i;
          for (i = 0; i < statuses.length; i++) params.append('status[]', String(statuses[i]));
          var assigneeIds = normalizeAssigneeIds(state.assignee_id);
          for (i = 0; i < assigneeIds.length; i++) params.append('assignee_id[]', String(assigneeIds[i]));
          if (typeof state.folder_id !== 'undefined') params.set('folder_id', String(state.folder_id));
          if (state.sort) params.set('sort', String(state.sort));
          if (state.date_field) params.set('date_field', String(state.date_field));
          if (state.date_preset) params.set('date_preset', String(state.date_preset));
          if (state.date_from) params.set('date_from', String(state.date_from));
          if (state.date_to) params.set('date_to', String(state.date_to));
          if (state.customer_q) params.set('customer_q', String(state.customer_q));
          if (typeof state.waiting_reply !== 'undefined') params.set('waiting_reply', String(state.waiting_reply));
          if (typeof state.has_attachments !== 'undefined') params.set('has_attachments', String(state.has_attachments));
          var searchIn = state.search_in || [];
          for (i = 0; i < searchIn.length; i++) params.append('search_in[]', String(searchIn[i]));
          var tagIds = state.tag_ids || [];
          for (i = 0; i < tagIds.length; i++) params.append('tag_ids[]', String(tagIds[i]));
          var cfs = state.cf_filters || [];
          for (i = 0; i < cfs.length; i++) {
            var cf = cfs[i] || {};
            if (!cf.id || String(cf.id) === '0') continue;
            params.set('cf_filters[' + i + '][id]', String(cf.id));
            if (cf.op) params.set('cf_filters[' + i + '][op]', String(cf.op));
            var vals = cf.values || [];
            var vi;
            for (vi = 0; vi < vals.length; vi++) {
              if (vals[vi] === '' || typeof vals[vi] === 'undefined') continue;
              params.append('cf_filters[' + i + '][values][]', String(vals[vi]));
            }
          }
          return params;
        }

        function buildSmartSearchUrl(q, state) {
          var base = smartUrl || '';
          var params = new URLSearchParams();
          var qVal = (q || '').toString().replace(/^\s+|\s+$/g, '');
          if (qVal) params.set('q', qVal);
          appendFormStateToParams(params, state || getSearchFormState());
          var qs = params.toString();
          if (!base) return qs ? ('?' + qs) : '';
          return base + (base.indexOf('?') >= 0 ? '&' : '?') + qs;
        }

        // Lightweight i18n: prefer FreeScout Lang.get (js.lang.messages), fallback to data-* attrs.
        function langMsg(key, fallback) {
          try {
            if (typeof Lang !== 'undefined' && typeof Lang.get === 'function') {
              var v = Lang.get('messages.' + key);
              if (typeof v === 'string' && v && v.indexOf('messages.') !== 0) {
                return v;
              }
            }
          } catch (e0) {}
          return fallback;
        }

        var I18N = {
          inlinePlaceholder: langMsg('ss_inline_placeholder', getCfgAttr('data-i18n-inline-placeholder', 'Search…')),
          focusSearch: langMsg('ss_focus_search', getCfgAttr('data-i18n-focus-search', 'Focus search')),
          opensmartsearch: langMsg('ss_open_smart_search', getCfgAttr('data-i18n-open-smart-search', 'Open Smart Search')),
          suggestions: langMsg('ss_suggestions', getCfgAttr('data-i18n-suggestions', 'Suggestions')),
          searchSmartFor: langMsg('ss_search_smart_for', getCfgAttr('data-i18n-search-smart-for', 'Search Smart Search for “:q”')),
          enter: langMsg('ss_enter', getCfgAttr('data-i18n-enter', 'Enter')),
          recentSearches: langMsg('ss_recent_searches', getCfgAttr('data-i18n-recent-searches', 'Recent searches')),
          search: langMsg('ss_search', getCfgAttr('data-i18n-search', 'Search')),
          chooseField: langMsg('ss_choose_field', getCfgAttr('data-i18n-choose-field', 'Choose field…')),
          loadingFields: langMsg('ss_loading_fields', getCfgAttr('data-i18n-loading-fields', 'Loading fields…')),
          loadingRecent: langMsg('ss_loading_recent', getCfgAttr('data-i18n-loading-recent', 'Loading…')),
          fieldValuesHint: langMsg('ss_field_values_hint', getCfgAttr('data-i18n-field-values-hint', 'Select one or more values (OR).')),
          fieldValuesTextPlaceholder: langMsg('ss_field_values_text_placeholder', getCfgAttr('data-i18n-field-values-text-placeholder', 'Value1, Value2…')),
          anyStatus: langMsg('ss_any_status', getCfgAttr('data-i18n-any-status', 'Any status')),
          anyAssignee: langMsg('ss_any_assignee', getCfgAttr('data-i18n-any-assignee', 'Any assignee')),
          showMore: langMsg('ss_show_more', getCfgAttr('data-i18n-show-more', 'Show more options')),
          hideMore: langMsg('ss_hide_more', getCfgAttr('data-i18n-hide-more', 'Hide more options')),
          operator: langMsg('ss_operator', getCfgAttr('data-i18n-operator', 'Operator')),
          emptyNotSet: langMsg('ss_empty_not_set', getCfgAttr('data-i18n-empty-not-set', 'Empty / not set')),
          valuePlaceholder: langMsg('ss_value_placeholder', getCfgAttr('data-i18n-value-placeholder', 'Value')),
          fromLabel: langMsg('ss_from', getCfgAttr('data-i18n-from', 'From')),
          toLabel: langMsg('ss_to', getCfgAttr('data-i18n-to', 'To')),
          opIs: langMsg('ss_op_is', getCfgAttr('data-i18n-op-is', 'is')),
          opContains: langMsg('ss_op_contains', getCfgAttr('data-i18n-op-contains', 'contains')),
          opEquals: langMsg('ss_op_equals', getCfgAttr('data-i18n-op-equals', 'equals')),
          opGt: langMsg('ss_op_gt', getCfgAttr('data-i18n-op-gt', 'greater than')),
          opLt: langMsg('ss_op_lt', getCfgAttr('data-i18n-op-lt', 'less than')),
          opBetween: langMsg('ss_op_between', getCfgAttr('data-i18n-op-between', 'between')),
          opOn: langMsg('ss_op_on', getCfgAttr('data-i18n-op-on', 'on')),
          opBefore: langMsg('ss_op_before', getCfgAttr('data-i18n-op-before', 'before')),
          opAfter: langMsg('ss_op_after', getCfgAttr('data-i18n-op-after', 'after')),
          opContainsAny: langMsg('ss_op_contains_any', getCfgAttr('data-i18n-op-contains-any', 'contains any')),
          chooseValues: langMsg('ss_choose_values', getCfgAttr('data-i18n-choose-values', 'Choose values…')),
          anyValue: langMsg('ss_any_value', getCfgAttr('data-i18n-any-value', 'Any value')),
          any: langMsg('ss_any', getCfgAttr('data-i18n-any', 'Any')),
          reset: langMsg('ss_reset', getCfgAttr('data-i18n-reset', 'Reset')),
          resetFilters: langMsg('ss_reset_filters', getCfgAttr('data-i18n-reset-filters', 'Reset filters')),
          restoreDefaults: langMsg('ss_restore_defaults', getCfgAttr('data-i18n-restore-defaults', 'Restore defaults')),
          defaults: langMsg('ss_defaults', getCfgAttr('data-i18n-defaults', 'Defaults')),
          save: langMsg('ss_save', getCfgAttr('data-i18n-save', 'Save')),
          load: langMsg('ss_load', getCfgAttr('data-i18n-load', 'Load')),
          deleteLabel: langMsg('ss_delete', getCfgAttr('data-i18n-delete', 'Delete')),
          deletePresetConfirm: langMsg('ss_delete_preset_confirm', getCfgAttr('data-i18n-delete-preset-confirm', 'Delete this saved filter?')),
          apply: langMsg('ss_apply', getCfgAttr('data-i18n-apply', 'Apply')),
          nameRequired: langMsg('ss_name_required', getCfgAttr('data-i18n-name-required', 'Please enter a name.')),
          presetSaved: langMsg('ss_preset_saved', getCfgAttr('data-i18n-preset-saved', 'Filters saved.')),
          presetEmpty: langMsg('ss_preset_empty', getCfgAttr('data-i18n-preset-empty', 'No saved filters yet.')),
          subject: langMsg('ss_subject', getCfgAttr('data-i18n-subject', 'Subject')),
          messages: langMsg('ss_messages', getCfgAttr('data-i18n-messages', 'Messages')),
          notes: langMsg('ss_notes', getCfgAttr('data-i18n-notes', 'Notes')),
          lastUpdated: langMsg('ss_last_updated', getCfgAttr('data-i18n-last-updated', 'Last updated')),
          createdDate: langMsg('ss_created_date', getCfgAttr('data-i18n-created-date', 'Created date')),
          datePresetToday: langMsg('ss_date_preset_today', getCfgAttr('data-i18n-date-preset-today', 'Today')),
          datePresetYesterday: langMsg('ss_date_preset_yesterday', getCfgAttr('data-i18n-date-preset-yesterday', 'Yesterday')),
          datePresetLast7Days: langMsg('ss_date_preset_last_7_days', getCfgAttr('data-i18n-date-preset-last-7-days', 'Last 7 days')),
          datePresetLast30Days: langMsg('ss_date_preset_last_30_days', getCfgAttr('data-i18n-date-preset-last-30-days', 'Last 30 days')),
          datePresetThisMonth: langMsg('ss_date_preset_this_month', getCfgAttr('data-i18n-date-preset-this-month', 'This month')),
          datePresetLastMonth: langMsg('ss_date_preset_last_month', getCfgAttr('data-i18n-date-preset-last-month', 'Last month')),
          mailbox: langMsg('ss_mailbox', getCfgAttr('data-i18n-mailbox', 'Mailbox')),
          assignee: langMsg('ss_assignee', getCfgAttr('data-i18n-assignee', 'Assignee')),
          folder: langMsg('ss_folder', getCfgAttr('data-i18n-folder', 'Folder')),
          tags: langMsg('ss_tags', getCfgAttr('data-i18n-tags', 'Tags')),
          lastReply: langMsg('ss_last_reply', getCfgAttr('data-i18n-last-reply', 'Last reply')),
          attachments: langMsg('ss_attachments', getCfgAttr('data-i18n-attachments', 'Attachments')),
          filterPrefix: langMsg('ss_filter_prefix', getCfgAttr('data-i18n-filter-prefix', 'Active filters:'))
        };

        function getCsrfToken() {
          try {
            var meta = document.querySelector('meta[name="csrf-token"]');
            if (meta) {
              var t = meta.getAttribute('content');
              if (t) return String(t);
            }
            var inp = document.querySelector('input[name="_token"]');
            if (inp && inp.value) return String(inp.value);
          } catch (eCsrf) {}
          return '';
        }

        function writeFormStateToStorage(state) {
          try {
            localStorage.setItem(FORM_STORAGE_KEY, JSON.stringify(state || getDefaultFormState()));
          } catch (eWrite) {}
        }

        function emitResetFilters() {
          writeFormStateToStorage(getDefaultFormState());
          try {
            document.dispatchEvent(new CustomEvent('smartsearch:reset-filters'));
          } catch (eEvt) {}
        }

        function truncateSummary(text, maxLen) {
          text = (text || '').toString().replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
          maxLen = maxLen || 100;
          if (text.length <= maxLen) return text;
          return text.slice(0, Math.max(0, maxLen - 1)).replace(/\s+\S*$/, '') + '…';
        }

        function parseCfgJson(attrName, fallback) {
          var raw = getCfgAttr(attrName, '');
          if (!raw) return fallback;
          try {
            if (raw.indexOf('&quot;') >= 0 || raw.indexOf('&#') >= 0 || raw.indexOf('&amp;') >= 0) {
              var ta = document.createElement('textarea');
              ta.innerHTML = raw;
              raw = ta.value;
            }
            var parsed = JSON.parse(raw);
            return (parsed && typeof parsed === 'object') ? parsed : fallback;
          } catch (eParse) {
            return fallback;
          }
        }

        function getStatusLabelsMap() {
          return parseCfgJson('data-status-labels', {}) || {};
        }

        function getMailboxLabelsMap() {
          return parseCfgJson('data-mailbox-labels', {}) || {};
        }

        function labelFromMap(map, id, fallback) {
          if (!map || typeof map !== 'object') return fallback || String(id);
          var key = String(id);
          if (typeof map[key] === 'string' && map[key]) return map[key];
          if (typeof map[id] === 'string' && map[id]) return map[id];
          return fallback || key;
        }

        function sameStringSets(a, b) {
          var aa = (a || []).map(function (v) { return String(v); }).slice().sort();
          var bb = (b || []).map(function (v) { return String(v); }).slice().sort();
          if (aa.length !== bb.length) return false;
          var i;
          for (i = 0; i < aa.length; i++) {
            if (aa[i] !== bb[i]) return false;
          }
          return true;
        }

        function isDefaultFormState(state) {
          var def = getDefaultFormState();
          state = state || {};
          if (!sameStringSets(state.status, def.status)) return false;
          if (String(state.mailbox_id || '0') !== String(def.mailbox_id || '0')) return false;
          if (normalizeAssigneeIds(state.assignee_id).length) return false;
          if (String(state.folder_id || '0') !== '0') return false;
          if ((state.cf_filters || []).length) return false;
          if ((state.tag_ids || []).length) return false;
          if (String(state.customer_q || '') !== '') return false;
          if (String(state.date_preset || '') !== '') return false;
          if (String(state.date_from || '') !== '' || String(state.date_to || '') !== '') return false;
          if (String(state.date_field || 'updated') !== 'updated') return false;
          if (String(state.waiting_reply || '') !== '') return false;
          if (String(state.has_attachments || '') !== '') return false;
          var searchIn = state.search_in || [];
          var defSearch = def.search_in || ['subject', 'messages', 'notes'];
          if (!sameStringSets(searchIn.length ? searchIn : defSearch, defSearch)) return false;
          return true;
        }

        /** True when filters differ from module defaults (idle/reset baseline). */
        function hasDefinedFilters(state) {
          state = state || getSearchFormState();
          if (!state || typeof state !== 'object') return false;
          return !isDefaultFormState(state);
        }

        function buildFilterSummary(state, maxLen) {
          state = state || getSearchFormState();
          if (!state || typeof state !== 'object') return '';
          var parts = [];
          var statusLabels = getStatusLabelsMap();
          var mailboxLabels = getMailboxLabelsMap();
          var statuses = state.status || [];
          var statusNames = [];
          var si;
          for (si = 0; si < statuses.length; si++) {
            statusNames.push(labelFromMap(statusLabels, statuses[si], String(statuses[si])));
          }
          if (Array.isArray(state.status_labels) && state.status_labels.length) {
            parts.push(state.status_labels.join(', '));
          } else if (statusNames.length) {
            parts.push(statusNames.join(', '));
          } else {
            var defStatuses = (getDefaultFormState().status || []).map(String);
            if (!sameStringSets(statuses, defStatuses)) {
              parts.push(I18N.anyStatus || 'Any status');
            }
          }
          if (String(state.mailbox_id || '0') !== '0') {
            parts.push(
              state.mailbox_label
                || labelFromMap(mailboxLabels, state.mailbox_id, (I18N.mailbox || 'Mailbox'))
            );
          }
          var assigneeIds = normalizeAssigneeIds(state.assignee_id);
          if (assigneeIds.length) {
            var assigneeLabels = Array.isArray(state.assignee_labels) ? state.assignee_labels : [];
            if (assigneeLabels.length) {
              parts.push(assigneeLabels.join(', '));
            } else {
              parts.push((I18N.assignee || 'Assignee') + ' (' + assigneeIds.length + ')');
            }
          }
          if (String(state.folder_id || '0') !== '0') {
            parts.push(state.folder_label || (I18N.folder || 'Folder'));
          }
          var cfs = state.cf_filters || [];
          if (cfs.length) {
            var ci;
            for (ci = 0; ci < cfs.length; ci++) {
              var cf = cfs[ci] || {};
              var fieldName = (cf.name || '').toString().replace(/^\s+|\s+$/g, '');
              if (!fieldName) fieldName = (I18N.chooseField || 'Field');
              var valLabels = Array.isArray(cf.value_labels) ? cf.value_labels : [];
              if (!valLabels.length && Array.isArray(cf.values)) {
                valLabels = cf.values.filter(function (v) { return String(v || '') !== ''; }).map(String);
              }
              if (cf.op === 'empty') {
                parts.push(fieldName + ' ' + (I18N.emptyNotSet || '∅'));
              } else if (valLabels.length) {
                parts.push(fieldName + '=' + valLabels.join('|'));
              } else {
                parts.push(fieldName);
              }
            }
          }
          if ((state.tag_ids || []).length) {
            var tagLabels = Array.isArray(state.tag_labels) ? state.tag_labels : [];
            parts.push(tagLabels.length ? tagLabels.join(', ') : (I18N.tags || 'Tags'));
          }
          if (String(state.customer_q || '') !== '') {
            parts.push(String(state.customer_q));
          }
          if (String(state.date_preset || '') !== '' || String(state.date_from || '') !== '' || String(state.date_to || '') !== '') {
            var dateBasis = String(state.date_field || 'updated') === 'created'
              ? (I18N.createdDate || 'Created')
              : (I18N.lastUpdated || 'Updated');
            var presetKey = String(state.date_preset || '');
            var presetLabels = {
              today: I18N.datePresetToday || 'Today',
              yesterday: I18N.datePresetYesterday || 'Yesterday',
              last_7_days: I18N.datePresetLast7Days || 'Last 7 days',
              last_30_days: I18N.datePresetLast30Days || 'Last 30 days',
              this_month: I18N.datePresetThisMonth || 'This month',
              last_month: I18N.datePresetLastMonth || 'Last month'
            };
            if (presetKey && presetLabels[presetKey]) {
              parts.push(dateBasis + ' ' + presetLabels[presetKey]);
            } else {
              parts.push(dateBasis + ' ' + (state.date_from || '…') + '–' + (state.date_to || '…'));
            }
          }
          if (String(state.waiting_reply || '') !== '') {
            parts.push(state.waiting_reply_label || (I18N.lastReply || 'Last reply'));
          }
          if (String(state.has_attachments || '') !== '') {
            parts.push(state.has_attachments_label || (I18N.attachments || 'Attachments'));
          }
          var searchIn = state.search_in || [];
          if (searchIn.length && searchIn.length < 3) {
            var scopeBits = [];
            var sc;
            for (sc = 0; sc < searchIn.length; sc++) {
              var key = String(searchIn[sc]);
              if (key === 'subject') scopeBits.push(I18N.subject || 'Subject');
              else if (key === 'messages') scopeBits.push(I18N.messages || 'Messages');
              else if (key === 'notes') scopeBits.push(I18N.notes || 'Notes');
              else scopeBits.push(key);
            }
            if (scopeBits.length) parts.push(scopeBits.join('+'));
          }
          return truncateSummary(parts.join(' · '), maxLen || 220);
        }

        function formatSearchSmartFor(q) {
          try {
            if (typeof Lang !== 'undefined' && typeof Lang.get === 'function') {
              var v = Lang.get('messages.ss_search_smart_for', { q: q });
              if (typeof v === 'string' && v && v.indexOf('messages.') !== 0) {
                return v;
              }
            }
          } catch (e1) {}
          return (I18N.searchSmartFor || '').replace(':q', q);
        }


    SS.cfg = cfg;
    SS.smartUrl = smartUrl;
    SS.suggestUrl = suggestUrl;
    SS.fieldsUrl = fieldsUrl;
    SS.recentMetaUrl = recentMetaUrl;
    SS.presetsUrl = presetsUrl;
    SS.useCore = useCore;
    SS.hideCore = hideCore;
    SS.showInline = showInline;
    SS.getCfgAttr = getCfgAttr;
    SS.clearNode = clearNode;
    SS.FORM_STORAGE_KEY = FORM_STORAGE_KEY;
    SS.defaultStatuses = defaultStatuses;
    SS.defaultMailboxId = defaultMailboxId;
    SS.getDefaultFormState = getDefaultFormState;
    SS.readSavedFormState = readSavedFormState;
    SS.getSearchFormState = getSearchFormState;
    SS.normalizeAssigneeIds = normalizeAssigneeIds;
    SS.appendFormStateToParams = appendFormStateToParams;
    SS.writeFormStateToStorage = writeFormStateToStorage;
    SS.buildSmartSearchUrl = buildSmartSearchUrl;
    SS.getCsrfToken = typeof getCsrfToken === 'function' ? getCsrfToken : function () { return ''; };
    SS.emitResetFilters = typeof emitResetFilters === 'function' ? emitResetFilters : null;
    SS.formatSearchSmartFor = typeof formatSearchSmartFor === 'function' ? formatSearchSmartFor : null;
    SS.truncateSummary = typeof truncateSummary === 'function' ? truncateSummary : null;
    SS.hasDefinedFilters = hasDefinedFilters;
    SS.buildFilterSummary = buildFilterSummary;
    SS.I18N = I18N;
    SS._sharedReady = true;
    return SS;
  };

})(typeof window !== 'undefined' ? window : this);
