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
    """The PROMOTION RULE still fires on exactly these conditions. What
    changed 2026-08-21 (A's ruling, register 199) is that qualifying on the
    rule is no longer sufficient — the best-of-K null now GATES — so the
    record comes back carrying a `blocked` reason instead of being applied.
    Both halves are asserted here rather than the test being flipped: the rule
    still picks the right arm on the right weeks with the right evidence, AND
    the gate holds it."""
    p = WG.decide_promotion(CHAMPION, _weeks([5.0, 5.0, 5.0], [4.0, 4.5, 4.8]), ARMS)
    assert p is not None
    assert p["to"] == {"version": "own_weekly_v2", "arm": "v1_notilt"}
    assert p["evidence"]["weeks_used"] == [1, 2, 3]
    assert p["evidence"]["cum_mae"] == round((4.0 + 4.5 + 4.8) / 3, 3)
    # and the gate, which at k=2 over 3 weeks CANNOT pass — see below.
    assert p.get("blocked"), "the best-of-K gate should hold this at n=3"


def test_the_gate_says_UNREACHABLE_not_not_distinguishable_at_small_n():
    """The distinction that keeps this a gate rather than a wall.

    At k=2 over 3 weeks, even a perfect arm against a uniformly worse
    champion does not reach p<0.05 (measured: 0.2584 at n=3, 0.1279 at n=4,
    0.0710 at n=5, 0.0375 at n=6). A message saying the margin is "not
    distinguishable from skill-free" would be a sentence about the ARM when
    the true statement is that the test could not have passed regardless.
    """
    p = WG.decide_promotion(CHAMPION, _weeks([5.0, 5.0, 5.0], [4.0, 4.5, 4.8]), ARMS)
    assert "CANNOT PASS at this size" in p["blocked"], p["blocked"]
    assert "not for want of evidence" in p["blocked"]


def test_the_gates_own_known_positive_matches_the_measured_table():
    """`_gate_is_reachable` IS the gate's known-positive. If it ever stops
    matching these measured values the gate's messages become guesses."""
    assert WG._gate_is_reachable(2, 3) is False
    assert WG._gate_is_reachable(2, 5) is False
    assert WG._gate_is_reachable(2, 6) is True
    assert WG._gate_is_reachable(4, 3) is False
    assert WG._gate_is_reachable(4, 4) is True


def test_an_UNRUNNABLE_null_BLOCKS_rather_than_passing():
    """A gate that opens when it cannot see is not a gate. `_best_of_k_null`
    never raises, so its failure arrives as a status string — treating that as
    a pass is exactly the control-that-cannot-fail shape."""
    assert WG._promotion_blocked({"status": "NOT RUN — needs >=2 arms"})
    assert WG._promotion_blocked({"status": "FAILED to run (KeyError: x)"})
    assert WG._promotion_blocked({"status": "ran", "survives": False,
                                  "k": 4, "n_rows": 9, "field_p_value": 0.4})
    assert WG._promotion_blocked({"status": "ran", "survives": True}) is None


def test_a_CLEARING_null_lets_the_promotion_through():
    """The gate must be passable on real evidence, or it is a wall. Six weeks,
    challenger genuinely better every week — the size the measured table says
    is the first reachable one at k=2."""
    p = WG.decide_promotion(
        CHAMPION, _weeks([9.0] * 6, [1.0, 1.2, 0.9, 1.1, 1.0, 1.3]), ARMS)
    assert p is not None, "the promotion rule itself should qualify here"
    assert not p.get("blocked"), p.get("blocked")


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


def test_main_BLOCKS_a_three_week_promotion_and_records_why(tmp_path):
    """END-TO-END, and it used to assert the opposite.

    Before A's 2026-08-21 ruling (register 199) three winning weeks promoted.
    The best-of-K null now GATES, and at k=2 over 3 weeks the gate is not
    merely unmet, it is UNREACHABLE — a perfect arm scores p=0.2584 there.
    So the run must hold the promotion AND say so on the ledger: a blocked
    promotion recorded nowhere is indistinguishable from a week where no arm
    qualified, and nobody would ever learn the rule wanted to promote.

    The sibling below asserts the gate is passable at six weeks, so this pair
    proves a gate rather than a wall.
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
    # the champion does NOT move
    assert ledger["champion"]["arm"] == "v1", ledger["champion"]
    assert not ledger.get("promotions")
    # ...and the block is on the record, with its reason
    blocked = ledger.get("blocked_promotions") or []
    assert len(blocked) == 1, blocked
    assert blocked[0]["would_have_promoted"]["arm"] == "v1_notilt"
    assert "CANNOT PASS at this size" in blocked[0]["reason"], blocked[0]["reason"]
    # no promotion alert is written for a promotion that did not happen
    assert not (tmp_path / "issue" / "promotion_title.txt").exists()


def test_main_STILL_promotes_once_the_gate_is_reachable(tmp_path):
    """The gate must be passable on real evidence. Six weeks is the first
    reachable size at k=2 per the measured table, and the challenger is
    genuinely better in every one of them."""
    own, actuals, series = _setup_dir(tmp_path, weeks=(1, 2, 3, 4, 5, 6))
    doc = json.loads(Path(actuals).read_text())
    for w in doc["weeks"].values():
        w["players"]["1"] = 9.0
        w["players"]["2"] = 21.0
        w["players"]["3"] = 8.0
    Path(actuals).write_text(json.dumps(doc))
    env = _env(own, actuals, series, tmp_path)
    # a LATER run date: grading is capped by the calendar, and 09-29 only
    # reaches ~week 3 — which is what made the first version of this test
    # grade three weeks and fail for the wrong reason.
    assert _run_main(["--date", "2026-11-10"], env) == 0
    ledger = json.loads((own / "grades_2026.json").read_text())
    assert ledger["champion"]["arm"] == "v1_notilt", ledger["champion"]
    assert len(ledger["promotions"]) == 1
    rec = ledger["promotions"][0]
    assert rec["from"]["arm"] == "v1" and rec["to"]["arm"] == "v1_notilt"
    assert any(a["name"] == "v1" for a in ledger["active_arms"])
    issue = tmp_path / "issue"
    assert (issue / "promotion_title.txt").read_text().startswith(
        "Weekly model adapted: own_weekly_v1 -> own_weekly_v2")


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
    """⚠️ REWRITTEN AT MERGE, 2026-09-02 (D). Register 470 wrote this against a
    tree where best-of-K was ATTACHED, NOT GATING, so this scenario produced a
    PROMOTION and the assertions read `ledger["promotions"][0]`.

    A ruled otherwise on 2026-08-21 (register 199 (3)): best-of-K GATES, and the
    only stated reason it did not — a `Cory-ruled verbatim` claim in the code —
    was traced FALSE. With gating live, three weeks and k=2 arms cannot clear
    the null at any effect size, so this scenario is now a BLOCKED promotion
    rather than a promotion.

    THE POINT OF 470 IS UNCHANGED AND IS WHY THE SHADOW NOW RIDES THE BLOCKED
    RECORD: this is exactly the week worth measuring — the MAE rule wanted to
    promote and the null said no — so a shadow that vanished here would go blind
    precisely where 199 makes the interesting thing happen. Both rulings hold;
    only the record it lands on moved.
    """
    own, actuals, series = _setup_dir(tmp_path, weeks=(1, 2, 3))
    doc = json.loads(Path(actuals).read_text())
    for w in doc["weeks"].values():
        w["players"]["1"] = 9.0
        w["players"]["2"] = 21.0
    Path(actuals).write_text(json.dumps(doc))
    env = _env(own, actuals, series, tmp_path)
    assert _run_main(["--date", "2026-09-29"], env) == 0
    ledger = json.loads((own / "grades_2026.json").read_text())

    assert not ledger.get("promotions"), (
        "best-of-K gates since register 199, so three weeks at k=2 must not "
        "promote — if this ever fills, the gate has been switched off")
    rec = ledger["blocked_promotions"][0]
    assert rec["shadow"]["startsit_rule"] is None                    # too few pairs
    assert rec["shadow"]["agree"] is False                           # MAE wanted it, start/sit held

    # The shadow is still computed and still published on the ledger itself,
    # which is 470's report-only contract and is independent of the gate.
    assert ledger["promotion_shadow"]["agree"] is False
    assert "DISAGREE" in ledger["promotion_shadow"]["note"]


def test_startsit_shadow_tolerates_an_arm_added_mid_season():
    # v1_notilt has no column in week 1 (added later); weeks 2-4 carry it.
    # A rule demanding every arm in every week would blank week 1 for all
    # arms AND lose the challenger's own three weeks. It must still fire.
    weeks = _ranked_weeks(n_weeks=4)
    for r in weeks["1"]["rows"].values():
        del r["proj"]["v1_notilt"]
    ss = WG.decide_promotion_startsit(CHAMPION, weeks, ARMS)
    assert ss is not None and ss["weeks_used"] == [2, 3, 4]

# ── GRADING-POLICY.md's four requirements, stated in the verdict ──────────
# Conversion item (1), unblocked by A's register-199 ruling 2026-08-21. The
# verdict Cory reads is the surface the policy applies to, so the four
# requirements are asserted here by name: a reworded body that quietly drops
# one is the failure this test exists to catch.

def _promo_body():
    p = WG.decide_promotion(
        CHAMPION, _weeks([9.0] * 6, [1.0, 1.2, 0.9, 1.1, 1.0, 1.3]), ARMS)
    assert p is not None and not p.get("blocked"), p
    return WG.issue_text(p)[1]


def test_the_verdict_states_all_FOUR_requirements_by_name():
    body = _promo_body()
    for want in ("1 · THE DECISION", "2 · THE NULL", "3 · THE CONTROLS",
                 "4 · THE MARGIN"):
        assert want in body, want


def test_the_verdict_reports_the_MARGIN_IN_POINTS_before_the_win_count():
    """Requirement 4: percentiles and counts say whether, points say how much.
    The points gap must appear BEFORE the recent-wins count in the section."""
    body = _promo_body()
    sec = body[body.index("4 · THE MARGIN"):]
    assert "points" in sec
    assert sec.index("a gap of") < sec.index("is reported second")


def test_the_verdict_names_the_gate_and_that_it_BLOCKS_when_the_null_cannot_run():
    body = _promo_body()
    assert "this null GATES the promotion" in body
    assert "blocks rather than passes when the null cannot run" in body


def test_the_verdict_carries_register_211s_ceiling_rather_than_claiming_the_arm_is_better():
    """The honesty clause. Without it the verdict reads as 'this arm is
    better', which the measured 95%/17.9% skill-free promotion rate does not
    support."""
    body = _promo_body()
    assert "95.0% of seasons" in body and "17.9%" in body
    assert "not as *this arm is better*" in body


def test_the_verdict_says_NOT_AVAILABLE_when_the_null_did_not_run():
    """The null section must not print a fabricated measurement when the null
    is absent — absent is absent, the same rule the dispersion fields follow."""
    rec = WG.decide_promotion(
        CHAMPION, _weeks([9.0] * 6, [1.0, 1.2, 0.9, 1.1, 1.0, 1.3]), ARMS)
    rec = {**rec, "best_of_k": {"status": "NOT RUN — needs >=2 arms"}}
    body = WG.issue_text(rec)[1]
    assert "NOT AVAILABLE" in body
    assert "field margin" not in body
