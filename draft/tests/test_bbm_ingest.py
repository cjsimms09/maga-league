"""BBM ingest + exp 24 winning-shape — pure core, verified WITHOUT egress.

A tiny hand-built pick-by-pick fixture (the real BBM schema) proves the parser
groups rosters, carries the position crosswalk in-file, computes the winning-shape
delta, and streams the dead-zone aggregate memory-safely. The real ingest fetches
from storage.googleapis.com (reachable) or CI-streams the multi-GB dumps; that is
not tested here — the maths is.

Run: python -m pytest draft/tests/test_bbm_ingest.py -q
"""
import io
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backtest"))
import bbm_ingest as ING          # noqa: E402
import exp24_bbm_shape as E24      # noqa: E402

HEADER = ("tournament_round_draft_entry_id,player_name,player_id,position_name,"
          "projection_adp,team_pick_number,overall_pick_number,pick_points,"
          "roster_points,made_playoffs")

# Two rosters: entry A is WR-heavy and scores high; entry B is RB-heavy and scores low.
ROWS = [
    # entry A — outcome 200, WR-heavy
    "A,WR1,wr1,WR,1.0,1,1,50,200,1",
    "A,WR2,wr2,WR,2.0,2,2,40,200,1",
    "A,WR3,wr3,WR,3.0,3,3,30,200,1",
    "A,RB1,rb1,RB,4.0,4,4,20,200,1",
    # entry B — outcome 100, RB-heavy
    "B,RB1,rb1,RB,4.0,1,5,10,100,1",
    "B,RB2,rb2,RB,5.0,2,6,10,100,1",
    "B,RB3,rb3,RB,6.0,3,7,10,100,1",
    "B,WR1,wr1,WR,1.0,4,8,10,100,1",
]


def _fixture_csv(tmp_path) -> Path:
    p = tmp_path / "bbm_fixture.csv"
    p.write_text("\n".join([HEADER] + ROWS) + "\n")
    return p


def test_parse_groups_rosters_and_carries_the_crosswalk(tmp_path):
    parsed = ING.parse_pick_by_pick(_fixture_csv(tmp_path))
    assert len(parsed) == 2
    a = next(r for r in parsed if r["entry_id"] == "A")
    assert len(a["ids"]) == 4 and a["outcome"] == 200.0
    # position travels in-file — no external id map needed
    assert a["pos_by_id"]["wr1"] == "WR" and a["pos_by_id"]["rb1"] == "RB"
    assert a["picks"][0]["draft_round"] == 1 and a["picks"][0]["adp"] == 1.0


def test_na_cells_are_none_not_zero(tmp_path):
    p = tmp_path / "na.csv"
    p.write_text("\n".join([HEADER, "C,X,x,WR,NA,1,1,NA,NA,0"]) + "\n")
    parsed = ING.parse_pick_by_pick(p)
    assert parsed[0]["outcome"] is None            # NA outcome is not a silent 0.0
    assert parsed[0]["picks"][0]["adp"] is None


def test_winning_shape_delta_direction(tmp_path):
    # Top roster (A) is WR-heavy vs the field, so the winner-minus-field WR delta > 0.
    parsed = ING.parse_pick_by_pick(_fixture_csv(tmp_path))
    core = E24.analyse(parsed, top_fracs=(0.5,))
    cut = core["by_cut"]["0.50"]
    assert cut["winner_minus_field_fraction"]["WR"] > 0
    assert cut["winner_minus_field_fraction"]["RB"] < 0


def test_translate_to_our_15_is_a_fraction_of_15(tmp_path):
    parsed = ING.parse_pick_by_pick(_fixture_csv(tmp_path))
    out = E24.run(_fixture_csv(tmp_path))
    tr = out["finding"]["value"]["translated_to_our_15"]
    assert abs(sum(tr.values()) - 15.0) < 0.2       # fractions*15 sum to ~15 rounds


def test_finding_crosses_wall_for_shape_but_not_execution(tmp_path):
    out = E24.run(_fixture_csv(tmp_path))
    f = out["finding"]
    assert f["source_tier"] == "bbm-supporting"
    assert f["crosses_wall"] is True                # construction crosses
    assert "scoring_is_bbm" in f["caveats"]         # but the scoring caveat travels with it


def test_stream_positional_by_round_is_memory_safe_aggregate(tmp_path):
    # Feed the fixture as a line iterator (what CI does with the 4.8 GB stream).
    lines = io.StringIO("\n".join([HEADER] + ROWS) + "\n")
    agg = ING.stream_positional_by_round(lines)
    # RB round 1: entry B's rb1 at 10 pts -> mean 10; WR round 1: entry A's wr1 at 50.
    assert agg["RB"][1]["points_mean"] == 10.0
    assert agg["WR"][1]["points_mean"] == 50.0
    assert agg["WR"][1]["adp_mean"] == 1.0
