# -*- coding: utf-8 -*-
"""Restore module.full.css, merge newer suggest-filter styles, split cleanly."""
from __future__ import annotations

import re
import subprocess
from pathlib import Path

BASE = Path(r"C:\Projekte\FreeScout\freescout-better-search")
CSS = BASE / "Public" / "css"


def git_show(path: str) -> str:
    return subprocess.check_output(
        ["git", "-C", str(BASE), "show", f"HEAD:{path}"],
        text=True,
        encoding="utf-8",
    )


def extract_block(css: str, start_selector: str, end_selector: str) -> str | None:
    """Extract rules from start_selector through (not including) end_selector."""
    start = css.find(start_selector)
    if start < 0:
        return None
    end = css.find(end_selector, start)
    if end < 0:
        return None
    return css[start:end]


def fix_results_media_query(css: str) -> str:
    """Remove orphaned blank/garbage lines inside the results mobile media query."""
    pattern = re.compile(
        r"(@media \(max-width: 767px\) \{\s*"
        r"\.smartsearch-results-bar \{[^}]+\}\s*)"
        r"(?:[ \t]*\n)+"
        r"(\s*max-width: none !important;\s*"
        r"width: 100%;\s*"
        r"\}\s*"
        r"\.smartsearch-bulk-toolbar \.btn \{)",
        re.M,
    )

    def repl(m: re.Match) -> str:
        # Drop orphaned properties that lost their selector.
        return m.group(1) + "\n  " + m.group(2).lstrip()

    fixed, n = pattern.subn(repl, css, count=1)
    print(f"media-query fix applied: {n}")
    return fixed


def merge_suggest_filters(full: str) -> str:
    """Replace old single-line filters rule with modern head-row + 2-line clamp UI."""
    wt_suggest = (CSS / "suggest.css").read_text(encoding="utf-8")
    # Prefer working-tree (has line-clamp); fall back to HEAD.
    modern = extract_block(
        wt_suggest,
        ".smartsearch-suggest-head-row",
        ".smartsearch-suggest-sep",
    )
    if not modern:
        head = git_show("Public/css/suggest.css")
        modern = extract_block(
            head,
            ".smartsearch-suggest-head-row",
            ".smartsearch-suggest-sep",
        )
    if not modern:
        raise SystemExit("modern suggest-filters block missing")

    # Old monolith used a simpler .smartsearch-suggest-filters { ... } rule.
    old = extract_block(full, ".smartsearch-suggest-filters", ".smartsearch-suggest-sep")
    if old and ".smartsearch-suggest-head-row" not in full:
        # Insert head-row before filters if needed — modern block already includes head-row.
        # Replace from first of head-row/filters through sep.
        # If old block starts at .smartsearch-suggest-filters, replace that stretch.
        start = full.find(".smartsearch-suggest-filters")
        end = full.find(".smartsearch-suggest-sep", start)
        if start < 0 or end < 0:
            raise SystemExit("cannot locate old filters block in full CSS")
        # Also pull in any preceding head-row if present in modern only
        full = full[:start] + modern.rstrip() + "\n\n" + full[end:]
        print("merged modern suggest-filters into full CSS")
    elif ".smartsearch-suggest-head-row" in full:
        start = full.find(".smartsearch-suggest-head-row")
        end = full.find(".smartsearch-suggest-sep", start)
        full = full[:start] + modern.rstrip() + "\n\n" + full[end:]
        print("updated existing suggest head-row/filters block")
    else:
        # Insert before .smartsearch-suggest-sep if filters missing entirely
        sep = full.find(".smartsearch-suggest-sep")
        if sep < 0:
            raise SystemExit("suggest-sep missing")
        full = full[:sep] + modern.rstrip() + "\n\n" + full[sep:]
        print("inserted modern suggest-filters block")
    return full


def split_css(full: str) -> None:
    lines = full.splitlines(keepends=True)

    results_idx = None
    form_idx = None
    extras_idx = None
    for i, line in enumerate(lines):
        if results_idx is None and line.startswith(".smartsearch-results-section"):
            results_idx = i
        if form_idx is None and "===== Smart Search form card" in line:
            form_idx = i
        if extras_idx is None and line.startswith(".smartsearch-preset-save"):
            # back up to preceding blank/comment if any
            j = i
            while j > 0 and lines[j - 1].strip() == "":
                j -= 1
            extras_idx = j

    print("indices", results_idx, form_idx, extras_idx, "total", len(lines))
    if None in (results_idx, form_idx, extras_idx):
        raise SystemExit("split markers missing")
    if not (results_idx < form_idx < extras_idx):
        raise SystemExit("split order invalid")

    suggest = "".join(lines[:results_idx])
    results = "".join(lines[results_idx:form_idx])
    form = "".join(lines[form_idx:extras_idx])
    extras = "".join(lines[extras_idx:])

    files = {
        "suggest.css": "/* Smart Search – suggest / topbar */\n" + suggest,
        "form.css": "/* Smart Search – form / tiles */\n" + form,
        "results.css": "/* Smart Search – results / bulk */\n" + results,
        "extras.css": "/* Smart Search – presets / extras */\n" + extras,
        "module.css": (
            "/* Smart Search – styles: suggest.css, form.css, results.css, extras.css "
            "(ServiceProvider) */\n"
        ),
        "module.full.css": full if full.endswith("\n") else full + "\n",
    }

    for name, content in files.items():
        if not content.endswith("\n"):
            content += "\n"
        (CSS / name).write_text(content, encoding="utf-8", newline="\n")
        text = content
        opens = text.count("{")
        closes = text.count("}")
        print(f"{name}: {text.count(chr(10))} lines, braces {opens}/{closes}")
        if name.endswith(".css") and name != "module.css" and opens != closes:
            raise SystemExit(f"unbalanced braces in {name}")


def main() -> None:
    # Prefer restored full from git commit if working file missing/short
    full_path = CSS / "module.full.css"
    full = full_path.read_text(encoding="utf-8")
    if full.count("\n") < 1000:
        full = subprocess.check_output(
            ["git", "-C", str(BASE), "show", "782b9a4:Public/css/module.full.css"],
            text=True,
            encoding="utf-8",
        )
    full = fix_results_media_query(full)
    full = merge_suggest_filters(full)
    # Normalize newlines
    full = full.replace("\r\n", "\n").replace("\r", "\n")
    if not full.endswith("\n"):
        full += "\n"
    split_css(full)
    print("OK")


if __name__ == "__main__":
    main()
