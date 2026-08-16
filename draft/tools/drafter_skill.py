# TERRITORY: A
"""WHO ARE THE LEAGUE'S BEST DRAFTERS, AND WHAT DO THEY DO? — deliverable 3
of the league benchmark (draft/audit/league_benchmark_2026-08-16.md).

CORY'S ADDENDUM, VERBATIM (2026-08-16): "Do we need to find who the best
drafter were? Top 3 and study what they do better then make sure model can
do that or better"

── THE SKILL METRIC (independent of the tool) ─────────────────────────────────

VALUE OVER SLOT. For each season 2023-25, every NON-KEEPER skill-position
pick in the league's real 150-pick main draft is graded on the player's
ACTUAL season total (weeks 1-17, committed stores) minus the league-wide
mean actual total of all non-keeper skill picks taken in the same ROUND that
year. A pick's round is what it cost; the round mean is what that cost
bought the average drafter that season. Surplus is skill + luck — three
years are pooled so one lucky season carries less, and n is printed on
every number because ~36 live skill picks per owner over three years is
THIN evidence, said plainly.

Exclusions, named: keepers (keeper VALUE is measured separately as keeper
leverage — actual minus the round mean of the slot the keeper occupied);
K/DEF picks (no committed weekly skill stores; their timing is measured as
a behavior instead); the league's one position-less pick (2025 pid 12530,
the repo's known gap) is excluded and counted.

This metric never touches the tool's projections — the ranking cannot be
an artifact of the model being graded.

── THE BEHAVIOR PROFILE ───────────────────────────────────────────────────────

Per owner, pooled 2023-25, from real picks vs real outcomes: rookie draft
rate + hit rate (NFL draft class == season, from the committed nflverse
draft-picks store), year-2 targeting + hit rate (class == season−1),
late-round hit rate (picks 101+), positional timing (first QB / first TE
round, K/DEF earliest round), keeper leverage. A "hit" is surplus > 0 —
the pick beat its round's league-wide mean.

NOT COMPUTABLE, NAMED: ADP-deviation behaviors (reaches vs value falls).
No season-stamped 2023-25 ADP exists in the committed stores
(adp_series.json is 2026-only; the BBM archive holds one 2023 finals
subset). Measuring reach behavior against a market the repo does not carry
would be invention, so it is absent, not approximated.

Run: python3 draft/tools/drafter_skill.py
"""
from __future__ import annotations

import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent            # draft/tools
DRAFT = HERE.parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(DRAFT / "backtest"))
sys.path.insert(0, str(DRAFT))

from rookie_prior import load_store  # noqa: E402

SEASONS = (2023, 2024, 2025)
SKILL = ("QB", "RB", "WR", "TE")
LATE_FROM_PICK = 101
PICKS_PER_ROUND = 10


def round_of(pick_no: int) -> int:
    return (pick_no - 1) // PICKS_PER_ROUND + 1


def class_of_map(store: dict | None = None) -> dict:
    """{sleeper_id: NFL draft class season} from the committed store."""
    store = store or load_store()
    return {r["sleeper_id"]: r["season"] for r in store["picks"]
            if r["sleeper_id"]}


def season_slate(season: int, positions: dict):
    """(live skill picks with surplus fields, keeper rows, round_means,
    excluded counter) for one season's real main draft."""
    import draft_replay_2025 as R

    srec = R.season_record(season)
    picks, keeper_pids = R.season_draft(srec)
    totals = {pid: round(sum(rows.values()), 2)
              for pid, rows in R.weekly_points_of(season).items()}

    live, keep = [], []
    excluded_unknown = []
    for p in picks:
        pid = str(p["player_id"])
        pos = positions.get(pid)
        row = {"season": season, "pick_no": p["pick_no"],
               "round": round_of(p["pick_no"]), "roster_id": p["roster_id"],
               "player_id": pid, "pos": pos,
               "actual": float(totals.get(pid, 0.0))}
        if p.get("is_keeper") or pid in keeper_pids:
            keep.append(row)
        elif pos in SKILL:
            live.append(row)
        elif pos is None:
            excluded_unknown.append(pid)
    by_round: dict[int, list] = {}
    for r in live:
        by_round.setdefault(r["round"], []).append(r["actual"])
    round_means = {rd: round(sum(v) / len(v), 2)
                   for rd, v in sorted(by_round.items())}
    for r in live + keep:
        rm = round_means.get(r["round"])
        r["surplus"] = round(r["actual"] - rm, 2) if rm is not None else None
    kdef_rounds = {}
    for p in picks:
        pid = str(p["player_id"])
        if positions.get(pid) in ("K", "DEF"):
            kdef_rounds.setdefault(p["roster_id"], []).append(
                round_of(p["pick_no"]))
    return live, keep, round_means, excluded_unknown, kdef_rounds


def study(positions: dict, owners_by_season: dict,
          store: dict | None = None) -> dict:
    """The full three-year ranking + behavior profile. `owners_by_season`:
    {season: {roster_id(str): display_name}}."""
    store = store or load_store()
    cls = class_of_map(store)

    per_owner: dict[int, dict] = {}
    slates = {}
    for season in SEASONS:
        live, keep, round_means, excl, kdef = season_slate(season, positions)
        slates[season] = {"round_means": round_means,
                          "excluded_unknown_position": excl}
        for r in live + keep:
            o = per_owner.setdefault(r["roster_id"], {
                "live": [], "keepers": [], "kdef_rounds": {}})
            (o["keepers"] if r in keep else o["live"]).append(r)
        for rid, rounds in kdef.items():
            per_owner.setdefault(rid, {"live": [], "keepers": [],
                                       "kdef_rounds": {}})
            per_owner[rid]["kdef_rounds"][season] = sorted(rounds)

    rows = []
    for rid in sorted(per_owner):
        o = per_owner[rid]
        live = o["live"]
        n = len(live)
        surplus_total = round(sum(r["surplus"] for r in live), 2)
        per_year = {}
        for season in SEASONS:
            ys = [r for r in live if r["season"] == season]
            per_year[str(season)] = {
                "n": len(ys),
                "surplus": round(sum(r["surplus"] for r in ys), 2)}
        rookies = [r for r in live if cls.get(r["player_id"]) == r["season"]]
        year2 = [r for r in live
                 if cls.get(r["player_id"]) == r["season"] - 1]
        late = [r for r in live if r["pick_no"] >= LATE_FROM_PICK]
        keepers = o["keepers"]

        def hits(rs):
            return sum(1 for r in rs if r["surplus"] > 0)

        first_pos_rounds = {}
        for pos in ("QB", "TE"):
            firsts = []
            for season in SEASONS:
                got = [r["round"] for r in live + keepers
                       if r["season"] == season and r["pos"] == pos]
                if got:
                    firsts.append(min(got))
            first_pos_rounds[pos] = (round(sum(firsts) / len(firsts), 1)
                                     if firsts else None)
        kdef_first = [rs[0] for rs in o["kdef_rounds"].values() if rs]
        rows.append({
            "roster_id": rid,
            "owner": owners_by_season[max(SEASONS)].get(
                str(rid), {}).get("display_name", str(rid)),
            "n_live_skill_picks": n,
            "surplus_total_3yr": surplus_total,
            "surplus_per_pick": round(surplus_total / n, 2) if n else None,
            "per_year": per_year,
            "behaviors": {
                "rookie": {"n": len(rookies), "rate": round(len(rookies) / n, 3),
                           "hits": hits(rookies),
                           "surplus": round(sum(r["surplus"]
                                                for r in rookies), 2)},
                "year2": {"n": len(year2), "rate": round(len(year2) / n, 3),
                          "hits": hits(year2),
                          "surplus": round(sum(r["surplus"]
                                               for r in year2), 2)},
                "late_101plus": {"n": len(late), "hits": hits(late),
                                 "surplus": round(sum(r["surplus"]
                                                      for r in late), 2)},
                "first_QB_round_mean": first_pos_rounds["QB"],
                "first_TE_round_mean": first_pos_rounds["TE"],
                "kdef_earliest_round_mean": (
                    round(sum(kdef_first) / len(kdef_first), 1)
                    if kdef_first else None),
                "keeper_leverage": {
                    "n": len(keepers),
                    "surplus": round(sum(r["surplus"] for r in keepers
                                         if r["surplus"] is not None), 2)},
            },
        })

    ranked = sorted(rows, key=lambda r: -r["surplus_total_3yr"])
    for i, r in enumerate(ranked):
        r["rank"] = i + 1
    top3 = [r["roster_id"] for r in ranked[:3]]
    bottom_half = [r["roster_id"] for r in ranked[5:]]

    def group_mean(rids, path):
        vals = []
        for r in ranked:
            if r["roster_id"] in rids:
                v = r
                for k in path:
                    v = v[k]
                if v is not None:
                    vals.append(v)
        return round(sum(vals) / len(vals), 3) if vals else None

    contrast = {}
    for label, path in {
        "surplus_per_pick": ("surplus_per_pick",),
        "rookie_rate": ("behaviors", "rookie", "rate"),
        "rookie_surplus": ("behaviors", "rookie", "surplus"),
        "year2_rate": ("behaviors", "year2", "rate"),
        "year2_surplus": ("behaviors", "year2", "surplus"),
        "late_101plus_surplus": ("behaviors", "late_101plus", "surplus"),
        "first_QB_round_mean": ("behaviors", "first_QB_round_mean",),
        "first_TE_round_mean": ("behaviors", "first_TE_round_mean",),
        "kdef_earliest_round_mean": ("behaviors",
                                     "kdef_earliest_round_mean",),
        "keeper_leverage_surplus": ("behaviors", "keeper_leverage",
                                    "surplus"),
    }.items():
        contrast[label] = {"top3": group_mean(top3, path),
                           "bottom_half": group_mean(bottom_half, path)}

    return {
        "metric": ("value over slot: actual season points minus the "
                   "league-wide mean of non-keeper skill picks in the same "
                   "round that year; pooled 2023-25; keepers/K-DEF/the one "
                   "position-less pick excluded (keeper leverage measured "
                   "separately)"),
        "seasons": list(SEASONS),
        "round_means_by_season": {str(s): slates[s]["round_means"]
                                  for s in SEASONS},
        "excluded_unknown_position": {
            str(s): slates[s]["excluded_unknown_position"] for s in SEASONS},
        "ranking": ranked,
        "top3_roster_ids": top3,
        "bottom_half_roster_ids": bottom_half,
        "top3_vs_bottom_half": contrast,
        "small_n_warning": ("~12 live skill picks per owner per year, 36 "
                            "pooled — every behavioral difference above is "
                            "n<40 evidence and margins between adjacent "
                            "ranks are inside noise; the top-3/bottom-5 "
                            "GROUP contrast is the only read this table "
                            "supports"),
    }


def main() -> None:
    import json

    import draft_replay_2025 as R
    from model_accuracy_backtest import positions_record

    positions = positions_record()
    owners = {s: R.season_record(s)["owners"] for s in SEASONS}
    doc = study(positions, owners)
    for r in doc["ranking"]:
        print(f"#{r['rank']:2d} {r['owner']:12s} surplus "
              f"{r['surplus_total_3yr']:+9.2f} over {r['n_live_skill_picks']}"
              f" picks ({r['surplus_per_pick']:+.2f}/pick)")
    print(json.dumps(doc["top3_vs_bottom_half"], indent=1))


if __name__ == "__main__":
    main()
