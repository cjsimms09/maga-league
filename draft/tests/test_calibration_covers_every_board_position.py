# TERRITORY: D
"""EVERY POSITION THE BOARD PRICES MUST BE CALIBRATED OR DECLARED UNMEASURED.

DEFECT GUARDED: absent-vs-zero, at the artifact level.

projection_error_calibration.json reports `cells_unmeasurable: 0` — nothing was
too thin to measure. That is true only because K and DEF were never in the
universe at all: 20 cells = 4 positions x 5 bands, and the graded stores contain
zero K and zero DEF player-weeks (2023 and 2024) against a scoring table that
prices both and a board that ranks 44 kickers and 32 defences.

So the artifact says "nothing was unmeasurable" while 76 players Cory can draft
are priced on `proj_ceiling_source: "gaussian_z"` — the unmeasured Gaussian
construction — and every one of them is correctly stamped as such, by a field
nothing reads (DEFECT-REGISTER 8b).

"Measured and refused" and "never asked" are different objects. This file makes
the difference visible, because the artifact currently reports the second as if
it were neither.

RESOLVED 2026-08-17 by the second of the two legitimate routes: the artifact now
declares K and DEF in `positions_not_measured`, each with a reason, an unblock
condition, an owner and a recheck date. Nothing was estimated for them — a
declared refusal is the answer and a guessed discount would be fitting.

It stays `repo_parity` even though it is green. The marker is not about being
red; it is about never being able to REFUSE A BOARD PUBLISH. This check compares
an artifact to the board, so a future board carrying a new position would fail
it — and blocking the rebuild over a calibration gap is the worst available
response to one. Root cause, source availability and the exact column mapping:
draft/audit/kdef_calibration_p0_2026-08-17.md.

Run: python -m pytest draft/tests/test_calibration_covers_every_board_position.py -q
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
BOARD = ROOT / "public" / "draft_data.json"
CALIBRATION = ROOT / "draft" / "backtest" / "projection_error_calibration.json"

#: An artifact may declare a position unmeasured instead of carrying cells for
#: it — but the declaration has to exist and carry a reason.
DECLARATION_KEY = "positions_not_measured"


def board_positions() -> dict[str, int]:
    players = json.loads(BOARD.read_text())["players"]
    out: dict[str, int] = {}
    for p in players:
        pos = p.get("position")
        if pos and p.get("proj_ceiling") is not None:
            out[pos] = out.get(pos, 0) + 1
    return out


def calibrated_positions() -> set[str]:
    cells = json.loads(CALIBRATION.read_text()).get("cells") or {}
    return {k.split("|")[0] for k in cells}


def test_KNOWN_POSITIVE_the_detector_finds_the_positions_that_are_calibrated():
    """CONTROL. The assertion below is "no position is uncovered", which passes
    perfectly on a reader that finds no positions at all — an empty board, a
    renamed key, a moved artifact. Require the four known-good positions first.
    """
    cal = calibrated_positions()
    assert {"QB", "RB", "WR", "TE"} <= cal, (
        f"the four skill positions should all be calibrated; found {sorted(cal)}")

    board = board_positions()
    assert len(board) >= 4 and sum(board.values()) > 100, (
        f"the board did not load properly: {board}")


@pytest.mark.repo_parity
def test_every_priced_board_position_is_calibrated_or_declared():
    """K and DEF are priced on the unmeasured gaussian_z construction while the
    skill positions carry measured-2023-25-p90. This was RED until the artifact
    declared them; it is green now because the refusal is written down, not
    because anything was estimated.

    `repo_parity` pins REPO STATE and — the load-bearing half — guarantees this
    can never refuse a board publish. The publication gate runs
    `-m "not repo_parity"`, so a calibration gap cannot block the rebuild that
    would fix it, which days before a draft would be the worst available
    response.

    IT GOES RED AGAIN, correctly, if the declaration is deleted, if a position
    is dropped from it while still unmeasured, or if a future board prices a
    position nobody has considered. The route OUT of the declaration is
    measurement: the source serves 569 kicker rows in the file we already fetch
    (2024, 43 kickers), dropped at fetch_component_stats.py:104.
    """
    cal = json.loads(CALIBRATION.read_text())
    declared = set(cal.get(DECLARATION_KEY) or {})
    # `cells_unmeasurable` counts cells that were TRIED and found too thin, so a
    # position nobody attempted contributes 0 and reads identically to one that
    # had no problem. Reported in the failure rather than asserted separately —
    # it is the same defect stated a second way, and one finding earns one flag.
    unmeasurable = cal.get("cells_unmeasurable", 0)
    uncovered = {pos: n for pos, n in board_positions().items()
                 if pos not in calibrated_positions() and pos not in declared}
    assert not uncovered, (
        "board positions priced with no calibration cell and no declared "
        f"refusal: {uncovered}. Every one of these players carries a "
        "proj_ceiling built by the unmeasured gaussian_z construction while the "
        "skill positions use measured p90/p10. "
        f"The artifact reports cells_unmeasurable={unmeasurable}, which counts "
        "only cells that were attempted — these positions were never in the "
        "universe, so they read as 'no problem'. See "
        "draft/audit/kdef_calibration_p0_2026-08-17.md")
