# TERRITORY: A
"""SLEEPER-HIST-PROJ mechanics, tested OFFLINE before the CI egress runs.

Every gate is TWO-ARMED — a fixture it must pass and a fixture it must refuse
— because a gate that has only ever seen the answer it expects is a gate
nobody has tested. The refusal arms matter more than the pass arms here: this
probe exists to catch a leaked projection of the source the board already
ranks on, and a leak detector that cannot fire is worse than no leak detector,
because it launders the number.

Also pinned: a refused year carries NO `metrics`, and the L2 rho cells stay
INSIDE their gate rather than being promoted — a leaked arm's number must
never be readable as a grade.

Run: python3 -m pytest draft/tests/test_sleeper_hist_proj.py -q
"""
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "backtest"))
sys.path.insert(0, str(HERE.parent))

import sleeper_hist_proj as S  # noqa: E402
from scoring import score_stat_line  # noqa: E402

SCORING = {"pass_yd": 0.04, "pass_td": 6.0, "rush_yd": 0.1, "rush_td": 6.0,
           "rec": 0.5, "rec_yd": 0.1, "rec_td": 6.0}

N = 160
POS_CYCLE = ("QB", "RB", "WR", "TE")


def _pid(i):
    return str(3000 + i)


def _positions(n=N):
    return {_pid(i): POS_CYCLE[i % 4] for i in range(n)}


def _realized(n=N):
    """Realized season totals: a wide, monotone-ish spread per position."""
    return {_pid(i): round(30.0 + (n - i) * 1.7, 2) for i in range(n)}


def _payload_from_points(points: dict) -> dict:
    """Turn {pid: target points} into a Sleeper-shaped stat payload that scores
    to (almost) that number under SCORING — rec_yd is 0.1/yd, so yards = 10x."""
    return {pid: {"rec_yd": round(p * 10, 1)} for pid, p in points.items()}


HONEST_NOISE = 100.0      # tuned to land the fixture in FP's measured 0.72-0.86 band


def _honest_projection(n=N, amplitude=HONEST_NOISE):
    """A believable preseason forecast: right shape, materially wrong per
    player. Deterministic (a seeded LCG, not randomness) so the calibration arm
    below is a fixed fact rather than a flaky one. `amplitude` is tuned so the
    fixture sits where FantasyPros' GENUINE preseason numbers were measured —
    rho 0.75-0.79 at WR/RB on 2024/2025 — which is the whole point of that arm:
    a ceiling that refuses an honest source is not a leak detector."""
    real = _realized(n)
    out, seed = {}, 12345
    for pid, a in sorted(real.items()):
        seed = (1103515245 * seed + 12345) % (2 ** 31)
        u = (seed / (2 ** 31)) * 2 - 1
        out[pid] = round(max(5.0, a + amplitude * u), 2)
    return out


def _args(payload, *, year=2024, realized=None, positions=None,
          prior=None, latest=None, census=None):
    return dict(year=year, payload=payload, scoring=SCORING,
                realized=realized if realized is not None else _realized(),
                positions=positions if positions is not None else _positions(),
                prior_totals=prior if prior is not None else {},
                latest_realized=latest if latest is not None else {},
                census=census or {})


# ── shape handling ───────────────────────────────────────────────────────────
def test_both_sleeper_row_shapes_score_identically():
    """`{pid: stats}` and `{pid: {player_id, stats}}` are the same projection.
    Sleeper serves both depending on the endpoint shape that wins the probe."""
    flat = {"1": {"rec_yd": 900, "rec": 80, "rec_td": 6}}
    nested = {"1": {"player_id": "1", "week": 0,
                    "stats": {"rec_yd": 900, "rec": 80, "rec_td": 6}}}
    a, _ = S.score_payload(flat, SCORING)
    b, _ = S.score_payload(nested, SCORING)
    assert a == b == {"1": score_stat_line({"rec_yd": 900, "rec": 80,
                                            "rec_td": 6}, SCORING)}


def test_an_empty_stat_line_is_counted_not_scored():
    """The `_PROJECTION_PATHS` failure mode: a well-formed payload of empty
    stat lines. It must show up as rows-without-stats, never as a projection
    of zero — absent is not zero."""
    payload = {"1": {"rec_yd": 0, "rec": 0}, "2": {}, "3": {"rec_yd": 500}}
    scored, counts = S.score_payload(payload, SCORING)
    assert counts["rows"] == 3
    assert counts["rows_with_stats"] == 1
    assert scored == {"3": 50.0}


# ── STEP 1: feasibility ──────────────────────────────────────────────────────
def test_step1_nothing_served_refuses_no_fetch():
    res = S.evaluate_year(**_args({}))
    assert res["status"] == "no_fetch"
    assert res["metrics"] is None


def test_step1_a_thin_payload_refuses_no_rows():
    res = S.evaluate_year(**_args(_payload_from_points(
        {_pid(i): 100.0 for i in range(S.PROJ_ROWS_FLOOR - 1)})))
    assert res["status"] == "no_rows"


def test_step1_rows_that_carry_no_usable_stats_refuse_no_scored_rows():
    """The blank-payload trap, at full row count: 200 rows, every stat zero."""
    res = S.evaluate_year(**_args({_pid(i): {"rec_yd": 0} for i in range(200)}))
    assert res["status"] == "no_scored_rows"
    assert res["counts"]["rows"] == 200
    assert res["counts"]["rows_scored_nonzero"] == 0


def test_step1_a_real_payload_gets_past_step_one():
    """The pass arm — otherwise every refusal above could be step 1 firing on
    everything, and the leak gates would never be reached at all."""
    res = S.evaluate_year(**_args(_payload_from_points(_honest_projection())))
    assert res["status"] not in ("no_fetch", "no_rows", "no_scored_rows")
    assert res["counts"]["rows_scored_nonzero"] >= S.SCORED_ROWS_FLOOR


# ── L1: identity ─────────────────────────────────────────────────────────────
def test_l1_refuses_a_stat_line_wearing_a_projections_name():
    """The projection IS the outcome. This is the loudest possible leak and it
    must be caught before any rho is even looked at."""
    res = S.evaluate_year(**_args(_payload_from_points(_realized())))
    assert res["status"] == "leaked_identity"
    assert res["gates"]["l1_identity"]["fraction"] == 1.0
    assert res["metrics"] is None
    # and no rho cell was promoted anywhere a reader could mistake for a grade
    assert "l2_rank_ceiling" not in res["gates"]


def test_l1_passes_an_honest_forecast():
    """An honest forecast lands within half a point of the outcome for the odd
    player by coincidence — 2 of 160 here. That is exactly why the threshold is
    0.05 and not 0: a zero-tolerance identity gate would call luck a leak."""
    g = S.gate_identity(_honest_projection(), _realized())
    assert g["status"] == "pass"
    assert 0.0 < g["fraction"] <= S.IDENTITY_FRAC_MAX


def test_l1_ignores_players_who_scored_nothing():
    """0-vs-0 on a bench player is not evidence of leakage. Without this the
    fraction is inflated by exactly the players nobody projected."""
    proj = {"1": 0.0, "2": 0.0, "3": 0.0}
    actual = {"1": 0.0, "2": 0.0, "3": 0.0}
    g = S.gate_identity(proj, actual)
    assert g["status"] == "unmeasurable"
    assert g["eligible"] == 0


# ── L2: rank ceiling ─────────────────────────────────────────────────────────
def test_l2_refuses_a_ranking_too_good_to_be_a_forecast():
    """A monotone projection reproduces the finishing order exactly. That is
    hindsight, and the WR/RB ceiling is what says so."""
    real = _realized()
    proj = {pid: a * 0.8 + 3.0 for pid, a in real.items()}   # monotone, not identical
    res = S.evaluate_year(**_args(_payload_from_points(proj)))
    assert res["status"] == "leaked_rho"
    l2 = res["gates"]["l2_rank_ceiling"]
    assert set(l2["over_ceiling"]) >= {"WR", "RB"}
    assert l2["cells"]["WR"]["spearman"] > S.LEAK_RHO_MAX
    assert res["metrics"] is None


def test_l2_passes_a_forecast_at_fantasypros_measured_skill():
    """The calibration arm. FP's genuine preseason numbers sit at rho 0.75-0.79
    on 2024/2025; a fixture in that band must NOT be called leaked, or the gate
    would refuse every honest source including the one it is calibrated on."""
    res = S.evaluate_year(**_args(_payload_from_points(_honest_projection())))
    l2 = res["gates"]["l2_rank_ceiling"]
    assert l2["status"] == "pass"
    for p in S.BINDING_POSITIONS:
        assert 0.5 < l2["cells"][p]["spearman"] <= S.LEAK_RHO_MAX


def test_l2_binding_positions_are_wr_and_rb_only():
    """QB and TE are shallow and top-heavy; a genuine forecast reaches the high
    0.8s there. Pinned so a later edit cannot quietly widen the ceiling."""
    cells = {"QB": [(float(i), float(i)) for i in range(40)],      # rho 1.0
             "RB": [(float(i), float(-i)) for i in range(40)],
             "WR": [(float(i), float(-i)) for i in range(40)],
             "TE": [(float(i), float(i)) for i in range(40)]}
    g = S.gate_rho(cells)
    assert g["status"] == "pass"
    assert g["cells"]["QB"]["spearman"] > S.LEAK_RHO_MAX     # measured, not gating


# ── population: absent is not zero ───────────────────────────────────────────
def test_unmatched_players_are_excluded_and_counted_never_zeroed():
    proj = {"1": 150.0, "2": 120.0, "3": 90.0}
    pop = S.build_population(proj, {"1": 200.0}, {"1": "WR", "2": "K", "3": "RB"})
    assert pop["exclusions"]["excluded_no_position"] == 1      # pid 2, a kicker
    assert pop["exclusions"]["excluded_no_weekly_row"] == 1    # pid 3, never played
    assert pop["cells"]["WR"] == [(150.0, 200.0)]
    assert all(0.0 not in [a for _, a in c] for c in pop["cells"].values())


def test_a_cell_below_min_n_is_unmeasurable_not_omitted():
    g = S.gate_rho({"WR": [(1.0, 1.0)] * (S.MIN_N - 1)})
    assert g["cells"]["WR"]["status"] == "unmeasurable"
    assert "spearman" not in g["cells"]["WR"]


# ── L3: provenance ───────────────────────────────────────────────────────────
def test_l3_census_never_emits_a_high_cardinality_value():
    """The census reads raw rows — the one function that does. A per-player
    field must yield a COUNT and never its values, or this probe prints the
    payload it promised not to print."""
    payload = {str(i): {"player_id": str(i), "week": 0, "company": "rotowire"}
               for i in range(200)}
    c = S.key_census(payload)
    assert "values" not in c["player_id"]          # 200 distinct — count only
    assert c["player_id"]["distinct"] == 200
    assert c["week"]["values"] == {"0": 200}       # low cardinality — safe
    assert "stats" not in c


def test_l3_refuses_an_in_season_week_marker():
    census = S.key_census({str(i): {"week": 12} for i in range(50)})
    g = S.gate_timestamp(census, 2024)
    assert g["status"] == "leaked_timestamp"
    assert g["hits"][0]["why"] == "in-season week number"


def test_l3_refuses_an_update_date_inside_the_season():
    census = S.key_census({str(i): {"updated_at": "2024-12-14"} for i in range(50)})
    assert S.gate_timestamp(census, 2024)["status"] == "leaked_timestamp"


def test_l3_passes_a_preseason_date():
    census = S.key_census({str(i): {"updated_at": "2024-08-20"} for i in range(50)})
    assert S.gate_timestamp(census, 2024)["status"] == "pass"


def test_l3_silence_is_undecidable_and_blocks_nothing():
    """13g in its own words: absence of evidence is entered as absence. A
    payload with no date must NOT read as 'the payload said preseason'."""
    g = S.gate_timestamp(S.key_census({str(i): {"player_id": str(i)}
                                       for i in range(50)}), 2024)
    assert g["status"] == "no_timestamp"
    res = S.evaluate_year(**_args(_payload_from_points(_honest_projection()),
                                  census={}))
    assert res["gates"]["l3_provenance"]["status"] == "no_timestamp"
    assert res["status"] != "leaked_timestamp"


# ── L4: markers ──────────────────────────────────────────────────────────────
def _marker_setup():
    """Three players who were assets last year and lost the graded season."""
    real = _realized()
    positions = _positions()
    prior = {pid: 260.0 for pid in list(real)[:3]}
    for pid in list(real)[:3]:
        real[pid] = 8.0                       # season died
    return real, positions, prior


def test_l4_refuses_when_a_dead_season_is_projected_dead():
    real, positions, prior = _marker_setup()
    proj = _honest_projection()
    for pid in list(prior):
        proj[pid] = 12.0                      # the file already knows
    res = S.evaluate_year(**_args(_payload_from_points(proj), realized=real,
                                  positions=positions, prior=prior))
    assert res["status"] == "leaked_markers"
    assert res["gates"]["l4_markers"]["verdicts"]["leak_sized"] == 3


def test_l4_refuses_when_a_marker_is_missing_entirely():
    real, positions, prior = _marker_setup()
    proj = _honest_projection()
    for pid in list(prior):
        proj.pop(pid, None)
    res = S.evaluate_year(**_args(_payload_from_points(proj), realized=real,
                                  positions=positions, prior=prior))
    assert res["status"] == "leaked_markers"
    assert res["gates"]["l4_markers"]["verdicts"]["missing"] == 3


def test_l4_passes_when_the_lost_season_is_still_projected_full_size():
    real, positions, prior = _marker_setup()
    proj = _honest_projection()
    for pid in list(prior):
        proj[pid] = 240.0                     # preseason had no idea
    res = S.evaluate_year(**_args(_payload_from_points(proj), realized=real,
                                  positions=positions, prior=prior))
    assert res["gates"]["l4_markers"]["status"] == "pass"


def test_l4_zero_markers_is_undecidable_and_refuses():
    """A gate that cannot be evaluated must not report as satisfied."""
    res = S.evaluate_year(**_args(_payload_from_points(_honest_projection()),
                                  prior={}))
    assert res["status"] == "no_markers"
    assert res["gates"]["l4_markers"]["n"] == 0


def test_l4_ambiguous_band_refuses_rather_than_guessing():
    real, positions, prior = _marker_setup()
    proj = _honest_projection()
    for pid in list(prior):
        proj[pid] = 75.0                      # between leak-sized and full
    res = S.evaluate_year(**_args(_payload_from_points(proj), realized=real,
                                  positions=positions, prior=prior))
    assert res["status"] == "ambiguous_markers"


# ── L5: ghosts ───────────────────────────────────────────────────────────────
def test_l5_refuses_a_file_built_from_todays_player_database():
    real, positions, prior = _marker_setup()
    proj = _honest_projection()
    for pid in list(prior):
        proj[pid] = 240.0
    res = S.evaluate_year(**_args(_payload_from_points(proj), year=2023,
                                  realized=real, positions=positions,
                                  prior=prior, latest=real))
    assert res["status"] == "regenerated"
    assert res["gates"]["l5_ghosts"]["ghost_count"] == 0


def test_l5_passes_when_the_since_departed_are_present():
    real, positions, prior = _marker_setup()
    proj = _honest_projection()
    for pid in list(prior):
        proj[pid] = 240.0
    latest = {pid: v for i, (pid, v) in enumerate(real.items()) if i >= 40}
    res = S.evaluate_year(**_args(_payload_from_points(proj), year=2023,
                                  realized=real, positions=positions,
                                  prior=prior, latest=latest))
    assert res["gates"]["l5_ghosts"]["status"] == "pass"
    assert res["status"] == "clean"


def test_l5_is_not_applicable_to_the_latest_store_year():
    g = S.gate_ghosts(["1"], {"1": 100.0}, {}, S.LATEST_STORE_YEAR)
    assert g["status"] == "not_applicable"
    assert g["ghost_count"] is None


# ── the contract a refusal must keep ─────────────────────────────────────────
@pytest.mark.parametrize("build", [
    lambda: _args({}),
    lambda: _args({_pid(i): {"rec_yd": 0} for i in range(200)}),
    lambda: _args(_payload_from_points(_realized())),
])
def test_every_refusal_carries_no_metrics(build):
    res = S.evaluate_year(**build())
    assert res["status"] != "clean"
    assert res["metrics"] is None


def test_the_position_union_keeps_the_strongest_markers_reachable():
    """The season-only map silently breaks L4: a 200-point player from y-1 who
    never took a snap in y has no row in y's component store, so a season-only
    map gives him no position and derive_markers drops exactly the player the
    gate exists to find. The union restores him; y's own answer still wins."""
    per_season = {2022: {"A": "RB", "B": "WR"}, 2023: {"B": "TE"}}
    pos = S._positions_for(2023, per_season)
    assert pos["A"] == "RB"      # never played 2023 — recovered from 2022
    assert pos["B"] == "TE"      # the graded season's own answer wins
    markers = S.derive_markers({"A": 260.0}, {}, pos)
    assert [m["pid"] for m in markers] == ["A"]
    assert S.derive_markers({"A": 260.0}, {}, per_season[2023]) == []   # the bug


def test_the_thresholds_match_the_preregistration():
    """The prereg is the authority; this pins the code to it so a threshold
    cannot be moved after seeing a result without the document going stale."""
    text = (HERE.parent / "backtest" / "SLEEPER-HIST-PROJ-PREREG.md").read_text()
    for token in ("PROJ_ROWS_FLOOR = 50", "SCORED_ROWS_FLOOR = 50",
                  "IDENTITY_ABS = 0.5", "IDENTITY_MIN_ACTUAL = 20.0",
                  "IDENTITY_FRAC_MAX = 0.05", "LEAK_RHO_MAX = 0.90",
                  "MARKER_PRIOR_MIN = 200.0", "MARKER_REALIZED_MAX = 30.0",
                  "MARKER_FULL_SEASON_MIN = 100.0", "MARKER_LEAK_MAX = 60.0",
                  "GHOST_MIN = 10"):
        assert token in text, f"prereg does not state {token}"
    assert S.PROJ_ROWS_FLOOR == 50 and S.SCORED_ROWS_FLOOR == 50
    assert S.IDENTITY_ABS == 0.5 and S.IDENTITY_FRAC_MAX == 0.05
    assert S.LEAK_RHO_MAX == 0.90 and S.BINDING_POSITIONS == ("WR", "RB")
    assert S.MARKER_PRIOR_MIN == 200.0 and S.MARKER_LEAK_MAX == 60.0
    assert S.GHOST_MIN == 10
