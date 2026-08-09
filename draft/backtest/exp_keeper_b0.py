#!/usr/bin/env python3
"""KEEPER-CONDITIONAL B0 — does "follow the market" survive Cory's keeper base?

The question (Cory, 2026-08-09): B0 (follow ADP) is the only draft policy that clears
a real null — but it was graded from an EMPTY/average seat. Cory keeps Chase (WR),
Henry (RB) and Walker (RB): both RB starter slots and a WR are pre-filled. Pure
ADP-following would hand him a FOURTH RB when his slots are full, because ADP encodes
construction for the AVERAGE drafter, not for his specific holdings. The rule that
actually applies is "follow the market AMONG PLAYERS WHO FIT MY ROSTER" — and it has
never been graded.

So race three policies FROM CORY'S SEAT, keepers locked, in the certified
dossier-driven room (reuses cory_conditional's load_world / draft_room / grade_room
and its PAIRED seeds + bootstrap null — no new money function):
  * balanced  — the VORP-greedy control (what the harness already grades against)
  * b0_pure   — follow ADP, ignore roster (take the lowest-ADP player, period)
  * b0_need   — follow ADP AMONG UNFILLED STARTER NEEDS; once starters+flex are full,
                revert to best-ADP (bench = best available)

Both B0 arms pick by ADP by returning a SINGLETON to draft_room, whose selection is
`max(vorp)` — a one-element set forces the exact ADP choice past the VORP tie-break.

WHAT IT CHANGES (pre-registered, both directions): if b0_need beats b0_pure past the
null, the draft-day rule is "follow the market WITHIN NEED" and the tool must mask
filled positions before recommending — a materially different, testable instruction.
If they tie, pure ADP already handles Cory's construction and "follow the market" is
clean as-is. Either way it reaches the pick-34 screen. No install without the gate.
"""
from __future__ import annotations
import json
import random
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import cory_conditional as CC   # noqa: E402  reuse the certified seat+keeper+grader

SEED = CC.SEED


def _adp(p):
    return p.get("adp", p.get("adjusted_adp", p.get("raw_adp", 1e9))) or 1e9


def _counts(roster):
    c = {}
    for p in roster:
        c[p["position"]] = c.get(p["position"], 0) + 1
    return c


def need_filter(board, roster):
    """Players at a position with an UNFILLED starter slot; if all dedicated starters
    are full, flex-eligible overflow while flex is open; else the whole board (bench =
    best available). Mirrors Cory's lineup: QB1 RB2 WR2 TE1 K1 DEF1 + 1 FLEX(RB/WR/TE)."""
    c = _counts(roster)
    needed = [p for p in board if c.get(p["position"], 0) < CC.STARTERS.get(p["position"], 0)]
    if needed:
        return needed
    flex_used = sum(max(0, c.get(pos, 0) - CC.STARTERS.get(pos, 0)) for pos in CC.FLEX_POS)
    if flex_used < CC.FLEX:
        flexc = [p for p in board if p["position"] in CC.FLEX_POS]
        if flexc:
            return flexc
    return board


def candidates():
    # Each returns a SINGLETON so draft_room's max(vorp) yields exactly the ADP pick.
    return {
        "balanced": lambda b, i, r: b,                                  # VORP-greedy control
        "b0_pure":  lambda b, i, r: [min(b, key=_adp)],                 # follow ADP, ignore roster
        "b0_need":  lambda b, i, r: [min(need_filter(b, r), key=_adp)], # follow ADP within need
    }


def snake_picks(seat, teams=10, rounds=15):
    """Overall pick numbers for a given snake SEAT (1-indexed). Cory's seat is still
    unassigned, so the rule must hold from any of them."""
    out = []
    for r in range(1, rounds + 1):
        s = seat if r % 2 == 1 else (teams - seat + 1)
        out.append((r - 1) * teams + s)
    return out


def race(n_rooms=200, seed=SEED, my_picks_override=None, my_keepers_override=None,
         heterogeneous=True):
    pool, my_keepers, opp_keepers, my_picks = CC.load_world()
    if my_picks_override is not None:
        my_picks = my_picks_override
    if my_keepers_override is not None:
        my_keepers = my_keepers_override
    cand = candidates()
    per_seed = {k: [] for k in cand}
    rb_taken = {k: [] for k in cand}      # how many RB each policy drafts (the 4th-RB tell)
    for s in range(n_rooms):
        opp_state = random.Random(seed + s).getstate()
        rosters_by = {}
        for k, chooser in cand.items():
            r = random.Random(); r.setstate(opp_state)     # SAME room for every candidate
            rosters_by[k] = CC.draft_room(pool, my_keepers, opp_keepers, my_picks, chooser, r,
                                          heterogeneous=heterogeneous)
        grade_state = random.Random(seed * 7 + s).getstate()
        for k, rosters in rosters_by.items():
            g = random.Random(); g.setstate(grade_state)   # SAME weekly luck for every candidate
            per_seed[k].append(CC.grade_room(rosters, g)["total"])
            # RB count on MY roster (seat 0), keepers included
            rb_taken[k].append(sum(1 for p in rosters[0] if p["position"] == "RB"))
    return per_seed, rb_taken


def _summary(per_seed, rb_taken):
    rng = random.Random(SEED)
    ctrl = per_seed["balanced"]
    out = {}
    for k in per_seed:
        deltas = [a - b for a, b in zip(per_seed[k], ctrl)]
        mean = sum(deltas) / len(deltas)
        lo, hi = CC.bootstrap_ci(deltas, rng) if k != "balanced" else (0.0, 0.0)
        out[k] = {"mean_vs_balanced": round(mean, 2), "ci95": [round(lo, 2), round(hi, 2)],
                  "mean_total": round(sum(per_seed[k]) / len(per_seed[k]), 2),
                  "avg_RB_on_my_roster": round(sum(rb_taken[k]) / len(rb_taken[k]), 2)}
    # the head-to-head that answers the question: b0_need vs b0_pure (paired)
    hh = [a - b for a, b in zip(per_seed["b0_need"], per_seed["b0_pure"])]
    hmean = sum(hh) / len(hh)
    hlo, hhi = CC.bootstrap_ci(hh, random.Random(SEED + 1))
    return out, {"mean": round(hmean, 2), "ci95": [round(hlo, 2), round(hhi, 2)],
                 "b0_need_beats_b0_pure": bool(hlo > 0)}


def run(n_rooms=200):
    per_seed, rb_taken = race(n_rooms=n_rooms)
    per_policy, head = _summary(per_seed, rb_taken)
    return {
        "experiment": "keeper-conditional B0 — follow-the-market vs follow-within-need, Cory's seat",
        "n_rooms": n_rooms, "seat": "Cory (roster 0)",
        "keepers": "Chase (WR), Henry (RB), Walker (RB) — RB starters + 1 WR pre-filled",
        "control": "balanced (VORP-greedy)",
        "per_policy_vs_balanced": per_policy,
        "b0_need_vs_b0_pure_head_to_head": head,
        "reads": ("If b0_need beats b0_pure past the null (CI clear of $0), the draft-day rule is "
                  "'follow the market WITHIN NEED' and the tool must mask filled positions. If they "
                  "tie, pure ADP already handles Cory's construction. avg_RB_on_my_roster exposes the "
                  "4th-RB problem: b0_pure should carry more RB than b0_need given the RB keepers."),
        "source_tier": "league-primary (MC room from dossiers; paired null)",
    }


def _head_to_head(per_seed, seed=SEED):
    """b0_need - b0_pure, paired; returns (mean, [lo,hi], beats)."""
    hh = [a - b for a, b in zip(per_seed["b0_need"], per_seed["b0_pure"])]
    m = sum(hh) / len(hh)
    lo, hi = CC.bootstrap_ci(hh, random.Random(seed + 1))
    return round(m, 2), [round(lo, 2), round(hi, 2)], bool(lo > 0)


def _avg_rb(rb_taken):
    return {k: round(sum(v) / len(v), 2) for k, v in rb_taken.items()}


def robustness(n_rooms=100):
    """Stress the +$258 headline: across seats (Cory's is unassigned), under a
    different opponent model, and under alternate keeper slates (an unpredicted
    keeper changes the need structure). Report where the margin WEAKENS."""
    _, base_keepers, _, _ = CC.load_world()
    result = {"n_rooms_per_cell": n_rooms}

    # 1. ACROSS SEATS — does need>pure hold from every draft slot?
    seats = {}
    for seat in range(1, 11):
        ps, rb = race(n_rooms=n_rooms, my_picks_override=snake_picks(seat))
        m, ci, beats = _head_to_head(ps)
        seats[seat] = {"need_minus_pure": m, "ci95": ci, "holds": beats,
                       "avg_RB": _avg_rb(rb)}
    result["across_seats"] = seats
    result["across_seats_all_hold"] = all(v["holds"] for v in seats.values())

    # 2. OPPONENT MODEL — dossier (heterogeneous) vs uniform sampler. True frozen
    #    fixed-sequence needs the replay harness; the uniform room is the available
    #    contrast for "does the room model drive the result".
    model = {}
    for name, het in (("dossier", True), ("uniform", False)):
        ps, rb = race(n_rooms=n_rooms, heterogeneous=het)
        m, ci, beats = _head_to_head(ps)
        model[name] = {"need_minus_pure": m, "ci95": ci, "holds": beats}
    result["opponent_model"] = model

    # 3. ALTERNATE KEEPER SLATES — the margin should track the need structure: fewer
    #    RB kept -> less over-draft to avoid -> smaller margin. That is the honest
    #    dependency, and it tells Cory the rule matters MOST exactly when his RB slots
    #    are pre-filled (his actual case).
    def swap(pos_from, pos_to):
        # flip one kept player's position label to change the need structure
        out, flipped = [], False
        for k in base_keepers:
            if not flipped and k["position"] == pos_from:
                out.append({**k, "position": pos_to}); flipped = True
            else:
                out.append(dict(k))
        return out
    slates = {"actual (Chase WR, Henry+Walker RB)": base_keepers,
              "one RB instead a WR (RB slots NOT full)": swap("RB", "WR"),
              "one RB instead a TE": swap("RB", "TE")}
    ks = {}
    for name, kp in slates.items():
        ps, rb = race(n_rooms=n_rooms, my_keepers_override=kp)
        m, ci, beats = _head_to_head(ps)
        ks[name] = {"need_minus_pure": m, "ci95": ci, "holds": beats,
                    "kept_RB": sum(1 for p in kp if p["position"] == "RB")}
    result["alternate_keepers"] = ks
    result["reads"] = ("Rule holds where CI clears $0. Expected weakenings: the margin "
                       "SHRINKS as fewer RB are kept (less over-draft to prevent) — that is "
                       "correct, not a failure. If it flips sign anywhere, that seat/slate is "
                       "where 'within need' stops paying and the tool should say so.")
    return result


if __name__ == "__main__":   # pragma: no cover
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--rooms", type=int, default=200)
    ap.add_argument("--robust", action="store_true", help="run the robustness sweep")
    ap.add_argument("--out", default=str(HERE / "exp_keeper_b0.json"))
    a = ap.parse_args()
    if a.robust:
        rob = robustness(n_rooms=max(60, a.rooms // 2))
        Path(HERE / "exp_keeper_b0_robust.json").write_text(json.dumps(rob, indent=2))
        print(json.dumps({
            "across_seats_all_hold": rob["across_seats_all_hold"],
            "seats": {s: (v["need_minus_pure"], v["ci95"], v["avg_RB"]["b0_pure"], v["avg_RB"]["b0_need"])
                      for s, v in rob["across_seats"].items()},
            "opponent_model": {k: (v["need_minus_pure"], v["ci95"]) for k, v in rob["opponent_model"].items()},
            "alt_keepers": {k: (v["need_minus_pure"], v["ci95"], v["kept_RB"]) for k, v in rob["alternate_keepers"].items()},
        }, indent=2))
        raise SystemExit(0)
    res = run(n_rooms=a.rooms)
    Path(a.out).write_text(json.dumps(res, indent=2))
    print(json.dumps({"per_policy": {k: {"vs_balanced": v["mean_vs_balanced"], "ci95": v["ci95"],
                                          "avg_RB": v["avg_RB_on_my_roster"]}
                                     for k, v in res["per_policy_vs_balanced"].items()},
                      "b0_need_vs_b0_pure": res["b0_need_vs_b0_pure_head_to_head"]}, indent=2))
