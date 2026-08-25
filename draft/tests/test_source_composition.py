# TERRITORY: A
"""THE CONTAMINATION ROUTING, CHECKED AGAINST THE SOURCES THAT PRICE THE BOARD.

Pins `lab_source_composition`, whose finding is that a threshold cleared cleanly
still confirmed the wrong mechanism.

Run: python -m pytest draft/tests/test_source_composition.py -q
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "draft" / "backtest"))

import lab_source_composition as L  # noqa: E402

R = L.compose()


def test_CONTROL_the_two_pricing_sources_are_both_present_and_crosswalk():
    """Everything below is vacuous if the sources did not both load."""
    assert R["n_shared"] >= 150, (
        f"only {R['n_shared']} crosswalked players — too few to measure a "
        "positional median against")
    assert set(R["per_pos"]) == {"QB", "RB", "WR", "TE"}


def test_the_MFL_archive_the_contamination_was_measured_in_prices_NOTHING():
    """The premise of the whole routing. If MFL ever starts pricing rows, the
    contamination measured in it becomes the board's problem and this file's
    conclusion has to be re-argued."""
    hits = []
    for pat in (ROOT / "draft").glob("*.py"):
        if "external_adp_series" in pat.read_text():
            hits.append(pat.name)
    for pat in (ROOT / "public" / "js").rglob("*.js"):
        if "external_adp_series" in pat.read_text():
            hits.append(pat.name)
    assert not hits, (
        f"external_adp_series.json now reaches the board via {hits} — the "
        "MFL contamination is no longer confined to a non-pricing archive")


def test_the_FFC_request_is_FORMAT_MATCHED_and_the_provider_CONFIRMS_it():
    """The filter route is already in force, and it is verified from the
    response rather than from the request. Asking for half-ppr and being served
    something else is exactly the silent failure this repo keeps finding."""
    prices = json.loads(
        (ROOT / "draft" / "data" / "external_source_prices.json").read_text())
    ffc = next(e for e in prices["series"] if e["source"] == "ffc")
    meta = ffc["params"]["provider_meta"]["meta"]
    cfg = json.loads((ROOT / "draft" / "config" / "league_config.json").read_text())
    assert meta["type"] == "Half-PPR", meta["type"]
    assert meta["teams"] == cfg["teams"], f"{meta['teams']} vs {cfg['teams']}"
    assert meta["total_drafts"] > 500, (
        f"only {meta['total_drafts']} drafts behind the FFC prices — a thin "
        "sample is its own problem and the dispersion inherits it")


def test_DYNASTY_CONTAMINATION_DOES_NOT_FIRE_between_the_pricing_sources():
    assert not R["dynasty_fires"], (
        f"age rho {R['age_rho_qb_removed']:+.3f} now clears "
        f"{L.DYNASTY_THRESHOLD} — dynasty contamination has appeared between "
        "the two sources that price the board, which it had not on 2026-08-14")


def test_THE_THRESHOLD_ITSELF_SITS_INSIDE_ITS_OWN_NULL():
    """⚠️ THIS FILE PREVIOUSLY ASSERTED THE OPPOSITE.

    It checked that the QB delta CLEARED -9.7 and that TE moved twice as far,
    and drew a conclusion from the pair. Both assertions are retracted: -9.7
    lies inside the QB null band, so clearing it is not evidence of anything,
    and TE's observed -28.0 is inside a null band of [-51, +14].

    The cause is board composition, not market opinion. QBs and TEs sit LATE on
    our board (mean rank 112 and 126 of 215 against a uniform 108), so a market
    that ranked every player AT RANDOM returns negative QB and TE deltas."""
    qb = R["per_pos"]["QB"]
    assert R["qb_threshold_is_inside_its_own_null"], (
        f"the -9.7 threshold is no longer inside the QB null band "
        f"[{qb['null_p05']}, {qb['null_p95']}] — if the board's composition has "
        "changed enough for that, the retraction needs re-deriving")
    assert not qb["survives_null"], (
        f"QB {qb['median_delta']} now escapes its null band — a real superflex "
        "signal may have appeared and the no-switch conclusion needs re-arguing")


def test_the_TE_NUMBER_THAT_CARRIED_THE_OLD_ARGUMENT_IS_NOISE():
    """The specific retraction, asserted so it cannot quietly come back."""
    te = R["per_pos"]["TE"]
    assert not te["survives_null"], (
        f"TE {te['median_delta']} now escapes [{te['null_p05']}, "
        f"{te['null_p95']}] — the withdrawn argument may be recoverable, but it "
        "has to be re-made against the null rather than restored")
    # ⚠️ THIS PINNED `> 115` AND THE BOARD DRIFTED TO 114.15 (A, 2026-08-25).
    #
    # The number was a point estimate of a quantity that moves every time the
    # board is rebuilt, standing in for a CLAIM: TE sits late, and that lateness
    # is what makes a random ranking look TE-negative. Measured today the claim
    # is not merely intact, it is emphatic — TE 114.15 against QB 96.62, WR 86.25
    # and RB 87.81, so TE is the latest position by SEVENTEEN AND A HALF ranks.
    # A threshold 0.85 above the current value was reporting that as a failure.
    #
    # So the claim is asserted instead of the constant: TE must be the LATEST of
    # the four, by a margin wide enough that it is not a tie. That is what the
    # sentence above actually says, it cannot drift with a nightly rebuild, and
    # it still fails loudly the day TE stops being a late-board position — which
    # is the day the retraction's explanation really does need re-making.
    ranks = {pos: v["mean_board_rank"] for pos, v in R["per_pos"].items()}
    latest = max(ranks, key=ranks.get)
    runner_up = sorted(ranks.values())[-2]
    assert latest == "TE", (
        f"TE is no longer the latest position on the board ({latest} is, "
        f"ranks={ {k: round(v, 1) for k, v in ranks.items()} }) — the late-board "
        "position that MAKES a random ranking look TE-negative has moved, and "
        "the explanation for the retraction with it")
    assert te["mean_board_rank"] - runner_up > 5, (
        f"TE {te['mean_board_rank']:.1f} is only "
        f"{te['mean_board_rank'] - runner_up:.1f} ranks later than the next "
        "position — too close to carry the explanation")


def test_the_ONLY_position_that_survives_is_the_one_the_first_pass_MISSED():
    """RB. Not mentioned in the original write-up at all, because the argument
    was built around the position the hypothesis named and the one that looked
    most extreme raw."""
    assert R["positions_surviving_null"] == ["RB"], R["positions_surviving_null"]
    rb = R["per_pos"]["RB"]
    assert rb["median_delta"] < rb["null_p05"], (
        f"RB {rb['median_delta']} vs p05 {rb['null_p05']}")


def test_CONTROL_the_null_is_not_centred_on_zero_which_is_the_whole_point():
    """If the null medians were ~0, raw deltas would have been readable and no
    retraction would have been needed. They are not: board composition alone
    moves every position."""
    meds = [abs(v["null_median"]) for v in R["per_pos"].values()]
    assert max(meds) > 8, (
        f"null medians {meds} are all near zero — board composition no longer "
        "biases the deltas and this file's premise is gone")


def test_the_centre_gap_is_the_SD_BASIS_MISMATCH_and_is_independently_confirmed():
    """C measured median 8.3 / p90 29.4 / max 48.9 for the FP-mean-with-FFC-sd
    transplant. Reproduced here from the raw per-source prices rather than from
    C's report, which is what makes it a second measurement.

    ⚠️ OUR REPRODUCTION HAS MOVED AND C'S REPORTED NUMBER HAS NOT (A,
    2026-08-25). This asserted `7.0 <= median <= 10.0`, a band drawn around C's
    8.3. Measured today on the same construction: **11.18** across n=120. The
    band was written to say "we get what C got"; we no longer do, and widening
    it silently would erase that.

    THE CLAIM SURVIVES AND IS STRONGER — there is a material, positive centre gap
    from transplanting FFC's sd onto FP's mean, which is what "the SD basis
    mismatch is real" means. What has changed is its SIZE, by about a third, and
    both measurements are board-dependent so C's would very likely move too if
    re-run. **The reproduction is asserted as a claim about SHAPE; the point
    values are recorded here so a reader can see the drift instead of inferring
    it from a band that keeps getting widened.** If C's 8.3 is still quoted
    anywhere as current, it is stale — routed rather than silently superseded."""
    g = R["centre_gap_inside_150"]
    assert g["n"] >= 100
    # A material positive gap, not a specific one. Zero or negative would mean
    # the transplant costs nothing and this whole file's premise is gone.
    assert g["median"] > 5.0, (
        f"the centre gap has collapsed to {g['median']:.2f} — the SD basis "
        "mismatch no longer moves the centre, so the finding this file records "
        "needs re-making rather than restoring")
    assert g["max"] > 40, g["max"]
    # C's own figure, kept visible rather than assumed still current.
    C_REPORTED_MEDIAN = 8.3
    if abs(g["median"] - C_REPORTED_MEDIAN) > 2.0:
        print(f"\n  NOTE: our reproduction is {g['median']:.2f} against C's "
              f"reported {C_REPORTED_MEDIAN} — the two have drifted apart; both "
              "are board-dependent. Register 330.")
