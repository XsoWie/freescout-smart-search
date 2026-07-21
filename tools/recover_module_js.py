# -*- coding: utf-8 -*-
"""Replay module.js StrReplace ops from the agent transcript onto HEAD module.js."""
import json
import pathlib
import re
import shutil

transcript = pathlib.Path(
    r"C:\Users\danie\.cursor\projects\c-Projekte-FreeScout-freescout-auto-link-ticket"
    r"\agent-transcripts\55a3b9c1-c111-419a-b173-0908f9f7326a"
    r"\55a3b9c1-c111-419a-b173-0908f9f7326a.jsonl"
)
target = pathlib.Path(r"C:\Projekte\FreeScout\freescout-better-search\Public\js\module.js")
out = pathlib.Path(r"C:\Projekte\FreeScout\freescout-better-search\Public\js\module.recovered.js")
backup = pathlib.Path(r"C:\Projekte\FreeScout\freescout-better-search\Public\js\module.js.head.bak")

if not backup.exists():
    shutil.copy2(target, backup)

text = target.read_text(encoding="utf-8")
ops = []
for line in transcript.open(encoding="utf-8"):
    try:
        obj = json.loads(line)
    except Exception:
        continue
    content = (obj.get("message") or {}).get("content")
    if not isinstance(content, list):
        continue
    for part in content:
        if not isinstance(part, dict) or part.get("type") != "tool_use":
            continue
        if part.get("name") != "StrReplace":
            continue
        inp = part.get("input") or {}
        path = str(inp.get("path") or "")
        if "better-search" not in path.replace("\\", "/") or not path.endswith("module.js"):
            continue
        old = inp.get("old_string")
        new = inp.get("new_string")
        if old is None or new is None:
            continue
        ops.append((old, new, bool(inp.get("replace_all"))))

print("ops", len(ops))
ok = 0
fail = 0
fail_idx = []
for i, (old, new, ra) in enumerate(ops):
    if old not in text:
        fail += 1
        fail_idx.append(i)
        continue
    if ra:
        text = text.replace(old, new)
    else:
        text = text.replace(old, new, 1)
    ok += 1

print("ok", ok, "fail", fail)
print("fail idxs", fail_idx[:50])
for i in fail_idx[:5]:
    print("FAIL", i, "old starts:", repr(ops[i][0][:160]))

out.write_text(text, encoding="utf-8")
print("written", out, "bytes", len(text.encode("utf-8")))

keys = [
    "FORM_STORAGE",
    "appendFormStateToParams",
    "closeAllCfValuePopovers",
    "smartsearch-sort-input",
    "presetsUrl",
    "smartsearch-cf-value-btn",
    "results-section",
    "assignee-pills",
]
for k in keys:
    print(k, "->", k in text)

for pat in [
    r"function bindPresets",
    r"function collectFormState",
    r"function applyFormState",
    r"function refreshAssignee",
    r"function hideSearchResults",
    r"function appendFormState",
    r"function bindAdvanced",
]:
    print(pat, "->", bool(re.search(pat, text)))
