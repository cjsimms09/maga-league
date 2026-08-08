#!/usr/bin/env python3
"""EXPERIMENT 19b — THE CORY-CONDITIONAL ARCHETYPE RACE (LAB-REGISTRY exp 19).

The league-general run answered "what wins in this league's economy" (nothing —
every archetype parked under the null; strategies converge on clear boards).
This is the OTHER half, the one that feeds the doctrine banner, the opening
script, and the Paths vocabulary: **continuations from MY actual keeper base
(Chase/Henry/Walker), at MY actual live picks (34, 41, 54…), on the PREDICTED
2026 board** — where the contested-decision density is highest.

Method (all inputs local — board artifact + predicted slates + 2026 payouts):
  * N seeded rooms. Opponents draft ADP-softmax from the predicted board (their
    predicted keepers seeded to their rosters, mine to mine); I draft each
    archetype CONTINUATION at my real picks — VORP-greedy WITHIN the archetype's
    sequencing constraint, so candidates differ ONLY in sequencing, which is
    exactly experiment 19's question.
  * Money grade per room: simulate 15 paying weeks — each team's weekly score ~
    Normal(sum of starters' weekly means, sqrt(sum weekly variances)) from the
    board's own proj/weekly_sd columns; $100 to each week's high; RS champ/
    runner-up by season total (2026 payouts). Playoff $ excluded, labeled.
  * The noise floor is PAIRED: candidate and control share every seed (same
    room, same opponent picks), so per-seed deltas isolate sequencing; the
    verdict band is the bootstrap 95% CI of the paired mean. A winner must
    clear $0 by the CI AND the even-money band. Anything else: Balanced stays
    enrolled, and the banner says so honestly.

Run: python draft/backtest/cory_conditional.py  → CORY-CONDITIONAL.{md,json}
"""
from __future__ import annotations
import argparse
import json
import math
import random
from pathlib import Path

HERE = Path(__file__).resolve().parent
BOARD = HERE.parent.parent / "public" / "draft_data.json"
PREDICTED = HERE.parent / "data" / "predicted_keepers.json"

STARTERS = {"QB": 1, "RB": 2, "WR": 2, "TE": 1, "K": 1, "DEF": 1}
FLEX = 1
FLEX_POS = {"RB", "WR", "TE"}
WEEKS = 15
WEEKLY_HIGH = 100
RS_CHAMP, RS_RUNNER = 250, 125
EVEN_MONEY_BAND = 4.0          # mirrors the engine's DG_NOISE_BAND
SEED = 20260808


# --- archetype constraint choosers (liveIdx = 1-based index of MY picks) ------

def _count(roster, pos):
    return sum(1 for p in roster if p["position"] == pos)


def make_archetypes():
    def within(board, allow):
        pool = [p for p in board if allow(p["position"])]
        return pool if pool else board          # unsatisfiable -> unconstrained
    return {
        "balanced": lambda b, i, r: b,
        "zero_rb": lambda b, i, r: within(b, lambda p: i >= 6 or p != "RB"),
        "hero_rb": lambda b, i, r: (within(b, lambda p: p == "RB") if (i == 2 and _count(r, "RB") == 0)
                                    else within(b, lambda p: p != "RB") if (i <= 8 and _count(r, "RB") >= 1)
                                    else b),
        "robust_rb": lambda b, i, r: (within(b, lambda p: p == "RB")
                                      if i <= 4 and (2 - _count(r, "RB")) >= (4 - (i - 1)) and _count(r, "RB") < 2
                                      else b),
        "wr_anchor": lambda b, i, r: (within(b, lambda p: p == "WR")
                                      if i <= 4 and (3 - _count(r, "WR")) >= (4 - (i - 1)) and _count(r, "WR") < 3
                                      else b),
        "elite_te": lambda b, i, r: (within(b, lambda p: p == "TE")
                                     if i == 2 and _count(r, "TE") == 0 else b),
        "early_qb": lambda b, i, r: (within(b, lambda p: p == "QB")
                                     if i == 3 and _count(r, "QB") == 0 else b),
        "late_qb": lambda b, i, r: within(b, lambda p: i >= 8 or p != "QB"),
    }


# --- the room -----------------------------------------------------------------

def load_world():
    board = json.loads(BOARD.read_text())
    predicted = json.loads(PREDICTED.read_text())
    my_picks = (board.get("pick_order") or {}).get("my_picks") or []
    pool = [{"player_id": str(p["player_id"]), "name": p.get("name"),
             "position": p.get("position"), "vorp": p.get("vorp") or 0.0,
             "proj_mean": p.get("proj_mean") or 0.0,
             "proj_ceiling": p.get("proj_ceiling") or p.get("proj_mean") or 0.0,
             "weekly_sd": p.get("weekly_sd") or 6.0,
             "team": p.get("team") or "FA",
             "adp": p.get("adjusted_adp") or p.get("raw_adp") or 999.0}
            for p in board.get("players", []) if (p.get("proj_mean") or 0) > 0]
    my_keepers = [{"player_id": str(k["player_id"]), "name": k.get("name"),
                   "position": k.get("position"), "vorp": k.get("vorp") or 0.0,
                   "proj_mean": k.get("proj_mean") or 0.0, "weekly_sd": 8.0}
                  for k in board.get("kept_players", [])]
    # Opponent predicted keepers, resolved onto the pool where possible.
    by_id = {p["player_id"]: p for p in pool}
    opp_keepers = {}
    for owner, v in (predicted.get("predictions") or {}).items():
        if owner == "coryjsimms":
            continue
        opp_keepers[owner] = [by_id[str(k["player_id"])]
                              for k in v.get("predicted_keepers", [])
                              if str(k.get("player_id")) in by_id]
    return pool, my_keepers, opp_keepers, my_picks


# THE CASCADE (herding) TERM — fitted to our own three drafts by
# sim_validation.py; see SIM-FIDELITY.md. Independent opponents NEVER cascade,
# so an independent room cannot generate a positional run at any temperature —
# which is why exp 2 §6 saw run_pressure at 0% incidence and mistook a MODEL
# limitation for a league fact. Real runs are correlated: one reach makes the
# next likelier as humans watch a position empty. This term reproduces that.
# FITTED = 1.0, and the fit is the finding: the INDEPENDENT sampler already
# reproduces our real run frequency at every definition tested (3-of-5: real
# 19.7 vs indep 21.7 runs/draft; 4-of-5: 7.7 vs 7.3; 5-of-5: 0.7 vs 0.9), so the
# data does not demand a large herding term — and magnitude 8 OVERSHOOTS badly
# (5-of-5: 5.3 vs real 0.7, seven times too many runs). The mechanism is built,
# parameterized and validated; its fitted magnitude is small because the
# independence hypothesis is NOT what was breaking run detection. See
# SIM-FIDELITY.md. What remains untested is run STRUCTURE (who runs, on what
# trigger) — frequency matching does not prove that, and it is listed as a
# standing limitation rather than assumed away.
CASCADE = 1.0            # fitted magnitude (SIM-FIDELITY.md fit grid)
CASCADE_WINDOW = 5       # picks of recent history the herd reacts to


def softmax_pick(board, rng, temp=6.0, recent=None, cascade=None):
    """Opponents draft near-ADP with human noise, PLUS herding: when a position's
    recent-pick density spikes, every agent's probability of taking that
    position rises. The magnitude is fitted, not assumed."""
    top = sorted(board, key=lambda p: p["adp"])[:12]
    w = [math.exp(-i / (temp / 2)) for i in range(len(top))]
    c = CASCADE if cascade is None else cascade
    if c and recent:
        window = recent[-CASCADE_WINDOW:]
        if window:
            dens = {}
            for pos in window:
                dens[pos] = dens.get(pos, 0) + 1
            for j, p in enumerate(top):
                d = dens.get(p["position"], 0) / len(window)
                w[j] *= (1.0 + c * d * d)     # quadratic: a real spike, not drift
    return rng.choices(top, weights=w, k=1)[0]


# HETEROGENEOUS ROOMS (2026-08-08): opponents are per-seat models fitted from
# three seasons of real drafts, not nine copies of one agent. Every verdict
# landed BEFORE this switch was measured against a homogeneous room and is
# re-validated against this one — see HETEROGENEOUS-VALIDATION.md.
_HET = None


def _het_picker():
    global _HET
    if _HET is None:
        import opponent_model as OM
        _HET = (OM.seat_params(OM.load_profiles()),
                OM.heterogeneous_picker(OM.seat_params(OM.load_profiles()),
                                        CASCADE, CASCADE_WINDOW))
    return _HET


def draft_room(pool, my_keepers, opp_keepers, my_picks, chooser, rng,
               heterogeneous=True):
    """One 10-team room; returns {team_idx: roster}. I am team 0.

    heterogeneous=True gives every opponent seat its OWN fitted model (the
    dossier-driven room). False restores the uniform sampler, kept so the
    pre-/post- comparison can be run on demand rather than remembered."""
    kept_ids = {p["player_id"] for ks in opp_keepers.values() for p in ks}
    kept_ids |= {p["player_id"] for p in my_keepers}
    board = [p for p in pool if p["player_id"] not in kept_ids]
    rosters = {0: list(my_keepers)}
    seat_name = {}
    for i, (owner, ks) in enumerate(sorted(opp_keepers.items()), start=1):
        rosters[i] = list(ks)
        seat_name[i] = owner
    while len(rosters) < 10:
        rosters[len(rosters)] = []
    my_set = set(my_picks)
    live_idx = 0
    total_picks = 150
    opp_order = [t for t in range(1, 10)]
    oi = 0
    recent = []                      # the herd's field of view
    for pick_no in range(1, total_picks + 1):
        if not board:
            break
        if pick_no in my_set:
            live_idx += 1
            allowed = chooser(board, live_idx, rosters[0])
            choice = max(allowed, key=lambda p: p["vorp"])
            rosters[0].append(choice)
        else:
            seat = opp_order[oi % len(opp_order)]
            if heterogeneous:
                _, pick_fn = _het_picker()
                choice = pick_fn(board, rng, seat_name.get(seat, ""), recent=recent)
            else:
                choice = softmax_pick(board, rng, recent=recent)
            rosters[seat].append(choice)
            oi += 1
        recent.append(choice["position"])
        board = [p for p in board if p["player_id"] != choice["player_id"]]
    return rosters


def draft_room_sequence(pool, my_keepers, opp_keepers, my_picks, rng, cascade=None):
    """The room's PICK SEQUENCE as positions — what sim_validation compares
    against the real drafts. Same sampler, same cascade, no strategy overlay."""
    kept = {p["player_id"] for ks in opp_keepers.values() for p in ks}
    kept |= {p["player_id"] for p in my_keepers}
    board = [p for p in pool if p["player_id"] not in kept]
    recent = []
    for _ in range(150):
        if not board:
            break
        choice = softmax_pick(board, rng, recent=recent, cascade=cascade)
        recent.append(choice["position"])
        board = [p for p in board if p["player_id"] != choice["player_id"]]
    return recent


def team_week_params(roster):
    """Best lineup by proj; weekly mean/sd under normal approx."""
    by_pos = {}
    for p in roster:
        by_pos.setdefault(p["position"], []).append(p)
    for pos in by_pos:
        by_pos[pos].sort(key=lambda p: -p["proj_mean"])
    starters, used = [], set()
    for pos, n in STARTERS.items():
        for p in by_pos.get(pos, [])[:n]:
            starters.append(p)
            used.add(p["player_id"])
    flex_cands = [p for pos in FLEX_POS for p in by_pos.get(pos, [])
                  if p["player_id"] not in used]
    flex_cands.sort(key=lambda p: -p["proj_mean"])
    starters.extend(flex_cands[:FLEX])
    mean = sum(p["proj_mean"] for p in starters) / WEEKS
    var = sum((p["weekly_sd"] or 6.0) ** 2 for p in starters)
    return mean, math.sqrt(var)


def grade_room(rosters, rng):
    """Simulate the paying weeks; return my dollars (weekly-high + RS)."""
    params = {t: team_week_params(r) for t, r in rosters.items()}
    totals = {t: 0.0 for t in rosters}
    my_wk = 0
    for _ in range(WEEKS):
        scores = {t: rng.gauss(m, sd) for t, (m, sd) in params.items()}
        hi = max(scores, key=lambda t: scores[t])
        if hi == 0:
            my_wk += WEEKLY_HIGH
        for t in totals:
            totals[t] += scores[t]
    rank = sorted(totals, key=lambda t: -totals[t]).index(0) + 1
    rs = RS_CHAMP if rank == 1 else RS_RUNNER if rank == 2 else 0
    return {"weekly_high": my_wk, "rs": rs, "total": my_wk + rs}


def race(n_rooms=200, seed=SEED):
    pool, my_keepers, opp_keepers, my_picks = load_world()
    arch = make_archetypes()
    per_seed = {k: [] for k in arch}
    diverg = {k: [] for k in arch}
    for s in range(n_rooms):
        room_rng = random.Random(seed + s)
        opp_state = room_rng.getstate()
        rosters_by_arch = {}
        for k, chooser in arch.items():
            r = random.Random()
            r.setstate(opp_state)              # SAME room for every candidate
            rosters_by_arch[k] = draft_room(pool, my_keepers, opp_keepers,
                                            my_picks, chooser, r)
        grade_rng_state = random.Random(seed * 7 + s).getstate()
        ctrl_roster = {p["player_id"] for p in rosters_by_arch["balanced"][0]}
        for k, rosters in rosters_by_arch.items():
            g = random.Random()
            g.setstate(grade_rng_state)        # SAME weekly luck for every candidate
            per_seed[k].append(grade_room(rosters, g)["total"])
            diverg[k].append(len({p["player_id"] for p in rosters[0]} - ctrl_roster))
    return per_seed, diverg


def bootstrap_ci(deltas, rng, n=2000):
    means = []
    for _ in range(n):
        sample = [rng.choice(deltas) for _ in deltas]
        means.append(sum(sample) / len(sample))
    means.sort()
    return means[int(0.025 * n)], means[int(0.975 * n)]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--rooms", type=int, default=200)
    ap.add_argument("--out", default=str(HERE / "cory-conditional.json"))
    ap.add_argument("--report", default=str(HERE / "CORY-CONDITIONAL.md"))
    args = ap.parse_args()

    per_seed, diverg = race(args.rooms)
    ctrl = per_seed["balanced"]
    rng = random.Random(SEED + 99)
    rows = []
    for k in per_seed:
        if k == "balanced":
            continue
        deltas = [a - b for a, b in zip(per_seed[k], ctrl)]
        mean = sum(deltas) / len(deltas)
        lo, hi = bootstrap_ci(deltas, rng)
        dv = sum(diverg[k]) / len(diverg[k])
        wins = (lo > 0 and mean > EVEN_MONEY_BAND)
        rows.append({"archetype": k, "mean_edge": round(mean, 2),
                     "ci95": [round(lo, 2), round(hi, 2)],
                     "mean_divergence": round(dv, 1),
                     "verdict": "WINNER — enroll as THE PLAN" if wins else
                     ("parked: CI includes $0" if lo <= 0 else
                      f"parked: edge inside the ${EVEN_MONEY_BAND} even-money band")})
    rows.sort(key=lambda r: -r["mean_edge"])
    enrolled = next((r["archetype"] for r in rows if r["verdict"].startswith("WINNER")),
                    "balanced")

    result = {"experiment": "19b Cory-conditional archetype race",
              "rooms": args.rooms, "seed": SEED,
              "control": "balanced", "enrolled": enrolled, "leaderboard": rows,
              "caveats": [
                  "money proxy v1: simulated weeks from proj_mean/weekly_sd normals; playoff $ excluded",
                  "predicted opponent slates (2 intel, 7 model) — regenerates when real designations land",
                  "opponents = ADP-softmax; the room does not adapt to my sequencing",
                  "paired seeds: candidate vs control share room AND weekly luck — deltas isolate sequencing",
              ]}
    Path(args.out).write_text(json.dumps(result, indent=1))

    L = ["# EXPERIMENT 19b — THE CORY-CONDITIONAL ARCHETYPE RACE", "",
         f"_my keepers + my picks (34, 41, 54…) on the PREDICTED board · {args.rooms} paired rooms · "
         f"control: Balanced · **ENROLLED: {enrolled.upper()}**_", "",
         "| archetype | mean edge $ | 95% CI | decisions ≠ control | verdict |", "|---|---|---|---|---|"]
    for r in rows:
        L.append(f"| {r['archetype']} | {r['mean_edge']:+.2f} | [{r['ci95'][0]}, {r['ci95'][1]}] "
                 f"| {r['mean_divergence']} | {r['verdict']} |")
    L += ["", "**Caveats:** " + " · ".join(result["caveats"]), "",
          "_The enrolled archetype feeds the doctrine banner, the opening script, and the "
          "Paths vocabulary in one pass. If Balanced stands, that IS the verdict — no "
          "invented conviction._"]
    Path(args.report).write_text("\n".join(L))
    for r in rows:
        print(f"{r['archetype']:12s} {r['mean_edge']:+8.2f}  CI[{r['ci95'][0]:>7}, {r['ci95'][1]:>7}]  div {r['mean_divergence']:>4}  {r['verdict']}")
    print(f"ENROLLED: {enrolled}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
