# TERRITORY: D
"""THE SHARED POPULATION FOR THE THREE-WAY WEEKLY GRADE — measured, committed.

PROJECTION-PROGRAM-2027.md sets the bar: our published weekly projection beats
BOTH Sleeper and FantasyPros, on THIS league's scoring, same players and weeks,
at 3 of 4 positions. The in-season prompt says the shared-population rule "is
not a detail" -- a comparison over "whoever each source happened to cover" is
not a comparison.

Nobody had the number. This measures it, and the answer is better than feared:
THE UNIVERSES ARE PERFECTLY NESTED. FantasyPros is a strict subset of both
Sleeper and of what own_weekly_v1 can price, so the shared population is
unambiguous -- it is exactly FantasyPros' set, with no partial overlap to
adjudicate.

WHAT own_weekly_v1 CAN PRICE is the board's QB/RB/WR/TE (its formula is
QB/RB/WR/TE only, so the board's K and DEF are priced by nobody -- see
`k_def` below, which is a coverage fact, not an oversight).

STATED LIMIT, and it carries a re-test trigger: proj_series.json holds SEASON
projections, used here as the pre-season proxy for the WEEKLY universes. A
provider's weekly universe can differ from its season universe. RE-TEST at week
1 from the real weekly snapshots -- this file is the method, and the number is
dated.

NO EGRESS. Everything is committed.

Emits: draft/backtest/projection_coverage_census.json
Run:   python3 draft/backtest/projection_coverage_census.py
"""
from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SERIES = ROOT / "draft" / "data" / "proj_series.json"
BOARD = ROOT / "public" / "draft_data.json"
OUT = Path(__file__).with_suffix(".json")

#: own_weekly_v1's formula prices these and only these (draft/weekly_own_projection.py).
PRICED_POSITIONS = ("QB", "RB", "WR", "TE")


def latest_by_source(series: list) -> dict:
    """The most recent entry per source. The series is date-ordered."""
    out = {}
    for entry in series:
        out[entry["source"]] = entry
    return out


def measure() -> dict:
    series = json.loads(SERIES.read_text())["series"]
    latest = latest_by_source(series)
    board = json.loads(BOARD.read_text())["players"]
    position = {str(p["player_id"]): p.get("position") for p in board}

    universes = {
        src: set(entry["proj"]) for src, entry in latest.items() if "proj" in entry
    }
    ours = {
        str(p["player_id"]) for p in board if p.get("position") in PRICED_POSITIONS
    }
    universes["own_weekly_v1"] = ours

    sleeper = universes.get("sleeper", set())
    fp = universes.get("fantasypros", set())
    shared = sleeper & fp & ours

    def by_pos(ids):
        return dict(Counter(position.get(p) for p in ids).most_common())

    return {
        "_territory": "TERRITORY: D — produced by draft/backtest/projection_coverage_census.py",
        "_question": "which players can a three-way weekly grade actually compare?",
        "_limit": "SEASON projections used as the pre-season proxy for the WEEKLY "
                  "universes. Re-test at week 1 from real weekly snapshots.",
        "measured_from": {src: latest[src].get("date") for src in latest},
        "universes": {src: len(ids) for src, ids in sorted(universes.items())},
        "shared_population": {
            "n": len(shared),
            "by_position": by_pos(shared),
            "share_of_sleeper": round(len(shared) / len(sleeper), 4) if sleeper else None,
            "share_of_fantasypros": round(len(shared) / len(fp), 4) if fp else None,
            "share_of_ours": round(len(shared) / len(ours), 4) if ours else None,
        },
        # The structure is what makes the shared population unambiguous.
        "nesting": {
            "fantasypros_subset_of_sleeper": fp <= sleeper,
            "fantasypros_subset_of_ours": fp <= ours,
            "ours_subset_of_sleeper": ours <= sleeper,
            "in_ours_not_fantasypros": {"n": len(ours - fp), "by_position": by_pos(ours - fp)},
            "in_fantasypros_not_ours": {"n": len(fp - ours), "by_position": by_pos(fp - ours)},
        },
        # A coverage fact with an owner, not an oversight: own_weekly_v1's
        # formula is QB/RB/WR/TE, and FantasyPros publishes no K/DEF at all, so
        # no three-way grade can ever include them.
        "k_def": {
            "on_board": sum(1 for p in board if p.get("position") in ("K", "DEF")),
            "sleeper_covers": len([p for p in sleeper if position.get(p) in ("K", "DEF")]),
            "fantasypros_covers": len([p for p in fp if position.get(p) in ("K", "DEF")]),
            "own_weekly_v1_prices": 0,
            "note": "FantasyPros publishes no K/DEF here, so a THREE-way grade "
                    "structurally cannot include them. This is not our gap to "
                    "close; a two-way grade against Sleeper could.",
        },
        "recommended_grading_populations": {
            "primary_three_way": {
                "n": len(shared),
                "why": "the only set all three sources price; nested, so no "
                       "partial-overlap adjudication is needed",
            },
            "secondary_two_way_vs_sleeper": {
                "n": len(ours),
                "why": "what the wider universe does, where FantasyPros cannot "
                       "follow. Reported beside the primary, never instead of it.",
            },
        },
    }


def main() -> dict:
    doc = measure()
    OUT.write_text(json.dumps(doc, indent=1) + "\n")
    return doc


if __name__ == "__main__":
    d = main()
    print("universes:", d["universes"])
    s = d["shared_population"]
    print(f"\nTHREE-WAY SHARED POPULATION: {s['n']}  {s['by_position']}")
    print(f"  = {s['share_of_sleeper']:.1%} of Sleeper, {s['share_of_fantasypros']:.1%} of FP, "
          f"{s['share_of_ours']:.1%} of ours")
    n = d["nesting"]
    print(f"\nnesting: FP ⊆ Sleeper {n['fantasypros_subset_of_sleeper']} · "
          f"FP ⊆ ours {n['fantasypros_subset_of_ours']} · ours ⊆ Sleeper {n['ours_subset_of_sleeper']}")
    print(f"  in ours not FP: {n['in_ours_not_fantasypros']['n']} {n['in_ours_not_fantasypros']['by_position']}")
    print(f"  in FP not ours: {n['in_fantasypros_not_ours']['n']}")
    k = d["k_def"]
    print(f"\nK/DEF: {k['on_board']} on board · Sleeper {k['sleeper_covers']} · "
          f"FP {k['fantasypros_covers']} · we price {k['own_weekly_v1_prices']}")
