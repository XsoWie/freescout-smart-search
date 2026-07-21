/* Smart Search – form-presets.js */
(function (global) {
  'use strict';
  var SS = global.SmartSearch = global.SmartSearch || {};

  /**
   * Preset save / load UI.
   * Called from form.js after installFormState.
   */
  SS.installFormPresets = function (ctx) {
    var form = ctx.form;
    var clearNode = ctx.clearNode;
    var I18N = ctx.I18N || {};
    var presetsUrl = ctx.presetsUrl;
    var getCsrfToken = ctx.getCsrfToken;
    var truncateSummary = ctx.truncateSummary;
    var normalizeAssigneeIds = ctx.normalizeAssigneeIds;
    var getDefaultFormState = ctx.getDefaultFormState;

    function tileText(selector, fallback) {
      var el = form.querySelector(selector);
      if (!el) return fallback || '';
      return String(el.textContent || '').replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
    }

    function buildClientPresetSummary() {
      var parts = [];
      var state = ctx.collectFormState();
      var status = ctx.selectedStatusLabels();
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
      if (state.date_preset || state.date_from || state.date_to) {
        if (state.date_preset) {
          parts.push(String(state.date_preset));
        } else {
          parts.push((state.date_from || '…') + '–' + (state.date_to || '…'));
        }
      }
      if (state.sort && String(state.sort) !== 'updated_desc') {
        parts.push('Sort: ' + String(state.sort));
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
      var show = ctx.hasDefinedFilters();
      if (show) {
        saveWrap.classList.remove('is-hidden');
      } else {
        saveWrap.classList.add('is-hidden');
        setPresetSaveOpen(false);
      }
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
      ctx.closeAllTiles(null);
      ctx.applyFormState(next);
      ctx.persistFormState();
      hidePresetDialogs();
      if (ctx.fieldsUrlLocal && typeof ctx.fetchFields === 'function') ctx.fetchFields();
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
          var filters = ctx.collectFormState();
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

    ctx.tileText = tileText;
    ctx.buildClientPresetSummary = buildClientPresetSummary;
    ctx.formatPresetDateParts = formatPresetDateParts;
    ctx.setPresetSaveOpen = setPresetSaveOpen;
    ctx.refreshPresetSaveVisibility = refreshPresetSaveVisibility;
    ctx.setPresetLoadVisible = setPresetLoadVisible;
    ctx.setPresetLoadOpen = setPresetLoadOpen;
    ctx.hidePresetDialogs = hidePresetDialogs;
    ctx.applyPresetFilters = applyPresetFilters;
    ctx.renderPresetList = renderPresetList;
    ctx.fetchPresets = fetchPresets;
    ctx.deletePreset = deletePreset;
    ctx.bindPresetControls = bindPresetControls;
  };
})(typeof window !== 'undefined' ? window : this);
