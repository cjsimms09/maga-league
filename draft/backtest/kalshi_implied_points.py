# TERRITORY: C
"""KALSHI IMPLIED FANTASY POINTS — relay's 08-20 dispatch ASK 1, corrected.

Cory, 2026-08-20: "Kalshi may add those.. don't assume they won't" -- right,
and the first pass at this ask stopped after checking only
`weekly_markets_*.json` (per-game props, all settled right now, no season
started yet) and concluded there was nothing live to build against. That was
too little checking: `season_ladders_*.json` -- captured DAILY by the same
`fetch_kalshi.py`, TERRITORY: A -- already carries 351 SEASON-LONG threshold
ladders across 145 real players, ALL STATUS "active" (live, currently priced,
real uncertainty), across SIX series that already include receiving:
KXNFLSEASONPASSYDS / KXNFLSEASONREC / KXNFLSEASONRECTD / KXNFLSEASONRECYDS /
KXNFLSEASONRSHTD / KXNFLSEASONRSHYDS. "Then don't just say can't do it" --
this module is the infrastructure: it runs today, on real live prices, and it
is built to keep running as the catalog changes rather than be re-asked.

WHAT THIS DOES: crosswalks each Kalshi player_code to a sleeper_pid (name
parsed from the rung's own title text, matched against the 2026 board's
`players` + `kept_players` -- both, because keepers are moved OUT of
`players` at build time and a crosswalk that only reads `players` silently
drops every keeper, the exact defect A already found and fixed once this
session for the multi-source projections store), combines whichever stat
ladders exist for that player into one stat line using this league's own
scoring vocabulary (Kalshi's `stat` keys already match ours -- rec/rec_yd/
rec_td/rush_yd/rush_td/pass_yd -- verified against scoring.py before
assuming it, not guessed), scores it with `scoring.score_stat_line` (never a
market's own dollar value), and divides by the player's own `games_expected`
(the board's own field, not a flat assumption) to get an implied PER-GAME
rate -- the closest honest answer to "weekly implied points" a SEASON-long
ladder can give until real per-game weekly markets are actually priced.

WHAT IT DOES NOT DO: invent a full probability distribution. A's own
`expectation_lower_bound` is reused as-is (rule 11) -- it credits the open
top bucket at its floor and is explicitly documented, by A, as a lower bound
rather than a true mean. This module inherits that caveat rather than
building a second, competing estimator under time pressure; `KXNFLFFPTS`
(direct fantasy-points ladders) is watched for below because if it ever
trades, it retires this whole indirection.

QB COVERAGE IS PARTIAL BY CONSTRUCTION, NOT A BUG: only `KXNFLSEASONPASSYDS`
exists for passers today -- no season passing-TD or INT ladder -- so a QB's
`implied_season_points` is passing-yards-only and will read low against a
real season. Reported as a positional coverage note in the store, not hidden.

RULE 3e: `verify_known_positive()` is the executable check that a name this
league actually cares about (one of Cory's own three keepers) crosswalks and
scores to something real, not just that the pipeline runs without raising.

THE WATCH, so "keep checking" is a mechanism and not a promise:
`series_watch()` diffs the CURRENT capture's `series_captured`/
`series_excluded` against the baseline this module was written against and
flags anything new -- run it on every fresh `season_ladders_*.json`, not
just once. `KXNFLFFPTS` is watched by name specifically.

Run: python3 draft/backtest/kalshi_implied_points.py
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
DRAFT = HERE.parent
ROOT = DRAFT.parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(DRAFT))

import scoring  # noqa: E402  (rule 11 -- never a market's own points)
import sleeper_name_index as NI  # noqa: E402  (rule 11 -- normalize_name only, pure)

KALSHI_DIR = ROOT / "draft" / "data" / "kalshi"
BOARD = ROOT / "public" / "draft_data.json"
OUT = HERE / "kalshi_implied_points.json"

#: This module's own baseline, pinned the day it was written (2026-08-20) so
#: `series_watch()` has something concrete to diff against instead of a vague
#: "check periodically". Update these two sets, with a dated reason, the day
#: someone actually applies the diff -- not preemptively.
BASELINE_SERIES_CAPTURED = frozenset({
    "KXNFLSEASONPASSYDS", "KXNFLSEASONREC", "KXNFLSEASONRECTD",
    "KXNFLSEASONRECYDS", "KXNFLSEASONRSHTD", "KXNFLSEASONRSHYDS",
})
BASELINE_SERIES_EXCLUDED = frozenset({
    "KXNFLFFLEADER", "KXNFLFFTOP", "KXNFLFFPTS", "KXNFLANYTD",
})

#: Kalshi's own `stat` values already match this league's scoring vocabulary
#: (verified against scoring.py before writing this, not assumed) -- kept as
#: an explicit identity map so a future Kalshi rename breaks loudly here
#: instead of silently mis-scoring.
STAT_MAP = {"rec": "rec", "rec_yd": "rec_yd", "rec_td": "rec_td",
           "rush_yd": "rush_yd", "rush_td": "rush_td", "pass_yd": "pass_yd"}

_NAME_RE = re.compile(r"Will (.+?) record \d")


def latest_season_ladders_path() -> Path | None:
    candidates = sorted(KALSHI_DIR.glob("season_ladders_*.json"))
    return candidates[-1] if candidates else None


def load_ladders(path=None) -> dict:
    p = path or latest_season_ladders_path()
    if not p or not Path(p).exists():
        return {"ladders": [], "series_captured": [], "series_excluded": {},
               "captured_at": None}
    return json.loads(Path(p).read_text())


def extract_player_name(rung_title: str) -> str | None:
    m = _NAME_RE.search(rung_title or "")
    return m.group(1) if m else None


def board_name_index(board: dict) -> dict:
    """normalized name -> board player dict, from BOTH `players` and
    `kept_players` -- a keeper-only crosswalk gap already cost A a store
    once this session (multisource_projections.py); reading only `players`
    would repeat it here. A name held by more than one entry is excluded
    (same discipline as sleeper_name_index) rather than guessed."""
    by_name: dict = {}
    for p in list(board.get("players") or []) + list(board.get("kept_players") or []):
        nm = p.get("name")
        if not nm:
            continue
        key = NI.normalize_name(nm)
        by_name.setdefault(key, []).append(p)
    return {k: v[0] for k, v in by_name.items() if len(v) == 1}


def group_by_player(ladders: list) -> dict:
    """[ladder row, ...] -> {player_code: [row, ...]} -- each row is one
    (player, stat) pair; a player with three priced stats appears as three
    separate rows in the raw list."""
    out: dict = {}
    for row in ladders:
        out.setdefault(row["player_code"], []).append(row)
    return out


def combine_stat_line(rows: list) -> dict:
    """[ladder row for ONE player, ...] -> {scoring_key: implied value},
    from each stat's `implied.expectation_lower_bound` (A's own computation,
    reused rather than re-derived -- see module docstring for why this is a
    LOWER bound, not a true mean)."""
    line = {}
    for row in rows:
        stat = STAT_MAP.get(row.get("stat"))
        implied = row.get("implied") or {}
        val = implied.get("expectation_lower_bound")
        if stat and val is not None:
            line[stat] = val
    return line


def scoring_cfg() -> dict:
    cfg_path = DRAFT / "config" / "league_config.json"
    return (json.loads(cfg_path.read_text()) or {}).get("scoring") or {}


def build_store(ladders_doc: dict | None = None, board: dict | None = None) -> dict:
    ladders_doc = ladders_doc if ladders_doc is not None else load_ladders()
    board = board if board is not None else json.loads(BOARD.read_text())

    name_idx = board_name_index(board)
    grouped = group_by_player(ladders_doc.get("ladders") or [])
    cfg = scoring_cfg()

    matched, unmatched = {}, []
    by_position = {}
    for player_code, rows in grouped.items():
        name = extract_player_name(rows[0]["rungs"][0]["title"])
        board_p = name_idx.get(NI.normalize_name(name)) if name else None
        if not board_p:
            unmatched.append({"player_code": player_code, "parsed_name": name})
            continue
        stat_line = combine_stat_line(rows)
        season_pts = scoring.score_stat_line(stat_line, cfg)
        games = board_p.get("games_expected") or None
        per_game = round(season_pts / games, 2) if games else None
        pid = str(board_p["player_id"])
        pos = board_p.get("position")
        matched[pid] = {
            "name": board_p.get("name"), "position": pos,
            "player_code": player_code,
            "stats_available": sorted(stat_line),
            "implied_season_points": round(season_pts, 2),
            "games_expected": games,
            "implied_per_game_points": per_game,
        }
        by_position.setdefault(pos, 0)
        by_position[pos] += 1

    watch = series_watch(ladders_doc)

    doc = {
        "_territory": "TERRITORY: C — produced by draft/backtest/kalshi_implied_points.py",
        "_note": "Season-long implied fantasy points from Kalshi's live "
                 "threshold ladders (season_ladders_*.json, TERRITORY A, "
                 "reused read-only), crosswalked to sleeper_pid and scored "
                 "under this league's own table. `implied_per_game_points` "
                 "divides the season figure by the board's own "
                 "games_expected -- the closest honest weekly-rate reading "
                 "available until real per-game weekly markets are priced "
                 "(weekly_markets_*.json currently carries zero open "
                 "yardage/TD markets, all settled preseason as of this "
                 "capture; that changes as week 1 approaches, not never). "
                 "QB coverage is passing-yards-only (no season pass-TD/INT "
                 "ladder exists yet) and reads systematically low against a "
                 "real season -- a coverage gap, named, not an error.",
        "captured_at": ladders_doc.get("captured_at"),
        "population": {
            "kalshi_players": len(grouped),
            "matched": len(matched),
            "unmatched": len(unmatched),
            "match_rate_pct": round(100 * len(matched) / len(grouped), 1) if grouped else None,
            "matched_by_position": by_position,
        },
        "unmatched_players": unmatched,
        "series_watch": watch,
        "players": matched,
    }
    return doc


def series_watch(ladders_doc: dict) -> dict:
    """Diffs the capture's OWN reported series lists against this module's
    pinned baseline -- the mechanism "keep checking" needs, not a promise to
    remember. Run this on every fresh capture."""
    captured = set(ladders_doc.get("series_captured") or [])
    excluded_raw = ladders_doc.get("series_excluded") or {}
    excluded = set(excluded_raw)
    new_captured = sorted(captured - BASELINE_SERIES_CAPTURED)
    new_excluded = sorted(excluded - BASELINE_SERIES_EXCLUDED)
    ffpts_status = excluded_raw.get("KXNFLFFPTS")
    return {
        "new_series_now_captured": new_captured,
        "new_series_now_excluded": new_excluded,
        "ffpts_direct_ladder_status": ffpts_status if ffpts_status is not None
                                      else ("CAPTURED" if "KXNFLFFPTS" in captured else "unknown — check by hand"),
        "action_needed": bool(new_captured) or (
            ffpts_status is not None and "zero live events" not in str(ffpts_status)),
    }


#: One of Cory's own three keepers, verified present in the real 08-19
#: capture before writing this constant (rule 3e).
KNOWN_POSITIVE_NAME = "Ja'Marr Chase"


def verify_known_positive(doc: dict) -> dict:
    row = next((p for p in doc["players"].values() if p["name"] == KNOWN_POSITIVE_NAME), None)
    ok = row is not None and row["implied_season_points"] > 0
    return {"ok": ok, "checked": KNOWN_POSITIVE_NAME, "row": row}


def _rank(values: list) -> list:
    idx = sorted(range(len(values)), key=lambda i: values[i])
    r = [0.0] * len(values)
    for rank_i, i in enumerate(idx):
        r[i] = float(rank_i)
    return r


def _spearman(xs: list, ys: list) -> float | None:
    n = len(xs)
    if n < 3:
        return None
    rx, ry = _rank(xs), _rank(ys)
    mx, my = sum(rx) / n, sum(ry) / n
    cov = sum((rx[i] - mx) * (ry[i] - my) for i in range(n))
    sx = sum((rx[i] - mx) ** 2 for i in range(n)) ** 0.5
    sy = sum((ry[i] - my) ** 2 for i in range(n)) ** 0.5
    return round(cov / (sx * sy), 4) if sx and sy else None


def agreement_vs_board(doc: dict, board: dict) -> dict:
    """Spearman between `implied_per_game_points` and the board's own
    `proj_mean / games_expected` -- NOT a grade (no realized outcome exists
    yet, the season has not started), an immediate sanity signal that this
    pipeline is measuring something real rather than noise. The true grade
    is `grade_vs_realized()` below, once real weekly points exist."""
    board_by_pid = {str(p["player_id"]): p for p in
                    list(board.get("players") or []) + list(board.get("kept_players") or [])}
    xs, ys, n_pairs = [], [], 0
    for pid, row in doc["players"].items():
        bp = board_by_pid.get(pid)
        if not bp or not bp.get("games_expected") or row.get("implied_per_game_points") is None:
            continue
        board_per_game = (bp.get("proj_mean") or 0) / bp["games_expected"]
        xs.append(row["implied_per_game_points"])
        ys.append(board_per_game)
        n_pairs += 1
    return {"n": n_pairs, "spearman": _spearman(xs, ys)}


def grade_vs_realized(doc: dict, realized_weekly_store: dict, through_week: int = 17) -> dict:
    """THE REAL GRADE, stubbed and ready -- not run yet because the 2026
    season has not started and no realized weekly points exist. Once
    weekly_projection_archive.py or an in-season capture produces a
    `nflverse_weekly_points_2026.json`-shaped store, call this with it: it
    grades `implied_per_game_points` (a SEASON-derived rate, frozen at
    capture time) against each player's REALIZED per-game rate over the
    weeks actually played, the same season_totals/games shape every other
    grading harness in this repo already uses. A store with zero weeks
    returns n=0 rather than raising -- callable safely before week 1 exists,
    so this function can be wired into CI now and simply report nothing
    until there is something to report.
    """
    weeks = realized_weekly_store.get("weeks") or []
    totals: dict = {}
    games: dict = {}
    for w in weeks:
        if w.get("week", 0) > through_week:
            continue
        for pid, pts in (w.get("points") or {}).items():
            totals[pid] = totals.get(pid, 0.0) + pts
            games[pid] = games.get(pid, 0) + 1

    xs, ys, n_pairs = [], [], 0
    for pid, row in doc["players"].items():
        if pid not in totals or not games.get(pid) or row.get("implied_per_game_points") is None:
            continue
        realized_per_game = totals[pid] / games[pid]
        xs.append(row["implied_per_game_points"])
        ys.append(realized_per_game)
        n_pairs += 1
    return {"n": n_pairs, "spearman": _spearman(xs, ys),
           "status": "graded" if n_pairs >= 20 else "insufficient_population"}


def main() -> int:
    doc = build_store()
    control = verify_known_positive(doc)
    doc["known_positive_control"] = control
    if not control["ok"]:
        print(f"VOID -- known-positive control failed: {KNOWN_POSITIVE_NAME} "
             "not found or scored zero", file=sys.stderr)
        return 1
    if doc["population"]["matched"] < 50:
        print(f"VOID -- only {doc['population']['matched']} matched players, "
             "under the rule-3e floor of 50", file=sys.stderr)
        return 1
    board = json.loads(BOARD.read_text())
    doc["agreement_vs_board"] = agreement_vs_board(doc, board)
    doc["realized_grade"] = {
        "status": "not_yet_gradeable",
        "why": "2026 season has not started; grade_vs_realized() is wired "
              "and callable the moment a weekly realized-points store exists",
    }
    OUT.write_text(json.dumps(doc, indent=1))
    print(f"wrote {OUT.relative_to(ROOT)}: {doc['population']['matched']}/"
         f"{doc['population']['kalshi_players']} matched "
         f"({doc['population']['match_rate_pct']}%), "
         f"agreement_vs_board={doc['agreement_vs_board']}, "
         f"watch={doc['series_watch']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
