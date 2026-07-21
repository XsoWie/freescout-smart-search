# -*- coding: utf-8 -*-
"""Split module.css into suggest.css + form.css + results.css."""
from __future__ import annotations

import pathlib

CSS = pathlib.Path(r"C:\Projekte\FreeScout\freescout-better-search\Public\css")
src = (CSS / "module.css").read_text(encoding="utf-8")
lines = src.splitlines(keepends=True)

# Markers (1-based from earlier): form starts ~579
form_idx = None
results_idx = None
for i, line in enumerate(lines):
    if form_idx is None and "===== Smart Search form card" in line:
        form_idx = i
    if "smartsearch-results" in line and results_idx is None and i > (form_idx or 0):
        # first results-related block after form start — find a clearer marker
        pass

# Find results section more reliably
for i, line in enumerate(lines):
    if line.startswith("/*") and "result" in line.lower() and i > 600:
        results_idx = i
        break

# Fallback: look for .smartsearch-results-section or table styles
if results_idx is None:
    for i, line in enumerate(lines):
        if i > 900 and (
            line.startswith(".smartsearch-results")
            or "Results table" in line
            or "smartsearch-bulk" in line
        ):
            # back up to preceding comment if any
            j = i
            while j > 0 and lines[j - 1].strip() == "":
                j -= 1
            if j > 0 and lines[j - 1].lstrip().startswith("/*"):
                results_idx = j - 1
            else:
                results_idx = i
            break

print("form_idx", form_idx, "results_idx", results_idx, "total", len(lines))
if form_idx is None:
    raise SystemExit("form marker missing")
if results_idx is None:
    # split form in half as fallback
    results_idx = form_idx + (len(lines) - form_idx) // 2
    print("fallback results_idx", results_idx)

suggest = "".join(lines[:form_idx])
form = "".join(lines[form_idx:results_idx])
results = "".join(lines[results_idx:])

(CSS / "suggest.css").write_text(
    "/* Smart Search – suggest / topbar */\n" + suggest, encoding="utf-8", newline="\n"
)
(CSS / "form.css").write_text(
    "/* Smart Search – form / tiles */\n" + form, encoding="utf-8", newline="\n"
)
(CSS / "results.css").write_text(
    "/* Smart Search – results / bulk */\n" + results, encoding="utf-8", newline="\n"
)

# Thin module.css that only documents load order (empty rules optional)
(CSS / "module.css").write_text(
    "/* Smart Search bootstrap – styles load via ServiceProvider (suggest/form/results). */\n",
    encoding="utf-8",
    newline="\n",
)

for name in ("suggest.css", "form.css", "results.css", "module.css"):
    p = CSS / name
    t = p.read_text(encoding="utf-8")
    print(f"{name}: {t.count(chr(10))+1} lines")
