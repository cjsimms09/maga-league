# TERRITORY: C
"""THE FROZEN METHOD MUST STAY FROZEN, and the ceiling must stay a ceiling.

The defect this file exists to prevent was measured, not imagined: v0's ceiling was
the available player with the most realized points, and it left TE/K/DEF unfilled in
all three seasons, scored BELOW the actual roster in 2024, and made the capture
fraction divide by ~zero (7896%).
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "backtest"))
import oracle_capture as O  # noqa: E402

SLOTS = ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "K", "DEF", "BN"]


def test_a_keeper_is_not_a_decision_slot():
    """MUTATION: score keepers as choices. Every arm is credited or blamed for the
    same fixed rows, which compresses every difference between them."""
    picks = [{"roster_id": 1, "player_id": "A", "is_keeper": True, "pick_no": 1, "round": 1},
             {"roster_id": 1, "player_id": "B", "is_keeper": False, "pick_no": 2, "round": 1}]
    for i, p in enumerate(picks):
        p["_draft"], p["_order"] = 0, i
    assert [p["player_id"] for p in O.decision_slots(picks)] == ["B"]


def test_a_player_CORY_really_took_stays_available_to_a_counterfactual_arm():
    """The counterfactual's defining rule. In the fiction he never took him, so he is
    still on the board at Cory's later picks. MUTATION: remove Cory's real picks too,
    and every arm drafts against a board depleted by choices it did not make."""
    picks = [{"roster_id": 1, "player_id": "MINE", "is_keeper": False, "pick_no": 1, "round": 1},
             {"roster_id": 2, "player_id": "THEIRS", "is_keeper": False, "pick_no": 2, "round": 1},
             {"roster_id": 1, "player_id": "LATER", "is_keeper": False, "pick_no": 3, "round": 1}]
    for i, p in enumerate(picks):
        p["_draft"], p["_order"] = 0, i
    seen = []

    def spy(p, taken):
        seen.append(set(taken))
        return "X%d" % len(seen)
    O.replay(picks, spy)
    assert "MINE" not in seen[1], "Cory's own real pick must NOT deplete the board"
    assert "THEIRS" in seen[1], "another owner's real pick MUST deplete the board"


def test_an_unfilled_starting_slot_is_reported_as_a_HOLE():
    """A roster that captured more total value while leaving a starting slot empty is
    worse, not better. MUTATION: count positions and never check them against the
    slots — the shape question stops being answerable."""
    pos = {"q": "QB", "r1": "RB", "r2": "RB", "w1": "WR", "w2": "WR", "k": "K"}
    sh = O.shape(list(pos), SLOTS, pos)
    assert sh["holes"].get("TE") == 1 and sh["holes"].get("DEF") == 1
    assert "QB" not in sh["holes"]


def test_FLEX_never_assigns_a_position():
    """FLEX is RB/WR/TE by construction, so a FLEX appearance cannot name a position.
    MUTATION: let it assign one, and a guessed position silently fills a roster hole
    that is the whole point of the shape question."""
    s = {"roster_positions": SLOTS,
         "weeks": {"1": [{"starters": ["q", "r1", "r2", "w1", "w2", "t", "FLEXGUY", "k", "d"],
                          "players_points": {}}]}}
    pos = O.positions(s)
    assert pos.get("t") == "TE" and pos.get("k") == "K"
    assert "FLEXGUY" not in pos, "the FLEX slot must not name a position"


def test_the_lineup_score_IGNORES_bench_points():
    """Bench points are worth nothing. MUTATION: sum the roster instead of the lineup,
    and an arm that hoards value at one position outranks one that fills its slots."""
    pos = {"q1": "QB", "q2": "QB", "k": "K"}
    wk = {"1": {"q1": 30.0, "q2": 30.0, "k": 5.0}}
    # two QBs, one slot: the second cannot start
    assert O.starting_points(["q1", "q2", "k"], wk, SLOTS, pos) == 35.0


def test_the_CEILING_must_beat_the_shape_blind_maximiser_on_LINEUP_points():
    """THE v0 DEFECT, as a test. A board where the top scorers are all QBs: the
    shape-blind arm takes QB after QB and cannot field a lineup; the slot-aware arm
    takes one QB and fills slots. MUTATION: revert the ceiling to raw points, and the
    capture fraction divides by ~zero exactly as it did in 2024."""
    pos = {"q1": "QB", "q2": "QB", "q3": "QB", "r": "RB", "w": "WR", "k": "K"}
    pts = {"q1": 400.0, "q2": 390.0, "q3": 380.0, "r": 100.0, "w": 90.0, "k": 50.0}
    wk = {"1": dict(pts)}
    picks = [{"roster_id": 1, "player_id": "z", "is_keeper": False, "pick_no": i, "round": 1}
             for i in range(1, 4)]
    for i, p in enumerate(picks):
        p["_draft"], p["_order"] = 0, i
    blind = [r["player_id"] for r in O.replay(picks, O.chooser_oracle(pts))]
    aware = O.replay_stateful(picks, O.chooser_oracle_lineup(pts, wk, SLOTS, pos))
    b = O.starting_points(blind, wk, SLOTS, pos)
    a = O.starting_points(aware, wk, SLOTS, pos)
    assert blind == ["q1", "q2", "q3"], blind
    assert a > b, "the slot-aware ceiling must outscore the shape-blind one on LINEUP points"


def test_the_method_version_is_STAMPED_so_a_series_cannot_silently_change_method():
    """A series measured three different ways is not a series. MUTATION: drop the
    version, and a future run's number is indistinguishable from this one's."""
    assert O.METHOD_VERSION.startswith("oracle-capture/v1")
