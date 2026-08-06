"""Module 1 — scoring engine.

Fantasy points are always recomputed from raw stat lines using the league's own
scoring table. A provider's precomputed points are never trusted: they encode
*that provider's* league, not ours.

Sleeper uses the same key vocabulary for scoring settings and for stat lines
(`pass_yd`, `rec`, `bonus_rush_yd_100`, ...), so scoring is a dot product over
shared keys. That is deliberate — it means new scoring categories a league
invents are supported with no code change.
"""
from __future__ import annotations

# Keys that appear in stat feeds but are descriptive, not scoreable. Excluded so
# a typo in a scoring table can't silently multiply, say, games played.
NON_SCORING_KEYS = {
    "gp", "gms_active", "gs", "tm_def_snp", "tm_off_snp", "tm_st_snp",
    "off_snp", "def_snp", "st_snp", "snp_pct", "team", "player_id", "pos",
}


def score_stat_line(stats: dict, scoring: dict, *, strict: bool = False) -> float:
    """Fantasy points for one stat line under one scoring table.

    stats:   {stat_key: value} — a week or a season
    scoring: {stat_key: points_per_unit} from league_config['scoring']
    strict:  raise on a scoring key the stat line never provides (used by tests
             to catch config typos; off in production so a missing optional
             stat like `bonus_rec_te` doesn't break a build)
    """
    total = 0.0
    for key, per_unit in scoring.items():
        if key in NON_SCORING_KEYS:
            continue
        if key not in stats:
            if strict:
                raise KeyError(f"scoring key {key!r} absent from stat line")
            continue
        value = stats.get(key)
        if value is None:
            continue
        total += float(value) * float(per_unit)
    return round(total, 2)


def score_many(rows: dict[str, dict], scoring: dict) -> dict[str, float]:
    """{player_id: stat_line} -> {player_id: fantasy_points}."""
    return {pid: score_stat_line(line, scoring) for pid, line in rows.items()}


def per_game(points: float, games: float) -> float:
    return round(points / games, 2) if games else 0.0


# --- half-PPR reference table -------------------------------------------------
# Only used as a fallback when a league config has not been imported yet, and by
# the acceptance tests. Real runs always use the imported league scoring.
HALF_PPR_REFERENCE = {
    "pass_yd": 0.04,      # 25 yards = 1 point
    "pass_td": 4.0,
    "pass_int": -2.0,
    "pass_2pt": 2.0,
    "rush_yd": 0.1,
    "rush_td": 6.0,
    "rush_2pt": 2.0,
    "rec": 0.5,           # half PPR
    "rec_yd": 0.1,
    "rec_td": 6.0,
    "rec_2pt": 2.0,
    "fum_lost": -2.0,
    "st_td": 6.0,
    "def_td": 6.0,
}
