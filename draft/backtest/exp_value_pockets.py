#!/usr/bin/env python3
"""VALUE POCKETS — the dead zone generalised to every position (league-conditional).

exp25 found RB collapses after overall pick ~60. The mirror question, worth as much:
where is a position SYSTEMATICALLY UNDERPRICED — returning more than its draft slot
implies — so I can wait and pounce? Same local data, same overall-pick invariant.

FIRST PASS (cross-position band mean) FAILED its pre-registered sanity check —
recorded honestly here rather than smoothed: comparing a position to the band's
cross-position mean is CONFOUNDED by QB scale (QBs score ~300+ in raw fantasy
points regardless of draft slot, so any band with a QB has an inflated mean, making
RB/WR read overpriced everywhere and QB underpriced everywhere). It did NOT
reproduce exp25's RB dead zone, which the pre-registration required — so the
instrument was invalid, and it is replaced (not retuned) by the measure below.

METHOD (corrected, within-position — the frame exp25 used): value PERSISTENCE =
a position's mean realized in a band / that position's mean in its OWN premium
(earliest non-thin) band. A position is a late VALUE POCKET if it holds most of its
premium value deep in the draft (you buy early-round production at a late-round
cost); a DEAD ZONE if it collapses. Same-scale by construction, so QB no longer
confounds. Non-thin cells only.
  * persistence ≥ 0.80 in a LATE band (overall pick ≥ 51) -> UNDERPRICED pocket
  * persistence ≤ 0.60 in a LATE band                     -> OVERPRICED dead zone
Pre-registered sanity check (unchanged): RB must read OVERPRICED late (reproduce
exp25) or the instrument is still wrong. Thin cells (n<8) excluded. Corroborates/
locates; installs nothing without the money gate.
"""
from __future__ import annotations
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import exp25_deadzone as DZ   # noqa: E402  reuse load_picks + deadzone_surface

UNDER = 0.80   # holds >=80% of premium value in a late band -> value pocket
OVER = 0.60    # holds <=60% -> dead zone
LATE = 51      # overall pick from which "late" begins
POSITIONS = ("RB", "WR", "TE", "QB")


def value_surface(rows: list[dict]) -> list[dict]:
    """Per position, PERSISTENCE = mean in a band / mean in that position's own
    premium (earliest non-thin) band. Same-scale, so QB does not confound. Thin
    cells excluded."""
    # Each position's premium baseline = its earliest non-thin band mean.
    baseline = {}
    for pos in POSITIONS:
        for r in rows:
            c = r[pos]
            if c["mean"] is not None and not c["thin"]:
                baseline[pos] = c["mean"]
                break
    out = []
    for r in rows:
        row = {"band": r["band"], "lo": r["lo"], "hi": r["hi"], "pos": {}}
        any_cell = False
        for pos in POSITIONS:
            c = r[pos]
            if c["mean"] is None or c["thin"] or not baseline.get(pos):
                continue
            any_cell = True
            persistence = round(c["mean"] / baseline[pos], 2)
            late = r["lo"] >= LATE
            verdict = ("underpriced" if late and persistence >= UNDER
                       else "overpriced" if late and persistence <= OVER else "fair")
            row["pos"][pos] = {"mean": c["mean"], "n": c["n"], "persistence": persistence,
                               "baseline": baseline[pos], "verdict": verdict}
        if any_cell:
            out.append(row)
    return out


def pockets(surface: list[dict]) -> dict:
    """Collect the late underpriced pockets and overpriced dead zones, in overall picks."""
    under, over = [], []
    for r in surface:
        for pos, c in r["pos"].items():
            entry = {"position": pos, "band": r["band"], "overall_pick": r["lo"],
                     "persistence": c["persistence"], "mean": c["mean"],
                     "baseline": c["baseline"], "n": c["n"]}
            if c["verdict"] == "underpriced":
                under.append(entry)
            elif c["verdict"] == "overpriced":
                over.append(entry)
    under.sort(key=lambda e: -e["persistence"])
    over.sort(key=lambda e: e["persistence"])
    return {"underpriced_pockets": under, "overpriced_dead_zones": over}


def run() -> dict:
    picks, per_season = DZ.load_picks()
    rows = DZ.deadzone_surface(picks)
    surf = value_surface(rows)
    pk = pockets(surf)
    # Pre-registered check: does RB read overpriced past pick ~60 (the exp25 dead zone)?
    rb_late_over = [e for e in pk["overpriced_dead_zones"]
                    if e["position"] == "RB" and e["overall_pick"] >= 51]
    return {
        "experiment": "value pockets — under/over-priced regions by position (league-conditional)",
        "source": "LOCAL (exp25 spine): league_history + roster_sim realized + board positions",
        "n_picks": len(picks), "per_season": per_season,
        "thresholds": {"underpriced_ratio": UNDER, "overpriced_ratio": OVER, "thin_n": DZ.THIN},
        "surface": surf,
        "pockets": pk,
        "prereg_check_rb_dead_zone_reproduced": bool(rb_late_over),
        "caveat": ("~%d picks / 3 seasons — thin; cells n<%d excluded. Value ratio is realized "
                   "vs the band's cross-position average (a proxy for the slot's return), not vs "
                   "ADP dollars. Corroborates + locates; installs nothing without the money gate."
                   % (len(picks), DZ.THIN)),
        "source_tier": "league-primary",
    }


if __name__ == "__main__":   # pragma: no cover
    out = run()
    (HERE / "exp_value_pockets.json").write_text(json.dumps(out, indent=2))
    print(json.dumps({"n_picks": out["n_picks"],
                      "rb_dead_zone_reproduced": out["prereg_check_rb_dead_zone_reproduced"],
                      "underpriced": [(e["position"], e["band"], e["persistence"]) for e in out["pockets"]["underpriced_pockets"]],
                      "overpriced": [(e["position"], e["band"], e["persistence"]) for e in out["pockets"]["overpriced_dead_zones"]]},
                     indent=2))
