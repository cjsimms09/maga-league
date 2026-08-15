# TERRITORY: A
"""EXP-FP-HIST-PROJ mechanics, tested OFFLINE before the CI egress runs.

Every authenticity gate is two-armed here — a fixture that must PASS and a
leaked/regenerated/divergent fixture that must REFUSE — because a gate that
only ever saw genuine data is a gate nobody has tested. Plus: scoring parity
with score_stat_line under the real league table (6-pt pass TD), baseline
parity with model_accuracy_backtest's declared semantics, and every named
refusal path. A year that fails a gate must carry NO metrics: a refusal that
leaks a plausible number is the exp33 failure wearing a costume.

Run: python3 -m pytest draft/tests/test_exp_fp_hist_proj.py -q
"""
import json
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "backtest"))
sys.path.insert(0, str(HERE.parent))

import exp_fp_hist_proj as E  # noqa: E402
from scoring import score_stat_line  # noqa: E402

POS_CYCLE = ("QB", "RB", "WR", "TE")
SCORING = {"pass_yd": 0.04, "pass_td": 6.0, "rush_yd": 0.1, "rec": 0.5,
           "rec_yd": 0.1, "rec_td": 6.0}

N = 140
MARKER_I = 4              # adp 5.0, no realized rows: a top-5 pick whose season never happened
GHOST_RANGE = range(100, 115)   # 15 players who exist in the graded year, gone by 2025


def _pid(i):
    return str(2000 + i)


def _name(i):
    return f"Alpha{i} Beta{i}"


def _proj_pts(i):
    return 280.0 - 1.5 * i     # declines with ADP -> anchor correlation holds


def _stats_for(pts):
    return {"rec_yd": round(pts / 0.1, 1)}   # rec_yd at 0.1/yd reproduces pts exactly


def _store(year, totals):
    """Two-week store: half the season total per week."""
    weeks = []
    for wk in (1, 2):
        weeks.append({"season": year, "week": wk,
                      "points": {p: t / 2 for p, t in totals.items()}})
    return {"weeks": weeks}


def make_world(year=2023, marker_proj="full", drop_ghosts=False,
               scramble_anchor=False, points_only=False, strip_proj_pids=False):
    """One synthetic FP year. marker_proj: 'full' (genuine preseason file),
    'leak_sized' (injury already priced in), 'missing' (marker pruned),
    'ambiguous' (between the bands)."""
    positions = {_pid(i): POS_CYCLE[i % 4] for i in range(N)}

    adp_rows = [{"name": _name(i), "position": POS_CYCLE[i % 4],
                 "adp": float(i + 1), "pid": _pid(i)} for i in range(N)]

    graded_totals = {_pid(i): 300.0 - 1.5 * i for i in range(N) if i != MARKER_I}
    latest_totals = {p: t for p, t in graded_totals.items()
                     if int(p) - 2000 not in GHOST_RANGE}

    proj_rows = []
    for i in range(N):
        if i == MARKER_I:
            if marker_proj == "missing":
                continue
            pts = {"full": 220.0, "leak_sized": 20.0, "ambiguous": 80.0}[marker_proj]
        else:
            pts = _proj_pts(i)
            if scramble_anchor:
                pts = 10.0 + 1.5 * i       # INVERTS the ADP ordering -> rho << 0.60
                                           # (marker kept full-season so G2 passes and
                                           # the run genuinely reaches G4)
        row = {"name": _name(i), "position": POS_CYCLE[i % 4],
               "pid": None if strip_proj_pids else _pid(i)}
        if points_only:
            row["stats"], row["fp_fpts"] = {}, pts
        else:
            row["stats"], row["fp_fpts"] = _stats_for(pts), None
        if drop_ghosts and i in GHOST_RANGE:
            continue
        proj_rows.append(row)

    stores = {year: _store(year, graded_totals), 2025: _store(2025, latest_totals)}
    if year == 2025:
        # grading 2025: give it both prior stores so the baselines build
        stores = {2023: _store(2023, {p: t * 0.9 for p, t in graded_totals.items()}),
                  2024: _store(2024, {p: t * 0.95 for p, t in graded_totals.items()}),
                  2025: _store(2025, graded_totals)}
    return adp_rows, proj_rows, stores, positions


# ── scoring parity: OUR table, never FP's points ─────────────────────────────

def test_scoring_parity_six_point_td_under_real_league_table():
    league = json.loads((HERE.parent / "config" / "league_config.json").read_text())
    scoring = league["scoring"]
    assert scoring["pass_td"] == 6.0   # the league fact the whole audit priced
    row = {"name": "QB Test", "position": "QB",
           "stats": {"pass_yd": 4000, "pass_td": 30, "pass_int": 10}}
    valued, coverage = E.value_rows([row], scoring)
    expect = score_stat_line(row["stats"], scoring)
    assert valued[0]["our_pts"] == expect == pytest.approx(4000 * 0.04 + 30 * 6 - 20)
    assert coverage == 1.0


def test_row_without_stats_never_grades_in_statline_mode():
    valued, coverage = E.value_rows(
        [{"name": "A", "stats": {}, "fp_fpts": 999.0}], SCORING)
    assert valued[0]["our_pts"] is None          # FP's number cannot become OUR MAE
    assert valued[0]["gate_value"] == 999.0      # ...but may size a magnitude GATE
    assert coverage == 0.0


# ── G2 markers: both arms ────────────────────────────────────────────────────

def test_markers_derived_from_data_not_hand_picked():
    adp_rows, _p, stores, _pos = make_world()
    realized, _ = E.season_totals(stores[2023])
    markers = E.derive_markers(adp_rows, realized)
    assert [m["pid"] for m in markers] == [_pid(MARKER_I)]
    # adp>75, non-skill positions, and unmatched pids can never be markers
    assert E.derive_markers([{"name": "K Guy", "position": "K", "adp": 3.0, "pid": "x"},
                             {"name": "Late", "position": "RB", "adp": 90.0, "pid": "y"},
                             {"name": "Unmatched", "position": "RB", "adp": 2.0, "pid": None}],
                            {}) == []


def test_marker_gate_pass_arm():
    markers = [{"name": _name(MARKER_I), "pid": _pid(MARKER_I), "adp": 5.0, "realized": 0.0}]
    g = E.gate_markers(markers, {E.normalize_name(_name(MARKER_I)): 220.0})
    assert g["status"] == "pass"
    assert g["markers"][0]["verdict"] == "full_season"


@pytest.mark.parametrize("value,expected", [
    (20.0, "leaked"),            # injury already priced in
    (None, "leaked"),            # marker pruned from the file
    (80.0, "ambiguous_markers"),  # between the bands -> refuse, don't guess
])
def test_marker_gate_refusal_arms(value, expected):
    markers = [{"name": _name(MARKER_I), "pid": _pid(MARKER_I), "adp": 5.0, "realized": 0.0}]
    values = {} if value is None else {E.normalize_name(_name(MARKER_I)): value}
    assert E.gate_markers(markers, values)["status"] == expected


def test_marker_gate_undecidable_without_markers():
    assert E.gate_markers([], {"anyone": 200.0})["status"] == "no_markers"


# ── G3 ghosts: both arms ─────────────────────────────────────────────────────

def test_ghost_gate_pass_arm():
    _a, proj_rows, stores, _pos = make_world()
    graded, _ = E.season_totals(stores[2023])
    latest, _ = E.season_totals(stores[2025])
    g = E.gate_ghosts([r["pid"] for r in proj_rows], graded, latest, 2023)
    assert g["status"] == "pass"
    assert g["ghost_count"] == len(GHOST_RANGE)


def test_ghost_gate_regenerated_arm():
    _a, proj_rows, stores, _pos = make_world(drop_ghosts=True)
    graded, _ = E.season_totals(stores[2023])
    latest, _ = E.season_totals(stores[2025])
    g = E.gate_ghosts([r["pid"] for r in proj_rows], graded, latest, 2023)
    assert g["status"] == "regenerated"
    assert g["ghost_count"] == 0


def test_ghost_gate_undecidable_for_latest_season():
    assert E.gate_ghosts(["1"], {"1": 10.0}, {}, 2025)["status"] == "not_applicable"


# ── G4 anchor: both arms ─────────────────────────────────────────────────────

def test_anchor_gate_pass_arm():
    adp_rows, proj_rows, _s, _p = make_world()
    valued, _ = E.value_rows(proj_rows, SCORING)
    g = E.gate_anchor(adp_rows, E.proj_by_name(valued))
    assert g["status"] == "pass" and g["rho"] >= E.ANCHOR_RHO_MIN


def test_anchor_gate_divergent_arm():
    adp_rows, proj_rows, _s, _p = make_world(scramble_anchor=True)
    valued, _ = E.value_rows(proj_rows, SCORING)
    g = E.gate_anchor(adp_rows, E.proj_by_name(valued))
    assert g["status"] == "anchor_divergent"


def test_anchor_gate_thin_join_is_named_not_scored():
    g = E.gate_anchor([{"name": _name(i), "adp": float(i + 1)} for i in range(5)],
                      {E.normalize_name(_name(i)): 100.0 - i for i in range(5)})
    assert g["status"] == "thin_anchor_join" and g["rho"] is None


# ── baselines: parity with model_accuracy_backtest's declared semantics ──────

def test_baseline_semantics_naive_and_blend():
    priors = {2023: {"a": 50.0, "c": 10.0}, 2024: {"a": 100.0, "b": 200.0}}
    b = E.build_baselines(priors)
    assert b["models"]["naive_prev"] == {"a": 100.0, "b": 200.0}
    # 0.7/0.3 with per-player fallback to last-alone — the module's exact rule
    assert b["models"]["recency_blend"]["a"] == pytest.approx(0.7 * 100 + 0.3 * 50)
    assert b["models"]["recency_blend"]["b"] == pytest.approx(200.0)
    assert "c" not in b["models"]["recency_blend"]   # no last-season row -> no forecast
    assert b["statuses"] == {"naive_prev": "built", "recency_blend": "built"}


def test_baseline_refusals_when_stores_missing():
    only_last = E.build_baselines({2023: {"a": 50.0}})
    assert only_last["statuses"]["recency_blend"] == "no_prior_prior_store"
    assert "recency_blend" not in only_last["models"]   # NOT silently == naive
    none = E.build_baselines({})
    assert none["statuses"] == {"naive_prev": "no_prior_store",
                                "recency_blend": "no_prior_store"}
    assert none["models"] == {}


def test_constants_parity_with_model_accuracy_backtest():
    mab = pytest.importorskip("model_accuracy_backtest")   # lands with A's audit branch
    assert tuple(mab.RECENCY_WEIGHTS) == E.RECENCY_WEIGHTS
    assert mab.LAST_SCORED_WEEK == E.LAST_SCORED_WEEK
    assert mab.MIN_N == E.MIN_N
    assert tuple(mab.POSITIONS) == E.POSITIONS


def test_season_totals_respects_week_cutoff():
    store = {"weeks": [{"week": 1, "points": {"a": 10.0}},
                       {"week": 17, "points": {"a": 5.0}},
                       {"week": 18, "points": {"a": 99.0}}]}   # playoffs must not leak in
    totals, games = E.season_totals(store)
    assert totals == {"a": 15.0} and games == {"a": 2}


# ── the whole pipeline, both arms ────────────────────────────────────────────

def test_evaluate_year_genuine_2023():
    adp_rows, proj_rows, stores, positions = make_world()
    res = E.evaluate_year(2023, adp_rows, proj_rows, SCORING, stores, positions)
    assert res["status"] == "graded"
    assert res["grading_mode"] == "statline"
    assert res["gates"]["g2_markers"]["status"] == "pass"
    assert res["gates"]["g3_ghosts"]["status"] == "pass"
    assert res["gates"]["g4_anchor"]["status"] == "pass"
    m = res["metrics"]
    # no prior stores in 2023 -> baselines refuse, FP still graded on its own
    assert m["baseline_statuses"]["naive_prev"] == "no_prior_store"
    assert m["head_to_head_shared_population"]["status"] == "no_baselines_available"
    for p in E.POSITIONS:
        cell = m["fp_cells"][p]
        assert cell["status"] == "measured" and "mae" in cell and "spearman" in cell


def test_evaluate_year_genuine_2025_beats_question_is_answerable():
    adp_rows, proj_rows, stores, positions = make_world(year=2025)
    res = E.evaluate_year(2025, adp_rows, proj_rows, SCORING, stores, positions)
    assert res["status"] == "graded"
    assert res["gates"]["g3_ghosts"]["status"] == "not_applicable"
    m = res["metrics"]
    assert m["baseline_statuses"] == {"naive_prev": "built", "recency_blend": "built"}
    h2h = m["head_to_head_shared_population"]
    for p in E.POSITIONS:
        row = h2h[p]
        assert row["status"] == "measured"
        for model in ("fantasypros", "naive_prev", "recency_blend"):
            assert "mae" in row[model] and "spearman" in row[model]
        # the deliverable number: FP minus baseline, one quantity, one denominator
        assert row["fp_minus_naive_prev_mae"] == pytest.approx(
            row["fantasypros"]["mae"] - row["naive_prev"]["mae"], abs=0.02)


def test_evaluate_year_leaked_refuses_with_no_numbers():
    adp_rows, proj_rows, stores, positions = make_world(marker_proj="leak_sized")
    res = E.evaluate_year(2023, adp_rows, proj_rows, SCORING, stores, positions)
    assert res["status"] == "leaked"
    assert res["metrics"] is None                      # a refusal carries NO metric
    assert "g4_anchor" not in res["gates"]             # later gates never even ran


def test_evaluate_year_missing_marker_is_also_leaked():
    adp_rows, proj_rows, stores, positions = make_world(marker_proj="missing")
    res = E.evaluate_year(2023, adp_rows, proj_rows, SCORING, stores, positions)
    assert res["status"] == "leaked" and res["metrics"] is None


def test_evaluate_year_regenerated_refuses():
    adp_rows, proj_rows, stores, positions = make_world(drop_ghosts=True)
    res = E.evaluate_year(2023, adp_rows, proj_rows, SCORING, stores, positions)
    assert res["status"] == "regenerated" and res["metrics"] is None


def test_evaluate_year_anchor_divergent_refuses():
    adp_rows, proj_rows, stores, positions = make_world(scramble_anchor=True)
    res = E.evaluate_year(2023, adp_rows, proj_rows, SCORING, stores, positions)
    # the marker is kept full-season sized in this fixture, so G2 passes and the
    # run genuinely reaches G4 — the divergence itself is the named verdict
    assert res["status"] == "anchor_divergent"
    assert res["metrics"] is None


def test_refusal_no_rows():
    adp_rows, proj_rows, stores, positions = make_world()
    res = E.evaluate_year(2023, adp_rows, proj_rows[:10], SCORING, stores, positions)
    assert res["status"] == "no_rows" and res["metrics"] is None


def test_refusal_no_adp_anchor():
    adp_rows, proj_rows, stores, positions = make_world()
    res = E.evaluate_year(2023, adp_rows[:20], proj_rows, SCORING, stores, positions)
    assert res["status"] == "no_adp_anchor" and res["metrics"] is None


def test_refusal_thin_crosswalk():
    # year 2025 so the ghost gate (which also needs pids) is n/a and the run
    # reaches G5 with names intact but zero Sleeper matches
    adp_rows, proj_rows, stores, positions = make_world(year=2025, strip_proj_pids=True)
    res = E.evaluate_year(2025, adp_rows, proj_rows, SCORING, stores, positions)
    assert res["status"] == "thin_crosswalk" and res["metrics"] is None


def test_points_only_mode_grades_rank_order_and_says_so():
    adp_rows, proj_rows, stores, positions = make_world(year=2025, points_only=True)
    res = E.evaluate_year(2025, adp_rows, proj_rows, SCORING, stores, positions)
    assert res["status"] == "graded"
    assert res["grading_mode"] == "points_only_rank_order"
    assert "limitation" in res
    for p in E.POSITIONS:
        cell = res["metrics"]["fp_cells"][p]
        assert "spearman" in cell and "mae" not in cell   # FP's points never our MAE
