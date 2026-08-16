# TERRITORY: A
"""weekly_own_grade — the Tuesday grade + the mechanical adaptation, tested.

The claims: MAE/Spearman recomputed by hand on synthetic data; a projected
player with no stat row is counted and named, never scored as zero; provider
arms grade on their own population AND the shared one, honestly labeled, and
the sleeper_fp_average arm exists only where both providers do; the promotion
rule fires exactly on its stated conditions and refuses on each named guard;
the version bumps and the old champion survives as a challenger; the tilt
axis seeds a follow-on variant; the issue formatter carries the evidence; the
ledger is idempotent (a graded week is never re-graded); partial actuals are
refused by name; controls pause promotions and record manual overrides with
an alert; main() runs end to end through the same env overrides the workflow
uses.
"""
import datetime as dt
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT / "draft"))
sys.path.insert(0, str(ROOT / "draft" / "backtest"))

import weekly_own_grade as WG  # noqa: E402
import weekly_own_projection as WP  # noqa: E402


# ── fixtures ─────────────────────────────────────────────────────────────────

def _snapshot(week=1, champ="v1"):
    """A 4-player snapshot with two arms, hand-sized numbers."""
    proj = {"1": {"mean": 10.0, "team": "DET", "pos": "RB"},
            "2": {"mean": 20.0, "team": "KC", "pos": "QB"},
            "3": {"mean": 8.0, "team": "CHI", "pos": "WR"},
            "4": {"mean": 6.0, "team": "SEA", "pos": "TE"}}
    return {
        "season": 2026, "week": week, "date": "2026-09-10",
        "diagnostics": {"formula": "own_weekly_v1", "champion_arm": champ},
        "projections": proj,
        "challengers": {"v1_notilt": {"1": 9.0, "2": 21.0, "3": 8.0, "4": 6.0}},
        "names": {"1": "Back One", "2": "Quarter Two", "3": "Wide Three",
                  "4": "End Four"},
    }


ACTUALS = {"1": 14.0, "2": 18.0, "3": 8.0}          # "4" has NO stat row


def test_grade_arithmetic_by_hand():
    e = WG.grade_week(_snapshot(), ACTUALS)
    # champion errors: |10-14|=4, |20-18|=2, |8-8|=0 -> MAE 2.0
    assert e["own_arms"]["v1"]["mae"] == 2.0
    assert e["own_arms"]["v1"]["n"] == 3
    # challenger: |9-14|=5, |21-18|=3, |8-8|=0 -> 8/3
    assert e["own_arms"]["v1_notilt"]["mae"] == round(8 / 3, 3)
    # per-position rows exist for exactly the graded positions
    assert set(e["own_arms"]["v1"]["per_pos"]) == {"RB", "QB", "WR"}
    assert e["own_arms"]["v1"]["per_pos"]["RB"]["mae"] == 4.0


def test_no_stat_row_is_absent_not_zero():
    e = WG.grade_week(_snapshot(), ACTUALS)
    pop = e["population"]
    assert pop["projected"] == 4 and pop["with_actual"] == 3
    assert pop["no_stat_row"]["count"] == 1
    assert pop["no_stat_row"]["player_ids"] == ["4"]
    # and "4" appears in no arm's error math (MAE above already proves the
    # champion; the rows block must not carry him either)
    assert "4" not in e["rows"]


def test_top_misses_carry_names_and_signed_errors():
    e = WG.grade_week(_snapshot(), ACTUALS)
    top = e["top_misses"]
    assert top[0]["name"] == "Back One" and top[0]["err"] == -4.0   # under
    assert top[1]["name"] == "Quarter Two" and top[1]["err"] == 2.0  # over
    assert "OVER" in e["miss_pattern"] and "UNDER" in e["miss_pattern"]


def test_spearman_matches_lab_projections():
    from lab_projections import spearman
    e = WG.grade_week(_snapshot(), ACTUALS)
    pids = ["1", "2", "3"]
    want = round(spearman([10.0, 20.0, 8.0], [14.0, 18.0, 8.0]), 4)
    assert e["own_arms"]["v1"]["spearman"] == want


# ── provider study arms ──────────────────────────────────────────────────────

def _series(week=1, fp=False):
    s = [{"date": "2026-09-13", "source": "sleeper_weekly", "week": week,
          "proj": {"1": 12.0, "2": 19.0, "9": 7.0}}]
    if fp:
        s.append({"date": "2026-09-11", "source": "fantasypros_weekly",
                  "week": week, "proj": {"1": 16.0, "2": 17.0}})
    return s


def test_provider_weeklies_grades_only_what_the_archive_carries():
    assert set(WG.provider_weeklies(_series(), 1)) == {"sleeper"}
    assert set(WG.provider_weeklies(_series(fp=True), 1)) == {
        "sleeper", "fantasypros", "sleeper_fp_average"}
    assert WG.provider_weeklies(_series(), 2) == {}


def test_sleeper_fp_average_is_the_mean_where_both_exist():
    pw = WG.provider_weeklies(_series(fp=True), 1)
    assert pw["sleeper_fp_average"] == {"1": 14.0, "2": 18.0}   # "9": FP absent


def test_provider_arm_populations_are_labeled_never_mixed():
    e = WG.grade_week(_snapshot(), ACTUALS,
                      provider_proj=WG.provider_weeklies(_series(), 1))
    sl = e["providers"]["sleeper"]
    # own population: {1,2,9} ∩ actuals = {1,2}: errs |12-14|,|19-18| -> 1.5
    assert sl["own_population"]["n"] == 2
    assert sl["own_population"]["mae"] == 1.5
    # shared with ours: {1,2} — champion graded on the SAME pids beside it
    assert sl["shared_with_ours"]["n"] == 2
    assert sl["shared_with_ours"]["sleeper"]["mae"] == 1.5
    assert sl["shared_with_ours"]["own_champion"]["mae"] == 3.0   # (4+2)/2
    assert "different populations are labeled" in sl["population_note"]


# ── the mechanical promotion rule ────────────────────────────────────────────

def _weeks(champ_maes, chall_maes, champ_rho=0.6, chall_rho=0.6, arm="v1_notilt"):
    weeks = {}
    for i, (a, b) in enumerate(zip(champ_maes, chall_maes), start=1):
        weeks[str(i)] = {"own_arms": {
            "v1": {"mae": a, "spearman": champ_rho, "n": 100},
            arm: {"mae": b, "spearman": chall_rho, "n": 100}}}
    return weeks


CHAMPION = {"version": "own_weekly_v1", "arm": "v1", "since_week": None}
ARMS = [dict(a) for a in WP.DEFAULT_ARMS]


def test_promotion_fires_on_the_stated_conditions():
    # 3 weeks, challenger wins all 3, leads cumulative, same rho.
    p = WG.decide_promotion(CHAMPION, _weeks([5.0, 5.0, 5.0], [4.0, 4.5, 4.8]), ARMS)
    assert p is not None
    assert p["to"] == {"version": "own_weekly_v2", "arm": "v1_notilt"}
    assert p["evidence"]["weeks_used"] == [1, 2, 3]
    assert p["evidence"]["cum_mae"] == round((4.0 + 4.5 + 4.8) / 3, 3)


def test_promotion_needs_three_weeks():
    assert WG.decide_promotion(CHAMPION, _weeks([5, 5], [4, 4]), ARMS) is None


def test_promotion_needs_three_of_last_four_weekly_wins():
    # 4 weeks: challenger wins only 2 of the last 4 -> refused, even though
    # cumulative leads.
    p = WG.decide_promotion(CHAMPION,
                            _weeks([5, 5, 5, 5], [1.0, 1.0, 6.0, 6.0]), ARMS)
    assert p is None
    # 3 of last 4 -> fires.
    p = WG.decide_promotion(CHAMPION,
                            _weeks([5, 5, 5, 5], [4.0, 4.0, 6.0, 4.0]), ARMS)
    assert p is not None


def test_promotion_refuses_on_cumulative_mae():
    # wins 3 of last 4 but loses the full span on cumulative MAE.
    p = WG.decide_promotion(
        CHAMPION, _weeks([5, 5, 5, 5, 5], [24.0, 4.9, 4.9, 5.1, 4.9]), ARMS)
    assert p is None


def test_promotion_refuses_on_spearman_loss():
    p = WG.decide_promotion(
        CHAMPION, _weeks([5, 5, 5], [4, 4, 4], champ_rho=0.65, chall_rho=0.62),
        ARMS)
    assert p is None                                   # 0.03 > tolerance 0.02
    p = WG.decide_promotion(
        CHAMPION, _weeks([5, 5, 5], [4, 4, 4], champ_rho=0.65, chall_rho=0.64),
        ARMS)
    assert p is not None                               # 0.01 within tolerance


def test_promotion_picks_best_cumulative_among_qualifiers():
    weeks = _weeks([5, 5, 5], [4.5, 4.5, 4.5], arm="v1_notilt")
    for wk, e in _weeks([5, 5, 5], [4.0, 4.0, 4.0], arm="v1_tilt150").items():
        weeks[wk]["own_arms"]["v1_tilt150"] = e["own_arms"]["v1_tilt150"]
    p = WG.decide_promotion(CHAMPION, weeks, ARMS)
    assert p["to"]["arm"] == "v1_tilt150"


def test_version_bump_chain():
    p = WG.decide_promotion({"version": "own_weekly_v7", "arm": "v1"},
                            _weeks([5, 5, 5], [4, 4, 4]), ARMS)
    assert p["to"]["version"] == "own_weekly_v8"


def test_seed_challenger_follows_the_winning_tilt_direction():
    assert WG.seed_challenger({"name": "v1_tilt150", "divisor": 17,
                               "tilt_scale": 1.5}, ARMS) == \
        {"name": "v1_tilt225", "divisor": 17, "tilt_scale": 2.25}
    assert WG.seed_challenger({"name": "v1_tilt050", "divisor": 17,
                               "tilt_scale": 0.5}, ARMS) == \
        {"name": "v1_tilt025", "divisor": 17, "tilt_scale": 0.25}
    # no-tilt and divisor variants seed nothing — humans invent new axes
    assert WG.seed_challenger({"name": "v1_notilt", "divisor": 17,
                               "tilt_scale": 0.0}, ARMS) is None
    assert WG.seed_challenger({"name": "v1_pg16", "divisor": 16,
                               "tilt_scale": 1.0}, ARMS) is None
    # a name collision refuses rather than doubling an arm
    arms = ARMS + [{"name": "v1_tilt225", "divisor": 17, "tilt_scale": 2.25}]
    assert WG.seed_challenger({"name": "v1_tilt150", "divisor": 17,
                               "tilt_scale": 1.5}, arms) is None


def test_issue_text_carries_the_evidence_table():
    p = WG.decide_promotion(CHAMPION, _weeks([5.0, 5.0, 5.0], [4.0, 4.5, 4.8]),
                            ARMS)
    title, body = WG.issue_text(p)
    assert title == "Weekly model adapted: own_weekly_v1 -> own_weekly_v2"
    assert "| 1 | 4.0 | 5.0 |" in body
    assert "stays active as a challenger" in body
    assert "never auto-promoted" in body               # the provider boundary


# ── main(): end to end through the workflow's env overrides ──────────────────

def _setup_dir(tmp_path, weeks=(1,), actual_weeks=None, teams=26, n_pad=250):
    own = tmp_path / "weekly_own"
    own.mkdir()
    for w in weeks:
        (own / f"own_weekly_2026_w{w}.json").write_text(
            json.dumps(_snapshot(week=w)))
    aw = {}
    for w in (actual_weeks if actual_weeks is not None else weeks):
        players = dict(ACTUALS)
        # pad to clear the partial-week guard without touching the graded pids
        for i in range(n_pad):
            players[f"pad{i}"] = 1.0
        aw[str(w)] = {"players": players, "teams": teams}
    actuals = tmp_path / "actuals.json"
    actuals.write_text(json.dumps({"weeks": aw}))
    series = tmp_path / "proj_series.json"
    series.write_text(json.dumps({"series": _series()}))
    return own, actuals, series


def _run_main(args, env):
    old = {k: os.environ.get(k) for k in env}
    os.environ.update(env)
    try:
        return WG.main(args)
    finally:
        for k, v in old.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v


def _env(own, actuals, series, tmp_path, **extra):
    e = {"OWN_WEEKLY_DIR": str(own), "OWN_WEEKLY_ACTUALS": str(actuals),
         "OWN_WEEKLY_PROJ_SERIES": str(series),
         "OWN_WEEKLY_CONTROLS": str(tmp_path / "controls.json"),
         "OWN_WEEKLY_ISSUE_DIR": str(tmp_path / "issue")}
    e.update(extra)
    return e


def test_main_grades_and_is_idempotent(tmp_path):
    own, actuals, series = _setup_dir(tmp_path)
    env = _env(own, actuals, series, tmp_path)
    assert _run_main(["--date", "2026-09-15"], env) == 0
    ledger = json.loads((own / "grades_2026.json").read_text())
    assert next(iter(ledger)) == "_territory"
    assert ledger["weeks"]["1"]["own_arms"]["v1"]["mae"] == 2.0
    assert ledger["weeks"]["1"]["providers"]["sleeper"]["own_population"]["mae"] == 1.5
    assert ledger["champion"]["version"] == "own_weekly_v1"
    before = (own / "grades_2026.json").read_text()
    # second run: the graded week is not re-graded, the file does not change
    assert _run_main(["--date", "2026-09-16"], env) == 0
    assert (own / "grades_2026.json").read_text() == before


def test_main_waits_for_the_weeks_tuesday(tmp_path):
    own, actuals, series = _setup_dir(tmp_path)
    env = _env(own, actuals, series, tmp_path)
    # Sunday of week 1: games still playing — nothing grades.
    assert _run_main(["--date", "2026-09-13"], env) == 0
    assert not (own / "grades_2026.json").exists()


def test_main_refuses_partial_actuals_by_name(tmp_path):
    own, actuals, series = _setup_dir(tmp_path, teams=10)   # MNF not in yet
    env = _env(own, actuals, series, tmp_path)
    assert _run_main(["--date", "2026-09-15"], env) == 0
    assert not (own / "grades_2026.json").exists()


def test_main_dry_run_redirects_the_ledger(tmp_path):
    own, actuals, series = _setup_dir(tmp_path)
    dry = tmp_path / "dry" / "grades_dry.json"
    env = _env(own, actuals, series, tmp_path,
               OWN_WEEKLY_LEDGER_OUT=str(dry))
    assert _run_main(["--date", "2026-09-15"], env) == 0
    assert dry.exists()
    assert not (own / "grades_2026.json").exists()          # nothing in place


def test_main_promotes_after_three_winning_weeks_and_writes_the_alert(tmp_path):
    own, actuals, series = _setup_dir(tmp_path, weeks=(1, 2, 3))
    # make the challenger strictly better every week: nudge actuals toward it
    doc = json.loads(Path(actuals).read_text())
    for w in doc["weeks"].values():
        w["players"]["1"] = 9.0        # v1 proj 10 err 1; v1_notilt 9 err 0
        w["players"]["2"] = 21.0       # v1 err 1; v1_notilt err 0
        w["players"]["3"] = 8.0
    Path(actuals).write_text(json.dumps(doc))
    env = _env(own, actuals, series, tmp_path)
    assert _run_main(["--date", "2026-09-29"], env) == 0
    ledger = json.loads((own / "grades_2026.json").read_text())
    assert ledger["champion"] == {"version": "own_weekly_v2",
                                  "arm": "v1_notilt", "since_week": 4}
    assert len(ledger["promotions"]) == 1
    rec = ledger["promotions"][0]
    assert rec["from"]["arm"] == "v1" and rec["to"]["arm"] == "v1_notilt"
    assert rec["effective_from_week"] == 4
    # the OLD champion survives as an active challenger
    assert any(a["name"] == "v1" for a in ledger["active_arms"])
    # the alert payload exists for the workflow's issue step
    issue = tmp_path / "issue"
    assert (issue / "promotion_title.txt").read_text().startswith(
        "Weekly model adapted: own_weekly_v1 -> own_weekly_v2")
    assert "| 1 |" in (issue / "promotion_body.md").read_text()


def test_main_holds_promotions_while_adaptation_is_paused(tmp_path):
    own, actuals, series = _setup_dir(tmp_path, weeks=(1, 2, 3))
    doc = json.loads(Path(actuals).read_text())
    for w in doc["weeks"].values():
        w["players"]["1"] = 9.0
        w["players"]["2"] = 21.0
    Path(actuals).write_text(json.dumps(doc))
    env = _env(own, actuals, series, tmp_path)
    Path(env["OWN_WEEKLY_CONTROLS"]).write_text(
        json.dumps({"auto_adapt": False}))
    assert _run_main(["--date", "2026-09-29"], env) == 0
    ledger = json.loads((own / "grades_2026.json").read_text())
    assert ledger["champion"]["version"] == "own_weekly_v1"   # held
    assert ledger["promotions"] == []
    assert len(ledger["weeks"]) == 3                          # still graded


def test_main_records_manual_override_once_with_an_alert(tmp_path):
    own, actuals, series = _setup_dir(tmp_path)
    env = _env(own, actuals, series, tmp_path)
    Path(env["OWN_WEEKLY_CONTROLS"]).write_text(
        json.dumps({"champion_override": "v1_pg16"}))
    assert _run_main(["--date", "2026-09-15"], env) == 0
    ledger = json.loads((own / "grades_2026.json").read_text())
    assert ledger["promotions"][-1]["type"] == "manual_override"
    assert ledger["promotions"][-1]["to"]["arm"] == "v1_pg16"
    title = (tmp_path / "issue" / "promotion_title.txt").read_text()
    assert "manual override" in title
    # champion in the LEDGER stays mechanical — the override is an overlay
    assert ledger["champion"]["arm"] == "v1"
    # a second run does not double-record the same override
    n = len(ledger["promotions"])
    assert _run_main(["--date", "2026-09-16"], env) == 0
    ledger2 = json.loads((own / "grades_2026.json").read_text())
    assert len(ledger2["promotions"]) == n


def test_main_no_snapshots_is_a_clean_exit(tmp_path):
    own = tmp_path / "empty"
    own.mkdir()
    assert _run_main(["--date", "2026-09-15"],
                     {"OWN_WEEKLY_DIR": str(own)}) == 0


def test_empty_ledger_carries_formula_per_arm():
    led = WG.empty_ledger(2026)
    assert all("formula" in a for a in led["active_arms"])
    assert led["active_arms"][0]["formula"].startswith("proj_ownmodel/17")


def test_week_games_complete_boundary():
    assert not WG.week_games_complete(1, dt.date(2026, 9, 14))   # Monday
    assert WG.week_games_complete(1, dt.date(2026, 9, 15))       # Tuesday
