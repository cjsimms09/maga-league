# TERRITORY: A
"""register 472's guard: a fold an OPEN prereg holds blind cannot be read by
accident, and the registry cannot outlive the prereg."""
import io
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "draft" / "tools"))
import blind_folds as BF  # noqa: E402

FOLDS = [{"arm": "props_weekly", "seasons": [2023], "ledger_row": "P347", "owner": "D", "grade_by": "2026-09-06"}]


def test_blind_fold_is_refused_and_named():
    out = io.StringIO()
    assert BF.refuse_if_blind("props_weekly", 2023, ["x"], FOLDS, out) is False
    assert "P347" in out.getvalue() and "owner D" in out.getvalue()


def test_open_folds_and_the_override_pass():
    assert BF.refuse_if_blind("props_weekly", 2024, ["x"], FOLDS, io.StringIO()) is True
    assert BF.refuse_if_blind("usage", 2023, ["x"], FOLDS, io.StringIO()) is True
    assert BF.refuse_if_blind("props_weekly", 2023, ["x", BF.OVERRIDE], FOLDS, io.StringIO()) is True


def test_refusal_exits_2_outside_tests():
    import pytest
    with pytest.raises(SystemExit) as e:
        BF.refuse_if_blind("props_weekly", 2023, ["x"], FOLDS)
    assert e.value.code == 2


def test_registry_row_outliving_its_ledger_row_is_stale():
    text = "| P347 | claim | 08-27 | D | 09-06 | OPEN | — | — |\n| P1 | c | 08-18 | A | 09-01 | ✅ GRADED | TRUE | x |\n"
    assert BF.stale(FOLDS, text) == []
    graded = [{**FOLDS[0], "ledger_row": "P1"}]
    assert BF.stale(graded, text)[0]["ledger_status"] == "✅ GRADED"
    assert BF.stale([{**FOLDS[0], "ledger_row": "P999"}], text)[0]["ledger_status"] is None


def test_the_committed_registry_matches_the_live_ledger():
    # KNOWN POSITIVE: the registry holds at least one fold today (P347/2023);
    # and none of its rows has outlived its ledger row.
    folds = BF.load()
    assert folds, "registry empty — if every prereg is graded, delete this assertion with the row"
    assert BF.stale(folds) == [], BF.stale(folds)
