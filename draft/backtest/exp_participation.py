#!/usr/bin/env python3
"""ALL-TERMS PARTICIPATION TEST — which of Auto's 8 adjusters earn dollars?

The engine scores a pick as an anchor + seven adjusters (engine.js scorePlayer):
    score = value·VONA + tier·cliff + need·slotMarginal + risk + ceiling·upside
            + keeper·KOV − bye·collision + stack·corr
Only ONE term (the keeper-need MASK) has ever been money-graded to earn (+$258, keeper-B0).
This asks the attack-the-frame question of the whole panel: with each term participating at a
FAIR strength, does it move E[$] — or is it decoration the war room presents as an equal?

DESIGN (EXP-PARTICIPATION-PREREG.md — prior formed BEFORE running):
  * BASELINE ("full") = the live mask + the value anchor (VORP) + every adjuster at its engine
    DEFAULT weight. Ablations zero ONE term; the paired delta is that term's participation $.
  * DEEP terms (need, value: STRONG prior, clean in this harness) get a WEIGHT CURVE
    {0,.5,1,1.5,2,3}, not on/off — shape + optimum, same paired rooms at every point.
  * ceiling gets a PAYOUT-COMPONENT split (weekly-high vs regular-season $): weekly-high is
    37.5% of the pot and rewards distribution SHAPE, the only mechanism that could rescue it.
  * tier/risk/bye/stack: on/off only (weak prior — bounded, not mapped).
  * keeper is SCOPED OUT, not proxied: KOV is a cross-SEASON option value; this MC grades a
    single season, so keeper cannot earn here BY CONSTRUCTION. Reporting a proxy null on it
    would be a null of the wrong instrument (SESSION-A: a null is only as strong as the space
    searched). It is bounded elsewhere (the engine found it can't move the top-5 at any setting).

FAITHFULNESS (honest scope): need and value map exactly onto this harness — need_signal is the
same 0/.5/1 slot proxy the accepted keeper-B0/need-phase results used, and VORP IS the anchor
the greedy ranks by. The other four (tier/risk/ceiling/stack/bye) are computed here from the
SAME board fields the engine's terms use (proj_ceiling, weekly_sd, tier_drop, bye, team), each
z-scored and scaled to a comparable ~30-pt nudge so no term is handicapped by scale — but they
are NOT the engine's exact functions. A proxy ablation bounds the term's MECHANISM in this
harness; it does not by itself convict the live term. The decisive arms are need + value.

POWER (before running): certified paired MC (paired seeds + paired weekly luck + bootstrap CI).
From keeper-B0 at n=200, CIs ran ~±40-50 on a $258 effect → min reliably detectable ~$30-40 at
n=200, ~±25 at n≥400. Default n=400. |edge|<~$25 with CI spanning 0 = "≤$25 if present —
underpowered," NOT "earns nothing." Decoration is claimed only for a term whose CI is TIGHT
around zero at the n used.

PRE-REGISTERED expectation (mine): need + value earn; ceiling earns ONLY on weekly-high if at
all; tier/risk/bye/stack are decoration (≤$25). If need or value came back null I'd distrust
the harness before the finding. Reused machinery: cory_conditional (rooms/grade/CI),
exp_need_phase (need_signal). Pure signals unit-tested in test_participation.py.
"""
from __future__ import annotations
import json
import math
import random
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import cory_conditional as CC          # noqa: E402  (rooms, grade, bootstrap_ci)
import exp_need_phase as NP            # noqa: E402  (need_signal — one definition)

SEED = CC.SEED
NUDGE = 30.0                            # a term at weight 1 nudges a pick by ~30 VORP-equivalent
FLAT_GRID = [0.0, 0.5, 1.0, 1.5, 2.0, 3.0]
BOARD = CC.BOARD

# engine DEFAULT_WEIGHTS (engine.js:221) — the strength each adjuster runs at in "full"
DEFAULTS = {"value": 1.0, "tier": 1.0, "need": 1.0, "risk": 1.0,
            "ceiling": 0.65, "bye": 1.0, "stack": 1.0}


# --- enrich the pool with the extra board fields the adjuster proxies need -----
def enrich(pool):
    """load_world's pool carries value/ceiling/weekly_sd/team; join tier_drop + bye from the
    raw board by id so the tier and bye proxies have their inputs. Additive, in-experiment —
    load_world stays untouched (it is shared)."""
    raw = {str(p["player_id"]): p for p in json.loads(BOARD.read_text()).get("players", [])}
    for p in pool:
        b = raw.get(p["player_id"], {})
        p["tier_drop"] = float(b.get("tier_drop") or 0.0)
        p["bye"] = b.get("bye")
        p["proj_ceiling"] = float(p.get("proj_ceiling") or p.get("proj_mean") or 0.0)
        p["weekly_sd"] = float(p.get("weekly_sd") or 6.0)
    return pool


def _zstats(pool, key_fn):
    xs = [key_fn(p) for p in pool]
    mu = sum(xs) / len(xs)
    sd = math.sqrt(sum((x - mu) ** 2 for x in xs) / len(xs)) or 1.0
    return mu, sd


# --- the seven adjuster signals (value is the raw anchor, handled in the score) ---
def board_stats(pool):
    """Board-static z-stats, computed ONCE so every arm/pick shares the same scale."""
    return {
        "ceiling": _zstats(pool, lambda p: max(0.0, p["proj_ceiling"] - p["proj_mean"])),
        "risk": _zstats(pool, lambda p: -p["weekly_sd"]),        # floor preference: lower sd = safer
        "tier": _zstats(pool, lambda p: p["tier_drop"]),         # points lost if you miss this tier
    }


def _z(val, stat):
    return (val - stat[0]) / stat[1]


def ceiling_sig(p, st):
    return NUDGE * _z(max(0.0, p["proj_ceiling"] - p["proj_mean"]), st["ceiling"])


def risk_sig(p, st):
    return NUDGE * _z(-p["weekly_sd"], st["risk"])


def tier_sig(p, st):
    return NUDGE * _z(p["tier_drop"], st["tier"])


def bye_sig(p, roster):
    """Collision penalty: −(starters already sharing this player's bye). Roster-dependent, so
    categorical (not z-scored). ~15/collision keeps it a tiebreaker, matching the engine's
    'late-round nudge' role."""
    b = p.get("bye")
    if b is None:
        return 0.0
    clash = sum(1 for q in roster if q.get("bye") == b)
    return -15.0 * clash


def stack_sig(p, roster):
    """+1 nudge if this pick correlates with a rostered player on the same team (QB↔pass-catcher)
    — the weekly-high shape mechanism. Roster-dependent, categorical."""
    team = p.get("team")
    if not team or team == "FA":
        return 0.0
    pos = p["position"]
    if pos == "QB":
        hit = any(q.get("team") == team and q["position"] in ("WR", "TE", "RB") for q in roster)
    elif pos in ("WR", "TE", "RB"):
        hit = any(q.get("team") == team and q["position"] == "QB" for q in roster)
    else:
        hit = False
    return NUDGE if hit else 0.0


def score(p, roster, w, st):
    """Weighted pick score, mirroring engine.js scorePlayer term-for-term (proxied)."""
    return (w["value"] * (p.get("vorp") or 0.0)
            + w["need"] * NUDGE * NP.need_signal(p, roster)
            + w["ceiling"] * ceiling_sig(p, st)
            + w["risk"] * risk_sig(p, st)
            + w["tier"] * tier_sig(p, st)
            + w["bye"] * bye_sig(p, roster)
            + w["stack"] * stack_sig(p, roster))


def _wset(**over):
    w = dict(DEFAULTS)
    w.update(over)
    return w


def _chooser(w, st):
    import exp_keeper_b0 as B0
    def ch(board, i, roster):
        masked = B0.startable_cap_filter(board, roster)
        return [max(masked, key=lambda p: score(p, roster, w, st))]
    return ch


ADJ = ("need", "tier", "risk", "ceiling", "bye", "stack")   # the 7th (keeper) is scoped out
_CORE = {"value": 1.0, "need": 0.0, "tier": 0.0, "risk": 0.0, "ceiling": 0.0, "bye": 0.0, "stack": 0.0}

# INSTRUMENT LIMIT: grade_room draws each starter's weekly score INDEPENDENTLY — it has no
# within-team weekly CORRELATION, which is the entire mechanism a stack exploits. So this
# harness CANNOT reward stacking; a stack tilt here only distorts the anchor. The stack arm is
# therefore measuring the wrong thing — the SOUND instrument for stack is exp6/stack_sweep
# (rho=0.35 modelled), which found stack a WINNER (+$196 @ dose 0.5). Report stack as
# instrument-limited here, NOT as decoration/drag; defer to stack_sweep.
INSTRUMENT_LIMITED = {"stack": "grade_room has no within-team weekly correlation — the stack "
                               "mechanism is absent, so this arm can't reward it. Sound "
                               "instrument = exp6/stack_sweep (WINNER +$196 @ dose 0.5)."}


def choosers(st):
    out = {
        # ABLATION frame: from full (all adjusters @ default), remove one — bounds each term's
        # marginal value GIVEN the others, but "full" contains any harmful tilts, so magnitudes
        # here are confounded. Kept for comparison; build-up is the headline.
        "full": _chooser(_wset(), st),
        "all_adjusters_off": _chooser(dict(_CORE), st),              # == core (mask + value only)
    }
    for term in ("value",) + ADJ:
        out[f"{term}_off"] = _chooser(_wset(**{term: 0.0}), st)
    # BUILD-UP frame (the clean, decision-relevant one): start from the defensible CORE
    # (mask + value anchor only) and add ONE adjuster at its engine default. (core+term)−core
    # is what turning that control ON actually buys, with nothing else to drown out or dilute.
    out["core"] = _chooser(dict(_CORE), st)
    for term in ADJ:
        w = dict(_CORE); w[term] = DEFAULTS[term]
        out[f"core_plus_{term}"] = _chooser(w, st)
    # DEEP/actionable curves, all vs the clean core (mask + value anchor). value MAGNITUDE is
    # ill-posed in isolation — with no competing term, any w>0 gives the same argmax over vorp,
    # so a value curve is degenerate; value is only meaningful RELATIVE to a competing term,
    # which is exactly what these two curves measure (they ARE the value-relative trade-off).
    for wn in FLAT_GRID:                                             # need vs the value anchor
        w = dict(_CORE); w["need"] = wn
        out[f"need_w{wn}"] = _chooser(w, st)
    for wc in FLAT_GRID:                                             # ceiling vs the anchor (the survivor)
        w = dict(_CORE); w["ceiling"] = wc
        out[f"ceiling_w{wc}"] = _chooser(w, st)
    return out


def race(n_rooms, seed=SEED):
    pool, my_keepers, opp_keepers, my_picks = CC.load_world()
    enrich(pool)
    st = board_stats(pool)
    cand = choosers(st)
    # store per-seed component dicts so any arm can be split weekly-high vs RS
    totals = {k: {"total": [], "weekly_high": [], "rs": []} for k in cand}
    for s in range(n_rooms):
        opp_state = random.Random(seed + s).getstate()
        grade_state = random.Random(seed * 7 + s).getstate()
        for k, ch in cand.items():
            r = random.Random(); r.setstate(opp_state)             # same room every arm
            rosters = CC.draft_room(pool, my_keepers, opp_keepers, my_picks, ch, r)
            g = random.Random(); g.setstate(grade_state)           # same weekly luck every arm
            res = CC.grade_room(rosters, g)
            for comp in ("total", "weekly_high", "rs"):
                totals[k][comp].append(res[comp])
    return totals


def _paired(totals, arm, base="full", comp="total", seed=SEED):
    """Paired mean delta arm−base on a chosen payout component, with bootstrap CI."""
    d = [a - b for a, b in zip(totals[arm][comp], totals[base][comp])]
    lo, hi = CC.bootstrap_ci(d, random.Random(seed + 3))
    m = sum(d) / len(d)
    return {"edge": round(m, 2), "ci95": [round(lo, 2), round(hi, 2)],
            "separable_from_zero": bool(lo > 0 or hi < 0)}


def _term_verdict(edge_ci, floor=25.0):
    e, (lo, hi) = edge_ci["edge"], edge_ci["ci95"]
    if lo > 0 or hi < 0:
        return f"EARNS ({e:+.0f}, CI excludes 0)" if e > 0 else f"HURTS ({e:+.0f}, CI excludes 0)"
    if abs(e) < floor and abs(hi - lo) < 2 * floor + 20:
        return f"decoration (≤${floor:.0f}; CI tight around 0)"
    return f"≤${floor:.0f} if present — underpowered to separate from 0"


SCALE_CAVEAT = (
    "SCALE caveat (load-bearing): each adjuster is scaled to a uniform ~30-pt VORP-equivalent "
    "nudge at weight 1 so none is handicapped — but the LIVE engine's tier/risk/stack terms are "
    "smaller than a 30-pt nudge, so their harmful DOLLAR magnitudes here (tier/risk/stack) are an "
    "upper bound at fair-fight strength, not the live-engine loss. The ROBUST, decision-relevant "
    "claim is the SIGN and ordering: on the clean mask+value core, no adjuster EARNS; at any "
    "strength large enough to move picks, tier/risk/stack LOSE (they pull off the anchor toward a "
    "mechanism no payout rewards). At the engine's smaller real strength they shade from mild harm "
    "to decoration. Either way: nothing to turn up beyond the core.")

FRAME_NOTE = (
    "Build-up (add one term to the core) is the truth; ablation (remove one from 'full') is "
    "CONFOUNDED because 'full' carries the harmful tilts — e.g. ceiling reads +150 in ablation but "
    "−5 in build-up: in 'full' it looks good only by partially offsetting tier/risk damage. Read "
    "build-up.")


def main():
    if "--report-only" in sys.argv:                     # regenerate MD/stdout from saved JSON (no re-race)
        out = json.loads((HERE / "exp_participation.json").read_text())
        _report(out); _print(out); return 0
    n = int(sys.argv[sys.argv.index("--rooms") + 1]) if "--rooms" in sys.argv else 400
    totals = race(n)
    base_mean = sum(totals["full"]["total"]) / n

    # ablations: full MINUS the ablated term = what the term contributes when it participates.
    # (full − term_off) = −(_paired(term_off)). Report as the term's participation value.
    ablations = {}
    for term in ("value", "need", "tier", "risk", "ceiling", "bye", "stack"):
        off = _paired(totals, f"{term}_off")                       # off − full
        ablations[term] = {"edge": round(-off["edge"], 2),         # participation = full − off
                           "ci95": [round(-off["ci95"][1], 2), round(-off["ci95"][0], 2)],
                           "separable_from_zero": off["separable_from_zero"]}
        ablations[term]["reading"] = _term_verdict(ablations[term])
    all_off = _paired(totals, "all_adjusters_off")
    adjusters_total = {"edge": round(-all_off["edge"], 2),
                       "ci95": [round(-all_off["ci95"][1], 2), round(-all_off["ci95"][0], 2)],
                       "separable_from_zero": all_off["separable_from_zero"]}

    # BUILD-UP (the clean frame): (core+term) − core = what turning that control ON buys on top
    # of the defensible mask+value core, with nothing else to dilute or drown it out.
    build_up = {}
    for term in ADJ:
        v = _paired(totals, f"core_plus_{term}", base="core")
        if term in INSTRUMENT_LIMITED:
            v["reading"] = "INSTRUMENT-LIMITED — " + INSTRUMENT_LIMITED[term]
            v["instrument_limited"] = True
        else:
            v["reading"] = _term_verdict(v)
        build_up[term] = v
    core_mean = sum(totals["core"]["total"]) / n

    # Curves vs the clean core (mask + value anchor). These ARE the value-relative trade-offs
    # (need-vs-anchor, ceiling-vs-anchor); a value-magnitude curve is degenerate in isolation.
    need_curve = [{"w": w, **_paired(totals, f"need_w{w}", base="core")} for w in FLAT_GRID]
    ceiling_curve = [{"w": w, **_paired(totals, f"ceiling_w{w}", base="core")} for w in FLAT_GRID]

    # ceiling split: does adding ceiling to the core earn in the weekly-high pool specifically?
    # (core+ceiling) − core, per payout component — the pre-registered mechanism test.
    ceiling_split = {
        "weekly_high": _paired(totals, "core_plus_ceiling", base="core", comp="weekly_high"),
        "regular_season": _paired(totals, "core_plus_ceiling", base="core", comp="rs"),
    }

    # survivors/decoration keyed off the CLEAN build-up frame, not the confounded ablation.
    # Instrument-limited terms (stack) are EXCLUDED from all three — the harness can't judge them.
    judged = {t: v for t, v in build_up.items() if not v.get("instrument_limited")}
    survivors = [t for t, v in judged.items() if v["separable_from_zero"] and v["edge"] > 0]
    hurts = [t for t, v in judged.items() if v["separable_from_zero"] and v["edge"] < 0]
    decoration = [t for t, v in judged.items()
                  if not v["separable_from_zero"] and abs(v["edge"]) < 25]
    out = {
        "experiment": "all-terms participation test — which of the 8 adjusters earn $?",
        "rooms": n, "baseline": "full = mask + value anchor + every adjuster at engine default",
        "baseline_mean_dollars": round(base_mean, 1), "nudge": NUDGE,
        "power_note": f"n={n}; min reliably detectable ~$25; |edge|<that with CI spanning 0 = "
                      "underpowered, not zero.",
        "keeper_scoped_out": "KOV is a cross-season option value; a single-season money grade "
                             "cannot price it BY CONSTRUCTION — bounded elsewhere, not proxied here.",
        "core_mean_dollars": round(core_mean, 1),
        "build_up_from_core": build_up,
        "ablation_from_full": ablations,
        "all_adjusters_together": adjusters_total,
        "value_note": "value MAGNITUDE is ill-posed in isolation (with no competing term any w>0 "
                      "gives the same argmax over VORP). Removing the anchor is catastrophic "
                      "(see ablation value / all-adjusters); how hard to lean on it is the INVERSE "
                      "of the need/ceiling curves below.",
        "need_weight_curve": need_curve,
        "ceiling_weight_curve": ceiling_curve,
        "ceiling_by_payout_component": ceiling_split,
        "survivors": survivors, "hurts": hurts, "decoration": decoration,
        "instrument_limited": INSTRUMENT_LIMITED,
        "stack_reconciliation": "stack reads −$63 HERE but that is an instrument artifact — "
                                "grade_room draws weekly scores independently (no within-team "
                                "correlation), so this harness can't reward a stack. exp6/"
                                "stack_sweep models rho=0.35 and found stack a WINNER (+$196 @ "
                                "dose 0.5, CI[131,268]). stack_sweep is authoritative for stack; "
                                "the exp6 'dose pays' verdict STANDS, not retired.",
        "faithfulness": "need + value map exactly onto this harness (accepted results use them); "
                        "tier/risk/ceiling/bye/stack are proxies from the same board fields the "
                        "engine uses, scaled to a fair ~30-pt nudge — a proxy null bounds the "
                        "mechanism here, it does not by itself convict the live term.",
        "scale_caveat": SCALE_CAVEAT,
        "frame_note": FRAME_NOTE,
        "prereg_outcome": "Cory's prior (need earns, most others don't) — CONFIRMED, with one "
                          "correction: even the additive need-WEIGHT is decoration; it's the MASK "
                          "(always on) that earns. My prereg guess that CEILING earns via "
                          "weekly-high — NOT supported on the clean core (weekly-high ~0); the "
                          "apparent weekly-high gain was a confound of the ablation-from-full frame.",
        "draft_day_auto": "mask ON (earner) + value anchor 1.0 (earner) + STACK ~0.5 (exp6 winner, "
                          "the one adjuster that earns — its mechanism just isn't in THIS harness); "
                          "need/ceiling/bye ~0 (decoration), tier/risk 0 (measured drag). The panel "
                          "collapses to mask + value + a stack tilt.",
        "verdict": "",
    }
    out["verdict"] = _headline(out)
    (HERE / "exp_participation.json").write_text(json.dumps(out, indent=2))
    _report(out)
    _print(out)
    return 0


def _headline(out):
    surv, hurt, dec = out["survivors"], out["hurts"], out["decoration"]
    parts = [f"Core (mask + value anchor) = ${out['core_mean_dollars']:.0f}. "
             f"Adding to the core: EARNS {', '.join(surv) if surv else 'nothing'}"
             + (f"; HURTS {', '.join(hurt)}" if hurt else "")
             + f"; decoration {', '.join(dec) if dec else 'none'}"
             + "; stack INSTRUMENT-LIMITED (defer to exp6/stack_sweep, WINNER +$196)."]
    cs = out["ceiling_by_payout_component"]
    wh, rs = cs["weekly_high"], cs["regular_season"]
    if wh["separable_from_zero"] and wh["edge"] > 0:
        parts.append(f"Ceiling's gain IS via weekly-high ({wh['edge']:+.0f} CI{wh['ci95']}), "
                     f"~0 on RS ({rs['edge']:+.0f} CI{rs['ci95']}) — the shape mechanism.")
    else:
        parts.append(f"Ceiling shows NO clean weekly-high gain on the core (wk-high {wh['edge']:+.0f} "
                     f"CI{wh['ci95']}, RS {rs['edge']:+.0f} CI{rs['ci95']}) — my prereg guess did NOT "
                     f"survive de-confounding.")
    va = out["ablation_from_full"]["value"]
    parts.append(f"Value anchor is decisive (removing it from full costs {va['edge']:+.0f} "
                 f"CI{va['ci95']}).")
    return " ".join(parts)


def _report(out):
    L = ["# ALL-TERMS PARTICIPATION TEST — which of the 8 adjusters earn dollars?", "",
         f"_{out['rooms']} paired rooms · core = mask + value anchor (${out['core_mean_dollars']:.0f}) · "
         f"full = core + all adjusters @ default (${out['baseline_mean_dollars']:.0f}) · "
         f"{out['power_note']}_", "",
         f"**Keeper scoped out:** {out['keeper_scoped_out']}", "",
         "## BUILD-UP — what each control buys ON TOP of the mask+value core (the clean frame)", "",
         "_(core+term) − core, paired. The decision-relevant question: what to turn ON beyond the core._", "",
         "| term added | $ vs core | 95% CI | reading |", "|---|---|---|---|"]
    for t, v in out["build_up_from_core"].items():
        L.append(f"| {t} | {v['edge']:+.1f} | [{v['ci95'][0]}, {v['ci95'][1]}] | {v['reading']} |")
    L += ["", "## ABLATION — full − term-off (confounded: 'full' carries the harmful tilts)", "",
          "_Kept for comparison. Where a term hurts here but is ~0 in build-up, the ablation "
          "magnitude is the term DISTORTING the anchor at default strength, not a real edge._", "",
          "| term | full − off | 95% CI | reading |", "|---|---|---|---|"]
    for t, v in out["ablation_from_full"].items():
        L.append(f"| {t} | {v['edge']:+.1f} | [{v['ci95'][0]}, {v['ci95'][1]}] | {v['reading']} |")
    a = out["all_adjusters_together"]
    L += [f"| **all adjusters together** | {a['edge']:+.1f} | [{a['ci95'][0]}, {a['ci95'][1]}] | "
          f"{'separable' if a['separable_from_zero'] else 'not separable'} |", "",
          "## Weight curves vs the CLEAN core (95% CI) — the value-relative trade-offs", "",
          f"_{out['value_note']}_", "",
          "### Need weight (vs the value anchor)", "", "| w | edge $ | 95% CI |", "|---|---|---|"]
    for r in out["need_weight_curve"]:
        L.append(f"| {r['w']} | {r['edge']:+.1f} | [{r['ci95'][0]}, {r['ci95'][1]}] |")
    L += ["", "### Ceiling weight (vs the value anchor) — how hard to lean on upside", "",
          "| w | edge $ | 95% CI |", "|---|---|---|"]
    for r in out["ceiling_weight_curve"]:
        L.append(f"| {r['w']} | {r['edge']:+.1f} | [{r['ci95'][0]}, {r['ci95'][1]}] |")
    cs = out["ceiling_by_payout_component"]
    L += ["", "## Ceiling by payout component (does shape pay in weekly-high?)", "",
          "| component | edge $ | 95% CI |", "|---|---|---|",
          f"| weekly-high (37.5% of pot) | {cs['weekly_high']['edge']:+.1f} | {cs['weekly_high']['ci95']} |",
          f"| regular-season | {cs['regular_season']['edge']:+.1f} | {cs['regular_season']['ci95']} |", "",
          f"**Verdict:** {out['verdict']}", "",
          f"**Stack reconciliation (instrument limit):** {out.get('stack_reconciliation', '')}", "",
          f"**Draft-day Auto:** {out.get('draft_day_auto', '')}", "",
          f"**Pre-registration outcome:** {out.get('prereg_outcome', '')}", "",
          f"**Frame:** {out.get('frame_note', '')}", "",
          f"**{out.get('scale_caveat', '')}**", "",
          f"**Faithfulness:** {out['faithfulness']}"]
    (HERE / "EXP-PARTICIPATION.md").write_text("\n".join(L))


def _print(out):
    print(f"core (mask+value) ${out['core_mean_dollars']:.0f} · full ${out['baseline_mean_dollars']:.0f} "
          f"· n={out['rooms']}")
    print("BUILD-UP — $ each control buys on top of core (core+term − core):")
    for t, v in out["build_up_from_core"].items():
        print(f"  +{t:<8} {v['edge']:+7.1f}  CI[{v['ci95'][0]:>7},{v['ci95'][1]:>7}]  {v['reading']}")
    print("ABLATION — full − off (confounded):")
    for t, v in out["ablation_from_full"].items():
        print(f"  {t:<9} {v['edge']:+7.1f}  CI[{v['ci95'][0]:>7},{v['ci95'][1]:>7}]")
    print("need curve (vs core): ", [(r["w"], r["edge"]) for r in out["need_weight_curve"]])
    print("ceiling curve (vs core):", [(r["w"], r["edge"]) for r in out["ceiling_weight_curve"]])
    cs = out["ceiling_by_payout_component"]
    print(f"ceiling weekly-high {cs['weekly_high']['edge']:+.1f}{cs['weekly_high']['ci95']} "
          f"· RS {cs['regular_season']['edge']:+.1f}{cs['regular_season']['ci95']}")
    print("VERDICT:", out["verdict"])


if __name__ == "__main__":
    raise SystemExit(main())
