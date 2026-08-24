#!/usr/bin/env python3
# TERRITORY: A
"""WHERE WOULD THE TOOL HAVE FINISHED AT THE WEIGHTS IT ACTUALLY SHIPS?

Cory, twice: *"rerun our model to see how we would've drafted compared to other
owners. Need to strive for top 3!"* — and, 2026-08-24, *"are we making sure we
are going to be better off for next draft."*

── WHY THIS EXISTS, AND IT IS REGISTER 317 ─────────────────────────────────

`seat_rank_lab.py` answered the rank question on 08-19 and got **8th of 10**.
That number is quoted in `CLAUDE.md` as the standing summary of where the model
stands. **It was measured at `need: 0`, and Cory switched `need` to 1.0 on
08-20** — so the most-read number in the repo describes a configuration that has
not shipped since.

The conversion half of that question is already answered and was answered
before the ruling: `conversion_by_arm_lab.py` (P127) measured `need: 1.0` at
conversion 0.876 / 0.849 / 0.829 against owners' 0.828 / 0.826 / 0.834 — the
gap **closed, and reversed in two of three seasons**. Cory ruled A13 on that
evidence. The loop worked.

**What was never computed is RANK per arm.** Verified rather than assumed
before this file was written: `seat_rank_lab.json` carries no arm dimension and
no mention of `need1`, and `seat_rank_lab.py` accepts only `--json`. Conversion
is a ratio; **finishing position is the thing Cory asked for**, and a better
ratio does not have to mean a better place — an arm can convert beautifully and
still hold fewer points, which is exactly what P127/P128 found (`need: 1.0`
sheds ~99 roster points per seat-season to buy its conversion).

── WHAT IT REUSES RATHER THAN REBUILDS (rule 11) ───────────────────────────

  `rank_of`         imported from seat_rank_lab.py — the SAME ranker whose
                    controls P125 passed, not a second one that agrees by
                    coincidence.
  `ARMS`            imported from conversion_by_arm_lab.py — one list of arms,
                    so an arm cannot exist for conversion and be missing here.
  `season_series`   draft_replay_2025, the same lineup construction the replay
                    and the conversion lab both use.

── THE CONTROL THAT MATTERS (rule 3e / 3f) ─────────────────────────────────

Every number here is a rank, and **"the tool ranks badly" and "my harness is
wrong" print the same thing.** So before any arm is compared, the SHIPPED arm's
per-seat totals recomputed here must reproduce the committed replay's
`arms.optimal.tool_total` — a case whose answer is already known and published.
If that fails, nothing below is quotable and the lab says so and exits non-zero.

⚠️ **WHAT THIS STILL IS NOT: the live configuration.** Every recorded arm
carries `ceiling: 0.45`; the shipped constant has been `ceiling: 0.0` since
2026-08-20 (`engine.js:826`). This isolates `need`, which is the term the
conversion defect was attributed to — it does not describe the exact engine on
Cory's screen, and saying so here is the whole point of register 317.

REPORT ONLY. Grades several configurations. Selects none — `no_fit_guard`.

Run: python3 draft/backtest/seat_rank_by_arm_lab.py [--json <path>]
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent            # draft/backtest
DRAFT = HERE.parent
ROOT = DRAFT.parent
sys.path.insert(0, str(DRAFT / "tools"))
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(DRAFT))

import draft_replay_2025 as R                      # noqa: E402
from model_accuracy_backtest import positions_record  # noqa: E402
from seat_rank_lab import rank_of                  # noqa: E402  (rule 11)
from conversion_by_arm_lab import ARMS, PRIMARY, SEATS, _skill  # noqa: E402

REPLAY = DRAFT / "data" / "engine_seat_replay.json"
TOP_N = 3
CHANCE = TOP_N / 10.0
# The replay's own totals are rounded when written; this is a reproduction
# tolerance, not a "close enough" for a finding.
TOL = 0.5


def owner_totals_from_replay(doc):
    """{season: {seat: owner_total}} — owners are ARM-INVARIANT by construction.

    The owners' drafts are history; no engine arm changes them. Taken from the
    committed replay rather than recomputed so this lab ranks against exactly
    the opponents P125 ranked against.
    """
    out = {}
    for s, y in doc["years"].items():
        out[int(s)] = {seat: d["arms"][PRIMARY]["owner_total"]
                       for seat, d in y["seats"].items()}
    return out


def tool_totals_for_arm(path, positions, ages):
    """{season: {seat: lineup points}} for one recorded arm."""
    choices = json.loads(Path(path).read_text())
    out = {}
    for s in sorted(choices["seasons"]):
        season = int(s)
        weekly = R.weekly_points_of(season)
        proj = R.build_projections(season, positions, ages)
        per_seat = {}
        for seat in SEATS:
            ch = choices["seasons"][s]["seats"][str(seat)]
            skill = _skill(ch["roster"], positions)
            per_seat[str(seat)] = float(
                sum(R.season_series(skill, positions, weekly, proj, PRIMARY)))
        out[season] = per_seat
    return out


def rank_arm(tool, owners):
    """Per-season and pooled rank summary for one arm."""
    per_season, pooled = {}, []
    for season in sorted(tool):
        if season not in owners:
            continue
        ranks = {}
        for seat, total in tool[season].items():
            r, n = rank_of(total, owners[season], seat)
            ranks[seat] = r
            pooled.append(r)
        vals = list(ranks.values())
        per_season[season] = {
            "ranks_by_seat": ranks,
            "mean_rank": round(sum(vals) / len(vals), 2),
            "top3": sum(1 for r in vals if r <= TOP_N),
            "last": sum(1 for r in vals if r == 10),
        }
    return {
        "per_season": per_season,
        "mean_rank": round(sum(pooled) / len(pooled), 2) if pooled else None,
        "top3_rate": round(sum(1 for r in pooled if r <= TOP_N) / len(pooled), 3)
        if pooled else None,
        "seat_years": len(pooled),
        "wins": sum(1 for r in pooled if r == 1),
        "last_place": sum(1 for r in pooled if r == 10),
    }


def main() -> int:
    doc = json.loads(REPLAY.read_text())
    owners = owner_totals_from_replay(doc)
    positions = positions_record()
    from own_model_v2 import board_ages
    ages = board_ages()

    tools, missing = {}, []
    for name, fn in ARMS.items():
        p = HERE / fn
        if not p.exists():
            # NOT silently skipped: an absent arm is a smaller lab, and a
            # smaller lab that prints the same shape is how a gap goes unseen.
            missing.append(fn)
            continue
        tools[name] = tool_totals_for_arm(p, positions, ages)

    ctl = {}

    # ── CONTROL 1 — the known answer. The shipped arm recomputed here must
    #    reproduce the committed replay's per-seat tool_total. This is the only
    #    thing standing between "need1 ranks better" and "my harness differs
    #    from theirs in a way that happens to favour need1".
    worst, checked = 0.0, 0
    for s, y in doc["years"].items():
        season = int(s)
        if "shipped" not in tools or season not in tools["shipped"]:
            continue
        for seat, d in y["seats"].items():
            want = float(d["arms"][PRIMARY]["tool_total"])
            got = tools["shipped"][season].get(seat)
            if got is None:
                continue
            worst = max(worst, abs(got - want))
            checked += 1
    ctl["shipped_reproduces_committed_replay"] = {
        "ok": checked > 0 and worst <= TOL,
        "seat_years_checked": checked,
        "worst_abs_diff": round(worst, 3),
        "why": "the shipped arm recomputed here must equal the published "
               "engine_seat_replay.json tool_total per seat; without this, a "
               "rank difference between arms could be a harness difference",
    }

    # ── CONTROL 2 — the free identity arm. slot_s0 IS the shipped config.
    if "slot_s0" in tools and "shipped" in tools:
        same = all(
            abs(tools["slot_s0"][s][k] - tools["shipped"][s][k]) <= TOL
            for s in tools["shipped"] if s in tools["slot_s0"]
            for k in tools["shipped"][s] if k in tools["slot_s0"][s])
        ctl["slot_s0_reproduces_shipped"] = {
            "ok": same,
            "why": "slot_s0 is the shipped configuration re-run under the "
                   "slot-aware harness and must land in the same place"}

    # ── CONTROL 3 — the ranker still behaves. Reuses the imported rank_of on
    #    cases whose answers are known by construction, so a broken import or a
    #    changed signature cannot pass silently.
    season0 = sorted(owners)[0]
    o0 = owners[season0]
    hi, lo = max(o0.values()) + 1000.0, min(o0.values()) - 1000.0
    ctl["rank_ceiling_is_1"] = {"got": rank_of(hi, o0, "1")[0],
                                "ok": rank_of(hi, o0, "1")[0] == 1}
    ctl["rank_floor_is_10"] = {"got": rank_of(lo, o0, "1")[0],
                               "ok": rank_of(lo, o0, "1")[0] == 10}

    # ── CONTROL 4 — arms must actually differ, or every comparison is vacuous.
    if "need1" in tools and "shipped" in tools:
        diff = sum(1 for s in tools["shipped"] if s in tools["need1"]
                   for k in tools["shipped"][s]
                   if abs(tools["need1"][s][k] - tools["shipped"][s][k]) > TOL)
        ctl["need1_differs_from_shipped"] = {
            "ok": diff > 0, "seat_years_differing": diff,
            "why": "identical totals would mean need is inert in this harness "
                   "and every rank below would be the same number twice"}

    if missing:
        ctl["all_arms_present"] = {"ok": False, "missing": missing}

    # ── THE PAIRED CONTRAST, because a mean rank on its own is a trap ────────
    # `CLAUDE.md`, in this project's own words: *"never read adjacent ranks as
    # findings; they sit inside one SE."* Two arms differing by 0.67 of a place
    # across 30 seat-years is exactly the claim that rule exists to stop.
    #
    # PAIRED, not two independent means: every arm is evaluated on the SAME 30
    # seat-years against the SAME nine opponents, so the seat-to-seat variance
    # — which is enormous, ranks run 1 to 10 — cancels. An unpaired test here
    # would be answering a question nobody asked and would call everything
    # noise.
    def paired_vs_shipped(name):
        if name == "shipped" or "shipped" not in tools or name not in tools:
            return None
        d = []
        for s in sorted(tools["shipped"]):
            if s not in tools[name] or s not in owners:
                continue
            for seat in tools["shipped"][s]:
                a = rank_of(tools["shipped"][s][seat], owners[s], seat)[0]
                b = rank_of(tools[name][s][seat], owners[s], seat)[0]
                d.append(a - b)          # POSITIVE = the arm finishes higher
        if not d:
            return None
        n = len(d)
        m = sum(d) / n
        var = sum((x - m) ** 2 for x in d) / (n - 1) if n > 1 else 0.0
        se = (var / n) ** 0.5
        # ── AND A SIGN TEST BESIDE IT, because a rank is ORDINAL. The t above
        # treats "10th to 9th" and "2nd to 1st" as the same quantity, which is
        # not obviously true and is the assumption most likely to be wrong
        # here. An exact binomial on the direction alone assumes nothing about
        # spacing; if the two disagree, the parametric one is the suspect.
        up = sum(1 for x in d if x > 0)
        dn = sum(1 for x in d if x < 0)
        k = up + dn
        p2 = None
        if k:
            from math import comb
            tail = sum(comb(k, i) for i in range(max(up, dn), k + 1)) / (2 ** k)
            p2 = round(min(1.0, 2 * tail), 4)
        return {"n": n, "mean_places_gained": round(m, 3),
                "se": round(se, 3),
                "ci95": [round(m - 1.96 * se, 3), round(m + 1.96 * se, 3)],
                "t": round(m / se, 2) if se else None,
                "sign_test_p_two_sided": p2,
                "seats_improved": up,
                "seats_worsened": dn,
                "seats_unchanged": sum(1 for x in d if x == 0)}

    contrasts = {n: paired_vs_shipped(n) for n in ARMS if n != "shipped"}
    contrasts = {k: v for k, v in contrasts.items() if v}

    ok = all(v.get("ok") for v in ctl.values())

    graded = {name: rank_arm(t, owners) for name, t in tools.items()}

    print("\n  SEAT RANK BY ARM — where would the tool have FINISHED?"
          "  (register 317)\n")
    for k, v in ctl.items():
        print(("  %s %s" % ("✅" if v.get("ok") else "❌", k))
              + ("" if v.get("ok") else "   " + json.dumps(
                  {a: b for a, b in v.items() if a != "why"})))
    if not ok:
        print("\n  ⛔ a control failed — NOTHING BELOW IS QUOTABLE.")

    print("\n  arm         mean rank   top-3     wins  last   (chance top-3 = %.0f%%)"
          % (CHANCE * 100))
    for name in ARMS:
        g = graded.get(name)
        if not g:
            continue
        print("  %-10s  %8s   %2d/%2d  %5d  %4d"
              % (name, g["mean_rank"], g["top3_rate"] and
                 round(g["top3_rate"] * g["seat_years"]) or 0,
                 g["seat_years"], g["wins"], g["last_place"]))

    print("\n  per season (mean rank of the tool across the ten seats)")
    seasons = sorted(graded.get("shipped", {}).get("per_season", {}))
    print("  arm         " + "  ".join("%7d" % s for s in seasons))
    for name in ARMS:
        g = graded.get(name)
        if not g:
            continue
        print("  %-10s  " % name + "  ".join(
            "%7s" % g["per_season"].get(s, {}).get("mean_rank", "-")
            for s in seasons))

    print("\n  PAIRED against the shipped arm — same 30 seat-years, same nine "
          "opponents.\n  Positive = finishes HIGHER. A mean rank quoted "
          "without this band is the\n  adjacent-rank trap CLAUDE.md names by "
          "name.")
    print("  arm         places gained        95% CI          t   sign p   better/worse/same")
    for name, c in contrasts.items():
        print("  %-10s  %+13.3f   [%+.2f, %+.2f]  %6s  %6s   %2d/%2d/%2d"
              % (name, c["mean_places_gained"], c["ci95"][0], c["ci95"][1],
                 c["t"], c["sign_test_p_two_sided"], c["seats_improved"],
                 c["seats_worsened"], c["seats_unchanged"]))
    print("     A CI spanning zero means the arms are indistinguishable on "
          "finishing position,\n     whatever their means read.")

    print("\n  ⚠️ every recorded arm carries ceiling 0.45; the shipped constant "
          "is 0.0 since 08-20,\n     so no row here is the exact live engine "
          "(register 317).")

    report = {
        "_territory": "TERRITORY: A — draft/backtest/seat_rank_by_arm_lab.json",
        "_question": "Cory: rerun our model to see how we would've drafted "
                     "compared to other owners. Need to strive for top 3!",
        "_register": 317,
        "_limit": "every recorded arm carries ceiling 0.45; the shipped "
                  "constant is ceiling 0.0 since 2026-08-20 (engine.js:826). "
                  "This isolates `need`; it is not the live configuration.",
        "_report_only": "grades several arms, selects none (no_fit_guard)",
        "chance_top3_rate": CHANCE,
        "controls": ctl,
        "paired_vs_shipped": contrasts,
        "controls_all_passed": ok,
        "arms": graded,
    }
    if "--json" in sys.argv:
        out = Path(sys.argv[sys.argv.index("--json") + 1])
        out.write_text(json.dumps(report, indent=1))
        print("\n  wrote " + str(out))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
