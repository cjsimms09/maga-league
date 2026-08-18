# TERRITORY: A
"""EXP-ANALYZER-PRIOR — team projection-prior means for the analyzer backtest.

Implements draft/backtest/EXP-ANALYZER-PRIOR-PREREG.md (committed a0c70705,
BEFORE this file). This builder produces the projection stand-in — the ONLY
leak-free "projected points" derivable for 2023-25 (no provider archived real
preseason projections for those years; retroactive fetches leak, exp33):

    blend[pid] = 0.7 * total(Y-1) + 0.3 * total(Y-2)      (OUR scoring, wks 1-17)
    no Y-2 row -> Y-1 alone        (model_accuracy_backtest's declared rule)

summed over each team's OPENING ROSTER (its 15 draft picks; keepers occupy
picks) through a legal best-lineup under the season's roster_positions.
K/DEF slots score 0 (stores are offense-only); rookies have no prior row and
contribute 0 — a stated bias AGAINST the hypothesis.

Outputs draft/backtest/exp_analyzer_prior_means.json:
    team_prior[season][rid]          = P_r / 17   (weekly-scale, uncentered)
    team_prior_by_week[season][w][rid] = presence-masked variant for ARM C
        (players with a week-w row in season Y's own store — byes AND
        injuries, an ADMITTED LEAK, diagnostic ceiling only; see prereg)
    coverage[season]                 = drafted-pid join counts, honesty numbers

Season status per prereg: 2023 no_prior_store (no 2021/2022 store exists);
2024 prior = 2023 totals alone (the blend's own fallback, league-wide);
2025 full 0.7/0.3 blend.

Run: python3 draft/backtest/exp_analyzer_prior_means.py
Deterministic; committed data only.
"""
from __future__ import annotations

import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
DATA = HERE.parent / "data"

RECENCY_WEIGHTS = (0.7, 0.3)     # declared, not fitted (league_config.recency_weights)
LAST_SCORED_WEEK = 17            # the stores' totals basis
WEEKLY_DIVISOR = 17.0            # P_r -> weekly scale, prereg-fixed
SEASONS = (2023, 2024, 2025)
PRIORS = {2023: (), 2024: (2023,), 2025: (2024, 2023)}   # (Y-1, Y-2) available on disk
FLEX_ELIGIBLE = ("RB", "WR", "TE")
OUT = HERE / "exp_analyzer_prior_means.json"


def _store(season: int) -> dict:
    return json.loads((HERE / f"nflverse_weekly_points_{season}.json").read_text())


def season_totals(store: dict, last_week: int = LAST_SCORED_WEEK) -> dict:
    """{pid: realized points weeks 1..last_week} — model_accuracy_backtest's
    season_totals semantics (presence in a week's points dict is a row)."""
    totals: dict[str, float] = {}
    for w in store["weeks"]:
        if w["week"] > last_week:
            continue
        for pid, v in w["points"].items():
            totals[pid] = totals.get(pid, 0.0) + float(v)
    return totals


def blend_from_totals(last: dict, prior: dict | None) -> dict:
    """The declared champion-baseline rule, pure: 0.7·last + 0.3·prior; a pid
    with no prior row uses last alone; prior=None (no store) means the whole
    population falls back to last alone. Population = pids with a LAST row."""
    if prior is None:
        return dict(last)
    w_last, w_prior = RECENCY_WEIGHTS
    out = {}
    for pid, lt in last.items():
        pt = prior.get(pid)
        out[pid] = lt if pt is None else w_last * lt + w_prior * pt
    return out


def blend_values(season: int) -> dict:
    """{pid: blend forecast} for `season`, strictly from prior seasons' stores.
    Empty dict when no prior store exists (2023): the caller files
    no_prior_store rather than inventing a number."""
    priors = PRIORS[season]
    if not priors:
        return {}
    last = season_totals(_store(priors[0]))
    prior = season_totals(_store(priors[1])) if len(priors) == 2 else None
    return blend_from_totals(last, prior)


def best_lineup_sum(pids: list, values: dict, positions: dict, roster_positions: list) -> float:
    """Max sum of `values` over a legal starting lineup drawn from `pids`.

    Slot structure per roster_positions (BN ignored; K/DEF slots score 0 —
    no store rows exist for them). One FLEX taking RB/WR/TE: optimum is, for
    each choice of which position the flex extends, top-(n_p) per position;
    take the max over the three choices. Exact for a single flex slot.
    """
    need = {"QB": 0, "RB": 0, "WR": 0, "TE": 0}
    flex = 0
    for slot in roster_positions:
        if slot in need:
            need[slot] += 1
        elif slot == "FLEX":
            flex += 1
    by_pos: dict[str, list] = {"QB": [], "RB": [], "WR": [], "TE": []}
    for pid in pids:
        pos = positions.get(str(pid))
        if pos in by_pos:
            by_pos[pos].append(float(values.get(str(pid), 0.0)))
    for pos in by_pos:
        by_pos[pos].sort(reverse=True)

    def top(pos: str, n: int) -> float:
        return sum(by_pos[pos][:n])

    base = sum(top(p, need[p]) for p in need)
    if flex == 0:
        return base
    best = base   # flex may go unfilled if no eligible player remains
    for p in FLEX_ELIGIBLE:
        cand = sum(top(q, need[q] + (flex if q == p else 0)) for q in need)
        best = max(best, cand)
    return best


def build() -> dict:
    history = json.loads((DATA / "league_history.json").read_text())
    positions = json.loads((DATA / "player_positions.json").read_text())["positions"]
    seasons = {int(s["season"]): s for s in history["seasons"]}

    out = {
        "_territory": "TERRITORY: A — produced by draft/backtest/exp_analyzer_prior_means.py",
        "_prereg": "draft/backtest/EXP-ANALYZER-PRIOR-PREREG.md (commit a0c70705)",
        "recency_weights": list(RECENCY_WEIGHTS),
        "weekly_divisor": WEEKLY_DIVISOR,
        "team_prior": {},
        "team_prior_by_week": {},
        "status": {},
        "coverage": {},
    }
    for year in SEASONS:
        s = seasons[year]
        vals = blend_values(year)
        if not vals:
            out["status"][str(year)] = "no_prior_store"
            continue
        out["status"][str(year)] = ("full_blend" if len(PRIORS[year]) == 2
                                    else "last_season_alone_fallback")
        picks_by_rid: dict[int, list] = {}
        for p in s["drafts"][0]["picks"]:
            picks_by_rid.setdefault(int(p["roster_id"]), []).append(str(p["player_id"]))
        rp = s["roster_positions"]

        team_prior = {}
        joined = drafted = 0
        for rid, pids in sorted(picks_by_rid.items()):
            drafted += len(pids)
            joined += sum(1 for pid in pids if pid in vals)
            team_prior[str(rid)] = best_lineup_sum(pids, vals, positions, rp) / WEEKLY_DIVISOR
        out["team_prior"][str(year)] = team_prior
        out["coverage"][str(year)] = {"drafted": drafted, "with_prior_row": joined}

        # ARM C (ADMITTED LEAK, prereg): presence-masked per regular-season week
        pw_start = int(s["settings"].get("playoff_week_start", 16))
        store = _store(year)
        present_by_week = {int(w["week"]): set(w["points"].keys())
                           for w in store["weeks"] if int(w["week"]) < pw_start}
        by_week = {}
        for w, present in sorted(present_by_week.items()):
            wk = {}
            for rid, pids in sorted(picks_by_rid.items()):
                avail = [pid for pid in pids if pid in present]
                wk[str(rid)] = best_lineup_sum(avail, vals, positions, rp) / WEEKLY_DIVISOR
            by_week[str(w)] = wk
        out["team_prior_by_week"][str(year)] = by_week
    return out


if __name__ == "__main__":
    art = build()
    OUT.write_text(json.dumps(art, indent=1, sort_keys=False) + "\n")
    for y in SEASONS:
        st = art["status"][str(y)]
        tp = art["team_prior"].get(str(y), {})
        cov = art["coverage"].get(str(y))
        rng = (f"weekly prior range {min(tp.values()):.1f}..{max(tp.values()):.1f}"
               if tp else "no priors")
        print(f"{y}: {st}  {rng}  coverage={cov}")
    print(f"wrote {OUT}")
