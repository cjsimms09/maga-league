"""THE GRADUATION GATE — what the Lab measured vs what the tool loads.

WHY THIS EXISTS. The recurring defect in this codebase is not a wrong number, it
is a value maintained in TWO PLACES with nothing forcing agreement. It has
surfaced eight times now and three were found by accident: the ceiling weight sat
at 0.65 in the loaded core for weeks after the ledger measured it at -4.8; the
reset button loaded 'balanced' while the tool shipped 'measured'; WEIGHT_PRESETS
held a second literal copy of the weights; the adjuster panel showed 1.0 under a
preset that zeroes six of eight; the ADP warning classified sources by a rule
written for the previous anchor; replacementLevels re-derived a baseline from
whatever pool it was handed. Every one looked fine from inside its own file.

The gate closes the class for POLICY VALUES: it reads what the engine actually
loads, reads what the experiments actually measured, and reports every place they
disagree. A disagreement cannot persist silently because CI fails on it.

WHAT IT DELIBERATELY DOES NOT DO — Cory, 2026-08-10, and this is the whole design:
IT DOES NOT FLIP ANYTHING. It derives a PROPOSAL and shows the evidence. A human
reads it and decides. Until the gate and the closed forward loop have run for
several cycles, the model may measure and record but may not update its own
policy: this is instrumentation, not self-tuning. An automatic gate that quietly
rewrote weights would be the two-places disease with a faster clock.

HOW A DISAGREEMENT IS CLEARED. Either change the loaded value, or record the
decision to keep it in DECISIONS-NEEDED.md / EDGE-LEDGER.md with the reasoning.
The gate looks for the term's name in those files; a documented exception passes.
"Cory looked at it and chose otherwise" is a legitimate resolution — an
UNDOCUMENTED contradiction is not.

Run: python3 draft/backtest/graduation_gate.py [--json]
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
ENGINE = ROOT / "public" / "js" / "draft" / "engine.js"
PARTICIPATION = HERE / "exp_participation.json"
COMPONENTS = ROOT / "draft" / "data" / "component_grades.json"
DECISIONS = ROOT / "DECISIONS-NEEDED.md"
LEDGER = ROOT / "EDGE-LEDGER.md"

# A term is "material" when its measured effect clears the noise floor the money
# grade can actually resolve: one weekly-high hit is $100, so half an increment is
# the conservative cut (the same yardstick the war-room strategy panel uses).
MATERIAL_DOLLARS = 50.0


def loaded_weights() -> dict:
    """The weights the tool ACTUALLY LOADS, parsed from engine.js source.

    Read from source rather than from a duplicated table on purpose: a second
    copy of the numbers here would be the very disease this file polices.
    """
    src = ENGINE.read_text()
    m = re.search(r"const MEASURED_WEIGHTS = \{(.*?)\};", src, re.S)
    if not m:
        raise SystemExit("graduation_gate: MEASURED_WEIGHTS not found in engine.js")
    out = {}
    for key, val in re.findall(r"(\w+)\s*:\s*(-?[\d.]+)", m.group(1)):
        out[key] = float(val)
    return out


def measured_verdicts() -> dict:
    """Per-term measured dollar effects, both arms, from the participation test.

    TWO ARMS, KEPT SEPARATE ON PURPOSE. `ablation_from_full` turns a term OFF from
    the full set; `build_up_from_core` adds it TO the measured core. They answer
    different questions and they do not have to agree — when they disagree that is
    itself the finding, and collapsing them to one number would hide it.
    """
    if not PARTICIPATION.exists():
        return {}
    d = json.loads(PARTICIPATION.read_text())
    out: dict = {}
    for arm in ("ablation_from_full", "build_up_from_core"):
        for term, row in (d.get(arm) or {}).items():
            if not isinstance(row, dict):
                continue
            out.setdefault(term, {})[arm] = {
                "edge": row.get("edge"),
                "ci95": row.get("ci95"),
                "separable": bool(row.get("separable_from_zero")),
                "reading": row.get("reading"),
            }
    return out


def documented(term: str) -> bool:
    """Has a human recorded a decision about this term? A documented exception is
    a legitimate resolution; an undocumented contradiction is not."""
    for path in (DECISIONS, LEDGER):
        if path.exists() and re.search(r"\b" + re.escape(term) + r"\b", path.read_text(), re.I):
            return True
    return False


def classify(term: str, loaded: float, arms: dict) -> dict:
    """One term's verdict. Never returns an instruction — only a reading."""
    ab = arms.get("ablation_from_full") or {}
    bu = arms.get("build_up_from_core") or {}

    # AN INSTRUMENT THAT SAYS IT CANNOT MEASURE THE THING DOES NOT GET A VOTE.
    # The stack arm's own reading is "INSTRUMENT-LIMITED — grade_room has no
    # within-team weekly correlation — the stack mechanism is absent, so this arm
    # can't reward it." Reading that as "HURTS" would have had the gate propose
    # switching off the one adjuster measured to earn (+$196 @ dose 0.5 on the
    # sound instrument). A gate that emits false proposals gets ignored, which is
    # the LEAN-banner failure with higher stakes.
    def usable(a):
        return a.get("edge") is not None and "INSTRUMENT-LIMITED" not in str(a.get("reading") or "")
    limited = [a for a in (ab, bu) if a.get("edge") is not None and not usable(a)]
    ab_u, bu_u = (ab if usable(ab) else {}), (bu if usable(bu) else {})
    edges = [a.get("edge") for a in (ab_u, bu_u) if a.get("edge") is not None]
    sep = [a for a in (ab_u, bu_u) if a.get("separable")]

    if not edges:
        if limited:
            return {"status": "WRONG-INSTRUMENT",
                    "detail": "every arm covering this term declares itself unable to measure "
                              "it (%s) — needs the sound instrument before the gate can speak"
                              % (limited[0].get("reading") or "")[:90]}
        return {"status": "UNMEASURED", "detail": "no participation arm covers this term"}

    # The arms disagreeing in SIGN, with at least one of them separable from zero
    # and material, is the most valuable thing this gate can find: it means the
    # question is not settled, whatever the loaded value implies.
    signs = {1 if e > 0 else (-1 if e < 0 else 0) for e in edges}
    material = [e for e in edges if abs(e) >= MATERIAL_DOLLARS]
    if len(signs - {0}) > 1 and material:
        return {"status": "ARMS-DISAGREE",
                "detail": "ablation %s vs build-up %s — the two arms answer differently, "
                          "so the term is UNSETTLED regardless of what is loaded"
                          % (ab.get("reading"), bu.get("reading"))}

    # Settled and material: does the loaded value point the same way?
    if sep and material:
        best = max((a for a in (ab_u, bu_u) if a.get("edge") is not None),
                   key=lambda a: abs(a["edge"]))
        earns = best["edge"] > 0
        if earns and loaded == 0:
            return {"status": "PROPOSAL",
                    "detail": "measured EARNS (%s) but the tool loads 0 — propose turning it on"
                              % best.get("reading")}
        if (not earns) and loaded > 0:
            return {"status": "PROPOSAL",
                    "detail": "measured HURTS (%s) but the tool loads %.2f — propose turning it off"
                              % (best.get("reading"), loaded)}
        return {"status": "AGREES",
                "detail": "loaded %.2f matches %s" % (loaded, best.get("reading"))}

    # Measured, but not separable from zero / not material.
    return {"status": "IMMATERIAL",
            "detail": "no arm clears $%d with a CI excluding zero — loaded %.2f is a free choice"
                      % (MATERIAL_DOLLARS, loaded)}


# ── THE SECOND EVIDENCE SOURCE: COMPONENT GRADES ────────────────────────────
#
# WHY THIS IS A SEPARATE SECTION AND NOT MORE ROWS. Until now the gate's only
# evidence was the Lab's retrospective money Monte Carlo, in dollars. A season of
# live component grades had NOWHERE TO ARRIVE — everything the season measured
# would sit in a file until somebody happened to read it. This is that arrival.
#
# ⚠️ AND NO UNITS CONVERSION IS INVENTED HERE. Cory's condition, and it is the
# whole reason this section is structured the way it is: MATERIAL_DOLLARS is
# $50 and component grades are points-per-player-week and Brier. Where a
# component has no defensible dollar conversion, this map SAYS SO and that
# component proposes nothing in dollars.
#
# THE HONEST ANSWER TODAY IS THAT NONE OF THEM HAVE ONE — and the reason is
# sharper than "the units differ". A conversion from points to dollars needs a
# points→wins→payout chain, and the only machine in this project that has one is
# the Lab's retrospective money MC. **That is the instrument established to be
# THRESHOLD-BLIND on our data**: this seat missed the playoffs all three seasons,
# so two payout channels worth $2,500 never activated and a fifth-place roster
# graded identically to a tenth-place one. Routing component grades through it
# would inherit exactly that blindness, one layer deeper and harder to see.
#
# So components are judged against THEIR OWN declared materiality bars, in their
# own units, and their proposal is the BEHAVIOURAL IMPLICATION the spec declared
# before any number existed. That is a better instrument than a dollar figure
# would be, not a weaker one.
COMPONENT_DOLLARS = {
    name: {
        "dollars_per_unit": None,
        "why": "no defensible conversion: the only points→wins→payout machine "
               "available is the Lab's retrospective money MC, which is "
               "threshold-blind on our data (no playoff appearance in three "
               "seasons, so $2,500 of payout channels never activated). A "
               "conversion built on it would propose in dollars it cannot see.",
    }
    for name in ("survival", "projection", "opportunity_adj", "consensus",
                 "replacement", "weekly_claims")
}


def component_rows() -> tuple:
    """(rows, problems). Reads the component-grade artifact if it exists.

    Absent is NOT an error — before the writer's first run there is nothing to
    read. UNREADABLE is, and so is a failed self-check, because a gate that
    reports 'all quiet' off a broken artifact is a guard that does not guard.
    """
    if not COMPONENTS.exists():
        return [], [{"what": "component_grades.json absent",
                     "detail": "run `node src/component_write.js` — before its "
                               "first run there is nothing to read, which is not "
                               "yet a failure",
                     "blocking": False}]
    try:
        doc = json.loads(COMPONENTS.read_text())
    except (ValueError, OSError) as e:
        return [], [{"what": "component_grades.json unreadable",
                     "detail": f"{type(e).__name__}: {e}", "blocking": True}]

    problems = []
    sc = doc.get("self_check") or {}
    # THE PIPE-CONNECTED CHECK. An artifact of all-nulls from a working writer
    # and one from a broken writer look identical; this is the only thing that
    # tells them apart, so a failure here blocks rather than annotates.
    if not sc.get("ok"):
        problems.append({
            "what": "component grading path FAILED its own self-check",
            "detail": str(sc.get("detail") or "no detail")
                      + " — the null rows below are NOT evidence of a quiet season",
            "blocking": True})
    if doc.get("feed_error"):
        problems.append({"what": "component feed unreadable",
                         "detail": str(doc["feed_error"]), "blocking": True})

    rows = []
    for r in doc.get("rows") or []:
        rows.append(classify_component(r))
    return rows, problems


def classify_component(r: dict) -> dict:
    """One component's verdict, in ITS OWN UNITS. Never converts to dollars.

    The mapping onto the gate's existing vocabulary is deliberate and exact:

        hurting  -> PROPOSAL      the tool ships a thing measured to be harmful
        earning  -> AGREES        measured to earn, and shipped
        noise    -> IMMATERIAL    below its own declared bar; loaded is a free choice
        too_thin -> UNMEASURED    the design cannot resolve it at this n
        no_data  -> UNMEASURED    nothing has resolved yet
    """
    name = str(r.get("name") or "?")
    verdict = str(r.get("verdict") or "?")
    conv = COMPONENT_DOLLARS.get(name) or {}
    base = {
        "term": name,
        "kind": "component",
        "verdict": verdict,
        "n_obs": r.get("n_obs"),
        "n_clusters": r.get("n_clusters"),
        "units": (r.get("units") or {}),
        "dollars": conv.get("dollars_per_unit"),
        "no_dollar_conversion_because": conv.get("why"),
        "documented": documented(name),
    }
    if verdict == "hurting":
        base.update({"status": "PROPOSAL",
                     "detail": "graded HURTING against its declared baseline — the "
                               "spec's declared implication is the proposal: "
                               + str(r.get("implication") or "none recorded")})
    elif verdict == "earning":
        base.update({"status": "AGREES",
                     "detail": "graded EARNING against its declared baseline — "
                               + str(r.get("implication") or "")})
    elif verdict == "noise":
        base.update({"status": "IMMATERIAL",
                     "detail": "below its own declared materiality bar of "
                               f"{base['units'].get('material')} — "
                               + str(r.get("implication") or "")})
    elif verdict in ("too_thin", "no_data", "no_builder"):
        base.update({"status": "UNMEASURED",
                     "detail": str(r.get("awaiting") or r.get("why")
                                   or "no observations yet")})
    else:
        base.update({"status": "UNMEASURED",
                     "detail": f"unrecognised verdict {verdict!r}"})
    return base


# ── THE THIRD SOURCE: RULINGS ───────────────────────────────────────────────
#
# C's finding, 2026-08-12, and it is a real hole in this file rather than a
# nice-to-have. THE GATE COMPARES LOADED WEIGHTS AGAINST MEASUREMENTS AND HAS NO
# VIEW OF DECISIONS.
#
# `LAB-REGISTRY.md` recorded "D10 — STOOD DOWN (Cory, 2026-08-08): stack stays at
# 1.0". The engine ships `stack: 0.5`. The gate saw that value, classified it
# IMMATERIAL — "no arm clears $50 with a CI excluding zero, loaded 0.50 is a free
# choice" — and CORRECTLY did not block, because no MEASUREMENT contradicts it.
# A stale DECISION is invisible here by construction.
#
# That is this project's own discipline note one level up: a policy value
# justified by one number while another number in the same file disagreed, with
# nothing forcing anyone to look at both. The gate closed that for measurements.
# This closes it for rulings.
#
# ⚠️ IT REPORTS AND NEVER BLOCKS, and that is not timidity. A superseded ruling is
# a LEGITIMATE state — Cory overtook D10 the next day by adopting the measured
# config wholesale — so a blocking check would demand that history be rewritten
# to get CI green. What is not legitimate is a superseded ruling that reads as
# current. Marking it SUPERSEDED clears the row; changing the past does not.
RULING_DOCS = ("LAB-REGISTRY.md", "DECISIONS-NEEDED.md", "EDGE-LEDGER.md")

# "stack stays at 1.0", "the stack weight remains 1.0", "risk is set to 0".
_RULING_RE = re.compile(
    r"\b(value|tier|need|risk|ceiling|keeper|bye|stack)\b[^.\n]{0,40}?"
    r"\b(?:stays at|remains|is set to|set to|stays)\s+([0-9]*\.?[0-9]+)",
    re.I)


def ruling_rows(loaded: dict) -> list:
    """Rulings that name a weight and a value, checked against what ships."""
    rows = []
    for rel in RULING_DOCS:
        p = ROOT / rel
        if not p.exists():
            continue
        # SECTION-AWARE, because a ruling is a SECTION and not a line. My first
        # version skipped superseded LINES, so marking D10's heading left its
        # body still firing — the marker cleared the sentence nobody was reading
        # and not the one the scan actually matched. A heading marked SUPERSEDED
        # now resolves everything under it until the next heading of the same or
        # higher level.
        superseded_depth = None
        for line in p.read_text().split("\n"):
            h = re.match(r"^(#+)\s", line)
            if h:
                depth = len(h.group(1))
                if superseded_depth is not None and depth <= superseded_depth:
                    superseded_depth = None
                if re.search(r"supersede", line, re.I):
                    superseded_depth = depth
            if superseded_depth is not None:
                continue
            # A single line can also mark itself, for rulings that are one line.
            if re.search(r"supersede", line, re.I):
                continue
            # STRUCK THROUGH = RETAINED AS HISTORY, NOT CURRENT. This repo's
            # convention all the way through: a wrong claim is struck rather than
            # deleted, so the shape of the error stays visible. A scan that read
            # `~~stack stays at 0.5~~` as a live ruling would make it impossible
            # to correct a document without either deleting the record or
            # leaving the check permanently red -- and "delete the evidence to
            # get CI green" is the exact pressure this file exists to resist.
            if line.lstrip().startswith("~~") or "~~**" in line:
                continue
            for m in _RULING_RE.finditer(line):
                term, val = m.group(1).lower(), float(m.group(2))
                cur = loaded.get(term)
                if cur is None:
                    continue
                rows.append({
                    "term": term, "ruling_value": val, "loaded": cur,
                    "agrees": abs(cur - val) < 1e-9,
                    "where": rel,
                    "quote": line.strip()[:120],
                })
    return rows


def run() -> dict:
    loaded = loaded_weights()
    verdicts = measured_verdicts()
    rows = []
    for term in sorted(set(loaded) | set(verdicts)):
        r = classify(term, loaded.get(term, 0.0), verdicts.get(term, {}))
        r.update({"term": term, "loaded": loaded.get(term),
                  "documented": documented(term)})
        rows.append(r)
    # Only an UNDOCUMENTED disagreement blocks: a recorded human decision is a
    # legitimate resolution, which is exactly the human-review step this gate is
    # built around.
    blocking = [r for r in rows
                if r["status"] in ("PROPOSAL", "ARMS-DISAGREE") and not r["documented"]]

    rulings = ruling_rows(loaded)
    comp_rows, comp_problems = component_rows()
    # SAME RULE, SECOND SOURCE: an undocumented PROPOSAL blocks, a documented one
    # does not. Applied to component rows without collapsing them into the dollar
    # rows, because the two are in different units and averaging them would be
    # the units conversion this file refuses to invent.
    comp_blocking = [r["term"] for r in comp_rows
                     if r["status"] == "PROPOSAL" and not r["documented"]]
    comp_blocking += [p["what"] for p in comp_problems if p.get("blocking")]

    return {
        "gate": "graduation gate — loaded policy vs measured verdict",
        "policy_source": "public/js/draft/engine.js MEASURED_WEIGHTS",
        "evidence_source": "draft/backtest/exp_participation.json (both arms)",
        "component_source": "draft/data/component_grades.json (own units, never dollars)",
        "material_dollars": MATERIAL_DOLLARS,
        "rows": rows,
        "component_rows": comp_rows,
        "component_problems": comp_problems,
        "ruling_rows": rulings,
        "stale_rulings": [f"{r['where']}: {r['term']} ruled {r['ruling_value']}, "
                          f"ships {r['loaded']}" for r in rulings if not r["agrees"]],
        "rulings_note": (
            "REPORTED, NEVER BLOCKING. A superseded ruling is legitimate; a "
            "superseded ruling that READS AS CURRENT is not. Mark the heading "
            "SUPERSEDED to clear a row — do not change what was decided."),
        "component_units_note": (
            "NO DOLLAR CONVERSION IS APPLIED TO ANY COMPONENT. The only "
            "points->wins->payout machine available is the Lab's retrospective "
            "money MC, which is threshold-blind on this league's data. Components "
            "are judged against their own declared materiality bars and propose "
            "the behavioural implication their spec declared in advance."),
        "blocking": [r["term"] for r in blocking] + comp_blocking,
        "note": ("PROPOSES, NEVER FLIPS. Resolve a row by changing the loaded value OR by "
                 "recording the decision in DECISIONS-NEEDED.md / EDGE-LEDGER.md. This is "
                 "instrumentation, not self-tuning."),
    }


if __name__ == "__main__":
    out = run()
    if "--json" in sys.argv:
        print(json.dumps(out, indent=2))
    else:
        print("GRADUATION GATE — what the tool loads vs what the Lab measured\n")
        for r in out["rows"]:
            mark = {"AGREES": "  ok  ", "IMMATERIAL": " free ", "UNMEASURED": "  ??  ",
                    "PROPOSAL": "PROPOSE", "ARMS-DISAGREE": "UNSETTLED",
                    "WRONG-INSTRUMENT": " inst "}.get(r["status"], "  ?  ")
            doc = "" if r["documented"] else "   [UNDOCUMENTED]"
            print("  %-9s %-8s loaded %-5s %s%s"
                  % (mark, r["term"], r["loaded"], r["detail"], doc))
        stale = [r for r in out["ruling_rows"] if not r["agrees"]]
        print("\nRULINGS — recorded decisions vs what actually ships")
        if not out["ruling_rows"]:
            print("  (no ruling in the doctrine docs names a weight and a value)")
        for r in stale:
            print("  !! %-7s ruled %-5s ships %-5s  %s\n       %s"
                  % (r["term"], r["ruling_value"], r["loaded"], r["where"], r["quote"]))
        if out["ruling_rows"] and not stale:
            print("  ok    every ruling that names a weight agrees with the loaded value"
                  " (%d checked)" % len(out["ruling_rows"]))
        print("  " + out["rulings_note"])

        print("\nCOMPONENT GRADES — own units, never converted to dollars")
        if not out["component_rows"]:
            print("  (no component artifact yet)")
        for r in out["component_rows"]:
            mark = {"AGREES": "  ok  ", "IMMATERIAL": " free ",
                    "UNMEASURED": "  ??  ", "PROPOSAL": "PROPOSE"}.get(r["status"], "  ?  ")
            doc = "" if r["documented"] else "   [UNDOCUMENTED]"
            bar = r["units"].get("material")
            print("  %-9s %-16s %-9s bar %-6s %s%s"
                  % (mark, r["term"], r["verdict"], bar, str(r["detail"])[:88], doc))
        for p in out["component_problems"]:
            print("  %s %s — %s" % ("!!" if p.get("blocking") else "..",
                                    p["what"], p["detail"][:100]))
        print("\n  " + out["component_units_note"])

        print("\n" + out["note"])
        if out["blocking"]:
            print("\nBLOCKING (undocumented disagreement): " + ", ".join(out["blocking"]))
    sys.exit(1 if out["blocking"] else 0)
