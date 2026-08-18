# TERRITORY: A
"""ROSTER-ROBUSTNESS GRADER — the tests that make its verdict trustable.

The grader (draft/backtest/roster_robustness.py) answers the untested half of
Cory's question: does the roster the engine PLANS to leave him with survive a
real season structurally. These tests pin the four things that would make its
table a lie if they silently broke:

  1. The measured inputs are MEASURED — availability distributions come from
     the stores with real sample sizes, wire levels equal the committed
     wire_level.json numbers (QB on the ongoing-hold line, the disclosed
     amendment), never constants typed into the module.
  2. The lineup optimizer is LEGAL and OPTIMAL — it never starts an
     unavailable player, and greedy equals brute force on the league's
     QB/2RB/2WR/TE/FLEX/K/DEF structure (property-tested on random weeks).
  3. THE FAIL ARM: a deliberately fragile roster (five RBs sharing one bye,
     lone TE at a round-12 price) must grade MEASURABLY worse on the
     structural robustness metrics than the seat plan. A grader that cannot
     flunk a roster built to flunk is not measuring anything.
  4. No promotion: the artifact routes through no_fit_guard with
     promotable=False and configs_tried=1 — measurement, not selection.

Run: python3 -m pytest draft/tests/test_roster_robustness.py -q
"""
import itertools
import sys
from pathlib import Path

import numpy as np
import pytest

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "backtest"))

import roster_robustness as RR  # noqa: E402


@pytest.fixture(scope="module")
def dists():
    d, prov = RR.availability_distributions()
    return d, prov


@pytest.fixture(scope="module")
def wire():
    w, prov = RR.wire_per_week()
    return w, prov


# ── 1. measured inputs are measured ─────────────────────────────────────────

def test_availability_distributions_are_measured(dists):
    d, prov = dists
    for pos in RR.SKILL:
        arr = d[pos]
        assert len(arr) >= 40, "%s pool too small to call measured" % pos
        assert arr.min() >= 0 and arr.max() <= 16
        assert 10.0 < arr.mean() < 16.0
        assert len(np.unique(arr)) >= 5, "%s looks like a constant" % pos
    # the pool is the league's own draftees, not an assumed universe
    assert "drafted in THIS league" in prov["pool"]
    assert prov["n"]["RB"] > prov["n"]["QB"]  # rosters carry more RBs than QBs


def test_wire_levels_equal_the_committed_store(wire):
    import json
    w, prov = wire
    doc = json.loads((RR.DATA / "wire_level.json").read_text())
    for pos in ("RB", "WR", "TE"):
        assert w[pos] == float(doc["per_week"][pos])
    # QB is the ongoing-hold line (disclosed amendment: a streamed QB is a
    # held add; the acquisition-week median exceeds startable QBs' weekly mean)
    assert w["QB"] == float(doc["ongoing"]["per_week"]["QB"])
    assert w["QB"] < float(doc["per_week"]["QB"])
    assert "wire_level.json" in prov["skill"]["source"]
    assert "ASSUMPTION" in prov["k_def"]["source"]


# ── 2. the lineup optimizer is legal and optimal ────────────────────────────

def _toy_roster(counts):
    out = []
    for pos, n in counts.items():
        for i in range(n):
            out.append({"name": "%s%d" % (pos, i), "pos": pos, "mu": 5.0,
                        "sd": 1.0, "bye": 6, "proj_mean": 85.0})
    return out


def _brute_force_week(vals, poss, avail, wire):
    """Exact best score for one week under the grader's convention: every
    slot is filled from available players when one exists; the wire fills a
    slot ONLY when it cannot be filled (M1 — an empty slot costs the wire
    level, benching a bad player for the wire is not modelled)."""
    players = [i for i in range(len(vals)) if avail[i]]
    best = -1e18
    by = lambda p: [i for i in players if poss[i] == p]  # noqa: E731
    wire_flex = max(wire["RB"], wire["WR"], wire["TE"])

    def choose(pool, need):
        combos = list(itertools.combinations(pool, min(need, len(pool))))
        pad = need - min(need, len(pool))
        return [tuple(c) + (None,) * pad for c in combos] or [(None,) * need]

    for (qb,) in choose(by("QB"), 1):
        for rbs in choose(by("RB"), 2):
            for wrs in choose(by("WR"), 2):
                for (te,) in choose(by("TE"), 1):
                    for (k,) in choose(by("K"), 1):
                        for (df,) in choose(by("DEF"), 1):
                            used = {x for x in (qb, *rbs, *wrs, te, k, df)
                                    if x is not None}
                            if len(used) != sum(x is not None for x in
                                                (qb, *rbs, *wrs, te, k, df)):
                                continue
                            flex_pool = [i for i in players
                                         if poss[i] in ("RB", "WR", "TE")
                                         and i not in used]
                            flex = max(flex_pool, key=lambda i: vals[i],
                                       default=None)
                            s = 0.0
                            s += vals[qb] if qb is not None else wire["QB"]
                            for r in rbs:
                                s += vals[r] if r is not None else wire["RB"]
                            for w in wrs:
                                s += vals[w] if w is not None else wire["WR"]
                            s += vals[te] if te is not None else wire["TE"]
                            s += vals[k] if k is not None else wire["K"]
                            s += vals[df] if df is not None else wire["DEF"]
                            s += vals[flex] if flex is not None else wire_flex
                            best = max(best, s)
    return best


def test_greedy_lineup_matches_brute_force(wire):
    w, _ = wire
    rng = np.random.default_rng(7)
    roster = _toy_roster({"QB": 2, "RB": 3, "WR": 3, "TE": 2, "K": 1, "DEF": 1})
    poss = [r["pos"] for r in roster]
    for trial in range(40):
        vals = rng.normal(8, 6, size=len(roster))
        avail = rng.random(len(roster)) > 0.35
        pts = np.tile(vals, (1, RR.WEEKS, 1)).reshape(1, RR.WEEKS, len(roster))
        av = np.tile(avail, (1, RR.WEEKS, 1)).reshape(1, RR.WEEKS, len(roster))
        got = RR.lineup(pts, av, roster, w)["weekly"][0, 0]
        want = _brute_force_week(vals, poss, avail, w)
        assert got == pytest.approx(want, abs=1e-9), "trial %d" % trial


def test_lineup_never_starts_an_unavailable_player(wire):
    w, _ = wire
    roster = _toy_roster({"QB": 2, "RB": 2, "WR": 2, "TE": 1, "K": 1, "DEF": 1})
    n = len(roster)
    pts = np.full((1, RR.WEEKS, n), 5.0)
    pts[0, :, 0] = 1e9            # QB0 is a million-point player...
    avail = np.ones((1, RR.WEEKS, n), dtype=bool)
    avail[0, :, 0] = False        # ...who never plays
    res = RR.lineup(pts, avail, roster, w)
    assert res["weekly"].max() < 1e6, "an unavailable player was started"


def test_bye_weeks_are_unavailable_in_the_draw(dists):
    d, _ = dists
    roster, _prov = RR.seat_plan_roster()
    rng = np.random.default_rng(3)
    _pts, avail = RR.draw_season(roster, 50, rng, d)
    for j, p in enumerate(roster):
        assert not avail[:, p["bye"] - 1, j].any(), p["name"]


# ── 3. the fail arm: fragile must grade worse ───────────────────────────────

def test_fail_arm_fragile_roster_grades_measurably_worse(dists, wire):
    d, _ = dists
    w, _ = wire
    seat, _ = RR.seat_plan_roster()
    frag, prov = RR.fragile_roster()
    assert len(frag) == 15
    rb_byes = [p["bye"] for p in frag if p["pos"] == "RB"]
    assert len(rb_byes) == 5 and len(set(rb_byes)) == 1  # the built-in flaw
    g_seat = RR.grade_roster(seat, 1500, 11, d, w)
    g_frag = RR.grade_roster(frag, 1500, 11, d, w)
    # structural robustness, the metrics the flaw was built to break:
    assert g_frag["bye_worst_case"]["max_empty_skill_slots_bye_only"] >= 2
    assert (g_frag["bye_worst_case"]["max_empty_skill_slots_bye_only"]
            > g_seat["bye_worst_case"]["max_empty_skill_slots_bye_only"])
    assert (g_frag["bye_worst_case"]["max_concurrent_byes"]
            > g_seat["bye_worst_case"]["max_concurrent_byes"])
    assert (g_frag["bye_worst_case"]["worst_bye_week_mu_score"]
            < g_seat["bye_worst_case"]["worst_bye_week_mu_score"] - 5)
    # wire dependence: the fragile roster leans much harder on the wire
    assert (g_frag["wire_points_per_season"]
            > g_seat["wire_points_per_season"] + 30)


def test_determinism_same_seed_same_grade(dists, wire):
    d, _ = dists
    w, _ = wire
    seat, _ = RR.seat_plan_roster()
    a = RR.grade_roster(seat, 400, 99, d, w, stress=False)
    b = RR.grade_roster(seat, 400, 99, d, w, stress=False)
    assert a["value"] == b["value"]
    assert a["weekly_floor_p10"] == b["weekly_floor_p10"]


# ── 4. roster contracts and no-promotion ────────────────────────────────────

def test_seat_plan_roster_is_the_planned_fifteen(dists):
    roster, prov = RR.seat_plan_roster()
    assert len(roster) == 15
    counts = {}
    for r in roster:
        counts[r["pos"]] = counts.get(r["pos"], 0) + 1
    # startable without the wire on a healthy week
    assert counts.get("QB", 0) >= 1 and counts.get("RB", 0) >= 2
    assert counts.get("WR", 0) >= 2 and counts.get("TE", 0) >= 1
    assert counts.get("K", 0) >= 1 and counts.get("DEF", 0) >= 1
    # the three demoted bench seats ride along, labelled
    assert len(prov["superseded_bench_seats"]) == 3


def test_cory_2025_control_contract():
    roster, prov = RR.cory_2025_roster()
    assert prov["excluded_as_empty_bench"] == [RR.UNPOSITIONED_2025_PID]
    assert len(roster) == 14  # 15 picks minus the unpositioned pid


def test_run_is_measurement_not_selection(monkeypatch, dists, wire):
    """Integration on a sliced arm set: artifact shape, paired dominance
    present, and the no-fit guard stamps a single pre-declared comparison."""
    real = RR.arm_rosters

    def sliced():
        arms, medoids = real()
        keep = {"seat_plan", "shipped"}
        arms = {k: v[:6] for k, v in arms.items() if k in keep}
        medoids = {k: dict(medoids[k], index=0) for k in keep}
        return arms, medoids

    monkeypatch.setattr(RR, "arm_rosters", sliced)
    art = RR.run(n_single=200, n_room=40, seed=5)
    guard = art["no_fit_guard"]
    assert guard["may_change_production"] is False
    assert guard["evidence_class"] == "PRE-DECLARED — a single stated comparison"
    assert art["no_fit_guard"]["notes"]["no_plan_promoted"] is True
    assert "shipped" in art["dominance_arms_paired"]
    assert art["dominance_arms_paired"]["shipped"]["paired_rooms"] == 6
    for key in ("value", "weekly_floor_p10", "p_unfieldable_skill_week",
                "wire_points_per_season", "bye_worst_case", "stress_4wk_loss"):
        assert key in art["seat_plan"], key
    for label in ("RB1", "RB2", "WR1", "WR2"):
        assert label in art["seat_plan"]["stress_4wk_loss"]
    assert art["headline"]
    # the measured inputs travel with the artifact — a reader can audit them
    assert "wire_level.json" in art["measured_inputs"]["wire"]["skill"]["source"]
    assert art["measured_inputs"]["availability"]["n"]["RB"] >= 100
    assert len(art["assumptions"]) == 7
