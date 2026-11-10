"""THE ADP DRAFT MARKET IS SEASONAL, AND SCOPING FOR THAT MUST NOT BECOME A BYPASS.

Cory, 2026-11-10, on making the model useful for next year's draft. The answer
turned out not to be a new data source.

⛔ WHAT HAPPENED. `test_adp_sd_measured.py` grades our ADP-dispersion formula
against the market's published dispersion. Every row it grades is tagged
`ffc-published` — a standard deviation FantasyFootballCalculator computes from
MOCK DRAFTS. Mock drafts stop when real drafts stop. Measured in the per-source
archive:

    09-10: 187 rows · 09-11: 160 · 09-12: 157 · 09-13: 154 · then nothing

FFC did not break; it wound down. `draft/tools/ffc_adp_probe.py` returns
FFC_NO_LONGER_SERVES_2026 and PROVES ITSELF against 2024/2025, so the 2026 null
is a finding rather than a broken fetch — rule 3e the right way round.
FantasyPros, a year-round RANKING service rather than a draft market, keeps
publishing 365 rows a day beside it.

⚠️ AND IT HELD THE DRAFT BOARD SHUT FOR TWO MONTHS. The nightly build runs this
suite as its acceptance gate, so six failures in that one file counted as
BLOCKING. The board last published 2026-09-10 — three days before FFC's last
day — and was refused every night after (registers 538, 546).

THE FIX IS SCOPE, NOT A LOWERED BAR, which is what register 538 ruled:
"SCOPE when the 150 floor applies; do not lower it." Out of season the honest
verdict is UNMEASURABLE — with no market there is no such claim as "our formula
does not track the market". In season it fails exactly as loudly as before.

⚠️ THE RISK THIS FILE EXISTS FOR: a scope is one edit away from a bypass. These
tests pin all three states, because only the third one proves the teeth are
still there.

    committed board, draft-season rows present -> RUNS      (coverage kept)
    market wound down AND rows gone            -> SKIPS     (board unblocked)
    market LIVE but rows gone                  -> FAILS     (a real break)

Measured when it shipped: 12 passed/1 skipped · 2 passed/11 skipped exit 0 ·
6 failed exit 1, in that order.

Run: python -m pytest draft/tests/test_draft_market_scoping.py -q
"""
from __future__ import annotations

import datetime as dt
import importlib
import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "draft" / "tests"))


def _load(monkeypatch, archive_days, board_ffc_rows):
    """Import test_adp_sd_measured with a synthetic archive and board."""
    arch = {"series": [{"source": "ffc", "observed_at": d, "rows": {"1": 10.0}}
                       for d in archive_days]}
    board = {"players": [
        {"player_id": str(i), "name": f"p{i}", "position": "RB",
         "adp": 20 + (i % 150), "adp_sd": 2.0 + (i % 97) / 10.0,
         "adp_sd_source": "ffc-published"}
        for i in range(board_ffc_rows)]}
    ap = ROOT / "draft" / "data" / "external_source_prices.json"
    bp = ROOT / "public" / "draft_data.json"
    real_read = Path.read_text

    def fake_read(self, *a, **k):
        if self == ap:
            return json.dumps(arch)
        if self == bp:
            return json.dumps(board)
        return real_read(self, *a, **k)

    monkeypatch.setattr(Path, "read_text", fake_read)
    sys.modules.pop("test_adp_sd_measured", None)
    return importlib.import_module("test_adp_sd_measured")


def test_a_wound_down_market_with_no_rows_SKIPS():
    """The off-season state. The board must not be refused for the absence of a
    market that does not exist."""
    mp = pytest.MonkeyPatch()
    try:
        m = _load(mp, ["2026-09-13"], 0)
        assert m._LIVE is False, m._WHY
        assert m._MEASURABLE is False
        assert m.needs_live_market.args[0] is True, "should skip"
        assert "wound down" in m._WHY
    finally:
        mp.undo()


def test_a_LIVE_market_with_no_rows_still_FAILS():
    """⚠️ THE TOOTH. If this stops holding, the scope has become a bypass and a
    real capture break publishes a board with no measured dispersion behind it."""
    mp = pytest.MonkeyPatch()
    try:
        m = _load(mp, [dt.date.today().isoformat()], 0)
        assert m._LIVE is True, m._WHY
        assert m._MEASURABLE is False
        assert m.needs_live_market.args[0] is False, (
            "a live market with no measured rows MUST NOT skip — that is a "
            "capture break and the gate has to refuse it")
    finally:
        mp.undo()


def test_rows_on_the_board_keep_the_grade_RUNNING_even_out_of_season():
    """Coverage is not thrown away because the calendar moved: the committed
    board still carries draft-season dispersions and they are still graded."""
    mp = pytest.MonkeyPatch()
    try:
        m = _load(mp, ["2026-09-13"], 200)
        assert m._LIVE is False
        assert m._MEASURABLE is True
        assert m.needs_live_market.args[0] is False, "should RUN"
    finally:
        mp.undo()


def test_an_unreadable_archive_assumes_the_market_is_LIVE():
    """Fail closed. Not knowing whether the market exists must not silence a
    guard — refusing to skip is the safe direction."""
    mp = pytest.MonkeyPatch()
    try:
        ap = ROOT / "draft" / "data" / "external_source_prices.json"
        real_read = Path.read_text

        def fake_read(self, *a, **k):
            if self == ap:
                raise OSError("gone")
            return real_read(self, *a, **k)

        mp.setattr(Path, "read_text", fake_read)
        sys.modules.pop("test_adp_sd_measured", None)
        m = importlib.import_module("test_adp_sd_measured")
        live, why = m._draft_market_is_live()
        assert live is True and "assuming the market is live" in why
    finally:
        mp.undo()
        sys.modules.pop("test_adp_sd_measured", None)


def test_the_threshold_cannot_fire_on_a_LIVE_market():
    """The 21-day bar is calibrated against the real archive, not guessed: the
    longest gap between consecutive FFC days in season is ONE day, and the
    off-season gap is now 58. Anything in between separates them cleanly, and
    this fails if someone tightens it toward a live market's cadence."""
    arch = json.loads(
        (ROOT / "draft" / "data" / "external_source_prices.json").read_text())
    ser = arch.get("series") or arch
    days = sorted({str(e.get("observed_at")) for e in ser
                   if isinstance(e, dict) and e.get("source") == "ffc"
                   and (e.get("rows") or {})})
    assert len(days) >= 10, f"only {len(days)} FFC days — cannot calibrate"
    gaps = [(dt.date.fromisoformat(b) - dt.date.fromisoformat(a)).days
            for a, b in zip(days, days[1:])]
    assert max(gaps) < 21, (
        f"the longest in-season FFC gap is now {max(gaps)} days, which the "
        "21-day wound-down threshold would mistake for the off-season")
