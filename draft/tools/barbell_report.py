# TERRITORY: A
"""READ THE BARBELL ROOMS — the four configurations, side by side, against the
bar fixed in `draft/audit/barbell_strategy_2026-08-17.md` §5.1.

This is a READER, not a second instrument. Every number it prints is already in
one of the four artifacts written by `draft/tools/archetype_rooms.js`; it does
no simulation, no resampling and no derivation beyond formatting and applying
the preregistered bar. That separation is deliberate: a reporting script that
computes is a place for a second definition of an outcome to grow.

Prints, in order:
  1. THE INSTRUMENT CHECK FIRST. What class mix the engine's own top-25
     candidate slice held at each round — because an arm whose target class was
     never on offer is UNDERPOWERED, not evidence of anything, and that has to
     be established before any arm result is read (§5.2).
  2. The paired deltas against the shipped control in all four configurations.
  3. The preregistered bar applied, arm by arm.
  4. Q4: the shipped policy's OWN class-by-round profile — is it already a
     barbell without being told to be one?

Run: python3 draft/tools/barbell_report.py
"""
from __future__ import annotations

import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
DATA = HERE.parent / "data"

CONFIGS = (
    ("PRIMARY  measured room / designated keepers / 120 seeds",
     "archetype_rooms_barbell.json"),
    ("WIRE FLOOR  streaming priced / 120 seeds",
     "archetype_rooms_barbell_wirefloor.json"),
    ("ADP ROOM  noisy-ADP opponents / 40 seeds",
     "archetype_rooms_barbell_adp.json"),
    ("MINE-ONLY  unconfirmed keeper slate / 40 seeds",
     "archetype_rooms_barbell_mineonly.json"),
)
ARMS = ("barbell", "no_deadweight", "anchor_early", "upside_late", "anti_barbell")
CLASSES = ("ANCHOR", "SWING", "DEAD", "UNMEASURED", "NA")


def load(name):
    p = DATA / name
    return json.loads(p.read_text()) if p.exists() else None


def ci_sign(d):
    """'+' CI-clear positive, '-' CI-clear negative, '0' covers zero."""
    if d is None or d.get("ci95") is None:
        return "?"
    lo, hi = d["ci95"]
    return "+" if lo > 0 else ("-" if hi < 0 else "0")


def main() -> None:
    docs = [(label, load(f)) for label, f in CONFIGS]
    missing = [label for label, d in docs if d is None]
    if missing:
        print("MISSING artifacts: " + "; ".join(missing))
        return
    primary = docs[0][1]

    print("=" * 78)
    print("1. THE INSTRUMENT CHECK — what the overlay could ever have done")
    print("=" * 78)
    print("Mean class mix of the ENGINE'S OWN top-25 candidate slice at each of")
    print("my picks, primary configuration, 120 rooms. An arm whose target class")
    print("is absent here is UNDERPOWERED, not refuted.\n")
    sl = primary["summary"]["shipped"]["slice_class_mean_by_round"]
    print("  round   ANCHOR   SWING    DEAD   UNMEAS      NA")
    for k in sorted(sl, key=lambda x: int(x[1:])):
        b = sl[k]
        print("  %-6s %7.1f %7.1f %7.1f %8.1f %7.1f"
              % (k, b["ANCHOR"], b["SWING"], b["DEAD"], b["UNMEASURED"], b["NA"]))
    print("\n  board census (all 682 rows): "
          + json.dumps(primary["upside_census"]))
    print("  outcome-space replacement used: "
          + json.dumps(primary["upside_replacement"]))

    print("\n" + "=" * 78)
    print("2. WHAT EACH ARM ACTUALLY DID")
    print("=" * 78)
    print("  arm             overlay picks/room   vorp given up/room   proj given up/room")
    for arm in ("shipped",) + ARMS:
        s = primary["summary"][arm]
        g = s["overlay_gave_up"]
        print("  %-14s %14s %20s %20s"
              % (arm, s["overlay_diverged_picks_per_room"],
                 g["vorp_per_room"], g["proj_per_room"]))

    print("\n" + "=" * 78)
    print("3. PAIRED DELTAS vs the shipped control (same seed, same room)")
    print("=" * 78)
    for label, doc in docs:
        print("\n  " + label)
        print("  %-14s %22s %22s %10s" % ("arm", "d weekly pts [95% CI]",
                                          "d champ [95% CI]", "d playoff"))
        for arm in ARMS:
            p = doc["paired_vs_shipped"].get(arm)
            if not p:
                continue
            w, c, pl = p["mean_weekly"], p["champ_prob"], p["playoff_prob"]
            print("  %-14s %+7.2f %-15s %+7.4f %-15s %+7.4f %s"
                  % (arm, w["mean"], str(w["ci95"]), c["mean"], str(c["ci95"]),
                     pl["mean"], ci_sign(pl)))

    print("\n" + "=" * 78)
    print("4. THE PREREGISTERED BAR (§5.1) — applied")
    print("=" * 78)
    print("  BEATS the shipped policy requires ALL THREE:")
    print("    (1) champ CI-clear POSITIVE in the primary")
    print("    (2) NOT CI-clear negative in any other configuration")
    print("    (3) same sign in all three 40-seed batches (primary)\n")
    for arm in ARMS:
        signs = []
        for label, doc in docs:
            p = doc["paired_vs_shipped"].get(arm)
            signs.append(ci_sign(p["champ_prob"]) if p else "?")
        one = signs[0] == "+"
        two = "-" not in signs[1:]
        base = {b["seeds"]: b["champ_prob"] for b in primary["batches"]["shipped"]}
        arm_b = {b["seeds"]: b["champ_prob"] for b in primary["batches"][arm]}
        diffs = [round(arm_b[k] - base[k], 4) for k in sorted(base)]
        three = all(d > 0 for d in diffs) or all(d < 0 for d in diffs)
        verdict = ("BEATS the shipped policy" if (one and two and three)
                   else ("FREE AT BEST" if signs[0] == "0" and "-" not in signs[1:]
                         else "LOSES" if "-" in signs else
                         "NOT DISTINGUISHABLE FROM NOISE"))
        print("  %-14s champ-CI signs %s   batch diffs %s   %s%s"
              % (arm, "".join(signs), diffs,
                 "stable" if three else "SIGN FLIPS ACROSS BATCHES", ""))
        print("  %-14s -> %s" % ("", verdict))

    print("\n" + "=" * 78)
    print("5. Q4 — IS THE SHIPPED POLICY ALREADY BARBELLED?")
    print("=" * 78)
    print("The class of the SHIPPED engine's own top recommendation at each")
    print("pick, primary configuration, 120 rooms. This is the live policy's")
    print("shape, measured, with nobody telling it to have one.\n")
    cbr = primary["summary"]["shipped"]["class_by_round"]
    print("  round   picks   ANCHOR    SWING     DEAD       NA")
    for k in sorted(cbr, key=lambda x: int(x[1:])):
        b = cbr[k]
        n = b["picks"]
        t = b["taken"]
        row = [t.get(c, 0) for c in ("ANCHOR", "SWING", "DEAD", "NA")]
        print("  %-6s %6d %8s %8s %8s %8s"
              % (k, n,
                 "%d (%.0f%%)" % (row[0], 100 * row[0] / max(1, n)),
                 "%d (%.0f%%)" % (row[1], 100 * row[1] / max(1, n)),
                 "%d (%.0f%%)" % (row[2], 100 * row[2] / max(1, n)),
                 "%d (%.0f%%)" % (row[3], 100 * row[3] / max(1, n))))
    tot = {}
    for k, b in cbr.items():
        for c, v in b["taken"].items():
            tot[c] = tot.get(c, 0) + v
    print("\n  shipped policy over all rounds: " + json.dumps(tot))


if __name__ == "__main__":
    main()
