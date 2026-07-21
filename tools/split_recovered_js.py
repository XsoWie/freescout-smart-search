# -*- coding: utf-8 -*-
"""Split module.js (recovered, without bulk) into core/form/suggest."""
from __future__ import annotations

import pathlib
import re

ROOT = pathlib.Path(r"C:\Projekte\FreeScout\freescout-better-search\Public\js")
SRC = ROOT / "module.js"
lines = SRC.read_text(encoding="utf-8").splitlines(keepends=True)


def find_line(substr: str, start: int = 0) -> int:
    for i in range(start, len(lines)):
        if substr in lines[i]:
            return i
    raise RuntimeError(f"marker not found: {substr!r}")


idx_bind_fn = find_line("function bindsmartsearchMailboxFields()")
idx_is_typing = find_line("function isTypingTarget(el)", idx_bind_fn)
idx_bind_call = find_line("bindsmartsearchMailboxFields();", idx_is_typing)
idx_ensure = find_line("function ensureInlineTopbarSearch()", idx_bind_call)

# Drop outer IIFE / onReady — we rebuild wrappers.
# lines[0]= (function, [1]=onReady fn, [9]=onReady(function, [10]=try, [11]=blank?/cfg
# Content starts at cfg line
idx_cfg = find_line("var cfg = document.getElementById('smartsearch-config')")
# End of first IIFE
assert lines[-1].strip() == "})();" or lines[-2].strip() == "})();"

core_helpers = lines[idx_cfg:idx_bind_fn]
form_fn = lines[idx_bind_fn:idx_is_typing]
suggest_helpers = lines[idx_is_typing:idx_bind_call]
# skip bind call line
suggest_main = lines[idx_ensure:]
# strip trailing })(); of original IIFE from suggest_main
while suggest_main and suggest_main[-1].strip() in ("", "})();", "});"):
    last = suggest_main[-1].strip()
    suggest_main.pop()
    if last == "})();":
        break
# Also remove the closing of onReady try/catch if present at end
# Original ends with:
#     } catch (e) { ... }
#   });
# })();
# After popping })(); we may still have }); and catch from onReady — strip carefully
# Read tail of suggest_main
while suggest_main and suggest_main[-1].strip() in ("", "});"):
    if suggest_main[-1].strip() == "});":
        suggest_main.pop()
        break
    suggest_main.pop()
# Remove outer catch of onReady if it's the last catch for the whole onReady
# suggest_main should end with keyboard shortcut code inside try — check
tail = "".join(suggest_main[-30:])
print("--- suggest tail ---")
print(tail[-400:])
print("---")

HEADER = """/* Smart Search – {name} */
(function (global) {{
  'use strict';
  var SS = global.SmartSearch = global.SmartSearch || {{}};

"""

FOOTER = """
})(typeof window !== 'undefined' ? window : this);
"""


def write(path: pathlib.Path, content: str) -> None:
    path.write_text(content, encoding="utf-8", newline="\n")
    n = content.count("\n") + (0 if content.endswith("\n") else 1)
    print(f"wrote {path.name}: {n} lines, {len(content.encode())} bytes")


# --- core.js ---
core = []
core.append(HEADER.format(name="core.js"))
core.append(
    """  SS.onReady = function (fn) {
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
"""
)
for line in core_helpers:
    core.append("  " + line if line.strip() else "\n")
core.append(
    """
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
    SS.I18N = I18N;
    SS._sharedReady = true;
    return SS;
  };
"""
)
core.append(FOOTER)
write(ROOT / "core.js", "".join(core))

# --- form.js ---
form = []
form.append(HEADER.format(name="form.js"))
form.append("  SS.onReady(function () {\n")
form.append("    try {\n")
form.append("      var S = SS.initShared();\n")
form.append("      var cfg = S.cfg;\n")
form.append("      var fieldsUrl = S.fieldsUrl;\n")
form.append("      var presetsUrl = S.presetsUrl;\n")
form.append("      var clearNode = S.clearNode;\n")
form.append("      var getCfgAttr = S.getCfgAttr;\n")
form.append("      var FORM_STORAGE_KEY = S.FORM_STORAGE_KEY;\n")
form.append("      var defaultStatuses = S.defaultStatuses;\n")
form.append("      var defaultMailboxId = S.defaultMailboxId;\n")
form.append("      var getDefaultFormState = S.getDefaultFormState;\n")
form.append("      var readSavedFormState = S.readSavedFormState;\n")
form.append("      var getSearchFormState = S.getSearchFormState;\n")
form.append("      var normalizeAssigneeIds = S.normalizeAssigneeIds;\n")
form.append("      var writeFormStateToStorage = S.writeFormStateToStorage;\n")
form.append("      var I18N = S.I18N || {};\n")
for line in form_fn:
    form.append(line)
form.append("      bindsmartsearchMailboxFields();\n")
form.append("    } catch (e) {\n")
form.append("      // Never break the Smart Search page.\n")
form.append("    }\n")
form.append("  });\n")
form.append(FOOTER)
write(ROOT / "form.js", "".join(form))

# --- suggest.js ---
sug = []
sug.append(HEADER.format(name="suggest.js"))
sug.append("  SS.onReady(function () {\n")
sug.append("    try {\n")
sug.append("      var S = SS.initShared();\n")
sug.append("      var cfg = S.cfg;\n")
sug.append("      var smartUrl = S.smartUrl;\n")
sug.append("      var suggestUrl = S.suggestUrl;\n")
sug.append("      var recentMetaUrl = S.recentMetaUrl;\n")
sug.append("      var useCore = S.useCore;\n")
sug.append("      var hideCore = S.hideCore;\n")
sug.append("      var showInline = S.showInline;\n")
sug.append("      var clearNode = S.clearNode;\n")
sug.append("      var getCfgAttr = S.getCfgAttr;\n")
sug.append("      var getSearchFormState = S.getSearchFormState;\n")
sug.append("      var appendFormStateToParams = S.appendFormStateToParams;\n")
sug.append("      var buildSmartSearchUrl = S.buildSmartSearchUrl;\n")
sug.append("      var I18N = S.I18N || {};\n")
# need form reference for useCore icon focus at end
sug.append("      var form = document.querySelector('form.smartsearch-navbar-form') || document.getElementById('search-form');\n")
for line in suggest_helpers:
    sug.append(line)
for line in suggest_main:
    sug.append(line)
sug.append("    } catch (e) {\n")
sug.append("      // never break UI\n")
sug.append("    }\n")
sug.append("  });\n")
sug.append(FOOTER)
write(ROOT / "suggest.js", "".join(sug))

# --- module.js thin bootstrap ---
write(
    ROOT / "module.js",
    """/* Smart Search – bootstrap (assets load via ServiceProvider) */
(function () {
  'use strict';
})();
""",
)

print("form lines", "".join(form).count("\n"))
print("suggest lines", "".join(sug).count("\n"))
print("core lines", "".join(core).count("\n"))
