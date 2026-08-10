#!/usr/bin/env python3
"""PROPS -> FANTASY POINTS, under OUR scoring. The market layer's foundation.

A receiving-yards prop is not a fantasy projection; it is a raw stat line. Without
conversion under our exact scoring every measured "gap" is a units mismatch wearing
the costume of a disagreement, and the whole dataset is noise that looks like
signal. So this exists BEFORE any gap is computed.

ONE SCORING ENGINE. This delegates to `draft/scoring.py:score_stat_line`, read from
`league_config.json`, exactly as the pipeline and the backtests do. A second
implementation of half-PPR here would be the twelfth instance of the disease.

═══ THE COVERAGE PROBLEM, WHICH IS BIGGER THAN THE UNITS PROBLEM ═══

The four props that map to our scoring — passing yards, rushing yards, receiving
yards, receptions — cover YARDAGE AND CATCHES ONLY. They carry no touchdowns, and
touchdowns are six points each. Measured against representative season lines under
this league's scoring:

    WR1   231.5 total   177.5 from props   23.3% UNCOVERED
    RB1   247.0 total   175.0 from props   29.1% UNCOVERED
    QB1   387.0 total   203.0 from props   47.5% UNCOVERED

So a "market projection" built from these props is not low — it is INCOMPLETE, and
incomplete by a different amount at every position. Comparing it against our FULL
projection would produce a large negative gap on every player, worst at QB, and
that gap would be an artifact of coverage rather than a disagreement about the
player. It would look exactly like a finding.

THE RULE THIS IMPOSES: a market-vs-model gap is only meaningful COMPONENT-MATCHED
— our projection restricted to the same stat keys the props actually priced. So
every conversion returns the KEYS IT COVERED, and `gap_vs_model` refuses to compare
against anything else. Rule 11's third visible property, applicability: is this the
right data for this use.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

_DRAFT = Path(__file__).resolve().parent.parent
if str(_DRAFT) not in sys.path:
    sys.path.insert(0, str(_DRAFT))

import scoring as SCORING                                    # noqa: E402

CONFIG = _DRAFT / "config" / "league_config.json"

# The Odds API market key -> our scoring stat key. FOUR, deliberately: these are
# the ones that map. A market we cannot convert is not captured as zero, it is
# simply not part of the covered component.
PROP_TO_STAT = {
    "player_pass_yds": "pass_yd",
    "player_rush_yds": "rush_yd",
    "player_reception_yds": "rec_yd",
    "player_receptions": "rec",
}


def league_scoring(cfg_path=None) -> dict:
    return json.loads(Path(cfg_path or CONFIG).read_text())["scoring"]


def props_to_stat_line(props: dict) -> tuple:
    """{market_key: line} -> ({stat_key: value}, covered_keys, unknown_markets).

    An unrecognised market is RETURNED as unknown rather than dropped. Silently
    ignoring it would let the covered fraction quietly shrink while the number
    kept looking like a projection.
    """
    line, covered, unknown = {}, [], []
    for market, value in (props or {}).items():
        stat = PROP_TO_STAT.get(market)
        if stat is None:
            unknown.append(market)
            continue
        if value is None:
            continue                    # absent is not zero; simply not covered
        line[stat] = float(value)
        covered.append(stat)
    return line, sorted(set(covered)), sorted(set(unknown))


def convert(props: dict, scoring_table=None) -> dict:
    """Props -> fantasy points under OUR scoring, with its coverage declared."""
    sc = scoring_table if scoring_table is not None else league_scoring()
    line, covered, unknown = props_to_stat_line(props)
    return {
        "points": SCORING.score_stat_line(line, sc),
        "stat_line": line,
        "covered_stats": covered,
        "unknown_markets": unknown,
        # The caller cannot claim this is a projection; it is a COMPONENT.
        "is_partial": True,
    }


def model_component(projection_stats: dict, covered: list, scoring_table=None) -> float:
    """OUR projection, restricted to the same stat keys the props priced.

    This is the only honest counterpart to `convert`. Comparing a props-derived
    number against a full projection measures coverage, not disagreement.
    """
    sc = scoring_table if scoring_table is not None else league_scoring()
    subset = {k: v for k, v in (projection_stats or {}).items() if k in set(covered)}
    return SCORING.score_stat_line(subset, sc)


def gap_vs_model(props: dict, projection_stats: dict, scoring_table=None) -> dict:
    """Signal A, component-matched, or a refusal that says why.

    Returns `comparable: False` when there is nothing legitimately comparable —
    no covered stats, or our projection missing the stats the market priced. A
    refusal is the correct output there: a gap computed against a missing
    component would be a large confident number meaning nothing.
    """
    sc = scoring_table if scoring_table is not None else league_scoring()
    conv = convert(props, sc)
    covered = conv["covered_stats"]
    if not covered:
        return {"comparable": False, "why": "no prop mapped to a scoring stat",
                "market_points": None, "model_points": None}
    missing = [k for k in covered if k not in (projection_stats or {})]
    if missing:
        return {"comparable": False,
                "why": "our projection lacks the stats the market priced: " + ",".join(missing),
                "market_points": conv["points"], "model_points": None}
    model = model_component(projection_stats, covered, sc)
    gap = round(conv["points"] - model, 2)
    return {
        "comparable": True,
        "market_points": conv["points"],
        "model_points": model,
        "gap_points": gap,
        # Percentage difference, as the brief asks — but guarded, because a model
        # component of zero makes a percentage meaningless rather than infinite.
        "gap_pct": (round(gap / model * 100, 1) if model else None),
        "covered_stats": covered,
        "component_matched": True,
    }
