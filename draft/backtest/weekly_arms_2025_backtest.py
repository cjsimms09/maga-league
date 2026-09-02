#!/usr/bin/env python3
# TERRITORY: A
"""THE WEEKLY FORMULA, RUN OVER ALL OF 2025 BEFORE IT PRICES A SINGLE 2026 WEEK.

── WHY (register 463) ────────────────────────────────────────────────────────

`draft/weekly_own_projection.py` goes live on 2026-09-10 pricing every skill
player every Thursday with

    weekly = proj_ownmodel / 17 * (1 + tilt_scale * vg[pos] * vegas_delta)

and a Tuesday grader that promotes among five challenger arms on rolling
weekly MAE. Cory, 2026-09-01: "Make my model better, more accurate, more
useable. Win me more money and more fantasy points."

The formula has NEVER been run over a full past season. Every input to do so is
already committed: 2025 weekly actuals under our table, 2025 closing lines for
every game, 2025 preseason season totals from own_v6 / FantasyPros / Sleeper
(all re-scored under our table), and per-week player prop lines for all 18
weeks. So the question "which arm should be champion on 09-10, and by how much"
is answerable TODAY rather than in November — and so is the question that
actually pays: "would any of these arms have started a better lineup for Cory
in 2025 than the one he started?"

── WHAT IT DOES, AND THE DISCIPLINE ────────────────────────────────────────

Tier-1 ONLY (BLEND-SEARCH-DESIGN §2): single-axis arms, no fitted blends. For
week w every arm sees only what was knowable before week w kicked off:

  season-prior family   prior/divisor × vegas tilt — the LIVE formula, on each
                        of the three preseason priors, across the live
                        challenger set (tilt 1.0/1.5/0.5/0, divisor 17/16)
  site_ours             the number the SITE shows today: (3·prior/17 + Σ
                        realized) / (3 + n) — src/weekly_player_projection.js
  s2d_mean              season-to-date per-game mean through w-1
  prev_week             last week's actual (the naive "hot hand")
  props                 that week's player prop lines, combined additively
                        into a stat line and scored under our table (the
                        repo's own implied_points rule) — PARTIAL population,
                        never zero-filled

Three grades, in increasing order of what Cory cares about:

  1. MAE / Spearman per position on the SHARED population (rule: a pid enters
     only if EVERY arm in the comparison prices it AND it has a real stat row;
     absent is absent, never zero) — the Tuesday grader's own `_score`.
  2. Cory's bar: pairwise start/sit accuracy per position, the frozen metric
     from start_sit_metric.py, imported not copied. ⚠️ NO WEEKLY PROVIDER
     NUMBERS EXIST FOR 2025 (the archive starts 2026-09-10), so the "providers"
     here are FantasyPros' and Sleeper's PRESEASON priors run through the same
     formula. That is a weaker comparator than the live bar and is labelled so.
  3. THE UNIT THAT PAYS: for Cory's ACTUAL 2025 roster each week, the best
     legal lineup by each arm's projection, scored with the points that were
     actually scored, against the lineup he actually started. Paired over
     weeks. Hindsight-optimal is reported as the ceiling.

Nulls (BLEND-SEARCH-DESIGN §3): SHUFFLE (each arm's values permuted within
position within week) and BEST-OF-K (where the winning arm's margin sits among
K shuffled arms). Controls: the own_v6 arm must reproduce the live pricer's
output byte-for-byte on a sample week; Cory's recorded weekly score must be
reproduced from his starters' points; the hindsight ceiling must dominate every
arm; the props crosswalk must match a named known player.

REPORT ONLY. Writes draft/backtest/weekly_arms_<season>_backtest.json.
Run:  python3 draft/backtest/weekly_arms_2025_backtest.py [--season 2024]
      (2025 is the default and the cited artifact; --season 2024 is the
      replication fold, register 471 — same harness, the three claims fixed
      in REPLICATION_CLAIMS before that fold was read)
"""
from __future__ import annotations

import json
import random
import statistics as st
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "draft"))
sys.path.insert(0, str(ROOT / "draft" / "backtest"))
sys.path.insert(0, str(ROOT / "draft" / "tools"))

import scoring as SCORING                                   # noqa: E402
from adp import normalize_name                              # noqa: E402
from start_sit_metric import pairwise_accuracy, meets_cory_bar, POSITIONS  # noqa: E402
from weekly_own_grade import _score                         # noqa: E402
from weekly_own_projection import (                         # noqa: E402
    DEFAULT_ARMS, VG, implied_from_vegas_store, price_week)
from fetch_weekly_props import implied_points, MARKET_TO_STAT  # noqa: E402

SEASON = int(sys.argv[sys.argv.index("--season") + 1]) if "--season" in sys.argv else 2025
# register 472: a fold an OPEN prereg holds blind is refused at startup unless
# --spend-blind-fold is passed with that owner's word. 2023 is P347's (D).
if __name__ == "__main__":
    from blind_folds import refuse_if_blind
    refuse_if_blind("props_weekly", SEASON)
#: REPLICATION FOLDS (register 471, 2026-09-02). The file keeps its 2025 name
#: because the 2025 artifact is cited by the prereg, P353, P357 and register
#: 463; `--season 2024` runs the identical harness on the 2024 stores and
#: writes weekly_arms_2024_backtest.json. The 2025 run is the control: it must
#: be byte-identical before and after this parameterisation (it was).
#: The three claims a fold must answer are fixed HERE, before the 2024 fold
#: was read (BLEND-SEARCH-DESIGN: no arm is invented per fold).
#: ⛔ BEFORE READING ANY NEW (season, arm) FOLD: grep PREDICTION-LEDGER.md for
#: an OPEN prereg that holds that fold blind. The 2024 read on 09-02 spent a
#: fold D's P347 was holding blind (register 472); 2023 is the last blind
#: fold for the props arm and this file must not be pointed at it without
#: D's grade landing first.
#: THE PRIOR CLAIM (2026-09-02, written BEFORE either fold was run with it):
#: both folds showed the season PRIOR mattering more than the formula, with
#: own_v6 the worst prior on every grade. A `blend` prior — the per-player
#: mean of the available season priors (own_v6 + FP + Sleeper in 2025; own_v6
#: + FP in 2024), the backtest's proxy for the board's multi-source proj_mean
#: — is priced through the SAME v1 formula. CLAIM: blend:v1 beats own_v6:v1
#: on pooled MAE AND at >= 3 of 4 positions on start/sit, in BOTH folds.
#: If TRUE it is a Tier-1 single-axis challenger (the prior source) the
#: design permits any time; if FALSE the board blend stays a draft instrument.
PRIOR_CLAIM = ("blend_v1_beats_own_v1_mae_and_startsit_3of4",
               "blend:v1 beats own_v6:v1 on pooled MAE AND on start/sit at >= 3 of 4 positions")
REPLICATION_CLAIMS = (
    ("props_beats_v1_startsit_3of4", "props beats own_v6:v1 on pairwise start/sit at >= 3 of 4 positions (shared population)"),
    ("pull_beats_v1_mae", "site_ours (the pull rule) beats own_v6:v1 on pooled MAE"),
    ("blend_beats_pull_mae_and_startsit_3of4", "blend_props_pull beats site_ours on pooled MAE AND on start/sit at >= 3 of 4 positions"),
)
WEEKS = list(range(1, 18))          # weeks 1-17: the fantasy regular season
CORY_ROSTER_ID = 1
K_NULL = 200
SEED = 20260901
PRIOR_PSEUDO_WEEKS = 3               # src/weekly_player_projection.js
#: `--prior rebuilt` (2026-09-02, register 471's follow-up): price the fold on
#: own_v6 REBUILT from today's helper stores instead of the committed 08-18
#: store — K7 measured 211/510 identical, max drift 22.55 points between the
#: two — so the question "do the cited 2025 conclusions depend on WHICH own_v6
#: store?" has a measured answer. Writes a SEPARATE artifact; the cited one
#: cannot be overwritten by this flag.
PRIOR_MODE = sys.argv[sys.argv.index("--prior") + 1] if "--prior" in sys.argv else "committed"
OUT = ROOT / "draft" / "backtest" / (f"weekly_arms_{SEASON}_backtest.json" if PRIOR_MODE == "committed"
                                     else f"weekly_arms_{SEASON}_{PRIOR_MODE}prior_backtest.json")

#: the props store keys markets by the STAT they map to, not the odds-api name
STAT_TO_MARKET = {v: k for k, v in MARKET_TO_STAT.items()}


# ── inputs ────────────────────────────────────────────────────────────────────

def rebuild_own_v6(graded: int) -> dict:
    """own_v6's preseason prior for `graded`, rebuilt from the SAME committed
    helpers own_model_v6 uses — the chain proj_mean_blend._probe_models runs
    for 2025, with the season as a parameter. Control K7 proves the chain at
    2025 reproduces the committed 2025 prior before any other season is read."""
    import fetch_component_stats as FCS
    import own_model_v5 as V5
    from model_accuracy_backtest import positions_record, season_totals
    from own_model_v2 import features_for, fit_transition, predict
    from own_model_v3 import build_v3, market_ranks, rank_curve
    from own_model_v4 import (build_v4, league_draft_picks, qb_active_games,
                              qb_availability_correction, weekly_points)
    from own_model_v6 import _baselines, board_ages, build_v6
    priors = (graded - 2, graded - 1)
    positions, ages = positions_record(), board_ages()
    fits = fit_transition(features_for(graded - 1, (graded - 2,), positions, ages),
                          season_totals(graded - 1)[0])
    v2 = predict(features_for(graded, priors, positions, ages), fits)
    base = _baselines(graded, priors)
    blend = base["recency_blend"]
    curve = rank_curve(max(priors), positions)
    mrank = market_ranks(league_draft_picks(graded), positions)
    v3 = build_v3(v2, blend, mrank, curve, positions)
    corr, _mu = qb_availability_correction(qb_active_games(weekly_points(max(priors)), positions))
    v4 = build_v4(v3, blend, corr, positions)
    v5 = V5.build_v5(v3, V5.comp_opinion(graded, priors, positions, ages,
                                         FCS.implied_team_totals(graded, 1, 1)),
                     blend, corr, mrank, curve, positions)
    return {str(k): v for k, v in build_v6(v4, v5, positions).items()}


def load(controls: list | None = None):
    J = lambda p: json.loads((ROOT / p).read_text())  # noqa: E731
    act = {e["week"]: {str(k): float(v) for k, v in e["points"].items()}
           for e in J(f"draft/backtest/nflverse_weekly_points_{SEASON}.json")["weeks"]}
    comp = {e["week"]: e["players"]
            for e in J(f"draft/backtest/component_stats_{SEASON}.json")["weeks"]}
    vegas = J("draft/backtest/vegas_lines_2021_2026.json")
    fp_hist = J("draft/backtest/fp_hist_rows.json")["years"][str(SEASON)]["rows"]
    prov_path = ROOT / "draft" / "backtest" / f"sleeper_vs_fp_rows_{SEASON}.json"
    if prov_path.exists():
        # 2025: the committed three-source store from the egress run (own_v6
        # rebuilt there by the same chain, FP and Sleeper fetched live).
        prov = json.loads(prov_path.read_text())
        priors = {"own_v6": prov["rows"]["own_v6"], "fp": prov["rows"]["fantasypros"],
                  "sleeper": prov["rows"]["sleeper"]}
        positions = dict(prov["positions"])
        prior_sources = "sleeper_vs_fp_rows (own_v6 rebuilt, FP + Sleeper fetched live)"
        if PRIOR_MODE == "rebuilt":
            priors["own_v6"] = rebuild_own_v6(SEASON)
            prior_sources = ("own_v6 REBUILT from today's helper stores (--prior rebuilt); FP + Sleeper "
                             "from sleeper_vs_fp_rows — the robustness arm of the cited artifact, not the cited artifact")
    else:
        # Other seasons: no Sleeper archive exists (sandbox cannot fetch, and
        # none was captured). own_v6 is rebuilt from the committed helpers; FP
        # is the historical draft-week projection re-scored under our table
        # (fp_hist_rows `our_pts`). Two priors, stated in the artifact.
        priors = {"own_v6": rebuild_own_v6(SEASON),
                  "fp": {str(r["pid"]): float(r["our_pts"]) for r in fp_hist
                         if r.get("pid") and (r.get("our_pts") or 0) > 0}}
        positions = {}
        prior_sources = "own_v6 rebuilt in-process (K7 controls the builder); FP from fp_hist_rows our_pts; NO Sleeper archive for this season"
        if controls is not None:
            # K7 — the builder used for THIS season IS the reference builder:
            # pointed at 2025 it must reproduce proj_mean_blend._probe_models()
            # player for player. A builder that only agrees with itself is not
            # a control (rule 3e). ⚠️ K7 was first written against the
            # COMMITTED 08-18 store (sleeper_vs_fp_rows_2025) and FAILED —
            # 211 of 510 identical, 19 extra players — because that store's
            # INPUTS (component stats, positions record, season totals) have
            # been refreshed since 08-18; the chain itself agreed with the
            # reference 529/529. A control pinned to a store built on a past
            # day fails on refresh, not on defect (the class registers 452-466
            # keep finding). The drift is RECORDED here as a measurement, not
            # asserted away.
            import proj_mean_blend as PMB
            ref = {str(k): v for k, v in PMB._probe_models()[0]["own_v6"].items()}
            rebuilt = rebuild_own_v6(2025)
            same = sum(1 for k, v in ref.items() if abs(rebuilt.get(k, float("nan")) - float(v)) < 0.011)
            committed = J("draft/backtest/sleeper_vs_fp_rows_2025.json")["rows"]["own_v6"]
            same_c = sum(1 for k, v in committed.items() if abs(rebuilt.get(k, float("nan")) - float(v)) < 0.011)
            drift = max(abs(rebuilt.get(k, float("nan")) - float(v)) for k, v in committed.items() if k in rebuilt)
            controls.append({"id": "K7", "what": "rebuild_own_v6(2025) == proj_mean_blend._probe_models() own_v6, player for player",
                             "ok": same == len(ref) and len(rebuilt) == len(ref),
                             "reference": len(ref), "rebuilt": len(rebuilt), "identical": same,
                             "committed_0818_store": {"n": len(committed), "identical_to_rebuild": same_c,
                                                      "max_abs_drift": round(drift, 2),
                                                      "note": "the 2025 fold prices the COMMITTED store; its inputs have been refreshed since 08-18"}})
    # the blend prior: per-player mean of every available season prior
    pids = set().union(*[set(v) for v in priors.values()])
    priors["blend"] = {}
    for pid in pids:
        vals = [float(v[pid]) for v in priors.values() if pid in v and v[pid] is not None]
        if vals:
            priors["blend"][pid] = round(sum(vals) / len(vals), 2)
    props = {e["week"]: e["players"]
             for e in J(f"draft/backtest/historical_props_{SEASON}.json")["weeks"]}
    hist = next(s for s in J("draft/data/league_history.json")["seasons"]
                if str(s.get("season")) == str(SEASON))
    scoring_table = J("draft/config/league_config.json")["scoring"]
    names = {str(r["pid"]): r["name"] for r in fp_hist if r.get("pid")}
    for p in J("public/draft_data.json")["players"]:
        names.setdefault(str(p.get("player_id")), p.get("name"))
    return dict(act=act, comp=comp, vegas=vegas, priors=priors, positions=positions,
                props=props, hist=hist, scoring=scoring_table, names=names,
                prior_sources=prior_sources)


def byes_by_week(vegas):
    games = vegas["seasons"][str(SEASON)]
    teams = {g["home"] for g in games} | {g["away"] for g in games}
    out = {}
    for w in range(1, 19):
        on = {g["home"] for g in games if g["week"] == w} | {g["away"] for g in games if g["week"] == w}
        out[w] = teams - on
    return out


VEGAS_TO_STATS = {"LA": "LAR"}


def team_pos_for_week(comp, w):
    """{pid: (team, pos)} from the nflverse stat rows of week w — the team a
    player was actually on that week, not a preseason guess."""
    return {pid: (r.get("team"), r.get("pos")) for pid, r in comp[w].items()}


# ── arms ──────────────────────────────────────────────────────────────────────

def realized_lists(act, w):
    """{pid: [points in weeks < w]} — what price_week's pull arms read live
    (weekly_own_projection.realized_from_ledger), rebuilt from the actuals."""
    per = {}
    for k in sorted(k for k in act if k < w):
        for pid, pts in act[k].items():
            per.setdefault(pid, []).append(pts)
    return per


def season_prior_arms(priors, tp, implied, byes_w, w, realized=None):
    """The LIVE formula on each preseason prior, across the live challenger set.
    Reuses price_week so the own_v6 arm IS what own_weekly_v1 would have
    priced — the control below proves it. `realized` (2026-09-02) makes the
    pull arms PULL on every prior, as they do live from week 2; before this
    every `<prior>:v1_pull3` column equalled `<prior>:v1` and the only pulled
    arm was site_ours (own_v6). K8 proves site_ours == own_v6:v1_pull3."""
    out = {}
    for pname, prior in priors.items():
        players = []
        for pid, total in prior.items():
            team, pos = tp.get(pid, (None, None))
            if pos not in POSITIONS or team is None:
                continue
            players.append({"player_id": pid, "position": pos, "team": team,
                            "proj_ownmodel": float(total),
                            "bye": w if team in byes_w else None})
        arms_here = [a for a in DEFAULT_ARMS if not a.get("prior")]   # the prior axis IS `priors` here
        priced = price_week(players, w, implied, arms_here, realized)
        for arm in arms_here:
            out[f"{pname}:{arm['name']}"] = priced["means"][arm["name"]]
    return out


def realized_arms(act, priors, tp, w):
    """s2d_mean, prev_week, and the SITE's own pull rule — from actuals
    strictly before week w."""
    hist_weeks = [k for k in act if k < w]
    per = {}
    for k in hist_weeks:
        for pid, pts in act[k].items():
            per.setdefault(pid, []).append(pts)
    s2d = {pid: round(sum(v) / len(v), 2) for pid, v in per.items()}
    prev = dict(act[w - 1]) if (w - 1) in act else {}
    site = {}
    for pid, total in priors["own_v6"].items():
        team, pos = tp.get(pid, (None, None))
        if pos not in POSITIONS:
            continue
        prior = float(total) / 17.0
        v = per.get(pid, [])
        site[pid] = round((PRIOR_PSEUDO_WEEKS * prior + sum(v)) / (PRIOR_PSEUDO_WEEKS + len(v)), 2)
    return {"s2d_mean": s2d, "prev_week": prev, "site_ours": site}


def props_arm(props_w, names, tp, scoring_table):
    """Prop lines -> stat line -> our points, via the repo's own rule. The
    props store is keyed by NAME, so it is crosswalked through normalize_name
    against the pid->name map, disambiguated by the team the player was on
    that week. Ambiguity is dropped, never guessed."""
    idx: dict[str, list] = {}
    for pid, nm in names.items():
        if nm and pid in tp:
            idx.setdefault(normalize_name(nm), []).append(pid)
    out, unmatched, ambiguous = {}, 0, 0
    for nm, lines in props_w.items():
        cands = idx.get(normalize_name(nm)) or []
        if not cands:
            unmatched += 1
            continue
        if len(cands) > 1:
            cands = [c for c in cands if tp[c][1] in POSITIONS]
            if len(cands) != 1:
                ambiguous += 1
                continue
        pid = cands[0]
        mp = {STAT_TO_MARKET[k]: v for k, v in lines.items() if k in STAT_TO_MARKET}
        #: any_td (EXPECTED TDs in the historical store) is folded by
        #: `implied_points` itself since register 467 — one rush/rec TD per
        #: expected TD, skipped when a per-type TD line is quoted. This file
        #: used to fold it here, by hand, for RB/WR/TE only, while the live
        #: converter dropped it entirely: two arms sharing one name. Now the
        #: live and backtested arms are the same function. CONTROL K6 below:
        #: RB/WR/TE prices are unchanged by the move; QBs gain their rushing-
        #: TD expectation, which the hand fold had excluded.
        pts, _line = implied_points(mp, scoring_table) if mp else (None, {})
        if pts is not None:
            out[pid] = round(pts, 2)
    return out, {"unmatched_names": unmatched, "ambiguous": ambiguous, "priced": len(out)}


# ── grades ────────────────────────────────────────────────────────────────────

def shared_population(arms: dict, act_w: dict, tp: dict) -> list:
    pids = set(act_w)
    for a in arms.values():
        pids &= set(a)
    return sorted(p for p in pids if tp.get(p, (None, None))[1] in POSITIONS)


def grade_mae(arms, act_w, tp):
    pop = shared_population(arms, act_w, tp)
    pos = {p: tp[p][1] for p in pop}
    return {name: _score(pop, vals, act_w, pos) for name, vals in arms.items()}, pop


# ── outcome: Cory's actual roster, each week ──────────────────────────────────

def slot_counts(roster_positions):
    c = {}
    for s in roster_positions:
        if s == "BN":
            continue
        c[s] = c.get(s, 0) + 1
    return c


FLEX_ELIGIBLE = {"FLEX": ("RB", "WR", "TE"), "SUPER_FLEX": ("QB", "RB", "WR", "TE"),
                 "REC_FLEX": ("WR", "TE"), "WRRB_FLEX": ("RB", "WR")}


def best_lineup(pids, proj, tp, slots, fixed_kdef):
    """Greedy-by-slot best legal lineup by `proj`; K/DEF taken as the ones
    Cory actually started (no arm prices them). Returns (chosen pids, total
    projected). Players without a projection are ineligible — an arm that
    cannot price a man cannot start him."""
    avail = [p for p in pids if p in proj and tp.get(p, (None, None))[1] in POSITIONS]
    avail.sort(key=lambda p: -proj[p])
    chosen = []
    used = set()
    for slot in ("QB", "RB", "WR", "TE"):
        for _ in range(slots.get(slot, 0)):
            pick = next((p for p in avail if p not in used and tp[p][1] == slot), None)
            if pick:
                chosen.append(pick)
                used.add(pick)
    for slot, elig in FLEX_ELIGIBLE.items():
        for _ in range(slots.get(slot, 0)):
            pick = next((p for p in avail if p not in used and tp[p][1] in elig), None)
            if pick:
                chosen.append(pick)
                used.add(pick)
    return chosen + list(fixed_kdef)


def outcome_week(row, arms, act_w, tp, slots):
    pts = {str(k): float(v) for k, v in (row.get("players_points") or {}).items()}
    rostered = [str(p) for p in row.get("players") or []]
    starters = [str(p) for p in row.get("starters") or []]
    kdef = [p for p in starters if p not in tp or tp[p][1] not in POSITIONS]
    actual_total = sum(pts.get(p, 0.0) for p in starters)
    hind = best_lineup(rostered, {p: pts.get(p, 0.0) for p in rostered}, tp, slots, kdef)
    hind_total = sum(pts.get(p, 0.0) for p in hind)
    out = {"actual": round(actual_total, 2), "hindsight": round(hind_total, 2),
           "recorded": row.get("points"), "arms": {}}
    #: COVERAGE-EQUALISED: an arm that prices more of the roster has more
    #: lineup freedom, so the raw grade is partly a contest of coverage.
    #: Every arm's UNPRICED rostered skill player is filled from one common
    #: fallback — our own best full-coverage number — so the arms differ only
    #: where they actually disagree.
    fallback = arms.get("site_ours") or arms.get("own_v6:v1") or {}
    for name, proj in arms.items():
        line = best_lineup(rostered, proj, tp, slots, kdef)
        n_priced = sum(1 for p in rostered if p in proj)
        eq = dict(fallback)
        eq.update(proj)
        line_eq = best_lineup(rostered, eq, tp, slots, kdef)
        out["arms"][name] = {"points": round(sum(pts.get(p, 0.0) for p in line), 2),
                             "points_equalised": round(sum(pts.get(p, 0.0) for p in line_eq), 2),
                             "priced_of_rostered": n_priced}
    return out


# ── nulls ─────────────────────────────────────────────────────────────────────

def shuffle_within_pos(vals, tp, rng):
    by_pos: dict[str, list] = {}
    for pid in vals:
        by_pos.setdefault(tp[pid][1], []).append(pid)
    out = {}
    for pos, pids in by_pos.items():
        v = [vals[p] for p in pids]
        rng.shuffle(v)
        out.update(dict(zip(pids, v)))
    return out


# ── main ──────────────────────────────────────────────────────────────────────

def main() -> int:
    controls = []
    D = load(controls)
    rng = random.Random(SEED)
    byes = byes_by_week(D["vegas"])
    slots = slot_counts(D["hist"]["roster_positions"])

    weekly = {}
    ss_weeks_full, ss_weeks_props = [], []
    outcome = {}
    props_diag = {}
    for w in WEEKS:
        tp = team_pos_for_week(D["comp"], w)
        implied = {VEGAS_TO_STATS.get(k, k): v
                   for k, v in implied_from_vegas_store(D["vegas"], SEASON, w).items()}
        byes_w = {VEGAS_TO_STATS.get(t, t) for t in byes[w]}
        arms = {}
        arms.update(season_prior_arms(D["priors"], tp, implied, byes_w, w,
                                      realized_lists(D["act"], w) if w >= 2 else None))
        if w >= 2:
            arms.update(realized_arms(D["act"], D["priors"], tp, w))
        p_arm, p_diag = props_arm(D["props"].get(w, {}), D["names"], tp, D["scoring"])
        props_diag[w] = p_diag
        act_w = D["act"][w]
        #: ── THE PREREGISTERED TIER-2 BLEND (Cory, 2026-09-01: "Do all of these") ──
        #: props where a line exists, the pull arm everywhere else. FULL coverage
        #: by construction, so it enters the full-coverage comparison. This is
        #: its 2025 PRIOR ART; it enters the live grader on 10-08 per
        #: BLEND-SEARCH-DESIGN §5, not before.
        pull_full = arms.get("site_ours") or arms["own_v6:v1"]
        arms["blend_props_pull"] = {pid: p_arm.get(pid, pull_full[pid]) for pid in pull_full}

        # ── grade 1: MAE on the shared population of the FULL-coverage arms
        full = {k: v for k, v in arms.items()}
        mae, pop = grade_mae(full, act_w, tp)
        # props separately, on ITS shared population with the champion formula
        props_cmp = {"own_v6:v1": arms["own_v6:v1"], "props": p_arm}
        mae_props, pop_props = grade_mae(props_cmp, act_w, tp)
        weekly[w] = {"n_shared": len(pop), "mae": mae,
                     "props": {"n_shared": len(pop_props), "mae": mae_props}}

        # ── grade 2: start/sit rows for the pairwise metric
        ss_weeks_full.append({p: {"pos": tp[p][1], "actual": act_w[p],
                                  "proj": {k: v[p] for k, v in full.items()}}
                              for p in pop})
        ss_weeks_props.append({p: {"pos": tp[p][1], "actual": act_w[p],
                                   "proj": {k: v[p] for k, v in props_cmp.items()}}
                               for p in pop_props})

        # ── grade 3: Cory's roster, this week
        row = next((r for r in D["hist"]["weeks"].get(str(w), D["hist"]["weeks"].get(w, []))
                    if r.get("roster_id") == CORY_ROSTER_ID), None)
        if row:
            all_arms = dict(full)
            all_arms["props"] = p_arm
            outcome[w] = outcome_week(row, all_arms, act_w, tp, slots)

    # ── controls ──────────────────────────────────────────────────────────────
    # K1 — the own_v6:v1 arm IS the live pricer's output. Re-price week 3 by
    # calling price_week directly on the identical player list and compare.
    w = 3
    tp = team_pos_for_week(D["comp"], w)
    implied = {VEGAS_TO_STATS.get(k, k): v
               for k, v in implied_from_vegas_store(D["vegas"], SEASON, w).items()}
    byes_w = {VEGAS_TO_STATS.get(t, t) for t in byes[w]}
    a = season_prior_arms(D["priors"], tp, implied, byes_w, w)["own_v6:v1"]
    players = [{"player_id": pid, "position": tp[pid][1], "team": tp[pid][0],
                "proj_ownmodel": float(t), "bye": w if tp[pid][0] in byes_w else None}
               for pid, t in D["priors"]["own_v6"].items()
               if tp.get(pid, (None, None))[1] in POSITIONS and tp[pid][0]]
    direct = price_week(players, w, implied, [a for a in DEFAULT_ARMS if not a.get("prior")])["means"]["v1"]
    controls.append({"id": "K1", "what": "own_v6:v1 reproduces price_week byte-for-byte (week 3)",
                     "ok": direct == a, "n": len(a)})
    # K8 — the site's own pull rule (realized_arms.site_ours: prior/17 pulled
    # toward realized, no tilt, no bye rule) and the live pricer's pull arm
    # WITHOUT its tilt are ONE rule: byte-identical on every shared player,
    # every week from 2. If they diverge, the harness and the site price two
    # different things under one name. (First draft of this control compared
    # against a key that did not exist and would have passed on nothing.)
    k8_diff, k8_n = 0, 0
    notilt_pull = [{"name": "_pull_notilt", "divisor": 17, "tilt_scale": 0.0, "pull": PRIOR_PSEUDO_WEEKS}]
    for w in sorted(weekly):
        if w < 2:
            continue
        tpw = team_pos_for_week(D["comp"], w)
        bw = {VEGAS_TO_STATS.get(t, t) for t in byes[w]}
        plist = [{"player_id": pid, "position": tpw[pid][1], "team": tpw[pid][0],
                  "proj_ownmodel": float(t), "bye": w if tpw[pid][0] in bw else None}
                 for pid, t in D["priors"]["own_v6"].items()
                 if tpw.get(pid, (None, None))[1] in POSITIONS and tpw[pid][0]]
        pulled = price_week(plist, w, {}, notilt_pull, realized_lists(D["act"], w))["means"]["_pull_notilt"]
        site = realized_arms(D["act"], D["priors"], tpw, w)["site_ours"]
        for pid, v in pulled.items():
            if pid in site:
                k8_n += 1
                if abs(v - site[pid]) > 0.011:
                    k8_diff += 1
    controls.append({"id": "K8", "what": "site_ours == the live pull arm without its tilt, every shared player, weeks 2-17: one pull rule, not two",
                     "ok": k8_n > 0 and k8_diff == 0, "compared": k8_n, "differ": k8_diff})
    # K2 — Cory's recorded weekly score reproduces from his starters' points
    diffs = [abs(o["actual"] - float(o["recorded"])) for o in outcome.values() if o.get("recorded") is not None]
    controls.append({"id": "K2", "what": "Cory's recorded points == sum of his starters' points, every week",
                     "ok": bool(diffs) and max(diffs) < 0.05, "max_abs_diff": round(max(diffs), 3) if diffs else None,
                     "weeks": len(diffs)})
    # K3 — hindsight dominates every arm every week
    dom = all(o["hindsight"] + 1e-9 >= max(v["points"] for v in o["arms"].values()) and o["hindsight"] + 1e-9 >= o["actual"]
              for o in outcome.values())
    controls.append({"id": "K3", "what": "hindsight-optimal lineup >= every arm's lineup and >= actual, every week",
                     "ok": dom})
    # K4 — props crosswalk matched a named known player (rule 3e)
    tp1 = team_pos_for_week(D["comp"], 1)
    p1, _ = props_arm(D["props"][1], D["names"], tp1, D["scoring"])
    known = next((pid for pid, nm in D["names"].items() if nm == "Josh Allen"), None)
    controls.append({"id": "K4", "what": "props arm priced Josh Allen in week 1 from his lines",
                     "ok": bool(known and known in p1), "value": p1.get(known) if known else None})
    # K6 — the any_td fold moved from this file's hand arithmetic into the
    # SHARED converter (register 467). Recompute week 1 the old way, in
    # process: RB/WR/TE must price identically (the graded arm is unchanged
    # where it was graded), and every QB with an anytime line must gain
    # EXACTLY one rush-TD's points per expected TD (the hand fold excluded
    # QBs; the converter has no position and folds their rushing scores).
    # Rule 3f: the control is run on the population, not quoted from a story.
    per_td = SCORING.score_stat_line({"rush_td": 1.0}, D["scoring"])
    old_way, qb_gain = {}, []
    idx1 = {}
    for pid, nm in D["names"].items():
        if nm and pid in tp1:
            idx1.setdefault(normalize_name(nm), []).append(pid)
    for nm, lines in D["props"][1].items():
        cands = idx1.get(normalize_name(nm)) or []
        if len(cands) > 1:
            cands = [c for c in cands if tp1[c][1] in POSITIONS]
        if len(cands) != 1:
            continue
        pid = cands[0]
        mp = {STAT_TO_MARKET[k]: v for k, v in lines.items()
              if k in STAT_TO_MARKET and k != "any_td"}
        pts, _ = implied_points(mp, D["scoring"]) if mp else (None, {})
        if "any_td" in lines and tp1[pid][1] in ("RB", "WR", "TE"):
            pts = (pts or 0.0) + per_td * float(lines["any_td"])
        if pts is not None:
            old_way[pid] = round(pts, 2)
        if "any_td" in lines and tp1[pid][1] == "QB" and pid in p1:
            qb_gain.append(round(p1[pid] - (pts or 0.0) - per_td * float(lines["any_td"]), 2))
    skill_same = [pid for pid in old_way if tp1[pid][1] in ("RB", "WR", "TE")
                  and abs(old_way[pid] - p1.get(pid, float("nan"))) < 0.011]
    skill_all = [pid for pid in old_way if tp1[pid][1] in ("RB", "WR", "TE")]
    controls.append({"id": "K6", "what": "shared any_td fold == the hand fold at RB/WR/TE (week 1); "
                                         "QBs gain exactly rush_td x any_td",
                     "ok": bool(skill_all) and len(skill_same) == len(skill_all)
                           and bool(qb_gain) and max(abs(g) for g in qb_gain) < 0.011,
                     "skill_players": len(skill_all), "skill_identical": len(skill_same),
                     "qb_with_any_td": len(qb_gain),
                     "qb_max_abs_residual": max((abs(g) for g in qb_gain), default=None)})
    # ── pooled grades ─────────────────────────────────────────────────────────
    arm_names = sorted({k for wk in weekly.values() for k in wk["mae"]})
    pooled = {}
    for name in arm_names:
        cells = [weekly[w]["mae"][name] for w in weekly if name in weekly[w]["mae"]]
        per_pos = {}
        for pos in POSITIONS:
            m = [c["per_pos"][pos]["mae"] for c in cells if pos in c["per_pos"]]
            n = [c["per_pos"][pos]["n"] for c in cells if pos in c["per_pos"]]
            per_pos[pos] = {"mae_weighted": round(sum(a * b for a, b in zip(m, n)) / sum(n), 3) if n else None,
                            "n": sum(n)}
        overall = [(c["mae"], c["n"]) for c in cells]
        pooled[name] = {"weeks": len(cells),
                        "mae_weighted": round(sum(a * b for a, b in overall) / sum(b for _, b in overall), 3),
                        "per_pos": per_pos}

    ss_full = pairwise_accuracy(ss_weeks_full, arm_names)
    provider_arms = [f"{p}:v1" for p in D["priors"] if p not in ("own_v6", "blend")]
    bar_vs_priors = meets_cory_bar(ss_full, "own_v6:v1", provider_arms)
    ss_props = pairwise_accuracy(ss_weeks_props, ["own_v6:v1", "props"])

    # ── outcome pooled (paired over weeks) ────────────────────────────────────
    weeks_o = sorted(outcome)
    outcome_pooled = {"weeks": len(weeks_o),
                      "cory_actual_per_week": round(st.mean(outcome[w]["actual"] for w in weeks_o), 2),
                      "hindsight_per_week": round(st.mean(outcome[w]["hindsight"] for w in weeks_o), 2),
                      "arms": {}}
    def _pool(key):
        res = {}
        for name in list(arm_names) + ["props"]:
            d = [outcome[w]["arms"][name][key] - outcome[w]["actual"] for w in weeks_o if name in outcome[w]["arms"]]
            if not d:
                continue
            se = (st.stdev(d) / len(d) ** 0.5) if len(d) > 1 else None
            res[name] = {
                "delta_vs_actual_per_week": round(st.mean(d), 2),
                "se": round(se, 2) if se else None,
                "weeks_better": sum(1 for x in d if x > 0),
                "weeks_worse": sum(1 for x in d if x < 0),
                "weeks_tied": sum(1 for x in d if x == 0),
                "season_total_delta": round(sum(d), 1),
                "priced_of_rostered_mean": round(st.mean(outcome[w]["arms"][name]["priced_of_rostered"] for w in weeks_o if name in outcome[w]["arms"]), 1)}
        return res
    outcome_pooled["arms"] = _pool("points")
    outcome_pooled["arms_coverage_equalised"] = _pool("points_equalised")
    outcome_pooled["_equalised_note"] = ("every arm's UNPRICED rostered skill player is filled from "
                                        "site_ours (own_v6/17 pulled toward realized), so arms differ "
                                        "only where they actually disagree")

    # ── nulls ─────────────────────────────────────────────────────────────────
    # SHUFFLE: permute each arm within position within week; pool MAE.
    shuffle_mae = {}
    for name in arm_names:
        tot, n_tot = 0.0, 0
        for w in weekly:
            tpw = team_pos_for_week(D["comp"], w)
            act_w = D["act"][w]
            arms_w = {}
            arms_w.update(season_prior_arms(D["priors"], tpw,
                          {VEGAS_TO_STATS.get(k, k): v for k, v in implied_from_vegas_store(D["vegas"], SEASON, w).items()},
                          {VEGAS_TO_STATS.get(t, t) for t in byes[w]}, w,
                          realized_lists(D["act"], w) if w >= 2 else None))
            if w >= 2:
                arms_w.update(realized_arms(D["act"], D["priors"], tpw, w))
            pa, _ = props_arm(D["props"].get(w, {}), D["names"], tpw, D["scoring"])
            pf = arms_w.get("site_ours") or arms_w["own_v6:v1"]
            arms_w["blend_props_pull"] = {pid: pa.get(pid, pf[pid]) for pid in pf}
            if name not in arms_w:
                continue                       # realized arms start at week 2
            pop = shared_population(arms_w, act_w, tpw)
            sh = shuffle_within_pos({p: arms_w[name][p] for p in pop}, tpw, rng)
            tot += sum(abs(sh[p] - act_w[p]) for p in pop)
            n_tot += len(pop)
        shuffle_mae[name] = round(tot / n_tot, 3)
    shuffle_worse = {name: shuffle_mae[name] > pooled[name]["mae_weighted"] for name in arm_names}
    # K5 — a null that cannot fail is not a null: shuffling within position must
    # make EVERY arm worse on MAE, or the shuffle is not destroying the thing
    # the arms carry (rule 3e).
    controls.append({"id": "K5", "what": "shuffle null is worse than the real arm on MAE, for every arm",
                     "ok": all(shuffle_worse.values()),
                     "not_worse": sorted(k for k, v in shuffle_worse.items() if not v)})

    # BEST-OF-K on the OUTCOME grade: K random lineups per week (a random legal
    # lineup from the same roster) — where does the best arm's season delta sit?
    best_arm = max(outcome_pooled["arms"], key=lambda k: outcome_pooled["arms"][k]["season_total_delta"])
    best_delta = outcome_pooled["arms"][best_arm]["season_total_delta"]
    rand_deltas = []
    for _ in range(K_NULL):
        tot = 0.0
        for w in weeks_o:
            row = next(r for r in D["hist"]["weeks"].get(str(w), D["hist"]["weeks"].get(w, []))
                       if r.get("roster_id") == CORY_ROSTER_ID)
            tpw = team_pos_for_week(D["comp"], w)
            pts = {str(k): float(v) for k, v in (row.get("players_points") or {}).items()}
            rostered = [str(p) for p in row.get("players") or []]
            starters = [str(p) for p in row.get("starters") or []]
            kdef = [p for p in starters if p not in tpw or tpw[p][1] not in POSITIONS]
            randproj = {p: rng.random() for p in rostered if tpw.get(p, (None, None))[1] in POSITIONS}
            line = best_lineup(rostered, randproj, tpw, slots, kdef)
            tot += sum(pts.get(p, 0.0) for p in line) - outcome[w]["actual"]
        rand_deltas.append(tot)
    rand_deltas.sort()
    pct = sum(1 for x in rand_deltas if x < best_delta) / K_NULL

    # ── the three fixed replication claims, answered for THIS fold ───────────
    def _wins(acc, a, b):
        return sum(1 for q in POSITIONS
                   if acc["sources"][a][q]["status"] == "measured" and acc["sources"][b][q]["status"] == "measured"
                   and acc["sources"][a][q]["accuracy"] > acc["sources"][b][q]["accuracy"])
    props_wins = _wins(ss_props, "props", "own_v6:v1")
    blend_wins = _wins(ss_full, "blend_props_pull", "site_ours")
    blend_wins_v1 = _wins(ss_full, "blend:v1", "own_v6:v1")
    replication = {
        "_fixed_before_the_2024_fold_was_read": [c[1] for c in REPLICATION_CLAIMS],
        PRIOR_CLAIM[0]: {"true": pooled["blend:v1"]["mae_weighted"] < pooled["own_v6:v1"]["mae_weighted"] and blend_wins_v1 >= 3,
                         "blend:v1": pooled["blend:v1"]["mae_weighted"], "own_v6:v1": pooled["own_v6:v1"]["mae_weighted"],
                         "positions_won": blend_wins_v1, "_claim": PRIOR_CLAIM[1]},
        "props_beats_v1_startsit_3of4": {"true": props_wins >= 3, "positions_won": props_wins},
        "pull_beats_v1_mae": {"true": pooled["site_ours"]["mae_weighted"] < pooled["own_v6:v1"]["mae_weighted"],
                              "site_ours": pooled["site_ours"]["mae_weighted"], "own_v6:v1": pooled["own_v6:v1"]["mae_weighted"]},
        "blend_beats_pull_mae_and_startsit_3of4": {
            "true": pooled["blend_props_pull"]["mae_weighted"] < pooled["site_ours"]["mae_weighted"] and blend_wins >= 3,
            "blend": pooled["blend_props_pull"]["mae_weighted"], "site_ours": pooled["site_ours"]["mae_weighted"],
            "positions_won": blend_wins},
    }
    doc = {
        "_territory": "TERRITORY: A — produced by draft/backtest/weekly_arms_2025_backtest.py",
        "_what": "The live weekly formula and its challenger set, plus naive and props arms, "
                 f"run over all of {SEASON} with strictly-prior inputs; graded on MAE, on Cory's "
                 "pairwise start/sit bar, and on the lineup Cory would actually have started.",
        "_limits": [
            f"NO weekly provider projections exist for {SEASON} — the 'providers' in the bar are "
            "FantasyPros' and Sleeper's PRESEASON priors run through the same formula. The "
            "live 2026 bar compares against their WEEKLY numbers, which is a harder test.",
            "The outcome grade fixes K and DEF to what Cory actually started; no arm prices them.",
            "Props lines are the historical API's snapshot, not a verified pre-kickoff close; "
            "treated as knowable before kickoff.",
            f"own_v6's {SEASON} prior is a walk-forward rebuild ({len(D['priors']['own_v6'])} players), not a frozen "
            f"preseason artifact — the closest thing to proj_ownmodel-{SEASON} that exists.",
        ],
        "prior_sources": D["prior_sources"],
        "replication_claims": replication,
        "season": SEASON, "weeks": WEEKS, "seed": SEED, "k_null": K_NULL,
        "controls": controls,
        "pooled_mae": pooled,
        "start_sit": {"full_population": ss_full,
                      "cory_bar_own_v6_v1_vs_preseason_priors": bar_vs_priors,
                      "props_shared": ss_props},
        f"outcome_cory_{SEASON}": outcome_pooled,
        "nulls": {"shuffle_mae": shuffle_mae, "shuffle_worse_on_every_arm": all(shuffle_worse.values()),
                  "best_of_k_outcome": {"best_arm": best_arm, "season_delta": best_delta,
                                        "random_lineup_deltas_p05": round(rand_deltas[int(0.05 * K_NULL)], 1),
                                        "random_lineup_deltas_p50": round(rand_deltas[K_NULL // 2], 1),
                                        "random_lineup_deltas_p95": round(rand_deltas[int(0.95 * K_NULL)], 1),
                                        "best_arm_percentile_among_random": pct}},
        "props_crosswalk_by_week": props_diag,
        "weekly": weekly,
        "outcome_by_week": outcome,
    }
    OUT.write_text(json.dumps(doc, indent=1))

    # ── print ─────────────────────────────────────────────────────────────────
    print("\n  CONTROLS")
    for c in controls:
        print(f"   {'OK ' if c['ok'] else '*** FAILED ***'}  {c['id']}  {c['what']}"
              + (f"  ({ {k: v for k, v in c.items() if k not in ('id', 'what', 'ok')} })" if len(c) > 3 else ""))
    print("\n  POOLED MAE (shared population, weeks 2-17 for realized arms)  — lower is better")
    for name in sorted(pooled, key=lambda k: pooled[k]["mae_weighted"]):
        pp = pooled[name]["per_pos"]
        print(f"   {name:<20} all {pooled[name]['mae_weighted']:>6}   "
              + "  ".join(f"{q} {pp[q]['mae_weighted']}" for q in POSITIONS if pp[q]['mae_weighted'] is not None)
              + f"   shuffle {shuffle_mae[name]}")
    print(f"\n  START/SIT pairwise accuracy (Cory's frozen metric), pooled {SEASON}")
    for name in sorted(arm_names, key=lambda k: -(sum((ss_full['sources'][k][q]['accuracy'] or 0) for q in POSITIONS))):
        cells = ss_full["sources"][name]
        print(f"   {name:<20} " + "  ".join(f"{q} {cells[q]['accuracy']}" for q in POSITIONS))
    print(f"   props (shared pop with own_v6:v1): "
          + "  ".join(f"{q} own {ss_props['sources']['own_v6:v1'][q]['accuracy']} / props {ss_props['sources']['props'][q]['accuracy']}" for q in POSITIONS))
    print(f"\n  CORY'S BAR, own_v6:v1 vs the two PRESEASON priors: {bar_vs_priors['positions_beating_both']} of 4 positions"
          f" — bar_met={bar_vs_priors['bar_met']}  (weaker comparator than the live bar; see _limits)")
    print(f"\n  THE UNIT THAT PAYS — Cory's ACTUAL {SEASON} roster, best lineup by each arm vs what he started")
    print(f"   Cory actual {outcome_pooled['cory_actual_per_week']}/wk   hindsight ceiling {outcome_pooled['hindsight_per_week']}/wk   ({outcome_pooled['weeks']} weeks)")
    for name in sorted(outcome_pooled["arms"], key=lambda k: -outcome_pooled["arms"][k]["delta_vs_actual_per_week"]):
        o = outcome_pooled["arms"][name]
        print(f"   {name:<20} {o['delta_vs_actual_per_week']:>+6.2f}/wk ± {o['se']}   season {o['season_total_delta']:>+7.1f}"
              f"   better {o['weeks_better']}/{o['weeks_better'] + o['weeks_worse']} wks   priced {o['priced_of_rostered_mean']} of roster")
    print("\n  SAME, COVERAGE-EQUALISED (unpriced rostered players filled from site_ours)")
    eqa = outcome_pooled["arms_coverage_equalised"]
    for name in sorted(eqa, key=lambda k: -eqa[k]["delta_vs_actual_per_week"]):
        o = eqa[name]
        print(f"   {name:<20} {o['delta_vs_actual_per_week']:>+6.2f}/wk ± {o['se']}   season {o['season_total_delta']:>+7.1f}"
              f"   better/tied/worse {o['weeks_better']}/{o['weeks_tied']}/{o['weeks_worse']}")
    print("\n  REPLICATION CLAIMS (fixed in REPLICATION_CLAIMS before the 2024 fold was read)")
    for k, _ in REPLICATION_CLAIMS + (PRIOR_CLAIM,):
        print(f"   {'TRUE ' if replication[k]['true'] else 'FALSE'}  {k}  {{ {', '.join(f'{a}: {b}' for a, b in replication[k].items() if a not in ('true', '_claim'))} }}")
    b = doc["nulls"]["best_of_k_outcome"]
    print(f"\n  NULLS  shuffle worse than real on every arm: {doc['nulls']['shuffle_worse_on_every_arm']}")
    print(f"         best-of-K (random legal lineups): best arm {b['best_arm']} season {b['season_delta']:+.1f} sits at "
          f"percentile {b['best_arm_percentile_among_random']:.2f} of {K_NULL} random lineups "
          f"[p05 {b['random_lineup_deltas_p05']:+.1f}, p50 {b['random_lineup_deltas_p50']:+.1f}, p95 {b['random_lineup_deltas_p95']:+.1f}]")
    print(f"\n  wrote {OUT.relative_to(ROOT)}")
    return 0 if all(c["ok"] for c in controls) else 1


if __name__ == "__main__":
    raise SystemExit(main())
