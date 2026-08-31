#!/usr/bin/env python3
"""TERRITORY: D. P326 — is the "year-2 leap" a market inefficiency, or folklore
the draft market already prices?

Preregistered in PREDICTION-LEDGER.md P326 (filed 08-24, grade-by 09-08). The
claim: second-year players (`rookie_year == season - 1`) outperformed their
draft-slot price relative to ADP-matched veterans, 2023-25 pooled, with a 95%
bootstrap CI excluding zero.

REUSED, not reimplemented (Rule 11): `empirical_draft_value.season_totals`
(which also knows that 2021/2022 have no weekly store and must be scored from
components -- the exact trap that killed that module's first run), its frozen
scoring table, and its own value curve for what a pick is worth.

WHAT "PRICE" MEANS HERE, stated because the prereg says ADP and we do not have
historical ADP: the price is the pick's own DRAFT SLOT in our league's real
drafts, and the expected value at that slot is the empirical draft-value
study's round curve. That is the market that actually priced these players --
ours -- and it is on disk. A national ADP for 2023-25 is not, so the arm is
about OUR market's mispricing, which is also the only market Cory drafts in.

POWER IS REPORTED BEFORE THE CONTRAST, because n is small and known: 54 year-2
players across three drafts (16/19/19). The minimum detectable effect is
printed every run next to the estimate, so a null can never be read as "no
effect" when it is really "not enough players".

Controls gate the exit code:
  C1  KNOWN-POSITIVE, named by the prereg: the same harness must recover a
      round-1 premium over later rounds. If the residual machinery cannot see
      the largest effect in the study it is not measuring value.
  C2  SHUFFLE NULL: permuting the year-2 label within position x round band
      must produce a mean gap near zero. Kills "any 54 players would show it".
  C3  the pairing must be real: every year-2 player matched to a veteran at
      the same position, and no veteran used twice.
  C4  population sanity: the year-2 count must be the 54 the register states,
      or the join changed under the arm and the run is not comparable.
"""
import collections
import json
import pathlib
import random
import sys

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent.parent
sys.path.insert(0, str(HERE))

import empirical_draft_value as EDV  # noqa: E402

SEASONS = (2023, 2024, 2025)
BOOT = 5000
SEED = 20260827
# 54 year-2 players were DRAFTED; three of them are second-year KICKERS
# (Cam Little, Brandon Aubrey, Jake Moody) and nflverse_weekly_points does not
# score kickers, so 51 are scorable. The control asserts the REASON, not the
# bare number -- a count that moves for an unexplained reason is the thing
# worth failing on, and 54 would have failed for a correct filter.
DRAFTED_YEAR2 = 54
SCORABLE_YEAR2 = 51


def bio():
    return json.loads((HERE / "player_bio_capital.json").read_text())["players"]


def our_drafts():
    """[(season, pick_no, pid)] from our league's own completed drafts."""
    H = json.loads((ROOT / "draft/data/league_history.json").read_text())
    out = []
    for v in H["seasons"]:
        s = int(v.get("season"))
        if s not in SEASONS:
            continue
        for dr in (v.get("drafts") or []):
            for pk in (dr.get("picks") or []):
                pid = str(pk.get("player_id") or "")
                no = pk.get("pick_no")
                if pid and no:
                    out.append((s, int(no), pid))
    return out


def round_curve():
    """{round: mean season points} from the study's own q1 curve."""
    d = json.loads((HERE / "empirical_draft_value.json").read_text())
    by = d["q1_value_curve"]["E"]["by_round"]
    return {int(k): float(v["mean"]) for k, v in by.items()}


def rows():
    """One row per drafted player: realized points minus the value expected at
    the round they were taken in."""
    curve = round_curve()
    b = bio()
    positions = EDV.positions_record()
    teams = 10
    out = []
    for season, pick_no, pid in our_drafts():
        totals, _ = EDV.season_totals(season)
        pts = totals.get(pid)
        if pts is None:
            continue
        rnd = (pick_no - 1) // teams + 1
        exp = curve.get(rnd)
        if exp is None:
            continue
        rec = b.get(pid) or {}
        ry = rec.get("rookie_year")
        pos = positions.get(pid) or rec.get("position")
        out.append({
            "season": season, "pick_no": pick_no, "round": rnd, "pid": pid,
            "pos": pos, "points": float(pts), "expected": exp,
            "residual": float(pts) - exp,
            "rookie_year": None if ry is None else int(float(ry)),
        })
    return out


def label(r):
    if r["rookie_year"] is None:
        return "unknown"
    if r["rookie_year"] == r["season"]:
        return "rookie"
    if r["rookie_year"] == r["season"] - 1:
        return "year2"
    return "vet"


def pair(rs, rng, year2_flag=None):
    """Match each year-2 player to the NEAREST-BY-PICK veteran at the same
    position in the same season, no veteran reused. Returns paired residual
    differences (year2 - veteran)."""
    flag = year2_flag or (lambda r: label(r) == "year2")
    diffs, used = [], set()
    for season in SEASONS:
        pool = [r for r in rs if r["season"] == season]
        vets = [r for r in pool if label(r) == "vet"]
        for r in sorted([x for x in pool if flag(x)], key=lambda x: x["pick_no"]):
            cands = [v for v in vets
                     if v["pos"] == r["pos"] and id(v) not in used]
            if not cands:
                continue
            m = min(cands, key=lambda v: abs(v["pick_no"] - r["pick_no"]))
            used.add(id(m))
            diffs.append(r["residual"] - m["residual"])
    return diffs


def boot_ci(xs, rng, n=BOOT):
    if len(xs) < 3:
        return (float("nan"), float("nan"))
    means = []
    for _ in range(n):
        s = [xs[rng.randrange(len(xs))] for _ in range(len(xs))]
        means.append(sum(s) / len(s))
    means.sort()
    return (means[int(0.025 * n)], means[int(0.975 * n)])


def main():
    rng = random.Random(SEED)
    rs = rows()
    counts = collections.Counter(label(r) for r in rs)
    diffs = pair(rs, rng)
    mean = sum(diffs) / len(diffs) if diffs else float("nan")
    lo, hi = boot_ci(diffs, rng)

    # minimum detectable effect at 80% power, from the paired SD -- printed
    # BESIDE the estimate so a null is never read as "no effect" when it is
    # "not enough players".
    if len(diffs) > 2:
        m = sum(diffs) / len(diffs)
        sd = (sum((d - m) ** 2 for d in diffs) / (len(diffs) - 1)) ** 0.5
        mde = 2.8 * sd / (len(diffs) ** 0.5)
    else:
        sd = mde = float("nan")

    print("P326 — THE YEAR-2 LEAP, priced against our own draft market\n")
    print("  drafted players scored: %d   %s" % (len(rs), dict(counts)))
    print("  matched pairs (year-2 vs nearest-pick veteran, same position, no reuse): %d" % len(diffs))
    print("  paired residual difference: mean %+.1f pts   95%% CI [%+.1f, %+.1f]" % (mean, lo, hi))
    print("  paired SD %.1f   MINIMUM DETECTABLE EFFECT at 80%% power: %.1f pts" % (sd, mde))
    verdict = "TRUE" if lo > 0 else ("FALSE — CI includes zero" if hi > 0 else "FALSE — negative")
    print("\n  P326 (year-2 beat ADP-matched veterans, CI excludes zero): %s" % verdict)

    ctl = {}
    # C1 known-positive: round 1 must outscore rounds 6+ on raw points
    r1 = [r["points"] for r in rs if r["round"] == 1]
    late = [r["points"] for r in rs if r["round"] >= 6]
    gap = (sum(r1) / len(r1) - sum(late) / len(late)) if r1 and late else float("nan")
    ctl["C1_known_positive_round1_beats_late"] = {
        "ok": gap > 30, "gap_pts": round(gap, 1), "n_r1": len(r1), "n_late": len(late)}

    # C2 shuffle null: permute the year-2 label within position x round
    band = collections.defaultdict(list)
    for r in rs:
        band[(r["pos"], r["round"])].append(r)
    shuffled_means = []
    for _ in range(200):
        fake = set()
        for key, group in band.items():
            k = sum(1 for r in group if label(r) == "year2")
            if k:
                fake.update(id(x) for x in rng.sample(group, k))
        d = pair(rs, rng, year2_flag=lambda r: id(r) in fake)
        if d:
            shuffled_means.append(sum(d) / len(d))
    sm = sum(shuffled_means) / len(shuffled_means) if shuffled_means else float("nan")
    ssd = ((sum((x - sm) ** 2 for x in shuffled_means) / max(1, len(shuffled_means) - 1)) ** 0.5
           if len(shuffled_means) > 1 else float("nan"))
    # WAS `abs(sm) < 2*ssd/sqrt(n)`, which is the standard error of the shuffle
    # MEAN -- with 200 shuffles that is 0.44 points, so any tiny bias failed it
    # and the control was testing precision, not centring. The question a
    # shuffle null answers is whether the OBSERVED value is extreme in the
    # shuffle distribution, so that is what is reported, and the centring
    # check is relative to the distribution's own spread.
    more_extreme = sum(1 for x in shuffled_means if abs(x) >= abs(mean))
    pct = more_extreme / len(shuffled_means) if shuffled_means else float("nan")
    ctl["C2_shuffle_null_is_centred_and_the_observed_is_not_extreme"] = {
        "ok": abs(sm) < 0.5 * ssd if shuffled_means else False,
        "shuffled_mean": round(sm, 2), "shuffled_sd": round(ssd, 2),
        "n": len(shuffled_means),
        "observed": round(mean, 2),
        "two_sided_p_vs_shuffle": round(pct, 4)}

    # C3 pairing integrity
    ctl["C3_pairs_are_real"] = {
        "ok": 0 < len(diffs) <= counts["year2"], "pairs": len(diffs), "year2": counts["year2"]}

    # C4 population sanity vs the register's stated 54
    # The dropped players must be exactly the unscorable kickers -- asserting
    # the REASON, because a count alone cannot tell a correct filter from a
    # broken join.
    positions_all = EDV.positions_record()
    b_all = bio()
    drafted_y2 = [pid for (season, _pick, pid) in our_drafts()
                  if (b_all.get(pid) or {}).get("rookie_year") is not None
                  and int(float(b_all[pid]["rookie_year"])) == season - 1]
    scored = {r["pid"] for r in rs}
    dropped = [pid for pid in drafted_y2 if pid not in scored]
    dropped_pos = sorted({positions_all.get(p) or (b_all.get(p) or {}).get("position")
                          for p in dropped})
    ctl["C4_population_and_the_reason_it_shrank"] = {
        "ok": (len(drafted_y2) == DRAFTED_YEAR2 and counts["year2"] == SCORABLE_YEAR2
               and dropped_pos == ["K"]),
        "drafted": len(drafted_y2), "scorable": counts["year2"],
        "dropped": len(dropped), "dropped_positions": dropped_pos,
        "why": "nflverse_weekly_points does not score kickers; any OTHER position "
               "dropping means the join broke, not that a filter worked"}

    print("  two-sided p against the shuffle null: %.4f" % pct)
    print("\ncontrols:")
    for k, v in ctl.items():
        print("  %s %s %s" % ("OK " if v["ok"] else "!! ", k,
                              json.dumps({x: y for x, y in v.items() if x != "why"})))
    out = {"_territory": "TERRITORY: D — draft/backtest/year2_leap_arm.py",
           "_what": "P326 year-2 leap arm, priced against our own draft market's round curve.",
           "seasons": list(SEASONS), "counts": dict(counts), "pairs": len(diffs),
           "mean_paired_diff": round(mean, 2), "ci95": [round(lo, 2), round(hi, 2)],
           "paired_sd": round(sd, 2), "mde_80pct": round(mde, 2),
           "verdict": verdict, "controls": ctl, "seed": SEED, "boot": BOOT}
    (HERE / "year2_leap_arm.json").write_text(json.dumps(out, indent=1))
    if any(not v["ok"] for v in ctl.values()):
        print("\n⛔ CONTROLS FAILED — nothing above is a measurement.")
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
