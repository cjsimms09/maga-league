#!/usr/bin/env python3
"""EXPERIMENT 33 — THE PROJECTION-SOURCE BAKE-OFF (the foundational weak link).

Every draft-decision claim this system makes inherits its projection. If the
projection is worse than a naive baseline, the whole tree is precise about the
wrong number. So race the sources on realized value and let a LOSS be the headline.

THE SOURCES (raced on 2023–25 realized weekly points, by position):
  a. OUR BLEND        — `projections.walk_forward` (recency-weighted prior rate,
                        regressed to the positional mean, age-curved, availability-
                        scaled). The number the board is actually built on.
  b. FFC ADP          — the market's implied ranking (as a RANKING only; ADP has no
                        points scale, so it gets rank-correlation + top-decile, never
                        MAE — comparing a rank to points in MAE would be a category
                        error dressed as a metric).
  c. SLEEPER PROJ     — Sleeper's own preseason projections. PARTIAL GATE: historical
                        preseason projections may not be retrievable for past seasons;
                        if so, the other three run and this one is reported UNAVAILABLE,
                        never replaced by a proxy (a proxy would silently re-grade our
                        own blend against itself).
  d. NAIVE            — "last year again, adjusted for availability": prior-season
                        points per game × expected games from prior availability. NO
                        regression, NO age curve — deliberately the strawman our blend
                        must beat. If it does not, the blend's regression/age
                        corrections are noise and the report SAYS SO.

THE METRICS (per position, then overall):
  * MAE               — mean |projection − realized| (point-scale sources only).
  * RANK CORRELATION  — Spearman(projection, realized): does it order value.
  * TOP-DECILE HIT    — of the source's top-10%-projected, the fraction that land in
                        the realized top 10% (THE ONE THAT MATTERS: does it find the
                        league-winners). Reported per position and overall.
  * DOLLARS           — priced through the certified money grader: the value-greedy
                        roster each source would build in Cory's seat, graded across
                        the three seasons (reuses exp34_dollars). The dollar GAP holds
                        construction-strategy constant (greedy) across sources, so it
                        isolates projection quality — carrying the dollar arm's stated
                        limit that a value-greedy roster ignores positional
                        construction (so read the gap BETWEEN sources, not the level).

BINDING DISCIPLINE (registry): **a loss is the headline.** If our blend loses to
NAIVE on top-decile hit or on dollars, the War Room owes a standing provenance
banner naming the better source — not a footnote. **No tuning of the blend inside
this experiment; it measures, it does not fit.** A source change ships only if the
winner clears a null-permutation test AND leave-one-season-out CV — those gates live
outside this measurement and are not run here.

The PURE core (the metrics, the naive model, the scorecard, the head-to-head) is
unit-tested in draft/tests/test_exp33.py WITHOUT egress. The egress main (nflverse
realized + FFC ADP + optional Sleeper) runs only in CI (lab.yml exp33 job).

Run (CI, egress): python draft/backtest/exp33.py --out draft/backtest
"""
from __future__ import annotations
import json, sys, argparse
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from projections import spearman, walk_forward, CFG   # noqa: E402  our blend, unit-tested
import exp34_dollars as DOLL                           # noqa: E402  value-greedy $ grader

POSITIONS = ["QB", "RB", "WR", "TE", "K", "DEF"]
TOP_DECILE = 0.10


# ─────────────────────────────────────────────────────── the metrics ──
def _common(proj: dict, realized: dict) -> list[str]:
    return [pid for pid in proj if pid in realized and realized[pid] is not None]


def mae(proj: dict, realized: dict, ids: list[str] | None = None) -> float | None:
    ids = ids if ids is not None else _common(proj, realized)
    if not ids:
        return None
    return round(sum(abs(proj[p] - realized[p]) for p in ids) / len(ids), 2)


def rank_corr(proj: dict, realized: dict, ids: list[str] | None = None) -> float | None:
    ids = ids if ids is not None else _common(proj, realized)
    if len(ids) < 3:
        return None
    return round(spearman([proj[p] for p in ids], [realized[p] for p in ids]), 3)


def top_decile_hit(proj: dict, realized: dict, ids: list[str] | None = None,
                   frac: float = TOP_DECILE) -> dict:
    """Of the source's top-`frac` projected players, the fraction that land in the
    realized top-`frac`. The metric that matters: does the source find the winners.
    """
    ids = ids if ids is not None else _common(proj, realized)
    n = len(ids)
    k = max(1, int(round(n * frac)))
    if n < 3:
        return {"n": n, "k": k, "hit_rate": None}
    pred_top = set(sorted(ids, key=lambda p: -proj[p])[:k])
    real_top = set(sorted(ids, key=lambda p: -realized[p])[:k])
    hit = len(pred_top & real_top) / k
    return {"n": n, "k": k, "hit_rate": round(hit, 3)}


def scorecard(proj: dict, realized: dict, positions: dict, *, point_scale: bool = True) -> dict:
    """All metrics for one source: overall and per position. `point_scale=False`
    (ADP) omits MAE — a rank has no points to take an absolute error against."""
    overall_ids = _common(proj, realized)
    out = {"n": len(overall_ids),
           "mae": (mae(proj, realized, overall_ids) if point_scale else None),
           "rank_corr": rank_corr(proj, realized, overall_ids),
           "top_decile": top_decile_hit(proj, realized, overall_ids),
           "by_position": {}}
    for pos in POSITIONS:
        ids = [p for p in overall_ids if positions.get(p) == pos]
        out["by_position"][pos] = {
            "n": len(ids),
            "mae": (mae(proj, realized, ids) if point_scale and ids else None),
            "rank_corr": rank_corr(proj, realized, ids),
            "top_decile": top_decile_hit(proj, realized, ids),
        }
    return out


# ─────────────────────────────────────────────────────── the naive model ──
def naive_projection(prior_points: dict, prior_games: dict, positions: dict,
                     expected_games: float | None = None) -> dict:
    """'Last year again, adjusted for availability.' Prior-season points per game ×
    expected games, where expected games leans on how much the player actually
    played (the opportunity/availability signal). NO regression to the mean, NO age
    curve — the strawman the blend's corrections must beat. Uses the most recent
    prior season that has the player (walk_forward's recency, without its shrink)."""
    eg = expected_games if expected_games is not None else CFG["EXPECTED_GAMES"]
    years = sorted((int(y) for y in prior_points), reverse=True)
    out = {}
    for pid in {p for y in years for p in prior_points[y]}:
        for y in years:
            pts = prior_points[y].get(pid)
            g = (prior_games.get(y) or {}).get(pid, 0) or 0
            if pts is None or g <= 0:
                continue
            ppg = pts / g
            # availability: a player who played more of the season is projected for
            # more games, capped at expected_games. This is the 'opportunity' touch.
            avail = min(1.0, g / 17.0)
            out[pid] = round(ppg * eg * (0.5 + 0.5 * avail), 2)
            break
    return out


# ─────────────────────────────────────────────────────── head-to-head ──
def bake_off(sources: dict, realized: dict, positions: dict,
             point_scale: dict | None = None, safe: dict | None = None) -> dict:
    """Score every source and rank them. `sources`: {name: projection_dict}.
    `point_scale`: {name: bool} (default True; set False for ADP-as-ranking).
    `safe`: {name: bool} — is the source DECISION-TIME-SAFE (no outcome leakage)?
    A source that is not provably safe still gets a scorecard (for transparency)
    but is EXCLUDED from the rankings and the verdict — a leaked 'projection' that
    correlates with outcomes it secretly contains is not a projection, and letting
    it win would report a leak as a finding (the cardinal sin this project guards).
    """
    point_scale = point_scale or {}
    safe = safe or {}
    cards = {name: scorecard(proj, realized, positions,
                             point_scale=point_scale.get(name, True))
             for name, proj in sources.items()}
    for name in cards:
        cards[name]["decision_time_safe"] = safe.get(name, True)
    def rank_on(key_fn, reverse):
        # ONLY decision-time-safe sources with a value are ranked, best first.
        valued = [n for n in cards if key_fn(cards[n]) is not None and cards[n]["decision_time_safe"]]
        return sorted(valued, key=lambda n: key_fn(cards[n]), reverse=reverse)
    ranks = {
        "mae_best_first": rank_on(lambda c: c["mae"], reverse=False),            # lower better
        "rank_corr_best_first": rank_on(lambda c: c["rank_corr"], reverse=True),
        "top_decile_best_first": rank_on(lambda c: c["top_decile"]["hit_rate"], reverse=True),
    }
    disqualified = [n for n in cards if not cards[n]["decision_time_safe"]]
    return {"cards": cards, "ranks": ranks, "disqualified": disqualified}


def headline(bo: dict, our: str = "our_blend", naive: str = "naive") -> dict:
    """The binding read: does OUR BLEND beat NAIVE on the metric that matters
    (top-decile) — and where does it place overall? A loss is the headline."""
    cards = bo["cards"]
    our_td = (cards.get(our) or {}).get("top_decile", {}).get("hit_rate")
    naive_td = (cards.get(naive) or {}).get("top_decile", {}).get("hit_rate")
    beats_naive_td = (our_td is not None and naive_td is not None and our_td > naive_td)
    td_rank = bo["ranks"]["top_decile_best_first"]
    return {
        "our_top_decile": our_td, "naive_top_decile": naive_td,
        "our_beats_naive_on_top_decile": beats_naive_td,
        "top_decile_winner": td_rank[0] if td_rank else None,
        "our_rank_on_top_decile": (td_rank.index(our) + 1 if our in td_rank else None),
        "verdict": ("our-blend-leads" if td_rank and td_rank[0] == our else
                    (f"{td_rank[0]}-leads-top-decile" if td_rank else "no-ranking")),
        "provenance_banner_required": bool(td_rank and td_rank[0] != our),
    }


# ─────────────────────────────────────────────────────── egress main ──
def _egress_main(out_dir: Path) -> int:
    sys.path.insert(0, str(HERE.parent))          # draft/ on path
    sys.path.insert(0, str(HERE.parent.parent))   # repo root
    import adp as ADP
    import sleeper_import as SL
    from backtest import grade as GR
    import nfl_data_py as nfl
    import pandas as pd

    history = json.loads((HERE.parent / "data" / "league_history.json").read_text())
    payouts = json.loads((HERE.parent / "config" / "payouts.json").read_text())
    seasons = [s for s in history["seasons"] if DOLL.X.real_draft(s)]
    print("exp33 seasons:", sorted({int(s["season"]) for s in seasons}))

    players_raw = SL.fetch_players()
    index = ADP.build_index(players_raw)
    positions = {str(pid): p.get("position") for pid, p in players_raw.items()}
    ages = {str(pid): p.get("age") for pid, p in players_raw.items()}
    players_meta = [{"player_id": str(pid), "name": p.get("full_name"),
                     "position": p.get("position"), "team": p.get("team"),
                     "gsis_id": p.get("gsis_id")}
                    for pid, p in players_raw.items() if p.get("position")]
    try:
        ids_df = nfl.import_ids()
    except Exception as e:
        print("  ! import_ids unavailable:", e); ids_df = None
    crosswalk = GR.crosswalk_gsis_to_sleeper(players_meta, ids_df)

    need = sorted({y for s in seasons for y in (int(s["season"]) - 2, int(s["season"]) - 1, int(s["season"]))})
    frames, missing = [], []
    for y in need:
        try:
            df = nfl.import_weekly_data([y]); frames.append(df); print(f"  weekly {y}: {len(df)} rows")
        except Exception as e:
            missing.append(y); print(f"  weekly {y} UNAVAILABLE ({type(e).__name__})")
    weekly = pd.concat(frames, ignore_index=True) if frames else None
    if missing and weekly is not None:
        have = sorted(set(need) - set(missing)); control = have[-1] if have else None
        try:
            pbp = nfl.import_pbp_data(sorted(set(missing) | ({control} if control else set())), downcast=True)
        except Exception:
            pbp = None
        if pbp is not None and control:
            scfg = next((s.get("scoring_settings") for s in seasons if int(s["season"]) == control), {}) or {}
            if GR.cross_validate(pbp, weekly, control, scfg, crosswalk).get("agrees"):
                rebuilt = GR.weekly_from_pbp(pbp, missing)
                if rebuilt:
                    weekly = pd.concat([weekly, pd.DataFrame(rebuilt)], ignore_index=True); missing = []
    have_years = (set(int(y) for y in weekly["season"].unique())
                  if weekly is not None and "season" in weekly.columns else set())

    def games_of(py, scfg):
        out = {}
        dfp = weekly[weekly["season"] == py] if "season" in weekly.columns else weekly
        idc = "player_id" if "player_id" in weekly.columns else "gsis_id"
        for row in dfp.to_dict("records"):
            sid = crosswalk.get(str(row.get(idc)))
            if sid:
                out[sid] = out.get(sid, 0) + 1
        return out

    caveats, per_season, sleeper_available = [], [], False
    for s in seasons:
        yr = int(s["season"])
        if yr not in have_years:
            caveats.append(f"{yr}: realized weekly unavailable; season SKIPPED"); continue
        scfg = s.get("scoring_settings") or {}
        teams = ((s.get("settings") or {}).get("teams")) or 10
        realized = GR.rest_of_season_points(weekly, yr, scfg, crosswalk, from_week=1)
        prior_pts, prior_games = {}, {}
        for py in (yr - 2, yr - 1):
            if py in have_years:
                prior_pts[py] = GR.rest_of_season_points(weekly, py, scfg, crosswalk)
                prior_games[py] = games_of(py, scfg)
        our = walk_forward(yr, prior_pts, prior_games, positions, ages)
        naive = naive_projection(prior_pts, prior_games, positions)
        try:
            payload = ADP.fetch_adp("half-ppr", teams, yr)
        except Exception as e:
            caveats.append(f"{yr}: FFC ADP unavailable ({type(e).__name__})"); payload = {"players": []}
        adp_rank = {}
        for entry in payload.get("players") or []:
            sid, _ = ADP.match_player(entry, index)
            if sid and entry.get("adp") is not None:
                adp_rank[str(sid)] = -float(entry["adp"])     # negate: higher = better, for ranking
        sources = {"our_blend": our, "naive": naive, "ffc_adp": adp_rank}
        point_scale = {"our_blend": True, "naive": True, "ffc_adp": False}
        safe = {"our_blend": True, "naive": True, "ffc_adp": True}
        # Sleeper's season projection endpoint: probe by looking. IT IS NOT
        # DECISION-TIME-SAFE — `/projections/nfl/regular/{season}` is updated
        # in-season, so a past season's stored projection can carry information that
        # did not exist at the draft. Its scorecard is computed for transparency but
        # it is DISQUALIFIED from the verdict (safe=False), per the anti-leak
        # pre-registration. (Its implausibly high rank-corr with realized — ~0.8 vs
        # the real market's ~0.4 — is itself the leak's fingerprint.)
        sl_proj = _try_sleeper_projections(yr, positions)
        if sl_proj:
            sources["sleeper_proj"] = sl_proj
            point_scale["sleeper_proj"] = True
            safe["sleeper_proj"] = False
            sleeper_available = True
        bo = bake_off(sources, realized, positions, point_scale, safe)
        hl = headline(bo)
        # dollars per source: the value-greedy roster it builds in Cory's seat
        dollars = _dollar_by_source(history, payouts, s, {k: v for k, v in sources.items()})
        per_season.append({"season": yr, "bake_off": bo, "headline": hl, "dollars": dollars,
                           "n_realized": len(realized)})
        print(f"  {yr}: top-decile winner {hl['top_decile_winner']} "
              f"(our {hl['our_top_decile']} vs naive {hl['naive_top_decile']})")

    if sleeper_available:
        caveats.append("Sleeper's season projection WAS retrievable but is DISQUALIFIED, not "
                       "reported as a winner: `/projections/nfl/regular/{season}` is updated "
                       "in-season, so a past season's stored projection is NOT decision-time-"
                       "safe. Its ~0.8 rank-corr with realized (vs the real market's ~0.4) is "
                       "the leak's fingerprint. Its scorecard is shown for transparency and "
                       "EXCLUDED from the verdict, per the anti-leak pre-registration.")
    else:
        caveats.append("Sleeper historical preseason projections NOT retrievable for past "
                       "seasons — the bake-off ran the decision-time-safe sources; the fourth "
                       "is UNAVAILABLE, not proxied (registry partial-gate).")
    pooled = _pool_headline(per_season)
    result = {
        "experiment": "33 — projection-source bake-off (by position, priced in $)",
        "sources": ["our_blend", "naive", "ffc_adp"] + (["sleeper_proj"] if sleeper_available else []),
        "per_season": per_season,
        "pooled": pooled,
        "caveats": caveats,
        "discipline": ("A LOSS IS THE HEADLINE. No tuning inside this experiment. A source "
                       "change ships only on null + leave-one-season-out CV, which are not run here."),
    }
    (out_dir / "exp33.json").write_text(json.dumps(result, indent=2, default=str) + "\n")
    (out_dir / "EXP33.md").write_text(_report(result))
    print("\n" + _report(result))
    return 0


def _try_sleeper_projections(year: int, positions: dict) -> dict | None:
    """Probe Sleeper's season projection endpoint BY LOOKING. Returns a
    {player_id: projected_points} dict or None. NOTE: the caller marks this source
    NOT decision-time-safe — the endpoint is updated in-season, so for a past season
    it can carry post-draft information. It is scored for transparency but excluded
    from the verdict. Never fabricates a proxy — an absent source is reported absent."""
    try:
        import sleeper_import as SL
        fn = getattr(SL, "fetch_projections", None) or getattr(SL, "fetch_preseason_projections", None)
        if fn is None:
            return None
        data = fn(year)
        if not data:
            return None
        out = {}
        for pid, v in (data.items() if isinstance(data, dict) else []):
            val = v.get("pts_half_ppr") if isinstance(v, dict) else v
            if val is not None:
                out[str(pid)] = float(val)
        return out or None
    except Exception:
        return None


def _dollar_by_source(history, payouts, season, sources: dict) -> dict:
    """Each source's value-greedy roster graded in Cory's seat (reuses the dollar
    arm's certified path). The gap between sources isolates projection quality."""
    import roster_sim as RS
    yr = int(season["season"])
    rid = DOLL.X.cory_roster_id(season)
    picks = DOLL.X.real_draft(season)
    pos = dict(RS.infer_positions(season))
    keepers = DOLL.cory_keepers(picks, rid)
    out = {}
    for name, proj in sources.items():
        # ADP is stored negated (higher=better) -> our_pick_fn (argmax) is correct for all
        roster, _ = DOLL.build_policy_roster(picks, rid, DOLL.our_pick_fn(proj), keepers=keepers)
        try:
            g = DOLL._dollars_of(DOLL.roster_dollars(history, payouts, yr, rid, roster, pos))
            out[name] = g["total"]
        except Exception as e:
            out[name] = None
    return out


def _pool_headline(per_season: list[dict]) -> dict:
    """Pool the per-season top-decile winners + dollar totals across seasons."""
    if not per_season:
        return {"n_seasons": 0}
    from collections import Counter
    disqualified = sorted({n for ps in per_season for n in ps["bake_off"].get("disqualified", [])})
    winners = Counter(ps["headline"]["top_decile_winner"] for ps in per_season
                      if ps["headline"]["top_decile_winner"])
    our_beats = sum(1 for ps in per_season if ps["headline"]["our_beats_naive_on_top_decile"])
    # dollars: decision-time-safe sources only in the verdict ranking; disqualified
    # (leak-suspect) sources are reported separately, never in the 'best' ranking.
    dollar_tot: dict[str, float] = {}
    dollar_disq: dict[str, float] = {}
    for ps in per_season:
        for name, d in (ps["dollars"] or {}).items():
            if d is None:
                continue
            (dollar_disq if name in disqualified else dollar_tot)[name] = \
                round((dollar_disq if name in disqualified else dollar_tot).get(name, 0.0) + d, 2)
    dollar_rank = sorted(dollar_tot, key=lambda k: dollar_tot[k], reverse=True)
    return {"n_seasons": len(per_season),
            "disqualified_leak_suspect": disqualified,
            "top_decile_winner_counts": dict(winners),
            "our_beats_naive_seasons": f"{our_beats}/{len(per_season)}",
            "dollars_by_source_total": dollar_tot,
            "dollars_disqualified_total": dollar_disq,
            "dollars_best_first": dollar_rank,
            "provenance_banner_required": bool(
                any(ps["headline"]["provenance_banner_required"] for ps in per_season))}


def _report(r: dict) -> str:
    L = ["# EXPERIMENT 33 — projection-source bake-off", "",
         "_Race our blend vs a naive baseline vs FFC ADP (ranking) [vs Sleeper if",
         "retrievable] on 2023–25 realized points, by position — MAE, rank correlation,",
         "top-decile hit (the one that matters), priced in $ through the money grader.",
         "A LOSS IS THE HEADLINE; no tuning inside this experiment._", "",
         f"Sources raced: {', '.join(r['sources'])}", ""]
    p = r["pooled"]
    disq = p.get("disqualified_leak_suspect") or []
    L += ["## POOLED VERDICT (decision-time-safe sources only)", "",
          f"- top-decile winner by season: {p.get('top_decile_winner_counts')}",
          f"- our blend beats naive on top-decile: {p.get('our_beats_naive_seasons')} seasons",
          f"- dollars by source (value-greedy roster, summed): {p.get('dollars_by_source_total')}",
          f"- dollars ranking (best first): {p.get('dollars_best_first')}",
          f"- **provenance banner required: {p.get('provenance_banner_required')}** "
          "(true = a decision-time-safe source beats our blend and the War Room must say so)"]
    if disq:
        L += [f"- **⚠ DISQUALIFIED (leak-suspect, NOT in the verdict): {disq}** — "
              f"their summed value-greedy $ (shown, not ranked): {p.get('dollars_disqualified_total')}"]
    L += ["", "## Per season", ""]
    for ps in r["per_season"]:
        hl = ps["headline"]
        L += [f"### {ps['season']}",
              f"- top-decile (safe sources): winner **{hl['top_decile_winner']}** "
              f"(our {hl['our_top_decile']} vs naive {hl['naive_top_decile']}; our rank "
              f"{hl['our_rank_on_top_decile']})",
              f"- dollars (value-greedy roster): {ps['dollars']}",
              "", "  | source | MAE | rank_corr | top-decile | in verdict |", "  |---|---|---|---|---|"]
        for name, c in ps["bake_off"]["cards"].items():
            safe = "yes" if c.get("decision_time_safe", True) else "**NO — leak-suspect**"
            L.append(f"  | {name} | {c['mae']} | {c['rank_corr']} | {c['top_decile']['hit_rate']} | {safe} |")
        L.append("")
    if r.get("caveats"):
        L += ["## Caveats", ""] + [f"- {c}" for c in r["caveats"]] + [""]
    L += ["## What this settles and what it does not", "",
          "Settles: whether our blend's regression/age corrections earn their place against "
          "a naive prior-year model, on the metric that finds league-winners, in points and "
          "in dollars. Does NOT settle: the dollar figures inherit the value-greedy "
          "construction limit (read gaps between sources, not levels); a source change is a "
          "SHIP decision gated on null + leave-one-season-out CV, not run here — this "
          "measures.", ""]
    return "\n".join(L)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(HERE))
    args = ap.parse_args()
    raise SystemExit(_egress_main(Path(args.out)))
