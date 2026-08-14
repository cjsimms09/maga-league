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

# The bracket. Read from the payout table rather than typed here, so a payout
# revision reaches the simulator the same way it reaches every other consumer —
# payouts.json is the money function's ground truth, and a second copy of these
# numbers is a second thing to forget to update.
PLAYOFF_TEAMS = 4


def _playoff_pay(season="2026"):
    p = json.loads((HERE.parent / "config" / "payouts.json").read_text())
    block = ((p.get("by_season") or {}).get(str(season)) or {}).get("playoffs") or {}
    return {int(k): float(v) for k, v in block.items() if str(k).isdigit()}


PLAYOFF_PAY = _playoff_pay()


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


def unfilled_starters(roster):
    """Mandatory starting slots this roster CANNOT fill, e.g. {"QB": 1}.

    `team_week_params` scores the best lineup it can build and silently skips a
    slot it cannot fill — a roster with no quarterback simply plays without one
    and scores less. That is the right behaviour for a grader and a catastrophic
    one for a CONTROL: a candidate that merely owns a legal roster then beats it
    by the whole value of the missing starter, and the difference gets reported
    as a strategy edge.

    So the gap is measured rather than assumed. See `control_validity`.
    """
    have = {}
    for p in roster:
        have[p["position"]] = have.get(p["position"], 0) + 1
    short = {}
    for pos, n in STARTERS.items():
        gap = n - have.get(pos, 0)
        if gap > 0:
            short[pos] = gap
    return short


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
    """Simulate the paying weeks; return my dollars (weekly-high + RS + playoffs).

    PLAYOFF $ IS 53% OF THE POT ($2,125 of $4,000). Grading without it measured
    every strategy on the smaller half of the money and — worse — priced
    "make the bracket" at zero, when reaching it is the largest payday
    available. The bracket mirrors the real one, whose format
    `money_grade.simulate_bracket` derived from the harvested brackets: four
    teams by regular-season rank, 1v4 and 2v3, then a final and a third-place
    game, each decided on that week's score.

    LIMITATION, stated rather than buried: seeding is by season TOTAL POINTS
    because this room has no schedule to produce a win-loss record, while the
    real league seeds by wins and breaks ties on points. Points-based seeding is
    a strictly less noisy ranking than the real one, so it understates how often
    a mid-table team backs into the bracket. That belongs in the simulator's
    standing limitation list, not papered over.
    """
    params = {t: team_week_params(r) for t, r in rosters.items()}
    totals = {t: 0.0 for t in rosters}
    my_wk = 0
    for _ in range(WEEKS):
        scores = {t: rng.gauss(m, sd) for t, (m, sd) in params.items()}
        hi = max(scores, key=lambda t: scores[t])
        if hi == 0:
            my_wk += WEEKLY_HIGH        # weekly-high is REGULAR SEASON ONLY
        for t in totals:
            totals[t] += scores[t]

    rs, po, place = postseason_dollars(params, totals, rng)
    return {"weekly_high": my_wk, "rs": rs, "playoff": po, "place": place,
            "total": my_wk + rs + po}


def postseason_dollars(params, totals, rng):
    """RS prize + resimulated bracket for seat 0. Returns (rs, playoff, place).

    Shared by every room grader (`grade_room` here, `grade_room_corr` in the
    stack sweep) so no experiment can quietly run on a different money function
    than its neighbours — the failure this refactor exists to prevent is one
    grader keeping playoff $ and another not, with both reported in the same
    table as if they were comparable.
    """
    order = sorted(totals, key=lambda t: -totals[t])
    rank = order.index(0) + 1
    rs = RS_CHAMP if rank == 1 else RS_RUNNER if rank == 2 else 0

    # The bracket. Seeds are order[0..3]; a playoff week is one more draw from
    # the same weekly distribution, so a strategy's ceiling matters here exactly
    # as much as it does in the weekly-high pool.
    seeds = order[:PLAYOFF_TEAMS]
    place = None
    if 0 in seeds:
        def game(a, b):
            sa = rng.gauss(*params[a])
            sb = rng.gauss(*params[b])
            return (a, b) if sa >= sb else (b, a)   # exact ties are measure-zero here
        w1, l1 = game(seeds[0], seeds[3])
        w2, l2 = game(seeds[1], seeds[2])
        champ, runner = game(w1, w2)
        third, fourth = game(l1, l2)
        place = {champ: 1, runner: 2, third: 3, fourth: 4}[0]
    return rs, PLAYOFF_PAY.get(place, 0), place


def race(n_rooms=200, seed=SEED):
    pool, my_keepers, opp_keepers, my_picks = load_world()
    arch = make_archetypes()
    per_seed = {k: [] for k in arch}
    diverg = {k: [] for k in arch}
    # THE CONTROL'S OWN ROSTER LEGALITY, per room. Every edge in this experiment
    # is measured AGAINST the control, so a control that cannot field a starter
    # is not a baseline — it is a handicap, and every candidate that happens to
    # own that starter collects its full season value as a "strategy edge".
    control_short = []
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
        control_short.append(unfilled_starters(rosters_by_arch["balanced"][0]))
        ctrl_roster = {p["player_id"] for p in rosters_by_arch["balanced"][0]}
        for k, rosters in rosters_by_arch.items():
            g = random.Random()
            g.setstate(grade_rng_state)        # SAME weekly luck for every candidate
            per_seed[k].append(grade_room(rosters, g)["total"])
            diverg[k].append(len({p["player_id"] for p in rosters[0]} - ctrl_roster))
    return per_seed, diverg, control_short


def control_validity(control_short):
    """Summarise the control's roster legality across rooms.

    Returns {rooms, illegal, rate, by_slot} — `rate` is the fraction of rooms in
    which the control could NOT field the mandatory starting lineup, and
    `by_slot` counts which slot went unfilled.
    """
    n = len(control_short) or 1
    bad = [s for s in control_short if s]
    by_slot = {}
    for s in bad:
        for pos, gap in s.items():
            by_slot[pos] = by_slot.get(pos, 0) + gap
    return {"rooms": len(control_short), "illegal": len(bad),
            "rate": round(len(bad) / n, 3), "by_slot": by_slot}


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

    per_seed, diverg, control_short = race(args.rooms)
    validity = control_validity(control_short)
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
                     # THE LABEL MUST MATCH THE INTERVAL. This read `lo <= 0`,
                     # which is true of ANY negative lower bound — so a result
                     # sitting ENTIRELY below zero was reported as "CI includes
                     # $0", i.e. as inconclusive. `late_qb` at [-71.00, -23.38]
                     # is not inconclusive; under this grader it is significantly
                     # WORSE than the control, and saying so is the whole point
                     # of printing an interval. Zero is inside [lo, hi] only when
                     # lo <= 0 <= hi.
                     "verdict": "WINNER — enroll as THE PLAN" if wins else
                     ("LOSER — significantly worse than the control" if hi < 0 else
                      "parked: CI includes $0" if lo <= 0 <= hi else
                      f"parked: edge inside the ${EVEN_MONEY_BAND} even-money band")})
    rows.sort(key=lambda r: -r["mean_edge"])

    # THE HEAD-TO-HEAD GATE.
    #
    # Clearing the control is necessary, not sufficient. When two archetypes both
    # clear it, ranking them by raw mean hands the plan to whichever won a coin
    # flip — exactly the noise-chasing every other gate here exists to prevent.
    # The rooms are PAIRED, so leader-minus-runner-up is a legitimate paired
    # delta with its own bootstrap CI. The leader is enrolled only if it beats
    # the runner-up by more than the even-money band with a CI clear of $0.
    #
    # Otherwise they are CO-LEADERS and the INCUMBENT is retained. Same principle
    # as the doctrine banner's hysteresis: a plan that changes on a difference
    # the data cannot resolve is not a plan.
    winners = [r for r in rows if r["verdict"].startswith("WINNER")]
    incumbent = None
    try:
        incumbent = json.loads(Path(args.out).read_text()).get("enrolled")
    except (OSError, json.JSONDecodeError):
        pass

    # ── THE CONTROL-VALIDITY GATE ────────────────────────────────────────────
    #
    # Measured 2026-08-14: the control fields NO QUARTERBACK in 85% of rooms.
    # The chooser is `max(allowed, key=vorp)` and the grader is
    # `sum(proj_mean of starters)` — two different currencies. QB VORP is low
    # BECAUSE quarterbacks are replaceable (Allen 63.8 against Gibbs 156.0), so
    # a VORP-greedy seat never spends a pick on one; the grader then scores a
    # lineup with an empty QB slot and docks it the full ~350 points.
    #
    # `early_qb` is the archetype FORCED to take a quarterback. Its roster
    # differs from the control by exactly ONE player (divergence 1.0) and it
    # "wins" by +$352.75 — which is not a sequencing edge but the price of
    # owning a starter the control never bought. Every other candidate is
    # measured against the same broken baseline.
    #
    # So the race does not enroll anything until the control can field the
    # lineup it is graded on. This is a REFUSAL, not a new belief: it withdraws
    # a verdict the design cannot support and leaves the banner on the control.
    CONTROL_MAX_ILLEGAL = 0.10
    void_reason = None
    if validity["rate"] > CONTROL_MAX_ILLEGAL:
        void_reason = (
            f"control could not field the mandatory lineup in "
            f"{validity['illegal']}/{validity['rooms']} rooms "
            f"({validity['rate']:.0%}; unfilled {validity['by_slot']}). "
            f"Every edge here is measured against that roster, so a candidate "
            f"forced to buy the missing starter collects its season value as a "
            f"strategy edge. NOTHING ENROLLS until the chooser and the grader "
            f"use the same currency.")

    head_to_head = None
    if void_reason:
        enrolled = "balanced"
        winners = []
        # A row reading "WINNER — enroll as THE PLAN" beside `enrolled: balanced`
        # is a contradiction the next reader has to resolve, and the appealing
        # resolution is the wrong one. Restate every verdict in terms of what the
        # gate actually found, so the artifact cannot be quoted a row at a time.
        for r in rows:
            if r["verdict"].startswith("WINNER"):
                r["verdict"] = ("VOID — margin is the missing starter, not a "
                                "strategy edge")
            elif r["verdict"].startswith("LOSER"):
                r["verdict"] = "VOID — measured against an unfillable control"
            else:
                r["verdict"] = "VOID — control invalid"
    elif not winners:
        enrolled = "balanced"
    elif len(winners) == 1:
        enrolled = winners[0]["archetype"]
    else:
        lead, runner = winners[0]["archetype"], winners[1]["archetype"]
        h2h = [a - b for a, b in zip(per_seed[lead], per_seed[runner])]
        h_mean = sum(h2h) / len(h2h)
        h_lo, h_hi = bootstrap_ci(h2h, random.Random(SEED + 123))
        separable = h_lo > 0 and h_mean > EVEN_MONEY_BAND
        if separable:
            enrolled = lead
        elif incumbent in (lead, runner):
            enrolled = incumbent          # inseparable — do not churn the plan
        else:
            enrolled = lead               # no incumbent among them; take the leader
        head_to_head = {
            "leader": lead, "runner_up": runner,
            "paired_mean": round(h_mean, 2),
            "ci95": [round(h_lo, 2), round(h_hi, 2)],
            "separable": separable,
            "resolution": ("leader separates from the runner-up" if separable else
                           f"CO-LEADERS — inseparable; retained {enrolled}"),
        }

    result = {"experiment": "19b Cory-conditional archetype race",
              "rooms": args.rooms, "seed": SEED,
              "control": "balanced", "enrolled": enrolled, "leaderboard": rows,
              "head_to_head": head_to_head,
              "control_validity": validity,
              "void_reason": void_reason,
              "caveats": [
                  "money proxy v1: simulated weeks from proj_mean/weekly_sd normals",
                  "playoff $ INCLUDED (bracket resim, 53% of the pot); bracket seeding is by "
                  "season total points — this room has no schedule, so it cannot seed by record",
                  "predicted opponent slates (2 intel, 7 model) — regenerates when real designations land",
                  # WAS "opponents = ADP-softmax", which stopped being true when
                  # heterogeneous rooms landed 2026-08-08 and `draft_room` began
                  # defaulting to the fitted per-seat models. A caveat that
                  # describes a sampler the run did not use is worse than none:
                  # it invites exactly the objection it no longer answers.
                  "opponents = per-seat models fitted from three seasons of real "
                  "drafts (heterogeneous=True); the room does not adapt to my sequencing",
                  "MY seat is VORP-greedy inside each archetype's constraint, while the "
                  "grader scores proj_mean of the best startable lineup — two currencies. "
                  "See the control-validity gate.",
                  "paired seeds: candidate vs control share room AND weekly luck — deltas isolate sequencing",
              ]}
    Path(args.out).write_text(json.dumps(result, indent=1))

    L = ["# EXPERIMENT 19b — THE CORY-CONDITIONAL ARCHETYPE RACE", "",
         f"_my keepers + my picks (34, 41, 54…) on the PREDICTED board · {args.rooms} paired rooms · "
         f"control: Balanced · **ENROLLED: {enrolled.upper()}**_", "",
         ]
    if void_reason:
        L[2] = (f"_{args.rooms} paired rooms · control: Balanced · "
                f"**RACE VOID — NOTHING ENROLLED**_")
        L += ["> ## ⛔ THE RACE IS VOID — READ THIS BEFORE THE TABLE", ">",
              f"> {void_reason}", ">",
              "> The numbers below are printed because deleting them would hide the "
              "defect, NOT because they rank anything. **The leader's margin is the "
              "price of a starter the control never bought.** Treat every row as "
              "evidence about the harness and none of it as evidence about a draft "
              "strategy.", ""]
    L += ["| archetype | mean edge $ | 95% CI | decisions ≠ control | verdict |",
          "|---|---|---|---|---|"]
    for r in rows:
        L.append(f"| {r['archetype']} | {r['mean_edge']:+.2f} | [{r['ci95'][0]}, {r['ci95'][1]}] "
                 f"| {r['mean_divergence']} | {r['verdict']} |")
    if head_to_head:
        h = head_to_head
        L += ["", "### Head-to-head (the tie-break gate)",
              f"Two archetypes cleared the control, so ranking by raw mean would hand the plan to "
              f"whichever won a coin flip. Paired delta **{h['leader']} − {h['runner_up']} = "
              f"{h['paired_mean']:+.2f}**, CI [{h['ci95'][0]}, {h['ci95'][1]}] — "
              + ("**separable**, the leader is enrolled on its own merit."
                 if h["separable"] else
                 f"**not separable**. {h['resolution']}. A plan that changes on a difference the "
                 "data cannot resolve is not a plan.")]
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
