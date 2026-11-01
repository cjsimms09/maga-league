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

def _setup_dir(tmp_path, weeks=(1,), actual_weeks=None, teams=32, n_pad=250):
    tmp_path = Path(tmp_path)
    tmp_path.mkdir(parents=True, exist_ok=True)
    # teams default 26 -> 32 on 2026-09-14: the partial-actuals bar now comes
    # from the schedule (weeks 1-3 play 16 games = 32 teams) instead of the
    # bye-week constant, so a fixture claiming 26 teams for week 1 is claiming
    # a week that did not happen. The one caller that deliberately passes a low
    # count (teams=10, "MNF not in yet") still refuses, as it should.
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


#: ⛔ WHY THESE FIXTURES GREW FROM 3 WEEKS TO 6 ON 2026-11-01.
#: The best-of-K null now GATES (register 211: the rule alone promotes a
#: skill-free arm in 95% of seasons). The gate has a measured minimum SIZE: at
#: k=2 active arms the smallest p the permutation test can produce is 0.2584 at
#: 3 weeks, 0.1279 at 4, 0.0710 at 5, and it first clears 0.05 at SIX. These
#: fixtures carry exactly two arms with data, so a 3-week fixture cannot
#: promote any more — not because the arm is worse but because the test cannot
#: see. Both directions are now tested: this one promotes at a size the null
#: can resolve, and the next one asserts the refusal at a size it cannot.
_GATE_MIN_WEEKS_AT_K2 = (1, 2, 3, 4, 5, 6)


def test_main_promotes_after_enough_winning_weeks_and_writes_the_alert(tmp_path):
    own, actuals, series = _setup_dir(tmp_path, weeks=_GATE_MIN_WEEKS_AT_K2)
    # make the challenger strictly better every week: nudge actuals toward it
    doc = json.loads(Path(actuals).read_text())
    for w in doc["weeks"].values():
        w["players"]["1"] = 9.0        # v1 proj 10 err 1; v1_notilt 9 err 0
        w["players"]["2"] = 21.0       # v1 err 1; v1_notilt err 0
        w["players"]["3"] = 8.0
    Path(actuals).write_text(json.dumps(doc))
    #: 11-01 not 09-29: weeks 4-6 had not finished by 09-29, so
    #: grading correctly refused them and the fixture only ever
    #: produced 3 graded weeks — below the gate's k=2 minimum.
    env = _env(own, actuals, series, tmp_path)
    assert _run_main(["--date", "2026-11-01"], env) == 0
    ledger = json.loads((own / "grades_2026.json").read_text())
    last = max(int(w) for w in ledger["weeks"])
    assert ledger["champion"] == {"version": "own_weekly_v2",
                                  "arm": "v1_notilt", "since_week": last + 1}
    assert len(ledger["promotions"]) == 1
    rec = ledger["promotions"][0]
    assert rec["from"]["arm"] == "v1" and rec["to"]["arm"] == "v1_notilt"
    assert rec["effective_from_week"] == last + 1
    # ⛔ AND THE PROMOTION CARRIES THE GATE IT PASSED, not just the null
    assert rec["gate"]["passed"] is True
    assert rec["blocked"] is False
    assert rec["gate"]["reason"].startswith("the rule fired and the null did not stop it")
    #: the pass must NOT be dressed up as proof the arm is better — register
    #: 211 puts this gate's power at ~22.7% for a realistic edge
    assert "power_ceiling" in rec["gate"]
    assert rec["gate"]["reachability"]["reachable"] is True
    assert ledger["blocked_promotions"] == []
    # the OLD champion survives as an active challenger
    assert any(a["name"] == "v1" for a in ledger["active_arms"])
    # the alert payload exists for the workflow's issue step
    issue = tmp_path / "issue"
    assert (issue / "promotion_title.txt").read_text().startswith(
        "Weekly model adapted: own_weekly_v1 -> own_weekly_v2")
    assert "| 1 |" in (issue / "promotion_body.md").read_text()


def test_main_BLOCKS_and_RECORDS_when_the_gate_cannot_pass_at_this_size(tmp_path):
    """⚠️ THE OTHER DIRECTION, and the one that makes the gate worth having.

    Same winning challenger, three weeks instead of six. The rule fires — it
    only ever asked for 3 weeks and 3-of-last-4 — and the null refuses,
    because at k=2 over 3 rows the test cannot produce a p below 0.2584.

    The refusal must be RECORDED. A block recorded nowhere is indistinguishable
    from a week when no arm qualified, and those are opposite situations: one
    means nothing looked better, the other means something looked better and
    the null would not license it.
    """
    own, actuals, series = _setup_dir(tmp_path, weeks=(1, 2, 3))
    doc = json.loads(Path(actuals).read_text())
    for w in doc["weeks"].values():
        w["players"]["1"] = 9.0
        w["players"]["2"] = 21.0
        w["players"]["3"] = 8.0
    Path(actuals).write_text(json.dumps(doc))
    env = _env(own, actuals, series, tmp_path)
    assert _run_main(["--date", "2026-09-29"], env) == 0
    ledger = json.loads((own / "grades_2026.json").read_text())
    # nothing applied
    assert ledger["promotions"] == []
    assert ledger["champion"]["arm"] == "v1"
    # and the refusal is on the record, with its reason
    assert len(ledger["blocked_promotions"]) == 1
    b = ledger["blocked_promotions"][0]
    assert b["would_have_promoted"]["arm"] == "v1_notilt"
    assert b["gate"]["unreachable"] is True
    assert "statement about the TEST SIZE, not about the arm" in b["reason"]
    #: the evidence the rule found is kept, so the block is auditable rather
    #: than a bare "no"
    assert b["evidence"]["arm"] == "v1_notilt"


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


def _end_of(d):
    """main()'s own reading of a --date: the END of that day, UTC."""
    return dt.datetime.combine(d, dt.time(23, 59, 59), tzinfo=dt.timezone.utc)


def test_week_games_complete_boundary():
    assert not WG.week_games_complete(1, dt.date(2026, 9, 14),
                                      _end_of(dt.date(2026, 9, 14)))   # Monday
    assert WG.week_games_complete(1, dt.date(2026, 9, 15),
                                  _end_of(dt.date(2026, 9, 15)))       # Tuesday


def test_the_DATE_gate_alone_would_call_week_1_finished_before_its_last_game_STARTS():
    """THE KNOWN POSITIVE, and it is the live case (relay, 2026-09-14).

    Week 1's window start + 6 days is 2026-09-15, so the date gate flips true
    at 00:00Z — and the committed schedule says week 1's LAST kickoff is
    2026-09-15T00:15:00Z. Fifteen minutes where the old predicate said the
    week was complete and its final game had not kicked off, then ~3.5 more
    while it was played.
    """
    assert WG.last_kickoff_utc(1) == dt.datetime(2026, 9, 15, 0, 15,
                                                 tzinfo=dt.timezone.utc)
    d = dt.date(2026, 9, 15)
    at = lambda h, m: dt.datetime(2026, 9, 15, h, m, tzinfo=dt.timezone.utc)  # noqa: E731
    assert not WG.week_games_complete(1, d, at(0, 5)), "final game has not kicked off"
    assert not WG.week_games_complete(1, d, at(3, 0)), "final game is being played"
    assert WG.week_games_complete(1, d, at(4, 16)), "settled — grade it"
    # the live cron is 06:00Z Tuesday: it must still pass, or the grade slips
    assert WG.week_games_complete(1, d, at(6, 0))


def test_the_partial_guard_BAR_COMES_FROM_THE_SCHEDULE_not_a_bye_week_constant():
    """The old bar could not see a week missing only its last game.

    Week 1 schedules 16 games = 32 teams and has no byes. A stats release
    without Monday night's DEN at KC carries 30 teams, and 30 >= the old
    MIN_WEEK_TEAMS of 20 — so the guard whose own message reads "refusing to
    half-grade" would have graded it. The only existing test of that guard
    passes teams=10, a value a real MNF-missing week cannot produce.
    """
    assert WG.teams_scheduled(1) == 32
    assert WG.MIN_WEEK_TEAMS == 20
    # THE FAILURE THE OLD CONSTANT ALLOWED, stated as arithmetic:
    assert 30 >= WG.MIN_WEEK_TEAMS, "30 teams cleared the old bar"
    assert 30 < WG.teams_scheduled(1), "and is caught by the scheduled bar"
    # a real bye week is lower, and its own scheduled count is the right bar
    assert WG.teams_scheduled(6) == 28
    # CONTROL — an unreadable schedule must fall back, never block
    assert WG.teams_scheduled(1, schedule_path=Path("/nonexistent.json")) is None
    assert WG.week_games_complete(1, dt.date(2026, 9, 15),
                                  dt.datetime(2026, 9, 15, 0, 5,
                                              tzinfo=dt.timezone.utc),
                                  season=1999) is True


def test_a_WEEK_1_MISSING_ONLY_MONDAY_NIGHT_IS_REFUSED_END_TO_END(tmp_path):
    """The arithmetic above is not enough — this drives main().

    30 teams is what week 1 looks like when the stats release lands without
    DEN at KC. It clears the old constant (30 >= 20), so before this change
    main() graded it, wrote the ledger, and never revisited the week: a
    graded week is never re-graded. The grade would have been the FIRST of
    the season, computed on 30 of 32 teams, permanently.
    """
    own, actuals, series = _setup_dir(tmp_path, teams=30)
    env = _env(own, actuals, series, tmp_path)
    assert _run_main(["--date", "2026-09-15"], env) == 0
    ledger = own / "grades_2026.json"
    assert not ledger.exists() or not (
        json.loads(ledger.read_text()).get("weeks") or {}), \
        "week 1 was graded on 30 of 32 teams — the half-grade this guard exists to refuse"

    # CONTROL — the same run with the full slate DOES grade, so the assertion
    # above is the guard biting and not the harness failing to grade anything.
    own2, actuals2, series2 = _setup_dir(tmp_path / "full", teams=32)
    env2 = _env(own2, actuals2, series2, tmp_path / "full")
    assert _run_main(["--date", "2026-09-15"], env2) == 0
    led2 = json.loads((own2 / "grades_2026.json").read_text())
    assert "1" in (led2.get("weeks") or {}), "the full slate must grade"


# ── BEST-OF-K: THE STANDING NULL RIDES EVERY PROMOTION (wired 08-18) ─────────
# BLEND-SEARCH-DESIGN §3 / D's residual-frame condition 4. Attached, never
# gating — the promotion rule is Cory-ruled verbatim; the null makes each
# promotion carry "would K skill-free arms have produced this margin?".

def _promo_fixture(n_weeks=5):
    weeks = {}
    for w in range(1, n_weeks + 1):
        weeks[str(w)] = {"own_arms": {
            "v1":         {"mae": 6.0 + 0.01 * w, "spearman": 0.60},
            "v1_tilt150": {"mae": 5.0 + 0.01 * w, "spearman": 0.61},
            "v1_notilt":  {"mae": 6.5 + 0.01 * w, "spearman": 0.58},
        }}
    champion = {"arm": "v1", "version": "own_weekly_v1"}
    arms = [{"name": a} for a in ("v1", "v1_tilt150", "v1_notilt")]
    return weeks, champion, arms


def test_promotion_record_carries_the_best_of_k_null():
    weeks, champion, arms = _promo_fixture()
    rec = WG.decide_promotion(champion, weeks, arms)
    assert rec is not None
    bok = rec["best_of_k"]
    assert bok["status"] == "ran"
    assert bok["winner"] == "v1_tilt150"
    assert "field_p_value" in bok and "survives" in bok
    # A dominant challenger over 5 weeks against 3 arms should survive the null.
    assert bok["survives"] is True


def test_unrunnable_null_reports_itself_instead_of_vanishing():
    # Rule 3e: an absent null and a passed null must be distinguishable. With
    # only one arm carrying history, best-of-K cannot run — the record must SAY
    # so, and the promotion must not crash on its null's account.
    weeks = {str(w): {"own_arms": {
        "v1":         {"mae": 6.0, "spearman": 0.6},
        "v1_tilt150": {"mae": 5.0, "spearman": 0.6},
    }} for w in range(1, 6)}
    out = WG._best_of_k_null(weeks, ["v1_tilt150"])       # one arm only
    assert out["status"].startswith("NOT RUN")


def test_null_failure_is_named_not_swallowed(monkeypatch):
    weeks, champion, arms = _promo_fixture()
    import best_of_k as BOK

    def boom(*a, **k):
        raise RuntimeError("synthetic")
    monkeypatch.setattr(BOK, "best_of_k", boom)
    rec = WG.decide_promotion(champion, weeks, arms)
    assert rec is not None                                # promotion unharmed
    assert rec["best_of_k"]["status"].startswith("FAILED to run")


# ── the SHADOW start/sit rule (register 470): report-only, named beside MAE ──

def _ranked_weeks(n_weeks=3, champ_wrong_at=("QB", "RB", "WR"), n_per_pos=14,
                  chall="v1_notilt", champ_mae=5.0, chall_mae=4.0):
    """Rows where the challenger orders every position perfectly and the
    champion orders `champ_wrong_at` backwards (ties elsewhere). Actuals are
    4 apart so no pair falls under the 3-point decision floor:
    C(14,2)=91 pairs per position per week, 273 over three weeks > MIN_PAIRS."""
    weeks = {}
    for w in range(1, n_weeks + 1):
        rows = {}
        for q in ("QB", "RB", "WR", "TE"):
            for i in range(n_per_pos):
                actual = 4.0 * i + 1
                right = actual
                wrong = 4.0 * (n_per_pos - i)
                rows[f"{q}{i}"] = {"pos": q, "actual": actual,
                                   "proj": {"v1": wrong if q in champ_wrong_at else right,
                                            chall: right}}
        weeks[str(w)] = {"champion_arm": "v1", "rows": rows,
                         "own_arms": {"v1": {"mae": champ_mae, "spearman": 0.6, "n": 56},
                                      chall: {"mae": chall_mae, "spearman": 0.6, "n": 56}}}
    return weeks


def test_startsit_shadow_fires_when_the_challenger_orders_better():
    ss = WG.decide_promotion_startsit(CHAMPION, _ranked_weeks(), ARMS)
    assert ss is not None and ss["arm"] == "v1_notilt"
    assert ss["weeks_used"] == [1, 2, 3] and ss["recent_wins"] == "3 of last 3"
    assert ss["positions_won"] == 3                      # TE tied, not won
    assert ss["per_position"]["QB"]["challenger"] == 1.0
    assert ss["per_position"]["QB"]["champion"] == 0.0
    assert ss["per_position"]["TE"]["won"] is False
    assert ss["per_position"]["QB"]["n_pairs"] == 273


def test_startsit_shadow_holds_when_the_champion_orders_better():
    weeks = _ranked_weeks()
    for e in weeks.values():                              # swap the columns
        for r in e["rows"].values():
            r["proj"] = {"v1": r["proj"]["v1_notilt"], "v1_notilt": r["proj"]["v1"]}
    assert WG.decide_promotion_startsit(CHAMPION, weeks, ARMS) is None


def test_startsit_shadow_needs_three_weeks_and_three_positions():
    assert WG.decide_promotion_startsit(CHAMPION, _ranked_weeks(n_weeks=2), ARMS) is None
    # ahead at only two positions -> refused, even though pooled accuracy leads
    two = _ranked_weeks(champ_wrong_at=("QB", "RB"))
    assert WG.decide_promotion_startsit(CHAMPION, two, ARMS) is None


def test_startsit_shadow_is_absent_not_a_crash_without_rows():
    assert WG.decide_promotion_startsit(CHAMPION, _weeks([5, 5, 5], [4, 4, 4]), ARMS) is None


def test_promotion_shadow_names_a_disagreement_instead_of_averaging_it():
    # start/sit says promote; MAE (champion 4 < challenger 5) says hold
    weeks = _ranked_weeks(champ_mae=4.0, chall_mae=5.0)
    sh = WG.promotion_shadow(CHAMPION, weeks, ARMS, 3, dt.date(2026, 9, 29))
    assert sh["mae_rule"] is None and sh["startsit_rule"] == "v1_notilt"
    assert sh["agree"] is False and "DISAGREE" in sh["note"]
    assert "plan-⑥" in sh["note"]
    # both agree -> said so
    sh2 = WG.promotion_shadow(CHAMPION, _ranked_weeks(), ARMS, 3, dt.date(2026, 9, 29))
    assert sh2["agree"] is True and sh2["mae_rule"] == sh2["startsit_rule"] == "v1_notilt"


def test_main_writes_the_shadow_verdict_even_while_an_override_holds_the_wheel(tmp_path):
    own, actuals, series = _setup_dir(tmp_path)
    env = _env(own, actuals, series, tmp_path)
    Path(env["OWN_WEEKLY_CONTROLS"]).write_text(
        json.dumps({"champion_override": "v1_pg16"}))
    assert _run_main(["--date", "2026-09-15"], env) == 0
    ledger = json.loads((own / "grades_2026.json").read_text())
    sh = ledger["promotion_shadow"]
    assert sh["as_of_week"] == 1 and sh["champion"] == "v1"
    assert sh["mae_rule"] is None and sh["startsit_rule"] is None   # 3 players: nothing fires
    assert sh["agree"] is True
    assert ledger["promotion_shadow_history"][-1]["note"] == sh["note"]
    assert ledger["promotions"] == [ledger["promotions"][0]]        # override only, no promotion


def test_promotion_alert_carries_the_shadow_line(tmp_path):
    #: six weeks, not three — the gate's minimum at k=2; see
    #: _GATE_MIN_WEEKS_AT_K2
    own, actuals, series = _setup_dir(tmp_path, weeks=_GATE_MIN_WEEKS_AT_K2)
    doc = json.loads(Path(actuals).read_text())
    for w in doc["weeks"].values():
        w["players"]["1"] = 9.0
        w["players"]["2"] = 21.0
    Path(actuals).write_text(json.dumps(doc))
    #: 11-01 not 09-29: weeks 4-6 had not finished by 09-29, so
    #: grading correctly refused them and the fixture only ever
    #: produced 3 graded weeks — below the gate's k=2 minimum.
    env = _env(own, actuals, series, tmp_path)
    assert _run_main(["--date", "2026-11-01"], env) == 0
    ledger = json.loads((own / "grades_2026.json").read_text())
    rec = ledger["promotions"][0]
    assert rec["shadow"]["startsit_rule"] is None                    # too few pairs
    assert rec["shadow"]["agree"] is False                           # MAE promoted, start/sit held
    body = (tmp_path / "issue" / "promotion_body.md").read_text()
    assert "Shadow start/sit rule (report-only):" in body and "DISAGREE" in body


def test_startsit_shadow_tolerates_an_arm_added_mid_season():
    # v1_notilt has no column in week 1 (added later); weeks 2-4 carry it.
    # A rule demanding every arm in every week would blank week 1 for all
    # arms AND lose the challenger's own three weeks. It must still fire.
    weeks = _ranked_weeks(n_weeks=4)
    for r in weeks["1"]["rows"].values():
        del r["proj"]["v1_notilt"]
    ss = WG.decide_promotion_startsit(CHAMPION, weeks, ARMS)
    assert ss is not None and ss["weeks_used"] == [2, 3, 4]


# ── the best-of-K GATE, condition by condition (register 211) ────────────────
#
# Why the gate exists, measured: register 211 ran the promotion rule against
# constructed nulls and found it promotes a SKILL-FREE arm in 95.0% of seasons,
# against 96.8% for a real -15% MAE edge and 98.9% for -40%. Four points of
# separation between nothing and unmissable. Gating the null cuts the
# skill-free rate to 17.9%.
#
# Four conditions, each of which must BLOCK on its own. A gate is only worth
# having if every arm of it is tested — a condition nothing exercises is a
# condition that will quietly stop working.

def _ran_null(**over):
    """A null that RAN, with the winner surviving — the pass case, which each
    test below then breaks in exactly one way."""
    out = {"status": "ran", "k": 7, "n_rows": 7, "winner": "v1_notilt",
           "survives": True, "field_p_value": 0.004, "field_margin": 0.42,
           "null_field_margin_mean": 0.11, "runner_up_p_value": 0.03}
    out.update(over)
    return out


def test_gate_passes_when_the_null_ran_and_the_winner_survives():
    g = WG._promotion_gate(_ran_null(), "v1_notilt", 7)
    assert g["passed"] is True
    # ⚠️ worded as "the rule fired and the null did not stop it" ON PURPOSE.
    # The gate's power is ~22.7% at a realistic edge, so a pass is NOT
    # evidence the arm is better and must not read as if it were.
    assert "did not stop it" in g["reason"]
    assert "not proof the arm is better" in g["power_ceiling"]


def test_gate_BLOCKS_when_the_null_could_not_run():
    """_best_of_k_null never raises — it returns a status string. Treating that
    string as truthy would open the gate exactly when it cannot see, which is
    the worst possible moment."""
    for status in ("NOT RUN — needs >=2 arms with >=3 common graded weeks",
                   "FAILED to run (ValueError: boom) — the null is missing, "
                   "not passed"):
        g = WG._promotion_gate({"status": status}, "v1_notilt", 7)
        assert g["passed"] is False
        assert "missing, not passed" in g["reason"]


def test_gate_BLOCKS_when_the_margin_does_not_clear_the_null():
    g = WG._promotion_gate(
        _ran_null(survives=False, field_p_value=0.41), "v1_notilt", 7)
    assert g["passed"] is False
    assert "does not clear the skill-free null" in g["reason"]
    assert g["field_p_value"] == 0.41


def test_gate_BLOCKS_when_the_promoted_arm_IS_NOT_the_nulls_winner():
    """The null licenses THE WINNER of the field. The rule can pick a different
    arm — it selects on cumulative MAE against the CHAMPION plus recency, while
    the null selects the lowest MAE in the field — and promoting arm X on arm
    Y's p-value is a category error."""
    g = WG._promotion_gate(_ran_null(winner="v1_pg16"), "v1_notilt", 7)
    assert g["passed"] is False
    assert "licenses the winner, not a different arm" in g["reason"]
    assert g["null_winner"] == "v1_pg16"


def test_gate_BLOCKS_when_the_test_cannot_pass_at_this_size():
    """k=2 over 3 rows cannot produce a p below 0.2584, so "not distinguishable
    from skill-free" there is a statement about the TEST, not the arm."""
    g = WG._promotion_gate(_ran_null(k=2, n_rows=3), "v1_notilt", 2)
    assert g["passed"] is False
    assert g["unreachable"] is True
    assert "statement about the TEST SIZE" in g["reason"]


def test_reachability_reproduces_the_measured_minimum_sizes():
    """⚠️ THE GATE'S OWN KNOWN-POSITIVE (rule 3e). D measured these on
    2026-08-21 and they were reproduced independently on 2026-11-01 before the
    gate shipped. If this drifts, the gate is silently changing the effective
    minimum number of weeks before anything can be promoted."""
    assert WG._gate_is_reachable(2, 3)["reachable"] is False
    assert WG._gate_is_reachable(2, 5)["reachable"] is False
    assert WG._gate_is_reachable(2, 6)["reachable"] is True     # first clears at 6
    assert WG._gate_is_reachable(4, 3)["reachable"] is False
    assert WG._gate_is_reachable(4, 4)["reachable"] is True     # k=4 clears at 4
    #: our live arm set is 7, which is reachable from 3 — so the gate costs the
    #: live loop no extra weeks today. That is WHY it was safe to ship midseason.
    assert WG._gate_is_reachable(7, 3)["reachable"] is True


def test_the_gate_uses_the_NULLS_field_size_not_the_declared_arm_count():
    """⚠️ A BUG I SHIPPED AND CAUGHT IN THE SAME SESSION. The first version
    passed len(active_arms) as k. An arm added mid-season has no column in
    earlier weeks, so _best_of_k_null drops it and the field it ACTUALLY
    tested can be far smaller than the declared list. Passing 7 when the test
    ran on 2 declares the gate reachable at a size where it provably cannot
    pass — the exact false reassurance the probe exists to prevent."""
    weeks = _weeks([5.0, 5.0, 5.0], [4.0, 4.5, 4.8])      # 2 arms, 3 weeks
    p = WG.decide_promotion(CHAMPION, weeks, ARMS)          # ARMS declares 7
    assert p is not None                                     # the rule fired
    assert p["best_of_k"]["k"] == 2                           # but only 2 ran
    assert p["blocked"] is True
    assert p["gate"]["unreachable"] is True
    assert p["gate"]["reachability"]["k"] == 2                # not 7


def test_a_blocked_record_is_still_RETURNED_so_it_can_be_recorded():
    """decide_promotion returns the record rather than None when blocked, so
    the caller can log the refusal. A block recorded nowhere is
    indistinguishable from a week when no arm qualified."""
    p = WG.decide_promotion(CHAMPION, _weeks([5.0, 5.0, 5.0], [4.0, 4.5, 4.8]),
                            ARMS)
    assert p is not None and p["blocked"] is True
    assert p["evidence"]["arm"] == "v1_notilt"     # the evidence survives
    assert p["gate"]["reason"]


def test_a_pass_SAYS_SO_when_the_conservative_test_disagrees():
    """Measured on the live ledger 2026-11-01: field p=0.0005 while runner-up
    p=0.3638. The lenient statistic sails through while the conservative one
    says the top two arms are indistinguishable — the inflation best_of_k's
    header predicts for a field of near-duplicate sweep arms. A pass that hides
    that is a pass that will be over-read."""
    g = WG._promotion_gate(_ran_null(runner_up_p_value=0.3638), "v1_notilt", 7)
    assert g["passed"] is True
    assert "not distinguishable from the second-best arm" in g["caveat"]
    assert "best of a cluster" in g["caveat"]


def test_no_caveat_when_both_statistics_agree():
    g = WG._promotion_gate(_ran_null(runner_up_p_value=0.01), "v1_notilt", 7)
    assert g["passed"] is True and "caveat" not in g


def test_the_promotion_ALERT_carries_the_gate_and_its_ceiling():
    """The alert is what Cory reads. A promotion whose null lives only in JSON
    invites the reading the null exists to prevent."""
    rec = {
        "from": {"version": "own_weekly_v1", "arm": "v1"},
        "to": {"version": "own_weekly_v2", "arm": "v1_notilt"},
        "evidence": {"recent_wins": "3 of last 3", "cum_mae": 4.1,
                     "champion_cum_mae": 5.0, "weeks_used": [1, 2, 3],
                     "cum_spearman": 0.6, "champion_cum_spearman": 0.6,
                     #: every week in weeks_used needs a per_week row —
                     #: issue_text builds its table by iterating weeks_used
                     "per_week": {str(w): {"challenger": 4.1, "champion": 5.0}
                                  for w in (1, 2, 3)}},
        "gate": WG._promotion_gate(_ran_null(runner_up_p_value=0.36),
                                   "v1_notilt", 7),
    }
    _, body = WG.issue_text(rec)
    assert "best-of-K null" in body
    assert "did not stop it" in body
    assert "not proof the arm is better" in body
    #: and the disagreement between the two statistics reaches him too
    assert "not distinguishable from the second-best arm" in body
