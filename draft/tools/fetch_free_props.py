#!/usr/bin/env python3
# TERRITORY: C (capture) — built by the relay 2026-09-02 under Cory's standing
# ruling ("We don't need odds api... we get free props") and his 09-02 order
# ("keep making model better... close more loops"). C owns it from here.
"""FREE WEEKLY PLAYER PROPS -> the props arm's input file. No key, no spend.

Writes draft/data/props/weekly_props_<season>_w<week>.json in EXACTLY the
contract `weekly_props_arm.py:load_props_arm` reads (`players[pid].points`),
the same file the paid Odds API fetch used to write — so the arm, the Tuesday
grader (props_weekly_v1) and A's props+pull blend (P357) run unchanged.

TWO FREE DOORS, MEASURED 2026-09-02 (`free_props_census_2026.json`, six
controlled runs):
  1. SLEEPER PICKS  GET https://api.sleeper.app/lines/available?sport=nfl
     `subject_id` IS the Sleeper player_id our pipeline runs on — no name
     crosswalk at all. `wager_type` is the stat (passing_yards, receptions,
     anytime_touchdowns ...), `options[].outcome_value` the line,
     `options[].payout_multiplier` each side's decimal price.
  2. UNDERDOG       GET https://api.underdogfantasy.com/beta/v5/over_under_lines
     broadest coverage (all 16 games) and the only door pricing the joint
     `Rush + Rec TDs` line. Needs the name crosswalk (`fetch_weekly_props.
     board_index/match_player`, team-filtered — the Bijan/Brian lesson).
WRITE FROM SLEEPER FIRST, FILL FROM UNDERDOG where Sleeper has no line for
that (player, market). A market quoted by both keeps Sleeper's line.

ONE CONVERTER. Every line becomes points through `fetch_weekly_props.
implied_points` — the same function the 2025 backtest and the paid path call
(register 467: two formulas sharing a name is how a backtest grades a cousin
of the thing that ships). Touchdown lines are quoted as a 0.5/1.5 over-under
with two prices, not as a yardage number: they are de-vigged and folded to
EXPECTED touchdowns (Poisson, `anytime_td_to_expected_tds`), delivered as
`player_anytime_td` -> `any_td`, for EVERY position — the converter's rule.
(Until 2026-09-02 this file stripped the line for QBs, citing "the backtest's
fold: RB/WR/TE only"; that was the backtest's HAND fold, retired by register
467 the day before this writer shipped. K6 in the harness measures what the
converter does for a QB: exactly one rush-TD's points per expected TD. Cory,
09-02: "Do it!" — applied by A in C's file, flagged.)

SELF-CHECKS / KNOWN-POSITIVE (Rule 3e — a writer that has never refused has
only been run): the file is NOT written unless
  • at least one QB carries a numeric passing-yards line from Sleeper Picks,
  • at least one player was priced from an Underdog fill,
  • at least 30 players were priced in total,
  • every priced row has a finite `points`.
A refusal exits 1 and writes nothing — a stale week says its own date, a
fabricated one lies. Every unmatched Underdog name is logged with its reason.

    python3 draft/tools/fetch_free_props.py [--season 2026 --week 1] [--dry-run]
CI-only for real fetches (the sandbox gateway 403s these hosts); the pure
functions are exercised offline by draft/tests/test_fetch_free_props.py.
"""
from __future__ import annotations

import argparse
import datetime as _dt
import json
import math
import os
import re
import sys
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(ROOT / "draft"))

from fetch_weekly_props import (  # noqa: E402
    MARKET_TO_STAT, board_index, match_player, implied_points, props_snapshot_path,
)
from fetch_historical_props import (  # noqa: E402
    american_to_prob, devig_pair, anytime_td_to_expected_tds,
)

FORMULA_VERSION = "props_weekly_v1+free_v1"
UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      "Accept": "application/json, text/plain, */*"}
SLEEPER_LINES = "https://api.sleeper.app/lines/available?sport=nfl"
SLEEPER_STATE = "https://api.sleeper.app/v1/state/nfl"
UNDERDOG_LINES = "https://api.underdogfantasy.com/beta/v5/over_under_lines"

#: Sleeper Picks wager_type -> the arm's market key. Only markets the arm
#: scores; anything else (first_touchdown, longest_reception) is ignored.
SLEEPER_WAGER_TO_MARKET = {
    "passing_yards": "player_pass_yds", "passing_touchdowns": "player_pass_tds",
    "interceptions": "player_pass_interceptions", "rushing_yards": "player_rush_yds",
    "rushing_touchdowns": "player_rush_tds", "receptions": "player_receptions",
    "receiving_yards": "player_reception_yds", "receiving_touchdowns": "player_reception_tds",
    "anytime_touchdowns": "player_anytime_td",
}
#: Underdog display_stat -> market key (game-week lines only; 'Season ...' skipped)
UNDERDOG_STAT_TO_MARKET = {
    "Pass Yards": "player_pass_yds", "Passing Yards": "player_pass_yds",
    "Pass TDs": "player_pass_tds", "Passing TDs": "player_pass_tds",
    "Interceptions": "player_pass_interceptions", "INTs Thrown": "player_pass_interceptions",
    "Rush Yards": "player_rush_yds", "Rushing Yards": "player_rush_yds",
    "Rush TDs": "player_rush_tds", "Receptions": "player_receptions",
    "Receiving Yards": "player_reception_yds", "Rec Yards": "player_reception_yds",
    "Receiving TDs": "player_reception_tds", "Rush + Rec TDs": "player_anytime_td",
}
TD_PRICE_MARKETS = {"player_anytime_td"}
TEAM_ALIAS = {"WSH": "WAS", "JAC": "JAX", "LA": "LAR", "OAK": "LV", "SD": "LAC"}


# ── price arithmetic (pure) ──────────────────────────────────────────────────

def decimal_to_prob(decimal_price) -> float | None:
    try:
        d = float(decimal_price)
    except (TypeError, ValueError):
        return None
    return 1.0 / d if d > 1.0 else None


def expected_tds_from_line(line: float, p_over_fair: float) -> float:
    """A TD over/under at 0.5 is P(>=1); at 1.5 it is P(>=2). Both become an
    EXPECTED count under the same Poisson the anytime-TD fold uses.
    P(>=2) = 1 - e^-L (1 + L): solved by bisection, monotone in L."""
    p = min(max(float(p_over_fair), 0.0), 0.999)
    if line < 1.0:
        return anytime_td_to_expected_tds(p)
    if line < 2.0:
        lo, hi = 0.0, 8.0
        for _ in range(60):
            mid = (lo + hi) / 2
            if 1.0 - math.exp(-mid) * (1.0 + mid) < p:
                lo = mid
            else:
                hi = mid
        return (lo + hi) / 2
    # 2.5+ lines are rare (elite RBs); P(>=3) — same solver, one more term
    lo, hi = 0.0, 10.0
    for _ in range(60):
        mid = (lo + hi) / 2
        if 1.0 - math.exp(-mid) * (1.0 + mid + mid * mid / 2.0) < p:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


def fair_over_prob(p_over_raw, p_under_raw) -> float | None:
    if p_over_raw is None:
        return None
    return devig_pair(p_over_raw, p_under_raw)


# ── door 1: Sleeper Picks (pure parse) ───────────────────────────────────────

def parse_sleeper_lines(rows: list) -> dict:
    """{pid: {market_key: value, ...}} for sport == 'nfl' only. Yardage/count
    markets carry the LINE; TD markets carry EXPECTED TDs from the de-vigged
    over price. Returns also per-pid meta (pos, team, game_id)."""
    out: dict = {}
    meta: dict = {}
    for r in rows or []:
        if str(r.get("sport") or "").lower() != "nfl":
            continue
        key = SLEEPER_WAGER_TO_MARKET.get(str(r.get("wager_type") or ""))
        if not key:
            continue
        opts = r.get("options") or []
        over = next((o for o in opts if str(o.get("outcome")) == "over"), None)
        under = next((o for o in opts if str(o.get("outcome")) == "under"), None)
        if not over or over.get("outcome_value") is None:
            continue
        pid = str(over.get("subject_id") or r.get("subject_id") or "")
        if not pid:
            continue
        line = float(over["outcome_value"])
        if key in TD_PRICE_MARKETS:
            p_fair = fair_over_prob(decimal_to_prob(over.get("payout_multiplier")),
                                    decimal_to_prob(under.get("payout_multiplier")) if under else None)
            if p_fair is None:
                continue
            val = expected_tds_from_line(line, p_fair)
        else:
            val = line
        out.setdefault(pid, {})[key] = val
        m = meta.setdefault(pid, {})
        m.setdefault("pos", over.get("subject_position"))
        m.setdefault("team", over.get("subject_team"))
        m.setdefault("game_id", over.get("game_id") or r.get("game_id"))
    return {"by_pid": out, "meta": meta}


# ── door 2: Underdog (pure parse) ────────────────────────────────────────────

def parse_underdog(doc: dict) -> dict:
    """[{name, home, away, markets:{market_key: value}}] for NFL game-week
    lines only. Season lines have no game and say 'Season' in their stat."""
    apps = {a.get("id"): a for a in (doc.get("appearances") or [])}
    games = {g.get("id"): g for g in (doc.get("games") or [])}
    by_name: dict = {}
    for ln in doc.get("over_under_lines") or []:
        ou = ln.get("over_under") or {}
        ast = ou.get("appearance_stat") or {}
        stat = ast.get("display_stat") or ""
        if "season" in stat.lower():
            continue
        key = UNDERDOG_STAT_TO_MARKET.get(stat)
        if not key:
            continue
        app = apps.get(ast.get("appearance_id")) or {}
        game = games.get(app.get("match_id")) or {}
        sport = str(game.get("sport_id") or app.get("sport_id") or "").upper()
        if not game or (sport and sport != "NFL"):
            continue
        opts = ln.get("options") or []
        higher = next((o for o in opts if str(o.get("choice")) == "higher"), None)
        lower = next((o for o in opts if str(o.get("choice")) == "lower"), None)
        name = ((higher or (opts[0] if opts else {})).get("selection_header") or ou.get("title") or "").strip()
        name = re.sub(r"\s+O/U$", "", name).strip()
        if not name or ln.get("stat_value") is None:
            continue
        line = float(ln["stat_value"])
        if key in TD_PRICE_MARKETS:
            p_over = american_to_prob(float(higher["american_price"])) if higher and higher.get("american_price") is not None else None
            p_under = american_to_prob(float(lower["american_price"])) if lower and lower.get("american_price") is not None else None
            p_fair = fair_over_prob(p_over, p_under)
            if p_fair is None:
                continue
            val = expected_tds_from_line(line, p_fair)
        else:
            val = line
        title = str(game.get("title") or "")              # "NE @ SEA"
        mm = re.match(r"\s*([A-Z]{2,3})\s*@\s*([A-Z]{2,3})", title)
        away, home = (mm.group(1), mm.group(2)) if mm else (None, None)
        row = by_name.setdefault(name, {"name": name, "home": TEAM_ALIAS.get(home, home),
                                        "away": TEAM_ALIAS.get(away, away), "markets": {}})
        row["markets"][key] = val
    return list(by_name.values())


# ── merge + price (pure) ─────────────────────────────────────────────────────

def _board_rows(board: dict) -> list:
    return list(board.get("players") or []) + list(board.get("kept_players") or [])


def build_week(sleeper_rows: list, underdog_doc: dict, board: dict, scoring_table: dict) -> dict:
    """players {pid: row}, unmatched [...], counts — the contract plus provenance counts."""
    rows = _board_rows(board)
    by_id = {str(p.get("player_id")): p for p in rows if p.get("player_id") is not None}
    idx = board_index(rows)

    sp = parse_sleeper_lines(sleeper_rows)
    market_points: dict = {pid: dict(m) for pid, m in sp["by_pid"].items()}
    source_of: dict = {pid: {k: "sleeper_picks" for k in m} for pid, m in sp["by_pid"].items()}
    meta = sp["meta"]

    unmatched: list = []
    ud_filled_players = 0
    for row in parse_underdog(underdog_doc):
        match, reason = match_player(row["name"], row["home"], row["away"], idx)
        if not match:
            unmatched.append({"name": row["name"], "reason": reason, "source": "underdog"})
            continue
        pid, team, pos, _board_name = match
        filled = False
        for k, v in row["markets"].items():
            if k not in market_points.get(pid, {}):
                market_points.setdefault(pid, {})[k] = v
                source_of.setdefault(pid, {})[k] = "underdog"
                filled = True
        if filled:
            ud_filled_players += 1
        m = meta.setdefault(pid, {})
        m.setdefault("pos", pos)
        m.setdefault("team", team)

    players: dict = {}
    for pid, mp in market_points.items():
        b = by_id.get(pid) or {}
        pos = b.get("position") or meta.get(pid, {}).get("pos")
        mp = dict(mp)
        # No position filter on the anytime line: the shared converter folds
        # it for every position (register 467); a QB's rushing scores count.
        if not mp:
            continue
        pts, stat_line = implied_points(mp, scoring_table)
        if pts is None or not math.isfinite(pts):
            continue
        players[pid] = {
            "name": b.get("name") or meta.get(pid, {}).get("name") or pid,
            "team": b.get("team") or meta.get(pid, {}).get("team"),
            "pos": pos,
            "points": pts,
            "stat_line": stat_line,
            "markets_used": sorted(mp),
            "lines": {k: round(float(v), 4) for k, v in mp.items()},
            "sources": source_of.get(pid, {}),
        }
    sleeper_qb_pass = sum(1 for pid, mp in sp["by_pid"].items()
                          if "player_pass_yds" in mp and (by_id.get(pid, {}).get("position") or meta.get(pid, {}).get("pos")) == "QB")
    return {"players": players, "unmatched": unmatched,
            "counts": {"sleeper_players": len(sp["by_pid"]), "underdog_filled_players": ud_filled_players,
                       "priced": len(players), "sleeper_qbs_with_pass_yds": sleeper_qb_pass,
                       "unmatched": len(unmatched)}}


SPREAD_TABLE = ROOT / "draft" / "data" / "props_residual_sd.json"


def load_spread_fits(path: Path = SPREAD_TABLE) -> dict:
    """The per-position `sd ≈ a + b·implied` fits props_spread.py measured
    (P355's feed). Empty when the table is absent or its controls failed —
    the caller then writes NO `sd`, never a zero."""
    try:
        doc = json.loads(Path(path).read_text())
    except (OSError, ValueError):
        return {}
    if not all(c.get("ok") for c in doc.get("controls", [])):
        return {}
    return doc.get("fits") or {}


def spread_sd(pos, implied, fits: dict):
    f = fits.get(pos) if pos else None
    if not f or implied is None:
        return None
    v = f["a"] + f["b"] * float(implied)
    return round(min(max(v, f["sd_min"]), f["sd_max"]), 2)


def stamp_spread(players: dict, fits: dict) -> int:
    """Attach `sd` to every priced player whose position has a fit. Returns
    the number stamped. K/DEF and unknown positions carry no `sd` and the
    solver keeps its own fallback there."""
    n = 0
    for row in players.values():
        sd = spread_sd(row.get("pos"), row.get("points"), fits)
        if sd is not None:
            row["sd"] = sd
            n += 1
    return n


def self_check(result: dict) -> list:
    """Known-positive controls. Empty list = write; otherwise the reasons."""
    c = result["counts"]
    bad = []
    if c["sleeper_qbs_with_pass_yds"] < 1:
        bad.append("no QB carries a numeric passing-yards line from Sleeper Picks")
    if c["underdog_filled_players"] < 1:
        bad.append("no player was priced from an Underdog fill")
    if c["priced"] < 30:
        bad.append(f"only {c['priced']} players priced (<30)")
    if any(not math.isfinite(float(r["points"])) for r in result["players"].values()):
        bad.append("a priced row has a non-finite points value")
    # THE CONTRACT (register 467): a row priced from an anytime-TD source
    # carries `any_td` in its stat line, whatever the position. A writer that
    # strips it for one position is two formulas under one name, and the file
    # is refused rather than written with the gap.
    stripped = [pid for pid, r in result["players"].items()
                if "player_anytime_td" in (r.get("sources") or {}) and "any_td" not in (r.get("stat_line") or {})
                and not any(k in (r.get("stat_line") or {}) for k in ("rush_td", "rec_td"))]
    if stripped:
        bad.append(f"{len(stripped)} row(s) have an anytime-TD source and no any_td in the stat line: {stripped[:5]}")
    return bad


def build_snapshot(result: dict, season: int, week: int, date: str) -> dict:
    return {
        "_territory": "TERRITORY: C — produced by draft/tools/fetch_free_props.py (free doors; built by the relay 2026-09-02)",
        "_note": ("OUR weekly player-prop-implied points for ONE week, priced from FREE "
                  "game-week lines (Sleeper Picks first, Underdog fill) under the league's "
                  "own scoring table through the ONE converter the backtest uses. A player "
                  "with NO quoted market that week is ABSENT from `players`, never a zero. "
                  "Consumed by draft/weekly_props_arm.py — contract: "
                  "draft/audit/weekly_props_study_2026-08-16.md."),
        "season": season, "week": week, "date": date, "formula": FORMULA_VERSION,
        "provenance": {
            "source": "free: sleeper_picks (Sleeper player ids, no crosswalk) + underdog (name crosswalk, team-filtered)",
            "ruling": "Cory 2026-09-01: no paid props, no Odds API (CLAUDE.md standing ruling)",
            "markets": sorted(set(SLEEPER_WAGER_TO_MARKET.values()) | set(UNDERDOG_STAT_TO_MARKET.values())),
            "td_fold": "0.5/1.5 TD over-unders de-vigged and folded to EXPECTED TDs (Poisson); every position (register 467, since 2026-09-02); any_td scored as rush_td unless a per-type TD line is quoted",
            "counts": result["counts"],
            "self_check": "passed",
        },
        "players": result["players"],
        "unmatched": result["unmatched"],
    }


def merge_with_existing(new_doc: dict, existing: dict | None) -> dict:
    """MERGE, NEVER CLOBBER (register 172's lesson, P299's cadence note). A
    player quoted in the new run gets the new row; a player who was priced
    earlier this week but is no longer quoted (his game kicked off, or the
    book pulled the line) KEEPS the earlier row, stamped `carried_from` with
    the date it was priced — so a Thursday refresh after a Wednesday opener
    cannot erase the opener's players, and a pre-kickoff line is never
    replaced by silence."""
    if not existing or existing.get("season") != new_doc.get("season") or existing.get("week") != new_doc.get("week"):
        return new_doc
    old_players = existing.get("players") or {}
    merged = dict(new_doc["players"])
    carried = 0
    for pid, row in old_players.items():
        if pid not in merged and row.get("points") is not None:
            r = dict(row)
            r.setdefault("carried_from", existing.get("date"))
            merged[pid] = r
            carried += 1
    out = dict(new_doc)                                   # never mutate the input
    out["players"] = merged
    prov = dict(new_doc.get("provenance") or {})
    prov["counts"] = {**(prov.get("counts") or {}), "carried_from_earlier_run": carried}
    prov["merge"] = "players no longer quoted keep their earlier row (carried_from); quoted players take the new line"
    out["provenance"] = prov
    return out


# ── IO ───────────────────────────────────────────────────────────────────────

def _get(url, headers=None, timeout=40):
    req = urllib.request.Request(url, headers={**UA, **(headers or {})})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8", "ignore"))


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--season", type=int, default=None)
    ap.add_argument("--week", type=int, default=None)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args(list(sys.argv[1:] if argv is None else argv))

    board_path = Path(os.environ.get("PROPS_WEEKLY_BOARD") or ROOT / "public" / "draft_data.json")
    out_dir = Path(os.environ.get("PROPS_WEEKLY_OUT_DIR") or ROOT / "draft" / "data" / "props")
    board = json.loads(board_path.read_text())
    from fetch_component_stats import frozen_scoring_table
    scoring_table = frozen_scoring_table()

    season, week = args.season, args.week
    if season is None or week is None:
        st = _get(SLEEPER_STATE)
        season = season or int(st.get("season"))
        week = week or int(st.get("week") or 0)
    if not (1 <= int(week) <= 18):
        print(f"! week {week} is not an in-season week — refusing (nothing written)")
        return 1

    sleeper_rows = _get(SLEEPER_LINES)
    underdog_doc = _get(UNDERDOG_LINES, headers={"Referer": "https://underdogfantasy.com/"})
    result = build_week(sleeper_rows if isinstance(sleeper_rows, list) else (sleeper_rows.get("lines") or []),
                        underdog_doc, board, scoring_table)
    print(f"free props {season} w{week}: {json.dumps(result['counts'])}")
    for u in result["unmatched"][:15]:
        print(f"  unmatched: {u['name']} — {u['reason']}")
    bad = self_check(result)
    if bad:
        print("🔴 SELF-CHECK REFUSED — nothing written:")
        for b in bad:
            print("   -", b)
        return 1
    doc = build_snapshot(result, int(season), int(week), _dt.date.today().isoformat())
    # PROPS_SNAPSHOT_SUFFIX="_sun" (the Sunday 15:30Z run) writes a SEPARATE
    # file for the closing-line grade (P289) and merges only against itself —
    # never the Thursday file the emission read (ROUTES relay → C, 09-02).
    suffix = os.environ.get("PROPS_SNAPSHOT_SUFFIX", "")
    if suffix and not re.fullmatch(r"_[a-z]{1,8}", suffix):
        print(f"! PROPS_SNAPSHOT_SUFFIX {suffix!r} is not _[a-z]{{1,8}} — refusing (nothing written)")
        return 1
    path = props_snapshot_path(out_dir, int(season), int(week), suffix)
    existing = None
    if path.exists():
        try:
            existing = json.loads(path.read_text())
        except ValueError:
            existing = None
    doc = merge_with_existing(doc, existing)
    print(f"merge: carried {doc['provenance']['counts'].get('carried_from_earlier_run', 0)} earlier-priced players; {len(doc['players'])} total")
    # P355's FEED: a per-player weekly sd from the measured residual table
    # (props_spread.py). Absent table or failed controls → no `sd` on any
    # row, and the solver keeps its per-position fallback; never a zero.
    fits = load_spread_fits()
    stamped = stamp_spread(doc["players"], fits)
    doc["provenance"]["spread"] = ({"source": str(SPREAD_TABLE.relative_to(ROOT)), "stamped": stamped, "of": len(doc["players"])}
                                   if fits else {"source": None, "stamped": 0, "why": "spread table absent or its controls failed"})
    print(f"spread: sd stamped on {stamped} of {len(doc['players'])} players")
    if args.dry_run:
        print(f"dry run — would write {path} ({len(doc['players'])} players)")
        return 0
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(doc, indent=1))
    print(f"wrote {path.relative_to(ROOT) if str(path).startswith(str(ROOT)) else path}: {len(doc['players'])} players")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
