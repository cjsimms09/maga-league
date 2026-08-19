"""Tests for the retired-blocker detector.

Every fixture here is synthetic and the clock is injected, so none of this depends on
the corpus of the day — the flakiness `intervention_rate.js` had to freeze a pool to
escape. The one live-repo test is a CONTROL: if the tool ever stops surfacing the pair
it was built for, that test fails and says so.
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "draft" / "tools"))

import stale_blockers as S  # noqa: E402


def row(path, text, at, blocked=None):
    return {"path": path, "text": text, "at": at,
            "blocked": S.BLOCKED_RE.search(text) is not None if blocked is None else blocked,
            "tokens": S.tokens(text)}


# --- what counts as a refusal ---------------------------------------------------

def test_a_refusal_is_recognised_in_its_several_spellings():
    for text in ["ship: REFUSE", "status: no_control", "we cannot measure this",
                 "insufficient history", "has no per-player history"]:
        assert S.BLOCKED_RE.search(text), text


def test_a_clean_verdict_is_not_a_refusal():
    for text in ["clears: true, the arm beats the champion", "PERSISTS at every bar"]:
        assert not S.BLOCKED_RE.search(text), text


# --- the LATER constraint is what makes this a retired-blocker check -------------

def test_only_artifacts_committed_AFTER_the_refusal_are_paired():
    rows = [
        row("blocked.json", "REFUSE because sleeper per-player history is missing", 100),
        row("earlier.json", "sleeper per-player history exists and is complete", 50),
        row("later.json", "sleeper per-player history exists and is complete", 200),
    ]
    got = S.pairs(rows, min_shared=2, min_score=0.0)
    assert [p[1]["path"] for p in got] == ["later.json"], [p[1]["path"] for p in got]


def test_an_artifact_never_pairs_with_itself():
    rows = [row("a.json", "REFUSE sleeper history missing", 100)]
    assert S.pairs(rows, min_shared=1, min_score=0.0) == []


def test_a_refusal_with_no_commit_date_is_skipped_not_guessed():
    rows = [row("b.json", "REFUSE sleeper history missing", None),
            row("l.json", "sleeper history exists", 200)]
    assert S.pairs(rows, min_shared=1, min_score=0.0) == []


# --- THE BUG THAT MADE THE FIRST TWO CUTS USELESS -------------------------------

def test_six_copies_of_one_template_do_not_pair_with_each_other():
    """KNOWN-POSITIVE for the real failure: nfl_schedule_2021..2026.

    Their shared words are genuinely RARE corpus-wide, so rarity-weighting ranked them
    top and buried the pair the tool exists for. Rarity cannot see duplication.
    """
    boiler = ("REFUSE cannot spend credits expiring vegas odds store dates "
              "weekly-props-fetch refuses until")
    rows = [row(f"nfl_schedule_202{i}.json", boiler, 100 + i) for i in range(6)]
    assert S.pairs(rows, min_shared=3, min_score=0.0) == []


def test_two_genuinely_different_artifacts_still_pair():
    """CONTROL for the guard above — it must not suppress everything."""
    rows = [
        row("blend.json", "REFUSE the control arm sleeper alone has no per-player "
                          "history for any graded season blend prereg", 100),
        row("hist.json", "sleeper per-player history passed every leak gate 2025 "
                         "licensable three-way grade", 200),
    ]
    got = S.pairs(rows, min_shared=2, min_score=0.0)
    assert len(got) == 1 and got[0][1]["path"] == "hist.json"


# --- rarity weighting ------------------------------------------------------------

def test_rarity_outranks_raw_overlap():
    """A rare shared word must beat four common ones.

    The fixture gives each candidate its own vocabulary as well, because two documents
    that are ALSO near-identical are excluded by the similarity guard — which is the
    guard working, not a bug, and the first draft of this test tripped over it.
    """
    common = "alpha beta gamma delta"
    rows = [
        row("blocked.json", "REFUSE " + common + " kalshi", 100),
        row("noise.json", common + " unrelated pumpkin trellis abacus lantern", 200),
        row("signal.json", "kalshi " + common + " zeppelin quarry mandolin thicket", 200),
    ] + [row(f"f{i}.json", common, 10) for i in range(20)]
    got = S.pairs(rows, min_shared=2, min_score=0.0)
    assert got, "no pairs survived; check the similarity guard"
    assert got[0][1]["path"] == "signal.json", [(p[1]["path"], p[3]) for p in got]


def test_the_similarity_guard_HAS_a_cost_and_it_is_stated_here():
    """THE GUARD CAN SUPPRESS A REAL PAIR, and pretending otherwise would be the lie.

    A refusal and the artifact that retires it are topically close by nature. If one is
    written in almost the same vocabulary as the other, the same rule that removes six
    copies of a template removes them too. Measured on the real corpus the founding pair
    sits comfortably under the threshold — but this is a recall/precision trade, not a
    free win, and the number is a judgement rather than a measurement.

    Pinned so that raising `max_similarity` is a deliberate act with a test to update,
    and so nobody reads the tool as exhaustive.
    """
    twin = "REFUSE sleeper per-player history missing blend control arm"
    rows = [row("b.json", twin, 100), row("l.json", twin.replace("REFUSE ", ""), 200)]
    assert S.pairs(rows, min_shared=3, min_score=0.0) == [], \
        "near-identical wording is suppressed — by design, and at a real cost"
    assert S.pairs(rows, min_shared=3, min_score=0.0, max_similarity=1.01), \
        "and it IS recoverable by loosening the threshold deliberately"


def test_thresholds_actually_exclude():
    rows = [row("b.json", "REFUSE alpha beta", 100), row("l.json", "alpha beta", 200)]
    assert S.pairs(rows, min_shared=5, min_score=0.0) == []
    assert S.pairs(rows, min_shared=1, min_score=999.0) == []


# --- tokenisation ---------------------------------------------------------------

def test_stopwords_and_short_words_carry_no_topic():
    got = S.tokens("The season has no data for any of the two rows")
    assert got == set(), got


def test_a_missing_verdict_field_yields_no_row():
    assert S.verdict_text({"players": [1, 2, 3]}) == ""
    assert S.verdict_text(["not", "a", "dict"]) == ""


# --- CONTROL against the live repo ----------------------------------------------

def test_the_live_corpus_still_surfaces_the_pair_this_was_built_for():
    """If this stops firing, the tool has gone blind to its own founding case.

    proj_mean_blend refused 08-16 21:31 for want of Sleeper per-player history;
    sleeper_hist_proj proved it exists 08-17 16:25. Nineteen hours, never joined.
    """
    rows = S.collect()
    if not any("proj_mean_blend" in r["path"] for r in rows):
        import pytest
        pytest.skip("proj_mean_blend.json not present in this checkout")
    # RETIRED-AND-FLIPPED (A, 08-19): the founding refusal RESOLVED — the
    # Sleeper-history join it was blocked on happened (sleeper_hist_proj +
    # SOURCE-BLEND-2025 graded), and proj_mean_blend.json now carries
    # `graded_test`/`_ruling` instead of a refusal, so the tool CORRECTLY
    # stopped pairing it (verified by hand before this rewrite — caught by
    # the 08-19 refused rebuild). The flipped pins: the resolution must
    # stay visible in the artifact, and the tool must still fire on the
    # live corpus at all.
    import json as _json
    blend = _json.loads((ROOT / "draft" / "backtest" / "proj_mean_blend.json").read_text())
    assert "graded_test" in blend or "_ruling" in blend, (
        "proj_mean_blend regressed to a refusal — if the blocker is back, "
        "restore the original pairing assertion")
    got = S.pairs(rows, min_shared=3, min_score=0.0)
    assert got, "the tool finds NO pairs on the live corpus — it has gone blind"
    assert got[0][0]["path"].endswith("proj_mean_blend.json"), \
        f"the founding case is no longer ranked first: {got[0][0]['path']}"
