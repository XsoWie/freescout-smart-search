# -*- coding: utf-8 -*-
"""Split module.monolith.js into core.js / form.js / suggest.js (working wrappers)."""
from __future__ import annotations

import pathlib

ROOT = pathlib.Path(r"C:\Projekte\FreeScout\freescout-better-search\Public\js")
lines = (ROOT / "module.monolith.js").read_text(encoding="utf-8").splitlines(keepends=True)


def find_line(substr: str, start: int = 0) -> int:
    for i in range(start, len(lines)):
        if substr in lines[i]:
            return i
    raise RuntimeError(substr)


idx_cfg = find_line("var cfg = document.getElementById('smartsearch-config')")
idx_bind_fn = find_line("function bindsmartsearchMailboxFields()")
idx_is_typing = find_line("function isTypingTarget(el)", idx_bind_fn)
idx_bind_call = find_line("bindsmartsearchMailboxFields();", idx_is_typing)
idx_ensure = find_line("function ensureInlineTopbarSearch()", idx_bind_call)

core_helpers = lines[idx_cfg:idx_bind_fn]
form_fn = lines[idx_bind_fn:idx_is_typing]
suggest_helpers = lines[idx_is_typing:idx_bind_call]
suggest_main = lines[idx_ensure:]

# Trim original onReady/IIFE closings from suggest_main
while suggest_main:
    s = suggest_main[-1].strip()
    if s in ("", "})();", "});"):
        suggest_main.pop()
        if s == "})();":
            break
        continue
    break
# Remove leftover outer catch from original onReady (one block)
if len(suggest_main) >= 3:
    # expect trailing: } catch (e) { // never break UI }
    tail = "".join(suggest_main[-5:])
    if "} catch (e)" in tail and "never break UI" in tail:
        # pop catch block lines
        while suggest_main:
            line = suggest_main[-1]
            suggest_main.pop()
            if line.strip().startswith("} catch"):
                # also pop the catch body already popped? we popped from bottom
                # Actually we need to remove catch block entirely including closing brace
                break
        # remove catch body and closing }
        # After popping `} catch`, next pops should remove body + `}`
        # Simpler: find last "    } catch (e)" from end
        text = "".join(suggest_main)
        marker = "    } catch (e) {\n      // never break UI\n    }"
        if text.rstrip().endswith("}") and "// never break UI" in "\n".join(
            x.rstrip() for x in suggest_main[-4:]
        ):
            # pop until we removed the catch
            removed = []
            while suggest_main:
                removed.append(suggest_main.pop())
                chunk = "".join(reversed(removed))
                if "} catch (e)" in chunk and chunk.strip().endswith("}"):
                    break

HEADER = """/* Smart Search – {name} */
(function (global) {{
  'use strict';
  var SS = global.SmartSearch = global.SmartSearch || {{}};

"""
FOOTER = "\n})(typeof window !== 'undefined' ? window : this);\n"


def write(path: pathlib.Path, content: str) -> None:
    path.write_text(content, encoding="utf-8", newline="\n")
    print(path.name, content.count("\n"), "lines")


core = [HEADER.format(name="core.js")]
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
    SS.getCsrfToken = typeof getCsrfToken === 'function' ? getCsrfToken : function () { return ''; };
    SS.emitResetFilters = typeof emitResetFilters === 'function' ? emitResetFilters : null;
    SS.formatSearchSmartFor = typeof formatSearchSmartFor === 'function' ? formatSearchSmartFor : null;
    SS.truncateSummary = typeof truncateSummary === 'function' ? truncateSummary : null;
    SS.I18N = I18N;
    SS._sharedReady = true;
    return SS;
  };
"""
)
core.append(FOOTER)
write(ROOT / "core.js", "".join(core))

form = [HEADER.format(name="form.js")]
form.append("  SS.onReady(function () {\n    try {\n")
form.append(
    """      var S = SS.initShared();
      var cfg = S.cfg;
      var fieldsUrl = S.fieldsUrl;
      var presetsUrl = S.presetsUrl;
      var clearNode = S.clearNode;
      var getCfgAttr = S.getCfgAttr;
      var FORM_STORAGE_KEY = S.FORM_STORAGE_KEY;
      var defaultStatuses = S.defaultStatuses;
      var defaultMailboxId = S.defaultMailboxId;
      var getDefaultFormState = S.getDefaultFormState;
      var readSavedFormState = S.readSavedFormState;
      var getSearchFormState = S.getSearchFormState;
      var normalizeAssigneeIds = S.normalizeAssigneeIds;
      var writeFormStateToStorage = S.writeFormStateToStorage;
      var getCsrfToken = S.getCsrfToken;
      var I18N = S.I18N || {};
"""
)
for line in form_fn:
    form.append(line)
form.append("      bindsmartsearchMailboxFields();\n")
form.append("    } catch (e) {}\n  });\n")
form.append(FOOTER)
write(ROOT / "form.js", "".join(form))

sug = [HEADER.format(name="suggest.js")]
sug.append("  SS.onReady(function () {\n    try {\n")
sug.append(
    """      var S = SS.initShared();
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
        return (S.I18N.searchSmartFor || '').replace(':q', q);
      };
      var I18N = S.I18N || {};
      var form = document.querySelector('form.form-nav-search');
"""
)
for line in suggest_helpers:
    sug.append(line)
for line in suggest_main:
    sug.append(line)
sug.append("\n    } catch (e) {\n      // never break UI\n    }\n  });\n")
sug.append(FOOTER)
write(ROOT / "suggest.js", "".join(sug))

write(
    ROOT / "module.js",
    """/* Smart Search – bootstrap (core/form/suggest/bulk load via ServiceProvider) */
(function () {
  'use strict';
})();
""",
)

print("suggest_main ends with:")
print("".join(suggest_main[-12:]))
