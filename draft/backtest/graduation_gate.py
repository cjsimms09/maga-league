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
    return {
        "gate": "graduation gate — loaded policy vs measured verdict",
        "policy_source": "public/js/draft/engine.js MEASURED_WEIGHTS",
        "evidence_source": "draft/backtest/exp_participation.json (both arms)",
        "material_dollars": MATERIAL_DOLLARS,
        "rows": rows,
        "blocking": [r["term"] for r in blocking],
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
        print("\n" + out["note"])
        if out["blocking"]:
            print("\nBLOCKING (undocumented disagreement): " + ", ".join(out["blocking"]))
    sys.exit(1 if out["blocking"] else 0)
