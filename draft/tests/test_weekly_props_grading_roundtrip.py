# TERRITORY: A
"""THE FULL ROUND TRIP, FIXTURE-INJECTED, KNOWN ANSWERS — proving the
props_weekly_v1 pipeline end to end BEFORE any real credit is spent.

draft/audit/weekly_props_study_2026-08-16.md calls this out by name: "prove
this end-to-end NOW using synthetic fixtures with known injected answers, so
the pipeline is provably correct before real money is spent." This is that
proof, exercising the REAL modules in the REAL order a real Tuesday would:

    raw prop-odds fixture
      -> fetch_weekly_props.build_week_props / build_snapshot   (the fetch)
      -> committed weekly_props_2026_w1.json under a temp dir
      -> weekly_own_grade.main() (env-pointed at the temp dirs, same CLI the
         workflow runs, same fixture-injection env-override convention
         OWN_WEEKLY_ACTUALS already uses)
      -> the grades ledger's providers.props_weekly_v1 block

Every number the ledger reports is recomputed HERE, independently, from the
same known inputs — not re-trusted from the code under test.
"""
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT / "draft"))
sys.path.insert(0, str(ROOT / "draft" / "backtest"))
sys.path.insert(0, str(ROOT / "draft" / "tools"))

import fetch_weekly_props as FP  # noqa: E402
import weekly_own_grade as WG  # noqa: E402
from fetch_component_stats import frozen_scoring_table  # noqa: E402
from lab_projections import spearman  # noqa: E402

BOARD = [
    {"player_id": "1", "name": "Patrick Mahomes", "position": "QB", "team": "KC"},
    {"player_id": "2", "name": "Josh Allen", "position": "QB", "team": "BUF"},
    {"player_id": "3", "name": "CeeDee Lamb", "position": "WR", "team": "DAL"},
    {"player_id": "4", "name": "Justin Jefferson", "position": "WR", "team": "MIN"},
]

# The KNOWN actual points, injected as ground truth — independent of props.
ACTUALS = {"1": 25.0, "2": 15.0, "3": 10.0, "4": 20.0}

# The KNOWN champion means (own_weekly_v1) for the same four players. Player
# "2" (Josh Allen) deliberately gets NO prop line below — proving the
# "absent, not blended" fallback the study preregisters.
CHAMPION_MEANS = {"1": 20.0, "2": 18.0, "3": 14.0, "4": 16.0}


def _outcome(name, pt):
    return {"name": "Over", "description": name, "point": pt, "price": -110}


def _event(event_id, home, away, market_rows):
    """market_rows: {market_key: [(player_name, point), ...]} — ONE book, so
    the median-of-books arithmetic is trivially the single quoted point."""
    markets = [{"key": mk, "outcomes": [_outcome(n, p) for n, p in rows]}
              for mk, rows in market_rows.items()]
    return {"event_id": event_id, "home_team": home, "away_team": away,
           "kickoff": "2026-09-10T00:00:00Z",
           "odds": {"data": {"bookmakers": [{"key": "onebook", "markets": markets}]}}}


# The raw fixture: TWO events, THREE players quoted (Mahomes, Lamb,
# Jefferson) — Josh Allen appears on NEITHER event's market list.
PASS_YDS_LINE = 275.0
LAMB_REC_LINE = 6.5
JEFFERSON_REC_LINE = 8.5

EVENTS = [
    _event("evA", "Kansas City Chiefs", "Dallas Cowboys", {
        "player_pass_yds": [("Patrick Mahomes", PASS_YDS_LINE)],
        "player_receptions": [("CeeDee Lamb", LAMB_REC_LINE)],
    }),
    _event("evB", "Minnesota Vikings", "Chicago Bears", {
        "player_receptions": [("Justin Jefferson", JEFFERSON_REC_LINE)],
    }),
]


def _own_weekly_snapshot():
    return {
        "season": 2026, "week": 1, "date": "2026-09-10",
        "diagnostics": {"formula": "own_weekly_v1", "champion_arm": "v1"},
        "projections": {pid: {"mean": mean, "team": next(p["team"] for p in BOARD if p["player_id"] == pid),
                              "pos": next(p["position"] for p in BOARD if p["player_id"] == pid)}
                       for pid, mean in CHAMPION_MEANS.items()},
        "challengers": {},
        "names": {p["player_id"]: p["name"] for p in BOARD},
    }


def _run_grade(tmp_path, props_dir):
    own_dir = tmp_path / "weekly_own"
    own_dir.mkdir()
    (own_dir / "own_weekly_2026_w1.json").write_text(json.dumps(_own_weekly_snapshot()))

    actuals_doc = {"weeks": {"1": {
        "players": {**ACTUALS, **{f"pad{i}": 1.0 for i in range(250)}},
        "teams": 26,
    }}}
    actuals_path = tmp_path / "actuals.json"
    actuals_path.write_text(json.dumps(actuals_doc))

    series_path = tmp_path / "proj_series.json"
    series_path.write_text(json.dumps({"series": []}))

    env = {
        "OWN_WEEKLY_DIR": str(own_dir),
        "OWN_WEEKLY_ACTUALS": str(actuals_path),
        "OWN_WEEKLY_PROJ_SERIES": str(series_path),
        "OWN_WEEKLY_CONTROLS": str(tmp_path / "controls.json"),
        "OWN_WEEKLY_ISSUE_DIR": str(tmp_path / "issue"),
        "PROPS_WEEKLY_DIR": str(props_dir),
    }
    old = {k: os.environ.get(k) for k in env}
    os.environ.update(env)
    try:
        rc = WG.main(["--date", "2026-09-15"])
    finally:
        for k, v in old.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v
    assert rc == 0
    return json.loads((own_dir / "grades_2026.json").read_text())


def test_full_roundtrip_props_arm_matches_hand_computed_mae(tmp_path):
    table = frozen_scoring_table()

    # ── step 1: the fetch tool builds the committed props snapshot from the
    # SAME raw fixture a real dispatch would receive from the-odds-api.com ──
    result = FP.build_week_props(EVENTS, BOARD, table)
    assert set(result["players"]) == {"1", "3", "4"}          # "2" absent
    snapshot = FP.build_snapshot(result, 2026, 1, "2026-09-10T00:00:00Z")

    props_dir = tmp_path / "props"
    props_dir.mkdir()
    (props_dir / "weekly_props_2026_w1.json").write_text(json.dumps(snapshot))

    # Independently recompute the implied points EXACTLY as the module's own
    # docstring states the arithmetic: point x the league's own scoring rate.
    pts1 = round(PASS_YDS_LINE * table.get("pass_yd", 0.0), 2)
    pts3 = round(LAMB_REC_LINE * table.get("rec", 0.0), 2)
    pts4 = round(JEFFERSON_REC_LINE * table.get("rec", 0.0), 2)
    assert snapshot["players"]["1"]["points"] == pts1
    assert snapshot["players"]["3"]["points"] == pts3
    assert snapshot["players"]["4"]["points"] == pts4

    # ── step 2: weekly_own_grade.main() — the SAME CLI the Tuesday workflow
    # runs — grades the champion AND (because PROPS_WEEKLY_DIR now has a
    # snapshot for this week) props_weekly_v1, through the identical
    # provider-study pathway sleeper/fantasypros already use ──────────────
    ledger = _run_grade(tmp_path, props_dir)

    # champion (own_arms), hand-computed on ALL FOUR graded players:
    champ_errs = [abs(CHAMPION_MEANS[p] - ACTUALS[p]) for p in ("1", "2", "3", "4")]
    champ_mae = round(sum(champ_errs) / len(champ_errs), 3)
    assert ledger["weeks"]["1"]["own_arms"]["v1"]["mae"] == champ_mae == 4.0

    # props_weekly_v1's OWN population is {"1","3","4"} intersected with
    # actuals — "2" (Josh Allen) was never quoted a market, so it is ABSENT
    # from this arm entirely, exactly as the study preregisters (never
    # blended down to the champion's number).
    props_block = ledger["weeks"]["1"]["providers"]["props_weekly_v1"]
    props_pts = {"1": pts1, "3": pts3, "4": pts4}
    props_errs = [abs(props_pts[p] - ACTUALS[p]) for p in ("1", "3", "4")]
    props_mae = round(sum(props_errs) / len(props_errs), 3)
    assert props_block["own_population"]["n"] == 3
    assert props_block["own_population"]["mae"] == props_mae

    # cross-check the reported rank correlation against the SAME pure
    # function grade_week itself calls, over the SAME ordered population
    # (proves the wiring passes the right (proj, actual) pairs, not just
    # that spearman() is correct in isolation — that is pinned elsewhere).
    ordered = sorted(props_pts, key=lambda x: (len(x), x))
    expected_rho = round(spearman([props_pts[p] for p in ordered],
                                  [ACTUALS[p] for p in ordered]), 4)
    assert props_block["own_population"]["spearman"] == expected_rho

    # shared_with_ours: the champion's with_actual population (all four
    # players — every one has a real stat row) intersected with the props
    # population is the SAME three players here, so the shared comparison
    # cell and the own_population cell agree — and own_champion on that
    # shared population is a DIFFERENT, independently hand-checked number.
    shared = props_block["shared_with_ours"]
    assert shared["n"] == 3
    assert shared["props_weekly_v1"]["mae"] == props_mae
    champ_shared_errs = [abs(CHAMPION_MEANS[p] - ACTUALS[p]) for p in ("1", "3", "4")]
    champ_shared_mae = round(sum(champ_shared_errs) / len(champ_shared_errs), 3)
    assert shared["own_champion"]["mae"] == champ_shared_mae

    # props_weekly_v1 is graded but NEVER a promotion candidate — it never
    # entered active_arms, so decide_promotion has nothing of its to select.
    assert all(p["arm"] != "props_weekly_v1" for p in ledger["promotions"])
    assert "props_weekly_v1" not in {a["name"] for a in ledger["active_arms"]}


def test_week_with_no_props_snapshot_grades_champion_only(tmp_path):
    # No PROPS_WEEKLY_DIR snapshot committed for this week (the honest
    # default state on THIS branch) — grading proceeds exactly as it always
    # has; props_weekly_v1 simply never appears.
    props_dir = tmp_path / "props"        # created, left empty on purpose
    props_dir.mkdir()
    ledger = _run_grade(tmp_path, props_dir)
    assert "props_weekly_v1" not in ledger["weeks"]["1"]["providers"]
    assert ledger["weeks"]["1"]["own_arms"]["v1"]["mae"] == 4.0
