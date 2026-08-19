#!/usr/bin/env python3
"""KEEPER DECISION WITH NABERS — does a slate including Malik Nabers beat Chase/Henry/Walker?

Cory is second-guessing the settled slate (keeper lock Aug 21). He has Nabers on his
roster; Nabers would replace Henry or Walker. Two questions, and they can disagree:

  (A) RAW SURPLUS — flat-cost keeper model (league_config: cost_model top_picks_flat,
      count 3). Keeping k players forfeits your first k picks; surplus of a slate =
      sum(keeper VORP) - sum(round_cost_vorp[:k]). Deterministic off the board.

  (B) THE BEST *DRAFT* — the slate that produces the best ROSTER, not the highest
      standalone value. Nabers is a WR: keeping him instead of an RB leaves Cory
      RB-light (1 RB + 2 WR), which (1) changes the keeper-need mask the whole draft
      rule is conditioned on, and (2) forces RB from the draft into the mid-round RB
      DEAD ZONE (exp25/exp43: the worst allocation on the board). So a Nabers slate
      can be worse than its surplus says. Priced here via the certified paired MC room
      (CC.load_world / draft_room / grade_room) under the LIVE keeper-need rule
      (value-depth / startable-cap — the shipped needrule), paired vs the current slate.

THE BIAS FLAG (Cory, pre-registered): the model may systematically undervalue short/
interrupted-history players (rookie/2nd-year/post-injury); Nabers is a 2nd-year WR.
So the number driving (A)/(B) — Nabers VORP 20 from proj_mean 199.6 — is exactly the
number under suspicion. We (i) report the BREAKEVEN Nabers VORP that would flip the
answer, (ii) the MARKET-IMPLIED VORP (from his ADP rank) so we can see whether even
trusting the market over our model changes it, and (iii) a cross-sectional
model-vs-market experience-bias probe. The realized-outcome and BBM-at-scale versions
of the bias test need the Lab and are specced in the report, not faked here.

Run: python draft/backtest/exp_keeper_nabers.py  ->  EXP-KEEPER-NABERS.{md,json}
Pure surplus/bias core unit-tested in draft/tests/test_keeper_nabers.py.
"""
from __future__ import annotations
import itertools
import json
import random
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import cory_conditional as CC          # noqa: E402  certified seat + keepers + grader
import exp_keeper_b0 as B0             # noqa: E402  the live keeper-need rule choosers

SEED = CC.SEED
ROUND_COST_VORP = [103.91, 62.08, 36.2]     # VORP of the first k picks forfeited (board/predicted_keepers)

# The four candidates, with board-consistent VORP (proj_mean - replacement[pos]).
# Pulled once in build_candidates() so the test can inject a fixture instead.
CANDIDATE_IDS = {"Chase": "7564", "Henry": "3198", "Walker": "8151", "Nabers": "11632"}
CURRENT_SLATE = ("Chase", "Henry", "Walker")


# ----------------------------------------------------------------------------- data
def build_candidates(board):
    rep = (board.get("replacement") or {}).get("replacement_points") or {}
    kept = {str(k["player_id"]): k for k in board.get("kept_players", [])}
    pool = {str(p["player_id"]): p for p in board.get("players", [])}
    out = {}
    for nm, pid in CANDIDATE_IDS.items():
        p = kept.get(pid) or pool.get(pid)
        if not p:
            raise SystemExit(f"candidate {nm} ({pid}) not on the board")
        pos = p["position"]
        pm = p.get("proj_mean") or 0.0
        out[nm] = {
            "player_id": pid, "name": p.get("name") or nm, "position": pos,
            "proj_mean": pm, "vorp": round(pm - (rep.get(pos) or 0.0), 2),
            "proj_ceiling": p.get("proj_ceiling") or pm,
            "weekly_sd": p.get("weekly_sd") or 8.0,
            "adp": p.get("adjusted_adp") or p.get("raw_adp") or p.get("adp") or 999.0,
            "years_exp": p.get("years_exp"),
            "cost_round": p.get("cost_round"), "original_round": p.get("original_round"),
            "games_expected": p.get("games_expected"), "injury_status": p.get("injury_status"),
        }
    return out


# ----------------------------------------------------------------------------- (A) surplus
def slate_surplus(vorps):
    """vorps: list of keeper VORP for a slate of size k. Flat cost = first k picks."""
    k = len(vorps)
    cost = sum(ROUND_COST_VORP[:k])
    return round(sum(vorps) - cost, 2), round(cost, 2)


def all_slates(cand):
    """Every keeper option: keep 0..3 of the four candidates. Returns rows sorted by surplus."""
    names = list(cand)
    rows = []
    for k in range(0, 4):
        for combo in itertools.combinations(names, k):
            vorps = [cand[n]["vorp"] for n in combo]
            surplus, cost = slate_surplus(vorps)
            rows.append({"slate": list(combo), "k": k,
                         "keeper_vorp": round(sum(vorps), 2), "cost_vorp": cost,
                         "surplus": surplus,
                         "has_nabers": "Nabers" in combo,
                         "rb_kept": sum(1 for n in combo if cand[n]["position"] == "RB"),
                         "wr_kept": sum(1 for n in combo if cand[n]["position"] == "WR")})
    rows.sort(key=lambda r: -r["surplus"])
    return rows


def nabers_breakevens(cand):
    """The Nabers VORP at which a Nabers slate ties the current slate. Since cost is flat
    (first k picks, player-independent), keeping the 3 highest-VORP players is optimal, so
    Nabers only enters a keep-3 slate by DISPLACING the weaker of Henry/Walker. Breakeven
    to displace X = VORP(X): Nabers must out-VORP the man he replaces."""
    return {"displace_Walker": cand["Walker"]["vorp"],
            "displace_Henry": cand["Henry"]["vorp"],
            "current_nabers_vorp": cand["Nabers"]["vorp"]}


def market_implied_vorp(board, pid):
    """The VORP a player at THIS player's ADP RANK would have if our VORP ordering
    matched the market's ADP ordering — i.e. take the VORP at rank = his ADP rank.
    Lets us ask: even trusting the market over our model, does the answer change?"""
    pool = [p for p in board.get("players", []) if (p.get("proj_mean") or 0) > 0]

    def adp(p):
        return p.get("adjusted_adp") or p.get("raw_adp") or p.get("adp") or 9999.0
    by_adp = sorted(pool, key=adp)
    adp_rank = {str(p["player_id"]): i + 1 for i, p in enumerate(by_adp)}
    vorp_sorted = sorted((p.get("vorp") or 0.0 for p in pool), reverse=True)
    r = adp_rank.get(str(pid))
    if not r or r > len(vorp_sorted):
        return None, r
    return round(vorp_sorted[r - 1], 2), r


# ----------------------------------------------------------------------------- (B) the draft
def _pool_for_slate(base_pool, cand, slate):
    """Draftable pool for a keeper slate: remove the kept candidates, add back the
    NON-kept candidates (they're in the draft now). base_pool is CC.load_world()'s pool
    (Nabers draftable, Chase/Henry/Walker already removed as this-season keepers)."""
    kept_ids = {cand[n]["player_id"] for n in slate}
    pool = [p for p in base_pool if p["player_id"] not in kept_ids]
    present = {p["player_id"] for p in pool}
    for n, c in cand.items():
        if n not in slate and c["player_id"] not in present:
            pool.append({"player_id": c["player_id"], "name": c["name"],
                         "position": c["position"], "vorp": c["vorp"],
                         "proj_mean": c["proj_mean"], "proj_ceiling": c["proj_ceiling"],
                         "weekly_sd": c["weekly_sd"], "team": "NA", "adp": c["adp"]})
    return pool


def _keepers_for_slate(cand, slate):
    return [{"player_id": cand[n]["player_id"], "name": cand[n]["name"],
             "position": cand[n]["position"], "vorp": cand[n]["vorp"],
             "proj_mean": cand[n]["proj_mean"],
             "proj_ceiling": cand[n]["proj_ceiling"], "weekly_sd": cand[n]["weekly_sd"]}
            for n in slate]


def _counts(roster):
    c = {}
    for p in roster:
        c[p["position"]] = c.get(p["position"], 0) + 1
    return c


def race_slates(slates, cand, base_pool, opp_keepers, my_picks, n_rooms, seed,
                rule="value_depth"):
    """Grade each slate's FULL DRAFT under the live keeper-need rule, paired room-for-room
    and week-for-week so deltas isolate the keeper choice. Also records the mechanism:
    how many RB Cory must draft and the mean VORP of the RBs he ends with (the dead-zone
    tax on an RB-light slate)."""
    chooser = B0.candidates()[rule]
    totals = {tuple(s): [] for s in slates}
    rb_drafted = {tuple(s): [] for s in slates}
    rb_draft_vorp = {tuple(s): [] for s in slates}
    comp = {tuple(s): [] for s in slates}
    for i in range(n_rooms):
        opp_state = random.Random(seed + i).getstate()
        grade_state = random.Random(seed * 7 + i).getstate()
        for s in slates:
            key = tuple(s)
            pool = _pool_for_slate(base_pool, cand, s)
            keepers = _keepers_for_slate(cand, s)
            r = random.Random(); r.setstate(opp_state)      # SAME room every slate
            rosters = CC.draft_room(pool, keepers, opp_keepers, my_picks, chooser, r)
            g = random.Random(); g.setstate(grade_state)    # SAME weekly luck every slate
            totals[key].append(CC.grade_room(rosters, g)["total"])
            kept_ids = {k["player_id"] for k in keepers}
            drafted = [p for p in rosters[0] if p["player_id"] not in kept_ids]
            rbs = [p for p in drafted if p["position"] == "RB"]
            rb_drafted[key].append(len(rbs))
            rb_draft_vorp[key].append(round(sum(p.get("vorp", 0) for p in rbs) / len(rbs), 1) if rbs else 0.0)
            comp[key].append(_counts(rosters[0]))
    return totals, rb_drafted, rb_draft_vorp, comp


def _mean(xs):
    return sum(xs) / len(xs) if xs else 0.0


def paired(totals, cand_key, ctrl_key, seed=SEED):
    d = [a - b for a, b in zip(totals[cand_key], totals[ctrl_key])]
    lo, hi = CC.bootstrap_ci(d, random.Random(seed + 5))
    return {"mean": round(_mean(d), 2), "ci95": [round(lo, 2), round(hi, 2)], "beats": bool(lo > 0)}


# ----------------------------------------------------------------------------- bias probe
def experience_bias_probe(board):
    """CROSS-SECTIONAL model-vs-market bias by NFL experience. For every draftable player,
    compare our VORP rank to the market's ADP rank; bucket by years_exp. If young players
    are systematically ranked WORSE by us than by the market (positive rank gap) while
    veterans are ~neutral, that is the model underrating youth RELATIVE TO THE MARKET.

    LIMIT (stated, not hidden): this cannot see a bias the model and market SHARE — that
    needs realized outcomes (test #1 proper) and BBM at scale (test #3), which run in the
    Lab. This is the piece answerable locally today, and it is the one that bears on the
    keeper call, since keeping-vs-drafting is decided against the market."""
    pool = [p for p in board.get("players", []) if (p.get("proj_mean") or 0) > 0
            and p.get("years_exp") is not None]

    def adp(p):
        return p.get("adjusted_adp") or p.get("raw_adp") or p.get("adp") or 9999.0
    by_adp = sorted(pool, key=adp)
    by_vorp = sorted(pool, key=lambda p: -(p.get("vorp") or 0.0))
    adp_rank = {id(p): i + 1 for i, p in enumerate(by_adp)}
    vorp_rank = {id(p): i + 1 for i, p in enumerate(by_vorp)}
    # Only players the market actually drafts (adp rank in the drafted range) — a bias
    # among undraftable players is noise for this decision.
    drafted = [p for p in pool if adp(p) < 900]

    def bucket(ye):
        return "rookie(0)" if ye == 0 else "2nd-yr(1)" if ye == 1 else \
               "3rd-yr(2)" if ye == 2 else "vet(3+)"
    buckets = {}
    for p in drafted:
        b = bucket(p["years_exp"])
        gap = vorp_rank[id(p)] - adp_rank[id(p)]   # + = we rank him lower than the market
        buckets.setdefault(b, []).append(gap)
    order = ["rookie(0)", "2nd-yr(1)", "3rd-yr(2)", "vet(3+)"]
    return {b: {"n": len(buckets.get(b, [])),
                "mean_rank_gap_vorp_minus_adp": round(_mean(buckets.get(b, [])), 1)}
            for b in order if b in buckets}


# ----------------------------------------------------------------------------- main
def main():
    board = json.loads(CC.BOARD.read_text())
    cand = build_candidates(board)
    base_pool, _mk, opp_keepers, my_picks = CC.load_world()

    # (A) surplus
    slates = all_slates(cand)
    breakeven = nabers_breakevens(cand)
    nab_implied, nab_adp_rank = market_implied_vorp(board, CANDIDATE_IDS["Nabers"])

    # (B) the draft — grade the interesting slates in the MC room, paired vs current.
    #   current, and the two single-swap Nabers slates, plus the best keep-2.
    to_race = [list(CURRENT_SLATE),
               ["Chase", "Henry", "Nabers"],     # Nabers displaces Walker
               ["Chase", "Nabers", "Walker"],    # Nabers displaces Henry
               ["Chase", "Henry"]]               # best keep-2 (drop the 3rd)
    N = int(sys.argv[sys.argv.index("--rooms") + 1]) if "--rooms" in sys.argv else 200
    totals, rb_drafted, rb_vorp, comp = race_slates(
        to_race, cand, base_pool, opp_keepers, my_picks, N, SEED)
    ck = tuple(CURRENT_SLATE)
    draft_rows = []
    for s in to_race:
        key = tuple(s)
        avg_comp = {}
        for c in comp[key]:
            for pos, n in c.items():
                avg_comp[pos] = avg_comp.get(pos, 0) + n
        avg_comp = {pos: round(v / len(comp[key]), 1) for pos, v in sorted(avg_comp.items())}
        draft_rows.append({
            "slate": s, "mean_dollars": round(_mean(totals[key]), 2),
            "vs_current": {"mean": 0.0, "ci95": [0.0, 0.0], "beats": False} if key == ck
                          else paired(totals, key, ck),
            "rb_kept": sum(1 for n in s if cand[n]["position"] == "RB"),
            "rb_drafted_mean": round(_mean(rb_drafted[key]), 2),
            "rb_drafted_mean_vorp": round(_mean(rb_vorp[key]), 1),
            "avg_roster_comp": avg_comp,
        })
    draft_rows.sort(key=lambda r: -r["mean_dollars"])

    # (B') sensitivity to predicted opponent keepers — drop opp keepers entirely (upper
    # bound on how much the predicted slate could be moving the answer).
    tot2, _rb2, _v2, _c2 = race_slates(to_race, cand, base_pool, {}, my_picks, max(60, N // 2), SEED + 99)
    sens = {"|".join(s): {"vs_current_no_oppkeepers":
                          ({"mean": 0.0} if tuple(s) == ck else paired(tot2, tuple(s), ck, SEED + 99))}
            for s in to_race}

    bias = experience_bias_probe(board)

    adp_src = ((board.get("provenance") or {}).get("adp") or {}).get("adp_source")
    out = {
        "experiment": "keeper decision with Nabers — surplus + best-draft + bias flag",
        "anchor": adp_src, "mfl_live": adp_src == "mfl",
        "round_cost_vorp": ROUND_COST_VORP,
        "candidates": {n: {"pos": c["position"], "proj_mean": round(c["proj_mean"], 1),
                           "vorp": c["vorp"], "adp": round(c["adp"], 1),
                           "years_exp": c["years_exp"]} for n, c in cand.items()},
        "surplus_ranked": slates,
        "nabers_breakeven_vorp": breakeven,
        "nabers_market_implied_vorp": {"implied_vorp": nab_implied, "adp_rank": nab_adp_rank,
                                       "model_vorp": cand["Nabers"]["vorp"]},
        "draft_mc": {"rooms": N, "rule": "value_depth (live keeper-need)", "rows": draft_rows},
        "opp_keeper_sensitivity": sens,
        "experience_bias_probe": bias,
        "caveats": [
            f"anchor = {adp_src.upper() if adp_src else '?'}; MFL not live yet, so ranked by FFC "
            "(source grade prefers MFL directionally — flagged, not yet wired to the live board)",
            "surplus is flat-cost (top_picks_flat): keeping k forfeits your first k picks",
            "MC dollars are the v1 proxy (proj-normal weeks + weekly-high + regular-season); "
            "rankings travel, absolute $ are harness-dependent",
            "bias probe is model-vs-MARKET cross-sectional; a bias SHARED by model+market "
            "needs realized outcomes (Lab test #1) and BBM at scale (test #3)",
        ],
    }
    (HERE / "exp_keeper_nabers.json").write_text(json.dumps(out, indent=2))
    _write_report(out)
    # console
    print(f"anchor={adp_src} (MFL live: {out['mfl_live']})")
    print("SURPLUS (top):")
    for r in slates[:6]:
        print(f"  {('+'.join(r['slate']) or '(keep none)'):28s} k={r['k']} surplus {r['surplus']:+7.1f}"
              f"  [RB{r['rb_kept']} WR{r['wr_kept']}]")
    print(f"Nabers: model VORP {cand['Nabers']['vorp']}, market-implied VORP {nab_implied} "
          f"(adp rank {nab_adp_rank}); breakeven to keep over Walker = {breakeven['displace_Walker']}, "
          f"over Henry = {breakeven['displace_Henry']}")
    print("DRAFT (E$, paired vs current):")
    for r in draft_rows:
        v = r["vs_current"]
        print(f"  {('+'.join(r['slate'])):28s} ${r['mean_dollars']:8.1f}  vs cur {v['mean']:+7.1f} "
              f"CI[{v['ci95'][0]},{v['ci95'][1]}]  RB kept {r['rb_kept']} drafted {r['rb_drafted_mean']}")
    print("EXPERIENCE BIAS (VORP rank − ADP rank; + = we rank below market):")
    for b, s in bias.items():
        print(f"  {b:12s} n={s['n']:3d}  gap {s['mean_rank_gap_vorp_minus_adp']:+.1f}")
    return 0


def _write_report(out):
    cand = out["candidates"]
    L = ["# KEEPER DECISION WITH NABERS — surplus, best-draft, and the bias flag", "",
         f"_anchor: **{(out['anchor'] or '?').upper()}** (MFL live: {out['mfl_live']}) · "
         f"flat-cost keeper model · {out['draft_mc']['rooms']} paired rooms · live keeper-need rule_", "",
         "## The four candidates (board VORP = proj_mean − replacement)", "",
         "| player | pos | proj | VORP | ADP | exp |", "|---|---|---|---|---|---|"]
    for n in ("Chase", "Henry", "Walker", "Nabers"):
        c = cand[n]
        L.append(f"| {n} | {c['pos']} | {c['proj_mean']} | {c['vorp']} | {c['adp']} | {c['years_exp']} |")
    L += ["", "## (A) Raw surplus — every slate, ranked", "",
          "_surplus = Σ keeper VORP − Σ cost of the first k picks "
          f"({'+'.join(str(x) for x in out['round_cost_vorp'])})_", "",
          "| slate | keep | RB/WR kept | keeper VORP | surplus |", "|---|---|---|---|---|"]
    for r in out["surplus_ranked"]:
        L.append(f"| {('+'.join(r['slate']) or '_(keep none)_')} | {r['k']} | "
                 f"{r['rb_kept']}/{r['wr_kept']} | {r['keeper_vorp']} | **{r['surplus']:+.1f}** |")
    be = out["nabers_breakeven_vorp"]
    mi = out["nabers_market_implied_vorp"]
    L += ["", "## (B) The best *draft* — MC dollars, paired vs the current slate", "",
          "| slate | E[$] | vs current (95% CI) | RB kept | RB drafted (mean, VORP) |",
          "|---|---|---|---|---|"]
    for r in out["draft_mc"]["rows"]:
        v = r["vs_current"]
        vs = "— (control)" if r["slate"] == ["Chase", "Henry", "Walker"] else \
             f"{v['mean']:+.1f} [{v['ci95'][0]}, {v['ci95'][1]}]"
        L.append(f"| {'+'.join(r['slate'])} | {r['mean_dollars']:.0f} | {vs} | {r['rb_kept']} "
                 f"| {r['rb_drafted_mean']} @ {r['rb_drafted_mean_vorp']} |")
    L += ["", "## The bias flag (Cory's hypothesis, applied to THIS decision)", "",
          f"- Nabers model VORP **{mi['model_vorp']}**; market-implied VORP (his ADP rank "
          f"{mi['adp_rank']}) **{mi['implied_vorp']}** — model and market roughly agree.",
          f"- Breakeven to keep Nabers over **Walker**: VORP **{be['displace_Walker']}**; "
          f"over **Henry**: VORP **{be['displace_Henry']}**.",
          "- So even trusting the market over our model, Nabers' value does not reach the "
          "breakeven; the bias would have to be very large AND unshared by the market to flip it.",
          "", "### Cross-sectional experience bias (model vs market)", "",
          "| experience | n | VORP rank − ADP rank (+ = we rank below market) |", "|---|---|---|"]
    for b, s in out["experience_bias_probe"].items():
        L.append(f"| {b} | {s['n']} | {s['mean_rank_gap_vorp_minus_adp']:+.1f} |")
    L += ["", "**Caveats:** " + " · ".join(out["caveats"])]
    (HERE / "EXP-KEEPER-NABERS.md").write_text("\n".join(L))


if __name__ == "__main__":
    raise SystemExit(main())
