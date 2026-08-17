# TERRITORY: A
"""VARIANCE PORTFOLIO — the measuring arm: per-player weekly cv from the
committed component stores. (2026-08-16)

Cory, verbatim: "Is it in the actual roster construction? Is it in the 50/50
picks? Find it, beat it, prove it, implement it." This half feeds the
variance-portfolio study preregistered in draft/audit/edge_hunt_2026-08-16.md
§2 (committed before any measurement — commit eb367719): this league pays
$100 x 15 weekly highs (37.5% of the $4,000 pot), and same-mean rosters
differ in weekly sd — the sd comes from the players, and the players' weekly
distributions are measurable.

WHAT IS MEASURED (nothing else):
  - per player, per season in {2024, 2025}: weekly mean / sample sd / cv
    over scored rows (frozen-table scoring via fetch_component_stats — the
    exact basis conditional_value.py measures on), weeks 1-17, measurable
    iff >= 6 rows and mean > 0, else ABSENT — never zero;
  - primary cv per player = the most recent measurable season (2025, else
    2024, else absent);
  - per-position class fallback = unweighted mean cv over players with a
    measurable 2025 cv who finished top-40 at the position by 2025 realized
    points (the draft-relevant class), n stated.

Stack correlations are NOT remeasured here — the committed
draft/data/conditional_value_2026.json class table is the one source of
truth; the sim arm (variance_portfolio.js) reads it directly.

GATED: no board field, no proj_*, no composite, no recommendation surface
is touched. One artifact out: draft/data/variance_inputs_2026.json
(_territory first). The sim arm consumes it; nothing live does.

Run: python3 draft/tools/variance_portfolio.py
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent          # draft/tools
DRAFT = HERE.parent
ROOT = DRAFT.parent
sys.path.insert(0, str(DRAFT / "backtest"))

import fetch_component_stats as FCS  # noqa: E402

OUT = DRAFT / "data" / "variance_inputs_2026.json"
BOARD = ROOT / "public" / "draft_data.json"

SEASONS = (2024, 2025)          # preregistered measurement window
MIN_GAMES = 6                   # preregistered measurability floor
CLASS_TOP_N = 40                # preregistered draft-relevant class per pos
LAST_WEEK = 17
POSITIONS = ("QB", "RB", "WR", "TE")


def weekly_cv(rows: dict) -> dict | None:
    """{mean, sd, cv, n_weeks} from {week: pts}; None (absent, not zero)
    when n < MIN_GAMES or mean <= 0."""
    vals = list(rows.values())
    n = len(vals)
    if n < MIN_GAMES:
        return None
    m = sum(vals) / n
    if m <= 0:
        return None
    sd = math.sqrt(sum((v - m) ** 2 for v in vals) / (n - 1))
    return {"mean": round(m, 3), "sd": round(sd, 3),
            "cv": round(sd / m, 4), "n_weeks": n}


def season_points(season: int, table: dict) -> dict:
    return FCS.scored_weekly_points(season, table, LAST_WEEK)


def positions_record() -> dict:
    rec = json.loads((DRAFT / "data" / "player_positions.json").read_text())
    return rec["positions"]


def run() -> dict:
    table = FCS.frozen_scoring_table()
    pos = positions_record()
    per_season = {s: season_points(s, table) for s in SEASONS}

    measured: dict[str, dict] = {}
    for season in SEASONS:                      # ascending: later overwrites
        for pid, rows in per_season[season].items():
            cv = weekly_cv(rows)
            if cv is not None:
                measured[pid] = dict(cv, source_season=season)

    # class fallback: measurable-2025, top-40 by 2025 realized points.
    totals_2025 = {pid: sum(rows.values())
                   for pid, rows in per_season[2025].items()}
    class_cv = {}
    for p in POSITIONS:
        ranked = sorted((pid for pid in totals_2025
                         if pos.get(pid) == p), key=lambda x: -totals_2025[x])
        cvs = []
        for pid in ranked[:CLASS_TOP_N]:
            cv = weekly_cv(per_season[2025][pid])
            if cv is not None:
                cvs.append(cv["cv"])
        class_cv[p] = ({"cv_mean": round(sum(cvs) / len(cvs), 4),
                        "n": len(cvs)} if cvs else None)

    board = json.loads(BOARD.read_text())
    players = {}
    coverage = {p: {"measured": 0, "fallback": 0} for p in POSITIONS}
    for row in board.get("players", []):
        pid = str(row["player_id"])
        ppos = row.get("position")
        if ppos not in POSITIONS:
            continue                            # K/DEF: stores are offense-only
        m = measured.get(pid)
        if m is not None:
            players[pid] = dict(m, position=ppos)
            coverage[ppos]["measured"] += 1
        else:
            coverage[ppos]["fallback"] += 1     # entry stays ABSENT, not zero

    return {
        "_territory": ("TERRITORY: A — produced by "
                       "draft/tools/variance_portfolio.py"),
        "_note": ("Per-player weekly cv MEASURED from the committed component "
                  "stores (frozen-table scoring), preregistered in "
                  "draft/audit/edge_hunt_2026-08-16.md §2. A board player "
                  "with no measurable history is ABSENT here (never zero); "
                  "the sim arm applies the stated per-position class "
                  "fallback and counts every use. Stack correlations live "
                  "in conditional_value_2026.json — one source of truth, "
                  "not copied here."),
        "prereg": {"seasons": list(SEASONS), "min_games": MIN_GAMES,
                   "class_top_n": CLASS_TOP_N,
                   "audit_doc": "draft/audit/edge_hunt_2026-08-16.md §2"},
        "players": {pid: players[pid] for pid in sorted(players)},
        "class_cv": class_cv,
        "board_coverage": coverage,
    }


def main() -> None:
    doc = run()
    OUT.write_text(json.dumps(doc, indent=1))
    print(f"wrote {OUT.relative_to(ROOT)}")
    print("class cv:", {p: doc["class_cv"][p] for p in POSITIONS})
    print("coverage:", doc["board_coverage"])


if __name__ == "__main__":
    main()
