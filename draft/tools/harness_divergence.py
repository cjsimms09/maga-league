#!/usr/bin/env python3
"""ITEM 10 — WHERE THE LAB'S BOARD AND PRODUCTION'S BOARD DISAGREE.

B's question was "does the backtest harness supply per-player sd when production
does not?" — mechanical question, mechanical answer. This is the sweep behind it,
because one instance is an anecdote and the class needs a count.

THE FAILURE CLASS IS SILENT SEMANTIC DEGRADATION, and it runs in BOTH directions:

  HARNESS-ONLY   the Lab populates a field production leaves empty. Every Lab
                 measurement of a term reading that field is measuring a code
                 path production never reaches. The dollar figure is real; it is
                 a dollar figure for a system we do not ship.

  LAB-BLIND      production populates a field the Lab leaves empty. The inverse,
                 and the one that is easier to miss because the Lab still runs
                 green: every backtest number was measured on a board missing
                 that input, so the term it feeds was silently switched off for
                 the whole measurement.

  SYNTHETIC      both sides populate it, but the Lab MANUFACTURES it from another
                 field it already has. proj_sd = proj_mean * 0.25 is present at
                 100%, passes every null check, and carries exactly zero
                 information beyond proj_mean — it is rank-identical to it. A
                 population count cannot see this. It is a field that is there
                 and means nothing, which is worse than a field that is absent,
                 because absence at least trips a guard.

WHY THIS IS NOT A SOURCE SCAN (rule 11e). The production side is MEASURED off
public/draft_data.json. The VORP-added fields are OBSERVED by running
vorp.apply_vorp on a synthetic board. Only the harness's literal board dict is
read from source, and it is read by PARSING THE AST — the actual assignment
expressions, not the comments around them, which is the distinction rule 11e is
about.

RULE 10: the self-test at the bottom injects a known divergence and requires it
to fire before any result is reported.

Run: python3 draft/tools/harness_divergence.py
"""
from __future__ import annotations

import ast
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BACKTEST = ROOT / "draft" / "backtest"
sys.path.insert(0, str(BACKTEST))
sys.path.insert(0, str(ROOT / "draft"))

import field_population as FP  # noqa: E402

BOARD_JSON = ROOT / "public" / "draft_data.json"
BUNDLE_PY = BACKTEST / "build_bundle.py"
JS_DIR = ROOT / "public" / "js" / "draft"

#: Local names in build_bundle's board loop and the emitted key each one IS.
#: DECLARED HERE AND PRINTED, not hidden: this is the one hand-supplied input in
#: the whole tool, and a wrong entry would mis-classify a field as SYNTHETIC.
ALIASES = {"pm": "proj_mean", "a": "raw_adp"}


# --- what the shipped code actually reads off a player -----------------------

def fields_read_by_engine():
    """Member names read off a `player`/`p` parameter in the draft modules.

    Narrow on purpose: `player.X` only. A wider pattern (`p.X`, `row.X`) was tried
    in orphan_field_sweep.js and produced 29 hits of which 26 were other objects
    entirely. A sweep whose output is mostly noise does not get read.
    """
    out = {}
    for js in sorted(JS_DIR.glob("*.js")):
        src = js.read_text()
        # strip comments so a field named only in prose is not counted as read
        src = re.sub(r"/\*.*?\*/", " ", src, flags=re.S)
        src = re.sub(r"(?m)^\s*//.*$", " ", src)
        for m in re.finditer(r"\bplayer\.([a-z_][a-z0-9_]*)", src):
            out.setdefault(m.group(1), set()).add(js.name)
    return out


# --- the production board, MEASURED ------------------------------------------

def production_population():
    rows = json.loads(BOARD_JSON.read_text())["players"]
    pop = FP.population(rows)
    info = {}
    for name, rec in pop["fields"].items():
        vals = [r.get(name) for r in rows if name in r]
        nonzero = [v for v in vals if v not in (None, "", 0, 0.0)]
        info[name] = {
            "pct": rec["pct"],
            "present": rec["present"],
            "informative": len(nonzero),
            "distinct": len({repr(v) for v in nonzero}),
        }
    return rows, info


def ratio_distinct(rows, num, den):
    """How many distinct values of num/den the board carries.

    1 means num is a fixed multiple of den and adds nothing to it. This is the
    only test that separates a real per-player quantity from a manufactured one,
    and no population count can substitute for it.
    """
    rs = set()
    for r in rows:
        a, b = r.get(num), r.get(den)
        try:
            if b:
                rs.add(round(float(a) / float(b), 6))
        except (TypeError, ValueError):
            continue
    return len(rs)


# --- the harness board, PARSED FROM THE AST ----------------------------------

def harness_board_fields(src_text=None):
    """key -> (source text of the value expression, classification).

    Finds the dict literal appended into the board list in build_bundle.
    """
    src = src_text if src_text is not None else BUNDLE_PY.read_text()
    tree = ast.parse(src)
    best = None
    for node in ast.walk(tree):
        if (isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)
                and node.func.attr == "append" and node.args
                and isinstance(node.args[0], ast.Dict)):
            d = node.args[0]
            keys = [k.value for k in d.keys if isinstance(k, ast.Constant)]
            if "player_id" in keys and (best is None or len(keys) > len(best[0])):
                best = (keys, d)
    if best is None:
        raise SystemExit(
            "ANCHOR MISSING — no dict literal carrying player_id is appended in "
            + str(BUNDLE_PY) + ". The harness board is built some other way now; "
            "this sweep is measuring nothing and must be updated, not trusted.")

    keys, d = best
    out = {}
    for k, v in zip(d.keys, d.values):
        if not isinstance(k, ast.Constant):
            continue
        text = ast.unparse(v)
        names = {n.id for n in ast.walk(v) if isinstance(n, ast.Name)}
        names -= {"round", "float", "int", "str", "None"}
        if isinstance(v, ast.Constant):
            cls = "CONSTANT"
        elif names and names <= set(ALIASES) and any(
                isinstance(n, (ast.BinOp,)) for n in ast.walk(v)):
            cls = "DERIVED:" + ",".join(sorted(ALIASES[n] for n in names))
        elif isinstance(v, ast.Name) and v.id in ALIASES:
            cls = "ALIAS:" + ALIASES[v.id]
        else:
            cls = "SOURCED"
        out[k.value] = (text, cls)
    return out


def harness_vorp_fields():
    """Fields vorp.apply_vorp/assign_tiers ADD — OBSERVED by running them."""
    import vorp as VORP
    board = [{"player_id": str(i), "name": "P%d" % i,
              "position": ["QB", "RB", "WR", "TE", "K", "DEF"][i % 6],
              "team": "AAA", "proj_mean": 200.0 - i,
              "raw_adp": float(i + 1), "adjusted_adp": float(i + 1)}
             for i in range(120)]
    before = set(board[0])
    VORP.apply_vorp(board, {"teams": 10,
                            "starters": {"QB": 1, "RB": 2, "WR": 2, "TE": 1,
                                         "FLEX": 1, "K": 1, "DEF": 1}})
    VORP.assign_tiers(board)
    after = set().union(*[set(p) for p in board])
    return after - before


# --- the sweep ---------------------------------------------------------------

def lab_modules():
    """Shipped modules the Lab actually loads — OBSERVED by hooking require.

    Without this the sweep over-counts badly: a field read only by app.js cannot
    corrupt a backtest number, because no Lab entry point ever loads app.js. The
    first run reported 10 LAB-BLIND fields; 4 of them were read only by modules
    the Lab does not execute.

    Returns (set_of_modules, warning_or_None). A probe that could not fully load
    its entry points says so — it does not hand back a short list as if complete.
    """
    import subprocess
    r = subprocess.run([sys.executable and "node", str(Path(__file__).with_name("lab_modules.js"))],
                       capture_output=True, text=True)
    if r.returncode != 0:
        raise SystemExit("lab_modules.js failed (%d): %s" % (r.returncode, r.stderr.strip()))
    mods = {ln.strip() for ln in r.stdout.splitlines() if ln.strip()}
    warn = r.stderr.strip() or None
    return mods, warn


def classify(read_fields, prod, rows, harness_lit, harness_vorp, labmods):
    findings = []
    for field in sorted(read_fields):
        p = prod.get(field)
        prod_has = bool(p and p["informative"] > 0)
        lit = harness_lit.get(field)
        lab_has = lit is not None or field in harness_vorp

        if not prod_has and not lab_has:
            verdict, note = "DEAD BOTH SIDES", "no board writes it (orphan sweep's class)"
        elif lab_has and not prod_has:
            verdict, note = ("HARNESS-ONLY",
                             "the Lab exercises a path production cannot reach")
        elif prod_has and not lab_has:
            verdict, note = ("LAB-BLIND",
                             "every backtest number was measured with this input off")
        else:
            verdict, note = "both populated", ""
            if lit and lit[1].startswith("DERIVED"):
                src_field = lit[1].split(":", 1)[1]
                d = ratio_distinct(rows, field, src_field)
                if d > 1:
                    verdict = "SYNTHETIC"
                    note = ("Lab computes it as `%s` (one ratio to %s); production "
                            "carries %d distinct ratios" % (lit[0], src_field, d))
            elif lit and lit[1] == "CONSTANT" and lit[0] == "None":
                verdict = "SYNTHETIC"
                note = ("Lab writes None; production populates it at %s%%"
                        % p["pct"])
        readers = sorted(read_fields[field])
        findings.append({"field": field, "verdict": verdict, "note": note,
                         "prod_pct": p["pct"] if p else None,
                         "prod_informative": p["informative"] if p else 0,
                         "lab": lit[0] if lit else ("<vorp>" if field in harness_vorp else "-"),
                         "readers": readers,
                         "in_lab": bool(set(readers) & labmods)})
    return findings


BAD = ("HARNESS-ONLY", "LAB-BLIND", "SYNTHETIC")


def main():
    # ── RULE 10: fire on a known divergence before reporting a real one ──────
    fixture = ("players = []\n"
               "players.append({'player_id': pid, 'proj_mean': pm,\n"
               "                'proj_sd': round((pm or 0.0) * 0.25, 2)})\n")
    fx = harness_board_fields(fixture)
    if fx.get("proj_sd", ("", ""))[1] != "DERIVED:proj_mean":
        print("SELF-TEST FAILED — the AST classifier does not recognise a "
              "manufactured field.")
        print("  fixture `proj_sd: round((pm or 0.0) * 0.25, 2)` classified as %r"
              % (fx.get("proj_sd"),))
        print("\n  REPORTING NOTHING. A sweep that cannot fail has no null to offer.")
        return 2

    read_fields = fields_read_by_engine()
    rows, prod = production_population()
    harness_lit = harness_board_fields()
    harness_vorp = harness_vorp_fields()
    labmods, labwarn = lab_modules()

    print("HARNESS-vs-PRODUCTION DIVERGENCE — item 10\n")
    print("  self-test: the AST classifier caught a manufactured field. It can fail.")
    print("  production board: %d players (%s)" % (len(rows), BOARD_JSON.relative_to(ROOT)))
    print("  harness board:    %d literal field(s) + %d added by vorp.apply_vorp/assign_tiers (observed)"
          % (len(harness_lit), len(harness_vorp)))
    print("  local-name aliases declared by hand: %s" % ALIASES)
    print("  shipped modules the Lab EXECUTES (observed via require hook): %s"
          % ", ".join(sorted(labmods)))
    if labwarn:
        for ln in labwarn.splitlines():
            print("  ! %s" % ln.lstrip("/ "))
    print("  fields read off a `player` by the shipped modules: %d\n" % len(read_fields))

    findings = classify(read_fields, prod, rows, harness_lit, harness_vorp, labmods)
    width = max(len(f["field"]) for f in findings)
    for f in findings:
        flag = "***" if (f["verdict"] in BAD and f["in_lab"]) else \
               ("  ." if f["verdict"] in BAD else "   ")
        print("  %s %-*s  prod %-7s  lab %-30s  %s%s"
              % (flag, width, f["field"],
                 ("%s%%" % f["prod_pct"]) if f["prod_pct"] is not None else "absent",
                 f["lab"][:30], f["verdict"],
                 "" if f["in_lab"] or f["verdict"] not in BAD else " (reader not run by the Lab)"))
        if f["note"]:
            print("      %s" % f["note"])
            print("      read by: %s" % ", ".join(f["readers"]))

    inlab = [f for f in findings if f["verdict"] in BAD and f["in_lab"]]
    outlab = [f for f in findings if f["verdict"] in BAD and not f["in_lab"]]

    print("\n  COUNT: %d field(s) read by the shipped modules.\n" % len(findings))
    print("  A. CORRUPTS A BACKTEST NUMBER — divergent AND read by a module the Lab runs: %d"
          % len(inlab))
    for f in inlab:
        print("       %-18s %s" % (f["field"], f["verdict"]))
    print("\n  B. UNEXERCISED PRODUCTION SURFACE — divergent, but the Lab never loads")
    print("     the reader, so no backtest number is wrong. These have simply never")
    print("     been run outside a browser: %d" % len(outlab))
    for f in outlab:
        print("       %-18s %s  (%s)" % (f["field"], f["verdict"], ", ".join(f["readers"])))
    print("\n  clean %d   dead-both-sides %d (orphan sweep's class, already declared)"
          % (sum(1 for f in findings if f["verdict"] == "both populated"),
             sum(1 for f in findings if f["verdict"] == "DEAD BOTH SIDES")))
    print("  RESIDUAL UNRESOLVED: %d (A) + %d (B) = %d."
          % (len(inlab), len(outlab), len(inlab) + len(outlab)))
    return 1 if (inlab or outlab) else 0


if __name__ == "__main__":
    sys.exit(main())
