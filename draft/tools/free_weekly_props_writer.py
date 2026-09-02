# TERRITORY: C
"""FREE WEEKLY PLAYER-PROP LINES -> IMPLIED FANTASY POINTS, ONE WEEK AT A TIME.

Cory's standing ruling 09-01: *"We don't need odds api... We get free props
from bovada, ball don't lie, etc!!"* (`CLAUDE.md`). `fetch_weekly_props.py`
(TERRITORY: A) prices this from the-odds-api.com, a paid door whose cron is
now removed. This is the free-source replacement — same output contract,
same file, same consumer (`draft/weekly_props_arm.py`'s `props_weekly_v1`
study arm) — so nothing downstream needs to change.

SOURCES, in priority order, measured 09-02 in `free_props_census_2026.json`
(controls C1+C2 green, this session's relay dispatch):

  SLEEPER PICKS   `GET https://api.sleeper.app/lines/available?sport=nfl`,
                  keyless. `subject_id` IS the Sleeper player_id our whole
                  pipeline runs on — NO name crosswalk, so the Bijan/Brian
                  collision class cannot occur here. `wager_type` is a
                  Sleeper stat key, not prose.

  UNDERDOG        `GET https://api.underdogfantasy.com/beta/v5/over_under_lines`,
                  keyless. Broader coverage (31 QBs, 66 RBs, 129/135
                  receivers, and the joint "Rush + Rec TDs" market Sleeper
                  does not price at all) but needs a name crosswalk.

MARKET-LEVEL FILL, NOT PLAYER-LEVEL. Sleeper Picks' own markets always win;
Underdog fills only the MARKETS Sleeper did not price for that same player —
a player Sleeper prices for passing yards still gets Underdog's joint TD
line if Sleeper never quotes it, which is the ask's own example (322 players
carry that market and Sleeper prices none of them). A player-level "use
Underdog only where Sleeper has nothing at all" would throw that away.

THE JOINT TD MARKET. Underdog prices "Rush + Rec TDs" as ONE line
(`market_of()` -> `player_rush_rec_tds`), not the split `rush_td`/`rec_td`
markets `fetch_weekly_props.MARKET_TO_STAT` expects. Under this league's
scoring a rushing and a receiving TD are worth the same (both 6.0 on
`league.scoring`), so the joint line is remapped to `player_rush_tds`
before `implied_points()` sees it — the fold the ask specified, not
invented here.

REUSE, NOT REBUILD (Rule 11): `free_props_census.market_of()` is the ONE
label->market-key crosswalk, already unit-tested on both sources' real
spellings — not re-derived. `fetch_weekly_props.py`'s `implied_points()`
(the scoring math, including the any_td expected-touchdown fold),
`board_index()`/`match_player()` (name-to-board matching with team
disambiguation) and `props_snapshot_path()` (the output path both this and
the paid writer must agree on) are A's pure functions, imported verbatim.

UNDERDOG PLAYER NAME, FOUND WHILE BUILDING THIS FILE: `free_props_census.
underdog()`'s `title.replace(stat, "").strip(" -")` extraction leaves a
trailing " O/U" on rows where the stat string is not a literal substring of
the title (verified against the real committed census sample: market
`player_rush_rec_tds`, player field reads `"A.J. Brown  O/U"`, the artifact
this module now depends on). `options[0].selection_header` is a clean,
dedicated name field on every real sampled row (`"Fernando Mendoza"`, no
parsing) and is used here as primary. The title-strip fallback is kept for
a row missing it, but is NOT a full fix — a dirty title whose `stat` is not
a literal substring still normalizes to a key that will not match the
board (`normalize_name("A.J. Brown  O/U") != normalize_name("A.J. Brown")`,
checked directly, not assumed) — such a row goes to `unmatched`, never a
wrong player. Real limitation, stated rather than silently papered over by
the fallback's mere existence.

Rule 3e known-positive/known-negative: `test_free_weekly_props_writer.py`
pins both against fixtures built from the real committed census bytes
above, not invented shapes — this sandbox cannot reach either host (403 at
CONNECT, the same shape as every other props/odds source this project has
hit), so a real end-to-end run only happens in CI.

Run: python3 draft/tools/free_weekly_props_writer.py --season 2026 --week 1
"""
from __future__ import annotations

import argparse
import datetime as _dt
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent          # draft/tools
DRAFT = HERE.parent
ROOT = DRAFT.parent
BT = DRAFT / "backtest"
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(DRAFT))
sys.path.insert(0, str(BT))

from free_props_census import market_of          # noqa: E402  (rule 11)
from fetch_weekly_props import (                  # noqa: E402  (rule 11)
    implied_points, board_index, match_player, props_snapshot_path,
)

SLEEPER_URL = "https://api.sleeper.app/lines/available?sport=nfl"
UNDERDOG_URL = "https://api.underdogfantasy.com/beta/v5/over_under_lines"

HEADERS = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                        "(KHTML, like Gecko) Chrome/124.0 Safari/537.36",
          "Accept": "application/json, text/plain, */*"}

#: market_of() key -> the key implied_points()'s MARKET_TO_STAT actually
#: carries. Only the joint market needs remapping; every other market_of()
#: output already matches a MARKET_TO_STAT key one-to-one.
_MARKET_REMAP = {"player_rush_rec_tds": "player_rush_tds"}


def _remap(key: str) -> str:
    return _MARKET_REMAP.get(key, key)


def _get(url: str, timeout: int = 25) -> tuple[int, bytes]:
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, resp.read()
    except urllib.error.HTTPError as e:
        return e.code, (e.read() if e.fp else b"")
    except Exception as e:  # noqa: BLE001 -- network I/O, report and refuse
        return 0, str(e).encode()


def fetch_sleeper_picks_raw() -> list:
    st, body = _get(SLEEPER_URL)
    if st != 200:
        return []
    try:
        d = json.loads(body.decode("utf-8", "ignore"))
    except ValueError:
        return []
    return d if isinstance(d, list) else (d.get("lines") or d.get("data") or [])


def fetch_underdog_raw() -> dict:
    st, body = _get(UNDERDOG_URL)
    if st != 200:
        return {}
    try:
        return json.loads(body.decode("utf-8", "ignore"))
    except ValueError:
        return {}


def sleeper_market_points(rows: list) -> dict[str, dict[str, float]]:
    """{sleeper_pid: {market_key: point}} -- pid is native, no crosswalk.
    The payload mixes every sport Sleeper Picks covers (verified against the
    real committed census: the first raw row is an MLB walks line), so the
    sport filter is load-bearing, not defensive."""
    out: dict = {}
    for r in rows:
        if str(r.get("sport") or "").lower() != "nfl":
            continue
        wt = str(r.get("wager_type") or "")
        key = market_of(wt) or market_of(wt.replace("_", " "))
        if not key:
            continue
        key = _remap(key)
        pid = str(r.get("subject_id") or "")
        opts = r.get("options") or []
        line = next((o.get("outcome_value") for o in opts
                    if o.get("outcome_value") is not None), None)
        if not pid or line is None:
            continue
        try:
            line = float(line)
        except (TypeError, ValueError):
            continue
        out.setdefault(pid, {})[key] = line
    return out


def underdog_market_points(doc: dict, idx: dict) -> tuple[dict, list]:
    """({sleeper_pid: {market_key: point}}, [unmatched {name, market, reason}]).
    GAME-WEEK lines only -- a line whose appearance resolves to a real game
    via `games`/`appearances`; season lines (no matched game, or 'season' in
    the title/stat) are excluded, same rule `free_props_census.underdog()`
    already applies to its own tally."""
    lines = doc.get("over_under_lines") or []
    apps = {a.get("id"): a for a in (doc.get("appearances") or [])}
    games = {g.get("id"): g for g in (doc.get("games") or [])}
    out: dict = {}
    unmatched: list = []
    for ln in lines:
        ou = ln.get("over_under") or {}
        title = ou.get("title") or ""
        ast = ou.get("appearance_stat") or {}
        stat = ast.get("display_stat") or ""
        app = apps.get(ast.get("appearance_id")) or {}
        game = games.get(app.get("match_id")) or {}
        sport = (game.get("sport_id") or app.get("sport_id") or "").upper()
        if sport and sport != "NFL":
            continue
        key = market_of(stat) or market_of(title)
        if not key:
            continue
        key = _remap(key)
        is_season = ("season" in title.lower()) or ("season" in stat.lower()) or not game
        if is_season:
            continue
        line = ln.get("stat_value")
        if line is None:
            continue
        try:
            line = float(line)
        except (TypeError, ValueError):
            continue
        opts = ln.get("options") or []
        # PRIMARY: a dedicated name field on every real sampled row. FALLBACK
        # (a row missing it): strip the stat out of the combined title, the
        # same shape free_props_census.underdog() uses -- kept only because
        # a row this defensive lets through must still be reachable, never
        # silently dropped for want of the preferred field.
        name = (opts[0].get("selection_header") if opts else None)
        if not name:
            name = title.replace(stat, "").strip(" -") if stat and stat in title else title
            name = name.strip()
        if not name:
            continue
        match, reason = match_player(name, None, None, idx)
        if not match:
            unmatched.append({"name": name, "market": key, "reason": reason})
            continue
        pid = match[0]
        out.setdefault(pid, {})[key] = line
    return out, unmatched


def board_by_id(board_players: list) -> dict:
    out = {}
    for p in board_players:
        pid = p.get("player_id")
        if pid:
            out[str(pid)] = p
    return out


def build_players(sleeper_mp: dict, underdog_mp: dict, board_index_by_id: dict,
                  scoring_table: dict) -> dict:
    """Sleeper Picks' own markets always win per player; Underdog fills only
    the MARKETS Sleeper did not price for that same player -- see the
    module docstring for why this is market-level, not player-level."""
    players: dict = {}
    for pid in set(sleeper_mp) | set(underdog_mp):
        market_points = dict(underdog_mp.get(pid) or {})
        market_points.update(sleeper_mp.get(pid) or {})   # Sleeper wins per-market
        pts, stat_line = implied_points(market_points, scoring_table)
        if pts is None:
            continue
        b = board_index_by_id.get(pid) or {}
        players[pid] = {
            "name": b.get("name"), "team": b.get("team"), "pos": b.get("position"),
            "points": pts, "stat_line": stat_line,
        }
    return players


#: Refusal floor -- a real week-1 run prices 100+ players across two sources
#: (census run: 31 QBs alone on Underdog, 30 on Sleeper). A near-empty
#: result is an upstream failure (a schema change, an empty payload), not a
#: real "nobody has lines yet" state this close to kickoff.
MIN_PLAYERS = 30


def build_snapshot(players: dict, sleeper_unmatched: int, underdog_unmatched: list,
                   season: int, week: int) -> dict:
    return {
        "_territory": "TERRITORY: C — produced by draft/tools/free_weekly_props_writer.py",
        "_note": ("Free-source weekly player-prop implied points (Cory's 09-01 ruling: "
                 "no paid Odds API). Sleeper Picks priced first (native sleeper_id, no "
                 "crosswalk); Underdog fills markets Sleeper did not price, per player -- "
                 "not per-player-if-Sleeper-had-nothing. A player with no quoted market "
                 "that week is ABSENT from `players`, never a zero. Same contract "
                 "fetch_weekly_props.py's paid writer used: draft/weekly_props_arm.py "
                 "reads players[pid].points, graded by weekly_own_grade.py as the "
                 "props_weekly_v1 study arm."),
        "season": season, "week": week,
        "captured_at": _dt.datetime.now(_dt.timezone.utc).isoformat(),
        "provenance": {
            "sources": ["sleeper_picks", "underdog"],
            "sleeper_url": SLEEPER_URL, "underdog_url": UNDERDOG_URL,
            "underdog_unmatched_count": len(underdog_unmatched),
            "players_priced": len(players),
        },
        "players": players,
        "underdog_unmatched": underdog_unmatched[:50],
    }


def _current_season_week() -> tuple[int | None, int | None]:
    """Sleeper's own state -- NOT derived from the calendar (rule 11, same
    reasoning as weekly_proj_snapshot.nfl_state()'s own docstring: a week
    number computed from a date is right for months and silently wrong at
    a bye/flex boundary)."""
    import weekly_proj_snapshot as WPS
    state = WPS.nfl_state()
    return state.get("season"), state.get("week")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--season", type=int, default=None,
                    help="defaults to Sleeper's own current season if omitted")
    ap.add_argument("--week", type=int, default=None,
                    help="defaults to Sleeper's own current week if omitted")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    season, week = args.season, args.week
    if season is None or week is None:
        auto_season, auto_week = _current_season_week()
        season = season if season is not None else auto_season
        week = week if week is not None else auto_week
    if season is None or week is None:
        print("! could not determine season/week (pass --season/--week or "
             "check Sleeper /state/nfl reachability); refusing", file=sys.stderr)
        return 1

    board_path = Path(os.environ.get("PROPS_WEEKLY_BOARD")
                      or ROOT / "public" / "draft_data.json")
    out_dir = Path(os.environ.get("PROPS_WEEKLY_OUT_DIR") or DRAFT / "data" / "props")
    if not board_path.exists():
        print(f"! board not found at {board_path}; refusing", file=sys.stderr)
        return 1
    board_doc = json.loads(board_path.read_text())
    board_players = (board_doc.get("players") or []) + (board_doc.get("kept_players") or [])
    idx = board_index(board_players)
    by_id = board_by_id(board_players)

    from fetch_component_stats import frozen_scoring_table
    scoring_table = frozen_scoring_table()

    sleeper_rows = fetch_sleeper_picks_raw()
    underdog_doc = fetch_underdog_raw()
    if not sleeper_rows and not underdog_doc:
        print("! both sources returned nothing -- refusing to write", file=sys.stderr)
        return 1

    sleeper_mp = sleeper_market_points(sleeper_rows)
    underdog_mp, underdog_unmatched = underdog_market_points(underdog_doc, idx)
    players = build_players(sleeper_mp, underdog_mp, by_id, scoring_table)

    if len(players) < MIN_PLAYERS:
        print(f"! only {len(players)} players priced (floor {MIN_PLAYERS}) -- "
             "refusing to write a thin snapshot", file=sys.stderr)
        return 1

    doc = build_snapshot(players, 0, underdog_unmatched, season, week)
    if args.dry_run:
        print(json.dumps({"players_priced": len(players),
                          "underdog_unmatched": len(underdog_unmatched)}, indent=1))
        return 0

    out_dir.mkdir(parents=True, exist_ok=True)
    path = props_snapshot_path(out_dir, season, week)
    if path.exists():
        print(f"already exists, refusing to overwrite: {path}", file=sys.stderr)
        return 1
    path.write_text(json.dumps(doc, indent=1))
    print(f"wrote {path.relative_to(ROOT)}: {len(players)} players priced, "
         f"{len(underdog_unmatched)} Underdog rows unmatched")
    return 0


if __name__ == "__main__":
    sys.exit(main())
