#!/usr/bin/env python3
"""TERRITORY: A.  REGISTER 76, RE-MEASURED ON THE CORRECTED BOARD.

Register 76 is ⏳ WAITING ON CORY (A14).  He is being asked to rule on whether
the multi-source blend's RB tilt is a defect or a correction, and the evidence
in front of him is:

    top-48 by VORP went RB12/WR26 -> RB22/WR18;  top-24 RB10 -> RB14;
    top-12 RB6 -> RB9.  The blend lifts RB +11.4% median against WR +2.1%.

⛔ THAT MEASUREMENT WAS TAKEN ON THE KEEPER-DISTORTED BOARD.  Register 283:
between the 2026-08-23 keeper lock and the 08-26 rebuild, `replacement_levels`
ranked a LEAGUE-WIDE count over the DRAFTABLE pool, so RB replacement read
147.8 where the population gives 181.1 and WR 142.9 against 170.3.  `vorp` is
`proj_mean - replacement`, so the error OVERSTATED every RB VORP by ~33 points
and every WR VORP by ~27 — a cross-position error, on the exact statistic
register 76 counts.  Register 283 lists this row among the five studies owed a
re-run, and A owns that.

This does not rule anything.  It puts a correct number in front of the person
who does.

── HOW THE COUNTERFACTUAL IS BUILT, AND WHERE IT CANNOT BE ───────────────────

The sleeper-only arm substitutes `proj_mean_sleeper_only` for `proj_mean` and
recomputes replacement from scratch — which is the whole mechanism register 76
identified: a positional level shift changes which position wins FLEX seats,
which moves replacement, which moves every VORP.  Holding replacement fixed
would measure nothing.

⚠️ REGISTER 76'S OWN PREMISE IS FALSE ON TODAY'S BOARD AND IT IS STATED RATHER
THAN WORKED AROUND.  The row says `proj_mean_sleeper_only` "is retained on every
blended row precisely so it is answerable".  MEASURED: 264 of the 728 rows
carrying a multi-source blend do NOT have it.  The 184 rows with
`blend_n_sources: 1` all read `blend_sources_used: ["sleeper"]`, so for those
sleeper-only IS the blend and the fallback is exact — but the other 264 are a
genuine gap.

WHERE IT MATTERS IT IS COMPLETE, which is why the answer stands: the top-12 and
top-24 by VORP have FULL coverage, and the only two missing from the top-48 are
DEFENCES, which enter no RB/WR count.  Control C3 asserts exactly that rather
than leaving it to a reader.

Run: python3 draft/tools/register76_recheck.py [--json PATH]
"""
from __future__ import annotations

import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, "draft"))

import vorp as vorp_mod  # noqa: E402

BOARD = os.path.join(ROOT, "public", "draft_data.json")
CFG = os.path.join(ROOT, "draft", "config", "league_config.json")
SKILL = ("QB", "RB", "WR", "TE")


def load():
    with open(BOARD, encoding="utf8") as fh:
        board = json.load(fh)
    with open(CFG, encoding="utf8") as fh:
        cfg = json.load(fh)
    return board, cfg


def arm(board, cfg, use_sleeper_only):
    """Return (replacement, diagnostics, rows) for one projection arm.

    `rows` carries a recomputed vorp for every priced player.  The RANKING pool
    is players + keepers (register 283's `full_pool`); the PRICED pool is the
    same, because register 76 counts a BOARD ordering, not a draftable one, and
    a keeper who outranks replacement belongs in that ordering.
    """
    def proj(p):
        if use_sleeper_only:
            v = p.get("proj_mean_sleeper_only")
            if v is not None:
                return float(v)
            # blend_n_sources == 1 with sleeper as the only source: the blend IS
            # sleeper, so this is exact, not a guess.  Anything else is a gap and
            # C3 is what keeps a gap from being read as an answer.
            return float(p.get("proj_mean") or 0.0)
        return float(p.get("proj_mean") or 0.0)

    pool = []
    for p in list(board["players"]) + list(board.get("kept_players") or []):
        if not p.get("position") or p.get("proj_mean") is None:
            continue
        q = dict(p)
        q["proj_mean"] = proj(p)
        q["_had_sleeper_only"] = p.get("proj_mean_sleeper_only") is not None
        q["_nsrc"] = p.get("blend_n_sources")
        pool.append(q)

    repl, diag = vorp_mod.replacement_levels(pool, cfg, full_pool=pool)
    for q in pool:
        q["vorp"] = q["proj_mean"] - repl.get(q["position"], 0.0)
    pool.sort(key=lambda x: x["vorp"], reverse=True)
    return repl, diag, pool


def counts_at(rows, n):
    top = rows[:n]
    out = {}
    for p in top:
        out[p["position"]] = out.get(p["position"], 0) + 1
    return out


def median(xs):
    s = sorted(xs)
    return s[len(s) // 2] if s else None


def main() -> int:
    board, cfg = load()
    blended_repl, blended_diag, blended = arm(board, cfg, False)
    sleeper_repl, sleeper_diag, sleeper = arm(board, cfg, True)

    ctl = {}

    # C1 — THE KNOWN POSITIVE THAT LICENSES EVERYTHING ELSE.  Recomputing the
    # SHIPPED arm here must reproduce the board's own published replacement to
    # the decimal.  If it does not, this is a second harness that merely agrees
    # in places, and no number below is about the board Cory reads.
    published = ((board.get("replacement") or {}).get("replacement_points")) or {}
    worst, worst_pos = 0.0, None
    for pos, v in published.items():
        d = abs(float(v) - blended_repl.get(pos, 0.0))
        if d > worst:
            worst, worst_pos = d, pos
    ctl["C1_reproduces_the_published_replacement"] = {
        "ok": bool(published) and worst < 0.01,
        "worst_abs_diff": round(worst, 4),
        "worst_position": worst_pos,
        "published": published,
        "recomputed": {k: round(v, 2) for k, v in blended_repl.items()},
        "why": "the shipped arm run through vorp.py must BE the board, or this is "
               "a different harness that happens to agree",
    }

    # C2 — KNOWN NEGATIVE.  The two arms must actually differ.  A substitution
    # that silently failed would leave both arms identical and every count below
    # would be a run against itself.
    gap = sum(abs(blended_repl.get(p, 0) - sleeper_repl.get(p, 0)) for p in SKILL)
    ctl["C2_the_two_arms_really_differ"] = {
        "ok": gap > 1.0,
        "total_abs_replacement_gap_skill_positions": round(gap, 2),
        "why": "if the sleeper-only substitution is not reaching proj_mean the "
               "arms are one arm",
    }

    # C3 — THE COVERAGE CLAIM, ASSERTED RATHER THAN ASSUMED (see the header).
    missing_top = {}
    for n in (12, 24, 48):
        miss = [p for p in blended[:n] if not p["_had_sleeper_only"]]
        missing_top[n] = [{"pos": p["position"], "name": p.get("name")} for p in miss]
    skill_missing_48 = [m for m in missing_top[48] if m["pos"] in SKILL]
    ctl["C3_the_counterfactual_is_complete_where_it_is_counted"] = {
        "ok": len(missing_top[12]) == 0 and len(missing_top[24]) == 0
              and len(skill_missing_48) == 0,
        "missing_in_top_12": missing_top[12],
        "missing_in_top_24": missing_top[24],
        "missing_in_top_48": missing_top[48],
        "missing_in_top_48_at_a_SKILL_position": skill_missing_48,
        "why": "register 76 counts RB and WR. A DEF without a sleeper-only "
               "projection cannot move that count; a running back could.",
    }

    # C4 — the fallback is exact where it is used.
    ones = [p for p in board["players"]
            if p.get("proj_mean_sleeper_only") is None and p.get("blend_n_sources") == 1]
    bad = [p.get("name") for p in ones
           if list(p.get("blend_sources_used") or []) != ["sleeper"]]
    ctl["C4_the_single_source_fallback_is_exact"] = {
        "ok": not bad,
        "rows_using_the_fallback": len(ones),
        "rows_where_the_single_source_is_NOT_sleeper": bad[:8],
        "why": "for a row blended from one source that IS sleeper, sleeper-only "
               "equals the blend by construction — not an approximation",
    }

    all_ok = all(c["ok"] for c in ctl.values())

    lift = {}
    by_id = {str(p.get("player_id")): p for p in sleeper}
    for pos in SKILL:
        ratios = []
        for p in blended:
            if p["position"] != pos or not p["_had_sleeper_only"]:
                continue
            s = by_id.get(str(p.get("player_id")))
            if s and s["proj_mean"] > 0:
                ratios.append(p["proj_mean"] / s["proj_mean"] - 1.0)
        m = median(ratios)
        lift[pos] = {"n": len(ratios), "median_lift_pct": None if m is None else round(100 * m, 2)}

    table = {}
    for n in (12, 24, 48):
        table[n] = {"sleeper_only": counts_at(sleeper, n), "blended": counts_at(blended, n)}

    print("REGISTER 76 RE-MEASURED ON THE CORRECTED BOARD\n")
    for k, c in ctl.items():
        print("  " + ("OK  " if c["ok"] else "!!  ") + k)
    if not all_ok:
        print("\n  !! A CONTROL FAILED. Nothing below is a measurement.\n")

    print("\n  board built_at " + str(board.get("built_at")))
    print("  replacement, blended arm : "
          + "  ".join(f"{p} {blended_repl.get(p, 0):.1f}" for p in SKILL))
    print("  replacement, sleeper-only: "
          + "  ".join(f"{p} {sleeper_repl.get(p, 0):.1f}" for p in SKILL))
    print("  flex allocation, blended : " + json.dumps(blended_diag["starter_counts"]))
    print("  flex allocation, sleeper : " + json.dumps(sleeper_diag["starter_counts"]))

    print("\n  RB / WR COUNT IN THE TOP N BY VORP        register 76 published ->")
    pub = {12: ("RB6/WR?", "RB9/WR?"), 24: ("RB10/WR?", "RB14/WR?"),
           48: ("RB12/WR26", "RB22/WR18")}
    for n in (12, 24, 48):
        s, b = table[n]["sleeper_only"], table[n]["blended"]
        print(f"   top-{n:<3} sleeper-only RB{s.get('RB', 0):<3} WR{s.get('WR', 0):<3}"
              f"  ->  blended RB{b.get('RB', 0):<3} WR{b.get('WR', 0):<3}"
              f"     (published {pub[n][0]} -> {pub[n][1]})")

    print("\n  MEDIAN BLEND LIFT vs sleeper-only        register 76 published RB +11.4%, WR +2.1%")
    for pos in SKILL:
        v = lift[pos]
        print(f"   {pos:<4} n={v['n']:<4} "
              + ("(no paired rows)" if v["median_lift_pct"] is None
                 else f"{v['median_lift_pct']:+.2f}%"))

    rep = {
        "_territory": "TERRITORY: A — draft/tools/register76_recheck.py",
        "_answers": "register 76, owed by register 283 part (2)",
        "_board_built_at": board.get("built_at"),
        "_note": "Re-measures register 76's counts on the post-283 board. Does NOT "
                 "rule anything — register 76 is WAITING ON CORY (A14) and this "
                 "only puts a correct number in front of him.",
        "controls": ctl,
        "controls_all_passed": all_ok,
        "replacement": {"blended": {k: round(v, 2) for k, v in blended_repl.items()},
                        "sleeper_only": {k: round(v, 2) for k, v in sleeper_repl.items()}},
        "starter_counts": {"blended": blended_diag["starter_counts"],
                           "sleeper_only": sleeper_diag["starter_counts"]},
        "top_n_counts": {str(k): v for k, v in table.items()},
        "median_blend_lift_pct": lift,
        "published_2026_08_19": {"top_48": "RB12/WR26 -> RB22/WR18",
                                 "top_24": "RB10 -> RB14", "top_12": "RB6 -> RB9",
                                 "median_lift": "RB +11.4%, WR +2.1%"},
    }
    if "--json" in sys.argv:
        out = sys.argv[sys.argv.index("--json") + 1]
        with open(out, "w", encoding="utf8") as fh:
            json.dump(rep, fh, indent=1)
            fh.write("\n")
        print("\n  wrote " + out)
    return 0 if all_ok else 1


if __name__ == "__main__":
    sys.exit(main())
