"""OVERRIDE GRADING — the human-plus-model system gets graded, not only the model.

BINDING RULE 2 (SESSION-A.md) is what this implements. Overrides are already
CAPTURED — one tap, in the flow, 12-second auto-skip, reconciled-from-sync flagged
separately — but capture is not grading. Logged-and-never-resolved is exactly the
condition the rule forbids: if Cory overrides 30-40% of the time and nothing ever
asks whether those overrides EARNED, then the real operating policy is "the model
plus Cory's taste", the measured core is advisory, and a parallel policy
accumulates in click history that nobody ever promoted or measured.

WHY IT EXISTS BEFORE THE DRAFT RATHER THAN AFTER. Draft-night overrides cannot be
reconstructed later — the board state, the recommendation and the alternative all
vanish once the pick is made. Same irreversible-window logic as the forward
resolver and the snapshot freeze: the grader has to be standing before the data
starts arriving, or the first season of the most valuable evidence this system can
generate is lost.

THE COUNTERFACTUAL IS CLEAN, which is what makes this gradeable at all. At the
moment of my pick BOTH players were on the board — the model recommended one, I
took the other. So "what if I had followed the model" is not a simulation; it is a
player I demonstrably could have had. Delta is realized points from that pick
forward, picked minus passed-over.

TWO DIRECTIONS, BOTH REPORTED — and the second is the one Cory asked for by name:
  * persistent + material + POSITIVE -> a formal PROPOSAL through the graduation
    gate. His judgement is beating the core somewhere specific and that belongs in
    the model rather than in his habits.
  * persistent + material + NEGATIVE -> NAMED AS A LEAK. "I would rather be told I
    am costing myself money than have my habits quietly become the model."
A one-off override is DATA. Only a repeated pattern carrying measured value is a
proposal — otherwise every disagreement becomes a proposal and the gate gets
ignored, which is the LEAN-banner failure again.

MULTIPLICITY. Grouping by reason tests as many hypotheses as there are reasons, so
the report states how many groups were examined and the null searches the same
space. A "winning" reason among eight is not the same finding as a winning reason
tested alone.

RULE 3 COMPLIANCE. The objective here is REALIZED POINTS, which is the input to
the money grade, not the continuous proxy. Points are reported as points and never
described as dollars — the points->dollars link is the same unclosed one the stack
weight waits on.

Run: python3 draft/backtest/override_grade.py [--season YYYY]
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent

# A pattern must recur before it can propose anything. Below this it is one
# person having one opinion once, which is data and nothing more.
MIN_PATTERN_N = 4
# And it must clear the noise the instrument can resolve. A half-point-per-pick
# edge over four picks is not a finding.
MATERIAL_POINTS = 10.0


def load_overrides(entries: list) -> list:
    """Override rows from the prediction ledger, EXCLUDING reconciled-from-sync.

    A reconciled override is a pick the sync noticed after the fact, not a
    deliberate tap — the client already flags it, and grading the two together
    would attribute to Cory's judgement a decision he never consciously made."""
    out = []
    for e in entries or []:
        if (e.get("kind") or "") != "override":
            continue
        p = e.get("payload") or {}
        if p.get("reconciled_from_sync"):
            continue
        if not p.get("player_id") or not p.get("over_player_id"):
            continue          # nothing to compare against
        out.append({
            "season": e.get("season"),
            "pick": e.get("pick"),
            "picked": str(p["player_id"]),
            "picked_name": p.get("name"),
            "passed": str(p["over_player_id"]),
            "passed_name": p.get("over_name"),
            "reason": p.get("reason") or "no_reason_given",
        })
    return out


def resolve(rows: list, realized: dict) -> list:
    """Attach the outcome. `realized` maps player_id -> realized season points.

    A row whose players cannot both be resolved is DROPPED and counted, never
    defaulted to zero — a missing outcome is not a tie, and silently scoring it as
    one would drag every pattern toward 'no effect'."""
    out = []
    for r in rows:
        a, b = realized.get(r["picked"]), realized.get(r["passed"])
        if a is None or b is None:
            continue
        out.append(dict(r, picked_points=float(a), passed_points=float(b),
                        delta=float(a) - float(b)))
    return out


def _summary(deltas: list) -> dict:
    n = len(deltas)
    if n < 2:
        return {"n": n, "mean": None, "ci95": None, "separable": False}
    m = sum(deltas) / n
    v = sum((x - m) ** 2 for x in deltas) / (n - 1)
    se = math.sqrt(v / n)
    lo, hi = m - 1.96 * se, m + 1.96 * se
    return {"n": n, "mean": round(m, 2), "ci95": [round(lo, 2), round(hi, 2)],
            "separable": (lo > 0 or hi < 0)}


def classify(group: dict) -> dict:
    """PROPOSAL / LEAK / DATA — never an instruction, same as the gate."""
    n, mean, sep = group["n"], group["mean"], group["separable"]
    if n < MIN_PATTERN_N:
        return {"status": "DATA",
                "detail": "only %d override%s — a pattern needs %d before it can propose"
                          % (n, "" if n == 1 else "s", MIN_PATTERN_N)}
    if mean is None or not sep:
        return {"status": "DATA",
                "detail": "recurs (n=%d) but the CI spans zero — no measured value either way" % n}
    if abs(mean * n) < MATERIAL_POINTS:
        return {"status": "DATA",
                "detail": "separable but immaterial (%.1f total pts across %d)" % (mean * n, n)}
    if mean > 0:
        return {"status": "PROPOSAL",
                "detail": ("this override pattern BEATS the core by %.1f pts/pick across %d "
                           "(CI excludes zero) — propose it through the graduation gate rather "
                           "than leaving it in click history" % (mean, n))}
    return {"status": "LEAK",
            "detail": ("this override pattern COSTS %.1f pts/pick across %d (CI excludes zero) "
                       "— named, per Cory's standing instruction to be told rather than have "
                       "the habit quietly become the model" % (abs(mean), n))}


def run(entries: list, realized: dict, season=None) -> dict:
    rows = load_overrides(entries)
    resolved = resolve(rows, realized)
    unresolved = len(rows) - len(resolved)

    by_reason: dict = {}
    for r in resolved:
        by_reason.setdefault(r["reason"], []).append(r["delta"])

    groups = []
    for reason, deltas in sorted(by_reason.items()):
        g = _summary(deltas)
        g["reason"] = reason
        g.update(classify(g))
        groups.append(g)

    overall = _summary([r["delta"] for r in resolved])
    overall.update({"label": "ALL overrides, picked minus passed-over"})

    proposals = [g for g in groups if g["status"] == "PROPOSAL"]
    leaks = [g for g in groups if g["status"] == "LEAK"]

    return {
        "experiment": "override grading — the human-plus-model system, not the model alone",
        "rule": "SESSION-A binding rule 2",
        "season": season,
        "overrides_logged": len(rows),
        "overrides_resolved": len(resolved),
        "unresolved_dropped": unresolved,
        "overall": overall,
        # MULTIPLICITY: grouping by reason tests this many hypotheses at once.
        "reason_groups_tested": len(groups),
        "multiplicity_note": ("%d reason-groups were examined; a winner among %d is not the "
                              "same finding as a winner tested alone, and the null must search "
                              "the same space." % (len(groups), len(groups))),
        "groups": groups,
        "proposals": proposals,
        "leaks": leaks,
        "units": ("realized fantasy points from the pick forward. POINTS, NOT DOLLARS — the "
                  "points->dollars link is the same unclosed one the stack weight waits on "
                  "(binding rule 3: the proxy and its relatives never become the objective)."),
        "installs": "NOTHING. Proposals go to the graduation gate for human review.",
    }


def _load_ledger(path: Path) -> list:
    if not path.exists():
        return []
    txt = path.read_text().strip()
    if not txt:
        return []
    if txt[0] == "[":
        return json.loads(txt)
    return [json.loads(ln) for ln in txt.splitlines() if ln.strip()]


if __name__ == "__main__":
    season = None
    for i, a in enumerate(sys.argv):
        if a == "--season" and i + 1 < len(sys.argv):
            season = sys.argv[i + 1]
    # The ledger lives in the server store; a local export is used when present.
    entries = _load_ledger(ROOT / "draft" / "data" / "pred_ledger.jsonl")
    realized: dict = {}
    rp = ROOT / "draft" / "data" / "realized_points.json"
    if rp.exists():
        realized = {str(k): v for k, v in json.loads(rp.read_text()).items()}
    out = run(entries, realized, season)
    (HERE / "override_grade.json").write_text(json.dumps(out, indent=2))
    # RULE 8 — lead with what is failing. Leaks print before proposals, always.
    print("OVERRIDE GRADING — %d logged, %d resolved (%d dropped unresolved)"
          % (out["overrides_logged"], out["overrides_resolved"], out["unresolved_dropped"]))
    if out["leaks"]:
        print("\nLEAKS (costing money — read these first):")
        for g in out["leaks"]:
            print("  %-18s %s" % (g["reason"], g["detail"]))
    if out["proposals"]:
        print("\nPROPOSALS (beating the core — for the gate, not for installing):")
        for g in out["proposals"]:
            print("  %-18s %s" % (g["reason"], g["detail"]))
    if not out["leaks"] and not out["proposals"]:
        print("\nNo pattern clears the persistent-and-material bar yet"
              " (need n>=%d and %.0f+ total pts, CI excluding zero)."
              % (MIN_PATTERN_N, MATERIAL_POINTS))
    print("\n" + out["multiplicity_note"])
