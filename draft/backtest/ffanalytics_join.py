# TERRITORY: C
"""FFANALYTICS JOIN + CROSS-SOURCE DISPERSION — ROUTES.md 2026-08-19, "your part
is the join", then "the cross-source dispersion store, the bigger prize".

INPUT: `draft/data/ffanalytics_raw_projections.csv` (committed from Actions,
`.github/workflows/ffanalytics-probe.yml`, real 2026 season-total scrapes,
1358 rows / 66 columns). A's own measurement, taken as given rather than
re-derived: FantasyPros and Walterfootball are exactly ten rows per position —
a truncated leaderboard, not a projection set — and are EXCLUDED. That leaves
three real sources: CBS, ESPN, FFToday.

THE JOIN IS THE SAME CROSSWALK EVERY SIBLING MODULE USES AND TRUSTS —
`adp.build_index(sleeper_players)` + `adp.match_player(row, index)` (rule 11).
The CSV's own `id` column is NOT sleeper_id space (A measured: 14 of 531
distinct ids collide with a board sleeper_id, and that is coincidence, not a
join) — matching goes through name/position/team only, exactly like
`external_source_projections.py`'s FantasyPros arm.

RAW STAT LINES ONLY, NEVER `site_pts`. A provider's own point total encodes
that provider's league, not ours (`scoring.py`'s standing rule, `build_bundle.
py`: "always our scoring engine, never a provider's"). Every row is priced
through `scoring.score_stat_line()` against this league's own 44-key table.

THREE PRICING GAPS FOUND WHILE BUILDING THIS, NAMED RATHER THAN SILENTLY
GUESSED AROUND:

  1. FIELD-GOAL BANDS ARE NOT UNIFORMLY REPORTED. CBS and ESPN both carry a
     `fg_50`/`fg_50_att` made-from-50+ split; FFToday carries only aggregate
     `fg`/`fg_att` with no distance breakdown at all. Checked this league's
     own scoring weights before treating it as a problem: `fgm_0_19` through
     `fgm_40_49` are ALL 3.0 — the only real boundary is 50+ (5.0) vs
     everything else (3.0) — so a source WITH the 50+ split prices exactly,
     and FFToday's kicker rows are priced by treating every make as sub-50
     (the common case; a slight undercount, not a wrong sign), flagged
     `"approximated": ["fg_50_split"]` on the row rather than presented as
     exact.

  2. `dst_td` IS ONE UNDIFFERENTIATED NUMBER (often fractional — these are
     2026 PROJECTIONS, not box scores, so a non-integer expected-TD count is
     correct, not a data error). Checked before assuming it was safe to
     collapse: `def_td`, `def_st_td`, and `fum_rec_td` are ALL 6.0 in this
     league's table; only the zero-weighted variants (`st_td`, `def_kr_td`,
     `def_pr_td`, ...) differ, and this league does not use them. So pricing
     `dst_td` at the flat 6.0 `def_td` weight is exact for this table, not an
     approximation, regardless of which TD type ffanalytics' sources meant.

  3. POINTS-ALLOWED BANDS ARE PER-GAME; THE CSV CARRIES A SEASON VALUE. Priced
     from `dst_pts_allowed_g` where present, else `dst_pts_allowed / games`
     where both exist, bucketed with `fetch_component_stats.pts_allow_band()`
     (rule 11 — the SAME band function the realized DEF store uses, not a
     second copy) and applied for every game in `games`. That assumes one
     constant bucket for the whole season rather than real week-to-week
     variation — a real approximation, flagged `"approximated":
     ["pts_allow_band"]` on the row. No `games`/no points-allowed figure at
     all means the row is UNPRICED for this component, not zero-filled.

WHAT COUNTS AS "GOT THE ROW", same rule `external_source_projections.py` uses:
a row is JOINED only if `adp.match_player` returns a sleeper_id. Unmatched
rows are counted per source in `coverage`, never silently dropped.

THE DISPERSION STORE, per matched sleeper_id: `{mean, sd, n_sources, min, max,
by_source}` over PRICED points from however many of the three sources actually
covered that player. Fewer than two sources means no `sd` — ABSENT STAYS
ABSENT, never a fabricated single-source "spread" of zero. Sleeper's own board
`proj_mean` is NOT one of the three sources counted here (this store measures
external-source disagreement; DEFAULT per A's routing text stands regardless —
"nothing reaches `proj_mean` without Cory's ruling," which this module does
not touch).

Run: python3 draft/backtest/ffanalytics_join.py
Writes draft/backtest/ffanalytics_join.json.
"""
from __future__ import annotations

import csv
import sys
from pathlib import Path
from statistics import pstdev

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(HERE))

REAL_SOURCES = ("CBS", "ESPN", "FFToday")
RAW_CSV = ROOT / "data" / "ffanalytics_raw_projections.csv"
OUT = HERE / "ffanalytics_join.json"

# raw ffanalytics column -> (scoring key, unit multiplier). Applied directly;
# see the module docstring for the three columns priced separately (FG bands,
# dst_td, points-allowed banding) rather than through this flat table.
_DIRECT_MAP = {
    "pass_yds": "pass_yd", "pass_tds": "pass_td", "pass_int": "pass_int",
    "rush_yds": "rush_yd", "rush_tds": "rush_td",
    "rec": "rec", "rec_yds": "rec_yd", "rec_tds": "rec_td",
    "fumbles_lost": "fum_lost",
    "dst_sacks": "sack", "dst_int": "int", "dst_fum_rec": "fum_rec",
    "dst_safety": "safe",
}


def _num(v, default=0.0) -> float:
    try:
        if v is None or v == "" or v == "NA":
            return default
        return float(v)
    except (TypeError, ValueError):
        return default


def load_real_rows(csv_path: Path = RAW_CSV) -> list[dict]:
    """RAW rows from the three real sources only. Pure I/O, no join, no
    pricing — FantasyPros/Walterfootball are excluded here so every later
    stage never has to re-apply that filter."""
    with open(csv_path, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    return [r for r in rows if r.get("source") in REAL_SOURCES]


def join_rows(rows: list[dict], index: dict) -> tuple[list[dict], dict]:
    """Crosswalk RAW rows to sleeper_id via the shared ADP index (rule 11).
    Returns (joined, coverage) — `joined` carries every row with its
    sleeper_id attached; unmatched rows are dropped from `joined` but counted
    in `coverage`, never silently lost."""
    import adp as ADP

    joined = []
    coverage = {src: {"matched": 0, "unmatched": 0} for src in REAL_SOURCES}
    for r in rows:
        src = r.get("source")
        entry = {"name": r.get("player"), "position": r.get("pos"), "team": r.get("team")}
        pid, method = ADP.match_player(entry, index)
        if pid:
            coverage[src]["matched"] += 1
            joined.append({**r, "sleeper_id": pid, "match_method": method})
        else:
            coverage[src]["unmatched"] += 1
    return joined, coverage


def price_row(row: dict, scoring_cfg: dict) -> tuple[float, list[str]]:
    """One row's raw stat line -> (points, approximated_fields). PURE —
    no I/O, fixture-testable against literal column values."""
    approximated: list[str] = []
    stat_line: dict[str, float] = {}

    for col, key in _DIRECT_MAP.items():
        if col in row and row[col] not in (None, "", "NA"):
            stat_line[key] = stat_line.get(key, 0.0) + _num(row[col])

    # extra points: made at xpm, missed = attempts - made at xpmiss
    xp_made = _num(row.get("xp"), None) if row.get("xp") not in (None, "", "NA") else None
    if xp_made is not None:
        stat_line["xpm"] = stat_line.get("xpm", 0.0) + xp_made
        xp_att = row.get("xp_att")
        if xp_att not in (None, "", "NA"):
            stat_line["xpmiss"] = stat_line.get("xpmiss", 0.0) + max(0.0, _num(xp_att) - xp_made)

    # field goals: only the 50+ boundary matters for this scoring table
    # (fgm_0_19..fgm_40_49 are all 3.0) — see docstring gap (1).
    fg_made_total = row.get("fg")
    if fg_made_total not in (None, "", "NA"):
        total = _num(fg_made_total)
        fg50 = None
        for col in ("fg_50", "fg_50_att"):
            v = row.get(col)
            # `fg_50_att` is an ATTEMPTS column on some sources' schema — only
            # trust it as a MAKES figure via the dedicated `fg_50` column.
            if col == "fg_50" and v not in (None, "", "NA"):
                fg50 = _num(v)
                break
        if fg50 is not None:
            under50 = max(0.0, total - fg50)
            stat_line["fgm_50p"] = stat_line.get("fgm_50p", 0.0) + fg50
            stat_line["fgm_20_29"] = stat_line.get("fgm_20_29", 0.0) + under50
        else:
            stat_line["fgm_20_29"] = stat_line.get("fgm_20_29", 0.0) + total
            approximated.append("fg_50_split")

    # dst_td: one undifferentiated number, priced at the flat def_td weight —
    # see docstring gap (2), why that is exact for this league's table.
    dst_td = row.get("dst_td")
    if dst_td not in (None, "", "NA"):
        stat_line["def_td"] = stat_line.get("def_td", 0.0) + _num(dst_td)

    # points allowed: per-game bucket applied across `games` — gap (3).
    games = row.get("games")
    games_n = _num(games, None) if games not in (None, "", "NA") else None
    per_game = row.get("dst_pts_allowed_g")
    if per_game in (None, "", "NA"):
        season_total = row.get("dst_pts_allowed")
        if season_total not in (None, "", "NA") and games_n:
            per_game = _num(season_total) / games_n
        else:
            per_game = None
    else:
        per_game = _num(per_game)
    if per_game is not None and games_n:
        import fetch_component_stats as FCS
        band = FCS.pts_allow_band(round(per_game))
        stat_line[band] = stat_line.get(band, 0.0) + games_n
        approximated.append("pts_allow_band")

    import scoring as SC
    points = SC.score_stat_line(stat_line, scoring_cfg)
    return points, approximated


def build_from(real_rows: list[dict], index: dict, scoring_cfg: dict) -> dict:
    """PURE assembly — join + price + dispersion. Fixture-testable; `build()`
    below is the only egress-touching wrapper (Sleeper player DB)."""
    joined, coverage = join_rows(real_rows, index)

    by_player: dict[str, dict] = {}
    for row in joined:
        pid = row["sleeper_id"]
        points, approximated = price_row(row, scoring_cfg)
        by_player.setdefault(pid, {})[row["source"]] = {
            "points": round(points, 2), "approximated": approximated,
            "name": row.get("player"), "pos": row.get("pos"),
        }

    dispersion: dict[str, dict] = {}
    for pid, by_source in by_player.items():
        vals = [v["points"] for v in by_source.values()]
        n = len(vals)
        entry = {"n_sources": n, "by_source": {s: v["points"] for s, v in by_source.items()},
                 "name": next(iter(by_source.values()))["name"],
                 "pos": next(iter(by_source.values()))["pos"]}
        if n >= 2:
            entry["mean"] = round(sum(vals) / n, 2)
            entry["sd"] = round(pstdev(vals), 2)
            entry["min"] = round(min(vals), 2)
            entry["max"] = round(max(vals), 2)
        else:
            entry["mean"] = round(vals[0], 2)
            entry["sd"] = None
            entry["min"] = entry["max"] = round(vals[0], 2)
        dispersion[pid] = entry

    return {
        "_territory": "TERRITORY: C — produced by draft/backtest/ffanalytics_join.py",
        "_note": ("Raw ffanalytics rows (CBS/ESPN/FFToday only — FantasyPros/"
                 "Walterfootball are truncated top-10 lists, excluded) joined "
                 "to sleeper_id via adp.build_index/match_player (rule 11), "
                 "priced through this league's own scoring table (never "
                 "site_pts). Per player: points by source, mean/sd/min/max — "
                 "sd is None below 2 sources, never a fabricated zero."),
        "sources": list(REAL_SOURCES),
        "coverage": coverage,
        "player_count": len(dispersion),
        "two_plus_source_count": sum(1 for v in dispersion.values() if v["n_sources"] >= 2),
        "players": dispersion,
    }


def build() -> dict:  # pragma: no cover  (egress: Sleeper player DB, CI only)
    import adp as ADP
    import sleeper_import as SL
    import fetch_component_stats as FCS

    real_rows = load_real_rows()
    index = ADP.build_index(SL.fetch_players())
    scoring_cfg = FCS.frozen_scoring_table()
    return build_from(real_rows, index, scoring_cfg)


def main() -> None:  # pragma: no cover  (egress; CI only)
    doc = build()
    OUT.write_text(__import__("json").dumps(doc, indent=1, sort_keys=True))
    print(f"wrote {OUT.name}: {doc['player_count']} players joined, "
         f"{doc['two_plus_source_count']} with 2+ sources")
    for src, c in doc["coverage"].items():
        print(f"  {src}: matched {c['matched']}, unmatched {c['unmatched']}")


if __name__ == "__main__":
    main()
