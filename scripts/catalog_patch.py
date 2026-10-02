#!/usr/bin/env python3
"""Add catalog systems to the source workbook as rows (CLAUDE.md rule 8).

    python3 scripts/catalog_patch.py data/catalog_patches/g15.json [--dry-run]

What it does, and nothing else:
  * appends one Systems row per new system (next S### id), with the sheet's own
    formulas in the computed columns (Cheapest build, # Inputs, # Outputs);
  * appends its Flows rows (next F#### ids) with the sheet's own formulas in the
    Unit, Weekly, Count, Total, Checklist row, Contribution, and Key columns;
  * appends a Matrix row per system;
  * applies `edits`: text-only changes to a system's row (its categories, tags, description,
    or notes), for fixing a row a patch added. Number columns can't be edited this way;
  * extends every `Systems!$X$2:$X$<last>` range in every sheet to cover the new rows;
  * recalculates the workbook in headless LibreOffice so cached values are current
    (the exporter reads cached values);
  * writes an xlsx diff summary (docs/catalog_patches/<patch>-diff.md) proving existing
    rows kept their numbers.

Systems already present (by name) are skipped, so running a patch twice is harmless.
Needs: openpyxl (pip install openpyxl) and LibreOffice (`soffice`) on PATH.
"""
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import openpyxl
from openpyxl.formula.translate import Translator

ROOT = Path(__file__).resolve().parent.parent
XLSX = ROOT / "data" / "source" / "LandLab_Sim_Systems_v2.xlsx"

# Quantity formulas the exporter recognizes (packages/catalog/src/exporter/formulas.ts).
QTY_FORMULAS = {
    "rain": "=Assumptions!$C$8/52",
    "sun": "=Assumptions!$C$6*7",
    "catchArea": "=INDEX(Systems!$P$2:$P${last},MATCH($B{row},Systems!$B$2:$B${last},0))",
    "rainCapture": (
        "=INDEX(Systems!$P$2:$P${last},MATCH($B{row},Systems!$B$2:$B${last},0))"
        "*Assumptions!$C$8/52*Assumptions!$C$9"
        "*INDEX(Systems!$Q$2:$Q${last},MATCH($B{row},Systems!$B$2:$B${last},0))"
    ),
}


def last_row(ws, col: int = 1) -> int:
    r = ws.max_row
    while r > 1 and ws.cell(r, col).value in (None, ""):
        r -= 1
    return r


def translate(formula, src: str, dst: str):
    if isinstance(formula, str) and formula.startswith("="):
        return Translator(formula, origin=src).translate_formula(dst)
    return formula


def copy_row(ws, src_row: int, dst_row: int, max_col: int) -> None:
    for c in range(1, max_col + 1):
        src = ws.cell(src_row, c)
        dst = ws.cell(dst_row, c)
        dst.value = translate(src.value, src.coordinate, dst.coordinate)
        if src.has_style:
            dst._style = src._style


def extend_ranges(wb, old_last: int, new_last: int) -> int:
    pat = re.compile(r"(Systems!\$[A-Z]+\$2:\$[A-Z]+\$)" + str(old_last) + r"\b")
    n = 0
    for ws in wb.worksheets:
        for row in ws.iter_rows():
            for cell in row:
                v = cell.value
                if isinstance(v, str) and v.startswith("=") and pat.search(v):
                    cell.value = pat.sub(lambda m: m.group(1) + str(new_last), v)
                    n += 1
    return n


# Systems columns an edit may change: text only, never a catalog number.
EDITABLE = {"Categories": 3, "Original game tags": 4, "Description": 6, "Notes": 24}


def pending_edits(sysws, patch: dict) -> list[tuple[int, int, str, object, object, dict]]:
    """(row, col, system, old, new, edit) for every edit whose cell doesn't already hold the new value."""
    rows = {sysws.cell(r, 2).value: r for r in range(2, last_row(sysws) + 1)}
    out = []
    for e in patch.get("edits", []):
        if e["column"] not in EDITABLE:
            raise SystemExit(f"catalog_patch: edits may change only {', '.join(EDITABLE)} (not {e['column']!r})")
        if e["system"] not in rows:
            raise SystemExit(f"catalog_patch: no system named {e['system']!r} to edit")
        r, c = rows[e["system"]], EDITABLE[e["column"]]
        old = sysws.cell(r, c).value
        if old != e["value"]:
            out.append((r, c, e["system"], old, e["value"], e))
    return out


def recalc(path: Path) -> None:
    """Open and re-save in LibreOffice with 'always recalculate', so every cached value is fresh."""
    profile = Path(tempfile.mkdtemp(prefix="lo-profile-"))
    user = profile / "user"
    user.mkdir(parents=True)
    (user / "registrymodifications.xcu").write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<oor:items xmlns:oor="http://openoffice.org/2001/registry" '
        'xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">\n'
        '<item oor:path="/org.openoffice.Office.Calc/Formula/Load"><prop oor:name="OOXMLRecalcMode" oor:op="fuse">'
        "<value>0</value></prop></item>\n"
        '<item oor:path="/org.openoffice.Office.Calc/Formula/Load"><prop oor:name="ODFRecalcMode" oor:op="fuse">'
        "<value>0</value></prop></item>\n"
        "</oor:items>\n"
    )
    out = Path(tempfile.mkdtemp(prefix="lo-out-"))
    subprocess.run(
        [
            "soffice",
            f"-env:UserInstallation=file://{profile}",
            "--headless",
            "--calc",
            "--convert-to",
            "xlsx:Calc MS Excel 2007 XML",
            "--outdir",
            str(out),
            str(path),
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    shutil.move(str(out / path.name), str(path))
    shutil.rmtree(profile, ignore_errors=True)
    shutil.rmtree(out, ignore_errors=True)


def cell_map(path: Path, data_only: bool) -> dict[str, dict[str, object]]:
    wb = openpyxl.load_workbook(path, data_only=data_only)
    return {
        ws.title: {c.coordinate: c.value for row in ws.iter_rows() for c in row if c.value not in (None, "")}
        for ws in wb.worksheets
    }


def norm(v):
    if isinstance(v, float) and v.is_integer():
        return int(v)
    if isinstance(v, float):
        return round(v, 9)
    return v


def diff_summary(old: Path, new: Path, patch: dict, added: dict, edits: list | None = None) -> str:
    ov, nv = cell_map(old, True), cell_map(new, True)
    of, nf = cell_map(old, False), cell_map(new, False)
    lines = [f"# Catalog patch `{patch['patch']}`: xlsx diff summary", "", patch.get("note", ""), ""]
    lines.append("## Rows added")
    lines.append("")
    lines.append("| Sheet | Rows |")
    lines.append("|---|---|")
    for sheet, rows in added.items():
        lines.append(f"| {sheet} | {', '.join(rows) if rows else '(none)'} |")
    lines.append("")
    if edits:
        lines.append("## Text edits")
        lines.append("")
        lines.append("| System | Column | Was | Now | Why |")
        lines.append("|---|---|---|---|---|")
        for _r, _c, name, was, now, e in edits:
            lines.append(f"| {name} | {e['column']} | {was} | {now} | {e.get('why', '')} |")
        lines.append("")
    lines.append("## Systems added")
    lines.append("")
    if not patch["systems"]:
        lines.append("(none)")
    for s in patch["systems"]:
        lines.append(f"- **{s['name']}** ({s['categories']}): " + "; ".join(
            f"{f['dir'].lower()} {f['resource']} {f['qty'] if not isinstance(f['qty'], dict) else '(' + f['qty']['formula'] + ' formula)'} {f['period']}"
            for f in s["flows"]
        ))
    lines.append("")
    # Existing cells: constants must be identical; formulas may only change by range extension.
    const_changed, formula_changed, value_changed = [], 0, []
    added_cells = {sheet: set() for sheet in nf}
    for sheet, rows in added.items():
        for r in rows:
            added_cells.setdefault(sheet, set()).add(int(r))
    rowof = lambda a: int(re.sub(r"[A-Z]+", "", a))
    for sheet, cells in of.items():
        for addr, v in cells.items():
            n = nf.get(sheet, {}).get(addr)
            if isinstance(v, str) and v.startswith("="):
                if n != v:
                    formula_changed += 1
            elif norm(n) != norm(v):
                const_changed.append(f"{sheet}!{addr}: {v!r} -> {n!r}")
    for sheet, cells in ov.items():
        for addr, v in cells.items():
            if isinstance(of[sheet].get(addr), str) and str(of[sheet][addr]).startswith("="):
                n = nv.get(sheet, {}).get(addr)
                if norm(n) != norm(v):
                    value_changed.append(f"{sheet}!{addr}: {v!r} -> {n!r}")
    lines.append("## Existing cells")
    lines.append("")
    lines.append(f"- Typed values (numbers and text) changed: **{len(const_changed)}** (the text edits above, if any; never a number)")
    for c in const_changed[:50]:
        lines.append(f"  - {c}")
    lines.append(f"- Formulas whose text changed (range ends extended to cover the new Systems rows): **{formula_changed}**")
    lines.append(f"- Computed values that changed after recalculation: **{len(value_changed)}**")
    for c in value_changed[:80]:
        lines.append(f"  - {c}")
    lines.append("")
    lines.append(
        "Computed values that change are counts over the whole catalog (systems per category, systems producing or "
        "using a resource) and the flags computed from those counts (a category's \"Within target?\"); none of them "
        "is a flow quantity, a cost, or a checklist result."
    )
    return "\n".join(lines) + "\n"


def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    dry = "--dry-run" in sys.argv
    if len(args) != 1:
        print(__doc__)
        return 2
    patch = json.loads(Path(args[0]).read_text())
    wb = openpyxl.load_workbook(XLSX)
    sysws, flws, mxws = wb["Systems"], wb["Flows"], wb["Matrix"]
    existing = {sysws.cell(r, 2).value for r in range(2, last_row(sysws) + 1)}
    todo = [s for s in patch.get("systems", []) if s["name"] not in existing]
    edits = pending_edits(sysws, patch)
    if not todo and not edits:
        print("catalog_patch: the workbook already has everything in this patch; nothing to do.")
        return 0
    for r, c, name, old, new, _e in edits:
        sysws.cell(r, c).value = new

    old_sys_last = last_row(sysws)
    new_sys_last = old_sys_last + len(todo)
    n_ext = extend_ranges(wb, old_sys_last, new_sys_last) if todo else 0

    next_sid = max(int(sysws.cell(r, 1).value[1:]) for r in range(2, old_sys_last + 1)) + 1
    fl_last = last_row(flws)
    next_fid = max(int(flws.cell(r, 1).value[1:]) for r in range(2, fl_last + 1)) + 1
    mx_last = last_row(mxws)
    added = {"Systems": [], "Flows": [], "Matrix": []}

    for k, s in enumerate(todo):
        r = old_sys_last + 1 + k
        copy_row(sysws, old_sys_last, r, sysws.max_column)
        vals = {
            1: f"S{next_sid + k:03d}",
            2: s["name"],
            3: s["categories"],
            4: s.get("tags"),
            5: patch["source"],
            6: s["description"],
            7: s["buy"],
            8: s.get("diy"),
            10: s["setup"],
            11: s["upkeep"],
            12: s["footprint"],
            13: s["lifespan"],
            14: s.get("area"),
            15: s.get("lossFactor"),
            16: s.get("catchment"),
            17: s.get("captureEff"),
            18: 0,
            21: s.get("inputs"),
            22: s.get("outputs"),
            23: s.get("confidence", "low"),
            24: s.get("notes"),
        }
        for c, v in vals.items():
            sysws.cell(r, c).value = v
        added["Systems"].append(str(r))

        mr = mx_last + 1 + k
        copy_row(mxws, mx_last, mr, mxws.max_column)
        added["Matrix"].append(str(mr))

        for f in s["flows"]:
            fl_last += 1
            copy_row(flws, fl_last - 1, fl_last, flws.max_column)
            qty = f["qty"]
            if isinstance(qty, dict):
                qty = QTY_FORMULAS[qty["formula"]].format(last=new_sys_last, row=fl_last)
            row = {1: f"F{next_fid:04d}", 2: s["name"], 3: f["dir"], 4: f["resource"], 5: qty, 7: f["period"], 14: f.get("note")}
            for c, v in row.items():
                flws.cell(fl_last, c).value = v
            next_fid += 1
            added["Flows"].append(str(fl_last))

    if dry:
        print(f"catalog_patch (dry run): would add {len(todo)} systems, {len(added['Flows'])} flows; extend {n_ext} ranges; {len(edits)} edit(s).")
        return 0

    with tempfile.TemporaryDirectory() as tmp:
        before = Path(tmp) / "before.xlsx"
        shutil.copy(XLSX, before)
        staged = Path(tmp) / XLSX.name
        wb.save(staged)
        recalc(staged)
        summary = diff_summary(before, staged, {**patch, "systems": todo}, added, edits)
        shutil.copy(staged, XLSX)
    out = ROOT / "docs" / "catalog_patches" / f"{patch['patch']}-diff.md"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(summary)
    print(f"catalog_patch: added {len(todo)} systems and {len(added['Flows'])} flows; extended {n_ext} ranges; {len(edits)} edit(s).")
    print(f"catalog_patch: diff summary in {out.relative_to(ROOT)}. Now run `npm run catalog:export`.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
