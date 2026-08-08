"""Lock the master-sheet import — the league's founding document (Est. 2016)."""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
ARCHIVE = HERE / "data" / "master_sheet_archive.json"


def _load():
    assert ARCHIVE.exists(), "run draft/import_master_sheet.py first"
    return json.loads(ARCHIVE.read_text())


def test_provenance_and_hash():
    a = _load()
    assert a["provenance"] == "source: master_sheet"
    assert len(a["source_sha256"]) == 64


def test_all_seasons_2016_to_2027():
    a = _load()
    for y in range(2016, 2028):
        assert str(y) in a["seasons"], f"missing season {y}"


def test_pots_are_buyin_times_ten():
    a = _load()
    for y, s in a["seasons"].items():
        if s.get("buy_in"):
            assert s["pot"] == s["buy_in"] * 10, f"{y} pot {s['pot']} != buy_in*10"


def test_pre_sleeper_payout_shapes():
    a = _load()
    # 2016: $100 buy-in, $1000 pot, RS 225/50, playoffs 300/200/125/100.
    s16 = a["seasons"]["2016"]
    assert s16["buy_in"] == 100 and s16["pot"] == 1000
    assert s16["regular_season"]["1st"]["amount"] == 225
    assert s16["playoffs"]["1st"]["amount"] == 300


def test_2022_trades_captured():
    a = _load()
    trades = a["seasons"]["2022"]["trades"]
    assert len(trades) == 2
    assert any("Akers" in t for t in trades)


def test_ten_owners_with_records():
    a = _load()
    tw = a["total_winnings"]
    assert len(tw) == 10
    cory = tw["Cory"]
    assert cory["wins"] == 49 and cory["loss"] == 36
    # Career from year columns is authoritative.
    assert cory["career_from_years"] == 3520


def test_stale_total_flagged():
    a = _load()
    # Several owners' sheet Total excludes 2025 — the documented data-spine example.
    stale = [n for n, d in a["total_winnings"].items() if d["stale"]]
    assert len(stale) >= 5
    assert "Michael" in stale   # excludes his 2025 $1325


def test_payments_2026_present():
    a = _load()
    assert len(a["payments_2026"]) == 10
