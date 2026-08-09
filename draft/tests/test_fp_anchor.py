"""FantasyPros PRIMARY anchor wiring — the merge + the coverage gate that guarantees a
thin/failed FP fetch can never drop the board below its FFC baseline.

The live FP fetch is CI-only egress, so here we STUB the fetcher and test the two things
that are pure logic: (1) merge_primary_over_ffc layers FP over FFC correctly and preserves
FFC's bye, and (2) build_fantasypros_table returns None (→ caller keeps FFC) whenever the
crosswalked coverage is below the gate. Run: python -m pytest draft/tests/test_fp_anchor.py -q
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backtest"))
import adp as ADP  # noqa: E402
import fantasypros_adp as FP  # noqa: E402


def _sleeper_pool():
    # Minimal Sleeper /players dump: id -> record build_index understands.
    return {
        "1": {"player_id": "1", "full_name": "Ja'Marr Chase", "position": "WR", "team": "CIN", "search_rank": 1},
        "2": {"player_id": "2", "full_name": "Bijan Robinson", "position": "RB", "team": "ATL", "search_rank": 2},
        "3": {"player_id": "3", "full_name": "Jahmyr Gibbs", "position": "RB", "team": "DET", "search_rank": 3},
    }


def test_merge_fp_over_ffc_overrides_and_gap_fills_and_keeps_bye():
    ffc = {
        "1": {"adp": 2.0, "adp_sd": 1.0, "adp_source": "ffc", "bye": 10},
        "2": {"adp": 3.0, "adp_sd": 1.0, "adp_source": "ffc", "bye": 5},
        "9": {"adp": 40.0, "adp_sd": 4.0, "adp_source": "ffc", "bye": 7},   # FP won't cover this one
    }
    fp = {
        "1": {"adp": 1.0, "adp_sd": 1.0, "adp_source": "fantasypros"},       # overrides FFC, no bye of its own
        "2": {"adp": 4.0, "adp_sd": 1.0, "adp_source": "fantasypros"},
    }
    merged, stats = ADP.merge_primary_over_ffc(ffc, fp)
    assert merged["1"]["adp"] == 1.0 and merged["1"]["adp_source"] == "fantasypros"
    assert merged["1"]["bye"] == 10                     # FFC's bye preserved onto the FP row
    assert merged["9"]["adp_source"] == "ffc"           # FP miss -> FFC gap-fill survives
    assert stats == {"primary_priced": 2, "ffc_gap_fill": 1, "total_in_table": 3}


def test_build_fp_table_crosswalks_when_coverage_clears_gate(monkeypatch):
    parsed = [
        {"name": "Ja'Marr Chase", "position": "WR", "team": "CIN", "adp": 1.2},
        {"name": "Bijan Robinson", "position": "RB", "team": "ATL", "adp": 2.4},
        {"name": "Jahmyr Gibbs", "position": "RB", "team": "DET", "adp": 3.1},
    ]
    monkeypatch.setattr(FP, "fetch", lambda year, half_ppr=True: ("<stub>", "http://fp", {}))
    monkeypatch.setattr(FP, "parse", lambda text: parsed)
    table, diag = ADP.build_fantasypros_table(_sleeper_pool(), year=2026, min_rows=3)
    assert table is not None
    assert set(table) == {"1", "2", "3"}
    assert table["1"]["adp"] == 1.2 and table["1"]["adp_source"] == "fantasypros"
    assert table["1"]["match_method"].startswith("fp:")
    assert diag["fp_matched"] == 3 and diag["fp_rows_parsed"] == 3


def test_build_fp_table_returns_none_when_too_thin_to_trust(monkeypatch):
    # Only one row parses -> below the gate -> None so the caller keeps FFC untouched.
    monkeypatch.setattr(FP, "fetch", lambda year, half_ppr=True: ("<stub>", "http://fp", {}))
    monkeypatch.setattr(FP, "parse", lambda text: [{"name": "Ja'Marr Chase", "position": "WR", "team": "CIN", "adp": 1.2}])
    table, diag = ADP.build_fantasypros_table(_sleeper_pool(), year=2026, min_rows=3)
    assert table is None
    assert "reason" in diag and "keeping FFC" in diag["reason"]


def test_build_fp_table_none_when_fetch_empty(monkeypatch):
    monkeypatch.setattr(FP, "fetch", lambda year, half_ppr=True: (None, "http://fp", {"page_error": "URLError"}))
    monkeypatch.setattr(FP, "parse", lambda text: [])
    table, diag = ADP.build_fantasypros_table(_sleeper_pool(), year=2026, min_rows=3)
    assert table is None
    assert diag["fp_rows_parsed"] == 0
