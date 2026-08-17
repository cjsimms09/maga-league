# TERRITORY: A
"""The pace store's own guards — the pure half, plus the committed bytes.

Every test here answers a question the store could get WRONG while still
looking entirely plausible, which is the failure mode a pace number has:
a contaminated figure ranks offences confidently and nothing on its face
says the ranking is by how badly they were losing.
"""
import json
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(HERE / "backtest"))

import fetch_team_pace as P  # noqa: E402
import nflverse_pace as NP  # noqa: E402


# ── the filters ──────────────────────────────────────────────────────────────

def _play(**kw):
    row = {"season": 2024, "week": 1, "season_type": "REG", "game_id": "g1",
           "play_id": 1, "posteam": "KC", "play_type": "pass",
           "qb_kneel": 0.0, "qb_spike": 0.0, "score_differential": 0.0,
           "game_seconds_remaining": 3600.0, "half_seconds_remaining": 1800.0,
           "qtr": 1, "fixed_drive": 1, "timeout": 0.0, "pass_oe": 0.0,
           "incomplete_pass": 0.0, "penalty": 0.0, "sp": 0.0,
           "out_of_bounds": 0.0, "interception": 0.0, "fumble_lost": 0.0}
    row.update(kw)
    return row


def test_the_play_filter_is_C_s_module_not_a_second_copy():
    """A duplicated filter drifts from the one it copied and nobody notices —
    the exact dual-maintenance disease TERRITORY.md exists to prevent."""
    assert P.SCRIMMAGE is NP.SCRIMMAGE
    assert P.MIN_GAMES == NP.MIN_GAMES
    assert P._truthy is NP._truthy


def test_kneels_and_spikes_are_refused_by_BOTH_routes():
    """The two have disagreed across nflverse schema generations. A kneel
    counted as a play flatters exactly the offences that stopped playing."""
    assert P.is_scrimmage(_play()) is True
    assert P.is_scrimmage(_play(play_type="qb_kneel")) is False
    assert P.is_scrimmage(_play(play_type="qb_spike")) is False
    assert P.is_scrimmage(_play(qb_kneel=1.0)) is False
    assert P.is_scrimmage(_play(qb_spike=1.0)) is False
    for pt in ("punt", "kickoff", "field_goal", "extra_point", "no_play", None):
        assert P.is_scrimmage(_play(play_type=pt)) is False


def test_neutral_needs_all_three_conditions_and_each_one_bites():
    assert P.is_neutral(_play()) is True
    assert P.is_neutral(_play(score_differential=8.0)) is False
    assert P.is_neutral(_play(score_differential=-8.0)) is False
    assert P.is_neutral(_play(score_differential=7.0)) is True
    assert P.is_neutral(_play(qtr=4)) is False
    assert P.is_neutral(_play(half_seconds_remaining=120.0)) is False
    assert P.is_neutral(_play(half_seconds_remaining=121.0)) is True


def test_an_UNKNOWN_script_is_not_neutral():
    """Defaulting the other way silently admits the garbage-time plays the
    filter exists to remove — and the resulting number still looks fine."""
    assert P.is_neutral(_play(score_differential=None)) is False
    assert P.is_neutral(_play(score_differential=float("nan"))) is False
    assert P.is_neutral(_play(qtr=None)) is False
    assert P.is_neutral(_play(half_seconds_remaining=None)) is False


def test_the_lax_arm_really_is_C_s_rule_and_not_the_primary_one():
    """A robustness arm that silently equals the primary arm proves nothing."""
    hot = _play(score_differential=10.0, qtr=4, half_seconds_remaining=60.0)
    assert P.is_neutral(hot) is False
    assert P.is_neutral(hot, margin=P.LAX_MARGIN, max_qtr=None,
                        min_half_seconds=None) is True
    assert P.LAX_MARGIN == NP.NEUTRAL_MARGIN


# ── the snap-to-snap pair ────────────────────────────────────────────────────

def _pair(gap, **second):
    a = _play(play_id=1, game_seconds_remaining=3600.0)
    b = _play(play_id=2, game_seconds_remaining=3600.0 - gap)
    b.update(second)
    return [a, b]


def _gaps(rows):
    acc = P.accumulate(rows)
    return acc[(2024, "KC")]["gaps"]


def test_a_normal_pair_contributes_exactly_one_observation():
    assert _gaps(_pair(30.0)) == [30.0]


def test_a_gap_outside_the_window_is_refused():
    assert _gaps(_pair(61.0)) == []
    assert _gaps(_pair(0.0)) == []
    assert _gaps(_pair(-5.0)) == []
    assert _gaps(_pair(60.0)) == [60.0]


def test_ADJACENCY_is_required_and_an_intervening_row_kills_the_pair():
    """This is what makes the number snap-to-snap. Without it the figure is
    elapsed-time-over-plays, which prices stoppages as tempo."""
    a, b = _pair(30.0)
    timeout = _play(play_id=15, play_type=None, timeout=1.0,
                    game_seconds_remaining=3595.0)
    assert _gaps([a, b]) == [30.0]
    assert _gaps([a, timeout, b]) == []
    penalty = _play(play_id=15, play_type="no_play", penalty=1.0)
    assert _gaps([a, penalty, b]) == []


def test_a_pair_across_a_drive_quarter_team_or_game_boundary_is_refused():
    a, b = _pair(30.0)
    for key, val in (("fixed_drive", 2), ("qtr", 2), ("posteam", "DEN"),
                     ("game_id", "g2")):
        b2 = dict(b)
        b2[key] = val
        acc = P.accumulate([a, b2])
        assert acc[(2024, "KC")]["gaps"] == [], key


def test_a_pair_whose_EARLIER_play_stopped_the_clock_is_kept_but_flagged():
    """The contamination is measured, not silently absorbed: an incompletion
    stops the clock, so pass-heavy offences post shorter gaps for reasons that
    are not tempo."""
    a, b = _pair(30.0)
    a["incomplete_pass"] = 1.0
    acc = P.accumulate([a, b])
    assert acc[(2024, "KC")]["gaps"] == [30.0]
    assert acc[(2024, "KC")]["gaps_clockrunning"] == []


def test_only_the_offence_is_credited_never_the_home_team():
    """Keying on home_team credits every road drive to the wrong offence and
    leaves numbers that still look entirely plausible."""
    acc = P.accumulate([_play(posteam="DEN")])
    assert (2024, "DEN") in acc and (2024, "KC") not in acc


def test_the_postseason_is_excluded():
    acc = P.accumulate([_play(season_type="POST")])
    assert acc == {}


# ── absent is not zero ───────────────────────────────────────────────────────

def test_a_short_team_season_reports_a_status_never_a_zero():
    rows = [_play(game_id=f"g{i}", week=i + 1) for i in range(P.MIN_GAMES - 1)]
    seasons, cov = P.summarise(P.accumulate(rows))
    row = seasons["2024"]["KC"]
    assert row["status"] == "unmeasurable"
    assert row["plays_per_game"] is None and row["neutral_plays_per_game"] is None
    assert row["neutral_sec_per_play"] is None and row["proe"] is None
    assert "min_games" in row["basis"]
    assert cov["_unmeasurable_team_seasons"] == 1


def test_a_thin_team_week_reports_a_status_never_a_zero():
    rows = []
    for i in range(P.MIN_GAMES + 1):
        rows.append(_play(game_id=f"g{i}", week=i + 1))
    seasons, _ = P.summarise(P.accumulate(rows))
    weeks = seasons["2024"]["KC"]["weeks"]
    assert weeks and all(w["status"] == "unmeasurable" for w in weeks.values())
    assert all(w["neutral_sec_per_play"] is None for w in weeks.values())


def test_absent_PROE_is_absent_and_never_averaged_as_zero():
    rows = [_play(game_id=f"g{i}", week=i + 1, pass_oe=None)
            for i in range(P.MIN_GAMES + 1)]
    seasons, _ = P.summarise(P.accumulate(rows))
    assert seasons["2024"]["KC"]["proe"] is None


def test_team_pace_reader_omits_unmeasured_teams_rather_than_zeroing_them(tmp_path,
                                                                          monkeypatch):
    doc = {"seasons": {"2024": {
        "KC": {"status": "measured", "neutral_plays_per_game": 30.0},
        "DEN": {"status": "unmeasurable", "neutral_plays_per_game": None},
        "SF": {"status": "measured", "neutral_plays_per_game": None},
    }}}
    p = tmp_path / "team_pace.json"
    p.write_text(json.dumps(doc))
    monkeypatch.setattr(P, "store_path", lambda: p)
    assert P.team_pace(2024) == {"KC": 30.0}


# ── the schema refusal ───────────────────────────────────────────────────────

def test_a_frame_missing_a_FILTER_column_is_refused_not_computed(tmp_path):
    """An absent filter column silently admits every row it was meant to
    exclude, and the resulting pace number looks entirely normal."""
    pq = pytest.importorskip("pyarrow.parquet")
    pa = pytest.importorskip("pyarrow")
    t = pa.table({c: [1] for c in P.COLUMNS if c != "score_differential"})
    f = tmp_path / "x.parquet"
    pq.write_table(t, str(f))
    with pytest.raises(KeyError, match="score_differential"):
        P._read_season(f)


# ── the committed store ──────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def store():
    p = P.store_path()
    if not p.exists():
        pytest.skip("team pace store not committed")
    return json.loads(p.read_text())


def test_the_committed_store_covers_every_team_in_every_season(store):
    for y in ("2021", "2022", "2023", "2024", "2025"):
        teams = store["seasons"][y]
        assert len(teams) == 32, y
        assert all(r["status"] == "measured" for r in teams.values()), y


def test_the_team_codes_are_stable_across_the_window(store):
    """The persistence study pairs teams BY CODE across years; a relocation or
    rename inside the window would pair two different franchises and the
    correlation would still compute."""
    base = set(store["seasons"]["2021"])
    for y in ("2022", "2023", "2024", "2025"):
        assert set(store["seasons"][y]) == base, y


def test_the_denominator_defect_C_s_module_warns_about_does_not_occur(store):
    """`nflverse_pace.py` names it and says it could not be measured from the
    sandbox: a game contributing only special-teams rows would sit in the
    denominator of plays_per_game and not in the numerator. Measured now: it
    never happens on real pbp, 2021-2025."""
    for y, teams in store["seasons"].items():
        for t, r in teams.items():
            assert r["games_without_plays"] == 0, (y, t)


def test_raw_volume_and_neutral_volume_really_do_disagree(store):
    """If they ranked teams identically the neutral filter would be decoration.
    The gap is the whole reason the two are stored separately."""
    s = store["seasons"]["2024"]
    raw = sorted(s, key=lambda t: -s[t]["plays_per_game"])
    neu = sorted(s, key=lambda t: -s[t]["neutral_plays_per_game"])
    assert raw != neu
    moved = max(abs(raw.index(t) - neu.index(t)) for t in s)
    assert moved >= 5, moved


def test_the_stored_numbers_sit_in_a_physically_possible_range(store):
    for y, teams in store["seasons"].items():
        for t, r in teams.items():
            assert 45 <= r["plays_per_game"] <= 80, (y, t)
            assert 10 <= r["neutral_plays_per_game"] <= 50, (y, t)
            assert 20 <= r["neutral_sec_per_play"] <= 50, (y, t)
            assert 0 < r["neutral_share"] < 1, (y, t)
            assert 0.2 < r["neutral_pass_rate"] < 0.85, (y, t)
            assert -0.35 < r["proe"] < 0.35, (y, t)
            assert (r["neutral_sec_per_play_clockrunning"]
                    > r["neutral_sec_per_play"]), (y, t)


def test_the_store_declares_its_definitions_and_its_leakage_rule(store):
    d = store["definitions"]
    assert d["neutral_margin"] == 7 and d["neutral_max_qtr"] == 3
    assert d["neutral_min_half_seconds"] == 120 and d["lax_margin"] == 14
    assert "posteam" in d["team_field"]
    assert "Y-1" in store["_note"]
    assert "never a zero" in store["missing_vs_zero"]
