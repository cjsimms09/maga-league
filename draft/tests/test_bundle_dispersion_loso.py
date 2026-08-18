# TERRITORY: A
"""LEAVE-ONE-SEASON-OUT ON THE BUNDLE DISPERSION — the piece where a leak could hide.

`attach_dispersion` is pure and was tested when it landed. The part that decides
WHICH seasons a season's calibration is fitted on was inline in `cli.main()`,
reachable only by a full networked CI run — so the one step in the whole change
capable of leaking had no test at all. An untestable leak guard is a leak guard
nobody has checked, so it was extracted and these are its tests.

THE LEAK. A spread fitted on the season being graded is foreknowledge the
drafter did not have: the 2023 board would carry a p90 derived partly from 2023
outcomes that, on 2023 draft day, had not happened. That is the exp33 defect one
level down — the one that disqualified Sleeper's 0.69/0.82 — and it is
attractive precisely because the resulting board looks completely normal.
"""
from __future__ import annotations

import os
import sys

import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
sys.path.insert(0, os.path.join(os.path.dirname(HERE), "backtest"))
from backtest import cli as CLI  # noqa: E402


def _bundle(season, n=40):
    return {"season": season,
            "players": [{"player_id": f"{season}-{i}", "position": "WR",
                         "proj_mean": 200.0 - i * 4.0} for i in range(n)]}


def _actual(season, n=40):
    # Realized points that differ by season, so a calibration fitted WITH a
    # season is numerically distinguishable from one fitted without it.
    scale = {2021: 0.6, 2022: 1.0, 2023: 1.4}[season]
    return {f"{season}-{i}": (200.0 - i * 4.0) * scale for i in range(n)}


def test_each_season_is_fitted_without_itself():
    """The declared property, asserted on the artifact rather than trusted to
    the comment above the loop."""
    seasons = [2021, 2022, 2023]
    bundles = [_bundle(s) for s in seasons]
    actual = {str(s): _actual(s) for s in seasons}

    CLI.attach_dispersion_loso(bundles, actual)

    for b in bundles:
        d = b["notes"]["dispersion"]
        assert d["fitted_without_season"] == b["season"]
        assert b["season"] not in d["fitted_on_seasons"], (
            "a season's own outcomes must not be in its own calibration")
        assert set(d["fitted_on_seasons"]) == set(seasons) - {b["season"]}


def test_the_fitter_refuses_rather_than_trusting_this_loop():
    """DEFENCE IN DEPTH, AND IT IS THE REAL GUARANTEE. Even if this loop were
    rewritten wrongly tomorrow, `calibrate` raises when handed the excluded
    season. The guard lives in the fitter, not in a caller's good intentions."""
    from backtest import projection_error as PE
    with pytest.raises(ValueError, match="excluded season"):
        PE.calibrate([_bundle(2023)], [_actual(2023)], exclude_season=2023)


def test_a_season_with_nothing_to_fit_on_gets_no_dispersion_at_all():
    """NOT a global fallback, and NOT a calibration fitted on itself — the two
    tempting wrong answers. The fields stay absent and the note says why, so a
    reader can tell "we could not measure this" from "we measured it as
    average"."""
    bundles = [_bundle(2023)]
    lines = CLI.attach_dispersion_loso(bundles, {"2023": _actual(2023)})

    d = bundles[0]["notes"]["dispersion"]
    assert d["attached"] is None
    assert "no out-of-season data" in d["why"]
    assert all("proj_ceiling" not in p for p in bundles[0]["players"])
    assert "ABSENT" in lines[0]


def test_a_season_whose_only_sibling_is_ungraded_is_also_refused():
    """An ungraded sibling is not a sibling. `actual` carrying an empty map for
    a season means nothing could be graded there, and fitting on nothing would
    produce a calibration of nothing — which `min_n` would mark unmeasurable
    anyway, but the refusal should happen here, plainly, rather than as a
    side effect two layers down."""
    bundles = [_bundle(2022), _bundle(2023)]
    lines = CLI.attach_dispersion_loso(bundles, {"2022": {}, "2023": _actual(2023)})

    by_season = {b["season"]: b["notes"]["dispersion"] for b in bundles}
    assert by_season[2023]["attached"] is None, (
        "2023's only sibling (2022) has no graded players — refuse")
    assert any("ABSENT" in ln for ln in lines)


def test_dispersion_actually_lands_when_there_is_something_to_fit_on():
    """The positive case, so the refusal tests above cannot be satisfied by a
    function that refuses everything."""
    seasons = [2021, 2022, 2023]
    bundles = [_bundle(s, n=60) for s in seasons]
    actual = {str(s): _actual(s, n=60) for s in seasons}

    CLI.attach_dispersion_loso(bundles, actual)

    attached = [b["notes"]["dispersion"]["attached"]["proj_ceiling"] for b in bundles]
    assert any(a > 0 for a in attached), (
        "with three graded seasons at least one bundle must receive a measured "
        "ceiling, or these tests prove nothing")


def test_the_report_lines_name_the_season_they_describe():
    """The CLI prints these and a human reads them on a CI run. A line that does
    not say which season it is about is noise in the one place the leak would
    be visible."""
    seasons = [2021, 2022, 2023]
    bundles = [_bundle(s) for s in seasons]
    lines = CLI.attach_dispersion_loso(bundles, {str(s): _actual(s) for s in seasons})
    assert len(lines) == 3
    for s, ln in zip(seasons, lines):
        assert str(s) in ln
