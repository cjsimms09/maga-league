# TERRITORY: A
"""PLAYOFF-WEEKS MATCHUP SOFTNESS — a tilt-breaker fact, not a projection input.

CORY'S DIRECTIVE (2026-08-16, "Do all 4!"): the league's title is decided in
fantasy playoff weeks 15-17, but the draft board prices all 17 weeks equally.
Before the 2026-08-22 draft, every QB/RB/WR/TE on the committed board gets a
playoff-weeks matchup-softness fact: who does this player's team face in NFL
weeks 15/16/17, and how soft were those defenses against his position LAST
season, under OUR league's own scoring table.

WHAT THIS CHANGES ON THE BOARD: NOTHING. No proj_* column, no VORP, no rank,
no scoring CFG. It is a written fact beside the board for breaking ties
between otherwise-equivalent picks. The honest caveats travel in the artifact
itself (see _NOTE below): last season's defenses shift with personnel and
scheme turnover, and 2026 weeks 15-17 are four months of injuries away.

METHOD, in full so the artifact needs no oral tradition:
  1. SCHEDULE. The 2026 vegas store (draft/backtest/vegas_lines_2021_2026.json)
     carries only the 67 games that already have closing lines — weeks 1-5.
     The FULL 2026 schedule comes from the same nflverse games.csv the vegas
     fetcher downloads. `--fetch-schedule` pulls it and commits the weeks
     15-17 REG slice as draft/data/playoff_sched_2026.json (idempotent:
     byte-identical content leaves the committed file untouched, preserving
     its original fetched date). All 32 teams play exactly 3 games in weeks
     15-17 (verified at first fetch; the artifact records the count, and a
     team missing a week would be recorded ABSENT, never zeroed).
  2. DEFENSE-ALLOWED, 2025. The component store
     (draft/backtest/component_stats_2025.json) carries per-player weekly
     stat components with `team` but NO opponent. Opponents are derived from
     the vegas store's 2025 season, which holds ALL 272 regular-season games
     (verified: 32 teams x 17 games). For each player-week row, fantasy
     points are computed under the LEAGUE'S OWN scoring table (read from
     public/draft_data.json league.scoring — never a provider's points, per
     draft/scoring.py's contract) and credited AGAINST the defense that
     week's pairing names as the opponent. Totals divide by the games the
     defense actually played (derived from the pairings, not assumed 17).
  3. SOFTNESS. A team's playoff-slate softness at a position is the mean of
     its three week-15/16/17 opponents' 2025 per-game points allowed to that
     position. Rank 1 = SOFTEST slate (highest points allowed). Ties break
     deterministically: higher avg first, then team code A-Z.

TEAM VOCABULARY: nflverse says LA for the Rams; the board says LAR. The
artifact speaks BOARD codes throughout, normalized through adp.TEAM_ALIASES —
the one shared table (no private re-typed vocabulary, per its own header).
The schedule slice file keeps the source's codes verbatim (it is a slice of
the source, and the tests compare it against the source).

ABSENT-NOT-ZERO: a board player with no NFL team (FA) appears in
`players_absent` with a reason, never in `players` with fabricated zeros. A
team-week with no game would contribute nothing to the average (denominator
shrinks); it is never counted as zero points allowed.

Run:
  python draft/tools/playoff_sos.py                  # rebuild the SOS artifact
  python draft/tools/playoff_sos.py --fetch-schedule # refresh the schedule slice (network)
  python draft/tools/playoff_sos.py --check          # verify committed artifact matches a fresh run

Writes draft/data/playoff_sched_2026.json (fetch step) and
draft/data/playoff_sos_2026.json (compute step).
"""
from __future__ import annotations

import argparse
import csv
import datetime as _dt
import io
import json
import sys
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent      # draft/tools
DRAFT = HERE.parent                          # draft/
ROOT = DRAFT.parent                          # repo root
sys.path.insert(0, str(DRAFT))

from adp import NFL_TEAMS, _norm_team        # noqa: E402  (shared vocabulary — import, never re-type)
from scoring import score_stat_line          # noqa: E402  (league scoring engine — import, never re-type)

SCHED_URL = ("https://github.com/nflverse/nflverse-data/releases/download/"
             "schedules/games.csv")
SEASON = 2026
ALLOWED_SEASON = 2025
PLAYOFF_WEEKS = (15, 16, 17)
POSITIONS = ("QB", "RB", "WR", "TE")

SCHED_PATH = DRAFT / "data" / "playoff_sched_2026.json"
SOS_PATH = DRAFT / "data" / "playoff_sos_2026.json"
BOARD_PATH = ROOT / "public" / "draft_data.json"
COMPONENTS_PATH = DRAFT / "backtest" / f"component_stats_{ALLOWED_SEASON}.json"
VEGAS_PATH = DRAFT / "backtest" / "vegas_lines_2021_2026.json"

_NOTE = (
    "TILT-BREAKER FACT, NOT A PROJECTION INPUT — it changes NO board number "
    "(no proj_*, no VORP, no rank, no scoring CFG). Softness is LAST SEASON'S "
    f"({ALLOWED_SEASON}) per-game fantasy points allowed by each defense to each "
    "position under OUR league's scoring, averaged over a team's NFL week-"
    "15/16/17 opponents in 2026. Rank 1 = softest slate. HONEST CAVEATS: "
    "defenses shift year to year (personnel, coordinators, scheme) — "
    "points-allowed is among the least stable team stats; December weather, "
    "home/away, and resting starters are not modeled; the 2026 opponents are "
    "fixed but who is healthy in those weeks is unknowable in August. Use it "
    "to break ties between otherwise-equivalent picks, never to move a price. "
    "Absent data stays absent: FA players are in players_absent with a "
    "reason, never zero-filled."
)


# --------------------------------------------------------------------------
# Step 1 — schedule slice (the only step that touches the network, and only
# under --fetch-schedule).
# --------------------------------------------------------------------------

def slice_playoff_schedule(csv_text: str) -> list[dict]:
    """games.csv text -> weeks 15-17 REG slice for SEASON, source codes verbatim.

    Deterministic order: (week, home). Keys kept: week, home, away, gameday —
    nothing derived, so the slice stays comparable byte-for-byte against a
    re-fetch of the source.
    """
    out = []
    for row in csv.DictReader(io.StringIO(csv_text)):
        if row.get("game_type") != "REG":
            continue
        if int(row["season"]) != SEASON:
            continue
        week = int(row["week"])
        if week not in PLAYOFF_WEEKS:
            continue
        out.append({"week": week, "home": row["home_team"],
                    "away": row["away_team"], "gameday": row["gameday"]})
    out.sort(key=lambda g: (g["week"], g["home"]))
    return out


def _sched_doc(games: list[dict], fetched: str) -> dict:
    return {
        "_territory": "TERRITORY: A — produced by draft/tools/playoff_sos.py --fetch-schedule",
        "_note": (
            f"NFL weeks {list(PLAYOFF_WEEKS)} of the {SEASON} regular season — the "
            "fantasy playoff weeks — sliced verbatim (source team codes, e.g. LA "
            "for the Rams) from the same nflverse games.csv the vegas-lines "
            "fetcher downloads. The vegas store's 2026 season carries only games "
            "with posted lines (weeks 1-5 at fetch time), which is why this "
            "slice exists as its own committed file. A game absent here is "
            "absent from the source, never invented."
        ),
        "provenance": {
            "url": SCHED_URL,
            "fetched": fetched,
            "season": SEASON,
            "season_type": "REG",
            "weeks": list(PLAYOFF_WEEKS),
            "games": len(games),
        },
        "games": games,
    }


def fetch_schedule_slice(path: Path = SCHED_PATH) -> dict:
    """Fetch games.csv, write the playoff slice. Idempotent: if the games
    content is unchanged the committed file is left untouched (original
    fetched date preserved), same discipline as fetch_component_stats."""
    with urllib.request.urlopen(SCHED_URL, timeout=120) as resp:
        text = resp.read().decode("utf-8")
    games = slice_playoff_schedule(text)
    if path.exists():
        prior = json.loads(path.read_text())
        if prior.get("games") == games:
            print(f"unchanged — {path} left as fetched {prior['provenance']['fetched']}")
            return prior
    doc = _sched_doc(games, _dt.date.today().isoformat())
    # Insertion order, not sort_keys: _territory must LEAD the file, same as
    # every committed store (a reader hits the lane and the caveats first).
    path.write_text(json.dumps(doc, indent=1) + "\n")
    print(f"wrote {path}: {len(games)} games")
    return doc


# --------------------------------------------------------------------------
# Step 2 — 2025 defense-allowed by position, under league scoring.
# --------------------------------------------------------------------------

def pairings(vegas: dict, season: int = ALLOWED_SEASON) -> dict[int, dict[str, str]]:
    """vegas store -> {week: {board_team: board_opponent}} for one season."""
    out: dict[int, dict[str, str]] = {}
    for g in vegas["seasons"][str(season)]:
        wk = out.setdefault(int(g["week"]), {})
        home, away = _norm_team(g["home"]), _norm_team(g["away"])
        wk[home] = away
        wk[away] = home
    return out


def defense_allowed(components: dict, pairs: dict[int, dict[str, str]],
                    scoring: dict) -> tuple[dict, dict]:
    """-> ({def_team: {pos: {total, games, per_game}}}, diagnostics).

    A player-week row on team T in week w scores AGAINST pairs[w][T]. Rows
    whose team has no pairing that week are COUNTED in diagnostics and
    dropped — never silently, never credited to a made-up defense. Games per
    defense come from the pairings (actual games played), not an assumed 17.
    """
    totals: dict[str, dict[str, float]] = {}
    games_played: dict[str, int] = {}
    for wk, teams in pairs.items():
        for t in teams:
            games_played[t] = games_played.get(t, 0) + 1
    unpaired_rows = 0
    for wkdoc in components["weeks"]:
        week = int(wkdoc["week"])
        wk_pairs = pairs.get(week, {})
        for row in wkdoc["players"].values():
            pos = row.get("pos")
            if pos not in POSITIONS:
                continue
            team = _norm_team(row.get("team"))
            opp = wk_pairs.get(team)
            if opp is None:
                unpaired_rows += 1
                continue
            pts = score_stat_line(row, scoring)
            bucket = totals.setdefault(opp, {})
            bucket[pos] = bucket.get(pos, 0.0) + pts
    allowed: dict[str, dict[str, dict]] = {}
    for d, bucket in sorted(totals.items()):
        g = games_played.get(d, 0)
        allowed[d] = {}
        for pos in POSITIONS:
            if pos not in bucket or g == 0:
                continue                      # absent stays absent — no zero cell
            total = round(bucket[pos], 2)
            allowed[d][pos] = {"total": total, "games": g,
                               "per_game": round(total / g, 2)}
    diags = {"unpaired_player_weeks_dropped": unpaired_rows,
             "defenses": len(allowed),
             "games_per_defense": sorted(set(games_played.values()))}
    return allowed, diags


# --------------------------------------------------------------------------
# Step 3 — playoff opponents + softness ranks.
# --------------------------------------------------------------------------

def playoff_opponents(sched_games: list[dict]) -> dict[str, dict[str, str]]:
    """schedule slice -> {board_team: {"15": board_opp, ...}} (weeks a team
    does not play are simply absent from its map)."""
    out: dict[str, dict[str, str]] = {}
    for g in sched_games:
        wk = str(g["week"])
        home, away = _norm_team(g["home"]), _norm_team(g["away"])
        out.setdefault(home, {})[wk] = away
        out.setdefault(away, {})[wk] = home
    return {t: out[t] for t in sorted(out)}


def team_softness(opponents: dict[str, dict[str, str]],
                  allowed: dict) -> dict[str, dict]:
    """-> {team: {"opponents": {...}, "positions": {pos: {opp_allowed_per_game,
    avg_allowed_per_game, rank}}}}. Rank 1 = softest (highest avg allowed),
    ties broken by team code A-Z. Opponents with no allowed cell contribute
    nothing (denominator shrinks) — absent, not zero."""
    teams: dict[str, dict] = {}
    for team, opps in opponents.items():
        entry: dict = {"opponents": dict(sorted(opps.items()))}
        entry["positions"] = {}
        for pos in POSITIONS:
            by_opp = {}
            for wk, opp in sorted(opps.items()):
                cell = allowed.get(opp, {}).get(pos)
                if cell is not None:
                    by_opp[wk] = {"opp": opp, "allowed_per_game": cell["per_game"]}
            if not by_opp:
                continue                      # no measurable opponent — absent
            vals = [v["allowed_per_game"] for v in by_opp.values()]
            entry["positions"][pos] = {
                "opp_allowed_per_game": by_opp,
                "weeks_measured": len(by_opp),
                "avg_allowed_per_game": round(sum(vals) / len(vals), 2),
            }
        teams[team] = entry
    for pos in POSITIONS:
        ranked = sorted(
            (t for t in teams if pos in teams[t]["positions"]),
            key=lambda t: (-teams[t]["positions"][pos]["avg_allowed_per_game"], t))
        for i, t in enumerate(ranked, start=1):
            teams[t]["positions"][pos]["rank"] = i
    return teams


def player_rows(board: dict, teams: dict) -> tuple[dict, dict]:
    """Board QB/RB/WR/TE -> (players, players_absent)."""
    players: dict[str, dict] = {}
    absent: dict[str, dict] = {}
    for p in board["players"]:
        pos = p.get("position")
        if pos not in POSITIONS:
            continue
        pid = str(p["player_id"])
        team = _norm_team(p.get("team"))
        base = {"name": p.get("name"), "position": pos, "team": team or None}
        if team not in NFL_TEAMS or team not in teams:
            absent[pid] = {**base, "reason": "no NFL team on the board (free agent"
                           " or unmapped) — no playoff schedule exists for this "
                           "player; absent, not zeroed"}
            continue
        tpos = teams[team]["positions"].get(pos)
        if tpos is None:
            absent[pid] = {**base, "reason": f"no measurable {ALLOWED_SEASON} "
                           f"defense-allowed data for {team}'s playoff opponents "
                           "at this position; absent, not zeroed"}
            continue
        players[pid] = {
            **base,
            "opponents": teams[team]["opponents"],
            "opp_allowed_per_game": {wk: v["allowed_per_game"]
                                     for wk, v in tpos["opp_allowed_per_game"].items()},
            "avg_allowed_per_game": tpos["avg_allowed_per_game"],
            "softness_rank": tpos["rank"],
        }
    return players, absent


# --------------------------------------------------------------------------
# Assembly.
# --------------------------------------------------------------------------

def build_artifact(board: dict, components: dict, vegas: dict,
                   sched: dict) -> dict:
    scoring = board["league"]["scoring"]
    pairs = pairings(vegas, ALLOWED_SEASON)
    allowed, diags = defense_allowed(components, pairs, scoring)
    opps = playoff_opponents(sched["games"])
    teams = team_softness(opps, allowed)
    players, absent = player_rows(board, teams)
    return {
        "_territory": "TERRITORY: A — produced by draft/tools/playoff_sos.py",
        "_note": _NOTE,
        "provenance": {
            "method": (
                "For each 2025 player-week in the component store, fantasy "
                "points under the league's own scoring table (public/"
                "draft_data.json league.scoring) are credited AGAINST that "
                "week's opponent defense, derived from the vegas store's "
                "complete 2025 pairings (272 games; the component store "
                "carries team but not opponent). Per-game = total / games "
                "the defense actually played. A team's playoff softness at a "
                "position = mean of its 2026 week-15/16/17 opponents' "
                "per-game allowed; rank 1 = softest, ties broken by team "
                "code A-Z. Team codes normalized through adp.TEAM_ALIASES "
                "(board vocabulary, LA->LAR)."
            ),
            "sources": {
                "board": "public/draft_data.json (built_at "
                         + str(board.get("built_at")) + ")",
                "components": ("draft/backtest/component_stats_"
                               f"{ALLOWED_SEASON}.json (fetched "
                               + str(components["provenance"].get("fetched")) + ")"),
                "pairings": "draft/backtest/vegas_lines_2021_2026.json (fetched "
                            + str(vegas["provenance"].get("fetched")) + ")",
                "schedule": "draft/data/playoff_sched_2026.json (fetched "
                            + str(sched["provenance"].get("fetched")) + ")",
            },
            "allowed_season": ALLOWED_SEASON,
            "playoff_weeks": list(PLAYOFF_WEEKS),
            "positions": list(POSITIONS),
            "diagnostics": diags,
            "players_ranked": len(players),
            "players_absent": len(absent),
        },
        "defense_allowed_2025": allowed,
        "teams": teams,
        "players": players,
        "players_absent": absent,
    }


def compute(board_path: Path = BOARD_PATH,
            components_path: Path = COMPONENTS_PATH,
            vegas_path: Path = VEGAS_PATH,
            sched_path: Path = SCHED_PATH) -> dict:
    return build_artifact(
        json.loads(Path(board_path).read_text()),
        json.loads(Path(components_path).read_text()),
        json.loads(Path(vegas_path).read_text()),
        json.loads(Path(sched_path).read_text()),
    )


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--fetch-schedule", action="store_true",
                    help="refresh draft/data/playoff_sched_2026.json from nflverse (network)")
    ap.add_argument("--check", action="store_true",
                    help="verify the committed artifact matches a fresh run (no writes)")
    args = ap.parse_args(argv)

    if args.fetch_schedule:
        fetch_schedule_slice()
        if args.check or not SCHED_PATH.exists():
            return 0

    artifact = compute()
    if args.check:
        committed = json.loads(SOS_PATH.read_text())
        if committed != artifact:
            print("MISMATCH: committed playoff_sos_2026.json differs from a fresh run")
            return 1
        print("committed artifact matches a fresh run")
        return 0
    SOS_PATH.write_text(json.dumps(artifact, indent=1) + "\n")
    print(f"wrote {SOS_PATH}: {len(artifact['players'])} players ranked, "
          f"{len(artifact['players_absent'])} absent")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
