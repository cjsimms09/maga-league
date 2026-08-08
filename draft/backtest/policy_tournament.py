#!/usr/bin/env python3
"""EXPERIMENT 2 — THE AUTO-ADJUSTER POLICY TOURNAMENT (§5 phase shapes, §6 conditional mining).

The other half of exp 2: not "which strategy" but "which POLICY SETTINGS, and
in which STATE". Two deliverables, both pre-registered in
`docs/queued/auto-adjuster-tuning.md`:

§5 PHASE SHAPES — the comparative test, H1 against its three rivals:
    1. H1 phase-shape  (modest core boom + aggressive, floor-free endgame)
    2. Uniform boom    (even tilt, no phase shape)
    3. Defaults        (the hand-designed champion — the control)
    4. Floor-heavy     (the opposite tilt)
  Plus the per-phase optimum grid, reported WITH INTERVALS so H1's predicted
  shape can be read off the numbers and confirmed or falsified. A phase whose
  interval straddles the default is reported "no evidence of a shift there" —
  never nudged.

§6 CONDITIONAL MINING — settings that win in a specific DETECTABLE state even
  if they don't win globally. Every candidate state is computed from board /
  roster / pick state at the moment of the pick, so machine-detectability is
  structural: if the sim can't compute it live, it isn't a candidate.
  Deliverable: state → setting → E[$] edge → confidence, with held-out-style
  validation and intervals.

  THE OVERFITTING GUARD (§6's own requirement): conditional mining multiplies
  comparisons, so the NULL SEARCHES CONDITIONS TOO — each null draw permutes
  room grades against the state labels (breaking any state↔edge link while
  preserving both marginals) and re-mines the SAME policy×state grid, keeping
  its best edge. A conditional edge the null's own mining reproduces at p95 is
  noise, and says so.

Machinery: the 19b/21 paired rooms — candidate and control share every room AND
every week's luck, so deltas isolate the policy. Same v1 money proxy, same
September quantile re-run pre-registration. NOTHING INSTALLS ITSELF.

Run: python draft/backtest/policy_tournament.py → POLICY-TOURNAMENT.{md,json}
"""
from __future__ import annotations
import argparse
import json
import random
from pathlib import Path

import cory_conditional as CC

HERE = Path(__file__).resolve().parent
SEED = CC.SEED
CORE_PICKS = 6          # my live picks 1-6 = foundation/core; 7+ = the bench endgame
RUN_WINDOW = 6          # a "run" = 3+ of one position in the last 6 room picks
RUN_MIN = 3


# --- policies: (ceiling tilt, risk penalty) per phase --------------------------

def score_fn(ceil_w, risk_w):
    return lambda p: (p["vorp"] + ceil_w * (p["proj_ceiling"] - p["proj_mean"])
                      - risk_w * p["weekly_sd"])


def phase_policy(core, end):
    """core/end = (ceiling_w, risk_w). Returns chooser(board, liveIdx, roster)."""
    def chooser(board, i, roster):
        cw, rw = core if i <= CORE_PICKS else end
        return [max(board, key=score_fn(cw, rw))]
    return chooser


DEFAULT_CORE = (0.5, 1.0)          # the shipped composite's shape, as a proxy
RIVALS = {
    # §5's four, pre-registered — H1 and the rivals it must beat.
    "defaults":     (DEFAULT_CORE, DEFAULT_CORE),
    "h1_phase":     ((0.5, 1.0), (2.0, 0.0)),     # modest core, floor-free endgame
    "uniform_boom": ((1.25, 0.5), (1.25, 0.5)),
    "floor_heavy":  ((0.0, 2.0), (0.0, 2.0)),
}
# The per-phase optimum grid: core tilt × endgame tilt, risk held at the phase's
# registered posture so the reported triple is readable.
GRID_CORE = [0.0, 0.25, 0.5, 1.0, 2.0]
GRID_END = [0.0, 0.5, 1.0, 2.0, 3.0]


def build_policies():
    pol = {k: phase_policy(*v) for k, v in RIVALS.items()}
    for c in GRID_CORE:
        pol[f"grid_core{c}"] = phase_policy((c, 1.0), DEFAULT_CORE)
    for e in GRID_END:
        pol[f"grid_end{e}"] = phase_policy(DEFAULT_CORE, (e, 0.0))
    return pol


# --- the room, instrumented with LIVE-DETECTABLE state ------------------------

def run_room(pool, my_keepers, opp_keepers, my_picks, chooser, rng):
    """CC.draft_room + per-pick STATE capture. Every state below is computed
    from information available at that instant in a real draft."""
    kept = {p["player_id"] for ks in opp_keepers.values() for p in ks}
    kept |= {p["player_id"] for p in my_keepers}
    board = [p for p in pool if p["player_id"] not in kept]
    rosters = {0: list(my_keepers)}
    for i, (_, ks) in enumerate(sorted(opp_keepers.items()), start=1):
        rosters[i] = list(ks)
    while len(rosters) < 10:
        rosters[len(rosters)] = []
    my_set = set(my_picks)
    recent, states = [], {}
    live_idx, oi = 0, 0
    opp_order = list(range(1, 10))
    for pick_no in range(1, 151):
        if not board:
            break
        if pick_no in my_set:
            live_idx += 1
            # STATE at this pick — all machine-detectable live:
            window = recent[-RUN_WINDOW:]
            counts = {}
            for pos in window:
                counts[pos] = counts.get(pos, 0) + 1
            run_pos = next((p for p, n in counts.items() if n >= RUN_MIN), None)
            states[live_idx] = {
                "run_fired": bool(run_pos), "pick_no": pick_no,
                "run_pos": run_pos,
                # board richness at this pick: the VORP gap between the best
                # available and the 5th — a thin board is a different decision.
                "top_gap": (sorted((p["vorp"] for p in board), reverse=True)[0]
                            - sorted((p["vorp"] for p in board), reverse=True)[4])
                if len(board) >= 5 else 0.0,
                "rb_gone": sum(1 for pos in recent if pos == "RB"),
            }
            choice = max(chooser(board, live_idx, rosters[0]), key=lambda p: p["vorp"])
            rosters[0].append(choice)
        else:
            choice = CC.softmax_pick(board, rng)
            rosters[opp_order[oi % 9]].append(choice)
            oi += 1
        recent.append(choice["position"])
        board = [p for p in board if p["player_id"] != choice["player_id"]]
    return rosters, states


def race(n_rooms, seed=SEED):
    pool, my_keepers, opp_keepers, my_picks = CC.load_world()
    pols = build_policies()
    grades = {k: [] for k in pols}
    room_states = []                     # control's states per room (the room's own facts)
    for s in range(n_rooms):
        opp_state = random.Random(seed + s).getstate()
        grade_state = random.Random(seed * 7 + s).getstate()
        for k, chooser in pols.items():
            r = random.Random(); r.setstate(opp_state)
            rosters, states = run_room(pool, my_keepers, opp_keepers, my_picks, chooser, r)
            g = random.Random(); g.setstate(grade_state)
            grades[k].append(CC.grade_room(rosters, g)["total"])
            if k == "defaults":
                room_states.append(states)
    return grades, room_states


# --- verdicts ------------------------------------------------------------------

def paired(grades, cand, ctrl="defaults"):
    return [a - b for a, b in zip(grades[cand], grades[ctrl])]


def summarize(deltas, rng):
    mean = sum(deltas) / len(deltas)
    lo, hi = CC.bootstrap_ci(deltas, rng)
    return round(mean, 2), [round(lo, 2), round(hi, 2)]


def room_features(states):
    """Continuous, live-computable summaries of one room, from my own picks."""
    early = [s for s in states.values() if s["pick_no"] < 60]
    return {
        "run_pressure": sum(1 for s in early if s["run_fired"]),
        "rb_drain_early": max((s["rb_gone"] for s in early), default=0),
        "thin_board_early": -sum(s["top_gap"] for s in early) / max(1, len(early)),
    }


def binarize(all_feats):
    """Split every feature at its MEDIAN across rooms — so each state partitions
    the sample roughly in half and conditional inference is actually possible.
    A feature whose median split still lands ~all/~none is caught by the
    degeneracy guard below and reported, never inferred from."""
    keys = list(next(iter(all_feats)).keys()) if all_feats else []
    out = {}
    for k in keys:
        vals = sorted(f[k] for f in all_feats)
        med = vals[len(vals) // 2]
        out[k] = [f[k] > med for f in all_feats]
    return out


# THE INCIDENCE BAND, both ways (completed 2026-08-08 per Cory):
#   > HIGH_BAND  — the state is a CONSTANT wearing a state label; its
#                  "conditional" edge is just the global edge. GLOBAL.
#   < LOW_BAND   — the state is too rare to estimate an edge for at all.
#                  INSUFFICIENT-N: report the incidence, never a verdict.
# Both ends produce a logged classification, never a number that could be read
# as a finding. The two ends fail for OPPOSITE reasons and must not be conflated.
LOW_BAND = 0.10
HIGH_BAND = 0.85
MIN_ROOMS = 20           # even inside the band, an edge needs a sample


def classify_state(mask):
    """-> (verdict, share, n). The single place incidence is judged, so the real
    mining and the NULL mining cannot drift apart (guard parity)."""
    n = sum(1 for f in mask if f)
    share = n / max(1, len(mask))
    if share > HIGH_BAND:
        return "GLOBAL", share, n
    if share < LOW_BAND:
        return "INSUFFICIENT-N", share, n
    if n < MIN_ROOMS:
        return "INSUFFICIENT-N", share, n
    return "OK", share, n


def mine_conditional(grades, flags, state_key, rng):
    """§6: per policy, the paired edge in rooms WHERE the state holds.

    Returns [] for any state failing the incidence band — and the NULL mining
    calls THIS SAME function, so the null faces the identical partition
    requirement. Without that parity we would be comparing real partitioned
    rules against null degenerate ones and flattering ourselves."""
    mask = flags[state_key]
    verdict, share, n = classify_state(mask)
    out = []
    if verdict != "OK":
        return out, n
    fired = [i for i, f in enumerate(mask) if f]
    for cand in grades:
        if cand == "defaults" or cand.startswith("grid_"):
            continue
        d = [x for i, x in enumerate(paired(grades, cand)) if i in set(fired)]
        mean, ci = summarize(d, rng)
        # The conditional claim is the edge IN-state minus the edge OUT-of-state:
        # "wins in this state" must mean more than "wins, and this state happened".
        dout = [x for i, x in enumerate(paired(grades, cand)) if i not in set(fired)]
        contrast = round(mean - (sum(dout) / len(dout) if dout else 0.0), 2)
        out.append({"state": state_key, "setting": cand, "edge": mean, "ci95": ci,
                    "in_minus_out": contrast, "n_rooms": len(fired)})
    return out, len(fired)


def null_conditional_p95(grades, flags, states, draws, rng):
    """The null MINES CONDITIONS TOO: permute room grades against the state
    labels (breaking state↔edge while preserving both marginals) and re-mine the
    same policy×state grid, keeping the best conditional edge each draw."""
    bests = []
    n = len(next(iter(flags.values()))) if flags else 0
    for _ in range(draws):
        perm = list(range(n))
        rng.shuffle(perm)
        shuffled = {k: [v[perm[i]] for i in range(n)] for k, v in flags.items()}
        best = 0.0
        for sk in states:
            rows, _ = mine_conditional(grades, shuffled, sk, rng)
            for r in rows:
                best = max(best, r["in_minus_out"])
        bests.append(best)
    bests.sort()
    return bests[int(0.95 * len(bests))] if bests else 0.0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--rooms", type=int, default=150)
    ap.add_argument("--null-draws", type=int, default=60)
    ap.add_argument("--out", default=str(HERE / "policy-tournament.json"))
    ap.add_argument("--report", default=str(HERE / "POLICY-TOURNAMENT.md"))
    args = ap.parse_args()

    grades, room_states = race(args.rooms)
    rng = random.Random(SEED + 11)

    # §5 — rivals
    rivals = []
    for k in RIVALS:
        if k == "defaults":
            continue
        mean, ci = summarize(paired(grades, k), rng)
        rivals.append({"policy": k, "edge": mean, "ci95": ci,
                       "beats_defaults": ci[0] > 0 and mean > CC.EVEN_MONEY_BAND})
    rivals.sort(key=lambda r: -r["edge"])
    h1 = next(r for r in rivals if r["policy"] == "h1_phase")
    h1_beats_all = all(h1["edge"] > r["edge"] for r in rivals if r["policy"] != "h1_phase") \
        and h1["beats_defaults"]

    # §5 — per-phase optima with intervals
    phases = {"core": [], "endgame": []}
    for c in GRID_CORE:
        mean, ci = summarize(paired(grades, f"grid_core{c}"), rng)
        phases["core"].append({"ceiling_w": c, "edge": mean, "ci95": ci,
                               "straddles_default": ci[0] <= 0 <= ci[1]})
    for e in GRID_END:
        mean, ci = summarize(paired(grades, f"grid_end{e}"), rng)
        phases["endgame"].append({"ceiling_w": e, "edge": mean, "ci95": ci,
                                  "straddles_default": ci[0] <= 0 <= ci[1]})

    # §6 — conditional mining + its own null
    feats = [room_features(st) for st in room_states]
    flags = binarize(feats)
    STATES = list(flags.keys())
    conditional, coverage, rejected = [], {}, []
    WHY = {
        "GLOBAL": ("fires in ~every room — a CONSTANT, not a condition; its "
                   "'conditional' edge would be the global edge wearing a state "
                   "label. Folded into the GLOBAL domain (exp 21 / §5) where it "
                   "belongs. Do not re-propose as a condition."),
        "INSUFFICIENT-N": ("fires too rarely to estimate an edge — no verdict is "
                           "possible, and a number here would be noise wearing a "
                           "confidence interval. Re-propose only with an incidence "
                           "that lands inside the band."),
    }
    for sk in STATES:
        rows, n = mine_conditional(grades, flags, sk, rng)
        verdict, share, _ = classify_state(flags[sk])
        coverage[sk] = n
        if verdict != "OK":
            rejected.append({"state": sk, "classification": verdict,
                             "rooms_firing": n, "of": args.rooms,
                             "incidence": round(share, 3), "why": WHY[verdict]})
        conditional.extend(rows)
    conditional.sort(key=lambda r: -r["in_minus_out"])
    null_p95 = null_conditional_p95(grades, flags, STATES, args.null_draws,
                                    random.Random(SEED + 13))
    for r in conditional:
        r["clears_conditional_null"] = r["in_minus_out"] > null_p95 and r["ci95"][0] > 0
        r["machine_detectable"] = True     # structural: computed from live state only
        r["disposition"] = ("SHIP-CANDIDATE (both §6 conditions) — needs held-out + robot"
                            if r["clears_conditional_null"]
                            else "LEAN → manual-override cheat sheet, never automated")

    result = {"experiment": "2 — auto-adjuster policy tournament (§5 phase shapes, §6 conditional mining)",
              "rooms": args.rooms, "seed": SEED, "control": "defaults",
              "h1_beats_all_rivals": h1_beats_all, "rivals": rivals,
              "per_phase_optima": phases,
              "conditional_rules": conditional,
              "conditional_null_p95": round(null_p95, 2),
              "state_coverage_rooms": coverage,
              "rejected_states": rejected,
              "incidence_band": [LOW_BAND, HIGH_BAND],
              "caveats": [
                  "v1 money proxy (proj-normal weeks, weekly-high+RS; playoff $ excluded)",
                  "paired rooms + paired weekly luck; predicted opponent slates",
                  "the null MINES CONDITIONS TOO (permuted state labels, same grid)",
                  "September quantile re-run pre-registered; nothing installs itself",
              ]}
    Path(args.out).write_text(json.dumps(result, indent=1))

    L = ["# EXPERIMENT 2 — AUTO-ADJUSTER POLICY TOURNAMENT", "",
         f"_{args.rooms} paired rooms · control: hand-designed defaults · "
         f"**H1 beats all three rivals: {'YES' if h1_beats_all else 'NO'}**_", "",
         "## §5 — phase shapes (the comparative test)", "",
         "| policy | edge $ | 95% CI | beats defaults |", "|---|---|---|---|"]
    for r in rivals:
        L.append(f"| {r['policy']} | {r['edge']:+.2f} | [{r['ci95'][0]}, {r['ci95'][1]}] "
                 f"| {'YES' if r['beats_defaults'] else 'no'} |")
    L += ["", "### Per-phase optima (with intervals — read H1's shape off these)", "",
          "| phase | ceiling weight | edge $ | 95% CI | verdict |", "|---|---|---|---|---|"]
    for ph, rows in phases.items():
        for r in rows:
            v = ("no evidence of a shift" if r["straddles_default"]
                 else ("BETTER than default" if r["edge"] > 0 else "WORSE than default"))
            L.append(f"| {ph} | {r['ceiling_w']} | {r['edge']:+.2f} | "
                     f"[{r['ci95'][0]}, {r['ci95'][1]}] | {v} |")
    L += ["", "## §6 — conditional rules (state → setting → edge → confidence)", "",
          f"_conditional null p95 = **${null_p95:.2f}** (the null mines the SAME "
          f"policy×state grid over permuted state labels — {args.null_draws} draws). "
          f"State coverage: " + ", ".join(f"{k}={v} rooms" for k, v in coverage.items()) + "_", "",
          "| state | setting | edge $ (in-state) | in−out | 95% CI | n | disposition |",
          "|---|---|---|---|---|---|---|"]
    for r in conditional:
        L.append(f"| {r['state']} | {r['setting']} | {r['edge']:+.2f} | {r['in_minus_out']:+.2f} | "
                 f"[{r['ci95'][0]}, {r['ci95'][1]}] | {r['n_rooms']} | {r['disposition']} |")
    if rejected:
        L += ["", f"### States rejected by the incidence band "
              f"[{int(LOW_BAND*100)}%–{int(HIGH_BAND*100)}%] — logged so they are not re-proposed", "",
              "| state | incidence | classification | why |", "|---|---|---|---|"]
        for d in rejected:
            L.append(f"| `{d['state']}` | {d['rooms_firing']}/{d['of']} ({d['incidence']:.0%}) "
                     f"| **{d['classification']}** | {d['why']} |")
    L += ["", "### Pre-registered expectation (written before reading this run's rows)",
          "", "After the guard, surviving conditional rules will be **FEW** and their "
          "per-state n **small** — most land INSUFFICIENT-N or LEAN. The likeliest "
          "robust findings are one or two rules around the **run-response** and "
          "**my-turn-adjacency** states, where incidence genuinely varies room to "
          "room. **A short list of real conditions beats a long list of costumed "
          "globals**, and a run that produces zero shipping rules is the guard "
          "working, not the experiment failing."]
    L += ["", "**Caveats:** " + " · ".join(result["caveats"]), "",
          "_Every candidate state is computed from board/roster/pick state at the "
          "instant of the pick — machine-detectability is structural here, not a "
          "claim. Rules clearing the conditional null still need held-out validation "
          "and a cited robot scenario (fires in its trigger state and ONLY there) "
          "before entering Auto._"]
    Path(args.report).write_text("\n".join(L))

    print(f"H1 beats all rivals: {h1_beats_all}")
    for r in rivals:
        print(f"  {r['policy']:14s} {r['edge']:+8.2f} CI[{r['ci95'][0]:>7},{r['ci95'][1]:>7}]")
    print(f"conditional null p95 ${null_p95:.2f} (on in-minus-out); top rows:")
    for r in conditional[:4]:
        print(f"  {r['state']:18s} {r['setting']:14s} in {r['edge']:+7.2f} "
              f"in-out {r['in_minus_out']:+7.2f} {r['disposition'][:34]}")
    for d in rejected:
        print(f"rejected {d['state']:18s} {d['classification']:15s} incidence {d['incidence']:.0%}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
