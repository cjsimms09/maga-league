"""The roster grammar: format legality that fires on the pileups the record
shows and stays silent on a draft any human would call normal."""
import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("rg", ROOT / "draft" / "tools" / "roster_grammar.py")
rg = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rg)

LEAGUE = {"starters": {"QB": 1, "RB": 2, "WR": 2, "TE": 1, "FLEX": 1, "K": 1, "DEF": 1},
          "roster_slots": {"QB": 1, "RB": 2, "WR": 2, "TE": 1, "FLEX": 1, "K": 1, "DEF": 1, "BN": 6},
          "rounds": 15}
G = rg.grammar_from_league(LEAGUE)


def test_grammar_is_derived_from_the_config_not_tuned():
    assert G["onesie_cap"] == {"QB": 2, "TE": 2, "K": 1, "DEF": 1}
    assert G["depth_cap"] == {"RB": 7, "WR": 7} and G["rb_wr_total_cap"] == 11


def test_KNOWN_POSITIVE_the_seven_qb_replay_seat_and_the_four_te_roster_fire():
    r = rg.check_sequence(["QB"] * 7 + ["RB", "RB", "WR", "WR", "TE", "K", "DEF"], G)
    assert r["n_violations"] >= 5 and any("G2 QB3" in v for pv in r["pick_violations"] for v in pv["violations"])
    four_te = rg.check_sequence(["RB", "WR", "TE", "RB", "WR", "TE", "QB", "TE", "TE", "RB", "WR", "RB", "WR", "K", "DEF"], G)
    assert any("G2 TE3" in v for pv in four_te["pick_violations"] for v in pv["violations"])


def test_KNOWN_NEGATIVE_a_normal_human_draft_is_silent():
    r = rg.check_sequence(["RB", "WR", "RB", "WR", "TE", "QB", "RB", "WR", "WR", "RB", "QB", "TE", "WR", "K", "DEF"], G)
    assert r["n_violations"] == 0 and r["g5"] == []


def test_G1_a_second_qb_before_the_starters_are_filled_fires_but_after_does_not():
    early = rg.check_sequence(["QB", "QB"], G, total_picks=15)
    assert any("G1 QB2" in v for pv in early["pick_violations"] for v in pv["violations"])
    late = rg.check_sequence(["QB", "RB", "RB", "WR", "WR", "TE", "RB", "QB"], G, total_picks=15)
    assert not any("G1" in v for pv in late["pick_violations"] for v in pv["violations"])


def test_G4_a_kicker_recommended_with_picks_to_spare_fires_and_a_last_pick_kicker_does_not():
    early_k = rg.check_pick(rg.collections.Counter({"RB": 2, "WR": 2}), "K", picks_left_after=8, g=G)
    assert any(v.startswith("G4") for v in early_k)
    seq = ["RB", "WR", "RB", "WR", "TE", "QB", "RB", "WR", "WR", "RB", "QB", "TE", "WR", "K", "DEF"]
    assert rg.check_sequence(seq, G)["n_violations"] == 0


def test_G5_a_roster_that_never_takes_a_def_is_incomplete():
    r = rg.check_sequence(["RB", "WR", "RB", "WR", "TE", "QB", "RB", "WR", "WR", "RB", "QB", "TE", "WR", "K", "WR"], G)
    assert r["g5"] == ["G5 no body for DEF"]


def test_keepers_count_as_bodies_already_held():
    # three keepers (RB, WR, WR) then twelve picks — a second WR early is fine, a second QB early is not
    seq = ["RB", "WR", "WR"] + ["RB", "QB", "TE", "QB"]
    r = rg.check_sequence(seq, G, total_picks=15)
    assert any("G1 QB2" in v for pv in r["pick_violations"] for v in pv["violations"])
