"""EXP 34 pure core — verifiable WITHOUT egress.

The egress (FFC ADP + nflverse points) runs in CI; the DECISION LOGIC — who is
best-available by each source, which picks are gradeable, how the arms summarize
and when they read 'inconclusive' — is pure and tested here against a fixture, so
a bug in the alignment is caught in the sandbox, not discovered in a CI number.

Run: python -m pytest draft/tests/test_exp34.py -q
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backtest"))
import exp34 as X


# A tiny 1-round-ish fixture. Cory is roster_id 2 this season. Overall picks 1..6.
# Players A..F with player_ids "a".."f". is_keeper marks a keeper (not a decision).
SEASON = {
    "season": 2024,
    "owners": {"1": {"display_name": "someone"}, "2": {"display_name": "coryjsimms"}},
    "drafts": [{
        "picks": [
            {"pick_no": 1, "round": 1, "roster_id": 1, "player_id": "a", "is_keeper": None},
            {"pick_no": 2, "round": 1, "roster_id": 2, "player_id": "b", "is_keeper": None},  # cory
            {"pick_no": 3, "round": 1, "roster_id": 1, "player_id": "c", "is_keeper": None},
            {"pick_no": 4, "round": 1, "roster_id": 2, "player_id": "d", "is_keeper": True},   # cory KEEPER
            {"pick_no": 5, "round": 1, "roster_id": 1, "player_id": "e", "is_keeper": None},
            {"pick_no": 6, "round": 1, "roster_id": 2, "player_id": "f", "is_keeper": None},  # cory
        ],
    }],
}
PICKS = X.real_draft(SEASON)
# Real ADP rank (lower = better): the market loves 'a', then 'c', 'e', 'b', 'f'.
ADP = {"a": 1.0, "c": 2.0, "e": 3.0, "b": 4.0, "f": 5.0}   # 'd' has no ADP entry
# Realized points: cory's 'b' was great, 'f' was a bust.
PTS = {"a": 100, "b": 200, "c": 150, "e": 120, "f": 10}    # 'd' ungradeable (no row)


def test_resolves_cory_and_excludes_keepers():
    assert X.cory_roster_id(SEASON) == 2
    decisions = X.cory_decisions(PICKS, 2)
    ids = [p["player_id"] for p in decisions]
    assert ids == ["b", "f"], ids            # 'd' (keeper) excluded


def test_board_before_and_best_available_by_source():
    # At cory's pick 2, only 'a' is gone; board = b,c,d,e,f.
    board = X.board_before(PICKS, 2)
    assert board == {"b", "c", "d", "e", "f"}
    # Market best available (lowest ADP on the board) = 'c' (a is gone).
    assert X.best_available_by_adp(board, ADP) == "c"
    # Room best available (earliest OTHER pick still on board) = 'c' (pick_no 3).
    assert X.best_available_by_room(board, PICKS, 2) == "c"


def test_align_drops_ungradeable_and_computes_deltas():
    rows = X.align_decisions(2024, PICKS, 2, ADP, PTS)
    assert [r["took"] for r in rows] == ["b", "f"]
    b = rows[0]
    # pick 2 'b'(200) vs market-best 'c'(150) -> +50; room-best 'c'(150) -> +50.
    assert b["adp_delta"] == 50 and b["room_delta"] == 50
    f = rows[1]
    # pick 6 'f'(10): board before 6 = {f} plus 'd'(keeper still there, ungradeable).
    # market-best on board with an ADP entry = 'f' itself (d has none) -> delta 0;
    # room-best (other pick still on board) — none left -> None.
    assert f["adp_delta"] == 0
    assert f["room_delta"] is None


def test_ungradeable_taken_pick_is_dropped_not_zeroed():
    # If cory's 'f' had NO realized-points row, that decision must vanish, not score 0.
    pts_missing_f = {k: v for k, v in PTS.items() if k != "f"}
    rows = X.align_decisions(2024, PICKS, 2, ADP, pts_missing_f)
    assert [r["took"] for r in rows] == ["b"]


def test_summary_inconclusive_reads_as_binding_harder_direction():
    # Two decisions, deltas +50 and 0 -> CI will span zero at n=2 -> inconclusive.
    rows = X.align_decisions(2024, PICKS, 2, ADP, PTS)
    arm = X.summarize_arm(rows, "adp_delta")
    assert arm["n"] == 2
    assert arm["verdict"] == "inconclusive"          # CI spans zero at tiny n
    assert arm["ci95"][0] <= arm["mean_delta"] <= arm["ci95"][1]


def test_clear_win_and_loss_verdicts():
    # Construct a clean win: three positive deltas, tight.
    rows = [{"season": y, "adp_delta": d} for y, d in [(2023, 40), (2024, 45), (2025, 50)]]
    win = X.summarize_arm(rows, "adp_delta")
    assert win["verdict"] == "beat" and win["sign_consistent"] is True
    loss_rows = [{"season": y, "adp_delta": d} for y, d in [(2023, -40), (2024, -45), (2025, -50)]]
    loss = X.summarize_arm(loss_rows, "adp_delta")
    assert loss["verdict"] == "lost" and loss["sign_consistent"] is True


def test_assemble_builds_pools_and_forgone_value_decisions():
    # proj = our walk-forward value; adp = market; realized = outcome; tiers for cliffs.
    proj = {"b": 100, "c": 130, "e": 90, "f": 70, "a": 200}
    adp = {"a": 1.0, "c": 2.0, "e": 3.0, "b": 4.0, "f": 5.0}
    realized = {"a": 100, "b": 200, "c": 150, "e": 120, "f": 10}
    tiers = {"a": 1, "c": 1, "e": 2, "b": 2, "f": 3}
    pools, decisions = X.assemble(2024, PICKS, 2, proj=proj, adp_rank=adp,
                                  realized=realized, tiers=tiers)
    # two decisions (b at pick 2, f at pick 6); 'd' keeper excluded, ungradeable dropped.
    assert [d["took"] for d in decisions] == ["b", "f"]
    b = decisions[0]
    # at pick 2, board=b,c,d,e,f; ADP-preferred available = 'c' (a gone).
    assert b["adp_best"] == "c"
    # forgone value = proj[c] - proj[b] = 130 - 100 = 30 projected points paid to reach.
    assert b["forgone_value"] == 30
    # 'b' is tier 2, 'c' is tier 1 -> the deviation crosses a cliff.
    assert b["crosses_cliff"] is True
    # the pool carries our_proj/adp/realized for correlation.
    assert pools[0] and all(set(("pid", "our_proj", "adp", "realized")) <= set(r) for r in pools[0])


def test_build_result_shape():
    rows = X.align_decisions(2024, PICKS, 2, ADP, PTS)
    r = X.build_result(rows)
    assert r["underpowered"] is True
    assert set(("arm_A_market_adp", "arm_B_room_revealed", "decisions")) <= set(r)
