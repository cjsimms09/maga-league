# TERRITORY: A
"""EXP-35's CONTROLS — the capture-rate instrument is trusted only because
these fire, not because its numbers look plausible.

EVIDENCE CLASS: correctness of the instrument. Four properties, each the guard
against a defect class this repo has actually caught before:

1. ACTUAL REPRODUCES SLEEPER'S RECORDED SCORES — the artifact's baseline arm
   equals the platform's own numbers (the replay_lineup certification, asserted
   again on the committed artifact so a hand-edit or drift cannot hide).
2. THE STORED CEILING/NAIVE SERIES EQUAL A FRESH CERTIFIED REPLAY — the
   artifact cannot drift from the plumbing that justifies it. league_history is
   frozen, so this is stable, not board-state parity.
3. THE AS-OF BOUNDARY — a player whose first appearance is week N is ABSENT
   from week N's decision inputs (not present-with-zero in the means; zero in
   the request the live tool receives), and the context builder returns an
   EMPTY band for 2023 week 1, proving the window cannot see the season it is
   deciding in.
4. THE LEAK DETECTOR FIRES — on a synthetic arm nudged above the ceiling AND
   on the realistic defect class: a season-pool arm (players not yet acquired,
   the acquisition-timing contamination the two-ceilings finding named). An
   instrument whose alarm has never been heard ringing is not known to have one.
"""
import json
import pathlib
import shutil
import sys

import pytest

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "draft" / "backtest"))

import lab                      # noqa: E402
import lineup_capture as LC     # noqa: E402
import money_grade as MG        # noqa: E402
import replay_lineup as RL      # noqa: E402
import roster_sim as RS         # noqa: E402

SEASONS = ("2023", "2024", "2025")
ART_PATH = ROOT / "draft" / "data" / "lineup_capture_2023_25.json"
ART = json.loads(ART_PATH.read_text())


@pytest.fixture(scope="module")
def ctx():
    h = MG.load_history()
    return h, MG.load_payouts(), RL.positions_map(h)


def _rows(season):
    return [r for r in ART["rows"] if r["season"] == season]


# ── 1. ACTUAL reproduces Sleeper's own record, on the committed artifact ─────

@pytest.mark.parametrize("season", SEASONS)
def test_artifact_ACTUAL_equals_sleepers_recorded_scores(ctx, season):
    h, _p, _pos = ctx
    for row in _rows(season):
        want = RL.recorded(h, season, row["roster_id"])
        got = {int(w): v for w, v in row["weekly"]["actual"].items()}
        assert got == want, (
            f"{season} seat {row['roster_id']}: artifact ACTUAL != Sleeper")


# ── 2. stored CEILING and NAIVE equal a fresh certified replay ───────────────

@pytest.mark.parametrize("season", SEASONS)
def test_artifact_ceiling_and_naive_equal_certified_replay(ctx, season):
    h, _p, pos = ctx
    for row in _rows(season):
        rid = row["roster_id"]
        for arm in ("CEILING", "NAIVE"):
            fresh = RL.replay(h, season, rid, arm, pos)
            stored = {int(w): v for w, v in row["weekly"][arm.lower()].items()}
            assert stored == fresh, (
                f"{season} seat {rid}: artifact {arm} drifted from the "
                "certified plumbing — hand-edit or stale artifact")


# ── the hard invariant: no arm above the per-week ceiling, any week ──────────

@pytest.mark.parametrize("season", SEASONS)
def test_no_arm_exceeds_the_per_week_ceiling(season):
    for row in _rows(season):
        ceiling = {int(w): v for w, v in row["weekly"]["ceiling"].items()}
        for arm in ("tool", "naive", "actual"):
            weekly = {int(w): v for w, v in row["weekly"][arm].items()}
            bad = {w: (v, ceiling[w]) for w, v in weekly.items()
                   if v > ceiling[w] + 1e-6}
            assert not bad, (
                f"{season} seat {row['roster_id']} arm {arm}: above the "
                f"hindsight ceiling in {bad} — the §3c leak, in the artifact")
    assert ART["invariants"]["violations"] == 0


# ── 3. the as-of boundary ────────────────────────────────────────────────────

def test_week_N_only_player_is_absent_from_week_N_decision_inputs(ctx):
    """The one place the leak can enter. A player whose ONLY appearance is
    week 5 must be absent from the week-5 means (not present-with-zero) and
    must reach the live tool with a zero projection — the tool cannot start a
    number that does not exist yet."""
    h, _p, pos = ctx
    s = MG.season_of(h, "2024")
    week = 5
    for rid in (1, 2, 3):
        row = RL.seat_row(s, week, rid)
        means = RL._history_means(s, rid, week)
        only_now = {str(p) for p in (row.get("players_points") or {})
                    if str(p) not in means}
        if not only_now:
            continue
        req = LC.decision_request(s, rid, week, pos,
                                  LC.asof_context(LC._chronology(h), "2024", week),
                                  opp_mean=None)
        by_id = {e["id"]: e for e in req["roster"]}
        for pid in only_now:
            assert pid not in means
            if pid in by_id:                     # rosterable but history-less
                assert by_id[pid]["proj"] == 0.0, (
                    f"week-{week}-only player {pid} reached the tool with a "
                    "non-zero projection — the as-of boundary is broken")
        return
    pytest.fail("no week-5-only player found on seats 1-3 — pick another week")


def test_asof_context_cannot_see_the_current_season_from_week_1(ctx):
    """2023 week 1 has no prior completed season in the harvest and no current
    week played, so the as-of window must be EMPTY. A non-empty band here could
    only have been built from the season being decided — the leak, structurally."""
    h, _p, _pos = ctx
    c = LC.asof_context(LC._chronology(h), "2023", 1)
    assert c["bandSamples"] == []
    assert c["sigmaByPos"] == {}
    assert c["typicalMedian"] is None
    # ...and by week 3 the window holds exactly weeks 1-2 of 2023.
    c3 = LC.asof_context(LC._chronology(h), "2023", 3)
    assert len(c3["bandSamples"]) == 2


# ── 4. the leak detector fires ───────────────────────────────────────────────

def test_leak_detector_fires_on_a_planted_future_info_arm(ctx):
    h, _p, pos = ctx
    ceiling = RL.replay(h, "2024", 1, "CEILING", pos)
    planted = {w: v + 3.0 for w, v in ceiling.items()}   # "saw the future"
    with pytest.raises(SystemExit, match="LEAK DETECTOR FIRED"):
        LC.assert_no_leak("PLANTED", planted, ceiling, "2024", 1)


def test_leak_detector_fires_on_the_season_pool_arm(ctx):
    """The REALISTIC contamination: grade an arm on the season-long player pool
    (L0's basis) and it starts players the seat had not yet acquired — which
    must exceed the per-week ceiling somewhere, and the detector must catch it.
    This is the acquisition-timing distinction the two-ceilings finding named."""
    h, _p, pos = ctx
    fired = False
    for season in SEASONS:
        s = MG.season_of(h, season)
        rs_weeks = set(MG.regular_season_weeks(s))
        lpos = RS.infer_positions(s)
        for rid in sorted({int(r["roster_id"]) for r in RL.week_rows(s, 1)}):
            pool = RS.roster_weekly_scores(s, lab._season_players(s, rid), lpos)
            pool = {w: v for w, v in pool.items() if w in rs_weeks}
            ceiling = RL.replay(h, season, rid, "CEILING", pos)
            try:
                LC.assert_no_leak("SEASON-POOL", pool, ceiling, season, rid)
            except SystemExit:
                fired = True
                break
        if fired:
            break
    assert fired, ("the season-pool arm never exceeded the per-week ceiling — "
                   "either the pools are identical (they are not, by the "
                   "certified two-ceilings tests) or the detector is dead")


def test_missing_ceiling_week_is_a_leak_not_a_pass(ctx):
    h, _p, pos = ctx
    ceiling = RL.replay(h, "2024", 1, "CEILING", pos)
    arm = dict(ceiling)
    arm[99] = 1.0                                        # a week the ceiling lacks
    with pytest.raises(SystemExit, match="not on the same weeks"):
        LC.assert_no_leak("ARM", arm, ceiling, "2024", 1)


# ── the artifact's arithmetic is self-consistent ─────────────────────────────

@pytest.mark.parametrize("season", SEASONS)
def test_capture_rate_formula_matches_stored_points(season):
    for row in _rows(season):
        p = row["points"]
        denom = p["ceiling"] - p["naive"]
        assert denom > 0, f"{season} seat {row['roster_id']}: ceiling <= naive"
        for arm in ("tool", "actual"):
            want = round((p[arm] - p["naive"]) / denom, 4)
            assert row["capture_rate_points"][arm] == pytest.approx(want, abs=1e-4)
        d = row["dollar_delta"]
        assert d["tool_vs_naive"] == pytest.approx(
            row["dollars"]["tool"] - row["dollars"]["naive"], abs=0.01)


def test_headline_is_a_pre_declared_measurement_not_a_search():
    """no_fit_guard discipline, checked on the artifact: one configuration,
    never promotable — an instrument reading, not a selection."""
    hl = ART["headline"]
    assert hl["configs_tried"] == 1
    assert hl["may_change_production"] is False
    assert hl["evidence_class"].startswith("PRE-DECLARED")
    assert hl["selected_from_search"] is False


def test_every_season_seat_row_is_present():
    for season in SEASONS:
        rows = _rows(season)
        assert len(rows) == 10, f"{season}: {len(rows)} seats, expected 10"
        weeks = {len(r["weekly"]["tool"]) for r in rows}
        assert weeks == {15}, f"{season}: tool arm not covering all 15 RS weeks"


# ── the runner really drives the live module ─────────────────────────────────

@pytest.mark.skipif(shutil.which("node") is None, reason="node not on PATH")
def test_node_runner_drives_the_live_lineup_module(ctx):
    """One decision through the REAL src/routes/lineup.js. Structural checks
    only (full artifact parity lives in artifact_registry.json): a legal,
    full lineup drawn from the given roster, scoring at or under that week's
    hindsight ceiling."""
    h, _p, pos = ctx
    s = MG.season_of(h, "2024")
    week, rid = 5, 1
    req = LC.decision_request(s, rid, week, pos,
                              LC.asof_context(LC._chronology(h), "2024", week),
                              opp_mean=110.0)
    out = LC.run_tool([req])
    dec = out[req["key"]]
    roster_ids = {e["id"] for e in req["roster"]}
    assert len(dec["starters"]) == sum(req["slots"].values())
    assert set(dec["starters"]) <= roster_ids
    assert len(set(dec["starters"])) == len(dec["starters"])
    row = RL.seat_row(s, week, rid)
    pts = {k: float(v) for k, v in (row.get("players_points") or {}).items()}
    score = round(sum(pts.get(p, 0.0) for p in dec["starters"]), 2)
    ceiling = RL.replay(h, "2024", rid, "CEILING", pos)
    assert score <= ceiling[week] + 1e-6
    assert "pWin" in dec["why"] and "edge" in dec["why"]   # §3f: the WHY rides
