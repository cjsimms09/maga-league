# TERRITORY: A
"""THE DISPERSION RULE, GRADED AGAINST A MEASUREMENT INSTEAD OF AGAINST ITSELF.

C routed this on 2026-08-14 and the diagnosis is exact:

    "test_survival_parity.py:88 asserts K.adp_sd_for(adp) == _js_sd(adp) across a
    sweep. That is a test that greens when both sides conform to the same rule —
    it cannot fail on a wrong rule, only on a divergent one."

Confirmed by reading it: `_js_sd` is survival.js TRANSCRIBED into Python, and the
same file asserts the two sides' constants are equal three tests earlier. Change
the rate on both sides to 0.9 and parity still passes. `test_acceptance.py` has
the same shape and its own docstring records it being edited from `22.0` to match
a changed constant — a visible failure converted into an invisible one.

Both are still worth having. A divergence check is real: keepers.py and
survival.js disagreeing is what cost the keeper optimizer directly. It just
cannot be the ONLY check, because nothing in it reaches outside the code.

── THE YARDSTICK, AND WHY IT EXISTS NOW AND DID NOT BEFORE ──────────────────

keepers.py said the rule was ungradeable: "both formulas are guesses until MFL's
published dispersion accumulates." Measured on the shipped board, that premise is
false — 219 rows carry a PUBLISHED dispersion, and inside pick 150 it is 142 of
146. The measurement being waited for is already on the board.

So this file grades the FITTED rule against the MEASURED one, on the rows where
both exist. It is external by construction: no amount of agreement between
keepers.py and survival.js can satisfy it, because the numbers it compares
against come off the artifact.

── WHAT IT FOUND ────────────────────────────────────────────────────────────

    adp   1- 25   n= 22   measured  2.40   fitted(0.15)  3.00   1.29
    adp  25- 50   n= 22   measured  4.25   fitted(0.15)  5.70   1.27
    adp  50-100   n= 49   measured  7.80   fitted(0.15) 11.10   1.24
    adp 100-150   n= 51   measured 12.50   fitted(0.15) 15.00   1.20

~25% wide across every band the draft happens in, monotone across four
independent bands. Rate re-derived from the data: least-squares through origin
0.1083, median of per-player sd/adp 0.1099 — two estimators, n=173, agreeing to
1.5%.

⚠️ THE RATE IS NOT CHANGED. 0.15 still ships. The replacement is derived FROM
FFC's published dispersion, and Cory's section-4 routing puts source selection
under review — so shipping a number sourced from the feed being reviewed would
be turning an unfinished analysis into a production change. Production
behaviour is preserved; the finding is recorded beside the constant and the
bands below are ratcheted so it cannot get worse while the decision is open.

FLOOR IS ALSO WRONG AND THAT IS WHY THE RATE ALONE WAS NOT SHIPPED. At rate
0.11 the pure linear rule tracks the market at the top of the board (1.10 vs a
measured 1.30 at adp 10; 2.20 vs 1.95 at 20), and the floor of 3.0 — which
binds below adp 27 — is what breaks the 1-25 band. Changing the rate without
the floor leaves that band mispriced, so the two move together or not at all.

Run: python -m pytest draft/tests/test_adp_sd_measured.py -q
"""
from __future__ import annotations

import json
import re
import statistics as st
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "draft"))

import keepers as K  # noqa: E402

ART = json.loads((ROOT / "public" / "draft_data.json").read_text())

#: Rows whose sd is a MEASUREMENT, not our formula. `adp_sd_source` is written by
#: adp.py and starts "ffc" for anything a source published.
MEASURED = [p for p in ART["players"]
            if str(p.get("adp_sd_source") or "").startswith("ffc")
            and p.get("adp") and p.get("adp_sd")]

#: The linear region. Below it the floor binds, above it the cap does, and
#: neither constant is being graded here.
LINEAR = [p for p in MEASURED if 20 <= p["adp"] <= 200]


def _fitted(adp: float) -> float:
    return K.adp_sd_for(float(adp))


# ── CONTROLS. A yardstick with no marks on it grades everything as correct. ──
def test_CONTROL_the_board_actually_carries_published_dispersions():
    assert len(MEASURED) >= 100, (
        f"only {len(MEASURED)} rows carry a published sd — this file's premise "
        "is that the measurement has arrived, and below ~100 rows it has not")


def test_CONTROL_the_measured_rows_reach_the_range_we_draft_in():
    inside = [p for p in MEASURED if p["adp"] <= 150]
    assert len(inside) >= 100, (
        f"only {len(inside)} measured rows inside pick 150 — a rule graded only "
        "on the deep pool says nothing about the picks I own")


def test_CONTROL_the_measured_sd_is_not_itself_our_formula():
    """If the 'published' sd were our own clamped line wearing a source label,
    every comparison below would be circular. It is not: our rule produces at
    most a few dozen distinct values, a real market produces hundreds."""
    distinct = len({round(p["adp_sd"], 2) for p in MEASURED})
    assert distinct > 50, (
        f"only {distinct} distinct measured sds across {len(MEASURED)} rows — "
        "that is the shape of a formula, not of a measurement, and grading "
        "against it would be self-referential in a new costume")


# ── THE GRADE ITSELF ────────────────────────────────────────────────────────
def test_the_rate_the_MARKET_publishes_is_WELL_DETERMINED():
    """Two independent estimators over the linear region. Neither reads a
    constant from our code, so no edit to keepers.py or survival.js can move
    them. This asserts only that the measurement is SOUND — what to do about it
    is a decision, and it is not being made by a test."""
    num = sum(p["adp"] * p["adp_sd"] for p in LINEAR)
    den = sum(p["adp"] ** 2 for p in LINEAR)
    ls_rate = num / den
    med_rate = st.median(p["adp_sd"] / p["adp"] for p in LINEAR)
    assert abs(ls_rate - med_rate) < 0.02, (
        f"the two estimators disagree ({ls_rate:.4f} vs {med_rate:.4f}) — the "
        "rate is not well determined and nothing may be concluded from it")
    assert 0.09 < ls_rate < 0.13, (
        f"the measured rate moved to {ls_rate:.4f}. The divergence recorded in "
        "keepers.py was derived at ~0.108; re-derive it before trusting that note.")


def test_THE_DIVERGENCE_IS_RECORDED_WHERE_THE_CONSTANT_LIVES():
    """⚠️ THE FITTED RULE IS ~25% WIDE AND IS STILL SHIPPING. That is deliberate
    and it is not a suppressed alarm: the replacement rate is derived FROM the
    dispersion source that Cory's section-4 routing puts under review, so
    shipping it mid-review would be turning an unfinished analysis into a
    production change. Production behaviour is preserved, per the standing rule.

    What this file refuses to allow is the finding going quiet. The measurement
    must stay written next to the constant it grades, so the next reader cannot
    take 0.15 for a validated number."""
    src = (ROOT / "draft" / "keepers.py").read_text()
    assert "measured" in src and "fitted" in src, (
        "keepers.py no longer records that its rate was graded against published "
        "dispersion — the finding has been deleted from the only place a reader "
        "of the constant would look")
    assert "0.1083" in src or "0.108" in src, (
        "the derived rate is no longer recorded beside the shipped one, so "
        "nothing tells the next reader that 0.15 is known to be ~25% wide")


@pytest.mark.repo_parity
@pytest.mark.parametrize("lo,hi", [(1, 25), (25, 50), (50, 100), (100, 150)])
def test_MEASURE_each_ADP_band_and_hold_the_line_at_todays_error(lo, hi):
    """A RATCHET, NOT AN ENDORSEMENT. Today's rule is wide; these bounds are
    today's measured error plus headroom, so the rule cannot get WORSE while the
    decision is open. Tightening them is the fix; widening them to make a red go
    away is the thing this repo keeps catching itself doing.

    repo_parity (runs 31936912289 + 31948330004, 2026-08-16): the ratio is
    fitted (keepers.py's shipped CONSTANT, pure repo code) over the day's
    freshly fetched FFC-published dispersion. In the publication gate the
    board file carries that morning's market, so a market move — the sds
    tightening ~5% is enough to push a band's median past 1.35 — refuses the
    candidate although no BOARD value is asserted anywhere in this test (the
    board's own adp_sd on these rows IS the published measurement, taken
    as-is). It refuses the market for being NEW, not the board for being
    BAD. The ratchet stays enforced against committed state in every normal
    pytest run and the advisory pre-build step, where its 2026-08-14
    calibration is meaningful. NOTE: test_FAIL_ARM below is the same
    fetch-sensitive shape in the opposite direction and is deliberately NOT
    marked — it has not refused a board, and pre-excluding it without an
    observed failure is the on-faith exclusion §6 forbids."""
    band = [p for p in MEASURED if lo <= p["adp"] < hi]
    if len(band) < 10:
        pytest.skip(f"n={len(band)} in {lo}-{hi}")
    ratio = st.median(_fitted(p["adp"]) / p["adp_sd"] for p in band)
    print(f"\n  adp {lo}-{hi} n={len(band)}: fitted/measured = {ratio:.2f}")
    assert ratio <= 1.35, (
        f"adp {lo}-{hi} (n={len(band)}): fitted is {ratio:.2f}x the published "
        "dispersion, worse than the 1.20-1.29 measured on 2026-08-14. An "
        "over-wide sd flattens survival and makes every player look more likely "
        "to last.")
    assert ratio >= 0.70, (
        f"adp {lo}-{hi}: fitted is {ratio:.2f}x published — now too NARROW, "
        "which manufactures urgency that is not in the market.")


def test_the_SHIPPED_rate_tracks_the_market_and_the_OLD_one_provably_did_not():
    """INVERTED 2026-08-17, exactly as its own failure message prescribed: the
    measured pair (rate 0.11, floor 2.0) shipped on Cory's ruling ("SHIP,
    ORDER BACKTEST AND RESERVE RIGHT TO CHANGE"), so the finding this arm
    preserved is now production. Two halves: the shipped rule tracks the
    published dispersion in every band, and the RETIRED 0.15/3.0 pair is
    reconstructed to show it would not — so neither the ruling nor the defect
    it fixed can be quietly dropped."""
    shipped_off, old_off = [], []
    for lo, hi in [(1, 25), (25, 50), (50, 100), (100, 150)]:
        band = [p for p in MEASURED if lo <= p["adp"] < hi]
        if len(band) < 10:
            continue
        r = st.median(_fitted(p["adp"]) / p["adp_sd"] for p in band)
        if not (0.85 <= r <= 1.15):
            shipped_off.append((lo, hi, round(r, 2)))
        r_old = st.median(
            min(K.ADP_SD_CAP, max(3.0, 0.15 * p["adp"])) / p["adp_sd"]
            for p in band)
        if not (0.85 <= r_old <= 1.15):
            old_off.append((lo, hi, round(r_old, 2)))
    assert not shipped_off, (
        f"the shipped 0.11/2.0 pair no longer tracks the market: {shipped_off}. "
        "Either the market regime moved (the reserved-reversion case — take it "
        "to Cory with the backtest) or someone changed the constants.")
    assert old_off, (
        "the retired 0.15/3.0 pair now TRACKS the market — the regime has "
        "moved back toward the old constants and the ordered backtest verdict "
        "matters more, not less")


def test_THIS_FILE_CANNOT_BE_SATISFIED_BY_THE_TWO_SIDES_AGREEING():
    """The defect C named, asserted directly. Parity compares keepers.py to a
    transcription of survival.js; both could be wrong together and it would
    still pass. Every threshold above is computed from the artifact, so the only
    way to green a wrong rule here is to change the market."""
    src = Path(__file__).read_text()
    # STRIP EVERY DOCSTRING, not just the module one. The first cut checked the
    # raw body and went red on the word "survival.js" inside another test's
    # PROSE -- a guard failing on its own documentation, the same shape
    # seat_pick_order hit from the other direction (passing on it).
    body = re.sub(r'"""[\s\S]*?"""', "", src)
    body = "\n".join(l for l in body.splitlines() if not l.lstrip().startswith("#"))
    # ⚠️ THE NEEDLE IS BUILT AT RUNTIME so this assertion cannot match ITSELF.
    # Written as a literal it went red on its own text -- the sixth instance of
    # the absence-assertion trap this session, and the only one that bit inside
    # the guard whose whole job is independence.
    needle = "survival" + ".js"
    assert needle not in body, (
        "this file READS the engine source -- it has become a second parity "
        "test and lost the independence that is its entire reason to exist")
    assert "adp_sd_for" in body, "it must actually grade the shipped rule"


# ── THE DUPLICATE THAT NO PARITY TEST COULD SEE ─────────────────────────────
def test_adp_py_does_not_carry_its_OWN_copy_of_the_rate():
    """adp.py:349 hardcoded `0.15` — a third implementation, in the file that
    STAMPS the board. keepers.py and survival.js were pinned to each other and
    neither of them was this one, so changing the rate would have moved the
    keeper optimizer and the war room and left the shipped `adp_sd` alone."""
    src = (ROOT / "draft" / "adp.py").read_text()
    body = "\n".join(l for l in src.splitlines() if not l.lstrip().startswith("#"))
    import re
    # DOCSTRINGS TOO. The first cut matched `0.22 * adp` inside fitted_sd's
    # PROSE, which documents the retired heuristic -- a false alarm raised by
    # this file against its own subject's history.
    body = re.sub(r'"""[\s\S]*?"""', "", body)
    hits = re.findall(r"(?<![\w.])0\.(?:15|22|11)\s*\*\s*adp", body)
    assert not hits, f"adp.py carries its own dispersion rate again: {hits}"
    assert "_K.ADP_SD_RATE" in body, (
        "adp.py must read the one set of constants, not restate them")


def test_the_fitted_rule_only_fires_where_nothing_was_published():
    """Blast radius, asserted rather than remembered. A published sd always wins,
    so this change touches the deep pool and almost nothing I draft from."""
    fitted_rows = [p for p in ART["players"]
                   if p.get("adp_sd_source") == "clamped-linear"]
    inside = [p for p in fitted_rows if (p.get("adp") or 999) <= 150]
    assert len(inside) <= 5, (
        f"{len(inside)} rows inside pick 150 depend on the fitted rule — this "
        "stopped being a deep-pool constant and the change needs re-arguing "
        "against survival at my own picks")
