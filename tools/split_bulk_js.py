from pathlib import Path

root = Path(__file__).resolve().parents[1]
js_path = root / "Public" / "js" / "module.js"
js = js_path.read_text(encoding="utf-8")
marker = "var form = document.getElementById('smartsearch-bulk-form');"
idx = js.find(marker)
if idx < 0:
    raise SystemExit("bulk marker not found")
start = js.rfind("(function () {", 0, idx)
if start < 0:
    raise SystemExit("bulk IIFE start not found")
main = js[:start].rstrip() + "\n"
bulk = js[start:].lstrip()
js_path.write_text(main, encoding="utf-8", newline="\n")
(root / "Public" / "js" / "bulk.js").write_text(bulk, encoding="utf-8", newline="\n")
print("module.js lines", main.count("\n") + 1)
print("bulk.js lines", bulk.count("\n") + 1)
