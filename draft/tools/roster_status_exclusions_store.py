# TERRITORY: A
"""ROSTER-STATUS EXCLUSIONS, COMMITTED — the deterministic board-vintage
status filter as a standalone artifact, so ANY replay harness (the Python
proxy, the JS engine seat replay in CI) reads ONE list instead of each
recomputing its own population and silently missing players.

WHY BOARD-AGNOSTIC: the proxy board prices only players with a Y-1 season,
but the backtest bundle board projects off Y-2 too — so a 2023 bundle
carries Gronkowski/Brown (last games 2021) while the proxy-board-scoped
exclusion list never saw them, and the engine's first status-filtered arm
filtered nothing. The population here is every player with any committed
game strictly before Y.

THE RULE, its committed-data sources and BOTH error directions live in
draft_replay_2025.roster_status_exclusions — one implementation, reused.

Run: python3 draft/tools/roster_status_exclusions_store.py
Writes draft/data/roster_status_exclusions.json (deterministic).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
DRAFT = HERE.parent
ROOT = DRAFT.parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(DRAFT / "backtest"))
sys.path.insert(0, str(DRAFT))

import draft_replay_2025 as R  # noqa: E402
from model_accuracy_backtest import positions_record  # noqa: E402

OUT = DRAFT / "data" / "roster_status_exclusions.json"
SEASONS = (2023, 2024, 2025)


def run() -> dict:
    positions = positions_record()
    names = R.name_map()
    years = {}
    for season in SEASONS:
        excluded, kept = R.roster_status_exclusions_all(season)
        years[str(season)] = {
            "excluded": [
                {"player_id": p, "name": names.get(p, p),
                 "pos": positions.get(p), **meta}
                for p, meta in sorted(excluded.items())],
            "kept_indeterminate_zero_game_players": [
                {"player_id": p, "name": names.get(p, p),
                 "pos": positions.get(p)} for p in kept],
        }
    return {
        "_territory": ("TERRITORY: A — produced by "
                       "draft/tools/roster_status_exclusions_store.py"),
        "_note": ("Deterministic roster-status exclusions per replay season, "
                  "board-agnostic population (any player with a committed "
                  "game before Y). Rule, sources and both error directions: "
                  "draft_replay_2025.roster_status_exclusions. Consumed by "
                  "draft/backtest/replay_seats.js (the engine replay's "
                  "status-filtered DIAGNOSTIC arm) and comparable with the "
                  "board-scoped lists inside "
                  "replay_league_table_restated.json."),
        "rule": ("excluded iff zero recorded games in every committed "
                 "season Y..2025 AND (Y<2025, corroborated by at least one "
                 "later zero-game season) OR (Y=2025, absent from or "
                 "teamless on the committed 2026 live board); "
                 "indeterminable status STAYS and is listed"),
        "population": ("players with >=1 recorded game in any committed "
                       "season in [2021, Y-1]"),
        "years": years,
    }


def main() -> None:
    doc = run()
    OUT.write_text(json.dumps(doc, indent=1))
    print(f"wrote {OUT.relative_to(ROOT)}")
    for s in SEASONS:
        y = doc["years"][str(s)]
        print(f"{s}: excluded {len(y['excluded'])}, kept indeterminate "
              f"{len(y['kept_indeterminate_zero_game_players'])}")


if __name__ == "__main__":
    main()
