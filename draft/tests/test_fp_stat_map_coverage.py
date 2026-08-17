"""The FP parser must cover every PRICED skill category, or the comparison lies.

Cory, 2026-08-17: "and we made sure fantasy pros projections were for our league
scoring before comparing?"

They were scored under our table — but _FP_STAT_MAP covered 9 of 32 priced
categories. Eighteen gaps were K/DEF and irrelevant to a QB/RB/WR/TE grade; FIVE
were skill categories Sleeper's payload carried and FP's did not. So every FP
skill player was scored light and Sleeper was not, in a head-to-head that
reported Sleeper winning 3 of 4 positions.

A parser is a whitelist and every whitelist loses what nobody anticipated. A
dropped key looks exactly like a zero, which is why nothing failed.
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "draft" / "backtest"))
sys.path.insert(0, str(ROOT / "draft"))

import fantasypros_adp as FP  # noqa: E402

# Categories a QB/RB/WR/TE can actually accrue. K/DEF are excluded deliberately:
# FP's projection feed does not carry them and no skill grade reads them.
SKILL = {
    "pass_yd", "pass_td", "pass_int", "pass_2pt",
    "rush_yd", "rush_td", "rush_att", "rush_2pt",
    "rec", "rec_yd", "rec_td", "rec_2pt",
    "fum_lost", "fum_rec", "fum_rec_td",
}


def priced():
    scoring = json.loads((ROOT / "draft" / "config" / "league_config.json").read_text())["scoring"]
    return {k for k, v in scoring.items() if v}


def test_every_priced_skill_category_is_parsed_from_fp():
    missing = sorted((SKILL & priced()) - set(FP._FP_STAT_MAP.values()))
    assert not missing, (
        "FP projections drop priced skill categories, so FP players score light "
        "against Sleeper and any head-to-head is biased:\n  " + "\n  ".join(missing)
    )


def test_the_check_can_fail():
    """Known-positive control: remove a mapping and the check must catch it."""
    covered = set(FP._FP_STAT_MAP.values()) - {"rec_td"}
    assert "rec_td" in (SKILL & priced()) - covered, (
        "the detector cannot see a removed mapping — it proves nothing"
    )


def test_kicker_and_defense_gaps_are_NOT_flagged():
    """Control on scope: FP's projection feed carries no K/DEF, and no skill
    grade reads those categories. Flagging them would make this check noise."""
    assert "fgm_50p" not in SKILL and "pts_allow_0" not in SKILL
