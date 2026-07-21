/* Smart Search – suggest.js */
(function (global) {
  'use strict';
  var SS = global.SmartSearch = global.SmartSearch || {};

  SS.onReady(function () {
    try {
      var S = SS.initShared();
      var cfg = S.cfg;
      var smartUrl = S.smartUrl;
      var suggestUrl = S.suggestUrl;
      var recentMetaUrl = S.recentMetaUrl;
      var useCore = S.useCore;
      var hideCore = S.hideCore;
      var showInline = S.showInline;
      var clearNode = S.clearNode;
      var getCfgAttr = S.getCfgAttr;
      var getSearchFormState = S.getSearchFormState;
      var appendFormStateToParams = S.appendFormStateToParams;
      var buildSmartSearchUrl = S.buildSmartSearchUrl;
      var formatSearchSmartFor = S.formatSearchSmartFor || function (q) {
        return ((S.I18N && S.I18N.searchSmartFor) || '').replace(':q', q);
      };
      var emitResetFilters = S.emitResetFilters || function () {
        if (typeof S.writeFormStateToStorage === 'function' && typeof S.getDefaultFormState === 'function') {
          S.writeFormStateToStorage(S.getDefaultFormState());
        }
        try {
          document.dispatchEvent(new CustomEvent('smartsearch:reset-filters'));
        } catch (eEvt) {}
      };
      var hasDefinedFilters = S.hasDefinedFilters || function () { return false; };
      var buildFilterSummary = S.buildFilterSummary || function () { return ''; };
      var I18N = S.I18N || {};
      var form = document.querySelector('form.form-nav-search');
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

      SS.installSuggestHistory(S, { debounce: debounce });
      var loadHistory = S.loadHistory;
      var saveHistory = S.saveHistory;
      var rememberQuery = S.rememberQuery;
      var rememberHistory = S.rememberHistory;
      var rememberConversationFromSuggest = S.rememberConversationFromSuggest;
      var refreshHistoryConversations = S.refreshHistoryConversations;
      var isRefreshableHistoryConversation = S.isRefreshableHistoryConversation;
      var normalizeHistory = S.normalizeHistory;
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

              function appendFilterHeadRow(parent) {
                if (!hasDefinedFilters(getSearchFormState())) {
                  return false;
                }
                var summary = buildFilterSummary(getSearchFormState(), 90);
                if (!summary) {
                  return false;
                }
                var row = document.createElement('div');
                row.className = 'smartsearch-suggest-head-row';

                var filters = document.createElement('div');
                filters.className = 'smartsearch-suggest-filters';
                filters.title = summary;

                var label = document.createElement('span');
                label.className = 'smartsearch-suggest-filters-label';
                appendText(label, I18N.filterPrefix || 'Filter:');
                filters.appendChild(label);
                filters.appendChild(document.createTextNode(' '));

                var text = document.createElement('span');
                text.className = 'smartsearch-suggest-filters-text';
                appendText(text, summary);
                filters.appendChild(text);

                var resetBtn = document.createElement('button');
                resetBtn.type = 'button';
                resetBtn.className = 'smartsearch-suggest-reset-filters';
                resetBtn.setAttribute('aria-label', I18N.resetFilters || I18N.reset || 'Reset filters');
                resetBtn.setAttribute('title', I18N.resetFilters || I18N.reset || 'Reset filters');
                appendText(resetBtn, '×');
                // mousedown: avoid input-blur closing the dialog before the action runs.
                resetBtn.addEventListener('mousedown', function (ev) {
                  try { ev.preventDefault(); } catch (ePrev) {}
                  try { ev.stopPropagation(); } catch (eStop) {}
                  emitResetFilters();
                  fetchSuggest();
                });
                filters.appendChild(resetBtn);

                row.appendChild(filters);
                parent.appendChild(row);
                return true;
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
                appendFilterHeadRow(frag);
                appendHeading(frag, I18N.suggestions || 'Suggestions');

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
                if (!smartUrl) {
                  hideDd();
                  return;
                }
                var hasFilters = hasDefinedFilters(getSearchFormState());
                if ((!arr || !arr.length) && !hasFilters) {
                  hideDd();
                  return;
                }
                clearNode(dd);
                var frag = document.createDocumentFragment();
                appendFilterHeadRow(frag);
                var any = false;
                if (arr && arr.length) {
                  appendHeading(frag, I18N.recentSearches || 'Recent searches');
                  appendSeparator(frag);
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
                }
                if (!any && !hasFilters) {
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
                appendFilterHeadRow(frag);
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
                  if ((!arr || !arr.length) && !hasDefinedFilters(getSearchFormState())) {
                    hideDd();
                    return;
                  }
                  if (!smartUrl) {
                    hideDd();
                    return;
                  }
                  if (!arr || !arr.length) {
                    renderHistoryList([]);
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

})(typeof window !== 'undefined' ? window : this);
