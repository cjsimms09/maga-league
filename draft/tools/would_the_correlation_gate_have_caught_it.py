# TERRITORY: A
"""WOULD THE CEILING PROGRAM'S 0.9 CORRELATION GATE HAVE CAUGHT OUR WORST DEFECT?

The external audit of the ceiling program (run 32329899806, 2026-08-20) accepted
the plan with zero critical findings, but left three UNKNOWNs. This answers the
one that is actually decidable today:

    "Whether the correlation-gate threshold (>0.9 vs DS band/proj_mean) would
     have actually caught prior constant-multiple defects (no retrospective
     check included)."

I raised the same question in my own submission, so answering it rather than
routing it back unanswered is the point.

-- THE DEFECT BEING RE-CREATED --------------------------------------------

Every dispersion field on the board was `proj_mean x a per-band constant` --
zero player-specific information. It survived long enough to invalidate three
conclusions we believed. The ceiling program's proposed defence is a gate: any
"new" ceiling signal that rank-correlates > 0.9 with the incumbent band or with
proj_mean itself is a costume, filed as one.

-- WHY THIS IS NOT AS OBVIOUS AS IT LOOKS ----------------------------------

A single global constant is trivially caught: `proj_mean x k` is perfectly
monotonic in proj_mean, so Spearman = 1.0. But the real defect used a
PER-BAND constant, and a step function across bands can REORDER players
relative to proj_mean at band boundaries. So the honest question is whether
banding pushed the correlation below the 0.9 bar -- i.e. whether the gate would
have waved the real defect through while catching only its simplest cousin.

That is what this measures, at the band counts the defect plausibly used.

-- CONTROLS (rule 3e/3f) ---------------------------------------------------

  KNOWN POSITIVE : the genuine per-player band (proj_ds_floor/ceiling, real
                   Draft Sharks numbers) must score BELOW 0.9 -- a real signal
                   must pass the gate, or the gate rejects everything and means
                   nothing.
  KNOWN NEGATIVE : pure noise must score near 0 -- if it scored high, the
                   estimator is broken rather than the finding real.

REPORT ONLY. Writes draft/data/correlation_gate_retrospective.json.
Run: python3 draft/tools/would_the_correlation_gate_have_caught_it.py
"""
import json
import os
import random

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
BOARD = os.path.join(ROOT, "public", "draft_data.json")
GATE = 0.9


def spearman(xs, ys):
    """Rank correlation, average ranks for ties."""
    def ranks(v):
        order = sorted(range(len(v)), key=lambda i: v[i])
        r = [0.0] * len(v)
        i = 0
        while i < len(order):
            j = i
            while j + 1 < len(order) and v[order[j + 1]] == v[order[i]]:
                j += 1
            avg = (i + j) / 2.0 + 1.0
            for k in range(i, j + 1):
                r[order[k]] = avg
            i = j + 1
        return r
    rx, ry = ranks(xs), ranks(ys)
    n = len(rx)
    mx, my = sum(rx) / n, sum(ry) / n
    num = sum((rx[i] - mx) * (ry[i] - my) for i in range(n))
    dx = sum((rx[i] - mx) ** 2 for i in range(n)) ** 0.5
    dy = sum((ry[i] - my) ** 2 for i in range(n)) ** 0.5
    return num / (dx * dy) if dx and dy else float("nan")


def main():
    board = json.load(open(BOARD))
    players = [p for p in board["players"] if isinstance(p.get("proj_mean"), (int, float))
               and p["proj_mean"] > 0]
    mean = [p["proj_mean"] for p in players]

    rows = []

    # ── THE DEFECT, RECONSTRUCTED AT SEVERAL BAND COUNTS ────────────────────
    for nbands in (1, 3, 5, 10, 20):
        order = sorted(range(len(players)), key=lambda i: -mean[i])
        band_of = {}
        per = max(1, len(order) // nbands)
        for pos, idx in enumerate(order):
            band_of[idx] = min(nbands - 1, pos // per)
        # a distinct constant per band, of the shape the real defect used
        consts = [1.15 + 0.05 * b for b in range(nbands)]
        fake = [mean[i] * consts[band_of[i]] for i in range(len(players))]
        rho = spearman(fake, mean)
        rows.append({
            "arm": "constant-multiple defect, %d band(s)" % nbands,
            "spearman_vs_proj_mean": round(rho, 6),
            "caught_by_gate": bool(rho > GATE),
        })

    # ── KNOWN POSITIVE: a genuine per-player band must PASS the gate ────────
    real = [p for p in players
            if isinstance(p.get("proj_ds_ceiling"), (int, float))
            and isinstance(p.get("proj_ds_floor"), (int, float))]
    if len(real) >= 50:
        width = [p["proj_ds_ceiling"] - p["proj_ds_floor"] for p in real]
        rmean = [p["proj_mean"] for p in real]
        rho = spearman(width, rmean)
        rows.append({
            "arm": "KNOWN POSITIVE — real Draft Sharks band width (n=%d)" % len(real),
            "spearman_vs_proj_mean": round(rho, 6),
            "caught_by_gate": bool(rho > GATE),
        })

    # ── KNOWN NEGATIVE: noise must score near zero ──────────────────────────
    rnd = random.Random(20260820)
    noise = [rnd.random() for _ in players]
    rho = spearman(noise, mean)
    rows.append({
        "arm": "KNOWN NEGATIVE — pure noise",
        "spearman_vs_proj_mean": round(rho, 6),
        "caught_by_gate": bool(rho > GATE),
    })

    defect_rows = [r for r in rows if r["arm"].startswith("constant-multiple")]
    all_caught = all(r["caught_by_gate"] for r in defect_rows)
    pos = [r for r in rows if r["arm"].startswith("KNOWN POSITIVE")]
    pos_passes = bool(pos) and not pos[0]["caught_by_gate"]

    doc = {
        "_territory": "TERRITORY: A — draft/tools/would_the_correlation_gate_have_caught_it.py",
        "_question": "The ceiling program's audit left this UNKNOWN: would the >0.9 "
                     "correlation gate have caught the constant-multiple defect?",
        "_answer": ("YES at every band count tested" if all_caught
                    else "NO — the gate misses the defect at some band counts"),
        "gate_threshold": GATE,
        "n_players": len(players),
        "arms": rows,
        "gate_catches_every_defect_arm": all_caught,
        "gate_still_admits_a_real_signal": pos_passes,
        "_caveat": "This reconstructs the defect's SHAPE (proj_mean x a per-band "
                   "constant) on today's board. It is not the historical artifact, "
                   "which is not recoverable. It answers 'would this gate catch this "
                   "shape', not 'did it catch that file'.",
    }
    out = os.path.join(ROOT, "draft", "data", "correlation_gate_retrospective.json")
    json.dump(doc, open(out, "w"), indent=1)

    print("\n  WOULD THE 0.9 CORRELATION GATE HAVE CAUGHT THE CONSTANT-MULTIPLE DEFECT?\n")
    print("  %-52s %10s  %s" % ("arm", "spearman", "caught?"))
    for r in rows:
        print("  %-52s %10.4f  %s"
              % (r["arm"][:52], r["spearman_vs_proj_mean"],
                 "YES" if r["caught_by_gate"] else "no"))
    print("\n  verdict: %s" % doc["_answer"])
    if pos:
        print("  and it still ADMITS a real per-player signal: %s"
              % ("yes" if pos_passes else "NO — the gate would reject real signals too"))
    print("\n  wrote draft/data/correlation_gate_retrospective.json")


if __name__ == "__main__":
    main()
