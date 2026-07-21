# -*- coding: utf-8 -*-
"""Extract history helpers from suggest.js into suggest-history.js."""
from __future__ import annotations

import pathlib

ROOT = pathlib.Path(r"C:\Projekte\FreeScout\freescout-better-search\Public\js")
sug_path = ROOT / "suggest.js"
text = sug_path.read_text(encoding="utf-8")
lines = text.splitlines(keepends=True)

# Find HISTORY_KEY through end of rememberConversationFromSuggest function
start = None
end = None
for i, line in enumerate(lines):
    if start is None and "var HISTORY_KEY = " in line:
        start = i
    if start is not None and "function ensureInlineTopbarSearch" in line:
        end = i
        break
if start is None or end is None:
    raise SystemExit(f"markers missing start={start} end={end}")

history_block = lines[start:end]
# Trim trailing blank lines in history_block
while history_block and history_block[-1].strip() == "":
    history_block.pop()

header = """/* Smart Search – suggest-history.js */
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
"""

footer = """
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
"""

# history_block is indented with 6 spaces; add 2 more for function body (4 spaces base + 2)
out_hist = [header]
for line in history_block:
    if line.strip() == "":
        out_hist.append("\n")
    else:
        out_hist.append("  " + line)
out_hist.append(footer)
(ROOT / "suggest-history.js").write_text("".join(out_hist), encoding="utf-8", newline="\n")

# Rebuild suggest.js: remove history block, call installSuggestHistory, use S.* for history fns
new_sug = []
new_sug.extend(lines[:start])
new_sug.append("      SS.installSuggestHistory(S, { debounce: debounce });\n")
new_sug.append("      var loadHistory = S.loadHistory;\n")
new_sug.append("      var saveHistory = S.saveHistory;\n")
new_sug.append("      var rememberQuery = S.rememberQuery;\n")
new_sug.append("      var rememberHistory = S.rememberHistory;\n")
new_sug.append("      var rememberConversationFromSuggest = S.rememberConversationFromSuggest;\n")
new_sug.append("      var refreshHistoryConversations = S.refreshHistoryConversations;\n")
new_sug.append("      var isRefreshableHistoryConversation = S.isRefreshableHistoryConversation;\n")
new_sug.append("      var normalizeHistory = S.normalizeHistory;\n")
new_sug.extend(lines[end:])
sug_path.write_text("".join(new_sug), encoding="utf-8", newline="\n")

print("suggest-history.js", "".join(out_hist).count("\n"))
print("suggest.js", "".join(new_sug).count("\n"))
