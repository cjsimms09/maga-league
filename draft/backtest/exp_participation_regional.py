#!/usr/bin/env python3
"""PARTICIPATION — REGIONAL DISAGGREGATION (the "disaggregate before you discard" check).

The pooled participation test said tier −$235 and risk −$143 (harmful) and recommended
dropping them. But a pooled figure hides structure: a term that DISTORTS a good ranking early
and CORRECTS a weak one late averages to "harmful" while being an edge in one band. Before we
act on "drop them", split each term's participation by the region its mechanism could vary on —
here, Cory's actual pick bands (he has no round 1-3 picks; keepers forfeit them):
    early = rounds 4-6   (picks 34/41/54 — clear tiers, big VORP gaps, the anchor is strong)
    mid   = rounds 7-10  (61..101)
    late  = rounds 11-15 (114..141 — flat board, onesies, the anchor is weak)

DESIGN: same certified paired MC (cory_conditional) and same core (mask + value anchor) as
exp_participation. For each term × band, an arm where that term participates ONLY on picks in
that band (weight→default there, 0 elsewhere), graded vs core. The paired delta is the term's
$ contribution IN THAT BAND. Every arm is the full 400 rooms, so each regional cell is as
powered as the pooled number (~±25), just narrower in scope — the sample supports the cut.

READING: if tier is uniformly ≤0 across bands, the pooled "drop it" stands. If it is +ve in a
band and −ve elsewhere, the pooled number buried a lead and the recommendation becomes
"apply it only in that band." Reuses exp_participation (score/enrich/board_stats) and
exp_need_phase (_round_of). stack is still instrument-limited (no correlation in grade_room)
and is omitted here; keeper stays scoped out.
"""
from __future__ import annotations
import json
import random
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import cory_conditional as CC          # noqa: E402
import exp_participation as P          # noqa: E402  (score, enrich, board_stats, _CORE, DEFAULTS)
import exp_need_phase as NP            # noqa: E402  (_round_of)
import exp_keeper_b0 as B0             # noqa: E402  (startable_cap_filter mask)

SEED = CC.SEED
TERMS = ("need", "tier", "risk", "ceiling", "bye")   # stack omitted (instrument-limited); keeper scoped out
BANDS = {"early_r4_6": (4, 6), "mid_r7_10": (7, 10), "late_r11_15": (11, 15)}


def _gated_chooser(term, lo, hi, st, my_picks):
    """core (mask + value) + `term` at its engine default, but ONLY on picks whose round is in
    [lo,hi]; elsewhere the term is off. Isolates the term's contribution in that band."""
    base = dict(P._CORE)
    on = dict(P._CORE); on[term] = P.DEFAULTS[term]

    def ch(board, i, roster):
        rnd = NP._round_of(i, my_picks)
        w = on if lo <= rnd <= hi else base
        masked = B0.startable_cap_filter(board, roster)
        return [max(masked, key=lambda p: P.score(p, roster, w, st))]
    return ch


def race(n_rooms, seed=SEED):
    pool, my_keepers, opp_keepers, my_picks = CC.load_world()
    P.enrich(pool)
    st = P.board_stats(pool)
    arms = {"core": lambda b, i, r: [max(B0.startable_cap_filter(b, r),
                                         key=lambda p: P.score(p, r, P._CORE, st))]}
    for term in TERMS:
        for band, (lo, hi) in BANDS.items():
            arms[f"{term}@{band}"] = _gated_chooser(term, lo, hi, st, my_picks)
    totals = {k: [] for k in arms}
    for s in range(n_rooms):
        opp_state = random.Random(seed + s).getstate()
        grade_state = random.Random(seed * 7 + s).getstate()
        for k, ch in arms.items():
            r = random.Random(); r.setstate(opp_state)
            rosters = CC.draft_room(pool, my_keepers, opp_keepers, my_picks, ch, r)
            g = random.Random(); g.setstate(grade_state)
            totals[k].append(CC.grade_room(rosters, g)["total"])
    return totals


def _paired(totals, arm, base="core", seed=SEED):
    d = [a - b for a, b in zip(totals[arm], totals[base])]
    lo, hi = CC.bootstrap_ci(d, random.Random(seed + 3))
    m = sum(d) / len(d)
    return {"edge": round(m, 2), "ci95": [round(lo, 2), round(hi, 2)],
            "separable": bool(lo > 0 or hi < 0)}


def _verdict(cells):
    """Did the pooled negative hide a positive band?"""
    pos = [b for b, v in cells.items() if v["separable"] and v["edge"] > 0]
    neg = [b for b, v in cells.items() if v["separable"] and v["edge"] < 0]
    if pos and neg:
        return f"STRUCTURE: earns in {', '.join(pos)}, hurts in {', '.join(neg)} — pooled buried a lead"
    if pos:
        return f"earns only in {', '.join(pos)} (flat/neutral elsewhere)"
    if neg and len(neg) == len(cells):
        return "uniformly hurts across all bands — pooled 'drop it' stands"
    if neg:
        return f"hurts in {', '.join(neg)}, neutral elsewhere — drop in those bands"
    return "flat/neutral across all bands — no regional structure"


def main():
    n = int(sys.argv[sys.argv.index("--rooms") + 1]) if "--rooms" in sys.argv else 400
    totals = race(n)
    core_mean = sum(totals["core"]) / n
    by_term = {}
    for term in TERMS:
        cells = {band: _paired(totals, f"{term}@{band}") for band in BANDS}
        by_term[term] = {"by_band": cells, "verdict": _verdict(cells)}
    out = {
        "experiment": "participation regional disaggregation — did pooled negatives hide structure?",
        "rooms": n, "core_mean_dollars": round(core_mean, 1),
        "bands": {b: f"rounds {lo}-{hi}" for b, (lo, hi) in BANDS.items()},
        "power_note": f"n={n}; each cell is the full room set gated to a band, ~±25 CI, as powered "
                      "as the pooled figure.",
        "by_term": by_term,
        "headline": "; ".join(f"{t}: {v['verdict']}" for t, v in by_term.items()),
    }
    (HERE / "exp_participation_regional.json").write_text(json.dumps(out, indent=2))
    _report(out)
    print(f"core ${core_mean:.0f} · n={n}")
    for t, v in by_term.items():
        print(f"\n{t}:")
        for band, c in v["by_band"].items():
            print(f"  {band:<12} {c['edge']:+7.1f}  CI[{c['ci95'][0]:>7},{c['ci95'][1]:>7}]"
                  f"  {'SEPARABLE' if c['separable'] else '~0'}")
        print("  ->", v["verdict"])
    return 0


def _report(out):
    L = ["# PARTICIPATION — REGIONAL DISAGGREGATION (disaggregate before you discard)", "",
         f"_{out['rooms']} paired rooms · core = mask + value anchor (${out['core_mean_dollars']:.0f}) · "
         f"bands = {out['bands']} · {out['power_note']}_", "",
         "Each term participates ONLY on picks in a band (default weight there, 0 elsewhere), vs core.", "",
         "| term | early r4-6 | mid r7-10 | late r11-15 | reading |", "|---|---|---|---|---|"]
    for t, v in out["by_term"].items():
        c = v["by_band"]
        def cell(b):
            x = c[b]
            return f"{x['edge']:+.0f} [{x['ci95'][0]},{x['ci95'][1]}]" + ("*" if x["separable"] else "")
        L.append(f"| {t} | {cell('early_r4_6')} | {cell('mid_r7_10')} | {cell('late_r11_15')} | {v['verdict']} |")
    L += ["", "_* = CI excludes 0. Compare with the pooled figures in EXP-PARTICIPATION.md._"]
    (HERE / "EXP-PARTICIPATION-REGIONAL.md").write_text("\n".join(L))


if __name__ == "__main__":
    raise SystemExit(main())
