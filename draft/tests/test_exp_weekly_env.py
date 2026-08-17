# TERRITORY: A
"""EXP-WEEKLY-ENV mechanics — the experiment's own machinery, not its verdict.

Each test names the defect it guards. The load-bearing one is strictly-prior
enforcement: a weekly-projection backtest that peeks at the eval week does not
fail, it succeeds spectacularly (asof.py's lesson), so the property is proven
structurally here — perturbing week-w data must move NOTHING a non-oracle arm
sees for week w.

Run: python -m pytest draft/tests/test_exp_weekly_env.py -q
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backtest"))
import exp_weekly_env as E  # noqa: E402


def _tg(week, team, opp, plays=60, neutral=40, pf=21.0, pa=17.0, gid=None):
    return {"game_id": gid or f"g{week}{team}{opp}", "team": team, "opp": opp,
            "week": week, "plays": plays, "neutral_plays": neutral,
            "points_for": pf, "points_against": pa}


def _schedule(weeks=6, teams=("AAA", "BBB", "CCC", "DDD")):
    """Round-ish schedule: AAA/BBB and CCC/DDD alternate opponents weekly."""
    rows = []
    for w in range(1, weeks + 1):
        a, b, c, d = teams
        pairs = [(a, b), (c, d)] if w % 2 else [(a, c), (b, d)]
        for t, o in pairs:
            rows.append(_tg(w, t, o, plays=60 + (hash(t) % 7), pf=20.0 + (w % 3)))
            rows.append(_tg(w, o, t, plays=60 + (hash(o) % 7), pf=17.0 + (w % 2)))
    return rows


# ── 1. the leak guard ───────────────────────────────────────────────────────

def test_non_oracle_multipliers_ignore_the_eval_week():
    """DEFECT GUARDED: lookahead. If week-w plays or scores reach a week-w
    multiplier, the backtest reports an uncollectable edge and nothing raises.
    Perturbing every week-w (and later) team-game row must leave every
    non-oracle multiplier byte-identical."""
    rows = _schedule(weeks=6)
    w = 6
    before = E.multipliers_for_week(rows, w)
    mutated = []
    for g in rows:
        g2 = dict(g)
        if g2["week"] >= w:
            g2["plays"] += 40
            g2["neutral_plays"] += 30
            g2["points_for"] += 50.0
        mutated.append(g2)
    after = E.multipliers_for_week(mutated, w)
    for team in before:
        for arm in ("pace_raw", "pace_neutral", "env_points"):
            assert before[team][arm] == after[team][arm], (team, arm)


def test_oracle_arm_is_the_deliberate_exception_and_is_flagged():
    """The oracle MUST move with week-w data (it is the positive control and
    the ceiling), and it must be registered as an oracle so no ship rule can
    ever mistake it for a collectable signal."""
    rows = _schedule(weeks=6)
    w = 6
    before = E.multipliers_for_week(rows, w)
    mutated = [dict(g, points_for=g["points_for"] + 50.0)
               if g["week"] == w else g for g in rows]
    after = E.multipliers_for_week(mutated, w)
    assert any(before[t]["oracle_total"] != after[t]["oracle_total"] for t in before)
    assert "oracle_total" in E.ORACLE_ARMS


def test_running_average_is_strictly_prior():
    """DEFECT GUARDED: a running mean that includes the current week grades a
    projection against a number that already contains the answer. Week w's
    baseline must use weeks < w only, and week-w points must not move it."""
    hist = [{"player_id": "p1", "week": w, "points": pts}
            for w, pts in [(1, 10.0), (2, 20.0), (3, 99.0)]]
    base = E.running_average(hist)
    assert base[("p1", 1)] == (None, 0)          # nothing prior: no projection
    assert base[("p1", 2)] == (10.0, 1)
    assert base[("p1", 3)] == (15.0, 2)          # 99 (week 3 itself) excluded
    hist2 = [dict(r) for r in hist]
    hist2[2]["points"] = 0.0
    assert E.running_average(hist2)[("p1", 3)] == base[("p1", 3)]


# ── 2. pbp → team-game conventions (nflverse_pace.py's hard-won rules) ─────

def _play(**kw):
    base = {"game_id": "g1", "week": 1, "posteam": "AAA", "defteam": "BBB",
            "play_type": "run", "qb_kneel": 0.0, "qb_spike": 0.0,
            "score_differential": 0.0, "home_team": "AAA", "away_team": "BBB",
            "home_score": 24.0, "away_score": 17.0}
    base.update(kw)
    return base


def test_kneels_spikes_and_special_teams_are_not_plays():
    """DEFECT GUARDED: counting kneels rewards teams that led and stopped
    playing; counting punts/kicks ranks offences by how often they kicked."""
    rows = E.team_game_rows([
        _play(),                                     # counts
        _play(play_type="pass"),                     # counts
        _play(qb_kneel=1.0),                         # kneel: excluded
        _play(play_type="pass", qb_spike=1.0),       # spike: excluded
        _play(play_type="punt"),                     # special teams: excluded
        _play(play_type="no_play"),                  # penalty row: excluded
    ])
    (g,) = rows
    assert g["plays"] == 2


def test_neutral_script_boundary_is_fourteen_inclusive():
    """The declared NEUTRAL_MARGIN is |diff| <= 14; an off-by-one silently
    reclassifies every two-score situation."""
    rows = E.team_game_rows([
        _play(score_differential=14.0),
        _play(score_differential=-14.0),
        _play(score_differential=15.0),
    ])
    (g,) = rows
    assert g["plays"] == 3 and g["neutral_plays"] == 2


def test_scores_are_oriented_by_posteam_not_home_team():
    """DEFECT GUARDED: keying scores on home_team credits every road offence
    with the wrong points and the numbers still look plausible."""
    rows = E.team_game_rows([
        _play(),                                                  # AAA at home
        _play(posteam="BBB", defteam="AAA"),                      # BBB away drive
    ])
    by_team = {g["team"]: g for g in rows}
    assert by_team["AAA"]["points_for"] == 24.0
    assert by_team["BBB"]["points_for"] == 17.0
    assert by_team["BBB"]["points_against"] == 24.0


def test_min_games_floor_drops_thin_teams_and_multiplier_defaults_to_one():
    """A team with fewer than MIN_TEAM_GAMES prior games reports no feature
    (nflverse_pace convention) and its players ride the baseline (m = 1)."""
    rows = _schedule(weeks=6)
    thin = [g for g in rows if not (g["team"] == "AAA" and g["week"] > 2)]
    thin = [g for g in thin if not (g["opp"] == "AAA" and g["week"] > 2)]
    feats = E.team_features_before_week(thin + [_tg(6, "AAA", "CCC")], 6)
    assert "AAA" not in feats                       # 2 prior games < 4
    wm = E.multipliers_for_week(thin + [_tg(6, "AAA", "CCC"), _tg(6, "CCC", "AAA")], 6)
    assert wm["AAA"]["pace_raw"] != 0               # defined...
    # AAA has no own feature and CCC's faced-count includes only games vs AAA's
    # sparse schedule; the arm averages whatever half exists or falls to 1.0.
    assert 0.5 < wm["AAA"]["pace_raw"] < 1.5


# ── 3. eligibility, projection and metric math ─────────────────────────────

def test_eligibility_enforces_the_preregistered_floors():
    """Week bounds, >=3 prior appearances, prior mean >= 5.0 — each declared
    in the prereg; a silent relaxation flatters every arm with junk rows."""
    pweeks = ([{"player_id": "p1", "week": w, "points": 10.0, "team": "AAA",
                "position": "RB", "name": "x"} for w in (1, 2, 3, 4, 5)]
              + [{"player_id": "lowbar", "week": w, "points": 1.0, "team": "AAA",
                  "position": "RB", "name": "y"} for w in (1, 2, 3, 4, 5)]
              + [{"player_id": "thin", "week": w, "points": 30.0, "team": "AAA",
                  "position": "RB", "name": "z"} for w in (4, 5)])
    rows = E.eligible_rows(pweeks, E.running_average(pweeks))
    ids = {(r["player_id"], r["week"]) for r in rows}
    assert ("p1", 5) in ids
    assert ("p1", 4) not in ids                     # before FIRST_EVAL_WEEK
    assert all(pid != "lowbar" for pid, _ in ids)   # under the 5.0 floor
    assert all(pid != "thin" for pid, _ in ids)     # only 1 prior appearance


def test_projection_dampening_and_missing_team_default():
    """proj = base*(1 + lambda(m-1)); a team absent from the week's multiplier
    map must ride the baseline exactly, not score zero or raise."""
    rows = [{"player_id": "p", "week": 5, "points": 12.0, "team": "AAA",
             "baseline": 10.0, "position": "RB", "name": "x"},
            {"player_id": "q", "week": 5, "points": 12.0, "team": "ZZZ",
             "baseline": 10.0, "position": "RB", "name": "y"}]
    wm = {5: {"AAA": {"pace_raw": 1.2}}}
    assert E.project(rows, wm, "pace_raw", 1.0) == [12.0, 10.0]
    assert E.project(rows, wm, "pace_raw", 0.5) == [11.0, 10.0]


def test_top_decile_and_spearman_on_known_answers():
    """Metric arithmetic on hand-checkable inputs — a hit-rate that divides by
    the wrong k or a rho that ignores ties would silently skew every arm."""
    rows = [{"week": 5, "points": float(p)} for p in range(20, 0, -1)]
    preds = [float(30 - i) for i in range(20)]      # perfectly aligned
    sp, td = E.weekly_metrics(preds, rows)
    assert sp == 1.0 and td == 1.0                  # k = 2, both found
    preds_rev = list(reversed(preds))
    sp2, td2 = E.weekly_metrics(preds_rev, rows)
    assert sp2 == -1.0 and td2 == 0.0


def test_permutation_null_preserves_the_multiplier_multiset():
    """§6 parity rule: the null must face the SAME construction. Shuffling
    team labels may not invent or lose multiplier values, and an all-ones
    multiplier map must produce an exactly-zero null distribution."""
    rows = [{"player_id": "p", "week": 5, "points": 12.0, "team": "AAA",
             "baseline": 10.0, "position": "RB", "name": "x"}]
    wm = {5: {t: {"pace_raw": 1.0} for t in ("AAA", "BBB", "CCC")}}
    deltas = E.permutation_null(rows, wm, "pace_raw", 1.0, 25)
    assert deltas == [0.0] * 25


# ── 4. the scoring path is OUR scoring ─────────────────────────────────────

def test_player_weeks_score_under_league_config_not_provider_points():
    """DEFECT GUARDED: grading a half-PPR, 6-pt-passTD league with provider
    fantasy points punishes every receiver the projection liked. A synthetic
    nflverse row must score exactly under draft/config/league_config.json."""
    cfg = json.load(open(Path(__file__).resolve().parents[1]
                         / "config" / "league_config.json"))["scoring"]
    assert cfg["pass_td"] == 6.0 and cfg["rec"] == 0.5   # the league's identity
    row = {"position": "WR", "week": 5, "player_id": "00-1", "recent_team": "AAA",
           "player_display_name": "Test WR",
           "receptions": 5, "receiving_yards": 50, "receiving_tds": 1}
    (pw,) = E.player_weeks([row], cfg)
    assert pw["points"] == 2.5 + 5.0 + 6.0               # 5*0.5 + 50*0.1 + TD
    qb = {"position": "QB", "week": 5, "player_id": "00-2", "recent_team": "AAA",
          "player_display_name": "Test QB",
          "passing_yards": 100, "passing_tds": 1, "interceptions": 1}
    (pq,) = E.player_weeks([qb], cfg)
    assert pq["points"] == 100 * cfg["pass_yd"] + 6.0 - abs(cfg["pass_int"])


def test_committed_results_carry_territory_and_oracle_labels():
    """The committed artifact must declare its lane first (integration gate)
    and every oracle row must say so — an unlabeled oracle is a leak wearing
    a result's clothing."""
    p = Path(__file__).resolve().parents[1] / "backtest" / "exp_weekly_env.json"
    d = json.load(open(p))
    assert next(iter(d)) == "_territory"
    for season in d["seasons"].values():
        for key, arm in season["arms"].items():
            assert arm["oracle"] == (key.split("@")[0] in E.ORACLE_ARMS), key
    for key, v in d["verdicts"].items():
        if v["oracle"]:
            assert "signal" not in v            # an oracle can never be a signal
