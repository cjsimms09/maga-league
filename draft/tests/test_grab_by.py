"""Grab-by model — pure core. Run: python -m pytest draft/tests/test_grab_by.py -q"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import grab_by as G  # noqa: E402
import config_schema  # noqa: E402

CFG = config_schema.load(Path(__file__).resolve().parents[1] / "config" / "league_config.json")


def _p(pid, pos, proj, adp, tier=1, tsize=2, drop=0.0, name=None):
    return {"player_id": pid, "position": pos, "proj_mean": proj, "raw_adp": adp,
            "tier": tier, "tier_size": tsize, "tier_drop": drop, "name": name or pid}


def test_positional_need_and_flex():
    roster = [_p("a", "RB", 200, 20), _p("b", "RB", 180, 30), _p("c", "QB", 300, 40)]
    dedicated, flex_open = G.positional_need(roster, CFG)
    assert dedicated["QB"] == 0          # 1 QB filled
    assert dedicated["RB"] == 0          # 2 RB filled
    assert dedicated["WR"] == 2          # both WR slots still open
    assert flex_open == 1                # no RB/WR/TE surplus yet -> flex open
    # a 3rd RB creates a surplus that covers the flex
    dedicated2, flex2 = G.positional_need(roster + [_p("d", "RB", 150, 60)], CFG)
    assert flex2 == 0


def test_is_live_need_flex_eligibility():
    dedicated = {"QB": 0, "RB": 0, "WR": 0, "TE": 0}
    assert G.is_live_need("TE", dedicated, flex_open=1) is True      # TE can take the open flex
    assert G.is_live_need("QB", dedicated, flex_open=1) is False     # QB is not flex-eligible
    assert G.is_live_need("WR", {"WR": 1}, flex_open=0) is True      # dedicated WR still open


def test_expected_best_available_respects_survival():
    # early ADP player will NOT survive to a late pick; later-ADP one will
    avail = [_p("stud", "WR", 260, 5), _p("mid", "WR", 210, 80)]
    # at pick 60, the stud (adp 5) is long gone; expected best is the mid
    eb = G.expected_best_available(avail, pick=60)
    assert eb["player_id"] == "mid"


def test_grab_by_pick_is_last_pick_quality_survives():
    avail = [_p("elite", "TE", 230, 45, drop=26), _p("cliff", "TE", 190, 70)]
    # my picks 34, 41, 54: elite (adp 45) likely survives 34/41, gone by 54
    gb = G.grab_by_pick(avail, [34, 41, 54], best_now=230.0, tol=3.0)
    assert gb in (34, 41)            # not 54 — quality has dropped off the cliff by then


def test_te_cliff_says_grab_qb_smooth_says_wait():
    # TE: 2 elite then a 26-pt cliff -> high EVLW -> act
    te = [_p("bowers", "TE", 233, 45, drop=26, name="Bowers"),
          _p("mcbride", "TE", 215, 45, drop=26, name="McBride"),
          _p("loveland", "TE", 189, 68, name="Loveland"),
          _p("warren", "TE", 175, 72, name="Warren")]
    # QB: smooth ramp, no cliff -> low EVLW -> wait
    qb = [_p(f"qb{i}", "QB", 360 - 4 * i, 50 + 6 * i, name=f"QB{i}") for i in range(14)]
    players = te + qb
    roster = [_p("r1", "RB", 200, 10), _p("r2", "RB", 190, 15),
              _p("w1", "WR", 185, 20), _p("w2", "WR", 180, 25)]   # RB/WR filled; TE + QB + flex open
    drafted = set()
    rep = G.report(players, drafted, roster, my_remaining=[34, 54], cfg=CFG,
                   positions=("QB", "TE"))
    by_pos = {r["position"]: r for r in rep["positions"]}
    # TE: the elite pair won't survive to pick 54 -> meaningful EVLW -> act
    assert by_pos["TE"]["verdict"] in ("TAKE-NOW", "GRAB-SOON")
    assert by_pos["TE"]["evlw"] > 20
    # QB: smooth, plenty survive -> wait
    assert by_pos["QB"]["verdict"] == "WAIT"
    assert by_pos["QB"]["evlw"] < 15


def test_filled_position_is_not_a_grab():
    players = [_p("te1", "TE", 230, 45, drop=26)]
    # TE dedicated slot filled AND the flex covered by an RB surplus -> TE not a live need
    roster = [_p("mine", "TE", 240, 40),
              _p("rb1", "RB", 200, 10), _p("rb2", "RB", 190, 15), _p("rb3", "RB", 150, 60)]
    rep = G.report(players, set(), roster, my_remaining=[34, 54], cfg=CFG, positions=("TE",))
    assert rep["positions"][0]["verdict"] == "FILLED"


def test_drafted_players_are_removed_from_available():
    players = [_p("gone", "TE", 233, 45, drop=26), _p("here", "TE", 190, 70)]
    rep = G.report(players, {"gone"}, roster=[], my_remaining=[34, 54], cfg=CFG, positions=("TE",))
    assert rep["positions"][0]["best_now"]["player_id"] == "here"

# ── WIRE-COVERED ONESIE CAP — parity with grabby.js onesieCap (2026-08-17) ──
# Cory: "Model still recommended QB too often." The measured basis and the rule
# live in grab_by.py's WIRE_COVERED block; these tests drive both arms.

def _qb_board():
    return [
        {"player_id": "1", "name": "QB30", "position": "QB", "proj_mean": 360, "raw_adp": 30},
        {"player_id": "2", "name": "QB55", "position": "QB", "proj_mean": 340, "raw_adp": 55},
        {"player_id": "3", "name": "QB120", "position": "QB", "proj_mean": 320, "raw_adp": 120},
        {"player_id": "4", "name": "QB130", "position": "QB", "proj_mean": 315, "raw_adp": 130},
    ]


def test_FAIL_ARM_without_lrm_bounds_the_old_myopic_verdict_fires():
    rep = G.report(_qb_board(), set(), [{"position": "RB"}], [33, 48], CFG, positions=("QB",))
    assert rep["positions"][0]["verdict"] in ("TAKE-NOW", "GRAB-SOON")


def test_the_cap_reads_the_lrm_boundary_and_waits():
    rep = G.report(_qb_board(), set(), [{"position": "RB"}], [33, 48], CFG,
                   positions=("QB",), lrm_bounds={"QB": 93})
    row = rep["positions"][0]
    assert row["verdict"] == "WAIT"
    assert "replacement-level" in row["wire_covered"]
    assert row["grab_by_pick"] == 48


def test_a_boundary_inside_the_window_leaves_urgency_alone():
    base = G.report(_qb_board(), set(), [{"position": "RB"}], [33, 48], CFG, positions=("QB",))
    tight = G.report(_qb_board(), set(), [{"position": "RB"}], [33, 48], CFG,
                     positions=("QB",), lrm_bounds={"QB": 20})
    assert tight["positions"][0]["verdict"] == base["positions"][0]["verdict"]


def test_TE_is_not_wire_covered():
    assert "TE" not in G.WIRE_COVERED and set(G.WIRE_COVERED) == {"QB", "K", "DEF"}

