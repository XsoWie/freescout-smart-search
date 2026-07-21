# -*- coding: utf-8 -*-
"""
Split form.js binder into ctx-based parts under ~500 lines each.
Reads module.recovered.js (authoritative) for the form function body.
"""
from __future__ import annotations

import pathlib
import re

ROOT = pathlib.Path(r"C:\Projekte\FreeScout\freescout-better-search\Public\js")
SRC = ROOT / "module.recovered.js"
lines = SRC.read_text(encoding="utf-8").splitlines(keepends=True)


def find_line(substr: str, start: int = 0) -> int:
    for i in range(start, len(lines)):
        if substr in lines[i]:
            return i
    raise RuntimeError(substr)


idx_bind = find_line("function bindsmartsearchMailboxFields()")
idx_end = find_line("function isTypingTarget(el)", idx_bind)

# Body of bindsmartsearchMailboxFields: after opening line until closing brace before isTypingTarget
# Structure:
#   function bindsmartsearchMailboxFields() {
#     try {
#       var form = ...
#       ...
#       // boot code
#     } catch ...
#   }
body_lines = lines[idx_bind + 1 : idx_end]

# Extract top-level nested functions (10 spaces + function)
FN_RE = re.compile(r"^(          )function ([A-Za-z0-9_]+)\b")

functions = []  # (name, start, end) relative to body_lines
i = 0
while i < len(body_lines):
    m = FN_RE.match(body_lines[i])
    if not m:
        i += 1
        continue
    name = m.group(2)
    start = i
    # brace match from this line
    depth = 0
    started = False
    j = i
    while j < len(body_lines):
        for ch in body_lines[j]:
            if ch == "{":
                depth += 1
                started = True
            elif ch == "}":
                depth -= 1
        if started and depth == 0:
            functions.append((name, start, j))
            i = j + 1
            break
        j += 1
    else:
        raise RuntimeError(f"unclosed function {name}")

print("functions", len(functions))
for name, a, b in functions:
    print(f"  {name}: lines {a+1}-{b+1} ({b-a+1})")

fn_names = [n for n, _, _ in functions]
fn_set = set(fn_names)

# Prolog: lines before first function (var form, fieldsCache, etc.)
prolog = body_lines[: functions[0][1]]
# Epilog: after last function (bindings) until end of try/catch of binder
epilog = body_lines[functions[-1][2] + 1 :]

print("prolog lines", len(prolog), "epilog", len(epilog))

# Groups by feature
GROUPS = [
    (
        "form-tiles.js",
        {
            "resetTilePanelStyle",
            "placeTilePanel",
            "closeAllTiles",
            "repositionOpenTile",
            "bindTiles",
            "appendRemovablePill",
            "findRemovablePillFromEvent",
            "uncheckByValue",
            "removeTilePill",
            "selectedStatusLabels",
            "refreshStatusPills",
            "refreshAssigneePills",
            "refreshSelectTile",
            "selectedRadioValue",
            "bindOptionList",
            "setMoreOpen",
            "bindMoreToggle",
            "refreshScopePills",
            "refreshTagsPills",
            "refreshDateLabel",
            "refreshCustomerLabel",
            "bindAdvancedTiles",
            "onDateChange",
            "collectCheckedValues",
        },
    ),
    (
        "form-cf.js",
        {
            "resetCfValuePopoverStyle",
            "closeAllCfValuePopovers",
            "placeCfValuePopover",
            "openCfValuePopover",
            "toggleCfValuePopover",
            "appendCfValueChip",
            "removeCfValueChip",
            "refreshCfValueBtn",
            "cfOpLabel",
            "cfOpBrief",
            "defaultCfOp",
            "opsForType",
            "cfHasRealOptions",
            "refreshCfSummary",
            "fieldById",
            "ensureCfValueShell",
            "rebuildCfValueUi",
            "collectCfRowState",
            "applyCfRowState",
            "rebuildCfValues",
            "findCfChipFromEventTarget",
            "bindCfValueTrigger",
            "reindexCfRows",
            "bindCfRow",
            "addCfRow",
        },
    ),
    (
        "form-state.js",
        {
            "collectFormState",
            "hasDefinedFilters",
            "persistFormState",
            "setRadioValue",
            "setCheckedValues",
            "applyFormState",
            "shouldRestoreSavedState",
            "restoreFormStateIfNeeded",
            "hideSearchResults",
            "resetFormState",
            "bindResetButton",
            "fetchFields",
        },
    ),
    (
        "form-presets.js",
        {
            "setPresetSaveOpen",
            "refreshPresetSaveVisibility",
            "tileText",
            "buildClientPresetSummary",
            "formatPresetDateParts",
            "setPresetLoadVisible",
            "setPresetLoadOpen",
            "hidePresetDialogs",
            "applyPresetFilters",
            "renderPresetList",
            "fetchPresets",
            "deletePreset",
            "bindPresetControls",
        },
    ),
]

assigned = set()
for _, names in GROUPS:
    assigned |= names
missing = [n for n in fn_names if n not in assigned and n != "bindsmartsearchMailboxFields"]
print("missing from groups", missing)

# Call rewrite: replace bare function calls to ctx.fn for known fn names
# Avoid replacing "function name" definitions and property keys.


def rewrite_calls(text: str) -> str:
    # Replace name( with ctx.name( when name is a known function, not after . or function
    for name in sorted(fn_set, key=len, reverse=True):
        text = re.sub(rf"(?<![\w.$])(?<!function ){re.escape(name)}\s*\(", f"ctx.{name}(", text)
    return text


def fn_source(name: str, start: int, end: int) -> str:
    raw = "".join(body_lines[start : end + 1])
    # function foo( -> ctx.foo = function(
    raw = re.sub(
        rf"^(\s*)function {re.escape(name)}\b",
        rf"\1ctx.{name} = function",
        raw,
        count=1,
        flags=re.M,
    )
    return rewrite_calls(raw)


HEADER = """/* Smart Search – {name} */
(function (global) {{
  'use strict';
  var SS = global.SmartSearch = global.SmartSearch || {{}};

  SS.formPartsExpected = (SS.formPartsExpected || 0) + 1;
  SS.onReady(function () {{
    try {{
      var ctx = SS.beginFormContext();
      if (!ctx) {{
        SS.finishFormPart();
        return;
      }}
"""

FOOTER = """
      SS.finishFormPart();
    } catch (e) {
      try { SS.finishFormPart(); } catch (e2) {}
    }
  });
})(typeof window !== 'undefined' ? window : this);
"""

# form.js bootstrap: beginFormContext + boot epilog
boot = []
boot.append(
    """/* Smart Search – form.js (bootstrap) */
(function (global) {
  'use strict';
  var SS = global.SmartSearch = global.SmartSearch || {};

  SS.beginFormContext = function () {
    if (SS._formCtx) {
      return SS._formCtx;
    }
    var S = SS.initShared();
    if (!S) {
      return null;
    }
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
    var I18N = S.I18N || {};
    var getCsrfToken = S.getCsrfToken || function () { return ''; };

    var form = document.querySelector('form.smartsearch-form');
    if (!form) {
      return null;
    }

    var ctx = {
      form: form,
      cfg: cfg,
      fieldsUrl: fieldsUrl,
      fieldsUrlLocal: fieldsUrl,
      presetsUrl: presetsUrl,
      clearNode: clearNode,
      getCfgAttr: getCfgAttr,
      FORM_STORAGE_KEY: FORM_STORAGE_KEY,
      defaultStatuses: defaultStatuses,
      defaultMailboxId: defaultMailboxId,
      getDefaultFormState: getDefaultFormState,
      readSavedFormState: readSavedFormState,
      getSearchFormState: getSearchFormState,
      normalizeAssigneeIds: normalizeAssigneeIds,
      writeFormStateToStorage: writeFormStateToStorage,
      getCsrfToken: getCsrfToken,
      I18N: I18N,
      fieldsCache: [],
      openTilePanel: null,
      openCfValuePopoverEl: null
    };

    // Local aliases used by migrated function bodies via closure.
"""
)

# Attach prolog vars into ctx setup - rewrite prolog to assign to ctx
# Original prolog has: try { var form = ...; var fieldsCache = []; ...
prolog_txt = "".join(prolog)
# We'll manually set essentials in beginFormContext (already) and skip duplicate prolog vars.

boot.append(
    """
    // Convenience: allow function bodies to use short names via with-like locals
    ctx.alias = function () {
      return ctx;
    };

    SS._formCtx = ctx;
    return ctx;
  };

  SS.finishFormPart = function () {
    SS._formPartsReady = (SS._formPartsReady || 0) + 1;
    var expected = SS.formPartsExpected || 0;
    if (expected > 0 && SS._formPartsReady >= expected && SS._formCtx && !SS._formBooted) {
      SS._formBooted = true;
      try {
        SS.bootSmartSearchForm(SS._formCtx);
      } catch (eBoot) {}
    }
  };

  SS.bootSmartSearchForm = function (ctx) {
    var form = ctx.form;
    var I18N = ctx.I18N;
    var fieldsUrlLocal = ctx.fieldsUrlLocal;
    var clearNode = ctx.clearNode;
    var persistFormState = function () { return ctx.persistFormState && ctx.persistFormState(); };
    var refreshStatusPills = function () { return ctx.refreshStatusPills && ctx.refreshStatusPills(); };
    var refreshAssigneePills = function () { return ctx.refreshAssigneePills && ctx.refreshAssigneePills(); };
    var refreshScopePills = function () { return ctx.refreshScopePills && ctx.refreshScopePills(); };
    var refreshTagsPills = function () { return ctx.refreshTagsPills && ctx.refreshTagsPills(); };
    var refreshDateLabel = function () { return ctx.refreshDateLabel && ctx.refreshDateLabel(); };
    var refreshCustomerLabel = function () { return ctx.refreshCustomerLabel && ctx.refreshCustomerLabel(); };
    var refreshCfSummary = function () { return ctx.refreshCfSummary && ctx.refreshCfSummary(); };
    var refreshPresetSaveVisibility = function () { return ctx.refreshPresetSaveVisibility && ctx.refreshPresetSaveVisibility(); };
    var bindTiles = function () { return ctx.bindTiles && ctx.bindTiles(); };
    var bindMoreToggle = function () { return ctx.bindMoreToggle && ctx.bindMoreToggle(); };
    var bindAdvancedTiles = function () { return ctx.bindAdvancedTiles && ctx.bindAdvancedTiles(); };
    var bindResetButton = function () { return ctx.bindResetButton && ctx.bindResetButton(); };
    var bindPresetControls = function () { return ctx.bindPresetControls && ctx.bindPresetControls(); };
    var bindOptionList = function (a, b, c) { return ctx.bindOptionList && ctx.bindOptionList(a, b, c); };
    var bindCfRow = function (row) { return ctx.bindCfRow && ctx.bindCfRow(row); };
    var addCfRow = function () { return ctx.addCfRow && ctx.addCfRow(); };
    var fetchFields = function () { return ctx.fetchFields && ctx.fetchFields(); };
    var shouldRestoreSavedState = function () { return ctx.shouldRestoreSavedState && ctx.shouldRestoreSavedState(); };
    var restoreFormStateIfNeeded = function () { return ctx.restoreFormStateIfNeeded && ctx.restoreFormStateIfNeeded(); };
"""
)

# Append rewritten epilog with ctx. calls
epilog_rw = rewrite_calls("".join(epilog))
# Epilog still uses bare `form`, `fieldsUrlLocal`, `I18N` — those are locals in bootSmartSearchForm
boot.append(epilog_rw)
boot.append(
    """
  };
})(typeof window !== 'undefined' ? window : this);
"""
)

(ROOT / "form.js").write_text("".join(boot), encoding="utf-8", newline="\n")
print("wrote form.js", "".join(boot).count("\n"))

# Index functions by name
by_name = {n: (a, b) for n, a, b in functions}

for filename, names in GROUPS:
    parts = [HEADER.format(name=filename)]
    # Local aliases at start of each part so rewritten bodies can use form/I18N/etc.
    parts.append(
        """
      var form = ctx.form;
      var I18N = ctx.I18N;
      var clearNode = ctx.clearNode;
      var fieldsUrlLocal = ctx.fieldsUrlLocal;
      var fieldsCache = ctx.fieldsCache;
      var presetsUrl = ctx.presetsUrl;
      var FORM_STORAGE_KEY = ctx.FORM_STORAGE_KEY;
      var defaultStatuses = ctx.defaultStatuses;
      var defaultMailboxId = ctx.defaultMailboxId;
      var getDefaultFormState = ctx.getDefaultFormState;
      var readSavedFormState = ctx.readSavedFormState;
      var getSearchFormState = ctx.getSearchFormState;
      var normalizeAssigneeIds = ctx.normalizeAssigneeIds;
      var writeFormStateToStorage = ctx.writeFormStateToStorage;
      var getCsrfToken = ctx.getCsrfToken;
      var getCfgAttr = ctx.getCfgAttr;
"""
    )
    # Note: fieldsCache is array - need same reference. Using ctx.fieldsCache and
    # `var fieldsCache = ctx.fieldsCache` keeps reference. openTilePanel is scalar - need getters.
    parts.append(
        """
      Object.defineProperty(ctx, '_linkScalars', { value: true });
      // Keep mutable scalars on ctx; local getters/setters via functions in bodies use ctx.* after rewrite.
"""
    )

    for name in fn_names:
        if name not in names:
            continue
        a, b = by_name[name]
        src = fn_source(name, a, b)
        # Fix scalar openTilePanel / openCfValuePopoverEl / fieldsCache access:
        src = src.replace("openTilePanel", "ctx.openTilePanel")
        src = src.replace("ctx.ctx.openTilePanel", "ctx.openTilePanel")
        src = src.replace("openCfValuePopoverEl", "ctx.openCfValuePopoverEl")
        src = src.replace("ctx.ctx.openCfValuePopoverEl", "ctx.openCfValuePopoverEl")
        src = src.replace("fieldsCache", "ctx.fieldsCache")
        src = src.replace("ctx.ctx.fieldsCache", "ctx.fieldsCache")
        parts.append(src)
        if not src.endswith("\n"):
            parts.append("\n")

    parts.append(FOOTER)
    text = "".join(parts)
    (ROOT / filename).write_text(text, encoding="utf-8", newline="\n")
    print(f"wrote {filename}: {text.count(chr(10))} lines")
