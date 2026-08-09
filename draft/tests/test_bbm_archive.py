"""BBM durable archive — the gzipped column-subset round-trips losslessly for the
fields exp 24 reads. Run: python -m pytest draft/tests/test_bbm_archive.py -q
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backtest"))
import bbm_archive as AR  # noqa: E402

HEADER = ("draft_id,player_name,tournament_round_draft_entry_id,player_id,position_name,"
          "projection_adp,team_pick_number,overall_pick_number,pick_points,roster_points,made_playoffs")
ROWS = [
    "d1,Player A,E1,p1,RB,8.5,1,1,171.1,195.6,1",
    "d1,Player B,E1,p2,WR,12.0,2,2,33.7,195.6,1",
]


def test_archive_keeps_only_the_used_columns_and_round_trips(tmp_path):
    raw = tmp_path / "raw.csv"
    raw.write_text("\n".join([HEADER] + ROWS) + "\n")
    gz = tmp_path / "sub.csv.gz"
    stats = AR.archive(raw, gz)
    assert stats["rows"] == 2
    assert stats["gz_bytes"] > 0
    back = AR.read_archive(gz)
    assert len(back) == 2
    # only the KEEP columns survive (draft_id / player_name are dropped)
    assert set(back[0].keys()) == set(AR.KEEP)
    assert "draft_id" not in back[0] and "player_name" not in back[0]
    # the values we use are preserved exactly
    assert back[0]["player_id"] == "p1" and back[0]["position_name"] == "RB"
    assert back[0]["roster_points"] == "195.6" and back[0]["overall_pick_number"] == "1"


def test_missing_optional_column_becomes_blank_not_a_crash(tmp_path):
    raw = tmp_path / "raw.csv"
    # no projection_adp column at all (finals dumps have it NA; a variant might omit it)
    raw.write_text("tournament_round_draft_entry_id,player_id,position_name,team_pick_number,"
                   "overall_pick_number,pick_points,roster_points,made_playoffs\n"
                   "E1,p1,RB,1,1,10,100,1\n")
    gz = tmp_path / "sub.csv.gz"
    AR.archive(raw, gz)
    back = AR.read_archive(gz)
    assert back[0]["projection_adp"] == ""   # filled blank, present in the schema
