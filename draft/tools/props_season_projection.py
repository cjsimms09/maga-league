# TERRITORY: A
"""PROPS-IMPLIED SEASON-TOTAL PROJECTION — candidate arm graded against
own_v6. Built 2026-08-16, under Cory's directive (verbatim in
draft/audit/historical_props_study_2026-08-16.md §1).

THE HYPOTHESIS. Player props are WEEKLY markets; the draft board's own-model
(v5/v6) projects SEASON TOTALS. For each player, convert every week's prop
line into an implied fantasy-point value under OUR league's scoring (the
same "line -> points" arithmetic fetch_component_stats.py already uses for
Vegas TEAM totals — a `point` is priced through the frozen scoring table's
per-unit rate, nothing fancier), SUM across the season, and grade that
props-implied season total exactly like own_v5/own_v6 were graded: MAE and
Spearman per position on the shared population, against the SAME 2025
held-out season.

── WHY own_v6, NOT THE NAIVE BASELINES ────────────────────────────────────

The house REC-3 bar (own_vN beats BOTH naive baselines at ALL FOUR positions
on BOTH metrics) answers "is this better than doing nothing." Cory's ask
here is sharper: does this beat the model we ALREADY PROMOTED and are about
to draft with. So the clearing bar for THIS arm is stated directly against
own_v6, same shape, harder target:

    CLEARS  props_season beats own_v6 on BOTH metrics (MAE lower, Spearman
            higher) at ALL FOUR positions, on the shared population of
            {props_season, own_v6, naive_prev, recency_blend}.

Per-position results are reported in full regardless — a props arm that
wins at WR and loses at QB is published as exactly that, not folded into
one pass/fail number (same discipline the league benchmark's layer grades
used).

── AN HONEST ASYMMETRY, NAMED BEFORE ANY REAL GRADE EXISTS ────────────────

own_v6's season-Y prediction is built ENTIRELY from information available
BEFORE season Y starts (component stores through Y-1, week-1 Vegas lines,
the preseason league draft market) — a true preseason forecast. The
props-implied season total is NOT that: it is built by SUMMING each week's
market line AS THE SEASON UNFOLDS, so by week 10 it has absorbed nine weeks
of real in-season information (role changes, injuries, hot streaks) that no
preseason projector can see. A props-season win over own_v6 therefore does
NOT by itself prove "the market is a better PRESEASON predictor" — it
proves "given in-season access to prop markets and nothing else, how much
attainable accuracy is on the table," which is a real and useful number
(directly informs the in-season loop) but answers a DIFFERENT question than
"should the draft board switch its own-model column to this." Both
readings are reported; neither is allowed to stand in for the other. Named
here, in the preregistration, specifically so it cannot be produced post-hoc
as a convenient excuse for either a win or a loss.

── LEAKAGE, STATED PRECISELY ───────────────────────────────────────────────

A week-k prop line closes before week-k's game — using it carries no
result-of-week-k information (same rule fetch_component_stats.py states for
Vegas lines). Summing weeks 1..17 of season Y's OWN lines to build a
season-Y total is therefore leak-free in the "never reads a result" sense,
but is NOT leak-free in the "never reads season-Y information" sense that
own_v5/v6's preregistration enforces — see the asymmetry note above. Both
own_v6's predictions (imported, unmodified) and season_totals(2025) (the
actual, from the committed store) are read exactly as v5/v6 read them;
nothing about THEIR leak-freedom is touched by this file.

── PREREGISTRATION — the form is frozen here, before any real data exists ──

    markets       player_pass_yds, player_pass_tds, player_rush_yds,
                  player_rush_tds, player_reception_yds, player_receptions
                  (fetch_historical_props.MARKETS — six, matching Cory's
                  ask verbatim). Receiving TDs / anytime-TD are NOT priced
                  — absent markets contribute nothing, never a zero.
    conversion    points += line_value * scoring_cfg[stat] for every
                  PRESENT market; a week/player/market absent from the
                  fetched store contributes nothing (never fabricated).
    aggregation   SUM of every week's implied points where the player has
                  a props row that week; games_with_props_row is reported
                  alongside every total (the same games-vs-zero discipline
                  every store in this repo uses).
    name match    the odds API keys players by free-text NAME; matched to
                  a sleeper_id via a normalized-name index built from
                  nfl_data_py.import_ids() (the SAME crosswalk source
                  fetch_component_stats.py and rookie_prior.py already use)
                  — an unmatched name stays OUT of the graded population
                  and is counted, never guessed into a wrong pid.
    graded season 2025 (own_v6's held-out season — the only season for
                  which a real grade is possible without a fresh own_v6
                  run against a different held-out year).
    population    MIN_N = 10 per position, own_model_v2's existing rule,
                  imported unchanged.
    clearing bar  stated above — props_season beats own_v6 on BOTH metrics
                  at ALL FOUR positions, shared population.

STATUS OF THIS FILE RIGHT NOW: every function below is PURE and tested
against SYNTHETIC fixtures shaped exactly like the confirmed real API
response (draft/tests/test_props_season_projection.py). NO REAL GRADE
EXISTS — `historical_props_2025.json` does not exist on disk yet; that
requires a human to dispatch historical-props-fetch.yml (real API credits)
and commit its output. `main()` below refuses honestly (status
"pending_real_data") until that store exists; the moment it does, the exact
same command produces the real, trustworthy verdict — no new code required.

Run: python3 draft/tools/props_season_projection.py
Writes draft/backtest/props_season_projection_2025.json.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent            # draft/tools
DRAFT = HERE.parent
BT = DRAFT / "backtest"
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(BT))
sys.path.insert(0, str(DRAFT))

import fetch_component_stats as FCS  # noqa: E402
import fetch_historical_props as FHP  # noqa: E402
from model_accuracy_backtest import season_totals, positions_record  # noqa: E402
from own_model_v2 import (  # noqa: E402
    POSITIONS,
    MIN_N,
    _assert_no_leak,
    _baselines,
    _grade_models,
    board_ages,
    features_for,
    fit_transition,
    predict,
)
from own_model_v3 import (  # noqa: E402
    build_v3,
    league_draft_picks,
    market_ranks,
    rank_curve,
)
from own_model_v4 import (  # noqa: E402
    build_v4,
    qb_active_games,
    qb_availability_correction,
    weekly_points,
)
import own_model_v5 as V5  # noqa: E402
import own_model_v6 as V6  # noqa: E402

GRADED_SEASON = 2025
PRIOR_SEASONS = (2023, 2024)
OUT = BT / f"props_season_projection_{GRADED_SEASON}.json"

SUFFIXES = ("jr", "sr", "ii", "iii", "iv", "v")


# ── pure: line -> points, and season aggregation ──────────────────────────

def line_to_points(week_stats: dict, scoring_cfg: dict) -> float:
    """One player-week's {stat_key: line_value} (store stat keys — pass_yd,
    pass_td, rush_yd, rush_td, rec_yd, rec) -> implied fantasy points under
    the frozen scoring table. ABSENT markets contribute nothing — a player
    with only a `player_pass_yds` line that week is priced on passing yards
    alone, never assumed to have a zero rushing/receiving week. Same
    arithmetic shape as fetch_component_stats._sub_pts, one flat sum
    instead of four sub-totals because a prop LINE carries no per-category
    split beyond what the market quoted."""
    pts = 0.0
    for stat, val in week_stats.items():
        rate = scoring_cfg.get(stat)
        if rate is None:
            rate = _any_td_rate(scoring_cfg) if stat == "any_td" else None
        if rate is None or val is None:
            continue
        pts += float(val) * float(rate)
    return round(pts, 4)


def _any_td_rate(scoring_cfg: dict) -> float | None:
    """Points per EXPECTED anytime touchdown.

    `any_td` exists because the vendor serves no rushing-TD market at all —
    `player_rush_tds` is billed and returns nothing (key-probe run
    31970300788), so `player_anytime_td` replaced it. That market does not
    distinguish a rushing score from a receiving one, and this function is
    only sound because THIS league prices both identically (rush_td =
    rec_td = 6.0 in the frozen table). If they ever diverge, an anytime-TD
    expectation can no longer be priced without knowing the split, and this
    returns None rather than silently picking one — a missing contribution
    is recoverable, a wrong one is not."""
    rush, rec = scoring_cfg.get("rush_td"), scoring_cfg.get("rec_td")
    if rush is None or rec is None or float(rush) != float(rec):
        return None
    return float(rush)


def week_implied_points(week_players: dict, scoring_cfg: dict) -> dict:
    """{pid_or_name: points} for one week's {pid_or_name: {stat: line}}
    store slice."""
    return {k: line_to_points(v, scoring_cfg) for k, v in week_players.items()}


def season_implied_totals(weeks: list, scoring_cfg: dict) -> tuple[dict, dict]:
    """SUM week_implied_points across a season's weeks.
    -> ({key: season_total_points}, {key: weeks_with_a_props_row}).
    A player absent from a given week's props store contributes nothing
    that week — never a zero, and never assumed to have played; the games
    count travels with every total so a 3-week partial season is never
    silently read as a full one."""
    totals: dict[str, float] = {}
    games: dict[str, int] = {}
    for wk in weeks:
        players = wk.get("players", {})
        for key, stats in players.items():
            pts = line_to_points(stats, scoring_cfg)
            totals[key] = round(totals.get(key, 0.0) + pts, 2)
            games[key] = games.get(key, 0) + 1
    return totals, games


# ── pure: name matching (odds API free-text name -> sleeper_id) ───────────

def normalize_name(name: str) -> str:
    """lowercase, strip punctuation, drop generational suffixes — the same
    class of normalization every name-join in this repo needs because two
    sources never spell a name identically ('AJ Brown' vs 'A.J. Brown',
    'Michael Pittman Jr.' vs 'Michael Pittman')."""
    n = name.lower().strip()
    n = re.sub(r"[.'\-]", "", n)
    parts = [p for p in n.split() if p not in SUFFIXES]
    return " ".join(parts)


def match_player_name(prop_name: str, name_index: dict) -> str | None:
    """normalize + look up. `name_index`: {normalized_name: sleeper_id}
    (built from a real crosswalk source in production, a fixture in tests).
    Absent, not guessed: an unmatched name returns None and the caller
    counts it rather than dropping it silently."""
    return name_index.get(normalize_name(prop_name))


def crosswalk_props_to_pid(weeks: list, name_index: dict) -> tuple[list, list]:
    """Rekeys a props store's per-week player dicts from odds-API NAME to
    sleeper pid. Returns (rekeyed_weeks, unmatched_names) — unmatched names
    are COUNTED (deduped) and their rows are dropped from the rekeyed
    output, never guessed into a wrong pid. Two different prop-store names
    matching the same pid (a genuine data-quality question, not assumed
    impossible) keep the LATER week's collision counted separately by the
    caller via season_implied_totals's own per-key summation — this
    function only renames keys, it does not merge.
    """
    unmatched = set()
    out = []
    for wk in weeks:
        players = wk.get("players", {})
        rekeyed = {}
        for name, stats in players.items():
            pid = match_player_name(name, name_index)
            if pid is None:
                unmatched.add(name)
                continue
            rekeyed[pid] = stats
        out.append({"week": wk.get("week"), "players": rekeyed})
    return out, sorted(unmatched)


# ── the graded comparison against own_v6 (read-only import of v5/v6) ──────

def _v6_predictions(positions: dict, ages: dict) -> dict:
    """Reproduces own_model_v6.run()'s v6_2025 construction using ONLY v6's
    own already-public building blocks (build_v3 / build_v4 /
    V5.comp_opinion / V5.build_v5 / V6.build_v6), in the exact order
    own_model_v6.run() calls them. own_model_v5.py and own_model_v6.py are
    imported READ-ONLY — neither file is edited or duplicated; v6.run()
    itself only returns graded CELLS, not the raw {pid: points} dict this
    comparison needs, so this composes v6's own exposed functions the same
    way v6.py composes v4's and v5's. A parity test in
    test_props_season_projection.py pins this reproduction against the
    committed model_accuracy_v6.json's own-coverage cells."""
    feat_fit = features_for(2024, (2023,), positions, ages)
    fits = fit_transition(feat_fit, season_totals(2024)[0])
    feat_2025 = features_for(GRADED_SEASON, PRIOR_SEASONS, positions, ages)
    v2_2025 = predict(feat_2025, fits)

    base = _baselines(GRADED_SEASON, PRIOR_SEASONS)
    blend = base["recency_blend"]

    _assert_no_leak(PRIOR_SEASONS, GRADED_SEASON)
    picks = league_draft_picks(GRADED_SEASON)
    curve = rank_curve(max(PRIOR_SEASONS), positions)
    mrank = market_ranks(picks, positions)

    v3_2025 = build_v3(v2_2025, blend, mrank, curve, positions)
    wk_y1 = weekly_points(max(PRIOR_SEASONS))
    acts = qb_active_games(wk_y1, positions)
    corr, _mu = qb_availability_correction(acts)
    v4_2025 = build_v4(v3_2025, blend, corr, positions)

    vegas_imp = FCS.implied_team_totals(GRADED_SEASON, 1, 1)
    comp = V5.comp_opinion(GRADED_SEASON, PRIOR_SEASONS, positions, ages, vegas_imp)
    v5_2025 = V5.build_v5(v3_2025, comp, blend, corr, mrank, curve, positions)

    assert sorted(v4_2025) == sorted(v5_2025), "arm coverage must be identical"
    return V6.build_v6(v4_2025, v5_2025, positions)


def grade_props_vs_v6(props_pred: dict) -> dict:
    """{"props_season", "own_v6", "naive_prev", "recency_blend"} graded
    head to head on the shared population, own_model_v2._grade_models
    (imported, unmodified — the SAME harness v2-v6 were all graded with)."""
    positions = positions_record()
    ages = board_ages()
    v6_pred = _v6_predictions(positions, ages)
    base = _baselines(GRADED_SEASON, PRIOR_SEASONS)
    models = {"props_season": props_pred, "own_v6": v6_pred,
              "naive_prev": base["naive_prev"], "recency_blend": base["recency_blend"]}
    return _grade_models(models, GRADED_SEASON, positions), v6_pred


def verdict_vs_v6(h2h: dict) -> dict:
    """The preregistered bar: props_season beats own_v6 on BOTH metrics at
    ALL FOUR positions, shared population. Per-position detail is always
    returned, pass or fail."""
    per_pos = {}
    clears = True
    any_measured = False
    for pos in POSITIONS:
        row = h2h.get(pos) or {}
        if row.get("status") != "measured":
            per_pos[pos] = {"status": "unmeasurable", "n": row.get("n", 0)}
            clears = False
            continue
        any_measured = True
        p, v6 = row["props_season"], row["own_v6"]
        mae_ok = p["mae"] < v6["mae"]
        sp_ok = p["spearman"] > v6["spearman"]
        per_pos[pos] = {
            "mae_beats_v6": mae_ok, "spearman_beats_v6": sp_ok,
            "props_mae": p["mae"], "own_v6_mae": v6["mae"],
            "mae_delta": round(p["mae"] - v6["mae"], 2),
            "props_spearman": p["spearman"], "own_v6_spearman": v6["spearman"],
            "spearman_delta": round(p["spearman"] - v6["spearman"], 4),
        }
        clears = clears and mae_ok and sp_ok
    return {
        "bar": ("props_season beats own_v6 on BOTH metrics (lower MAE, "
                "higher Spearman) at ALL FOUR positions, shared population "
                "with own_v6/naive_prev/recency_blend — preregistered in "
                "props_season_projection.py before any real grade existed"),
        "per_position": per_pos,
        "clears": bool(clears and any_measured),
    }


# ── I/O: the real name-index (untested here — network, like the other
# crosswalk builders in this repo) ─────────────────────────────────────────

def build_name_index() -> dict:
    """normalized_name -> sleeper_id, from nfl_data_py.import_ids() (the
    SAME source fetch_component_stats._crosswalk and rookie_prior's fetch
    already use for gsis<->sleeper). Untested here for the same reason
    those two are untested: it is a live network call, exercised only in
    CI. Names come from the `name`/`football_name` columns nfl_data_py
    ships; both are tried, first non-null wins, never accumulated (the
    put-vs-add rule from grade.py)."""
    import nfl_data_py as nfl
    ids = nfl.import_ids()
    idx: dict[str, str] = {}
    name_cols = [c for c in ("name", "football_name", "merge_name")
                 if c in ids.columns]
    for _, row in ids.iterrows():
        sid = row.get("sleeper_id")
        if sid is None or sid != sid:
            continue
        sid = str(int(float(sid))) if str(sid).replace(".", "").isdigit() else str(sid)
        for col in name_cols:
            nm = row.get(col)
            if isinstance(nm, str) and nm:
                key = normalize_name(nm)
                idx.setdefault(key, sid)
    return idx


# ── the run ──────────────────────────────────────────────────────────────

def run() -> dict:
    store_path = FHP.store_path(GRADED_SEASON)
    if not store_path.exists():
        return {
            "_territory": "TERRITORY: A — produced by draft/tools/props_season_projection.py",
            "status": "pending_real_data",
            "why": (f"{store_path.name} does not exist — no real historical "
                    "props have been fetched yet. Dispatching "
                    "historical-props-fetch.yml (real ODDS_API_KEY credits) "
                    "is a human decision (ROUTES.md TO:A); this refusal is "
                    "the honest artifact until that store is committed."),
            "tested_on_fixtures": [
                "line_to_points", "week_implied_points",
                "season_implied_totals", "normalize_name",
                "match_player_name", "crosswalk_props_to_pid",
                "grade_props_vs_v6 (parity of the v6 reproduction against "
                "the committed model_accuracy_v6.json)"],
            "pending_real_data": [
                f"draft/backtest/historical_props_{y}.json" for y in FHP.SEASONS],
        }

    scoring_cfg = FCS.frozen_scoring_table()
    store = json.loads(store_path.read_text())
    name_idx = build_name_index()
    weeks_by_pid, unmatched = crosswalk_props_to_pid(store["weeks"], name_idx)
    props_pred, games = season_implied_totals(weeks_by_pid, scoring_cfg)

    h2h_full, v6_pred = grade_props_vs_v6(props_pred)
    h2h = h2h_full["head_to_head_shared_population"]
    verdict = verdict_vs_v6(h2h)

    return {
        "_territory": "TERRITORY: A — produced by draft/tools/props_season_projection.py",
        "_note": ("Props-implied season-total projection (weekly consensus "
                  "prop lines, summed under the frozen scoring table) vs "
                  "own_v6, leak-free per-week (no line reads a result), "
                  "with the in-season-information asymmetry named in the "
                  "module docstring. Preregistered in "
                  "props_season_projection.py before this artifact existed."),
        "preregistration": "props_season_projection.py module docstring (committed first)",
        "status": "graded",
        "graded_season": GRADED_SEASON,
        "coverage": {
            "props_forecasts": len(props_pred),
            "unmatched_names": unmatched,
            "unmatched_count": len(unmatched),
            "weeks_in_store": len(store["weeks"]),
        },
        "arm_2025": h2h_full,
        "promotion_bar_vs_v6": verdict,
        "in_season_information_asymmetry": (
            "props-implied totals absorb in-season role/injury information "
            "own_v6 (a preseason forecast) cannot see by construction — a "
            "props win here answers 'how much is on the table given "
            "in-season market access', not 'should the preseason board "
            "switch to this' — see the module docstring for the full "
            "statement, preregistered before this grade ran"),
    }


def main() -> None:
    doc = run()
    OUT.write_text(json.dumps(doc, indent=1))
    print(f"wrote {OUT.name}")
    if doc["status"] != "graded":
        print(f"status: {doc['status']} — {doc.get('why', '')}")
        return
    v = doc["promotion_bar_vs_v6"]
    print(f"clears (beats own_v6 on both metrics, all 4 positions): {v['clears']}")
    for pos in POSITIONS:
        row = v["per_position"].get(pos, {})
        print(f"  {pos}: {row}")


if __name__ == "__main__":
    main()
