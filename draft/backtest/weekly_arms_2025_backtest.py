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

REPORT ONLY. Writes draft/backtest/weekly_arms_2025_backtest.json.
Run:  python3 draft/backtest/weekly_arms_2025_backtest.py
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

SEASON = 2025
WEEKS = list(range(1, 18))          # weeks 1-17: the fantasy regular season
CORY_ROSTER_ID = 1
K_NULL = 200
SEED = 20260901
PRIOR_PSEUDO_WEEKS = 3               # src/weekly_player_projection.js
OUT = ROOT / "draft" / "backtest" / "weekly_arms_2025_backtest.json"

#: the props store keys markets by the STAT they map to, not the odds-api name
STAT_TO_MARKET = {v: k for k, v in MARKET_TO_STAT.items()}


# ── inputs ────────────────────────────────────────────────────────────────────

def load():
    J = lambda p: json.loads((ROOT / p).read_text())  # noqa: E731
    act = {e["week"]: {str(k): float(v) for k, v in e["points"].items()}
           for e in J("draft/backtest/nflverse_weekly_points_2025.json")["weeks"]}
    comp = {e["week"]: e["players"]
            for e in J("draft/backtest/component_stats_2025.json")["weeks"]}
    vegas = J("draft/backtest/vegas_lines_2021_2026.json")
    prov = J("draft/backtest/sleeper_vs_fp_rows_2025.json")
    priors = {"own_v6": prov["rows"]["own_v6"], "fp": prov["rows"]["fantasypros"],
              "sleeper": prov["rows"]["sleeper"]}
    positions = dict(prov["positions"])
    props = {e["week"]: e["players"]
             for e in J("draft/backtest/historical_props_2025.json")["weeks"]}
    hist = next(s for s in J("draft/data/league_history.json")["seasons"]
                if str(s.get("season")) == str(SEASON))
    scoring_table = J("draft/config/league_config.json")["scoring"]
    names = {str(r["pid"]): r["name"]
             for r in J("draft/backtest/fp_hist_rows.json")["years"]["2025"]["rows"]
             if r.get("pid")}
    for p in J("public/draft_data.json")["players"]:
        names.setdefault(str(p.get("player_id")), p.get("name"))
    return dict(act=act, comp=comp, vegas=vegas, priors=priors, positions=positions,
                props=props, hist=hist, scoring=scoring_table, names=names)


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

def season_prior_arms(priors, tp, implied, byes_w, w):
    """The LIVE formula on each preseason prior, across the live challenger set.
    Reuses price_week so the own_v6 arm IS what own_weekly_v1 would have
    priced — the control below proves it."""
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
        priced = price_week(players, w, implied, DEFAULT_ARMS)
        for arm in DEFAULT_ARMS:
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
        #: any_td is a PROBABILITY, not a line, and has no additive stat — it
        #: is folded in as expected TDs at the player's position: a rush/rec TD
        #: for skill players. Pass TDs already come as their own line.
        pts, _line = implied_points(mp, scoring_table) if mp else (None, {})
        if "any_td" in lines and tp[pid][1] in ("RB", "WR", "TE"):
            td_pts = SCORING.score_stat_line({"rush_td": 1.0}, scoring_table) * float(lines["any_td"])
            pts = (pts or 0.0) + td_pts
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
    D = load()
    rng = random.Random(SEED)
    byes = byes_by_week(D["vegas"])
    slots = slot_counts(D["hist"]["roster_positions"])
    controls = []

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
        arms.update(season_prior_arms(D["priors"], tp, implied, byes_w, w))
        if w >= 2:
            arms.update(realized_arms(D["act"], D["priors"], tp, w))
        p_arm, p_diag = props_arm(D["props"].get(w, {}), D["names"], tp, D["scoring"])
        props_diag[w] = p_diag
        act_w = D["act"][w]

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
    direct = price_week(players, w, implied, DEFAULT_ARMS)["means"]["v1"]
    controls.append({"id": "K1", "what": "own_v6:v1 reproduces price_week byte-for-byte (week 3)",
                     "ok": direct == a, "n": len(a)})
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
    bar_vs_priors = meets_cory_bar(ss_full, "own_v6:v1", ["fp:v1", "sleeper:v1"])
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
                          {VEGAS_TO_STATS.get(t, t) for t in byes[w]}, w))
            if w >= 2:
                arms_w.update(realized_arms(D["act"], D["priors"], tpw, w))
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

    doc = {
        "_territory": "TERRITORY: A — produced by draft/backtest/weekly_arms_2025_backtest.py",
        "_what": "The live weekly formula and its challenger set, plus naive and props arms, "
                 "run over all of 2025 with strictly-prior inputs; graded on MAE, on Cory's "
                 "pairwise start/sit bar, and on the lineup Cory would actually have started.",
        "_limits": [
            "NO weekly provider projections exist for 2025 — the 'providers' in the bar are "
            "FantasyPros' and Sleeper's PRESEASON priors run through the same formula. The "
            "live 2026 bar compares against their WEEKLY numbers, which is a harder test.",
            "The outcome grade fixes K and DEF to what Cory actually started; no arm prices them.",
            "Props lines are the historical API's snapshot, not a verified pre-kickoff close; "
            "treated as knowable before kickoff.",
            "own_v6's 2025 prior is a walk-forward rebuild (510 players), not a frozen "
            "preseason artifact — the closest thing to proj_ownmodel-2025 that exists.",
        ],
        "season": SEASON, "weeks": WEEKS, "seed": SEED, "k_null": K_NULL,
        "controls": controls,
        "pooled_mae": pooled,
        "start_sit": {"full_population": ss_full,
                      "cory_bar_own_v6_v1_vs_preseason_priors": bar_vs_priors,
                      "props_shared": ss_props},
        "outcome_cory_2025": outcome_pooled,
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
    print("\n  START/SIT pairwise accuracy (Cory's frozen metric), pooled 2025")
    for name in sorted(arm_names, key=lambda k: -(sum((ss_full['sources'][k][q]['accuracy'] or 0) for q in POSITIONS))):
        cells = ss_full["sources"][name]
        print(f"   {name:<20} " + "  ".join(f"{q} {cells[q]['accuracy']}" for q in POSITIONS))
    print(f"   props (shared pop with own_v6:v1): "
          + "  ".join(f"{q} own {ss_props['sources']['own_v6:v1'][q]['accuracy']} / props {ss_props['sources']['props'][q]['accuracy']}" for q in POSITIONS))
    print(f"\n  CORY'S BAR, own_v6:v1 vs the two PRESEASON priors: {bar_vs_priors['positions_beating_both']} of 4 positions"
          f" — bar_met={bar_vs_priors['bar_met']}  (weaker comparator than the live bar; see _limits)")
    print("\n  THE UNIT THAT PAYS — Cory's ACTUAL 2025 roster, best lineup by each arm vs what he started")
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
    b = doc["nulls"]["best_of_k_outcome"]
    print(f"\n  NULLS  shuffle worse than real on every arm: {doc['nulls']['shuffle_worse_on_every_arm']}")
    print(f"         best-of-K (random legal lineups): best arm {b['best_arm']} season {b['season_delta']:+.1f} sits at "
          f"percentile {b['best_arm_percentile_among_random']:.2f} of {K_NULL} random lineups "
          f"[p05 {b['random_lineup_deltas_p05']:+.1f}, p50 {b['random_lineup_deltas_p50']:+.1f}, p95 {b['random_lineup_deltas_p95']:+.1f}]")
    print(f"\n  wrote {OUT.relative_to(ROOT)}")
    return 0 if all(c["ok"] for c in controls) else 1


if __name__ == "__main__":
    raise SystemExit(main())
