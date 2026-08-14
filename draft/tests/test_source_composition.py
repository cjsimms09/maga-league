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


def test_the_QB_THRESHOLD_CLEARS_and_that_alone_would_have_been_WRONG():
    """The finding. Checking the number the hypothesis names would have
    confirmed superflex; the position it does NOT name is what refutes it."""
    assert R["qb_clears_superflex_threshold"], (
        "the QB delta no longer clears the superflex threshold — the example "
        "this file is built on has changed and the lesson needs re-deriving")
    assert not R["superflex_signature_holds"], (
        "TE no longer moves further than QB, so the QB delta may now genuinely "
        "be superflex rather than a positional disagreement — re-argue before "
        "trusting the conclusion that no source switch is warranted")
    assert R["worst_position"] == "TE", R["worst_position"]


def test_SUPERFLEX_CANNOT_MOVE_TIGHT_ENDS_which_is_why_the_signature_fails():
    """Stated as arithmetic rather than as prose, so it cannot rot. A 2QB
    contaminant lifts quarterbacks; if TE moves further than QB, whatever is
    moving them is not about how many QBs a lineup starts."""
    te = R["per_pos"]["TE"]["median_delta"]
    qb = R["per_pos"]["QB"]["median_delta"]
    assert te < qb, f"TE {te} is not further than QB {qb}"
    assert abs(te) > 2 * abs(qb) * 0.9, (
        f"TE {te} is no longer roughly twice QB {qb} — the margin that makes "
        "the misattribution obvious has narrowed")


def test_the_centre_gap_is_the_SD_BASIS_MISMATCH_and_is_independently_confirmed():
    """C measured median 8.3 / p90 29.4 / max 48.9 for the FP-mean-with-FFC-sd
    transplant. Reproduced here from the raw per-source prices rather than from
    C's report, which is what makes it a second measurement."""
    g = R["centre_gap_inside_150"]
    assert g["n"] >= 100
    assert 7.0 <= g["median"] <= 10.0, g["median"]
    assert g["max"] > 40, g["max"]
