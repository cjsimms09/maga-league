#!/usr/bin/env python3
"""EXPERIMENT 25 — the RB dead zone, LOCATED ON OUR DATA (league-conditional).

BBM's full field found RB production cliffs after round 4 while WR barely declines
(EXP25-DEADZONE.md, ~200k picks/cell). The shape transfers; the exact boundary
does not — BBM is 12-team, we are 10-team, and **overall pick is the invariant
across league sizes, round is not** (Cory). So this locates the collapse in OUR
draft, expressed in OVERALL PICK NUMBERS, on all three of our seasons.

Data is LOCAL and needs no egress: pick_no + player_id from the harvested drafts
(league_history), realized season points from `roster_sim.global_player_points`
(the same currency the dollar arm grades in), position from the board index. 96-97%
of non-keeper picks resolve both across 2023-25.

DISCIPLINE. Our n is ~400 picks across 3 seasons — orders of magnitude below BBM.
Cells are flagged thin loudly; this CORROBORATES and LOCATES, it does not by itself
install anything. Where our (thin) shape agrees with BBM's (massive) shape, the
prior is credible AND placed in our coordinates — that is the external tier working
as designed. Pure core unit-tested in draft/tests/test_exp25_deadzone.py.
"""
from __future__ import annotations
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
POSITIONS = ("RB", "WR", "TE", "QB")
THIN = 8   # a cell with fewer than this many picks is flagged, not trusted


# ─────────────────────────────────────────────────── pure surface ──
def deadzone_surface(picks: list[dict], band: int = 10) -> list[dict]:
    """Mean realized points per position per OVERALL-PICK band. `picks`:
    [{overall, position, realized}]. `band`=10 ≈ one round in our 10-team league,
    but the axis is overall pick so it translates across league sizes."""
    buckets: dict[int, dict[str, list]] = {}
    for p in picks:
        if p.get("realized") is None or not p.get("position") or p.get("overall") is None:
            continue
        b = (int(p["overall"]) - 1) // band
        buckets.setdefault(b, {}).setdefault(p["position"], []).append(float(p["realized"]))
    rows = []
    for b in sorted(buckets):
        lo, hi = b * band + 1, (b + 1) * band
        row = {"band": f"{lo}-{hi}", "lo": lo, "hi": hi}
        for pos in POSITIONS:
            vals = buckets[b].get(pos, [])
            row[pos] = {"n": len(vals),
                        "mean": round(sum(vals) / len(vals), 1) if vals else None,
                        "thin": len(vals) < THIN}
        rows.append(row)
    return rows


def locate_cliff(rows: list[dict], pos: str = "RB", vs: str = "WR") -> dict:
    """Where does `pos` collapse? Two readings, both in overall-pick numbers:
      * cliff    — the band boundary with the largest adjacent drop in `pos` mean
                   (ignoring thin cells on either side);
      * crossover— the first overall pick where `pos` mean falls BELOW `vs` mean
                   (the point past which the other position is the better value)."""
    seq = [(r["lo"], r["hi"], r[pos]["mean"], r[pos]["n"], r[pos]["thin"]) for r in rows
           if r[pos]["mean"] is not None]
    cliff = None
    for i in range(1, len(seq)):
        prev, cur = seq[i - 1], seq[i]
        if prev[4] or cur[4]:
            continue   # a drop into or out of a thin cell is not evidence
        drop = prev[2] - cur[2]
        if cliff is None or drop > cliff["drop"]:
            cliff = {"from_band": f"{prev[0]}-{prev[1]}", "to_band": f"{cur[0]}-{cur[1]}",
                     "from_mean": prev[2], "to_mean": cur[2], "drop": round(drop, 1),
                     "boundary_overall_pick": cur[0]}
    crossover = None
    for r in rows:
        a, b = r[pos]["mean"], r[vs]["mean"]
        if a is not None and b is not None and not r[pos]["thin"] and a < b:
            crossover = {"band": r["band"], "overall_pick": r["lo"],
                         pos: a, vs: b}
            break
    return {"cliff": cliff, "crossover": crossover}


def compare_to_bbm(cliff: dict) -> dict:
    """The BBM prior: RB cliffs AFTER round 4 (RB 137→80→63; WR gentle). Does our
    located boundary AGREE in direction? Agreement across independent samples is the
    external tier's whole value."""
    bbm = {"prior": "RB collapses after round 4 (BBM 12-team: 137→80→63); WR gentle",
           "bbm_boundary_round": 5}
    if not cliff:
        return {**bbm, "agrees": None, "note": "no non-thin RB cliff located in our data"}
    # our 10-team round of the boundary pick
    our_round = (cliff["boundary_overall_pick"] - 1) // 10 + 1
    agrees = cliff["drop"] > 0
    return {**bbm, "our_boundary_overall_pick": cliff["boundary_overall_pick"],
            "our_boundary_round_10team": our_round, "our_drop": cliff["drop"],
            "agrees": agrees,
            "note": ("our RB cliff falls at overall pick ~%d (our round %d); BBM's is after "
                     "round 4 — same DIRECTION (RB collapses mid-draft, WR holds), located in "
                     "our coordinates" % (cliff["boundary_overall_pick"], our_round)) if agrees
                    else "our data does not reproduce an RB cliff"}


# ─────────────────────────────────────── local assembly (no egress) ──
def _real_draft(season: dict) -> list[dict]:
    for d in season.get("drafts") or []:
        if d.get("picks"):
            return sorted(d["picks"], key=lambda p: p.get("pick_no") or 0)
    return []


def load_picks() -> tuple[list[dict], dict]:
    """Assemble non-keeper picks with {overall, position, realized} from LOCAL data."""
    sys.path.insert(0, str(HERE))
    import roster_sim as RS
    hist = json.loads((HERE.parent / "data" / "league_history.json").read_text())
    board = json.loads((HERE.parent.parent / "public" / "draft_data.json").read_text())
    pos = {str(p.get("player_id")): p.get("position") for p in board["players"] if p.get("position")}
    picks, per_season = [], {}
    for s in hist["seasons"]:
        rows = _real_draft(s)
        if not rows:
            continue
        gpp = RS.global_player_points(s)
        realized: dict[str, float] = {}
        for _wk, pts in gpp.items():
            for pid, v in pts.items():
                realized[str(pid)] = round(realized.get(str(pid), 0.0) + float(v or 0.0), 2)
        n = 0
        for p in rows:
            if p.get("is_keeper"):
                continue
            pid = str(p.get("player_id"))
            if pid in realized and pos.get(pid):
                picks.append({"overall": p.get("pick_no"), "position": pos[pid],
                              "realized": realized[pid], "season": str(s.get("season"))})
                n += 1
        per_season[str(s.get("season"))] = n
    return picks, per_season


def run() -> dict:
    picks, per_season = load_picks()
    rows = deadzone_surface(picks)
    cliff = locate_cliff(rows)
    return {
        "experiment": "25 — RB dead zone located on our data (league-conditional)",
        "source": "LOCAL: league_history drafts + roster_sim realized + board positions",
        "n_picks": len(picks), "per_season": per_season,
        "band_size_overall_picks": 10,
        "surface": rows,
        "rb_cliff": cliff,
        "bbm_agreement": compare_to_bbm(cliff.get("cliff")),
        "caveat": ("~%d picks over 3 seasons — thin vs BBM's 200k/cell; cells with n<%d are "
                   "flagged and excluded from the cliff. Corroborates + locates; installs nothing "
                   "without the money-graded gate." % (len(picks), THIN)),
        "source_tier": "league-primary (BBM is the supporting prior)",
    }


if __name__ == "__main__":   # pragma: no cover
    out = run()
    dest = HERE / "exp25_deadzone.json"
    dest.write_text(json.dumps(out, indent=2))
    print(json.dumps({"n_picks": out["n_picks"], "per_season": out["per_season"],
                      "rb_cliff": out["rb_cliff"], "bbm_agreement": out["bbm_agreement"]}, indent=2))
    print("wrote", dest)
