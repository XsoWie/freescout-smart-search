/* Smart Search – form-tiles.js */
(function (global) {
  'use strict';
  var SS = global.SmartSearch = global.SmartSearch || {};

  /**
   * Tile panels, pills, more-toggle, advanced tiles chrome.
   * Called from form.js after ctx is created.
   */
  SS.installFormTiles = function (ctx) {
    var form = ctx.form;
    var clearNode = ctx.clearNode;
    var I18N = ctx.I18N || {};

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
      ctx.openTilePanel = panel;
    }

    function closeAllTiles(except) {
      if (typeof ctx.closeAllCfValuePopovers === 'function') {
        ctx.closeAllCfValuePopovers();
      }
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
      if (!except) ctx.openTilePanel = null;
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
            if (ctx.openCfValueWrap && !ctx.openCfValueWrap.contains(ev.target)) {
              if (typeof ctx.closeAllCfValuePopovers === 'function') {
                ctx.closeAllCfValuePopovers();
              }
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
          if (ctx.openCfValueWrap) {
            if (typeof ctx.closeAllCfValuePopovers === 'function') {
              ctx.closeAllCfValuePopovers();
            }
            ev.preventDefault();
            return;
          }
        }
      });
      window.addEventListener('resize', function () {
        repositionOpenTile();
        if (ctx.openCfValueWrap && typeof ctx.placeCfValuePopover === 'function') {
          ctx.placeCfValuePopover(ctx.openCfValueWrap);
        }
      });
      // Ignore scrolls that originate inside the open panel (otherwise
      // reposition resets scrollTop and scrolling appears broken).
      window.addEventListener('scroll', function (ev) {
        var target = ev && ev.target;
        if (ctx.openCfValueWrap && target && (ctx.openCfValueWrap === target || ctx.openCfValueWrap.contains(target))) {
          return;
        }
        if (ctx.openCfValueWrap) {
          var openPop = ctx.openCfValueWrap.querySelector('.smartsearch-cf-value-popover');
          if (openPop && target && (openPop === target || openPop.contains(target))) {
            return;
          }
          // Panel/page scroll while a value popover is open: keep it aligned.
          if (typeof ctx.placeCfValuePopover === 'function') {
            ctx.placeCfValuePopover(ctx.openCfValueWrap);
          }
        }
        if (ctx.openTilePanel && target && ctx.openTilePanel.contains(target)) {
          return;
        }
        if (ctx.openTilePanel && target === ctx.openTilePanel) {
          return;
        }
        repositionOpenTile();
      }, true);
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
        if (typeof ctx.refreshTagsPills === 'function') ctx.refreshTagsPills();
      } else if (kind === 'scope') {
        uncheckByValue('.smartsearch-scope-checks input[type="checkbox"]', value);
        if (typeof ctx.refreshScopePills === 'function') ctx.refreshScopePills();
      } else if (kind === 'cf') {
        var rows = form.querySelectorAll('.smartsearch-cf-row');
        var idx = parseInt(value, 10);
        var row = (!isNaN(idx) && rows[idx]) ? rows[idx] : null;
        if (row) {
          if (rows.length <= 1) {
            var sel = row.querySelector('select.smartsearch-cf-id');
            if (sel) sel.value = '0';
            if (typeof ctx.rebuildCfValues === 'function') ctx.rebuildCfValues(row);
          } else {
            if (typeof ctx.closeAllCfValuePopovers === 'function') ctx.closeAllCfValuePopovers();
            row.parentNode.removeChild(row);
            if (typeof ctx.reindexCfRows === 'function') ctx.reindexCfRows();
            if (typeof ctx.refreshCfSummary === 'function') ctx.refreshCfSummary();
          }
        }
      }
      if (typeof ctx.persistFormState === 'function') {
        try { ctx.persistFormState(); } catch (ePill) {}
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
        if (typeof ctx.persistFormState === 'function') ctx.persistFormState();
      });
    }

    ctx.resetTilePanelStyle = resetTilePanelStyle;
    ctx.placeTilePanel = placeTilePanel;
    ctx.closeAllTiles = closeAllTiles;
    ctx.repositionOpenTile = repositionOpenTile;
    ctx.bindTiles = bindTiles;
    ctx.selectedStatusLabels = selectedStatusLabels;
    ctx.appendRemovablePill = appendRemovablePill;
    ctx.findRemovablePillFromEvent = findRemovablePillFromEvent;
    ctx.uncheckByValue = uncheckByValue;
    ctx.removeTilePill = removeTilePill;
    ctx.refreshStatusPills = refreshStatusPills;
    ctx.refreshAssigneePills = refreshAssigneePills;
    ctx.refreshSelectTile = refreshSelectTile;
    ctx.selectedRadioValue = selectedRadioValue;
    ctx.bindOptionList = bindOptionList;
    ctx.setMoreOpen = setMoreOpen;
    ctx.bindMoreToggle = bindMoreToggle;
  };
})(typeof window !== 'undefined' ? window : this);
