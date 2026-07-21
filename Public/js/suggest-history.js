/* Smart Search – suggest-history.js */
(function (global) {
  'use strict';
  var SS = global.SmartSearch = global.SmartSearch || {};

  /**
   * Attach recent-search history helpers onto the shared suggest scope `S`.
   * Called from suggest.js inside SS.onReady after initShared().
   */
  SS.installSuggestHistory = function (S, helpers) {
    helpers = helpers || {};
    var clearNode = S.clearNode;
    var recentMetaUrl = S.recentMetaUrl;
    var I18N = S.I18N || {};
    var debounce = helpers.debounce || function (fn) { return fn; };
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

    S.HISTORY_KEY = HISTORY_KEY;
    S.normalizeHistory = normalizeHistory;
    S.loadHistory = loadHistory;
    S.saveHistory = saveHistory;
    S.rememberQuery = rememberQuery;
    S.rememberHistory = rememberHistory;
    S.isRefreshableHistoryConversation = isRefreshableHistoryConversation;
    S.refreshHistoryConversations = refreshHistoryConversations;
    S.rememberConversationFromSuggest = rememberConversationFromSuggest;
  };
})(typeof window !== 'undefined' ? window : this);
