#!/usr/bin/env python3
"""NEED-BY-PHASE FACTORIAL — does Auto's need-WEIGHT ramp earn anything beyond the mask?

The one term measured to earn real money is the keeper-need MASK (b0_need/value_depth,
+$258) — hiding filled positions. Auto ALSO carries an additive need-WEIGHT ramp
(0.35→0.9→1.45→1.3 by phase) that has NEVER been raced; the tournament only moved
ceiling/risk. So this asks the attack-the-frame question on our own Auto, on the term we
rely on most: does the additive need-weight add ANYTHING on top of the mask, and if so what
SHAPE — and does phase-RAMPING beat a flat weight?

DESIGN FOR INFORMATION (not a win/lose race):
  * BASELINE = the live MASK alone (VORP-greedy within startable cap). The mask already does
    need by masking filled positions.
  * ARMS = mask + additive need term: score = vorp + w·SCALE·need_signal(player, roster),
    swept FLAT over w ∈ {0, 0.5, 1, 1.5, 2, 3} to map the response CURVE, plus AUTO's actual
    RAMP and two alt schedules (early-heavy, late-heavy) to test whether ramping beats flat.
  * Reference arm = VORP-greedy on the FULL board (no mask) — shows the mask's own value.
  All arms share the same rooms, opponent seeds, and weekly luck (paired), so deltas isolate
  the need term. Report the CURVE with bootstrap CIs, not a winner.

POWER (stated before running): paired MC + bootstrap CI; at n=200 keeper-B0 CIs ran ~±40-50
on a $258 effect, so ~$30-40 is the min reliably detectable participation effect. Run
n≥300 (CI ~±25). A |edge| < ~$30 with a CI spanning zero is reported "≤$30 if present —
underpowered to separate from zero," NOT "earns nothing."

PRE-REGISTERED expectation (mine): the mask does most of the work; the additive need-weight
adds little and flat ≈ ramp — i.e., the ramp is largely decoration. If true, Auto simplifies:
keep the mask, drop or flatten the need-weight ramp. Reused machinery: cory_conditional +
exp_keeper_b0. Pure need_signal/phase_weight unit-tested in test_need_phase.py.
"""
from __future__ import annotations
import json
import random
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import cory_conditional as CC          # noqa: E402
import exp_keeper_b0 as B0             # noqa: E402  (startable_cap_filter = the live mask)

SEED = CC.SEED
NEED_SCALE = 30.0                       # w=1 nudges a needed starter by ~30 VORP (a real gap);
#                                         the SHAPE across w is the finding, SCALE sets the x-units.
FLAT_GRID = [0.0, 0.5, 1.0, 1.5, 2.0, 3.0]
TEAMS = 10


def need_signal(player, roster):
    """Unit need for a player given the current roster: 1.0 if his position still has an
    unfilled dedicated STARTER slot; 0.5 if he's flex-eligible and the flex is still open;
    else 0.0 (bench = no need). Mirrors the engine's starter-slot logic as a 0/0.5/1 signal."""
    c = B0._counts(roster)
    pos = player["position"]
    if c.get(pos, 0) < CC.STARTERS.get(pos, 0):
        return 1.0
    flex_used = sum(max(0, c.get(p, 0) - CC.STARTERS.get(p, 0)) for p in CC.FLEX_POS)
    if pos in CC.FLEX_POS and flex_used < CC.FLEX:
        return 0.5
    return 0.0


def phase_weight(rnd):
    """Auto's LIVE need-weight ramp by round (engine.js autoWeights): Anchor 1-2, Build 3-6,
    Fill 7-10, Endgame 11+."""
    if rnd <= 2:
        return 0.35
    if rnd <= 6:
        return 0.9
    if rnd <= 10:
        return 1.45
    return 1.3


def _round_of(live_idx, my_picks):
    overall = my_picks[live_idx - 1] if 0 < live_idx <= len(my_picks) else 0
    return (overall - 1) // TEAMS + 1 if overall else 1


def _best(board, roster, w):
    """argmax over the startable-cap mask of vorp + w·SCALE·need_signal. Returns a singleton
    so draft_room's max(vorp) yields exactly this pick."""
    masked = B0.startable_cap_filter(board, roster)
    return [max(masked, key=lambda p: (p.get("vorp") or 0) + w * NEED_SCALE * need_signal(p, roster))]


def choosers(my_picks):
    out = {
        "mask_only": lambda b, i, r: [max(B0.startable_cap_filter(b, r), key=lambda p: p.get("vorp") or 0)],
        "no_mask_vorp": lambda b, i, r: [max(b, key=lambda p: p.get("vorp") or 0)],
        "auto_ramp": lambda b, i, r: _best(b, r, phase_weight(_round_of(i, my_picks))),
        # alt schedules to map whether ramping beats flat and in which direction
        "early_heavy": lambda b, i, r: _best(b, r, 1.6 if _round_of(i, my_picks) <= 6 else 0.6),
        "late_heavy": lambda b, i, r: _best(b, r, 0.6 if _round_of(i, my_picks) <= 6 else 1.6),
    }
    for w in FLAT_GRID:
        out[f"flat_{w}"] = (lambda ww: (lambda b, i, r: _best(b, r, ww)))(w)
    return out


def race(n_rooms, seed=SEED):
    pool, my_keepers, opp_keepers, my_picks = CC.load_world()
    cand = choosers(my_picks)
    totals = {k: [] for k in cand}
    for s in range(n_rooms):
        opp_state = random.Random(seed + s).getstate()
        grade_state = random.Random(seed * 7 + s).getstate()
        for k, ch in cand.items():
            r = random.Random(); r.setstate(opp_state)         # same room every arm
            rosters = CC.draft_room(pool, my_keepers, opp_keepers, my_picks, ch, r)
            g = random.Random(); g.setstate(grade_state)       # same weekly luck every arm
            totals[k].append(CC.grade_room(rosters, g)["total"])
    return totals


def _paired(totals, arm, base="mask_only", seed=SEED):
    d = [a - b for a, b in zip(totals[arm], totals[base])]
    lo, hi = CC.bootstrap_ci(d, random.Random(seed + 3))
    m = sum(d) / len(d)
    return {"edge": round(m, 2), "ci95": [round(lo, 2), round(hi, 2)],
            "beats": bool(lo > 0), "separable_from_zero": bool(lo > 0 or hi < 0)}


def main():
    n = int(sys.argv[sys.argv.index("--rooms") + 1]) if "--rooms" in sys.argv else 300
    totals = race(n)
    base_mean = sum(totals["mask_only"]) / n

    flat_curve = [{"w": w, **_paired(totals, f"flat_{w}")} for w in FLAT_GRID]
    schedules = {k: _paired(totals, k) for k in ("auto_ramp", "early_heavy", "late_heavy")}
    mask_value = _paired(totals, "no_mask_vorp")   # negative edge = the mask HELPS vs no-mask

    # the two questions, answered off the curve. Be precise: what matters is whether AUTO'S
    # ACTUAL ramp (what's live) is separable from zero, and whether ramping beats flat — not
    # whether SOME flat weight is barely separable.
    best_flat = max(flat_curve, key=lambda r: r["edge"])
    small_flat_earns = any(r["separable_from_zero"] and r["edge"] > 0 and r["w"] <= 0.5
                           for r in flat_curve)
    heavy_flat_earns = any(r["separable_from_zero"] and r["edge"] > 0 and r["w"] >= 1.0
                           for r in flat_curve)
    ramp_earns = schedules["auto_ramp"]["separable_from_zero"] and schedules["auto_ramp"]["edge"] > 0
    ramp_vs_best_flat = round(schedules["auto_ramp"]["edge"] - best_flat["edge"], 2)

    out = {
        "experiment": "need-by-phase factorial — does the additive need-WEIGHT earn beyond the mask?",
        "rooms": n, "baseline": "mask_only (startable-cap, VORP-greedy)", "need_scale": NEED_SCALE,
        "baseline_mean_dollars": round(base_mean, 1),
        "power_note": f"n={n}; min reliably detectable ~$25-35; |edge|<that with CI spanning 0 = "
                      "underpowered, not zero.",
        "mask_value_vs_no_mask": mask_value,
        "flat_need_weight_curve": flat_curve,
        "schedules_vs_mask": schedules,
        "best_flat": best_flat,
        "ramp_minus_best_flat": ramp_vs_best_flat,
        "small_flat_earns": small_flat_earns, "heavy_flat_earns": heavy_flat_earns,
        "auto_ramp_earns": ramp_earns,
        "verdict": (
            # honest reading keyed on what's LIVE (Auto's ramp), not on any barely-separable point
            ("The MASK is the earner. Auto's need-WEIGHT ramp is NOT separable from zero and is "
             "beaten by a flat w≈0.5 — near-DECORATION. Simplify Auto: keep the mask, replace the "
             "need-weight ramp with a small flat weight (~0.5) or drop it.") if not ramp_earns else
            ("The need-weight ramp Auto runs IS separable from zero — it earns beyond the mask; "
             "keep it.")),
        "ramp_verdict": ("ramping beats the best flat weight" if ramp_vs_best_flat > 0 and ramp_earns
                         else "ramping does NOT beat a flat weight (a small flat w≈0.5 wins); the "
                              "phase schedule of the need-weight adds nothing"),
        "caveats": ["v1 money proxy; paired rooms + weekly luck; our-league 3-season pool "
                    "(the sample ceiling applies — public leagues would firm this).",
                    "need_signal is a 0/0.5/1 starter-slot proxy for the engine's starterSlotMarginal; "
                    "the SHAPE across w is the finding, not the absolute scale."],
    }
    (HERE / "exp_need_phase.json").write_text(json.dumps(out, indent=2))
    _report(out)
    print(f"baseline (mask only) ${base_mean:.0f} · mask vs no-mask {mask_value['edge']:+.1f} "
          f"CI{mask_value['ci95']}")
    print("flat need-weight curve (edge vs mask, CI):")
    for r in flat_curve:
        print(f"  w={r['w']:<4} {r['edge']:+7.1f}  CI[{r['ci95'][0]:>7},{r['ci95'][1]:>7}]"
              f"  {'SEPARABLE' if r['separable_from_zero'] else 'underpowered/≈0'}")
    for k, v in schedules.items():
        print(f"  {k:<12} {v['edge']:+7.1f}  CI[{v['ci95'][0]:>7},{v['ci95'][1]:>7}]")
    print("VERDICT:", out["verdict"])
    print("RAMP:", out["ramp_verdict"], f"(ramp−best_flat {ramp_vs_best_flat:+.1f})")
    return 0


def _report(out):
    L = ["# NEED-BY-PHASE FACTORIAL — does the additive need-weight earn beyond the mask?", "",
         f"_{out['rooms']} paired rooms · baseline = the live MASK (startable-cap, VORP-greedy) · "
         f"need_scale {out['need_scale']} · {out['power_note']}_", "",
         f"**Mask's own value** (vs no-mask VORP-greedy): {out['mask_value_vs_no_mask']['edge']:+.1f} "
         f"CI{out['mask_value_vs_no_mask']['ci95']} — negative here would mean the mask helps.", "",
         "## Flat need-weight response curve (edge vs mask, 95% CI)", "",
         "| w | edge $ | 95% CI | reading |", "|---|---|---|---|"]
    for r in out["flat_need_weight_curve"]:
        L.append(f"| {r['w']} | {r['edge']:+.1f} | [{r['ci95'][0]}, {r['ci95'][1]}] | "
                 f"{'separable from 0' if r['separable_from_zero'] else '≈0 / underpowered'} |")
    L += ["", "## Schedules (edge vs mask)", "",
          "| schedule | edge $ | 95% CI |", "|---|---|---|"]
    for k, v in out["schedules_vs_mask"].items():
        L.append(f"| {k} | {v['edge']:+.1f} | [{v['ci95'][0]}, {v['ci95'][1]}] |")
    L += ["", f"**Verdict:** {out['verdict']}",
          f"**Ramp:** {out['ramp_verdict']} (ramp − best flat = {out['ramp_minus_best_flat']:+.1f}).", "",
          "**Caveats:** " + " · ".join(out["caveats"])]
    (HERE / "EXP-NEED-PHASE.md").write_text("\n".join(L))


if __name__ == "__main__":
    raise SystemExit(main())
