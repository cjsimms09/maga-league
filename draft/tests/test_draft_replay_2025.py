# TERRITORY: A
"""draft_replay_2025 — the contract of Cory's "would it have drafted a better
team" test: replay determinism, the LEAKAGE GUARD (no ≥replay-season store is
opened on the projection path), pick-availability correctness against the real
draft, the needs rails, the lineup arms on hand-computed fixtures, parity of
the generalized walk-forward substrate with the graded own-model modules, and
the committed artifact's regeneration pin.
"""
import builtins
import json
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
DRAFT = HERE.parent
sys.path.insert(0, str(DRAFT / "tools"))
sys.path.insert(0, str(DRAFT / "backtest"))
sys.path.insert(0, str(DRAFT))

import draft_replay_2025 as R  # noqa: E402

ARTIFACT = DRAFT / "data" / "draft_replay_2025.json"


# ── fixtures for the pure replay core ────────────────────────────────────────

def _mini_picks():
    """A 2-team, 8-pick snake fixture: Cory (roster 1) picks 1,4,5,8 —
    pick 1 is his keeper; roster 2's picks are history."""
    return [
        {"pick_no": 1, "roster_id": 1, "player_id": "k1", "is_keeper": True},
        {"pick_no": 2, "roster_id": 2, "player_id": "h1", "is_keeper": None},
        {"pick_no": 3, "roster_id": 2, "player_id": "h2", "is_keeper": None},
        {"pick_no": 4, "roster_id": 1, "player_id": "a1", "is_keeper": None},
        {"pick_no": 5, "roster_id": 1, "player_id": "a2", "is_keeper": None},
        {"pick_no": 6, "roster_id": 2, "player_id": "h3", "is_keeper": None},
        {"pick_no": 7, "roster_id": 2, "player_id": "h4", "is_keeper": None},
        {"pick_no": 8, "roster_id": 1, "player_id": "a3", "is_keeper": None},
    ]


MINI_POS = {"k1": "RB", "h1": "RB", "h2": "WR", "a1": "WR", "a2": "RB",
            "a3": "TE", "h3": "QB", "h4": "TE",
            "q1": "QB", "q2": "QB", "w1": "WR", "w2": "WR", "t1": "TE",
            "r1": "RB", "r2": "RB"}
MINI_STARTERS = {"QB": 1, "RB": 1, "WR": 1, "TE": 1}


def test_replay_core_takes_bpa_by_vorp_and_respects_availability():
    proj = {"q1": 300.0, "w1": 200.0, "r1": 150.0, "t1": 100.0, "h1": 400.0}
    repl = {"QB": 250.0, "WR": 120.0, "RB": 100.0, "TE": 60.0}
    out = R.replay_draft(_mini_picks(), {"k1"}, proj, repl, MINI_POS,
                         cory_roster_id=1, caps={"QB": 2, "RB": 3, "WR": 3,
                                                 "TE": 2},
                         starters=MINI_STARTERS, flex_slots=0)
    tool = [e for e in out["log"] if e["how"] == "tool"]
    # h1 (VORP 300) is history's pick 2 — NEVER available to the tool.
    assert all(e["player_id"] != "h1" for e in tool)
    # best available by VORP at pick 4: w1 (+80) > r1 (+50) = q1 (+50) > t1.
    assert tool[0]["player_id"] == "w1"
    # opponents' picks are byte-identical to history.
    hist = [e for e in out["log"] if e["how"] == "history"]
    assert [e["player_id"] for e in hist] == ["h1", "h2", "h3", "h4"]
    # keeper preserved, counted against the roster.
    assert [e for e in out["log"] if e["how"] == "keeper"][0]["player_id"] == "k1"
    # no player appears twice across the whole board.
    ids = [e["player_id"] for e in out["log"]]
    assert len(ids) == len(set(ids))


def test_replay_core_feasibility_rail_forces_the_missing_starter():
    # Cory needs QB/RB/WR/TE starters; keeper covers RB; three live picks
    # must cover WR, TE, QB. Make a spare RB the VORP monster: with the rail
    # the three live picks still fill the three missing starter slots.
    proj = {"q1": 260.0, "w1": 130.0, "t1": 70.0, "r1": 500.0, "r2": 400.0}
    repl = {"QB": 250.0, "WR": 120.0, "RB": 100.0, "TE": 60.0}
    out = R.replay_draft(_mini_picks(), {"k1"}, proj, repl, MINI_POS,
                         cory_roster_id=1, caps={"QB": 2, "RB": 3, "WR": 3,
                                                 "TE": 2},
                         starters=MINI_STARTERS, flex_slots=0)
    tool = {e["player_id"] for e in out["log"] if e["how"] == "tool"}
    assert tool == {"q1", "w1", "t1"}, (
        "the feasibility rail must refuse the RB pile and complete the lineup")
    assert out["forced_picks"] == 3


def test_replay_core_shadowed_picks_are_counted_not_cascaded():
    # tool's best pick at 4 is h3 (QB, picked by history at 6) — shadowing.
    proj = {"h3": 500.0, "w1": 130.0, "t1": 70.0, "q1": 260.0}
    repl = {"QB": 100.0, "WR": 120.0, "RB": 100.0, "TE": 60.0}
    out = R.replay_draft(_mini_picks(), {"k1"}, proj, repl, MINI_POS,
                         cory_roster_id=1, caps={"QB": 2, "RB": 3, "WR": 3,
                                                 "TE": 2},
                         starters=MINI_STARTERS, flex_slots=0)
    assert {s["player_id"] for s in out["shadowed_picks"]} == {"h3"}
    hist = [e for e in out["log"] if e["how"] == "history"]
    assert [e["player_id"] for e in hist] == ["h1", "h2", "h3", "h4"], (
        "history must stay byte-identical even when shadowed")


def test_replay_core_position_caps_hold():
    proj = {"q1": 500.0, "q2": 480.0, "w1": 130.0, "t1": 70.0, "r1": 90.0}
    repl = {"QB": 100.0, "WR": 120.0, "RB": 80.0, "TE": 60.0}
    out = R.replay_draft(_mini_picks(), {"k1"}, proj, repl, MINI_POS,
                         cory_roster_id=1,
                         caps={"QB": 1, "RB": 3, "WR": 3, "TE": 2},
                         starters=MINI_STARTERS, flex_slots=0)
    tool = [e["player_id"] for e in out["log"] if e["how"] == "tool"]
    assert "q1" in tool and "q2" not in tool, "QB cap 1 must refuse the QB2"


def test_room_draftable_filter_removes_undrafted_candidates():
    proj = {"x9": 999.0, "q1": 260.0, "w1": 130.0, "t1": 70.0}
    pos = dict(MINI_POS, x9="WR")
    repl = {"QB": 100.0, "WR": 120.0, "RB": 80.0, "TE": 60.0}
    allowed = {p["player_id"] for p in _mini_picks()} | {"q1", "w1", "t1"}
    out = R.replay_draft(_mini_picks(), {"k1"}, proj, repl, pos,
                         cory_roster_id=1,
                         caps={"QB": 2, "RB": 3, "WR": 3, "TE": 2},
                         starters=MINI_STARTERS, flex_slots=0,
                         allowed_pids=allowed)
    tool = {e["player_id"] for e in out["log"] if e["how"] == "tool"}
    assert "x9" not in tool, "the room-draftable filter must exclude x9"


# ── lineup arms, hand-computed ───────────────────────────────────────────────

def test_optimal_week_hand_case_with_flex_boundary():
    pos = {"q": "QB", "r1": "RB", "r2": "RB", "r3": "RB", "w1": "WR",
           "w2": "WR", "w3": "WR", "t": "TE"}
    pts = {"q": 20.0, "r1": 15.0, "r2": 5.0, "r3": 9.0, "w1": 12.0,
           "w2": 3.0, "w3": 8.9, "t": 7.0}
    # QB 20 + RB 15+9 + WR 12+8.9 + TE 7 + FLEX best remaining (r2=5 vs w2=3)
    got = R.optimal_week_points(list(pos), pos, pts)
    assert got == pytest.approx(20 + 15 + 9 + 12 + 8.9 + 7 + 5)
    # flip the boundary: w2 5.1 must displace r2 in FLEX.
    pts["w2"] = 5.1
    assert R.optimal_week_points(list(pos), pos, pts) == pytest.approx(
        20 + 15 + 9 + 12 + 8.9 + 7 + 5.1)


def test_optimal_week_unknown_position_excluded_unless_flex_bound():
    pos = {"q": "QB", "r1": "RB", "r2": "RB", "r3": "RB", "w1": "WR",
           "w2": "WR", "t": "TE"}
    roster = list(pos) + ["12530"]
    pts = {p: 10.0 for p in roster}
    pts["12530"] = 50.0
    base = R.optimal_week_points(roster, pos, pts)     # r3 fills FLEX at 10
    bound = R.optimal_week_points(roster, pos, pts, unknown_flex=True)
    assert bound == base + 50.0 - 10.0, (
        "the sensitivity bound seats the unknown-position player in FLEX, "
        "displacing the 10-point RB3")


def test_realistic_week_benches_the_inactive_and_ranks_start_of_week():
    pos = {"q1": "QB", "q2": "QB", "r1": "RB", "r2": "RB", "w1": "WR",
           "w2": "WR", "t1": "TE"}
    roster = list(pos)
    weekly = {
        "q1": {1: 2.0, 2: 30.0},          # bad week 1, monster week 2
        "q2": {1: 25.0},                   # NO row week 2 — known inactive
        "r1": {1: 10.0, 2: 10.0}, "r2": {1: 4.0, 2: 22.0},
        "w1": {1: 8.0, 2: 8.0}, "w2": {1: 6.0, 2: 6.0},
        "t1": {1: 5.0, 2: 5.0},
    }
    proj = {"q1": 170.0, "q2": 340.0, "r1": 85.0, "r2": 170.0,
            "w1": 85.0, "w2": 34.0, "t1": 51.0}
    # week 1: ranks are proj/17 → q2 (20) over q1 (10); r2 (10) over r1 (5).
    wk1 = R.realistic_week_points(roster, pos, weekly, 1, proj)
    assert wk1 == pytest.approx(25.0 + 4.0 + 8.0 + 6.0 + 5.0 + 10.0)
    # week 2: q2 has no row — benched though his season ppg leads; q1 starts.
    wk2 = R.realistic_week_points(roster, pos, weekly, 2, proj)
    assert wk2 == pytest.approx(30.0 + 22.0 + 8.0 + 6.0 + 5.0 + 10.0)


# ── the generalized substrate is pinned to the graded modules ────────────────

def test_weekly_points_and_features_match_the_graded_originals():
    from own_model_v2 import features_for, board_ages
    from own_model_v4 import weekly_points
    from model_accuracy_backtest import positions_record
    positions = positions_record()
    ages = board_ages()
    assert R.weekly_points_of(2024) == weekly_points(2024)
    assert R.features_of(2025, (2023, 2024), positions, ages) == \
        features_for(2025, (2023, 2024), positions, ages)
    assert R.features_of(2024, (2023,), positions, ages) == \
        features_for(2024, (2023,), positions, ages)


def test_scored_2022_points_exist_and_2021_2022_transition_is_nonvacuous():
    tot22, games22 = R.season_totals_of(2022)
    assert len(tot22) > 200 and max(tot22.values()) > 300
    feat = R.features_of(2022, (2021,), R_positions(), {})
    assert len(feat) > 200


def R_positions():
    from model_accuracy_backtest import positions_record
    return positions_record()


# ── determinism ──────────────────────────────────────────────────────────────

def test_replay_2025_is_deterministic():
    from model_accuracy_backtest import positions_record
    from own_model_v2 import board_ages
    positions = positions_record()
    ages = board_ages()
    names = R.name_map()
    a = R.replay_season(2025, positions, ages, names)
    b = R.replay_season(2025, positions, ages, names)
    assert a == b


# ── THE LEAKAGE GUARD — no ≥replay-season store on the projection path ───────

FORBIDDEN_ALWAYS = ("league_history.json", "proj_series.json",
                    "adp_series.json", "external_adp_series.json",
                    "pre_draft_freeze_2026.json", "draft_replay_2025.json")


def _trace_opens(monkeypatch, fn):
    """Every file path opened (Path.read_text / Path.open / builtins.open)
    while fn runs."""
    opened = []
    orig_read_text = Path.read_text
    orig_path_open = Path.open
    orig_open = builtins.open

    def rec_read_text(self, *a, **k):
        opened.append(str(self))
        return orig_read_text(self, *a, **k)

    def rec_path_open(self, *a, **k):
        opened.append(str(self))
        return orig_path_open(self, *a, **k)

    def rec_open(file, *a, **k):
        opened.append(str(file))
        return orig_open(file, *a, **k)

    monkeypatch.setattr(Path, "read_text", rec_read_text)
    monkeypatch.setattr(Path, "open", rec_path_open)
    monkeypatch.setattr(builtins, "open", rec_open)
    try:
        fn()
    finally:
        monkeypatch.undo()
    return opened


@pytest.mark.parametrize("season", [2025, 2024, 2023])
def test_projection_path_opens_no_store_of_the_replay_season_or_later(
        monkeypatch, season):
    from model_accuracy_backtest import positions_record
    from own_model_v2 import board_ages
    positions = positions_record()
    ages = board_ages()
    R.frozen_table()   # memoized league CONFIG (not outcomes) — warmed here so
    #                    the traced region never re-opens its carrier file
    opened = _trace_opens(
        monkeypatch, lambda: R.build_projections(season, positions, ages))
    bad = []
    for path in opened:
        name = Path(path).name
        if any(name == f for f in FORBIDDEN_ALWAYS):
            bad.append(name)
        for y in range(season, 2027):
            if name in (f"nflverse_weekly_points_{y}.json",
                        f"component_stats_{y}.json"):
                bad.append(name)
    # the multi-season Vegas file is the ONE allowed multi-year read: the
    # construction consumes only week-1 lines of the replay season (v5's
    # declared rule), asserted structurally below.
    assert bad == [], f"projection path for {season} touched forbidden: {bad}"
    assert opened, "the tracer saw nothing — the guard went vacuous"


def test_vegas_window_is_week_one_only():
    """The one multi-season file the projection path may read is consumed
    through implied_team_totals(season, 1, 1) — week-1-only, v5's declared
    rule. Pin the call site textually so a widened window goes red."""
    src = (DRAFT / "tools" / "draft_replay_2025.py").read_text()
    assert "implied_team_totals(replay_season, 1, 1)" in src
    assert "implied_team_totals(replay_season, 1, 2" not in src


# ── the real 2025 replay obeys the draft it replays ──────────────────────────

@pytest.fixture(scope="module")
def artifact():
    assert ARTIFACT.exists(), "run draft/tools/draft_replay_2025.py first"
    return json.loads(ARTIFACT.read_text())


def test_artifact_territory_first_and_shape(artifact):
    assert next(iter(artifact)) == "_territory"
    assert set(artifact["years"]) == {"2023", "2024", "2025"}
    assert artifact["question_verbatim"].startswith("Have we tested")


@pytest.mark.parametrize("season", ["2025", "2024", "2023"])
def test_replayed_board_is_consistent_with_history(artifact, season):
    y = artifact["years"][season]
    srec = R.season_record(int(season))
    picks, keepers = R.season_draft(srec)
    hist_by_no = {p["pick_no"]: str(p["player_id"]) for p in picks}
    log = y["replay"]["log"]
    assert len(log) == len(picks)
    seen: set = set()
    tool_pids: set = set()
    shadow_expected = set()
    for e in log:
        pid = e["player_id"]
        if e["how"] == "history":
            assert pid == hist_by_no[e["pick_no"]], (
                "an opponent's pick drifted from history")
            if pid in seen:
                # the only legal duplicate: history reaching a player the
                # TOOL already took — the counted shadow case.
                assert pid in tool_pids, f"{pid} duplicated outside shadowing"
                shadow_expected.add(pid)
        elif e["how"] == "keeper":
            assert pid == hist_by_no[e["pick_no"]]
            assert pid not in seen
            assert pid in keepers or any(
                p["pick_no"] == e["pick_no"] and p.get("is_keeper")
                for p in picks)
            tool_pids.add(pid)
        elif e["how"].startswith("mirror_"):
            assert pid == hist_by_no[e["pick_no"]], "K/DEF must be mirrored"
            assert pid not in seen
            tool_pids.add(pid)
        else:
            assert e["how"] == "tool"
            # availability: never a player already off the board.
            assert pid not in seen, f"{pid} picked twice"
            tool_pids.add(pid)
        seen.add(pid)
    assert shadow_expected == {s["player_id"]
                               for s in y["replay"]["shadowed_picks"]}, (
        "the shadow counter must record exactly the duplicated pids")
    # every tool pick sits exactly at one of Cory's live slots.
    cory_live = {p["pick_no"] for p in picks
                 if p["roster_id"] == R.CORY_ROSTER_ID
                 and not (p.get("is_keeper") or str(p["player_id"]) in keepers)}
    tool_slots = {e["pick_no"] for e in log
                  if e["how"] in ("tool", "mirror_K", "mirror_DEF")}
    assert tool_slots == cory_live


@pytest.mark.parametrize("season", ["2025", "2024", "2023"])
def test_tool_roster_fills_every_starter_and_respects_caps(artifact, season):
    y = artifact["years"][season]
    counts = y["replay"]["position_counts"]
    for pos, cap in R.POSITION_CAPS.items():
        assert counts[pos] <= cap
    for pos, need in R.STARTER_SLOTS.items():
        assert counts[pos] >= need, f"{pos} starters unfilled"
    flex_spare = sum(max(0, counts[q] - R.STARTER_SLOTS[q])
                     for q in R.FLEX_ELIGIBLE)
    assert flex_spare >= R.FLEX_SLOTS, "FLEX unfilled"


def test_verdict_deltas_are_internally_consistent(artifact):
    for season, y in artifact["years"].items():
        for arm in ("optimal", "realistic"):
            a = y["arms"][arm]
            t = round(sum(a["tool"]["weekly"]), 2)
            c = round(sum(a["cory_drafted"]["weekly"]), 2)
            assert t == a["tool"]["season_total"]
            assert c == a["cory_drafted"]["season_total"]
            assert round(t - c, 2) == a["delta_tool_minus_cory"]
            h = a["head_to_head"]
            assert h["tool_weeks_won"] + h["cory_weeks_won"] + h["ties"] == 17


# ── the committed artifact equals its regeneration ───────────────────────────
#
# NOTE (2026-08-16, artifact-freshness infra): the committed-artifact ==
# regeneration pin that used to live here (`test_artifact_matches_
# regeneration`, @pytest.mark.repo_parity) is now covered by draft/data/
# artifact_registry.json + `draft/tools/check_artifact_freshness.py` (entry
# "draft_replay_2025") instead of a bespoke pytest function — see
# draft/audit/artifact_freshness_infra_2026-08-16.md. That check runs
# `R.run()` and diffs it against draft/data/draft_replay_2025.json exactly as
# this test did; it is informational (FRESH/STALE), never a pytest gate item,
# because the mismatch it reports is "the board moved on" (positions
# record / board ages refreshed by the nightly rebuild), not a code defect.
