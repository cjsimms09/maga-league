# TERRITORY: A
"""Gates for the EXPLORATORY rookie-WR draft-capital pass.

Verdict: draft/audit/rookie_wr_capital_2026-08-17.md.

The most important gate in this file is the one that refuses to let the artifact
call itself confirmatory. Every other study in this repo preregisters first;
this one did not, and the label is the only thing standing between "a promising
table" and "a finding somebody acts on".
"""
import json
import sys
from pathlib import Path

import pytest

BT = Path(__file__).resolve().parents[1] / "backtest"
sys.path.insert(0, str(BT))
import rookie_wr_capital as RWC  # noqa: E402

ARTIFACT = BT / "rookie_wr_capital.json"


def test_tiers_partition_every_nfl_round():
    seen = {RWC._tier(r) for r in range(1, 8)}
    assert seen == {"rd1", "rd2", "rd3", "rd4-7"}
    assert RWC._tier(1) != RWC._tier(2), "rd1 and rd2 must not collapse"
    assert RWC._tier(4) == RWC._tier(7) == "rd4-7"


def test_the_capital_store_is_period_correct():
    """The whole instrument depends on capital being knowable BEFORE the fantasy
    draft. If a career-outcome column ever reappears in the store, this study is
    grading hindsight and must stop."""
    rows = RWC.capital_rows()
    assert rows
    banned = {"games", "career_yards", "w_av", "to", "pro_bowls", "seasons_started",
              "rushing_yards", "receiving_yards", "pass_yards"}
    for r in rows[:50]:
        leaked = banned & set(r)
        assert not leaked, f"career-outcome column leaked into the capital store: {leaked}"


def test_the_tail_threshold_is_a_tail_not_a_mean():
    # Cory's claim is about upside. A threshold at or below the wire would be
    # measuring "did he exist", not "did he win you the position".
    assert RWC.TAIL_PTS > RWC.wire_bar()


@pytest.mark.skipif(not ARTIFACT.exists(), reason="study not run")
class TestArtifact:
    doc = json.loads(ARTIFACT.read_text()) if ARTIFACT.exists() else {}

    def test_the_artifact_refuses_to_call_itself_confirmatory(self):
        assert "EXPLORATORY" in self.doc["status"]
        assert self.doc["cannot_ship"]
        assert "preregist" in self.doc["cannot_ship"].lower()

    def test_above_and_below_the_wire_are_separate_claims(self):
        """'Not measurably worse' must never be recorded as 'better'. Both flags
        exist so a reader cannot infer one from the absence of the other."""
        for t, r in self.doc["tiers"].items():
            assert not (r["clearly_below_wire"] and r["clearly_above_wire"]), t
            lo, hi = r["ci95_vs_wire"]
            assert r["clearly_below_wire"] == (hi < 0), t
            assert r["clearly_above_wire"] == (lo > 0), t

    def test_the_headline_tier_is_reported_as_undecided_not_as_a_win(self):
        """rd1 is the tier the recommendation leans on, and its interval spans
        zero. If a future rerun makes it clearly positive that is a real change
        and the write-up must be revisited rather than left understating it."""
        rd1 = self.doc["tiers"]["rd1"]
        assert not rd1["clearly_above_wire"], (
            "rd1 now clears the wire outright — the audit says it does not, and "
            "one of the two must be updated")
        assert not rd1["clearly_below_wire"]

    def test_the_tiers_that_are_clearly_bad_are_recorded_as_such(self):
        # This is the half of the result that is actually decisive, and it is
        # the half that argues AGAINST one of Cory's two named players.
        assert self.doc["tiers"]["rd4-7"]["clearly_below_wire"] is True
        assert self.doc["tiers"]["rd4-7"]["tail_hits"] <= 1

    def test_the_absent_as_zero_choice_cannot_be_driving_rd1(self):
        rd1 = self.doc["tiers"]["rd1"]
        assert rd1["played"] == rd1["n"], (
            "if some rd1 rookies stopped playing, mean and played_only_mean "
            "diverge and the convention starts mattering")
        assert rd1["played_only_mean"] == rd1["mean"]

    def test_no_single_season_carries_the_headline_tier(self):
        by = self.doc["tiers"]["rd1"]["by_season"]
        assert len(by) == 3
        assert min(by.values()) > 0.6 * max(by.values()), (
            "one season dominating rd1 would make this a season story, not a "
            "capital story")

    def test_unmatched_2026_rookies_are_surfaced_not_dropped(self):
        board = self.doc["board_2026"]
        assert board
        declared = set(self.doc["unmatched_2026"])
        actual = {b["name"] for b in board if not b["matched"]}
        assert declared == actual, (
            "a rookie missing from the board must be reported as unmatched — "
            "silently dropping him reads as 'no such player'")

    def test_both_of_corys_named_players_are_present_and_tiered(self):
        by = {b["name"]: b for b in self.doc["board_2026"]}
        assert by["KC Concepcion"]["tier"] == "rd1"
        assert by["Cyrus Allen"]["tier"] == "rd4-7"

    def test_the_limitations_name_the_things_that_undercut_the_result(self):
        joined = " ".join(self.doc["limitations"]).lower()
        for must in ("spans zero", "by name", "nacua", "not unpriced"):
            assert must in joined, f"limitation about {must!r} was dropped"
