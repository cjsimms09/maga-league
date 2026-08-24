# TERRITORY: C
"""PER-PLAYER GAMES-PLAYED JOIN — register 112, A's ask ("the single
highest-value item on the model roadmap... routed: A, with C for the
join"), unblocked by the draft finishing. `ROUTES.md` TO: C, 2026-08-19.

THE PROBLEM THIS ANSWERS, IN CORY'S OWN WORDS (08-19): *"it also depends
on what QB you have. if you have josh allen then you only need one."*
The board carries exactly ONE `games_expected` value per position, so
Josh Allen and a third-string journeyman are modelled as equally durable.
This module does NOT touch `games_expected` or any board field — it
emits a standalone per-player join so A can grade it before anything
downstream moves (the ask's own instruction).

FIXABLE FROM DATA ALREADY ON DISK, NO NEW EGRESS (rule 11): this reuses
`fetch_component_stats.season_components()` verbatim — that function
already computes `games` as a per-player-per-season ROW COUNT ("row-
presence means 'was on a field'", its own docstring) over the exact
nflverse weekly stores the register row names. Nothing here re-derives
what that function already does.

WHAT "GAMES" ACTUALLY MEASURES, STATED PLAINLY (the real limit, not
hidden): a row exists for any week the player recorded a stat line, which
conflates two different things for a backup — "was hurt" and "was not
the starter." For a QB1 like Josh Allen (16/16/16 games, 2023-2025,
verified below) this is a clean durability read. For a backup QB like
Kyle Allen (1 game in 2024, verified below) it is NOT primarily an
injury signal — he simply was not needed. This module reports the raw
join honestly; separating "benched" from "hurt" is a modeling decision
for whoever consumes this, not something invented here.

THE PER-SEASON CEILING IS NOT A CONSTANT, VERIFIED RATHER THAN ASSUMED
(rule 3f — the exact trap this whole register row exists to fix one
level up): the maximum real games observed in a season is 16 for BOTH
2023 and 2024, but 17 for 2025 (checked directly against
`season_components()`'s real output before writing this module). A
hardcoded "17 minus one bye" constant would have been wrong for two of
the three seasons this store covers. `games_pct_by_season` divides by
that SEASON's own observed ceiling, not a guessed league-wide number.

Run: python3 draft/backtest/player_games_played.py [season ...]
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent          # draft/backtest
DRAFT = HERE.parent
sys.path.insert(0, str(HERE))

import fetch_component_stats as FCS  # noqa: E402  (rule 11)

OUT = HERE / "player_games_played.json"

DEFAULT_SEASONS = (2023, 2024, 2025)  # matches the register row's own ask

#: Rule 3e known-positive: Josh Allen (sleeper_id 4984) vs Kyle Allen
#: (sleeper_id 5127) — the EXACT pair Cory's own quote and register 112
#: name. Real values verified against the live store before writing this
#: fixture, not assumed: Allen 16/16/16 across 2023-2025; Kyle Allen 1
#: game in 2024 (checked directly).
KNOWN_POSITIVE = {"durable_id": "4984", "durable_name": "Josh Allen",
                  "durable_min_games_any_season": 15,
                  "thin_id": "5127", "thin_name": "Kyle Allen",
                  "thin_season": 2024, "thin_max_games": 3}


def games_ceiling(season_games: dict) -> int:
    """The real observed max games in a season -- the league's own
    practical ceiling that season, not a guessed constant. Pure."""
    return max((v.get("games", 0) for v in season_games.values()), default=0)


def build_season_join(season: int, season_games: dict) -> dict:
    """{pid: {games, games_pct, pos, team}} for one season. Pure given
    `season_games` (the caller passes `season_components(season)`'s real
    output, or a fixture for a test)."""
    ceiling = games_ceiling(season_games)
    out = {}
    for pid, rec in season_games.items():
        games = rec.get("games", 0)
        out[pid] = {
            "games": games,
            "games_pct": round(games / ceiling, 4) if ceiling else None,
            "pos": rec.get("pos"),
            "team": rec.get("team"),
        }
    return out, ceiling


def weighted_availability(per_season: dict) -> float | None:
    """Pooled 3-year rate: total games / total ceiling across every
    season the player has a row for. Deliberately NOT recency-weighted --
    that is a modeling choice for whoever consumes this (A grades it),
    and an invented weighting scheme here would be one more unverified
    assumption riding along with a join that is supposed to be a plain
    fact. Pure."""
    total_games = 0
    total_ceiling = 0
    for season, rec in per_season.items():
        if rec.get("games_pct") is None:
            continue
        ceiling = rec.get("_ceiling")
        total_games += rec["games"]
        total_ceiling += ceiling
    if total_ceiling == 0:
        return None
    return round(total_games / total_ceiling, 4)


def build_store(seasons=DEFAULT_SEASONS, season_games_by_year: dict | None = None) -> dict:
    """`season_games_by_year` lets tests inject fixtures; real runs pass
    None and this fetches via `fetch_component_stats.season_components`
    (already-committed data, no new egress)."""
    if season_games_by_year is None:
        season_games_by_year = {s: FCS.season_components(s) for s in seasons}

    per_season_join = {}
    ceilings = {}
    for season in seasons:
        join, ceiling = build_season_join(season, season_games_by_year[season])
        per_season_join[season] = join
        ceilings[season] = ceiling

    all_pids = set()
    for join in per_season_join.values():
        all_pids.update(join.keys())

    players = {}
    for pid in all_pids:
        per_season = {}
        pos, team = None, None
        for season in seasons:
            rec = per_season_join[season].get(pid)
            if rec is None:
                continue
            per_season[season] = dict(rec, _ceiling=ceilings[season])
            pos = rec.get("pos") or pos
            team = rec.get("team") or team
        rate = weighted_availability(per_season)
        # strip the internal _ceiling before emitting -- ceilings live at
        # the season level (players[pid]... no, at doc["season_ceilings"])
        clean_per_season = {str(s): {k: v for k, v in rec.items() if k != "_ceiling"}
                            for s, rec in per_season.items()}
        players[pid] = {
            "pos": pos, "team": team,
            "games_played_by_season": clean_per_season,
            "weighted_availability_rate": rate,
        }

    doc = {
        "_territory": "TERRITORY: C — produced by draft/backtest/player_games_played.py",
        "_note": ("Per-player games-played join, register 112 (A's ask, unblocked "
                 "by the draft finishing). games_played_by_season[season].games is "
                 "a real row-presence count from fetch_component_stats.season_"
                 "components (rule 11, not re-derived); games_pct divides by that "
                 "SEASON's own observed ceiling (verified NOT constant across "
                 "2023-2025 before this was built, rule 3f). "
                 "weighted_availability_rate is the pooled (not recency-weighted) "
                 "3-year rate. Deliberately NOT wired into games_expected, the "
                 "need curve, or any board field — a standalone join for A to "
                 "grade before anything downstream moves, per the register row's "
                 "own instruction."),
        "seasons": list(seasons),
        "season_ceilings": ceilings,
        "n_players": len(players),
        "players": players,
    }
    return doc


def verify_known_positive(doc: dict) -> dict:
    durable = doc["players"].get(KNOWN_POSITIVE["durable_id"])
    thin = doc["players"].get(KNOWN_POSITIVE["thin_id"])
    if durable is None or thin is None:
        return {"ok": False, "why": "known-positive player(s) not found in the join"}
    durable_ok = all(
        rec["games"] >= KNOWN_POSITIVE["durable_min_games_any_season"]
        for rec in durable["games_played_by_season"].values())
    thin_season = str(KNOWN_POSITIVE["thin_season"])
    thin_rec = thin["games_played_by_season"].get(thin_season)
    thin_ok = (thin_rec is not None
              and thin_rec["games"] <= KNOWN_POSITIVE["thin_max_games"])
    return {"ok": durable_ok and thin_ok, "durable_ok": durable_ok, "thin_ok": thin_ok,
           "durable_seasons": durable["games_played_by_season"],
           "thin_season_games": thin_rec}


#: Refusal floor -- a real 3-season join has 500+ players/season; a
#: near-empty result is an upstream failure (season_components broke or
#: an empty component_stats store), not a real "the league has 10
#: players" state.
MIN_PLAYERS = 200


def refusal_reason(doc: dict) -> str | None:
    if doc["n_players"] < MIN_PLAYERS:
        return (f"only {doc['n_players']} players joined (floor {MIN_PLAYERS}, "
               "real runs see 500+) -- upstream component-stats store empty "
               "or reshaped")
    return None


def main(seasons=DEFAULT_SEASONS) -> int:
    doc = build_store(seasons)
    control = verify_known_positive(doc)
    if not control["ok"]:
        print(f"VOID -- known-positive control failed: {control}", file=sys.stderr)
        return 1
    reason = refusal_reason(doc)
    if reason:
        print(f"REFUSING TO WRITE: {reason}. Nothing written.", file=sys.stderr)
        return 1
    OUT.write_text(json.dumps(doc, indent=1))
    print(f"wrote {OUT.relative_to(DRAFT.parent)}: {doc['n_players']} players, "
         f"seasons {doc['seasons']}, ceilings {doc['season_ceilings']}")
    return 0


if __name__ == "__main__":
    yrs = tuple(int(a) for a in sys.argv[1:]) or DEFAULT_SEASONS
    sys.exit(main(yrs))
