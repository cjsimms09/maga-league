# TERRITORY: A
"""IS THE MIDDLE OF THE DRAFT DEAD, OR MERELY FLAT? — Cory's barbell, Q1.

Cory, 2026-08-17, verbatim: "It almost feels like it's useful to draft middle
tier players with no upside.. either they're a starter who is average or above
(go in first 8 rounds) or you need to draft upside or injury opportunity?"

`empirical_draft_value_2026-08-16.md` already established that rounds 7-15 are
FLAT — every round's mean sits inside every other round's 95% interval. Flat is
not the claim. **DEAD is the claim: that these picks return less than the
alternative use of the roster spot.** Flat and dead are different statements and
this module is the one that separates them.

WHAT IS REUSED UNMODIFIED, and why that matters more than the new code: every
loader, every statistic and every survivorship rule comes from
`empirical_draft_value.py` by import — `pick_rows`, `universe`, `season_totals`,
`cluster_boot`, `wilson`, `realized_replacement`, the Arm E/Arm Z split, the
weeks-1-17 window, the stability rule. A second copy of any of those would be a
second definition of the same fact, which is the defect class this repo has
found a dozen times. The LEAGUE-WINNER label is imported from
`tiered_outcome_model.py` for the same reason. **Nothing here re-derives an
outcome that another committed module already derives.**

THREE BENCHMARKS FOR "DEAD", all preregistered in
`draft/audit/barbell_strategy_2026-08-17.md` §4.1, all reported even where they
disagree:

  (a) REPLACEMENT — the outcome-space level at each position's starter rank.
  (b) THE WAIVER WIRE — what the roster spot would have returned if it had been
      streamed instead of drafted. Two levels are published in wire_level.json
      and BOTH are used as a bracket, because they bound the truth from
      opposite sides: `ongoing.per_week` (median of the three weeks AFTER
      acquisition = a HELD add, primary) and `per_week` (acquisition-week median
      over adds that were actually started = CHURNING the slot, selection-biased
      upward, an upper bound).
      **THE COUNTERFACTUAL IS THE ARGUABLE PART AND IS STATED RATHER THAN
      BURIED:** `wire x 17` assumes the spot could have been streamed from week
      1, which is what "alternative use of the roster spot" means and is not
      what any manager literally does. K/DEF are absent from the wire artifact
      (nflverse is offence-only) — unmeasurable, not zero, and excluded.
  (c) BEST AVAILABLE AT THE SAME PICK — the hindsight ceiling still on the
      board, and the blind-draw mean over the same remaining pool. The second
      one answers a different question from (a) and (b): not "is this spot
      worth a roster slot" but "does CHOOSING within this round carry any
      information at all".

AND THE BARBELL'S OWN SHAPE, which is the crux and is not a value question:
P(LEAGUE-WINNER) by round band. Cory's sentence claims the middle is dominated
by BOTH ends — safer than the late rounds AND with less upside. If the late
band carries a right tail the middle band lacks, he is right about the SHAPE of
the draft even if no allocation can exploit it.

Run:    python3 draft/backtest/barbell_middle.py
Writes: draft/backtest/barbell_middle.json
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import empirical_draft_value as EDV          # noqa: E402
import tiered_outcome_model as TOM           # noqa: E402

DATA = EDV.DATA
POSITIONS = EDV.POSITIONS
SEASONS = EDV.SEASONS
LAST_SCORED_WEEK = EDV.LAST_SCORED_WEEK

#: Cory's phase boundary, verbatim from his sentence ("first 8 rounds"), not
#: fitted. Rounds 4-8 are the ANCHOR phase, 9-15 the SWING phase; rounds 1-3 are
#: the keeper ledger in this league and are reported separately, never pooled.
BARBELL_PHASE_BOUNDARY = 8

#: The bands this module reports. The first is the keeper ledger and is kept
#: apart from every claim; "MIDDLE" is the band Cory's hypothesis indicts.
BANDS = (
    ("1-3 (keeper ledger)", 1, 3),
    ("4-6 EARLY", 4, 6),
    ("7-10 MIDDLE", 7, 10),
    ("11-15 LATE", 11, 15),
)

#: The barbell's own two-phase split of the OPEN-MARKET draft.
PHASES = (("4-8 ANCHOR phase", 4, 8), ("9-15 SWING phase", 9, 15))

NFL_WEEKS_SCORED = LAST_SCORED_WEEK   # a season of one roster spot, weeks 1-17


# ── the wire, the one input this module adds ────────────────────────────────

def wire_levels() -> dict:
    """Season-equivalent value of ONE roster spot if streamed rather than drafted.

    Both published statistics are returned. Neither is 'the' answer: `held` is
    what a wire add actually delivers once you keep him, `churned` is what the
    adds you chose to START delivered in their acquisition week, and the second
    is selection-biased upward by construction. The truth for a roster spot lies
    between them, so both travel with every comparison.
    """
    doc = json.loads((DATA / "wire_level.json").read_text())
    held = doc["ongoing"]["per_week"]
    churned = doc["per_week"]
    return {
        "held_season": {p: round(float(held[p]) * NFL_WEEKS_SCORED, 1)
                        for p in POSITIONS if p in held},
        "churned_season": {p: round(float(churned[p]) * NFL_WEEKS_SCORED, 1)
                           for p in POSITIONS if p in churned},
        "held_per_week": {p: float(held[p]) for p in POSITIONS if p in held},
        "churned_per_week": {p: float(churned[p]) for p in POSITIONS if p in churned},
        "n_scored_acquisitions": doc.get("scored"),
        "seasons": doc.get("seasons"),
        "caveat": doc["ongoing"]["caveat"],
        "absent_positions": [p for p in ("K", "DEF") if p not in held],
    }


# ── (c) what was still on the board at each pick ────────────────────────────

def board_state(positions: dict) -> dict:
    """{season: {pick_no: {'best': pts, 'best_pid': pid, 'blind_mean': pts,
                            'pool_n': n}}}.

    The remaining pool at pick P is every skill player with >=1 game in season Y
    (the Arm E universe) minus everyone taken at picks < P. `best` is the
    hindsight ceiling still available; `blind_mean` is the mean over that pool,
    i.e. what a blindfolded pick returns in expectation.

    A player drafted in this league but with no game that season is removed from
    the pool anyway when his pick passes — he was genuinely unavailable
    afterwards — but he was never IN the Arm E universe, so nothing is
    double-counted.
    """
    drafts = EDV.league_drafts()
    out: dict[int, dict] = {}
    for season in SEASONS:
        uni = EDV.universe(season, positions)
        pool = {}
        for pos in POSITIONS:
            for pid, pts in uni[pos]:
                pool[pid] = pts
        taken: set = set()
        per_pick = {}
        for row in drafts[season]:
            remaining = [(pid, pts) for pid, pts in pool.items() if pid not in taken]
            if remaining:
                best_pid, best = max(remaining, key=lambda t: t[1])
                blind = sum(p for _, p in remaining) / len(remaining)
            else:                       # cannot happen at 150 picks; honest anyway
                best_pid, best, blind = None, None, None
            per_pick[row["pick_no"]] = {
                "best": None if best is None else round(best, 1),
                "best_pid": best_pid,
                "blind_mean": None if blind is None else round(blind, 1),
                "pool_n": len(remaining),
            }
            taken.add(row["pid"])
        out[season] = per_pick
    return out


# ── the measurements ────────────────────────────────────────────────────────

def _band_of(rnd: int, bands=BANDS):
    for label, lo, hi in bands:
        if lo <= rnd <= hi:
            return label
    return None


def _grouped(rows: list, key) -> dict:
    """{season: [items]} for the season-clustered bootstrap."""
    out: dict = {}
    for r in rows:
        out.setdefault(r["season"], []).append(key(r))
    return out


def value_over_alternatives(rows: list, positions: dict, wire: dict,
                            arm: str = "E") -> dict:
    """(a) and (b): every open-market skill pick against replacement and wire.

    Rounds 1-3 are reported but never pooled into a claim — 72 of those 90 picks
    are keepers (empirical study GAP 2), so that band is an administered price,
    not a market.
    """
    picks = EDV._arm(rows, arm)
    repl = EDV.realized_replacement(positions)
    held = wire["held_season"]
    churned = wire["churned_season"]

    out = {"arm": arm, "replacement_used": repl,
           "wire_held_season": held, "wire_churned_season": churned,
           "by_band": {}, "by_band_position": {}, "by_phase": {}}

    def cell(sub: list) -> dict:
        if not sub:
            return {"n": 0}
        pts = [r["pts"] for r in sub]
        res = {
            "n": len(sub),
            "mean": round(EDV.mean(pts), 1),
            "median": round(EDV.median(pts), 1),
            "seasons": sorted({r["season"] for r in sub}),
        }
        res["ci95"] = [round(x, 1) for x in EDV.cluster_boot(
            _grouped(sub, lambda r: r["pts"]), EDV.mean)]
        for name, table in (("vs_replacement", repl), ("vs_wire_held", held),
                            ("vs_wire_churned", churned)):
            usable = [r for r in sub if r["pos"] in table]
            if not usable:
                res[name] = None
                continue
            deltas = [(r, r["pts"] - table[r["pos"]]) for r in usable]
            vals = [d for _, d in deltas]
            lo, hi = EDV.cluster_boot(
                {s: [d for r, d in deltas if r["season"] == s] for s in
                 sorted({r["season"] for r, _ in deltas})}, EDV.mean)
            per_season = {}
            for s in sorted({r["season"] for r, _ in deltas}):
                per_season[s] = round(EDV.mean(
                    [d for r, d in deltas if r["season"] == s]), 1)
            signs = {1 if v > 0 else (-1 if v < 0 else 0) for v in per_season.values()}
            res[name] = {
                "n": len(vals),
                "mean": round(EDV.mean(vals), 1),
                "ci95": [round(lo, 1), round(hi, 1)],
                "per_season": per_season,
                # The stability rule (empirical study §2.3): CI excluding the
                # null AND the same sign in >=2 of 3 seasons.
                "seasons_agreeing_with_pooled_sign": _seasons_agreeing(
                    per_season, 1 if EDV.mean(vals) > 0 else -1),
                "verdict": _verdict(lo, hi, per_season),
            }
        return res

    for label, lo, hi in BANDS:
        sub = [r for r in picks if lo <= r["round"] <= hi]
        out["by_band"][label] = cell(sub)
        for pos in POSITIONS:
            out["by_band_position"][f"{label}|{pos}"] = cell(
                [r for r in sub if r["pos"] == pos])
    for label, lo, hi in PHASES:
        out["by_phase"][label] = cell(
            [r for r in picks if lo <= r["round"] <= hi])
    # Per-round, so "flat" and "dead" can be read off the same table.
    out["by_round"] = {f"R{r}": cell([x for x in picks if x["round"] == r])
                       for r in range(1, EDV.ROUNDS + 1)}
    return out


def _seasons_agreeing(per_season: dict, direction: int) -> int:
    """Seasons whose own effect has the SAME sign as the pooled effect.

    Not `max(positives, negatives)`. That version was written first, and
    `test_the_verdict_rule_is_the_empirical_study_s_stability_rule` caught it
    at the boundary: a pooled effect that is positive and CI-clear, with two of
    three seasons NEGATIVE, was being called a replicated finding because two
    seasons agreed with each other rather than with the effect. The stability
    rule (empirical study §2.3) asks whether the EFFECT replicates.
    """
    if direction > 0:
        return sum(1 for v in per_season.values() if v > 0)
    if direction < 0:
        return sum(1 for v in per_season.values() if v < 0)
    return 0


def _verdict(lo: float, hi: float, per_season: dict) -> str:
    """The empirical study's stability rule, applied identically here."""
    if lo != lo or hi != hi:                        # NaN
        return "insufficient n"
    if lo > 0:
        return ("ABOVE the alternative" if _seasons_agreeing(per_season, +1) >= 2
                else "one-season, not replicated")
    if hi < 0:
        return ("BELOW the alternative" if _seasons_agreeing(per_season, -1) >= 2
                else "one-season, not replicated")
    return "not distinguishable from noise"


def picking_information(rows: list, positions: dict, arm: str = "E") -> dict:
    """(c): did CHOOSING inside a round carry information?

    Two comparisons per band, both season-clustered:
      - `vs_blind`   realized minus the mean of what was still on the board.
                     Positive means the room's choice beat a blindfolded one.
      - `regret`     the best still-available minus realized. Reported for
                     shape only — it rises and falls with pool depth and is NOT
                     a value claim.
    """
    state = board_state(positions)
    picks = EDV._arm(rows, arm)
    out = {"arm": arm, "by_band": {}, "by_round": {}}

    def cell(sub: list) -> dict:
        rows2 = []
        for r in sub:
            st = state[r["season"]].get(r["pick_no"])
            if not st or st["blind_mean"] is None:
                continue
            rows2.append({"season": r["season"],
                          "vs_blind": r["pts"] - st["blind_mean"],
                          "regret": st["best"] - r["pts"],
                          "pool_n": st["pool_n"]})
        if not rows2:
            return {"n": 0}
        res = {"n": len(rows2),
               "mean_pool_remaining": round(EDV.mean([x["pool_n"] for x in rows2]), 0)}
        for key in ("vs_blind", "regret"):
            vals = [x[key] for x in rows2]
            lo, hi = EDV.cluster_boot(_grouped(rows2, lambda r, k=key: r[k]), EDV.mean)
            per_season = {s: round(EDV.mean([x[key] for x in rows2
                                             if x["season"] == s]), 1)
                          for s in sorted({x["season"] for x in rows2})}
            res[key] = {"mean": round(EDV.mean(vals), 1),
                        "ci95": [round(lo, 1), round(hi, 1)],
                        "per_season": per_season,
                        "verdict": _verdict(lo, hi, per_season)}
        return res

    for label, lo, hi in BANDS:
        out["by_band"][label] = cell([r for r in picks if lo <= r["round"] <= hi])
    for r in range(1, EDV.ROUNDS + 1):
        out["by_round"][f"R{r}"] = cell([x for x in picks if x["round"] == r])
    return out


def upside_tail(rows: list, positions: dict, arm: str = "E") -> dict:
    """The barbell's own shape: P(LEAGUE-WINNER) and P(STARTER) by band.

    Tiers come from `tiered_outcome_model.tier_labels` UNMODIFIED — the
    committed definition (top ceil(K/2) at the position over that season's full
    realized field) with its own tests. Reinventing it here would be a second
    definition of the same fact.
    """
    labels = {}
    diag = {}
    for season in SEASONS:
        lab, d = TOM.tier_labels(season)
        labels[season] = lab
        diag[season] = d["by_position"]
    picks = EDV._arm(rows, arm)
    out = {"arm": arm, "tier_definition": {
        "source": "tiered_outcome_model.tier_labels (committed, tested)",
        "tiers": list(TOM.TIERS), "league_winner_index": TOM.LEAGUE_WINNER,
        "K_slots": dict(TOM.K_SLOTS),
        "note": "LEAGUE-WINNER = finished in the top ceil(K/2) at his position "
                "over that season's FULL realized field, not over our population",
        "by_season_field": diag},
        "by_band": {}, "by_band_position": {}, "by_phase": {}}

    def cell(sub: list) -> dict:
        graded = [r for r in sub if r["pid"] in labels[r["season"]]]
        if not graded:
            return {"n": 0, "ungraded": len(sub)}
        tiers = [labels[r["season"]][r["pid"]] for r in graded]
        n = len(tiers)
        winners = sum(1 for t in tiers if t == TOM.LEAGUE_WINNER)
        starters = sum(1 for t in tiers if t >= 2)
        busts = sum(1 for t in tiers if t == 0)
        res = {"n": n, "ungraded": len(sub) - n,
               "p_league_winner": round(winners / n, 3),
               "p_league_winner_ci95": [round(x, 3) for x in EDV.wilson(winners, n)],
               "p_starter": round(starters / n, 3),
               "p_starter_ci95": [round(x, 3) for x in EDV.wilson(starters, n)],
               "p_bust": round(busts / n, 3),
               "league_winners": winners, "starters": starters, "busts": busts}
        per_season = {}
        for s in sorted({r["season"] for r in graded}):
            sub_s = [labels[s][r["pid"]] for r in graded if r["season"] == s]
            per_season[s] = {
                "n": len(sub_s),
                "p_league_winner": round(
                    sum(1 for t in sub_s if t == TOM.LEAGUE_WINNER) / len(sub_s), 3)}
        res["per_season"] = per_season
        return res

    for label, lo, hi in BANDS:
        sub = [r for r in picks if lo <= r["round"] <= hi]
        out["by_band"][label] = cell(sub)
        for pos in POSITIONS:
            out["by_band_position"][f"{label}|{pos}"] = cell(
                [r for r in sub if r["pos"] == pos])
    for label, lo, hi in PHASES:
        out["by_phase"][label] = cell([r for r in picks if lo <= r["round"] <= hi])

    # THE BARBELL TEST IN ONE NUMBER, and it is a DIFFERENCE OF DIFFERENCES.
    # Cory's claim is that the middle is dominated at BOTH ends: it should give
    # up starter rate to the early band AND league-winner rate to the late band.
    # The second half is the one nobody has measured.
    def band_rows(lo, hi):
        return [r for r in picks if lo <= r["round"] <= hi
                and r["pid"] in labels[r["season"]]]

    mid, late = band_rows(7, 10), band_rows(11, 15)
    if mid and late:
        def lw_rate(rs):
            return sum(1 for r in rs
                       if labels[r["season"]][r["pid"]] == TOM.LEAGUE_WINNER) / len(rs)
        groups = {s: [] for s in SEASONS}
        for r in mid:
            groups[r["season"]].append(("mid", r))
        for r in late:
            groups[r["season"]].append(("late", r))

        def stat(flat):
            m = [r for tag, r in flat if tag == "mid"]
            l = [r for tag, r in flat if tag == "late"]
            if not m or not l:
                return None
            return lw_rate(l) - lw_rate(m)
        lo_ci, hi_ci = EDV.cluster_boot(groups, stat)
        per_season = {}
        for s in SEASONS:
            m = [r for r in mid if r["season"] == s]
            l = [r for r in late if r["season"] == s]
            per_season[s] = round(lw_rate(l) - lw_rate(m), 3) if m and l else None
        out["late_minus_middle_league_winner_rate"] = {
            "middle_n": len(mid), "late_n": len(late),
            "middle_rate": round(lw_rate(mid), 3), "late_rate": round(lw_rate(late), 3),
            "difference": round(lw_rate(late) - lw_rate(mid), 3),
            "ci95": [round(lo_ci, 3), round(hi_ci, 3)],
            "per_season": per_season,
            "verdict": _verdict(lo_ci, hi_ci,
                                {k: v for k, v in per_season.items() if v is not None}),
            "reading": "POSITIVE means the late band carries an upside tail the "
                       "middle band does not — the half of Cory's hypothesis "
                       "that no instrument in this repo had measured.",
        }
    return out


def run() -> dict:
    positions = EDV.positions_record()
    rows, surv = EDV.pick_rows(positions)
    wire = wire_levels()
    out = {
        "_territory": "TERRITORY: A — research artifact, no production reader",
        "tool": "draft/backtest/barbell_middle.py",
        "mandate": "Cory 2026-08-17: is the middle of the draft dead weight?",
        "prereg": "draft/audit/barbell_strategy_2026-08-17.md §4.1",
        "seasons": list(SEASONS),
        "scoring_window_weeks": [1, LAST_SCORED_WEEK],
        "phase_boundary_round": BARBELL_PHASE_BOUNDARY,
        "survivorship": surv,
        "wire": wire,
        "note": "Realized OUTCOMES, not model output. Every loader, statistic "
                "and survivorship rule is imported from empirical_draft_value.py; "
                "the LEAGUE-WINNER label from tiered_outcome_model.py. Nothing "
                "here re-derives an outcome another committed module derives.",
    }
    for arm in ("E", "Z"):
        out[f"value_arm_{arm}"] = value_over_alternatives(rows, positions, wire, arm)
        out[f"upside_arm_{arm}"] = upside_tail(rows, positions, arm)
    out["picking_information"] = picking_information(rows, positions, "E")
    return out


def main() -> None:
    res = run()
    (HERE / "barbell_middle.json").write_text(json.dumps(res, indent=1) + "\n")
    v = res["value_arm_E"]
    print("BARBELL — IS THE MIDDLE DEAD OR MERELY FLAT? (Arm E, 2023-25)")
    print("  wire, season-equivalent per roster spot:")
    print("    held    " + "  ".join(f"{p} {v['wire_held_season'][p]:.0f}"
                                     for p in POSITIONS))
    print("    churned " + "  ".join(f"{p} {v['wire_churned_season'][p]:.0f}"
                                     for p in POSITIONS))
    print()
    for label, _lo, _hi in BANDS:
        c = v["by_band"][label]
        if not c.get("n"):
            continue
        print(f"  {label:22} n={c['n']:3}  mean {c['mean']:6.1f} "
              f"{str(c['ci95']):18}")
        for k in ("vs_replacement", "vs_wire_held", "vs_wire_churned"):
            d = c.get(k)
            if d:
                print(f"      {k:17} {d['mean']:+7.1f} {str(d['ci95']):18} "
                      f"{d['verdict']}")
    print()
    u = res["upside_arm_E"]
    for label, _lo, _hi in BANDS:
        c = u["by_band"][label]
        if not c.get("n"):
            continue
        print(f"  {label:22} n={c['n']:3}  P(LEAGUE-WINNER) {c['p_league_winner']:.3f} "
              f"{c['p_league_winner_ci95']}  P(starter) {c['p_starter']:.3f}")
    d = u.get("late_minus_middle_league_winner_rate")
    if d:
        print(f"\n  LATE minus MIDDLE P(LEAGUE-WINNER): {d['difference']:+.3f} "
              f"{d['ci95']}  per season {d['per_season']}  -> {d['verdict']}")
    print("\n  wrote draft/backtest/barbell_middle.json")


if __name__ == "__main__":
    main()
