# TERRITORY: A
"""THE WAIVER ARM'S CONTROLS — proven against numbers other machinery computed.

EVIDENCE CLASS: CORRECTNESS of the waiver-replay plumbing. The suite asserts,
in the order the pre-registration demands (controls before decisions):

  1. ACTUAL reproduces Sleeper's own weekly points — and its money reproduces
     the CERTIFIED grade_actual table to the dollar (§13's certified layer).
  2. The transaction record explains EVERY observed week-to-week roster add —
     the two sources the FA pool and the ACTUAL arm rest on agree.
  3. The as-of boundary: decision inputs are built from weeks strictly before
     the week under decision (absent, not zero, for a first-appearance week).
  4. No honest arm exceeds the SEASON-POOL ceiling (lab._season_players) — the
     LINEUP+WAIVER bound; the per-week ceiling bounds lineup-only and would be
     the wrong instrument here (replay_lineup's docstring draws the line).
  5. THE FAIL-ARM: a planted future-info arm MUST trip that detector, or the
     detector is decorative.
  6. The TOOL arm drives the REAL src/routes/waivers.js through the node
     bridge — asserted on the bridge's source, because a Python
     re-implementation graded instead of the real tool is this repository's
     most-caught defect.
  7. The committed artifact is internally honest: every result routed through
     no_fit_guard, nothing promotable, controls recorded green, the §3b
     shared-valuation caveat attached.
"""
import json
import pathlib
import sys

import pytest

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "draft" / "backtest"))

import money_grade as MG        # noqa: E402
import no_fit_guard as NFG      # noqa: E402
import replay_lineup as RL      # noqa: E402
import replay_waiver as RW      # noqa: E402

SEASONS = ("2023", "2024", "2025")
ARTIFACT = ROOT / "draft" / "data" / "replay_waiver_2023_25.json"


@pytest.fixture(scope="module")
def ctx():
    h = MG.load_history()
    pos = RL.positions_map(h)
    return {"h": h, "p": MG.load_payouts(), "pos": pos,
            "seasons": {s: RW.SeasonCtx(h, s, pos) for s in SEASONS}}


@pytest.fixture(scope="module")
def tool_2024(ctx):
    """The TOOL arm walked over every 2024 seat through ONE shared node
    bridge. One season in-process keeps the suite fast; the artifact covers
    all three and test_artifact_* audits it."""
    sc = ctx["seasons"]["2024"]
    runner = RW.ToolRunner()
    out = {}
    try:
        for rid in RW._seats(sc):
            out[rid] = RW.replay(ctx["h"], "2024", rid, "TOOL_WAIVER",
                                 ctx["pos"], runner=runner, ctx=sc)
    finally:
        runner.close()
    return out


# ── 1. ACTUAL is a control, twice over ────────────────────────────────────────

@pytest.mark.parametrize("season", SEASONS)
def test_ACTUAL_reproduces_sleepers_recorded_points(ctx, season):
    """If this fails, scoring or roster plumbing is wrong and every other
    number the module produces is worthless."""
    sc = ctx["seasons"][season]
    for rid in RW._seats(sc):
        assert RW.actual_reproduces_recorded(ctx["h"], sc, rid), \
            f"{season} seat {rid}: ACTUAL != Sleeper's recorded points"


@pytest.mark.parametrize("season", SEASONS)
def test_ACTUAL_money_matches_the_certified_actual_grade(ctx, season):
    """grade_substituted on ACTUAL's {week: score} must equal grade_actual —
    the table certified to the dollar — for every seat. This pins the §13
    contract end to end: identical scores in, identical dollars out."""
    sc = ctx["seasons"][season]
    act = MG.grade_actual(ctx["h"], ctx["p"], season)
    for rid in RW._seats(sc):
        weekly = RW.replay(ctx["h"], season, rid, "ACTUAL", ctx["pos"],
                           ctx=sc)["weekly"]
        g = MG.grade_substituted(ctx["h"], ctx["p"], season, rid, weekly)
        assert g.get("graded_total") == pytest.approx(
            act["per_roster"][rid]["total"], abs=0.01), \
            f"{season} seat {rid}: substituted ACTUAL money != certified actual"


# ── 2. the two roster sources agree ──────────────────────────────────────────

@pytest.mark.parametrize("season", SEASONS)
def test_transactions_explain_every_observed_roster_add(ctx, season):
    """Every player who appears on a roster between consecutive snapshots must
    be explained by a completed transaction in the adjacent legs. The FA pool
    (players on NO roster) and the ACTUAL arm both rest on this agreement."""
    rep = RW.tx_explains_roster_adds(ctx["seasons"][season])
    assert rep["ok"], rep["unexplained"][:5]
    assert rep["observed_adds"] > 150   # non-vacuity: the control saw real churn


# ── 3. the as-of boundary ────────────────────────────────────────────────────

def test_decision_inputs_exclude_the_week_being_decided(ctx):
    """A player whose FIRST game is week N must be ABSENT from week N's
    decision inputs — absent, not present-with-zero. The means fold week N in
    only after the week is decided and scored."""
    sc = ctx["seasons"]["2024"]
    means = RW.AsOfMeans(sc)
    for w in (1, 2, 3, 4):
        means.advance(w)
    seen = set(means._n)
    week5 = {str(p) for p in sc.nfl.get(5, {})} | {str(p) for p in sc.league_pts.get(5, {})}
    debut = week5 - seen - {p for w in (1, 2, 3, 4)
                            for p in list(sc.nfl.get(w, {})) + list(sc.league_pts.get(w, {}))}
    assert debut, "no week-5 debut found — the check would be vacuous"
    for pid in debut:
        assert means.mean(pid) is None


def test_means_advance_refuses_out_of_order_weeks(ctx):
    means = RW.AsOfMeans(ctx["seasons"]["2024"])
    means.advance(1)
    with pytest.raises(AssertionError):
        means.advance(3)


# ── 4./5. the leak detector, and the arm planted to trip it ──────────────────

@pytest.mark.parametrize("season", SEASONS)
def test_NAIVE_never_exceeds_the_season_pool_ceiling(ctx, season):
    """The LINEUP+WAIVER bound: an as-of arm beating a hindsight-optimal
    lineup over the seat's full season pool is evidence of a leak."""
    sc = ctx["seasons"][season]
    for rid in RW._seats(sc):
        arm = RW.replay(ctx["h"], season, rid, "NAIVE_WAIVER", ctx["pos"], ctx=sc)
        lc = RW.leak_check(arm["weekly"], RW.season_pool_ceiling(sc, rid))
        assert not lc["tripped"], f"{season} seat {rid}: {lc}"


def test_TOOL_never_exceeds_the_season_pool_ceiling_2024(ctx, tool_2024):
    sc = ctx["seasons"]["2024"]
    for rid, arm in tool_2024.items():
        lc = RW.leak_check(arm["weekly"], RW.season_pool_ceiling(sc, rid))
        assert not lc["tripped"], f"2024 seat {rid}: {lc}"


@pytest.mark.parametrize("season", SEASONS)
def test_the_planted_future_info_arm_TRIPS_the_detector(ctx, season):
    """THE FAIL-ARM. An arm that decides on rest-of-season outcomes must
    exceed the season-pool ceiling; a detector the cheat can walk under would
    be decorative. Deterministic data -> asserted for every seat."""
    sc = ctx["seasons"][season]
    for rid in RW._seats(sc):
        arm = RW.replay(ctx["h"], season, rid, "PLANTED_LEAK", ctx["pos"], ctx=sc)
        lc = RW.leak_check(arm["weekly"], RW.season_pool_ceiling(sc, rid))
        assert lc["tripped"], (
            f"{season} seat {rid}: planted future-info arm stayed UNDER the "
            f"ceiling ({lc}) — the leak detector failed to fire on a real leak")


# ── 6. the TOOL arm is the real tool ─────────────────────────────────────────

def test_the_bridge_requires_the_real_tool_and_invents_no_decision_math():
    """The runner must require src/routes/waivers.js and the shared valuation,
    call evaluateClaims and claimStoppingRule, and contain no local claim
    arithmetic — a re-implementation graded instead of the real tool is this
    repository's most-caught defect class."""
    src = (ROOT / "draft" / "backtest" / "waiver_tool_runner.js").read_text()
    assert "src', 'routes', 'waivers.js'" in src.replace('"', "'")
    assert "valuation.js" in src
    assert "evaluateClaims" in src
    assert "claimStoppingRule" in src
    assert "waiverPriorityDepletes" in src
    for forbidden in ("net_value =", "netPoints", "bestLineup(", "vorp ="):
        assert forbidden not in src, (
            f"waiver_tool_runner.js contains {forbidden!r} — the bridge must "
            "drive the tool, never re-derive its quantities")


def test_TOOL_claims_execute_only_what_the_tool_approved(tool_2024):
    """Every executed claim carries the tool's own stopping verdict in its WHY,
    at most one claim per week, and no K/DEF ever moves (pass-through class)."""
    pos = RL.positions_map(MG.load_history())
    any_claim = False
    for rid, arm in tool_2024.items():
        weeks = [d["week"] for d in arm["decisions"] if d.get("action") == "claim"]
        assert len(weeks) == len(set(weeks)), f"seat {rid}: >1 claim in a week"
        for d in arm["decisions"]:
            if d.get("action") != "claim":
                continue
            any_claim = True
            assert d["why"].startswith("tool:"), d
            assert "stopping:" in d["why"], d
            assert pos.get(d["add"]) in RW.CLAIMABLE, d
            assert pos.get(d["drop"]) not in ("K", "DEF"), d
    assert any_claim, "the tool made no claims anywhere in 2024 — vacuous run"


def test_NAIVE_claims_are_skill_only_and_one_per_week(ctx):
    sc = ctx["seasons"]["2023"]
    for rid in RW._seats(sc)[:4]:
        arm = RW.replay(ctx["h"], "2023", rid, "NAIVE_WAIVER", ctx["pos"], ctx=sc)
        weeks = [d["week"] for d in arm["decisions"] if d.get("action") == "claim"]
        assert len(weeks) == len(set(weeks))
        for d in arm["decisions"]:
            if d.get("action") == "claim":
                assert ctx["pos"].get(d["add"]) in RW.CLAIMABLE
                assert ctx["pos"].get(d["drop"]) not in ("K", "DEF")


# ── 7. the committed artifact is honest ──────────────────────────────────────

@pytest.fixture(scope="module")
def artifact():
    assert ARTIFACT.exists(), (
        "draft/data/replay_waiver_2023_25.json missing — regenerate with "
        "python3 draft/backtest/replay_waiver.py --write")
    return json.loads(ARTIFACT.read_text())


def test_artifact_covers_every_seat_season_with_every_arm(artifact):
    assert len(artifact["seat_seasons"]) == 30
    for rec in artifact["seat_seasons"]:
        assert set(RW.ARMS) <= set(rec["arms"]), rec["season"]
        for arm in RW.ARMS:
            a = rec["arms"][arm]
            assert len(a["weekly"]) == 17          # RS 1-15 + bracket 16-17
            assert a["why"], (rec["season"], rec["roster_id"], arm)
        for arm in ("NAIVE_WAIVER", "TOOL_WAIVER"):
            assert "waiver_slice" in rec["arms"][arm]


def test_artifact_results_went_through_no_fit_guard(artifact):
    """Every emitted comparison carries configs_tried and the evidence class,
    and none may change production — the §11 shapes, enforced."""
    assert artifact["results"], "no results emitted"
    for r in artifact["results"]:
        assert r["configs_tried"] == 1
        assert r["evidence_class"].startswith("PRE-DECLARED")
        assert r["may_change_production"] is False


def test_artifact_controls_are_green_and_the_fail_arm_tripped(artifact):
    c = artifact["controls"]
    assert c["actual_reproduces_recorded"]["pass"]
    assert c["actual_reproduces_recorded"]["checked"] == 30
    assert all(v["ok"] for v in c["transactions_explain_roster_adds"].values())
    assert c["season_pool_ceiling"]["pass"]
    assert c["planted_future_info_arm"]["pass"]
    assert c["planted_future_info_arm"]["tripped_seat_seasons"] > 0


def test_artifact_carries_the_shared_valuation_caveat(artifact):
    """§3b: the waiver tool shares C1 valuation with the draft — the
    decomposition must not be over-read, and the caveat must ride with the
    numbers, not live in a doc nobody quotes."""
    assert "SAME shared valuation" in artifact["shared_valuation_caveat"]
    for r in artifact["results"]:
        assert "caveat" in r["notes"]
    assert artifact["participation_proxy_note"]
    assert artifact["live_tool_defects_observed"], (
        "the defect report is part of the arm's charter (report, don't fix)")


def test_no_fit_guard_refuses_a_promotable_result_from_this_shape():
    """The wiring this artifact uses cannot emit a promotable result without a
    mechanism — asserted here so the refusal is exercised from THIS module's
    shape, not only in the guard's own suite."""
    with pytest.raises(NFG.FittingRefused):
        NFG.record(NFG.ReplayResult(
            label="TOOL-WAIVER vs NAIVE-WAIVER", arm="waiver",
            seasons=list(SEASONS), value={}, configs_tried=1, promotable=True))
