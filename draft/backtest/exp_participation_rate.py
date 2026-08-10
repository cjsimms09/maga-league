#!/usr/bin/env python3
"""PARTICIPATION RATE — does a "decoration" term actually CHANGE PICKS, or just not move the argmax?

Cory's distinction (2026-08-09): a term reading flat in the money grade could be flat for two
OPPOSITE reasons: (a) it PARTICIPATES and the different picks aren't better — a real null about
the term; or (b) it BARELY participates — too weak vs the value anchor to change the argmax, so
we measured near-nothing and higher strengths are UNTESTED, not refuted. The money grade can't
tell these apart. This can: for each term, what FRACTION of Cory's picks flip when it's on?

METHOD (clean, no cascade contamination): walk the CORE trajectory (mask + value anchor). At
each of Cory's picks, on that exact board+roster, compute argmax(core) and argmax(core+term) over
the same startable-cap mask; record whether the top pick DIFFERS. Return the core pick so every
later decision is still evaluated on the core path — so this is the per-decision counterfactual
"does the term flip THIS pick", not a diverged trajectory. Also record the score gap between the
core top-2 (the room the term has to overcome) and, when it flips, the VORP cost of the flip.

READING: flat + high flip-rate = a REAL null (it moves many picks, they aren't better). flat +
low flip-rate = a SCALE finding (barely tested; the interior/higher strengths are unexplored).
Reuses exp_participation (score/_CORE/DEFAULTS/board_stats/enrich) + cory_conditional rooms.
Pure flip logic unit-tested in test_participation_rate.py.
"""
from __future__ import annotations
import json
import random
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import cory_conditional as CC          # noqa: E402
import exp_participation as P          # noqa: E402
import exp_keeper_b0 as B0             # noqa: E402

SEED = CC.SEED
# each term at a LOW/default strength and a HIGH strength — so we see if flip-rate rises with w
# (the scale question). value is the anchor (not a "decoration" term); include tier/risk as the
# known-harmful controls that MUST show high flip-rate if the measure works.
PROBES = [
    ("need", 0.5), ("need", 1.0), ("need", 3.0),
    ("ceiling", 0.65), ("ceiling", 1.0), ("ceiling", 3.0),
    ("bye", 1.0), ("bye", 3.0),
    ("stack", 0.5),
    ("tier", 1.0), ("risk", 1.0),        # controls: known to move money (should flip lots)
]


def flip_at(board, roster, term, w, st):
    """On this exact state: does adding `term` at weight w flip the argmax over the startable
    mask? Returns (flipped, core_gap, vorp_cost). core_gap = score margin of core's top-2
    (how much room the term must overcome); vorp_cost = VORP given up if it flips."""
    mask = B0.startable_cap_filter(board, roster)
    if len(mask) < 2:
        return False, 0.0, 0.0
    wc = dict(P._CORE)
    wt = dict(P._CORE); wt[term] = w
    core_scored = sorted(mask, key=lambda p: P.score(p, roster, wc, st), reverse=True)
    core_pick = core_scored[0]
    gap = P.score(core_scored[0], roster, wc, st) - P.score(core_scored[1], roster, wc, st)
    term_pick = max(mask, key=lambda p: P.score(p, roster, wt, st))
    flipped = term_pick["player_id"] != core_pick["player_id"]
    vcost = ((core_pick.get("vorp") or 0) - (term_pick.get("vorp") or 0)) if flipped else 0.0
    return flipped, gap, vcost


def run(n_rooms, seed=SEED):
    pool, my_keepers, opp_keepers, my_picks = CC.load_world()
    P.enrich(pool)
    st = P.board_stats(pool)
    acc = {k: {"decisions": 0, "flips": 0, "vcost_sum": 0.0} for k in PROBES}
    gaps = []

    def instrumented(board, i, roster):
        mask = B0.startable_cap_filter(board, roster)
        for key in PROBES:
            term, w = key
            flipped, gap, vcost = flip_at(board, roster, term, w, st)
            acc[key]["decisions"] += 1
            if flipped:
                acc[key]["flips"] += 1
                acc[key]["vcost_sum"] += vcost
        # follow the CORE path (value anchor only) so counterfactuals stay clean
        return [max(mask, key=lambda p: P.score(p, roster, dict(P._CORE), st))]

    for s in range(n_rooms):
        r = random.Random(seed + s)
        CC.draft_room(pool, my_keepers, opp_keepers, my_picks, instrumented, r)
    return acc


def main():
    n = int(sys.argv[sys.argv.index("--rooms") + 1]) if "--rooms" in sys.argv else 200
    acc = run(n)
    rows = []
    for (term, w), a in acc.items():
        d = a["decisions"] or 1
        rate = a["flips"] / d
        rows.append({"term": term, "weight": w, "flip_rate": round(rate, 3),
                     "flips": a["flips"], "decisions": a["decisions"],
                     "avg_vorp_cost_when_flips": round(a["vcost_sum"] / a["flips"], 1) if a["flips"] else 0.0})
    out = {"experiment": "participation rate — fraction of Cory's picks each term flips vs the core",
           "rooms": n, "note": "flat money + HIGH flip-rate = real null; flat money + LOW flip-rate "
                               "= scale finding (higher weights untested). Walks the core path; "
                               "per-decision counterfactual, no cascade.",
           "by_probe": rows,
           "reading": _reading(rows)}
    (HERE / "exp_participation_rate.json").write_text(json.dumps(out, indent=2))
    _report(out)
    print(f"n={n} rooms · flip-rate = fraction of Cory's picks the term changes vs core")
    for r in rows:
        print(f"  {r['term']:<8} w={r['weight']:<5} flips {r['flip_rate']*100:5.1f}%  "
              f"({r['flips']}/{r['decisions']})  vorp cost/flip {r['avg_vorp_cost_when_flips']:+.1f}")
    print("READING:", out["reading"])
    return 0


def _reading(rows):
    by = {}
    for r in rows:
        by.setdefault(r["term"], []).append(r)
    notes = []
    for term in ("need", "ceiling", "bye"):
        cells = by.get(term, [])
        if not cells:
            continue
        lo = min(cells, key=lambda c: c["weight"])
        hi = max(cells, key=lambda c: c["weight"])
        if lo["flip_rate"] >= 0.15:
            notes.append(f"{term}: participates at default ({lo['flip_rate']*100:.0f}% of picks) — "
                         f"its flat money is a REAL null, not a scale artifact")
        elif hi["flip_rate"] >= 0.15:
            notes.append(f"{term}: barely moves picks at default ({lo['flip_rate']*100:.0f}%) but "
                         f"does at w={hi['weight']} ({hi['flip_rate']*100:.0f}%) — default was a SCALE "
                         f"finding; higher strengths are UNtested, not refuted")
        else:
            notes.append(f"{term}: barely moves picks even at w={hi['weight']} "
                         f"({hi['flip_rate']*100:.0f}%) — the value anchor dominates; this term is "
                         f"near-inert at every strength tried, so its money-flatness says little")
    return " · ".join(notes)


def _report(out):
    L = ["# PARTICIPATION RATE — does each term actually change Cory's picks?", "",
         f"_{out['rooms']} rooms · {out['note']}_", "",
         "| term | weight | flip-rate | flips/decisions | VORP cost/flip |", "|---|---|---|---|---|"]
    for r in out["by_probe"]:
        L.append(f"| {r['term']} | {r['weight']} | {r['flip_rate']*100:.1f}% | "
                 f"{r['flips']}/{r['decisions']} | {r['avg_vorp_cost_when_flips']:+.1f} |")
    L += ["", f"**Reading:** {out['reading']}"]
    (HERE / "EXP-PARTICIPATION-RATE.md").write_text("\n".join(L))


if __name__ == "__main__":
    raise SystemExit(main())
