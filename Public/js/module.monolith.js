(function () {
  function onReady(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      fn();
    }
  }

  onReady(function () {
    try {
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
        createdDate: langMsg('ss_created_date', getCfgAttr('data-i18n-created-date', 'Created date'))
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

      function bindsmartsearchMailboxFields() {
        try {
          var form = document.querySelector('form.smartsearch-form');
          if (!form) return;

          var grid = form.querySelector('.smartsearch-filter-grid');
          var fieldsUrlLocal = fieldsUrl;
          var fieldsCache = [];
          var openTilePanel = null;
          var openCfValueWrap = null;
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

          function resetTilePanelStyle(panel) {
            if (!panel) return;
            panel.style.position = '';
            panel.style.left = '';
            panel.style.right = '';
            panel.style.top = '';
            panel.style.bottom = '';
            panel.style.width = '';
            panel.style.maxWidth = '';
            panel.style.maxHeight = '';
            panel.style.overflowY = '';
            panel.style.zIndex = '';
          }

          function placeTilePanel(tile, panel) {
            if (!tile || !panel) return;
            var btn = tile.querySelector('.smartsearch-tile-btn') || tile;
            var rect = btn.getBoundingClientRect();
            var vpW = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
            var vpH = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
            var margin = 12;
            var gap = 6;
            var isCf = tile.classList.contains('smartsearch-tile-cf');
            var width = Math.round(rect.width);
            var prevScrollTop = panel.scrollTop || 0;
            if (isCf) {
              width = Math.max(width, Math.min(420, vpW - (margin * 2)));
            }
            width = Math.min(width, vpW - (margin * 2));
            var left = Math.round(rect.left);
            if (left + width > vpW - margin) {
              left = Math.max(margin, vpW - margin - width);
            }
            if (left < margin) left = margin;

            // Measure preferred height with temporary visibility.
            panel.style.position = 'fixed';
            panel.style.left = left + 'px';
            panel.style.right = 'auto';
            panel.style.width = width + 'px';
            panel.style.maxWidth = (vpW - (margin * 2)) + 'px';
            panel.style.top = '-9999px';
            panel.style.bottom = 'auto';
            panel.style.maxHeight = 'none';
            panel.style.overflowY = 'visible';
            panel.hidden = false;
            var panelH = Math.ceil(panel.getBoundingClientRect().height) || 240;
            var spaceBelow = vpH - rect.bottom - margin;
            var spaceAbove = rect.top - margin;
            var openUp = spaceBelow < Math.min(panelH + gap, 280) && spaceAbove > spaceBelow;
            var maxH = Math.max(160, openUp ? spaceAbove - gap : spaceBelow - gap);
            panel.style.maxHeight = maxH + 'px';
            panel.style.overflowY = 'auto';
            panel.style.webkitOverflowScrolling = 'touch';
            panel.style.zIndex = '10050';
            if (openUp) {
              panel.style.top = 'auto';
              panel.style.bottom = Math.max(margin, vpH - rect.top + gap) + 'px';
            } else {
              panel.style.bottom = 'auto';
              panel.style.top = Math.round(rect.bottom + gap) + 'px';
            }
            panel.scrollTop = prevScrollTop;
            openTilePanel = panel;
          }

          function closeAllTiles(except) {
            closeAllCfValuePopovers();
            var tiles = form.querySelectorAll('.smartsearch-tile');
            var i;
            for (i = 0; i < tiles.length; i++) {
              if (except && tiles[i] === except) continue;
              tiles[i].classList.remove('is-open');
              var btn = tiles[i].querySelector('.smartsearch-tile-btn');
              var panel = tiles[i].querySelector('.smartsearch-tile-panel');
              if (btn) btn.setAttribute('aria-expanded', 'false');
              if (panel) {
                panel.hidden = true;
                resetTilePanelStyle(panel);
              }
            }
            if (!except) openTilePanel = null;
          }

          function repositionOpenTile() {
            var tile = form.querySelector('.smartsearch-tile.is-open');
            if (!tile) return;
            var panel = tile.querySelector('.smartsearch-tile-panel');
            if (!panel || panel.hidden) return;
            placeTilePanel(tile, panel);
          }

          function bindTiles() {
            var tiles = form.querySelectorAll('.smartsearch-tile');
            var i;
            for (i = 0; i < tiles.length; i++) {
              (function (tile) {
                var btn = tile.querySelector('.smartsearch-tile-btn');
                var panel = tile.querySelector('.smartsearch-tile-panel');
                if (!btn || !panel) return;
                btn.addEventListener('click', function (ev) {
                  ev.preventDefault();
                  ev.stopPropagation();
                  var pill = findRemovablePillFromEvent(ev.target, btn);
                  if (pill) {
                    removeTilePill(pill);
                    return;
                  }
                  var open = tile.classList.contains('is-open');
                  closeAllTiles(null);
                  if (!open) {
                    tile.classList.add('is-open');
                    btn.setAttribute('aria-expanded', 'true');
                    placeTilePanel(tile, panel);
                  }
                });
                btn.addEventListener('keydown', function (ev) {
                  var key = ev.key || '';
                  var code = ev.keyCode || 0;
                  if (key !== 'Enter' && key !== ' ' && key !== 'Spacebar' && code !== 13 && code !== 32) return;
                  var pill = findRemovablePillFromEvent(ev.target, btn);
                  if (!pill) return;
                  ev.preventDefault();
                  ev.stopPropagation();
                  removeTilePill(pill);
                });
                panel.addEventListener('click', function (ev) {
                  ev.stopPropagation();
                  if (openCfValueWrap && !openCfValueWrap.contains(ev.target)) {
                    closeAllCfValuePopovers();
                  }
                });
                // Keep wheel/trackpad scrolling inside the panel (do not bubble to page).
                panel.addEventListener('wheel', function (ev) {
                  ev.stopPropagation();
                }, { passive: true });
              })(tiles[i]);
            }
            document.addEventListener('click', function () {
              closeAllTiles(null);
            });
            document.addEventListener('keydown', function (ev) {
              if (ev.key === 'Escape' || ev.keyCode === 27) {
                if (openCfValueWrap) {
                  closeAllCfValuePopovers();
                  ev.preventDefault();
                  return;
                }
              }
            });
            window.addEventListener('resize', function () {
              repositionOpenTile();
              if (openCfValueWrap) placeCfValuePopover(openCfValueWrap);
            });
            // Ignore scrolls that originate inside the open panel (otherwise
            // reposition resets scrollTop and scrolling appears broken).
            window.addEventListener('scroll', function (ev) {
              var target = ev && ev.target;
              if (openCfValueWrap && target && (openCfValueWrap === target || openCfValueWrap.contains(target))) {
                return;
              }
              if (openCfValueWrap) {
                var openPop = openCfValueWrap.querySelector('.smartsearch-cf-value-popover');
                if (openPop && target && (openPop === target || openPop.contains(target))) {
                  return;
                }
                // Panel/page scroll while a value popover is open: keep it aligned.
                placeCfValuePopover(openCfValueWrap);
              }
              if (openTilePanel && target && openTilePanel.contains(target)) {
                return;
              }
              if (openTilePanel && target === openTilePanel) {
                return;
              }
              repositionOpenTile();
            }, true);
          }

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
              openCfValueWrap = null;
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
            openCfValueWrap = wrap;
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
            refreshCfSummary();
            if (typeof persistFormState === 'function') {
              try { persistFormState(); } catch (ePersistChip) {}
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
              label.appendChild(document.createTextNode(chooseValuesLabel));
              wrap.classList.remove('has-value');
            } else {
              // Plain text in the value trigger (chips only belong on tile summaries).
              label.classList.remove('is-placeholder');
              label.appendChild(document.createTextNode(labels.join(' | ')));
              wrap.classList.add('has-value');
            }
          }

          function selectedStatusLabels() {
            var checks = form.querySelectorAll('.smartsearch-status-checks input[type="checkbox"]:checked');
            var out = [];
            var i;
            for (i = 0; i < checks.length; i++) {
              var lab = checks[i].parentNode ? checks[i].parentNode.textContent.replace(/^\s+|\s+$/g, '') : checks[i].value;
              out.push(lab);
            }
            return out;
          }

          function appendRemovablePill(host, text, kind, value) {
            var pill = document.createElement('span');
            pill.className = 'smartsearch-pill is-removable';
            pill.setAttribute('data-kind', kind || '');
            if (typeof value !== 'undefined' && value !== null) {
              pill.setAttribute('data-value', String(value));
            }
            var textEl = document.createElement('span');
            textEl.className = 'smartsearch-pill-text';
            textEl.appendChild(document.createTextNode(text));
            var xBtn = document.createElement('span');
            xBtn.className = 'smartsearch-pill-x';
            xBtn.setAttribute('role', 'button');
            xBtn.setAttribute('tabindex', '0');
            xBtn.setAttribute('aria-label', I18N.removeField || 'Remove');
            xBtn.appendChild(document.createTextNode('\u00d7'));
            pill.appendChild(textEl);
            pill.appendChild(xBtn);
            host.appendChild(pill);
          }

          function findRemovablePillFromEvent(start, stopAt) {
            var t = start;
            var hitX = false;
            while (t && t !== stopAt) {
              if (t.classList) {
                if (t.classList.contains('smartsearch-pill-x')) hitX = true;
                if (t.classList.contains('smartsearch-pill') && t.classList.contains('is-removable')) {
                  return hitX ? t : null;
                }
              }
              t = t.parentNode;
            }
            return null;
          }

          function uncheckByValue(selector, value) {
            var nodes = form.querySelectorAll(selector);
            var i;
            for (i = 0; i < nodes.length; i++) {
              if (String(nodes[i].value || '') === String(value)) {
                nodes[i].checked = false;
                return true;
              }
            }
            return false;
          }

          function removeTilePill(pill) {
            if (!pill) return;
            var kind = pill.getAttribute('data-kind') || '';
            var value = pill.getAttribute('data-value');
            if (kind === 'status') {
              uncheckByValue('.smartsearch-status-checks input[type="checkbox"]', value);
              refreshStatusPills();
            } else if (kind === 'assignee') {
              uncheckByValue('.smartsearch-assignee-checks input[type="checkbox"]', value);
              refreshAssigneePills();
            } else if (kind === 'tag') {
              uncheckByValue('.smartsearch-tags-checks input[type="checkbox"]', value);
              refreshTagsPills();
            } else if (kind === 'scope') {
              uncheckByValue('.smartsearch-scope-checks input[type="checkbox"]', value);
              refreshScopePills();
            } else if (kind === 'cf') {
              var rows = form.querySelectorAll('.smartsearch-cf-row');
              var idx = parseInt(value, 10);
              var row = (!isNaN(idx) && rows[idx]) ? rows[idx] : null;
              if (row) {
                if (rows.length <= 1) {
                  var sel = row.querySelector('select.smartsearch-cf-id');
                  if (sel) sel.value = '0';
                  rebuildCfValues(row);
                } else {
                  closeAllCfValuePopovers();
                  row.parentNode.removeChild(row);
                  reindexCfRows();
                  refreshCfSummary();
                }
              }
            }
            if (typeof persistFormState === 'function') {
              try { persistFormState(); } catch (ePill) {}
            }
          }

          function refreshStatusPills() {
            var host = form.querySelector('.smartsearch-status-pills');
            if (!host) return;
            var checks = form.querySelectorAll('.smartsearch-status-checks input[type="checkbox"]:checked');
            clearNode(host);
            if (!checks.length) {
              var muted = document.createElement('span');
              muted.className = 'smartsearch-muted';
              muted.appendChild(document.createTextNode(I18N.anyStatus || 'Any status'));
              host.appendChild(muted);
              return;
            }
            var i;
            for (i = 0; i < checks.length; i++) {
              var lab = checks[i].parentNode ? String(checks[i].parentNode.textContent || '').replace(/^\s+|\s+$/g, '') : String(checks[i].value || '');
              appendRemovablePill(host, lab, 'status', checks[i].value);
            }
          }

          function refreshAssigneePills() {
            var host = form.querySelector('.smartsearch-assignee-pills');
            if (!host) return;
            var checks = form.querySelectorAll('.smartsearch-assignee-checks input[type="checkbox"]:checked');
            clearNode(host);
            if (!checks.length) {
              var muted = document.createElement('span');
              muted.className = 'smartsearch-muted';
              muted.appendChild(document.createTextNode(I18N.anyAssignee || 'Any assignee'));
              host.appendChild(muted);
              return;
            }
            var i;
            for (i = 0; i < checks.length; i++) {
              var lab = checks[i].parentNode ? String(checks[i].parentNode.textContent || '').replace(/^\s+|\s+$/g, '') : String(checks[i].value || '');
              appendRemovablePill(host, lab, 'assignee', checks[i].value);
            }
          }

          function refreshSelectTile(name, labelSelector) {
            var checked = form.querySelector('input[type="radio"][name="' + name + '"]:checked');
            var label = form.querySelector(labelSelector);
            if (!label) return;
            if (!checked) {
              label.textContent = '';
              return;
            }
            var lab = checked.parentNode ? checked.parentNode.textContent.replace(/^\s+|\s+$/g, '') : checked.value;
            label.textContent = lab;
          }

          function selectedRadioValue(name, fallback) {
            var checked = form.querySelector('input[type="radio"][name="' + name + '"]:checked');
            if (!checked) {
              return (typeof fallback !== 'undefined') ? fallback : '0';
            }
            return String(checked.value);
          }

          function bindOptionList(fieldName, labelSelector, onChange) {
            var list = form.querySelector('.smartsearch-option-list[data-tile-field="' + fieldName + '"]');
            if (!list) return;
            list.addEventListener('change', function (ev) {
              var t = ev.target;
              if (!t || t.name !== fieldName) return;
              refreshSelectTile(fieldName, labelSelector);
              closeAllTiles(null);
              if (typeof onChange === 'function') onChange();
            });
          }

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
              appendRemovablePill(host, pillText, 'cf', String(i));
              pillCount++;
            }
            if (!pillCount) {
              var muted = document.createElement('span');
              muted.className = 'smartsearch-muted';
              muted.appendChild(document.createTextNode('—'));
              host.appendChild(muted);
            }
          }

          function fieldById(id) {
            var i;
            id = parseInt(id, 10) || 0;
            for (i = 0; i < fieldsCache.length; i++) {
              if (parseInt(fieldsCache[i].id, 10) === id) return fieldsCache[i];
            }
            return null;
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
              btnLabel.appendChild(document.createTextNode(chooseValuesLabel));
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

            var field = fieldById(id);
            var type = field ? (parseInt(field.type, 10) || 0) : 0;
            var op = preferredOp || opSel.value || defaultCfOp(type);
            var allowed = opsForType(type);
            if (allowed.indexOf(op) < 0) op = defaultCfOp(type);
            opSel.value = op;

            clearNode(valueUi);
            if (op === 'empty') {
              closeAllCfValuePopovers();
              triggerWrap.style.display = 'none';
              refreshCfValueBtn(row);
              refreshCfSummary();
              repositionOpenTile();
              return;
            }
            triggerWrap.style.display = '';

            var hasOpts = cfHasRealOptions(field);
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
            refreshCfSummary();
            if (triggerWrap.classList.contains('is-open')) {
              placeCfValuePopover(triggerWrap);
            }
            repositionOpenTile();
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
                rebuildCfValueUi(row, state.op);
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
            refreshCfValueBtn(row);
            refreshCfSummary();
          }

          function rebuildCfValues(row, preserveState) {
            var prev = preserveState ? collectCfRowState(row) : null;
            var sel = row.querySelector('select.smartsearch-cf-id');
            var valuesHost = row.querySelector('.smartsearch-cf-values');
            if (!sel || !valuesHost) return;
            var idx = row.getAttribute('data-index') || '0';
            var id = sel.value || '0';
            closeAllCfValuePopovers();
            clearNode(valuesHost);
            if (!id || id === '0') {
              valuesHost.style.display = 'none';
              row.setAttribute('data-type', '0');
              refreshCfSummary();
              repositionOpenTile();
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
              rebuildCfValueUi(row, opSel.value);
            });

            ensureCfValueShell(row);
            rebuildCfValueUi(row, defOp);
            if (prev) applyCfRowState(row, prev);
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
              bindCfValueTrigger(row, triggerWrap);
            }
            if (valuesHost && !valuesHost.getAttribute('data-bound-summary')) {
              valuesHost.setAttribute('data-bound-summary', '1');
              valuesHost.addEventListener('change', function (ev) {
                var t = ev && ev.target ? ev.target : null;
                if (t && t.classList && t.classList.contains('smartsearch-cf-op')) {
                  rebuildCfValueUi(row, t.value);
                  return;
                }
                refreshCfValueBtn(row);
                refreshCfSummary();
                if (openCfValueWrap && row.contains(openCfValueWrap)) {
                  placeCfValuePopover(openCfValueWrap);
                }
              });
              valuesHost.addEventListener('input', function () {
                refreshCfValueBtn(row);
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
                closeAllCfValuePopovers();
                row.parentNode.removeChild(row);
                reindexCfRows();
                refreshCfSummary();
                repositionOpenTile();
              });
            }
            refreshCfValueBtn(row);
          }

          function addCfRow() {
            var wrap = form.querySelector('.smartsearch-cf-rows');
            if (!wrap) return;
            var rows = wrap.querySelectorAll('.smartsearch-cf-row');
            var template = rows[0];
            if (!template) return;
            closeAllCfValuePopovers();
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
            repositionOpenTile();
            if (typeof clone.scrollIntoView === 'function') {
              try { clone.scrollIntoView({ block: 'nearest' }); } catch (eScroll) { clone.scrollIntoView(false); }
            }
          }

          function setMoreOpen(expanded) {
            var btn = form.querySelector('.smartsearch-more-toggle');
            var wrap = form.querySelector('.smartsearch-more-wrap');
            if (!btn || !wrap) return;
            var label = btn.querySelector('.smartsearch-more-toggle-label');
            btn.setAttribute('data-expanded', expanded ? '1' : '0');
            btn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
            if (label) {
              label.textContent = expanded ? (I18N.hideMore || 'Hide more options') : (I18N.showMore || 'Show more options');
            }
            wrap.setAttribute('aria-hidden', expanded ? 'false' : 'true');
            if (expanded) {
              wrap.classList.remove('is-collapsed');
            } else {
              closeAllTiles(null);
              wrap.classList.add('is-collapsed');
            }
          }

          function bindMoreToggle() {
            var btn = form.querySelector('.smartsearch-more-toggle');
            if (!btn) return;
            btn.addEventListener('click', function () {
              var expanded = btn.getAttribute('data-expanded') !== '1';
              setMoreOpen(expanded);
              persistFormState();
            });
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
              appendRemovablePill(host, lab, 'scope', checks[i].value);
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
              appendRemovablePill(host, lab, 'tag', checks[i].value);
            }
          }

          function refreshDateLabel() {
            var host = form.querySelector('.smartsearch-tile-date-label');
            if (!host) return;
            var fieldSel = form.querySelector('select[name="date_field"]');
            var fromInp = form.querySelector('input[name="date_from"]');
            var toInp = form.querySelector('input[name="date_to"]');
            var field = fieldSel ? String(fieldSel.value || 'updated') : 'updated';
            var from = fromInp ? String(fromInp.value || '') : '';
            var to = toInp ? String(toInp.value || '') : '';
            var basis = field === 'created' ? (I18N.createdDate || 'Created date') : (I18N.lastUpdated || 'Last updated');
            clearNode(host);
            if (from || to) {
              host.appendChild(document.createTextNode(basis + ': ' + (from || '…') + ' – ' + (to || '…')));
            } else {
              host.appendChild(document.createTextNode(basis));
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
                persistFormState();
              });
            }
            var tagsChecks = form.querySelector('.smartsearch-tags-checks');
            if (tagsChecks) {
              tagsChecks.addEventListener('change', function () {
                refreshTagsPills();
                persistFormState();
              });
            }
            var dateField = form.querySelector('select[name="date_field"]');
            var dateFrom = form.querySelector('input[name="date_from"]');
            var dateTo = form.querySelector('input[name="date_to"]');
            function onDateChange() {
              refreshDateLabel();
              persistFormState();
            }
            if (dateField) dateField.addEventListener('change', onDateChange);
            if (dateFrom) dateFrom.addEventListener('change', onDateChange);
            if (dateTo) dateTo.addEventListener('change', onDateChange);

            var customerInp = form.querySelector('input[name="customer_q"]');
            if (customerInp) {
              customerInp.addEventListener('input', function () {
                refreshCustomerLabel();
              });
              customerInp.addEventListener('change', function () {
                refreshCustomerLabel();
                persistFormState();
              });
            }
          }

          var STORAGE_KEY = FORM_STORAGE_KEY;

          function collectCheckedValues(selector) {
            var nodes = form.querySelectorAll(selector);
            var out = [];
            var i;
            for (i = 0; i < nodes.length; i++) {
              if (nodes[i].checked) out.push(String(nodes[i].value || ''));
            }
            return out;
          }

          function collectFormState() {
            var qInp = form.querySelector('input[name="q"]');
            var moreBtn = form.querySelector('.smartsearch-more-toggle');
            var dateField = form.querySelector('select[name="date_field"]');
            var dateFrom = form.querySelector('input[name="date_from"]');
            var dateTo = form.querySelector('input[name="date_to"]');
            var customerInp = form.querySelector('input[name="customer_q"]');
            var cf = [];
            var rows = form.querySelectorAll('.smartsearch-cf-row');
            var i;
            for (i = 0; i < rows.length; i++) {
              var sel = rows[i].querySelector('select.smartsearch-cf-id');
              if (!sel || !sel.value || sel.value === '0') continue;
              var state = collectCfRowState(rows[i]);
              cf.push({
                id: String(sel.value),
                op: state.op || '',
                values: state.values || []
              });
            }
            return {
              q: qInp ? String(qInp.value || '') : '',
              mailbox_id: selectedRadioValue('mailbox_id', '0'),
              status: collectCheckedValues('.smartsearch-status-checks input[type="checkbox"]'),
              assignee_id: collectCheckedValues('.smartsearch-assignee-checks input[type="checkbox"]'),
              folder_id: selectedRadioValue('folder_id', '0'),
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
              customer_q: customerInp ? String(customerInp.value || '') : '',
              waiting_reply: selectedRadioValue('waiting_reply', ''),
              has_attachments: selectedRadioValue('has_attachments', ''),
              search_in: collectCheckedValues('.smartsearch-scope-checks input[type="checkbox"]'),
              tag_ids: collectCheckedValues('.smartsearch-tags-checks input[type="checkbox"]'),
              cf_filters: cf,
              more_open: moreBtn ? moreBtn.getAttribute('data-expanded') === '1' : false
            };
          }

          function hasDefinedFilters(state) {
            state = state || collectFormState();
            if (!state || typeof state !== 'object') return false;
            if ((state.status || []).length) return true;
            if (String(state.mailbox_id || '0') !== '0') return true;
            if (normalizeAssigneeIds(state.assignee_id).length) return true;
            if (String(state.folder_id || '0') !== '0') return true;
            if ((state.cf_filters || []).length) return true;
            if ((state.tag_ids || []).length) return true;
            if (String(state.customer_q || '') !== '') return true;
            if (String(state.date_from || '') !== '' || String(state.date_to || '') !== '') return true;
            if (String(state.waiting_reply || '') !== '') return true;
            if (String(state.has_attachments || '') !== '') return true;
            var searchIn = state.search_in || [];
            if (searchIn.length && searchIn.length < 3) return true;
            return false;
          }

          function setPresetSaveOpen(open) {
            var panel = form.querySelector('.smartsearch-preset-save-panel');
            var saveBtn = form.querySelector('.smartsearch-preset-save');
            if (!panel) return;
            if (open) {
              panel.classList.add('is-open');
              panel.setAttribute('aria-hidden', 'false');
              if (saveBtn) saveBtn.setAttribute('aria-expanded', 'true');
            } else {
              panel.classList.remove('is-open');
              panel.setAttribute('aria-hidden', 'true');
              if (saveBtn) saveBtn.setAttribute('aria-expanded', 'false');
            }
          }

          function refreshPresetSaveVisibility() {
            var saveWrap = form.querySelector('.smartsearch-preset-save-wrap');
            if (!saveWrap) return;
            var show = hasDefinedFilters();
            if (show) {
              saveWrap.classList.remove('is-hidden');
            } else {
              saveWrap.classList.add('is-hidden');
              setPresetSaveOpen(false);
            }
          }

          function persistFormState() {
            try {
              localStorage.setItem(STORAGE_KEY, JSON.stringify(collectFormState()));
            } catch (ePersist) {}
            refreshPresetSaveVisibility();
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
            var customerInp = form.querySelector('input[name="customer_q"]');
            if (dateField && state.date_field) dateField.value = state.date_field;
            if (dateFrom) dateFrom.value = state.date_from || '';
            if (dateTo) dateTo.value = state.date_to || '';
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
                rebuildCfValues(first);
              }
              var fi;
              for (fi = 0; fi < filters.length; fi++) {
                if (fi > 0) addCfRow();
                rows = wrap.querySelectorAll('.smartsearch-cf-row');
                var row = rows[fi] || rows[rows.length - 1];
                if (!row) continue;
                var sel = row.querySelector('select.smartsearch-cf-id');
                if (!sel) continue;
                sel.value = String(filters[fi].id || '0');
                rebuildCfValues(row);
                applyCfRowState(row, {
                  op: filters[fi].op || '',
                  values: filters[fi].values || []
                });
              }
              reindexCfRows();
            }

            refreshSelectTile('mailbox_id', '.smartsearch-tile-mailbox-label');
            refreshSelectTile('folder_id', '.smartsearch-tile-folder-label');
            refreshSelectTile('waiting_reply', '.smartsearch-tile-waiting-label');
            refreshSelectTile('has_attachments', '.smartsearch-tile-attachments-label');
            refreshStatusPills();
            refreshAssigneePills();
            refreshScopePills();
            refreshTagsPills();
            refreshDateLabel();
            refreshCustomerLabel();
            refreshCfSummary();
            setMoreOpen(!!state.more_open);
            refreshPresetSaveVisibility();
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
            closeAllTiles(null);
            // Restore module defaults (same as first page load), not an empty form.
            applyFormState(getDefaultFormState());
            persistFormState();
            hideSearchResults();
            setPresetSaveOpen(false);
            setPresetLoadOpen(false);
            if (fieldsUrlLocal) fetchFields();
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

          function tileText(selector, fallback) {
            var el = form.querySelector(selector);
            if (!el) return fallback || '';
            return String(el.textContent || '').replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
          }

          function buildClientPresetSummary() {
            var parts = [];
            var state = collectFormState();
            var status = selectedStatusLabels();
            if (status.length) parts.push(status.join(', '));
            if (String(state.mailbox_id || '0') !== '0') {
              var mb = tileText('.smartsearch-tile-mailbox-label', '');
              if (mb) parts.push(mb);
            }
            var rows = form.querySelectorAll('.smartsearch-cf-row');
            var ri;
            for (ri = 0; ri < rows.length; ri++) {
              var sel = rows[ri].querySelector('select.smartsearch-cf-id');
              if (!sel || !sel.value || sel.value === '0') continue;
              var opt = sel.options[sel.selectedIndex];
              var fieldName = opt ? String(opt.text || '').replace(/^\s+|\s+$/g, '') : '';
              if (!fieldName) continue;
              var opSel = rows[ri].querySelector('select.smartsearch-cf-op');
              var op = opSel && opSel.value ? String(opSel.value) : '';
              var valLab = rows[ri].querySelector('.smartsearch-cf-value-btn-label');
              var valText = valLab && !valLab.classList.contains('is-placeholder')
                ? String(valLab.textContent || '').replace(/^\s+|\s+$/g, '')
                : '';
              if (op === 'empty') parts.push(fieldName + ' ∅');
              else if (valText) parts.push(fieldName + '=' + valText);
              else parts.push(fieldName);
            }
            if (normalizeAssigneeIds(state.assignee_id).length) {
              var assigneeHost = form.querySelector('.smartsearch-assignee-pills');
              var assigneeText = assigneeHost
                ? String(assigneeHost.textContent || '').replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '').replace(/×/g, '')
                : '';
              if (assigneeText && assigneeText !== (I18N.anyAssignee || 'Any assignee')) parts.push(assigneeText);
            }
            if ((state.tag_ids || []).length) {
              var tagsHost = form.querySelector('.smartsearch-tags-pills');
              var tagsText = tagsHost
                ? String(tagsHost.textContent || '').replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '').replace(/×/g, '')
                : 'Tags';
              if (tagsText) parts.push(tagsText);
            }
            if (state.customer_q) parts.push(String(state.customer_q));
            if (state.date_from || state.date_to) {
              parts.push((state.date_from || '…') + '–' + (state.date_to || '…'));
            }
            return truncateSummary(parts.join(' · '), 100);
          }

          function formatPresetDateParts(iso) {
            var out = { date: '', time: '' };
            if (!iso) return out;
            try {
              var d = new Date(iso);
              if (isNaN(d.getTime())) return out;
              // Numeric localized date (e.g. de-DE → 20.07.2026, en-US → 7/20/2026).
              out.date = d.toLocaleDateString(undefined, {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
              });
              out.time = d.toLocaleTimeString(undefined, {
                hour: '2-digit',
                minute: '2-digit'
              });
            } catch (eDate) {}
            return out;
          }

          function setPresetLoadVisible(hasPresets) {
            var wrap = form.querySelector('.smartsearch-preset-load-wrap');
            if (!wrap) return;
            if (hasPresets) wrap.removeAttribute('hidden');
            else {
              wrap.setAttribute('hidden', 'hidden');
              setPresetLoadOpen(false);
            }
          }

          function setPresetLoadOpen(open) {
            var menu = form.querySelector('.smartsearch-preset-load-menu');
            var btn = form.querySelector('.smartsearch-preset-load');
            if (menu) menu.hidden = !open;
            if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
          }

          function hidePresetDialogs() {
            setPresetSaveOpen(false);
            setPresetLoadOpen(false);
          }

          function applyPresetFilters(preset) {
            var filters = (preset && preset.filters && typeof preset.filters === 'object') ? preset.filters : {};
            var next = getDefaultFormState();
            var k;
            for (k in filters) {
              if (Object.prototype.hasOwnProperty.call(filters, k)) next[k] = filters[k];
            }
            next.q = '';
            next.more_open = true;
            closeAllTiles(null);
            applyFormState(next);
            persistFormState();
            hidePresetDialogs();
            if (fieldsUrlLocal) fetchFields();
          }

          function renderPresetList(presets) {
            var list = form.querySelector('.smartsearch-preset-list');
            if (!list) return;
            clearNode(list);
            presets = presets || [];
            if (!presets.length) {
              var empty = document.createElement('p');
              empty.className = 'smartsearch-preset-empty';
              empty.appendChild(document.createTextNode(I18N.presetEmpty || 'No saved filters yet.'));
              list.appendChild(empty);
              return;
            }
            var i;
            for (i = 0; i < presets.length; i++) {
              (function (preset) {
                var item = document.createElement('div');
                item.className = 'smartsearch-preset-item';
                item.setAttribute('role', 'option');
                item.setAttribute('data-id', String(preset.id || ''));

                var delBtn = document.createElement('button');
                delBtn.type = 'button';
                delBtn.className = 'smartsearch-preset-item-del';
                delBtn.setAttribute('aria-label', I18N.deleteLabel || 'Delete');
                delBtn.title = I18N.deleteLabel || 'Delete';
                var delIcon = document.createElement('span');
                delIcon.className = 'glyphicon glyphicon-trash';
                delIcon.setAttribute('aria-hidden', 'true');
                delBtn.appendChild(delIcon);
                delBtn.addEventListener('click', function (ev) {
                  ev.preventDefault();
                  ev.stopPropagation();
                  var msg = I18N.deletePresetConfirm || 'Delete this saved filter?';
                  if (!window.confirm(msg)) return;
                  deletePreset(String(preset.id || ''));
                });

                var body = document.createElement('button');
                body.type = 'button';
                body.className = 'smartsearch-preset-item-body';
                body.title = truncateSummary(preset.summary || '', 100);

                var top = document.createElement('span');
                top.className = 'smartsearch-preset-item-top';
                var nameEl = document.createElement('span');
                nameEl.className = 'smartsearch-preset-item-name';
                nameEl.appendChild(document.createTextNode(String(preset.name || '')));
                var parts = formatPresetDateParts(preset.created_at || '');
                var timeEl = document.createElement('span');
                timeEl.className = 'smartsearch-preset-item-time';
                if (parts.time) timeEl.appendChild(document.createTextNode(parts.time));
                top.appendChild(nameEl);
                top.appendChild(timeEl);

                var dateEl = document.createElement('span');
                dateEl.className = 'smartsearch-preset-item-date';
                if (parts.date) dateEl.appendChild(document.createTextNode(parts.date));

                var sumEl = document.createElement('span');
                sumEl.className = 'smartsearch-preset-item-summary';
                sumEl.appendChild(document.createTextNode(truncateSummary(preset.summary || '', 100)));

                body.appendChild(top);
                if (parts.date) body.appendChild(dateEl);
                body.appendChild(sumEl);
                body.addEventListener('click', function (ev) {
                  ev.preventDefault();
                  applyPresetFilters(preset);
                });

                item.appendChild(delBtn);
                item.appendChild(body);
                list.appendChild(item);
              })(presets[i] || {});
            }
          }

          function fetchPresets(done) {
            if (!presetsUrl) {
              setPresetLoadVisible(false);
              if (typeof done === 'function') done([]);
              return;
            }
            fetch(presetsUrl, {
              credentials: 'same-origin',
              headers: { 'X-Requested-With': 'XMLHttpRequest', 'Accept': 'application/json' }
            })
              .then(function (r) { return r.json(); })
              .then(function (data) {
                var presets = (data && data.presets) ? data.presets : [];
                setPresetLoadVisible(presets.length > 0);
                if (typeof done === 'function') done(presets);
              })
              .catch(function () {
                setPresetLoadVisible(false);
                if (typeof done === 'function') done([]);
              });
          }

          function deletePreset(id) {
            if (!presetsUrl || !id) return;
            var url = presetsUrl.replace(/\/?$/, '') + '/' + encodeURIComponent(id) + '/delete';
            fetch(url, {
              method: 'POST',
              credentials: 'same-origin',
              headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
                'Accept': 'application/json',
                'X-CSRF-TOKEN': getCsrfToken()
              },
              body: JSON.stringify({ _token: getCsrfToken() })
            })
              .then(function (r) { return r.json(); })
              .then(function (data) {
                var presets = (data && data.presets) ? data.presets : [];
                setPresetLoadVisible(presets.length > 0);
                renderPresetList(presets);
                if (!presets.length) hidePresetDialogs();
              })
              .catch(function () {});
          }

          function bindPresetControls() {
            var saveBtn = form.querySelector('.smartsearch-preset-save');
            var loadBtn = form.querySelector('.smartsearch-preset-load');
            var loadWrap = form.querySelector('.smartsearch-preset-load-wrap');
            var savePanel = form.querySelector('.smartsearch-preset-save-panel');
            var loadMenu = form.querySelector('.smartsearch-preset-load-menu');
            var nameInp = form.querySelector('.smartsearch-preset-name');
            var saveConfirm = form.querySelector('.smartsearch-preset-save-confirm');
            var saveCancel = form.querySelector('.smartsearch-preset-save-cancel');

            if (saveBtn) {
              saveBtn.setAttribute('aria-expanded', 'false');
              saveBtn.setAttribute('aria-controls', 'smartsearch-preset-save-panel');
              if (savePanel && !savePanel.id) savePanel.id = 'smartsearch-preset-save-panel';
              saveBtn.addEventListener('click', function (ev) {
                ev.preventDefault();
                setPresetLoadOpen(false);
                var willOpen = !(savePanel && savePanel.classList.contains('is-open'));
                setPresetSaveOpen(willOpen);
                if (willOpen && nameInp) {
                  nameInp.value = '';
                  window.setTimeout(function () {
                    try { nameInp.focus(); } catch (eFocus) {}
                  }, 180);
                }
              });
            }
            if (saveCancel) {
              saveCancel.addEventListener('click', function (ev) {
                ev.preventDefault();
                setPresetSaveOpen(false);
              });
            }
            if (loadBtn && loadMenu) {
              loadBtn.addEventListener('click', function (ev) {
                ev.preventDefault();
                setPresetSaveOpen(false);
                var willOpen = !!loadMenu.hidden;
                if (!willOpen) {
                  setPresetLoadOpen(false);
                  return;
                }
                fetchPresets(function (presets) {
                  renderPresetList(presets);
                  setPresetLoadOpen(true);
                });
              });
            }
            document.addEventListener('click', function (ev) {
              try {
                if (!loadWrap || !loadMenu || loadMenu.hidden) return;
                if (loadWrap.contains(ev.target)) return;
                setPresetLoadOpen(false);
              } catch (eClickAway) {}
            });
            if (saveConfirm) {
              saveConfirm.addEventListener('click', function (ev) {
                ev.preventDefault();
                if (!presetsUrl) return;
                var name = nameInp ? String(nameInp.value || '').replace(/^\s+|\s+$/g, '') : '';
                if (!name) {
                  window.alert(I18N.nameRequired || 'Please enter a name.');
                  return;
                }
                var filters = collectFormState();
                delete filters.q;
                delete filters.more_open;
                var payload = {
                  name: name,
                  summary: buildClientPresetSummary(),
                  filters: filters,
                  _token: getCsrfToken()
                };
                fetch(presetsUrl, {
                  method: 'POST',
                  credentials: 'same-origin',
                  headers: {
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                    'Accept': 'application/json',
                    'X-CSRF-TOKEN': getCsrfToken()
                  },
                  body: JSON.stringify(payload)
                })
                  .then(function (r) { return r.json().then(function (data) { return { ok: r.ok, data: data }; }); })
                  .then(function (res) {
                    if (!res.ok) {
                      window.alert((res.data && res.data.error) || (I18N.nameRequired || 'Please enter a name.'));
                      return;
                    }
                    setPresetLoadVisible(true);
                    setPresetSaveOpen(false);
                    if (nameInp) nameInp.value = '';
                  })
                  .catch(function () {});
              });
            }

            fetchPresets();
          }

          function fetchFields() {
            if (!fieldsUrlLocal) return;
            var mailboxId = selectedRadioValue('mailbox_id', '0');
            var xhr = new XMLHttpRequest();
            xhr.open('GET', fieldsUrlLocal + '?mailbox_id=' + encodeURIComponent(mailboxId), true);
            xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
            xhr.setRequestHeader('Cache-Control', 'no-cache');
            xhr.onreadystatechange = function () {
              if (xhr.readyState !== 4) return;
              var payload = {};
              try { payload = JSON.parse(xhr.responseText || '{}'); } catch (e) { payload = {}; }
              fieldsCache = (payload && payload.fields) ? payload.fields : [];
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
                for (j = 0; j < fieldsCache.length; j++) {
                  var opt = document.createElement('option');
                  opt.value = String(fieldsCache[j].id || 0);
                  opt.setAttribute('data-type', String(fieldsCache[j].type || 0));
                  opt.appendChild(document.createTextNode(String(fieldsCache[j].name || '')));
                  if (opt.value === selected) opt.selected = true;
                  sel.appendChild(opt);
                }
                if (!sel.value) sel.value = '0';
                rebuildCfValues(rows[i], true);
              }
              refreshCfSummary();
            };
            xhr.send(null);
          }

          bindTiles();
          bindMoreToggle();
          bindAdvancedTiles();
          bindResetButton();
          bindPresetControls();

          var statusChecks = form.querySelector('.smartsearch-status-checks');
          if (statusChecks) {
            statusChecks.addEventListener('change', function () {
              refreshStatusPills();
              persistFormState();
            });
          }
          var assigneeChecks = form.querySelector('.smartsearch-assignee-checks');
          if (assigneeChecks) {
            assigneeChecks.addEventListener('change', function () {
              refreshAssigneePills();
              persistFormState();
            });
          }
          bindOptionList('mailbox_id', '.smartsearch-tile-mailbox-label', function () {
            fetchFields();
            persistFormState();
          });
          bindOptionList('folder_id', '.smartsearch-tile-folder-label', persistFormState);
          bindOptionList('waiting_reply', '.smartsearch-tile-waiting-label', persistFormState);
          bindOptionList('has_attachments', '.smartsearch-tile-attachments-label', persistFormState);

          var cfRows = form.querySelectorAll('.smartsearch-cf-row');
          var ri;
          for (ri = 0; ri < cfRows.length; ri++) bindCfRow(cfRows[ri]);
          var addBtn = form.querySelector('.smartsearch-cf-add');
          if (addBtn) addBtn.addEventListener('click', function () {
            addCfRow();
            persistFormState();
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
            persistFormState();
          });

          form.addEventListener('change', function () {
            persistFormState();
          });

          refreshStatusPills();
          refreshAssigneePills();
          refreshScopePills();
          refreshTagsPills();
          refreshDateLabel();
          refreshCustomerLabel();
          refreshCfSummary();
          refreshPresetSaveVisibility();
          if (fieldsUrlLocal) fetchFields();
          if (shouldRestoreSavedState()) {
            restoreFormStateIfNeeded();
          } else {
            // Keep saved state in sync with the submitted search.
            persistFormState();
          }
        } catch (e) {
          // Never break the Smart Search page.
        }
      }

      function isTypingTarget(el) {
        if (!el) return false;
        var tag = (el.tagName || '').toLowerCase();
        return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable;
      }

      function debounce(fn, wait) {
        var t;
        return function () {
          var args = arguments;
          clearTimeout(t);
          t = setTimeout(function () {
            fn.apply(null, args);
          }, wait);
        };
      }

      // Last 5 searches (per browser) — simple, private, and useful.
      // v2 stores structured items so we can enrich "recent searches" when we
      // *know* a query led to a real conversation (Option A: confirmed-valid only).
      // Backward compatible with v1 (array of strings).
      var HISTORY_KEY = 'smart_search_recent_v2';

      function normalizeHistory(arr) {
        try {
          if (!Array.isArray(arr)) return [];
          var out = [];
          for (var i = 0; i < arr.length; i++) {
            var it = arr[i];
            if (!it) continue;
            // v1: string
            if (typeof it === 'string') {
              var qs = it.toString().trim();
              if (!qs) continue;
              out.push({ q: qs, ts: null, kind: 'q' });
              continue;
            }
            // v2: object
            if (typeof it === 'object') {
              var q = (it.q || '').toString().trim();
              if (!q) continue;
              out.push({
                q: q,
                ts: (typeof it.ts === 'number' ? it.ts : null),
                kind: (it.kind || 'q'),
                conv: it.conv || null,
                refreshed_at: (typeof it.refreshed_at === 'number' ? it.refreshed_at : null)
              });
            }
          }
          return out;
        } catch (e) {
          return [];
        }
      }

      function loadHistory() {
        try {
          if (!window.localStorage) return [];
          var raw = window.localStorage.getItem(HISTORY_KEY);
          // Also read legacy key if present.
          if (!raw) {
            raw = window.localStorage.getItem('smart_search_recent_v1') || window.localStorage.getItem('adam_smart_search_ui_recent_v2') || window.localStorage.getItem('adam_smart_search_ui_recent_v1');
          }
          if (!raw) return [];
          var arr = JSON.parse(raw);
          return normalizeHistory(arr);
        } catch (e) {
          return [];
        }
      }

      function saveHistory(arr) {
        try {
          if (!window.localStorage) return;
          window.localStorage.setItem(HISTORY_KEY, JSON.stringify(arr || []));
        } catch (e) {}
      }

      function rememberHistory(item) {
        try {
          if (!item) return;
          var q = (item.q || '').toString().trim();
          if (!q || q.length < 2) return;

          var arr = loadHistory();
          var ql = q.toLowerCase();

          // Prepend new item, dedupe by query (case-insensitive).
          var next = [];
          next.push({
            q: q,
            ts: (typeof item.ts === 'number' ? item.ts : Date.now()),
            kind: item.kind || 'q',
            conv: item.conv || null,
            refreshed_at: (typeof item.refreshed_at === 'number' ? item.refreshed_at : null)
          });
          for (var i = 0; i < arr.length; i++) {
            var it = arr[i];
            if (!it || !it.q) continue;
            if (it.q.toLowerCase() === ql) continue;
            next.push(it);
            if (next.length >= 5) break;
          }
          saveHistory(next.slice(0, 5));
        } catch (e) {}
      }

      function rememberQuery(q) {
        rememberHistory({ q: q, kind: 'q', ts: Date.now(), conv: null });
      }

      var historyRefreshInFlight = false;

      function isRefreshableHistoryConversation(it) {
        try {
          return !!(it && it.kind === 'conv' && it.conv && it.conv.id);
        } catch (e) {
          return false;
        }
      }

      function refreshHistoryConversations(done) {
        try {
          if (historyRefreshInFlight || !recentMetaUrl || !window.localStorage) {
            if (typeof done === 'function') done(false);
            return;
          }

          var arr = loadHistory();
          if (!arr || !arr.length) {
            if (typeof done === 'function') done(false);
            return;
          }

          var ids = [];
          var touched = false;
          for (var i = 0; i < arr.length; i++) {
            var it = arr[i];
            if (!isRefreshableHistoryConversation(it)) {
              continue;
            }
            touched = true;
            var convId = parseInt((it.conv && it.conv.id) || 0, 10);
            if (convId > 0 && ids.indexOf(convId) < 0) {
              ids.push(convId);
            }
          }

          if (!touched || !ids.length) {
            if (typeof done === 'function') done(false);
            return;
          }

          historyRefreshInFlight = true;
          var xhr = new XMLHttpRequest();
          var cacheBust = 'ts=' + encodeURIComponent(String(Date.now()));
          var joiner = recentMetaUrl.indexOf('?') >= 0 ? '&' : '?';
          xhr.open('GET', recentMetaUrl + joiner + 'ids=' + encodeURIComponent(ids.join(',')) + '&' + cacheBust, true);
          xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
          xhr.setRequestHeader('Cache-Control', 'no-cache');
          xhr.onreadystatechange = function () {
            var payload = {};
            var byId = {};
            var changed = false;
            var nowTs = Date.now();

            if (xhr.readyState !== 4) {
              return;
            }

            historyRefreshInFlight = false;

            if (xhr.status < 200 || xhr.status >= 300) {
              if (typeof done === 'function') done(false);
              return;
            }

            try {
              payload = JSON.parse(xhr.responseText || '{}');
            } catch (e) {
              payload = {};
            }

            var items = (payload && payload.items && payload.items.length) ? payload.items : [];
            for (var j = 0; j < items.length; j++) {
              var meta = items[j] || {};
              var metaId = parseInt(meta.id || 0, 10);
              if (metaId > 0) {
                byId[metaId] = meta;
              }
            }

            for (var k = 0; k < arr.length; k++) {
              var hist = arr[k];
              if (!hist || hist.kind !== 'conv' || !hist.conv || !hist.conv.id) {
                continue;
              }
              var histId = parseInt(hist.conv.id || 0, 10);
              if (histId <= 0 || !isRefreshableHistoryConversation(hist)) {
                continue;
              }

              hist.refreshed_at = nowTs;
              if (byId[histId]) {
                hist.conv = {
                  id: byId[histId].id || hist.conv.id || null,
                  url: byId[histId].url || hist.conv.url || null,
                  subject: byId[histId].subject || hist.conv.subject || hist.q || '',
                  mailbox_name: byId[histId].mailbox_name || '',
                  updated_human: byId[histId].updated_human || '',
                  status_name: byId[histId].status_name || '',
                  status_class: byId[histId].status_class || ''
                };
                changed = true;
              }
            }

            if (changed) {
              saveHistory(arr);
            }
            if (typeof done === 'function') done(changed);
          };
          xhr.send(null);
        } catch (e) {
          historyRefreshInFlight = false;
          if (typeof done === 'function') done(false);
        }
      }

      function rememberConversationFromSuggest(q, it) {
        try {
          if (!it) {
            rememberQuery(q);
            return;
          }
          rememberHistory({
            q: q,
            kind: 'conv',
            ts: Date.now(),
            conv: {
              id: it.id || null,
              url: it.url || null,
              subject: it.subject || '',
              mailbox_name: it.mailbox_name || '',
              updated_human: it.updated_human || '',
              status_name: it.status_name || '',
              status_class: it.status_class || ''
            },
            refreshed_at: Date.now()
          });
        } catch (e) {
          rememberQuery(q);
        }
      }

      bindsmartsearchMailboxFields();

      function ensureInlineTopbarSearch() {
        try {
          if (!showInline || !smartUrl) {
            return;
          }

          // Insert next to the notifications icon (right side navbar)
          var navRight = document.querySelector('ul.nav.navbar-nav.navbar-right');
          if (!navRight) {
            return;
          }

          // Avoid duplicates
          if (document.getElementById('smartsearch-inline-li')) {
            return;
          }

          var notifLi = navRight.querySelector('li.web-notifications');
          var navCollapse = document.querySelector('.navbar-collapse');
          var navMobileTop = navCollapse ? navCollapse.querySelector('ul.nav.navbar-nav') : null;
          if (!navMobileTop) {
            navMobileTop = navRight;
          }

          var li = document.createElement('li');
          li.id = 'smartsearch-inline-li';
          li.className = 'smartsearch-inline';

          // Bootstrap/FreeScout-friendly inline form
          (function buildInlineForm() {
            var form = document.createElement('form');
            var group = document.createElement('div');
            var input = document.createElement('input');
            var btnWrap = document.createElement('span');
            var searchButton = document.createElement('button');
            var searchIcon = document.createElement('i');
            var moreButton = document.createElement('button');
            var moreIcon = document.createElement('i');
            var hiddenSubmit = document.createElement('button');

            form.className = 'navbar-form smartsearch-inline-form';
            form.setAttribute('role', 'search');
            form.setAttribute('method', 'GET');
            form.setAttribute('action', smartUrl);

            group.className = 'input-group input-group-sm';

            input.type = 'text';
            input.className = 'form-control smartsearch-inline-input';
            input.name = 'q';
            input.autocomplete = 'off';
            input.placeholder = I18N.inlinePlaceholder;

            btnWrap.className = 'input-group-btn';

            searchButton.className = 'btn btn-default smartsearch-search-btn';
            searchButton.type = 'button';
            searchButton.setAttribute('aria-label', I18N.focusSearch);
            searchButton.setAttribute('title', I18N.focusSearch);
            searchIcon.className = 'glyphicon glyphicon-search';
            searchButton.appendChild(searchIcon);

            moreButton.className = 'btn btn-default smartsearch-more';
            moreButton.type = 'button';
            moreButton.setAttribute('aria-label', I18N.opensmartsearch);
            moreButton.setAttribute('title', I18N.opensmartsearch);
            moreIcon.className = 'glyphicon glyphicon-option-vertical';
            moreButton.appendChild(moreIcon);

            hiddenSubmit.type = 'submit';
            hiddenSubmit.className = 'hidden';
            hiddenSubmit.setAttribute('tabindex', '-1');
            hiddenSubmit.setAttribute('aria-hidden', 'true');

            btnWrap.appendChild(searchButton);
            btnWrap.appendChild(moreButton);
            group.appendChild(input);
            group.appendChild(btnWrap);
            form.appendChild(group);
            form.appendChild(hiddenSubmit);
            li.appendChild(form);
          })();

          function isMobileTopbarLayout() {
            try {
              return window.innerWidth <= 767;
            } catch (e) {
              return false;
            }
          }

          function placeInlineSearchItem() {
            try {
              if (isMobileTopbarLayout()) {
                // In the collapsed/mobile navbar, keep Smart Search at the very top
                // of the menu, above mailbox/manage links and before the right-side items.
                if (navMobileTop.firstChild !== li) {
                  navMobileTop.insertBefore(li, navMobileTop.firstChild);
                }
                return;
              }

              if (notifLi && notifLi.parentNode === navRight) {
                // Desktop: keep it beside notifications, matching the normal topbar flow.
                if (notifLi.nextSibling !== li) {
                  navRight.insertBefore(li, notifLi.nextSibling);
                }
              } else if (navRight.firstChild !== li) {
                // Fallback: prepend to right nav.
                navRight.insertBefore(li, navRight.firstChild);
              }
            } catch (e) {
              try { navRight.insertBefore(li, navRight.firstChild); } catch (e2) {}
            }
          }

          placeInlineSearchItem();

          // Autosuggest dropdown (lightweight).
          try {
            var formEl = li.querySelector('form.smartsearch-inline-form');
            var inputEl = li.querySelector('input.smartsearch-inline-input');
            var moreBtn = li.querySelector('button.smartsearch-more');
            var searchBtn = li.querySelector('button.smartsearch-search-btn');
            if (formEl && inputEl) {
              // Topbar Enter: apply last-used filters (or module defaults) so results match the form.
              formEl.addEventListener('submit', function (ev) {
                try { ev.preventDefault(); } catch (ePrev) {}
                var qVal = (inputEl.value || '').toString().replace(/^\s+|\s+$/g, '');
                window.location.href = buildSmartSearchUrl(qVal, getSearchFormState());
              });

              // "More" opens the Smart Search page only (no q/ss — idle form, no search).
              if (moreBtn) {
                moreBtn.addEventListener('click', function (ev) {
                  try { ev.preventDefault(); } catch (e) {}
                  window.location.href = smartUrl;
                });
              }

              // Attach dropdown to <body> instead of the navbar/form.
              // This avoids dashboard/navbar overflow clipping on mobile and custom themes.
              var dd = document.createElement('div');
              dd.className = 'dropdown-menu smartsearch-suggest smartsearch-suggest-expandable';
              dd.style.display = 'none';
              dd.setAttribute('role', 'listbox');
              document.body.appendChild(dd);

              function getViewportSize() {
                return {
                  w: Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0),
                  h: Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0)
                };
              }

              function positionDd() {
                try {
                  var rect = formEl.getBoundingClientRect();
                  var anchorEl = formEl.querySelector('.input-group') || formEl;
                  var anchorRect = anchorEl.getBoundingClientRect();
                  var vp = getViewportSize();
                  var isMobile = isMobileTopbarLayout();
                  var margin = isMobile ? 12 : 12;
                  var gap = isMobile ? 3 : 6;
                  var baseWidth = Math.round(anchorRect.width || rect.width || 260);
                  var expandedWidth = 560;
                  var left = Math.round(anchorRect.left || rect.left || margin);
                  var maxBelow = Math.max(isMobile ? 120 : 160, vp.h - rect.bottom - margin);

                  if (dd.classList) {
                    if (isMobile) {
                      dd.classList.add('smartsearch-suggest-mobile');
                    } else {
                      dd.classList.remove('smartsearch-suggest-mobile');
                    }
                  }

                  if (isMobile) {
                    var mobileMaxWidth = Math.max(220, vp.w - (margin * 2));
                    baseWidth = Math.max(220, Math.min(baseWidth, mobileMaxWidth));
                    expandedWidth = baseWidth;
                    left = Math.max(margin, Math.min(left, vp.w - baseWidth - margin));
                    dd.style.left = left + 'px';
                    dd.style.right = 'auto';
                  } else {
                    var maxWidth = Math.max(260, vp.w - (margin * 2));
                    baseWidth = Math.max(260, Math.min(baseWidth, maxWidth));
                    expandedWidth = Math.max(baseWidth, Math.min(expandedWidth, maxWidth));

                    // Anchor the right edge to the input group so desktop hover expansion
                    // grows left, not off-screen to the right. This keeps the body-level
                    // portal dropdown expandable even though it is positioned outside the navbar.
                    var rightEdge = Math.round(anchorRect.right || rect.right || (left + baseWidth));
                    rightEdge = Math.min(rightEdge, vp.w - margin);
                    if (rightEdge - expandedWidth < margin) {
                      rightEdge = Math.min(vp.w - margin, margin + expandedWidth);
                    }

                    dd.style.left = 'auto';
                    dd.style.right = Math.max(margin, vp.w - rightEdge) + 'px';
                  }

                  dd.style.position = 'fixed';
                  dd.style.top = Math.round(rect.bottom + gap) + 'px';
                  dd.style.removeProperty('width');
                  dd.style.setProperty('--smartsearch-suggest-width', baseWidth + 'px');
                  dd.style.setProperty('--smartsearch-suggest-expanded-width', expandedWidth + 'px');
                  dd.style.maxHeight = Math.min(isMobile ? Math.floor(vp.h * 0.42) : 320, maxBelow) + 'px';
                } catch (e) {}
              }

              function showDd() {
                positionDd();
                dd.style.display = 'block';
              }

              // Magnifier is intentionally NOT a navigation affordance.
              if (searchBtn) {
                searchBtn.addEventListener('click', function (ev) {
                  try { ev.preventDefault(); } catch (e) {}
                  try { inputEl.focus(); } catch (e) {}
                });
              }

              var activeIndex = -1;
              var lastItems = [];
              var abortCtl = null;

              function setActive(idx) {
                var links = dd.querySelectorAll('.smartsearch-suggest-item');
                for (var j = 0; j < links.length; j++) {
                  if (j === idx) links[j].classList.add('active');
                  else links[j].classList.remove('active');
                }
                activeIndex = idx;
              }


              function hideDd() {
                dd.style.display = 'none';
                clearNode(dd);
                activeIndex = -1;
                lastItems = [];
                if (abortCtl) { try { abortCtl.abort(); } catch(e) {} }
                abortCtl = null;
              }

              function appendText(parent, text) {
                parent.appendChild(document.createTextNode((text || '').toString()));
              }

              function appendHighlightedText(parent, text, rawQuery) {
                try {
                  text = (text || '').toString();
                  rawQuery = (rawQuery || '').toString().trim();
                  if (!rawQuery || rawQuery.length < 2) {
                    appendText(parent, text);
                    return;
                  }
                  var q = rawQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                  var re = new RegExp(q, 'ig');
                  var lastIndex = 0;
                  var match;
                  while ((match = re.exec(text)) !== null) {
                    if (match.index > lastIndex) {
                      appendText(parent, text.slice(lastIndex, match.index));
                    }
                    var hl = document.createElement('span');
                    hl.className = 'smartsearch-hl';
                    appendText(hl, match[0]);
                    parent.appendChild(hl);
                    lastIndex = match.index + match[0].length;
                    if (match[0].length === 0) {
                      break;
                    }
                  }
                  if (lastIndex < text.length) {
                    appendText(parent, text.slice(lastIndex));
                  }
                } catch (e) {
                  appendText(parent, text);
                }
              }

              function buildSuggestItem(opts) {
                var link = document.createElement('a');
                var num = document.createElement('span');
                var main = document.createElement('span');
                var row1 = document.createElement('span');
                var subj = document.createElement('span');

                link.className = 'smartsearch-suggest-item' + (opts.extraClass ? (' ' + opts.extraClass) : '');
                link.setAttribute('data-kind', opts.kind || 'conv');
                link.setAttribute('href', (opts.href || '').toString());
                if (typeof opts.idx === 'number') {
                  link.setAttribute('data-idx', String(opts.idx));
                }

                num.className = 'smartsearch-suggest-num';
                if (opts.numIconClass) {
                  var icon = document.createElement('i');
                  icon.className = opts.numIconClass;
                  num.appendChild(icon);
                } else {
                  appendText(num, opts.numText || '');
                }

                main.className = 'smartsearch-suggest-main';
                row1.className = 'smartsearch-suggest-row1';
                subj.className = 'smartsearch-suggest-subj';
                if (opts.highlight) {
                  appendHighlightedText(subj, opts.subjectText || '', opts.highlightQuery || '');
                } else {
                  appendText(subj, opts.subjectText || '');
                }
                row1.appendChild(subj);

                if (opts.statusName) {
                  var safeStatusClass = ((opts.statusClass || 'default').toString().replace(/[^a-z0-9_-]/ig, '') || 'default');
                  var badge = document.createElement('span');
                  badge.className = 'label label-' + safeStatusClass + ' smartsearch-suggest-status';
                  appendText(badge, opts.statusName);
                  row1.appendChild(badge);
                }

                if (opts.hintText) {
                  var hint = document.createElement('span');
                  hint.className = 'smartsearch-suggest-hint';
                  appendText(hint, opts.hintText);
                  row1.appendChild(hint);
                }

                main.appendChild(row1);

                if (opts.metaText) {
                  var row2 = document.createElement('span');
                  row2.className = 'smartsearch-suggest-row2';
                  appendText(row2, opts.metaText);
                  main.appendChild(row2);
                }

                link.appendChild(num);
                link.appendChild(main);
                return link;
              }

              function appendSeparator(parent) {
                var sep = document.createElement('div');
                sep.className = 'smartsearch-suggest-sep';
                parent.appendChild(sep);
              }

              function appendHeading(parent, text) {
                var head = document.createElement('div');
                head.className = 'smartsearch-suggest-head';
                appendText(head, text || '');
                parent.appendChild(head);
              }

              function appendSuggestHeadRow(parent, titleText) {
                var row = document.createElement('div');
                row.className = 'smartsearch-suggest-head-row';
                var head = document.createElement('div');
                head.className = 'smartsearch-suggest-head';
                appendText(head, titleText || '');
                row.appendChild(head);
                var resetBtn = document.createElement('button');
                resetBtn.type = 'button';
                resetBtn.className = 'btn btn-link btn-xs smartsearch-suggest-reset-filters';
                appendText(resetBtn, I18N.resetFilters || 'Reset filters');
                // mousedown: avoid input-blur closing the dialog before the action runs.
                resetBtn.addEventListener('mousedown', function (ev) {
                  try { ev.preventDefault(); } catch (ePrev) {}
                  try { ev.stopPropagation(); } catch (eStop) {}
                  emitResetFilters();
                  fetchSuggest();
                });
                row.appendChild(resetBtn);
                parent.appendChild(row);
              }

              function buildSuggestRequestUrl(q) {
                var params = new URLSearchParams();
                params.set('q', q);
                appendFormStateToParams(params, getSearchFormState());
                var qs = params.toString();
                return suggestUrl + (suggestUrl.indexOf('?') >= 0 ? '&' : '?') + qs;
              }

              function renderDd(items) {
                items = items || [];
                var qNow = (inputEl && inputEl.value) ? (inputEl.value || '') : '';
                var qTrim = (qNow || '').toString().trim();
                var frag = document.createDocumentFragment();
                var any = false;

                clearNode(dd);
                appendSuggestHeadRow(frag, I18N.suggestions || 'Suggestions');

                if (smartUrl && qTrim) {
                  frag.appendChild(buildSuggestItem({
                    kind: 'searchall',
                    href: buildSmartSearchUrl(qTrim, getSearchFormState()),
                    extraClass: 'smartsearch-suggest-searchall',
                    numIconClass: 'glyphicon glyphicon-search',
                    subjectText: formatSearchSmartFor(qTrim),
                    highlight: true,
                    highlightQuery: qNow,
                    hintText: I18N.enter || 'Enter'
                  }));
                  appendSeparator(frag);
                }

                for (var i = 0; i < items.length; i++) {
                  var it = items[i] || {};
                  var url = (it.url || '').toString();
                  if (!url) {
                    continue;
                  }
                  any = true;
                  var mb = (it.mailbox_name || '').toString();
                  var upd = (it.updated_human || '').toString();
                  var meta = '';
                  if (mb && upd) meta = mb + ' • ' + upd;
                  else if (mb) meta = mb;
                  else if (upd) meta = upd;

                  frag.appendChild(buildSuggestItem({
                    kind: 'conv',
                    idx: i,
                    href: url,
                    numText: '#' + (it.id || '').toString(),
                    subjectText: (it.subject || '').toString(),
                    highlight: true,
                    highlightQuery: qNow,
                    statusName: (it.status_name || '').toString(),
                    statusClass: (it.status_class || '').toString(),
                    metaText: meta
                  }));
                }

                if (!any && !(smartUrl && qTrim)) {
                  hideDd();
                  return;
                }
                dd.appendChild(frag);
                showDd();
                lastItems = items || [];
                setActive(-1);
              }

              function renderHistoryList(arr) {
                arr = arr || [];
                if (!arr.length || !smartUrl) {
                  hideDd();
                  return;
                }
                clearNode(dd);
                var frag = document.createDocumentFragment();
                appendHeading(frag, I18N.recentSearches || 'Recent searches');
                appendSeparator(frag);
                var any = false;
                for (var i = 0; i < arr.length; i++) {
                  var hi = arr[i] || null;
                  var q = hi && hi.q ? hi.q.toString() : '';
                  if (!q) {
                    continue;
                  }
                  any = true;
                  var href = smartUrl + (smartUrl.indexOf('?') >= 0 ? '&' : '?') + 'q=' + encodeURIComponent(q);
                  var conv = (hi && hi.kind === 'conv' && hi.conv) ? hi.conv : null;
                  if (conv && conv.url) {
                    var mb = (conv.mailbox_name || '').toString();
                    var upd = (conv.updated_human || '').toString();
                    var meta = '';
                    if (mb && upd) meta = mb + ' • ' + upd;
                    else if (mb) meta = mb;
                    else if (upd) meta = upd;
                    frag.appendChild(buildSuggestItem({
                      kind: 'history-conv',
                      href: (conv.url || href).toString(),
                      numText: '#' + (conv.id || '').toString(),
                      subjectText: (conv.subject || q).toString(),
                      statusName: (conv.status_name || '').toString(),
                      statusClass: (conv.status_class || '').toString(),
                      metaText: meta
                    }));
                  } else {
                    frag.appendChild(buildSuggestItem({
                      kind: 'history-q',
                      href: href,
                      subjectText: q
                    }));
                  }
                }
                if (!any) {
                  hideDd();
                  return;
                }
                dd.appendChild(frag);
                showDd();
                lastItems = [];
                setActive(-1);
              }

              function renderHistoryLoading() {
                clearNode(dd);
                var frag = document.createDocumentFragment();
                appendHeading(frag, I18N.recentSearches || 'Recent searches');
                appendSeparator(frag);
                frag.appendChild(buildSuggestItem({
                  kind: 'history-loading',
                  href: '#',
                  numIconClass: 'glyphicon glyphicon-refresh',
                  subjectText: I18N.loadingRecent || 'Loading…',
                  extraClass: 'disabled'
                }));
                dd.appendChild(frag);
                showDd();
                lastItems = [];
                setActive(-1);
              }

              function renderHistory() {
                try {
                  var arr = loadHistory();
                  if (!arr || !arr.length || !smartUrl) {
                    hideDd();
                    return;
                  }

                  var hasRefreshable = false;
                  for (var i = 0; i < arr.length; i++) {
                    if (isRefreshableHistoryConversation(arr[i])) {
                      hasRefreshable = true;
                      break;
                    }
                  }

                  if (!hasRefreshable || !recentMetaUrl) {
                    renderHistoryList(arr);
                    return;
                  }

                  renderHistoryLoading();
                  refreshHistoryConversations(function () {
                    try {
                      var qCurrent = ((inputEl && inputEl.value) || '').toString().trim();
                      if (qCurrent || document.activeElement !== inputEl) {
                        hideDd();
                        return;
                      }
                      renderHistoryList(loadHistory());
                    } catch (e) {
                      hideDd();
                    }
                  });
                } catch (e) {
                  hideDd();
                }
              }

              var fetchSuggest = debounce(function () {
                try {
                  var q = (inputEl.value || '').trim();
                  // Empty input: show last 5 searches.
                  if (!q) {
                    renderHistory();
                    return;
                  }
                  // Too short: hide dropdown (keep it simple).
                  if (q.length < 2 || !suggestUrl) {
                    hideDd();
                    return;
                  }
                  var url = buildSuggestRequestUrl(q);
                  if (abortCtl) { try { abortCtl.abort(); } catch(e) {} }
                  abortCtl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
                  // Prefer fetch(), but fall back to jQuery if needed (older browsers).
                  if (typeof fetch === 'function') {
                    fetch(url, {
                      credentials: 'same-origin',
                      headers: { 'X-Requested-With': 'XMLHttpRequest' },
                      signal: abortCtl ? abortCtl.signal : undefined
                    })
                      .then(function (r) {
                        return r.json();
                      })
                      .then(function (data) {
                        renderDd((data && data.items) || []);
                      })
                      .catch(function () {
                        hideDd();
                      });
                  } else if (window.jQuery && typeof window.jQuery.getJSON === 'function') {
                    window.jQuery.getJSON(url)
                      .done(function (data) {
                        renderDd((data && data.items) || []);
                      })
                      .fail(function () {
                        hideDd();
                      });
                  } else {
                    hideDd();
                  }
                } catch (e) {
                  hideDd();
                }
              }, 180);

              inputEl.addEventListener('input', fetchSuggest);
              inputEl.addEventListener('focus', function () {
                // Re-render if user focuses back in.
                fetchSuggest();
              });

              // Store history on submit.
              formEl.addEventListener('submit', function () {
                try { rememberQuery(inputEl.value || ''); } catch (e) {}
              });

              inputEl.addEventListener('keydown', function (ev) {
                if (!ev) return;
                // ESC closes suggestions.
                if (ev.key === 'Escape') {
                  hideDd();
                  return;
                }
                if (dd.style.display !== 'block') return;

                var links = dd.querySelectorAll('.smartsearch-suggest-item');
                if (!links || !links.length) return;

                if (ev.key === 'ArrowDown') {
                  ev.preventDefault();
                  var next = activeIndex + 1;
                  if (next >= links.length) next = 0;
                  setActive(next);
                  return;
                }
                if (ev.key === 'ArrowUp') {
                  ev.preventDefault();
                  var prev = activeIndex - 1;
                  if (prev < 0) prev = links.length - 1;
                  setActive(prev);
                  return;
                }
                if (ev.key === 'Enter' && activeIndex >= 0) {
                  ev.preventDefault();
                  try {
                    var qNow2 = (inputEl.value || '').toString();
                    var kind2 = links[activeIndex].getAttribute('data-kind') || '';
                    if (kind2 === 'conv') {
                      var idx2 = parseInt(links[activeIndex].getAttribute('data-idx') || '-1', 10);
                      if (!isNaN(idx2) && idx2 >= 0 && lastItems && lastItems[idx2]) {
                        rememberConversationFromSuggest(qNow2, lastItems[idx2]);
                      } else {
                        rememberQuery(qNow2);
                      }
                    } else {
                      rememberQuery(qNow2);
                    }
                    window.location.href = links[activeIndex].getAttribute('href');
                  } catch(e) {}
                }
              });

              // Robust selection: navigate on mousedown so blur/hide can't cancel the click.
              // (Some FreeScout layouts re-render/hide navbar elements on blur/click.)
              dd.addEventListener('mousedown', function (ev) {
                try {
                  var a = ev && ev.target && ev.target.closest ? ev.target.closest('a.smartsearch-suggest-item') : null;
                  if (!a) {
                    // Still remember typed query when interacting with dropdown.
                    try { rememberQuery(inputEl.value || ''); } catch (e) {}
                    return;
                  }
                  ev.preventDefault();
                  ev.stopPropagation();
                  try {
                    var qNow3 = (inputEl.value || '').toString();
                    var kind = a.getAttribute('data-kind') || '';
                    if (kind === 'conv') {
                      var idx = parseInt(a.getAttribute('data-idx') || '-1', 10);
                      if (!isNaN(idx) && idx >= 0 && lastItems && lastItems[idx]) {
                        rememberConversationFromSuggest(qNow3, lastItems[idx]);
                      } else {
                        rememberQuery(qNow3);
                      }
                    } else {
                      rememberQuery(qNow3);
                    }
                  } catch (e) {
                    try { rememberQuery(inputEl.value || ''); } catch (e2) {}
                  }
                  var href = a.getAttribute('href');
                  if (href) {
                    window.location.href = href;
                  }
                } catch (e) {}
              });
              // Click-away hide
              document.addEventListener('click', function (ev) {
                try {
                  if (!li.contains(ev.target) && !dd.contains(ev.target)) {
                    hideDd();
                  }
                } catch (e) {}
              });
              // Slight blur delay so interactions inside dropdown don't instantly close it.
              inputEl.addEventListener('blur', function () {
                setTimeout(function () {
                  try {
                    // If focus moved into the dropdown, keep it open.
                    var ae = document.activeElement;
                    if (ae && dd.contains(ae)) {
                      return;
                    }
                  } catch (e) {}
                  hideDd();
                }, 200);
              });

              window.addEventListener('resize', function () {
                try {
                  placeInlineSearchItem();
                  if (dd.style.display === 'block') {
                    positionDd();
                  }
                } catch (e) {}
              });

              window.addEventListener('scroll', function () {
                try {
                  if (dd.style.display === 'block') {
                    positionDd();
                  }
                } catch (e) {}
              }, true);
            }
          } catch (e) {
            // no-op
          }
        } catch (e) {
          // no-op
        }
      }

      // Core magnifier dropdown form
      var form = document.querySelector('form.form-nav-search');
      if (form) {
        if (hideCore) {
          // Hide the core magnifier icon/trigger when explicitly configured.
          var iconHide = document.getElementById('search-dt');
          if (iconHide) {
            iconHide.style.display = 'none';
            // Also hide the closest <li> if present (varies by FreeScout version/theme).
            try {
              var li2 = iconHide.closest && iconHide.closest('li');
              if (li2) li2.style.display = 'none';
            } catch (e) {}
          }
        }

        if (useCore) {
          if (smartUrl) {
            form.setAttribute('action', smartUrl);
          }
          form.removeAttribute('target');

          var input = form.querySelector('input[name="q"]');
          if (input) {
            input.setAttribute('placeholder', I18N.inlinePlaceholder || 'Search...');
          }
          var btn = form.querySelector('button[type="submit"]');
          if (btn) {
            btn.textContent = I18N.search || 'Search';
          }
        }
      }

      // Add the always-visible inline bar (right side).
      ensureInlineTopbarSearch();

      // Keyboard shortcut: '/' focuses the topbar search (like GitHub, Slack, etc.)
      document.addEventListener('keydown', function (ev) {
        try {
          if (!ev || ev.defaultPrevented) return;
          var isSlash = (ev.key === '/');
          var isCtrlK = (ev.key && (ev.key.toLowerCase ? ev.key.toLowerCase() : ev.key) === 'k') && (ev.ctrlKey || ev.metaKey);
          if (!isSlash && !isCtrlK) return;
          if (isSlash && (ev.metaKey || ev.ctrlKey || ev.altKey)) return;
          if (isTypingTarget(ev.target)) return;

          var inlineInput = document.querySelector('#smartsearch-inline-li input.smartsearch-inline-input');
          if (inlineInput) {
            ev.preventDefault();
            inlineInput.focus();
            inlineInput.select();
          }
        } catch (e) {}
      });

      // If user clicks the magnifier icon, focus the input.
      var icon = document.getElementById('search-dt');
      if (icon && form && useCore) {
        icon.addEventListener('click', function () {
          setTimeout(function () {
            try {
              var input = form.querySelector('input[name="q"]');
              if (input) input.focus();
            } catch (e) {}
          }, 50);
        });
      }
    } catch (e) {
      // never break UI
    }
  });
})();

