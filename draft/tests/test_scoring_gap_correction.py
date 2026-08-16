# TERRITORY: A
"""THE SCORING-GAP CORRECTION BACKTEST, AND THE WAYS IT GOES QUIETLY WRONG.

`exp_scoring_gap_correction.py` (SG-1) tests whether correcting the ADP feed's
4-point-passing-TD assumption to this league's real 6-point rule would have
predicted the room and earned dollars on the three real seasons. The experiment
installs nothing; these tests guard the machinery it measures with.

The defects each test is shaped around are the ones this repo has already been
burned by: the raw scoring gap wearing a VORP label (test_nflverse_qb_scoring's
founding defect), a hand-typed constant drifting from its committed source, a
refusal that returns a confident zero, and a correction that quietly touches
positions it claims not to.

Run: python3 -m pytest draft/tests/test_scoring_gap_correction.py -q
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
for _p in (str(ROOT / "draft" / "backtest"), str(ROOT / "draft")):
    if _p not in sys.path:
        sys.path.insert(0, _p)

import exp_scoring_gap_correction as SG  # noqa: E402


# ── fixtures ─────────────────────────────────────────────────────────────────
def toy_curve():
    """A clean monotone board: value falls 1 vorp per slot from 100."""
    players = [{"adp": float(i), "vorp": 100.0 - i, "position": "RB"}
               for i in range(1, 101)]
    return SG.price_curve(players)


def toy_board_players():
    """Two QBs above replacement, one at it, plus RB filler for the curve."""
    qbs = [
        {"player_id": "q1", "name": "QB One", "position": "QB", "adp": 20.0,
         "proj_mean": 400.0, "vorp": 60.0},
        {"player_id": "q2", "name": "QB Two", "position": "QB", "adp": 40.0,
         "proj_mean": 370.0, "vorp": 30.0},
        {"player_id": "q3", "name": "QB Repl", "position": "QB", "adp": 60.0,
         "proj_mean": 340.0, "vorp": 0.0},
    ]
    filler = [{"player_id": f"r{i}", "name": f"RB {i}", "position": "RB",
               "adp": float(i), "vorp": 100.0 - i, "proj_mean": 200.0}
              for i in range(1, 101) if i not in (20, 40, 60)]
    return qbs + filler


# ── the correction's arithmetic ──────────────────────────────────────────────
def test_THE_CORRECTION_IS_VORP_BASED_never_the_raw_gap():
    """THE FOUNDING DEFECT OF THIS QUESTION: raising every QB's score raises
    the replacement QB's score too, so a correction built on the raw gap
    over-shifts every quarterback by the ~35-40 points the position gains as a
    whole. MUTATION: hand the raw gap to the price curve. The naive ladder
    must shift MORE than the correct one, and the experiment must keep them
    distinct rather than quietly reporting one as the other."""
    players = toy_board_players()
    curve = SG.price_curve(players)
    repl = 340.0
    share = 0.11
    correct = SG.market_qb_ladder(players, [], share, repl, curve)
    naive = SG.market_qb_ladder(players, [], share, repl, curve, naive=True)
    for c, n in zip(correct["detail"], naive["detail"]):
        assert n["shift_slots"] >= c["shift_slots"], (c, n)
    # The top QB must show a strictly larger naive shift — if the two ladders
    # coincide, one of them is not computing what it claims to.
    assert naive["detail"][0]["shift_slots"] > correct["detail"][0]["shift_slots"]


def test_A_REPLACEMENT_LEVEL_QB_IS_NOT_MOVED():
    """A QB projecting at replacement gains no value ABOVE replacement from
    the scoring change — his market slot must be untouched. If he moves, the
    replacement subtraction is not reaching the shift."""
    players = toy_board_players()
    curve = SG.price_curve(players)
    out = SG.market_qb_ladder(players, [], 0.11, 340.0, curve)
    repl_row = next(d for d in out["detail"] if d["name"] == "QB Repl")
    assert repl_row["shift_slots"] == 0.0, repl_row


def test_THE_CORRECTION_ONLY_EVER_MOVES_A_PRICE_EARLIER():
    """corrected_adp_for answers 'how much earlier does the extra value place
    him' — it must never return a LATER slot, and zero extra value must return
    the original price exactly (the correction may not re-litigate the
    market's existing opinion of a player)."""
    curve = toy_curve()
    assert SG.corrected_adp_for(curve, 50.0, 0.0) == 50.0
    assert SG.corrected_adp_for(curve, 50.0, -5.0) == 50.0
    for dv in (1.0, 5.0, 25.0, 500.0):
        assert SG.corrected_adp_for(curve, 50.0, dv) <= 50.0


def test_THE_PRICE_CURVE_FIT_IS_MONOTONE_AND_MEAN_PRESERVING():
    """PAVA on a sequence with a violation must come back non-increasing and
    keep the pooled block at the violators' mean — a fit that just sorts the
    data would pass monotonicity while inventing a different board."""
    fitted = SG._pava_decreasing([1, 2, 3, 4], [10.0, 4.0, 6.0, 1.0])
    assert all(a >= b for a, b in zip(fitted, fitted[1:])), fitted
    assert fitted[1] == fitted[2] == 5.0, fitted


def test_IT_REFUSES_RATHER_THAN_GUESSING_A_GAP_SHARE(tmp_path):
    """The failure mode this repo keeps finding: a missing input silently
    replaced by a plausible constant. No committed QB stat rows must mean a
    refusal that carries no result shape, never a default share."""
    empty = tmp_path / "statlines.json"
    empty.write_text(json.dumps({"players": {
        "r1": {"name": "A Back", "projection_row": {"rush_yd": 1200}}}}))
    out = SG.measured_gap_share(statlines_path=empty)
    assert out["measured"] is False and "why" in out
    assert "share_mid" not in out


def test_THE_GAP_SHARE_IS_MEASURED_FROM_THE_COMMITTED_ROWS_not_typed():
    """The share must be recomputed from draft/audit/rule12_statlines.json on
    every run, and each row must satisfy the arithmetic identity the whole
    experiment stands on: gap == 2*pass_td - 1*pass_int (the two overridden
    terms and nothing else). A drifted hand copy fails here."""
    out = SG.measured_gap_share()
    assert out["measured"] is True
    assert len(out["rows"]) >= 2, "the committed sample carries at least two QB rows"
    raw = json.loads(SG.STATLINES.read_text())["players"]
    for row in out["rows"]:
        line = raw[row["player_id"]]["projection_row"]
        expected = 2.0 * float(line["pass_td"]) - 1.0 * float(line["pass_int"])
        assert abs(row["gap"] - expected) < 0.01, (row, expected)
        assert 0.05 < row["share"] < 0.20, row
    assert out["share_lo"] <= out["share_mid"] <= out["share_hi"]


def test_THE_LADDER_PRICES_ONLY_QUARTERBACKS():
    """The correction's placebo is structural: it claims to touch QB prices
    and nothing else. A running back appearing in the ladder would mean the
    claimed placebo does not exist."""
    players = toy_board_players()
    curve = SG.price_curve(players)
    out = SG.market_qb_ladder(players, [], 0.11, 340.0, curve)
    assert all(d["name"].startswith("QB") for d in out["detail"])
    assert len(out["raw"]) == 3


# ── the real-data premise ────────────────────────────────────────────────────
def test_THE_ROOM_TAKES_QBS_EARLIER_THAN_THE_RAW_LADDER_18_of_18():
    """The premise the whole experiment stands on, re-derived from the real
    board and the three real drafts rather than remembered from a document:
    in the pool-depletion frame (keepers included), the raw market ladder
    prices every one of the first six QBs LATER than the room actually took
    him, in every season — the 18/18 finding. If a board rebuild or a history
    re-harvest breaks this, the experiment's report must be re-read before it
    is cited again."""
    board = json.loads(SG.BOARD.read_text())
    history = json.loads(SG.HISTORY.read_text())
    pos = dict(json.loads(SG.POSITIONS.read_text())["positions"])
    for p in board.get("players", []):
        if p.get("player_id") and p.get("position"):
            pos.setdefault(str(p["player_id"]), p["position"])
    share = SG.measured_gap_share()
    curve = SG.price_curve(board["players"])
    repl = float(board["replacement"]["replacement_points"]["QB"])
    ladder = SG.market_qb_ladder(board["players"], board.get("kept_players") or [],
                                 share["share_mid"], repl, curve)
    n = 0
    for s in history["seasons"]:
        if str(s.get("season")) not in SG.SEASONS:
            continue
        picks = SG.real_draft(s)
        if not picks:
            continue
        room = SG.room_qb_picks(picks, pos, include_keepers=True)
        errs = SG.slot_errors(room, ladder["raw"], SG.TOP_SLOTS)
        assert len(errs) == SG.TOP_SLOTS
        assert all(e > 0 for e in errs), (s.get("season"), errs)
        n += len(errs)
    assert n == 18, f"expected 18 slot observations across 3 seasons, got {n}"


def test_FLIPS_NEVER_FIRE_FOR_A_SEAT_THAT_ALREADY_HAS_ITS_QUARTERBACK():
    """A flip is a changed wait-on-QB decision; a seat holding a kept QB has
    no such decision, and a seat's windows after its first QB pick are moot.
    A flip fired there would price a decision nobody faced."""
    positions = {"k1": "QB", "a1": "RB", "a2": "QB", "b1": "RB", "b2": "RB",
                 "b3": "QB"}
    picks = [
        {"pick_no": 1, "roster_id": 1, "player_id": "k1", "is_keeper": True},
        {"pick_no": 2, "roster_id": 2, "player_id": "b1", "is_keeper": None},
        {"pick_no": 3, "roster_id": 1, "player_id": "a1", "is_keeper": None},
        {"pick_no": 4, "roster_id": 2, "player_id": "b2", "is_keeper": None},
        {"pick_no": 5, "roster_id": 1, "player_id": "a2", "is_keeper": None},
        {"pick_no": 6, "roster_id": 2, "player_id": "b3", "is_keeper": None},
    ]
    # One QB (the keeper) is gone before every live window, so the NEXT QB is
    # ladder slot 2: priced 5.5 raw / 3.5 corrected. For seat 2's window
    # (2 -> 4) that is a flip shape (raw safe, corrected gone)...
    flips = SG.flips_for_season(picks, positions, raw=[1.0, 5.5], cor=[1.0, 3.5])
    assert all(f["roster_id"] != 1 for f in flips), (
        "seat 1 holds a kept QB — it has no wait-on-QB decision to flip")
    # ...and seat 2 genuinely gets it (the fixture is live, not vacuous).
    assert any(f["roster_id"] == 2 for f in flips), flips


def test_A_FLIP_REQUIRES_THE_TWO_LADDERS_TO_DISAGREE_ACROSS_THE_WINDOW():
    """Both-say-safe and both-say-gone change no behavior and must not be
    counted — a 'flip' that both models agree on would inflate the decision
    count the dollar arm divides by."""
    positions = {"b1": "RB", "b2": "RB", "q9": "QB"}
    picks = [
        {"pick_no": 2, "roster_id": 2, "player_id": "b1", "is_keeper": None},
        {"pick_no": 4, "roster_id": 2, "player_id": "b2", "is_keeper": None},
        {"pick_no": 9, "roster_id": 2, "player_id": "q9", "is_keeper": None},
    ]
    assert SG.flips_for_season(picks, positions, raw=[8.0], cor=[6.0]) == []
    assert SG.flips_for_season(picks, positions, raw=[3.0], cor=[2.0]) == []


# ── the committed result ─────────────────────────────────────────────────────
def test_THE_EXPERIMENT_RAN_AND_ITS_RESULT_IS_COMMITTED():
    """A measurement wired nowhere is the rule-14 defect this repo keeps
    finding. The committed result must exist, must have run, and must say in
    its own words that it installs nothing — the standing policy for anything
    touching scoring/valuation before Cory's sign-off."""
    out = json.loads((SG.HERE / "exp_scoring_gap_correction.json").read_text())
    assert out.get("ran") is True
    assert "nothing" in (out.get("installs") or "").lower()
    assert "measurement" in (out.get("installs") or "").lower()
    agg = out["arm_b_slot_errors"]["keepers_included"]["aggregate"]
    for arm in ("raw", "corrected", "naive", "room_fitted_loso"):
        assert agg[arm]["n"] == 18, arm
    assert out["arm_c_window_survival"]["n_windows"] > 300
    assert out.get("confounds"), "the result must carry its confounds with it"
