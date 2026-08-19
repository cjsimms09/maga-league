# TERRITORY: C
"""append_snapshot's raw_by_id side-channel — TERRITORY-GRANT: C on
proj_series.py/weekly_proj_snapshot.py, ROUTES.md 2026-08-19 ("the Sleeper
weekly archiver's raw-fields gap is yours to fix IN MY FILE").

weekly_proj_snapshot.py stored SCORED POINTS ONLY (its own prior comment:
"the archive stores POINTS rather than raw lines... because that is what a
strategy reads") -- which meant a corrected scoring table could never
re-score history, only re-fetch it, and the raw vendor fields this repo's
own scoring.py rule requires ("a provider's precomputed points are never
trusted") were archived nowhere for the weekly series. `raw_by_id` closes
that gap with the SAME side-channel shape `situation_by_id`/`dist_by_id`
already use -- same population as `proj`, so a raw entry can never describe
a player the snapshot does not price.
"""
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "draft"))

import proj_series as PS  # noqa: E402


def test_raw_by_id_absent_when_not_supplied():
    """Every existing caller (fantasypros preseason, D-lane callers) keeps
    working unchanged -- raw is additive, not required."""
    s = PS.append_snapshot([], "2026-08-11", "fantasypros", {"1": 20.0})
    assert "raw" not in s[0]


def test_raw_by_id_stored_beside_scored_points():
    s = PS.append_snapshot([], "2026-09-06", "sleeper_weekly", {"1": 20.0},
                           week=1, raw_by_id={"1": {"rec": 5.0, "rec_yd": 60.0}})
    assert s[0]["raw"] == {"1": {"rec": 5.0, "rec_yd": 60.0}}
    assert s[0]["proj"] == {"1": 20.0}


def test_raw_by_id_same_population_as_proj_not_wider():
    """A raw entry for a player top_n trimmed out of `proj` must not leak in
    -- the same rule situation/dist already enforce."""
    s = PS.append_snapshot([], "2026-09-06", "sleeper_weekly", {"1": 20.0},
                           week=1, top_n=1,
                           raw_by_id={"1": {"rec": 5.0}, "2": {"rec": 1.0}})
    assert set(s[0]["raw"]) == {"1"}


def test_raw_by_id_only_covers_players_it_was_given_not_all_of_proj():
    """A player in `proj` but absent from `raw_by_id` (the provider served a
    stat line with no readable fields, say) is simply absent from `raw` --
    not backfilled with an empty dict that would misread as 'we have his
    raw line and it is empty'."""
    s = PS.append_snapshot([], "2026-09-06", "sleeper_weekly",
                           {"1": 20.0, "2": 15.0}, week=1,
                           raw_by_id={"1": {"rec": 5.0}})
    assert set(s[0]["raw"]) == {"1"}


def test_week_over_week_raw_dedupes_with_the_rest_of_the_snapshot():
    s = PS.append_snapshot([], "2026-09-06", "sleeper_weekly", {"1": 20.0},
                           week=1, raw_by_id={"1": {"rec": 5.0}})
    s = PS.append_snapshot(s, "2026-09-06", "sleeper_weekly", {"1": 21.0},
                           week=1, raw_by_id={"1": {"rec": 5.2}})
    assert len(s) == 1
    assert s[0]["raw"] == {"1": {"rec": 5.2}}


def test_preseason_shape_still_unaffected_by_raw_addition():
    """The existing preseason-shape guarantee (test_weekly_proj_snapshot.py's
    own pin) must survive this change untouched."""
    s = PS.append_snapshot([], "2026-08-11", "fantasypros", {"1": 20.0})
    assert "week" not in s[0]
    assert "raw" not in s[0]
