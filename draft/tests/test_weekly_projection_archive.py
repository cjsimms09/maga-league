# TERRITORY: C
"""weekly_projection_archive — pure logic (fingerprint, raw_and_scored,
build_archive_doc) tested against SYNTHETIC fixtures shaped exactly like
the real sources. join_by_sleeper_id/sleeper_rows are
external_source_projections.py's own (rule 11, imported unmodified) and
already covered by that file's context — this file tests the NEW glue:
raw-beside-scored assembly, change detection, and the archive doc shape.
"""
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
DRAFT = HERE.parent
sys.path.insert(0, str(DRAFT / "tools"))
sys.path.insert(0, str(DRAFT / "backtest"))
sys.path.insert(0, str(DRAFT))

import weekly_projection_archive as WPA  # noqa: E402
import adp as ADP  # noqa: E402

SCORING = {"pass_yd": 0.04, "pass_td": 6.0, "rush_yd": 0.1, "rush_td": 6.0,
          "rec_yd": 0.1, "rec": 0.5}

SLEEPER_PLAYERS = {
    "101": {"full_name": "Puka Nacua", "position": "WR", "team": "LAR", "search_rank": 10},
    "102": {"full_name": "Amon-Ra St. Brown", "position": "WR", "team": "DET", "search_rank": 12},
}
NAME_IDX = ADP.build_index(SLEEPER_PLAYERS)

SLEEPER_STATS = {
    "101": {"rec": 6.5, "rec_yd": 78.5},
    "102": {"rec": 7.0, "rec_yd": 82.5},
}

FP_ROWS = [
    {"name": "Puka Nacua", "position": "WR", "team": "LAR",
     "stats": {"rec": 6.0, "rec_yd": 75.0}, "fp_fpts": 13.5},
    {"name": "Amon-Ra St. Brown", "position": "WR", "team": "DET",
     "stats": {"rec": 7.5, "rec_yd": 85.0}, "fp_fpts": 15.0},
]


# ── fingerprint ──────────────────────────────────────────────────────────

def test_fingerprint_deterministic():
    a = WPA.fingerprint({"101": {"rec": 6.5}})
    b = WPA.fingerprint({"101": {"rec": 6.5}})
    assert a == b


def test_fingerprint_changes_on_different_data():
    a = WPA.fingerprint({"101": {"rec": 6.5}})
    b = WPA.fingerprint({"101": {"rec": 7.0}})
    assert a != b


def test_fingerprint_order_independent():
    a = WPA.fingerprint({"101": {"rec": 6.5}, "102": {"rec": 7.0}})
    b = WPA.fingerprint({"102": {"rec": 7.0}, "101": {"rec": 6.5}})
    assert a == b


# ── raw_and_scored ───────────────────────────────────────────────────────

def test_raw_and_scored_keeps_both():
    out = WPA.raw_and_scored(SLEEPER_STATS, SCORING)
    assert out["101"]["raw"] == {"rec": 6.5, "rec_yd": 78.5}
    want = 6.5 * 0.5 + 78.5 * 0.1
    assert out["101"]["scored"] == pytest.approx(round(want, 2), abs=1e-6)


def test_raw_and_scored_skips_empty_stat_lines():
    out = WPA.raw_and_scored({"999": {}, "101": SLEEPER_STATS["101"]}, SCORING)
    assert "999" not in out
    assert "101" in out


# ── build_archive_doc ────────────────────────────────────────────────────

def test_build_archive_doc_shape():
    doc = WPA.build_archive_doc(2026, 3, SLEEPER_STATS, FP_ROWS, NAME_IDX,
                                SCORING, "draft/data/weekly_own/x.json", True)
    assert doc["season"] == 2026
    assert doc["week"] == 3
    assert doc["own_weekly_ref"] == {"path": "draft/data/weekly_own/x.json",
                                     "exists": True}


def test_build_archive_doc_joins_both_sources():
    doc = WPA.build_archive_doc(2026, 3, SLEEPER_STATS, FP_ROWS, NAME_IDX,
                                SCORING, "x", False)
    assert set(doc["sleeper_weekly"]) == {"101", "102"}
    assert set(doc["fantasypros_weekly"]) == {"101", "102"}


def test_build_archive_doc_fp_side_keeps_raw_and_fpts_cross_check():
    doc = WPA.build_archive_doc(2026, 3, SLEEPER_STATS, FP_ROWS, NAME_IDX,
                                SCORING, "x", False)
    row = doc["fantasypros_weekly"]["101"]
    assert row["raw"] == {"rec": 6.0, "rec_yd": 75.0}
    assert row["fp_fpts"] == 13.5           # cross-check, not the scored value
    assert row["scored"] != row["fp_fpts"]  # our conversion, not the vendor's


def test_build_archive_doc_no_prior_fingerprints_no_findings():
    doc = WPA.build_archive_doc(2026, 1, SLEEPER_STATS, FP_ROWS, NAME_IDX,
                                SCORING, "x", False, prior_fingerprints=None)
    assert doc["findings"] == []


def test_build_archive_doc_unchanged_sleeper_payload_is_a_finding():
    sleeper_hash = WPA.fingerprint(SLEEPER_STATS)
    doc = WPA.build_archive_doc(2026, 4, SLEEPER_STATS, FP_ROWS, NAME_IDX,
                                SCORING, "x", False,
                                prior_fingerprints={"sleeper": sleeper_hash,
                                                    "fantasypros": "different"})
    assert len(doc["findings"]) == 1
    assert "sleeper_weekly" in doc["findings"][0]
    assert "UNCHANGED" in doc["findings"][0]


def test_build_archive_doc_both_unchanged_two_findings():
    fp_raw = {"101": FP_ROWS[0]["stats"], "102": FP_ROWS[1]["stats"]}
    sleeper_hash = WPA.fingerprint(SLEEPER_STATS)
    fp_hash = WPA.fingerprint(fp_raw)
    doc = WPA.build_archive_doc(2026, 4, SLEEPER_STATS, FP_ROWS, NAME_IDX,
                                SCORING, "x", False,
                                prior_fingerprints={"sleeper": sleeper_hash,
                                                    "fantasypros": fp_hash})
    assert len(doc["findings"]) == 2


def test_build_archive_doc_diagnostics_present():
    doc = WPA.build_archive_doc(2026, 3, SLEEPER_STATS, FP_ROWS, NAME_IDX,
                                SCORING, "x", False)
    assert doc["diagnostics"]["joined_rows"] == 2


def test_reuses_external_source_projections_functions_not_reimplemented():
    # rule 11 pin -- these must be the SAME function objects, not copies
    import external_source_projections as ESP
    assert WPA.join_by_sleeper_id is ESP.join_by_sleeper_id
    assert WPA.sleeper_rows is ESP.sleeper_rows


# ── week_shape_check: catches a season-shaped payload standing in for one week ──
#
# Real corruption, caught by hand on the 2026-08-20 discovery dispatch: Josh
# Allen's row from `/projections/nfl/regular/2026` -- a candidate template
# that does not interpolate {week} at all -- carried gp: 18.0 and scored
# 405.5 for what weekly_projection_archive_2026_w1.json recorded as "week 1".

def test_a_real_week_shaped_payload_passes():
    week_shaped = {"4984": {"pass_yd": 240.0, "pass_td": 2.0, "gp": 1.0},
                  "4881": {"pass_yd": 210.0, "pass_td": 1.0, "gp": 1.0},
                  "6462": {"gp": 0.0}}  # bye week -- 0 games is still one-week-shaped
    got = WPA.week_shape_check(week_shaped)
    assert got["ok"] is True


def test_the_actual_season_shaped_corruption_is_caught():
    # the real shape the discovery dispatch produced -- gp: 18.0 on the
    # majority of rows, mislabeled as a single week.
    season_shaped = {"4984": {"pass_yd": 3650.0, "pass_td": 27.0, "gp": 18.0,
                              "pts_half_ppr": 361.5},
                     "4881": {"pass_yd": 3380.0, "pass_td": 27.0, "gp": 18.0,
                              "pts_half_ppr": 326.0},
                     "6462": {"gp": 18.0}}
    got = WPA.week_shape_check(season_shaped)
    assert got["ok"] is False
    assert got["rows_over_one_game"] == 3


def test_a_minority_of_odd_gp_rows_does_not_false_positive():
    # one bookkeeping oddity must not VOID a real week
    mostly_week_shaped = {str(i): {"gp": 1.0} for i in range(9)}
    mostly_week_shaped["odd"] = {"gp": 18.0}
    got = WPA.week_shape_check(mostly_week_shaped)
    assert got["ok"] is True


def test_no_gp_field_anywhere_does_not_false_positive():
    # a payload that never carries gp at all cannot be judged by this check --
    # absence of the tell is not evidence of corruption
    got = WPA.week_shape_check({"1": {"pass_yd": 240.0}, "2": {"rush_yd": 80.0}})
    assert got["ok"] is True
    assert "no gp field" in got["why"]


def test_empty_stats_do_not_false_positive():
    assert WPA.week_shape_check({})["ok"] is True


# ── THE PRE-WINDOW SKIP (A, 2026-09-04; registers 438/440/482) ───────────────
#
# Sleeper flips `season_type` to 'regular' up to eleven days before week 1's
# first game, so the existing guard passes and the projection endpoints return
# rows with no stats. Run 33789366180 (09-03) VOIDed and exited 1 on exactly
# that, and would have repeated every Thursday until the games existed.
#
# Both arms are exercised here rather than only in September: the clock is
# injected through ARCHIVE_NOW, and `egress_main` is replaced by a function
# that FAILS if it is reached, so a skip that does not actually skip cannot
# pass this test.

def _stub_state(monkeypatch, week=1, season=2026):
    import weekly_proj_snapshot as WPS
    monkeypatch.setattr(WPS, "nfl_state",
                        lambda *a, **k: {"season_type": "regular",
                                         "week": week, "season": season})


def test_BEFORE_the_capture_window_main_exits_clean_and_never_calls_egress(monkeypatch, capsys):
    """MUTATION: drop the week_is_live gate — main() reaches egress_main, the
    provider answers with 0 stat rows, and the job is red every Thursday for a
    fortnight before the season starts."""
    _stub_state(monkeypatch)
    def _must_not_run(*a, **k):                      # pragma: no cover
        raise AssertionError("egress_main was called before the capture window")
    monkeypatch.setattr(WPA, "egress_main", _must_not_run)
    monkeypatch.setattr(sys, "argv", ["weekly_projection_archive.py"])
    monkeypatch.setenv("ARCHIVE_NOW", "2026-09-04T21:00:00Z")
    assert WPA.main() == 0
    out = capsys.readouterr().out
    assert "not live yet" in out and "Exiting CLEAN" in out


def test_INSIDE_the_window_it_does_NOT_skip(monkeypatch):
    """The control: the same code path with the clock inside week 1's window
    must reach egress. Without this arm the test above would also pass on a
    gate that skips ALWAYS."""
    _stub_state(monkeypatch)
    reached = {}
    def _reached(season, week):
        reached["args"] = (season, week)
        return {"status": "VOID", "reason": "stub — reached egress"}
    monkeypatch.setattr(WPA, "egress_main", _reached)
    monkeypatch.setattr(sys, "argv", ["weekly_projection_archive.py"])
    monkeypatch.setenv("ARCHIVE_NOW", "2026-09-09T13:00:00Z")
    assert WPA.main() == 1                            # the stub VOID, not the gate
    assert reached["args"] == (2026, 1)


def test_AN_EXPLICIT_WEEK_ARGUMENT_BYPASSES_THE_GATE(monkeypatch):
    """A human asking for a specific week has said what they want; the gate is
    for the unattended cron. MUTATION: gate the explicit path too — a backfill
    dispatch for a past week silently does nothing."""
    reached = {}
    monkeypatch.setattr(WPA, "egress_main",
                        lambda s, w: reached.setdefault("args", (s, w)) and None
                        or {"status": "VOID", "reason": "stub"})
    monkeypatch.setattr(sys, "argv", ["weekly_projection_archive.py",
                                      "--week", "1", "--season", "2026"])
    monkeypatch.setenv("ARCHIVE_NOW", "2026-09-04T21:00:00Z")
    assert WPA.main() == 1
    assert reached["args"] == (2026, 1)
