# TERRITORY: A
"""The snapshot must carry the SITUATION, not just the number.

Cory, 2026-08-17: "What other massive hole like that do we have in our data??
That's ridiculous.. wtf" — after VAR_BACKUP and VAR_INJURED came back
unmeasurable because depth charts and injury designations exist only for today.

The sweep found proj_series.py digging that same hole: a capture built
expressly to make a clean 2027 grade possible was storing `{"11563": 415.88}`
and nothing else. These tests pin the fix, and pin the two distinctions that
make the captured data honest rather than merely bigger.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import proj_series as PS  # noqa: E402


def _board():
    return [
        {"player_id": "1", "position": "WR", "injury_status": "Q",
         "depth_chart_order": 2, "team": "CLE", "years_exp": 0, "adp": 147.0},
        {"player_id": "2", "position": "RB", "team": "KC", "years_exp": 5, "adp": 12.0},
        {"player_id": "3", "position": "TE"},
    ]


def test_the_fields_we_could_not_measure_are_the_fields_now_captured():
    """VAR_BACKUP needed depth_chart_order and VAR_INJURED needed
    injury_status. If either leaves this tuple, 2027 inherits today's hole."""
    assert "depth_chart_order" in PS.SITUATION_FIELDS
    assert "injury_status" in PS.SITUATION_FIELDS


def test_a_field_the_source_did_not_serve_is_omitted_not_nulled():
    """'Sleeper reported no injury designation' (healthy) must stay
    distinguishable from 'our fetch did not carry the field' (unknown). One
    null merges two different facts."""
    sit = PS.situation_from_board(_board())
    assert sit["1"]["injury_status"] == "Q"
    assert "injury_status" not in sit["2"], "a healthy player must not get a null"
    assert "depth_chart_order" not in sit["2"]


def test_the_situation_rides_on_the_snapshot_and_matches_its_population():
    snap = PS.append_snapshot([], "2026-08-17", "sleeper",
                              {"1": 127.4, "2": 200.0, "3": 80.0},
                              situation_by_id=PS.situation_from_board(_board()))[0]
    assert set(snap["situation"]) <= set(snap["proj"]), (
        "the situation must never describe a player the snapshot does not price")
    assert snap["situation"]["1"]["depth_chart_order"] == 2


def test_a_trimmed_player_takes_his_situation_with_him():
    snap = PS.append_snapshot([], "2026-08-17", "sleeper",
                              {"1": 127.4, "2": 200.0, "3": 80.0},
                              top_n=1,
                              situation_by_id=PS.situation_from_board(_board()))[0]
    assert set(snap["proj"]) == {"2"}
    assert set(snap["situation"]) == {"2"}


def test_absent_because_trimmed_is_recoverable_from_absent_because_unserved():
    """787 players appear in at least one Sleeper snapshot and 400 in every one.
    Without n_offered a reader cannot tell whether a gap means the source did
    not serve him or our own top_n cut him."""
    ours = PS.append_snapshot([], "2026-08-17", "s", {"1": 5.0, "2": 4.0, "3": 3.0},
                              top_n=2)[0]
    assert ours["n_offered"] == 3 and len(ours["proj"]) == 2, "WE trimmed"
    theirs = PS.append_snapshot([], "2026-08-17", "s", {"1": 5.0}, top_n=700)[0]
    assert theirs["n_offered"] == len(theirs["proj"]), "the SOURCE is the limit"


def test_omitting_the_situation_leaves_every_existing_reader_working():
    """Backward compatibility, both directions: a caller that passes nothing
    must produce the old shape, with no empty key to be misread as 'captured
    and found nothing'."""
    snap = PS.append_snapshot([], "2026-08-17", "fp", {"1": 100.0})[0]
    assert "situation" not in snap
    assert snap["proj"] == {"1": 100.0}


def test_the_build_actually_passes_the_situation_through():
    """A capture module nobody calls with the new argument would leave the hole
    open while looking fixed."""
    src = (Path(__file__).resolve().parents[1] / "build.py").read_text()
    assert "situation_from_board(players)" in src
    assert src.count("situation_by_id=situation") == 2, (
        "both the Sleeper and the FantasyPros freeze must carry it")


# ── the DISTRIBUTION rides with the projection (2026-08-17) ─────────────────

def test_the_snapshot_freezes_the_floor_and_ceiling_not_just_the_mean():
    """Cory: "have we made sure these ceilings and floors are correct for
    snapshots going forward??" The answer was NO — the snapshot froze a bare
    projection, so a 2027 grade could ask "did the projection hit" and never
    "was our ceiling calibrated", which is the question that turned out to
    matter."""
    for f in ("proj_floor", "proj_ceiling", "proj_sd"):
        assert f in PS.DIST_FIELDS


def test_the_snapshot_freezes_WHAT_THE_CEILING_MEANS_too():
    """proj_ceiling changed meaning on 2026-08-17. Without the source stamp a
    2027 reader sees two boards with one field name holding two different
    quantities and no way to tell them apart."""
    for f in ("proj_floor_source", "proj_ceiling_source", "proj_sd_source"):
        assert f in PS.DIST_FIELDS


def test_the_distribution_matches_the_priced_population():
    board = [{"player_id": "1", "proj_floor": 5.0, "proj_ceiling": 300.0,
              "proj_ceiling_source": "measured-2023-25-p90"},
             {"player_id": "2", "proj_floor": 1.0, "proj_ceiling": 100.0}]
    snap = PS.append_snapshot([], "2026-08-17", "sleeper", {"1": 250.0},
                              dist_by_id=PS.distribution_from_board(board))[0]
    assert set(snap["dist"]) == {"1"}, (
        "the distribution must never describe a player the snapshot does not price")
    assert snap["dist"]["1"]["proj_ceiling_source"] == "measured-2023-25-p90"


def test_omitting_the_distribution_keeps_the_old_shape():
    snap = PS.append_snapshot([], "2026-08-17", "fp", {"1": 100.0})[0]
    assert "dist" not in snap


def test_the_build_freezes_the_distribution_on_both_sources():
    src = (Path(__file__).resolve().parents[1] / "build.py").read_text()
    assert "distribution_from_board(players)" in src
    assert src.count("dist_by_id=dist") == 2


def test_the_pre_draft_freeze_records_what_the_ceiling_meant():
    import freeze_pre_draft as FZ
    for f in ("proj_floor", "proj_ceiling", "proj_floor_source", "proj_ceiling_source"):
        assert f in FZ.PLAYER_FIELDS, (
            f"{f} missing — a replay in 2027 could not tell a measured p90 from "
            "a Gaussian under the same field name")
