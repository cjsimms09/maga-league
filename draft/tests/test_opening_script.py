"""OPENING-SCRIPT MACHINERY — lock the generator + the regeneration contract."""
from __future__ import annotations
import json
import sys
from pathlib import Path

DRAFT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(DRAFT))
import opening_script as OS  # noqa: E402


def _inputs():
    board = json.loads((DRAFT.parent / "public" / "draft_data.json").read_text())
    predicted = json.loads((DRAFT / "data" / "predicted_keepers.json").read_text())
    return board, predicted


def test_script_targets_my_real_live_picks():
    board, predicted = _inputs()
    s = OS.generate(board, predicted)
    my = (board.get("pick_order") or {}).get("my_picks") or []
    assert s["my_picks"] == my
    scripted = [e["pick"] for e in s["branches"]["primary_both_tes_gone"]]
    assert scripted == my[:OS.PICKS_TO_SCRIPT]          # 34, 41, 54 today


def test_primary_branch_excludes_every_predicted_keeper_and_mine():
    board, predicted = _inputs()
    s = OS.generate(board, predicted)
    gone = OS.predicted_kept_ids(predicted) | {
        str(k.get("player_id")) for k in board.get("kept_players", [])}
    for entry in s["branches"]["primary_both_tes_gone"]:
        for c in entry["candidates"]:
            assert c["player_id"] not in gone, f"{c['name']} is predicted kept but scripted"


def test_contingency_returns_bowers_to_the_board():
    board, predicted = _inputs()
    s = OS.generate(board, predicted)
    names = {c["name"] for e in s["branches"]["contingency_bowers_available"]
             for c in e["candidates"]}
    prim = {c["name"] for e in s["branches"]["primary_both_tes_gone"]
            for c in e["candidates"]}
    assert "Brock Bowers" in names        # available in the contingency…
    assert "Brock Bowers" not in prim     # …and gone in the primary


def test_candidates_carry_survival_and_respect_the_floor():
    board, predicted = _inputs()
    s = OS.generate(board, predicted)
    for branch in s["branches"].values():
        for e in branch:
            assert 1 <= len(e["candidates"]) <= OS.CANDIDATES_PER_PICK
            for c in e["candidates"]:
                assert c["survival"] >= OS.SURVIVAL_FLOOR or c is e["candidates"][0]


def test_fingerprint_and_staleness_contract():
    board, predicted = _inputs()
    s = OS.generate(board, predicted)
    fp = OS.fingerprint(board, predicted)
    assert OS.is_stale(s["meta"], fp) == []             # fresh against its own inputs
    # A board rebuild moves the fingerprint -> the script announces itself stale.
    moved = dict(fp, board_built_at="2026-08-21T00:00:00Z")
    assert "board_built_at" in OS.is_stale(s["meta"], moved)
    # A keeper designation landing (slate change) does too — the keeper-watch hook.
    moved2 = dict(fp, predicted_slates_hash="deadbeefcafe")
    assert "predicted_slates_hash" in OS.is_stale(s["meta"], moved2)
    # And a slot assignment (Sleeper draft order) is a regeneration event.
    moved3 = dict(fp, my_slot=9)
    assert "my_slot" in OS.is_stale(s["meta"], moved3)


def test_doctrine_enrollment_follows_the_19b_verdict():
    board, predicted = _inputs()
    s = OS.generate(board, predicted)
    d = s["meta"]["doctrine"]
    cc = DRAFT / "backtest" / "cory-conditional.json"
    if cc.exists():
        result = json.loads(cc.read_text())
        winner = next((r for r in result["leaderboard"]
                       if r["verdict"].startswith("WINNER")), None)
        if winner:
            # The winner IS the plan, with its evidence cited — never a bare name.
            assert d["enrolled"] != "Balanced Value (the control)"
            assert "19b" in d["why"] and "CI" in d["why"]
        else:
            assert d["enrolled"].startswith("Balanced Value")
    else:
        # No verdict on file -> the control, honestly.
        assert d["enrolled"].startswith("Balanced Value")
