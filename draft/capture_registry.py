# TERRITORY: A
"""WHAT EVERY CAPTURE KEEPS, WHAT IT DROPS, AND WHY — enforced, not documented.

Cory, 2026-08-17: *"Nothing in here about getting all fantasy pros data that we
can and retaining? Also fixing all these things for future pulls?"*

The second half is the important one. `data_holes_2026-08-17.md` found FIVE
instances of the same defect in one day — FantasyPros rows computed and thrown
away, `proj_series` storing a bare float, `rz_share` consumed and never
persisted, the Sleeper verdict printed to a log, `proj_ceiling_for` shipped and
never called. A list of five one-time fixes does not stop the sixth.

**So this is the gate, modelled on the one that already works.**
`season_stamp.BOARD_FIELD_SOURCES` makes an unclassified board field a test
failure, and it caught the draft-capital column the same morning it was added —
proof the shape is right. This does the same job one layer up, for CAPTURES:

    a capture must DECLARE what it retains, what it knowingly drops, and
    whether it keeps the raw payload — and the declaration is CHECKED against
    the code and the config rather than believed.

THE CHECK THAT MATTERS MOST is `fantasypros.unreachable_scored_keys`. It is
computed from `_FP_STAT_MAP` against the live scoring table, so if anyone adds
a scoring category, or FantasyPros starts serving a stat we do not map, the
test fails and someone has to decide. That is the difference between a comment
that goes stale and a gate that does not.

RAW PAYLOAD RETENTION IS THE OTHER HALF, and it is the cheaper insurance. A
parser is a whitelist; every whitelist loses whatever nobody anticipated.
Keeping the response means a question asked in 2027 can be answered by
RE-PARSING rather than RE-FETCHING — and re-fetching a preseason projection is
exactly what leaks (exp33), so for some sources it is the difference between an
answer and no answer.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent

#: A capture whose `raw_retained` is False must carry a reason. "We only parse
#: what we need" is NOT a reason — that is the defect this registry exists for.
CAPTURES: dict[str, dict] = {
    "fantasypros_adp": {
        "module": "draft/backtest/fantasypros_adp.py",
        "parser": "parse_adp",
        "retains": ["name", "position", "team", "adp"],
        "knowingly_drops": {
            "rank_min / rank_max / rank_std": (
                "expert RANK DISPERSION per player — a genuine per-player "
                "uncertainty signal, in a response we already pay for. Dropped "
                "today; queued for capture (data_completeness_plan §3 phase 2 "
                "item 8). It is NOT an outcome ceiling and must not be used as "
                "one — it measures how much experts disagree about where to "
                "draft him, not how big his season can be."),
        },
        "raw_retained": True,
        "raw_why_not": None,
        "fixed": ("2026-08-17 — the fetcher ALREADY returned the raw text; the "
                  "caller threw it away. raw_capture.retain now persists it "
                  "with as_of + applies_to, so a 2027 question is answered by "
                  "RE-PARSING rather than RE-FETCHING (which leaks)."),
    },
    "fantasypros_projections": {
        "module": "draft/backtest/fantasypros_adp.py",
        "parser": "parse_projections",
        "retains": ["name", "position", "team", "stats", "fp_fpts"],
        "knowingly_drops": {
            "any stat key outside _FP_STAT_MAP": (
                "the parser's own docstring says 'unknown stat keys are "
                "dropped', silently. The map is a 12-entry whitelist, so a "
                "stat FantasyPros starts serving tomorrow vanishes without a "
                "trace. `unreachable_scored_keys` below is the measured cost."),
        },
        "raw_retained": True,
        "raw_why_not": None,
        "fixed": ("2026-08-17 — same fix as fantasypros_adp: the bytes are kept "
                  "verbatim, so a stat outside the 13-entry _FP_STAT_MAP is "
                  "recoverable by re-parsing instead of lost forever."),
        "scoring_note": (
            "fp_fpts is FP's number in FP's scoring and is NEVER the value; "
            "`stats` is re-scored through our table (score_stat_line), which is "
            "what makes the column league-normalised."),
    },
    "sleeper_projections": {
        "module": "draft/sleeper_import.py",
        "parser": "fetch_projections",
        "retains": ["full stat line per player"],
        "knowingly_drops": {},
        "raw_retained": True,
        "raw_why_not": None,
        "scoring_note": (
            "Sleeper serves STAT LINES; baseline_from_projections re-scores "
            "them through cfg['scoring']. We never take a provider's points."),
    },
    "proj_series": {
        "module": "draft/proj_series.py",
        "parser": "append_snapshot",
        "retains": ["proj", "situation", "n_offered", "date", "source", "week"],
        "knowingly_drops": {},
        "raw_retained": True,
        "raw_why_not": None,
        "fixed": "2026-08-17 — was a bare float per player until then",
    },
    "adp_series": {
        "module": "draft/adp_series.py",
        "parser": "append_snapshot",
        "retains": ["adp", "situation", "n_offered", "date"],
        "knowingly_drops": {},
        "raw_retained": True,
        "raw_why_not": None,
        "fixed": ("2026-08-17 — was a bare float for 300 players; shares "
                  "proj_series.SITUATION_FIELDS so the two cannot drift"),
    },
    "roster_state": {
        "module": "draft/roster_state.py",
        "parser": "capture",
        "retains": ["injury_status", "depth_chart_order", "team",
                    "years_exp", "adp", "position"],
        "knowingly_drops": {},
        "raw_retained": True,
        "raw_why_not": None,
        "added": ("2026-08-17 — closes the refusal that VAR_BACKUP and "
                  "VAR_INJURED were UNMEASURABLE on 2021-2025 (not measured and "
                  "small — unmeasurable). Weekly, because the signal these "
                  "fields carry is CHANGE and a season snapshot loses every "
                  "transition. Nothing recovers a past season's roster state."),
    },
    "opportunity_metrics": {
        "module": "draft/projections.py",
        "parser": "opportunity_metrics",
        "retains": ["target_share", "wopr", "opportunity_share",
                    "air_yards_share", "adot", "rz_share", "rz_targets",
                    "carries", "gl_carries"],
        "knowingly_drops": {
            "snap_share": (
                "STILL NOT ON THE BOARD, but no longer a data gap — the source "
                "was pulled 2026-08-17 (see the `snap_counts` capture). What "
                "remains is a WIRING gap: nothing joins snap share onto a board "
                "row yet, deliberately, because a new input wired live five days "
                "before the draft is a worse instrument than a known one. Filed "
                "as the narrower thing it now is."),
            "xfp_delta": (
                "NOT COMPUTED ANYWHERE — the docstring promised it and the "
                "function never produced it; the contract was corrected "
                "2026-08-17 rather than the field invented. Expected fantasy "
                "points from opportunity needs a per-opportunity value model we "
                "have not built. A real gap, filed as one."),
        },
        "raw_retained": True,
        "raw_why_not": None,
        "fixed": ("2026-08-17 — six of nine computed fields were dropped at the "
                  "board's edge; rz_share among them, which is why "
                  "opportunity_inheritance reported red-zone vacancy as "
                  "unmeasurable when it had in fact been measured"),
    },
    "snap_counts": {
        "module": "draft/backtest/fetch_snap_counts.py",
        "parser": "build_season",
        "retains": ["snaps", "pct", "share_volatility"],
        "knowingly_drops": {
            "defense_snaps / st_snaps": (
                "DEFENSIVE AND SPECIAL-TEAMS snap counts, served in the same "
                "response. Dropped because this is a 0.5-PPR offensive-skill "
                "league and neither contributes to a skill player's scoring. "
                "The RAW payload is retained, so if K/DEF modelling ever wants "
                "them the answer is a re-parse rather than a re-fetch."),
        },
        "raw_retained": True,
        "raw_why_not": None,
        "added": ("2026-08-17 — THE FIRST PER-PLAYER DISPERSION SIGNAL ON THIS "
                  "BOARD. Every existing one (proj_ceiling, proj_floor, "
                  "proj_sd, weekly_sd) is proj_mean x a per-band constant, i.e. "
                  "Spearman 1.0000 against the projection and therefore exactly "
                  "zero player-specific information. That single fact is the "
                  "common cause of three dead ends: `ceiling` measuring "
                  "collinear with `value` and getting zeroed, the phase grid "
                  "being able to discover only that double-counting the "
                  "projection is bad, and the variance modifiers coming back "
                  "unmeasurable. 35,869 skill player-weeks, 2021-2025. "
                  "MEASURED, NOT ASSUMED: within a fixed mean_pct band sd_pct "
                  "spans 8x (p10 0.022 to p90 0.186) in an interpretable "
                  "inverted-U, and year-over-year carryover clears a 400-draw "
                  "permutation null in 4 of 4 transitions (rho +0.19 to +0.33). "
                  "READ THAT AS WEAK-BUT-REAL: rho ~0.19 explains a small slice "
                  "of next year's volatility and must not be weighted as though "
                  "it were strong."),
    },
}


def fp_stat_map() -> dict:
    """Read `_FP_STAT_MAP` from the source rather than importing it, so this
    registry does not depend on the fetcher's egress-only imports."""
    src = (HERE / "backtest" / "fantasypros_adp.py").read_text()
    body = re.search(r"_FP_STAT_MAP = \{(.*?)\n\}", src, re.S)
    if not body:
        return {}
    return dict(re.findall(r'"([a-z0-9_]+)":\s*"([a-z0-9_]+)"', body.group(1)))


def priced_categories(cfg_path: Path | None = None) -> set:
    cfg = json.loads((cfg_path or HERE / "config" / "league_config.json").read_text())
    return {k for k, v in (cfg.get("scoring") or {}).items() if v}


def unreachable_scored_keys(cfg_path: Path | None = None) -> list:
    """Priced categories FantasyPros CANNOT populate — computed, never asserted.

    This is the honest answer to "are we sure it's all normalised to our 6-point
    passing TD, 0.5 PPR league?". The SCORING is ours on both columns. The
    INPUTS are not equal: Sleeper serves a full stat line, FP serves whatever
    the 12-entry map catches, so any category outside it contributes zero to the
    FP column and the two are not measuring the same player.
    """
    return sorted(priced_categories(cfg_path) - set(fp_stat_map().values()))


def audit(cfg_path: Path | None = None) -> dict:
    """Everything a reader needs to see the state of capture completeness."""
    unreachable = unreachable_scored_keys(cfg_path)
    # The subset that actually bites a skill player. K/DEF are already known to
    # be Sleeper-only by necessity (FP's feed does not cover them), so their
    # categories are an expected absence rather than a silent loss.
    skill_biting = [k for k in unreachable
                    if k.endswith("_2pt")]
    return {
        "captures": CAPTURES,
        "raw_retained": {k: v["raw_retained"] for k, v in CAPTURES.items()},
        "captures_missing_raw": sorted(k for k, v in CAPTURES.items()
                                       if not v["raw_retained"]),
        "fp_map_size": len(fp_stat_map()),
        "fp_reachable_scored_keys": sorted(set(fp_stat_map().values())),
        "unreachable_scored_keys": unreachable,
        "unreachable_biting_skill_positions": skill_biting,
        "_note": ("A capture with raw_retained False is a DEFECT with a queue "
                  "position, never a settled design. A parser is a whitelist "
                  "and every whitelist loses what nobody anticipated; keeping "
                  "the response means a 2027 question can be answered by "
                  "RE-PARSING rather than RE-FETCHING, and re-fetching a "
                  "preseason projection is exactly what leaks."),
    }
