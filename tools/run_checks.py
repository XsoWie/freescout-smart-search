# -*- coding: utf-8 -*-
"""Static + unit checks before release."""
from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

BASE = Path(r"C:\Projekte\FreeScout\freescout-better-search")
failed = 0


def ok(msg: str) -> None:
    print(f"OK  {msg}")


def fail(msg: str) -> None:
    global failed
    failed += 1
    print(f"FAIL {msg}")


def run(cmd: list[str], cwd: Path | None = None) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, cwd=str(cwd or BASE), capture_output=True, text=True, encoding="utf-8")


def check_js() -> None:
    js_dir = BASE / "Public" / "js"
    files = sorted(js_dir.glob("*.js"))
    for f in files:
        if f.name.endswith(".monolith.js"):
            continue
        r = run(["node", "--check", str(f)])
        if r.returncode != 0:
            fail(f"node --check {f.name}: {r.stderr.strip()}")
        else:
            ok(f"node --check {f.name}")
        lines = len(f.read_text(encoding="utf-8").splitlines())
        if lines > 500 and f.name not in ("suggest.js",):
            # soft warning for known large suggest; hard fail for form modules
            if f.name.startswith("form"):
                fail(f"{f.name} has {lines} lines (>500)")
            else:
                print(f"WARN {f.name} has {lines} lines")


def check_php() -> None:
    php_files = list((BASE / "Http").rglob("*.php")) + list((BASE / "Providers").rglob("*.php"))
    for f in php_files:
        r = run(["php", "-l", str(f)])
        if r.returncode != 0:
            fail(f"php -l {f.relative_to(BASE)}: {r.stdout or r.stderr}")
        else:
            ok(f"php -l {f.relative_to(BASE)}")


def check_json() -> None:
    for name in ("de.json", "fr.json"):
        p = BASE / "Resources" / "lang" / name
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
            if not isinstance(data, dict):
                fail(f"{name} not an object")
            else:
                ok(f"json {name} ({len(data)} keys)")
        except Exception as e:
            fail(f"json {name}: {e}")


def check_css_braces() -> None:
    for name in ("suggest.css", "form.css", "results.css", "extras.css", "module.full.css"):
        p = BASE / "Public" / "css" / name
        if not p.exists():
            fail(f"missing {name}")
            continue
        t = p.read_text(encoding="utf-8")
        if t.count("{") != t.count("}"):
            fail(f"{name} unbalanced braces {t.count('{')}/{t.count('}')}")
        else:
            ok(f"css braces {name}")
        # no mid-rule starts after header
        body = re.sub(r"^/\*[^*]*\*/\s*", "", t, count=1)
        first = body.lstrip()[:1]
        if first and first not in (".", "@", "/", "*"):
            # allow comments
            if not body.lstrip().startswith("/*") and not body.lstrip().startswith("@"):
                fail(f"{name} starts oddly: {body.lstrip()[:40]!r}")


def check_service_provider_assets() -> None:
    sp = (BASE / "Providers" / "SmartSearchServiceProvider.php").read_text(encoding="utf-8")
    js_order = [
        "core.js",
        "form-tiles.js",
        "form-advanced.js",
        "form-cf-values.js",
        "form-cf.js",
        "form-state.js",
        "form-presets.js",
        "form.js",
        "suggest-history.js",
        "suggest.js",
        "bulk.js",
    ]
    m = re.search(
        r"foreach \(\[(.*?)\] as \$file\)",
        sp.split("javascripts", 1)[-1],
        re.S,
    )
    if not m:
        fail("ServiceProvider javascripts foreach missing")
        return
    listed = re.findall(r"'([^']+\.js)'", m.group(1))
    if listed != js_order:
        fail(f"JS load order mismatch:\n  got {listed}\n  want {js_order}")
    else:
        ok("ServiceProvider JS order")

    for name in js_order:
        if not (BASE / "Public" / "js" / name).exists():
            fail(f"missing js {name}")


def check_date_preset_wiring() -> None:
    php = (BASE / "Http" / "Controllers" / "Concerns" / "ParsesBasicFilters.php").read_text(encoding="utf-8")
    for needle in ("resolveDatePreset", "date_preset", "last_7_days", "last_month"):
        if needle not in php:
            fail(f"ParsesBasicFilters missing {needle}")
        else:
            ok(f"PHP has {needle}")

    blade = (BASE / "Resources" / "views" / "partials" / "advanced-filters.blade.php").read_text(
        encoding="utf-8"
    )
    if 'name="date_preset"' not in blade:
        fail("advanced-filters missing date_preset select")
    else:
        ok("blade date_preset select")

    core = (BASE / "Public" / "js" / "core.js").read_text(encoding="utf-8")
    if "date_preset" not in core:
        fail("core.js missing date_preset")
    else:
        ok("core.js date_preset")

    adv = (BASE / "Public" / "js" / "form-advanced.js").read_text(encoding="utf-8")
    if "resolveDatePreset" not in adv or "applyPresetToInputs" not in adv:
        fail("form-advanced missing preset helpers")
    else:
        ok("form-advanced preset helpers")


def run_unit_tests() -> None:
    r = run(["php", str(BASE / "tools" / "test_date_presets.php")])
    print(r.stdout)
    if r.returncode != 0:
        fail("php date preset tests")
        print(r.stderr)
    else:
        ok("php date preset tests")

    r = run(["node", str(BASE / "tools" / "test_date_presets.js")])
    print(r.stdout)
    if r.returncode != 0:
        fail("js date preset tests")
        print(r.stderr)
    else:
        ok("js date preset tests")


def main() -> int:
    check_js()
    check_php()
    check_json()
    check_css_braces()
    check_service_provider_assets()
    check_date_preset_wiring()
    run_unit_tests()
    print(f"\n=== {'FAILED' if failed else 'ALL PASSED'} ({failed} failures) ===")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
