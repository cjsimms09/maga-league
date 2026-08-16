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


# --- DEF projection vocabulary normalization ----------------------------------
#
# Sleeper's PROJECTION rows for team defenses speak in TD *components* while its
# REALIZED rows (and the league's scoring table) speak in *aggregates*. Measured
# across ALL 32 DEF projection rows on 2026-08-16 (the committed raw capture:
# draft/audit/proj_correctness_evidence_2026-08-16.json — key census):
#
#     projection vocabulary          rows    realized/priced aggregate
#     def_fum_td  (fumble-return TD)   1     def_td     (league pays 6.0)
#     pass_int_td (pick-six)           4     def_td     (league pays 6.0)
#     def_kr_td   (DST kick-return TD) 4     def_st_td  (league pays 6.0)
#     pr_td       (DST punt-return TD) 5     def_st_td  (league pays 6.0)
#     def_td / def_int_td / def_st_td  0     — the aggregates NEVER appear
#
# Realized rows carry the aggregates (rule12_statlines.json, LAR 2025 prior
# season: def_td 1.0, def_st_td 1.0 — no component keys), and the league's own
# Sleeper scoring table prices the aggregates (def_td 6.0, def_st_td 6.0) while
# zeroing the component duplicates (def_kr_td/def_pr_td 0.0 — that is how a
# Sleeper league avoids double-paying an event that fires both keys, NOT a
# decision that return TDs are worthless; def_st_td at 6.0 is the payment).
# So `score_stat_line`, which correctly skips keys the table does not price,
# silently scored every projected defensive TD at zero — DECISIONS-NEEDED #0,
# fixed 2026-08-16 under Cory's ruling: "Don't agree with timelines we fix now".
#
# THE TRAP THE ORIGINAL FINDING NAMED, honored here: components SUM into their
# aggregate only when the provider did not send the aggregate itself; when an
# aggregate arrives it WINS outright and the components are dropped rather than
# double-counted (first-writer-wins alias discipline — C's pass_int class).
#
# DEF ROWS ONLY. Individual returners' projection rows carry def_kr_td/pr_td
# too (measured: 1 RB + 2 WR rows in the same capture) and the league prices an
# individual special-teams TD at st_td 0.0 — normalizing those rows would
# invent points. Callers gate on the row being a team defense (Sleeper keys
# DSTs by team code, never a numeric id).
DEF_PROJ_TD_ALIASES = {
    "def_fum_td": "def_td", "def_int_td": "def_td", "pass_int_td": "def_td",
    "def_kr_td": "def_st_td", "def_pr_td": "def_st_td",
    "kr_td": "def_st_td", "pr_td": "def_st_td",
}


def normalize_def_stat_line(stats: dict) -> dict:
    """A NEW stat line with projection TD components folded into the aggregates
    the league prices. Rows without component keys pass through unchanged."""
    if not isinstance(stats, dict) or not any(k in stats for k in DEF_PROJ_TD_ALIASES):
        return stats
    out = dict(stats)
    sums: dict[str, float] = {}
    for comp, agg in DEF_PROJ_TD_ALIASES.items():
        v = out.pop(comp, None)
        if v is None:
            continue
        if agg in stats:
            continue  # aggregate arrived from the provider: it wins, component dropped
        sums[agg] = sums.get(agg, 0.0) + float(v)
    for agg, v in sums.items():
        out[agg] = v
    return out


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
