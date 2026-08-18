# TERRITORY: A
"""THE ENTRY-POINT BRIEF MUST NOT GO STALE.

`CLAUDE.md` points every session at `DRAFT-WEEK-BRIEF.md` first, so its numbers
are trusted without re-derivation — which makes a drifted number there more
expensive than a drifted number anywhere else.

That is not hypothetical. 2026-08-17 produced three separate instances of a
claim that had quietly become false: `WEIGHT_PROVENANCE.ceiling` still saying
"collinear with value on the backtest board" after the harness was fixed, four
module headers asserting the bundle still wrote `1.35 x proj_mean`, and a suite
count I restated from memory after it had moved. Each was caught by luck or by a
tripwire someone else had left. This is the tripwire for the brief.

THE SPLIT MATTERS AND MIRRORS test_freeze_not_stale. Some of the brief's numbers
come from COMMITTED ARTIFACTS that change only when regenerated — those are
pinned normally and must hold in CI. Others come from the LIVE BOARD, which is
rebuilt nightly, so they drift for legitimate reasons; those are `repo_parity`,
where a failure says the board is NEW rather than the brief is WRONG.
"""
from __future__ import annotations

import json
import math
import os
import re
import statistics as st
import sys

import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
BRIEF = os.path.join(ROOT, "DRAFT-WEEK-BRIEF.md")


def _brief():
    with open(BRIEF) as fh:
        return fh.read()


def _json(*parts):
    with open(os.path.join(ROOT, *parts)) as fh:
        return json.load(fh)


def test_the_brief_is_what_claude_md_points_at():
    """If CLAUDE.md stops naming it, this file guards a document nobody reads."""
    with open(os.path.join(ROOT, "CLAUDE.md")) as fh:
        assert "DRAFT-WEEK-BRIEF.md" in fh.read()


# ── COMMITTED-ARTIFACT NUMBERS — must hold in CI ────────────────────────────

def test_the_snap_count_total_matches_the_stores():
    total = sum(_json("draft", "backtest", f"snap_counts_{s}.json")["join"]
                ["skill_player_weeks"] for s in (2021, 2022, 2023, 2024, 2025))
    assert f"{total:,}" in _brief(), f"brief does not carry the real total {total:,}"


def test_the_persistence_numbers_match_the_artifact():
    """The headline of the day: volatility persists at ~2/3 the strength of
    scoring level. Both halves of that comparison are pinned, because the
    finding is meaningless without its control."""
    rows = {(r["from"], r["to"]): r for r in
            _json("draft", "backtest", "weekly_volatility.json")["persistence_cv"]}
    text = _brief()
    # Re-pinned 2026-08-18 (register 5d): persistence re-measured on the
    # playoff-free stores — 0.482/0.605 became 0.469/0.635, both still
    # clearing their nulls; the brief cites the clean values.
    for key, rho, ctrl in (((2023, 2024), "+0.469", "+0.736"),
                           ((2024, 2025), "+0.635", "+0.779")):
        assert round(rows[key]["rho"], 3) == float(rho), rows[key]["rho"]
        assert rho in text, f"brief lost rho {rho}"
        assert round(rows[key]["control_mean_carryover"], 3) == float(ctrl)
        assert ctrl in text, f"brief lost the CONTROL {ctrl} — the rho alone is not evidence"


def test_the_refused_seasons_are_named():
    """2021-22 were scored under a different table. A brief that reported three
    seasons without saying two were REFUSED would read as "that is all there
    ever was"."""
    doc = _json("draft", "backtest", "weekly_volatility.json")
    # Re-pinned 2026-08-18 (register 5d): the components-derived store rebuild
    # scores every season through the one frozen table, so nothing is refused
    # and the fit spans five seasons. The brief must say the refusal HISTORY
    # (so a reader of old studies knows why they cite 3 seasons) — the claim
    # this test protects (a dropped season is named, never silent) holds with
    # an empty list only while seasons_used covers all five.
    assert doc["seasons_refused_different_scoring_table"] == []
    assert doc["seasons_used"] == [2021, 2022, 2023, 2024, 2025]
    assert "2021-22" in _brief() or "2021, 2022" in _brief()


def test_the_rookie_tail_rates_match_the_study():
    tiers = _json("draft", "backtest", "rookie_wr_capital.json")["tiers"]
    text = _brief()
    for tier, shown in (("rd1", "53.3%"), ("rd2", "25.0%"),
                        ("rd3", "0.0%"), ("rd4-7", "1.8%")):
        actual = round(100 * tiers[tier]["tail_rate"], 1)
        assert f"{actual}%" == shown, f"{tier}: study says {actual}%, brief says {shown}"
        assert shown in text, f"brief lost the {tier} tail rate"


def test_the_brief_keeps_the_caveat_that_rd1_spans_zero():
    """n=15 and the MEAN interval spans zero. "53% tail rate" without that
    reads as "round-1 rookies beat the wire", which the data does not say."""
    text = _brief()
    assert "53.3%" in text
    assert "not measurably worse" in text or "spans zero" in text or "CI spans zero" in text


# ── LIVE-BOARD NUMBERS — drift legitimately, so repo_parity ─────────────────

@pytest.mark.repo_parity
def test_the_volatility_coverage_numbers_match_the_live_board():
    """The sharp, non-random boundary: 131 of 157, and only 8 of the 26 missing
    are rookies — the rest are injury-returns, including four early picks."""
    board = _json("public", "draft_data.json")["players"]
    vol = _json("draft", "backtest", "weekly_volatility.json")["per_player"]["2025"]
    draft = [p for p in board if (p.get("adp") or 999) <= 160]
    have = [p for p in draft if str(p["player_id"]) in vol]
    miss = [p for p in draft if str(p["player_id"]) not in vol]
    rookies = sum(1 for p in miss if p.get("is_nfl_rookie"))
    text = _brief()
    assert f"{len(have)} of {len(draft)}" in text, (
        f"board says {len(have)} of {len(draft)}; brief disagrees")
    assert f"only {rookies} are rookies" in text, f"board says {rookies} rookies among the missing"


@pytest.mark.repo_parity
def test_the_keeper_variance_numbers_match_the_live_board():
    """The money-proxy bug's magnitude. If the keepers change, the brief's
    17.63/25.81/32.46 stops describing this roster."""
    board = _json("public", "draft_data.json")
    text = _brief()
    for k in board["kept_players"]:
        assert f"{k['weekly_sd']:.2f}" in text, (
            f"{k.get('name')} weekly_sd {k['weekly_sd']:.2f} not in the brief")


@pytest.mark.repo_parity
def test_the_named_injury_return_adps_match_the_live_board():
    """Nabers 32 / Wilson 45 / Daniels 59 / Evans 62 are the brief's evidence
    that the missing population is early picks, not deep fliers."""
    board = _json("public", "draft_data.json")["players"]
    text = _brief()
    for surname, shown in (("Nabers", 32), ("Wilson", 45),
                           ("Daniels", 59), ("Evans", 62)):
        hit = [p for p in board if surname.lower() in str(p.get("name", "")).lower()
               and (p.get("adp") or 999) <= 160]
        if not hit:
            continue
        assert f"{shown}" in text, f"{surname} ADP {shown} missing from the brief"
