#!/usr/bin/env python3
"""SIMULATOR FIDELITY — validate the Monte-Carlo rooms against our real drafts.

WHY THIS EXISTS (Cory, 2026-08-08). Experiment 2 §6 reported `run_pressure` at
**0% incidence** and the degeneracy guard classified it INSUFFICIENT-N. That
reads as "positional runs are rare" — which is FALSE about our league. Runs
demonstrably occur across three seasons of real picks, ds7mmet's round-5 QB
pattern is documented in the dossiers, and the engine carries a run-detector
because runs are real. **0% was a MODEL finding, not a league finding:** the
Monte-Carlo rooms could not GENERATE the state, so its experiments could not
test it.

The cause is independence. Opponents drafting to modeled tendencies with
UNCORRELATED noise never cascade. Real runs ARE correlated — one reach triggers
the next as humans watch a position empty. An independent sampler cannot
produce that, at any temperature.

So: (1) measure the real statistics, (2) fit a cascade term to them, (3) report
EVERY statistic the sim cannot reproduce as a standing limitation — because a
statistic the sim can't reproduce is a state its experiments can't test, and
saying so beats reporting a clean zero.

Run: python draft/backtest/sim_validation.py → SIM-FIDELITY.{md,json}
"""
from __future__ import annotations
import argparse
import json
import random
from collections import Counter
from pathlib import Path

import cory_conditional as CC

HERE = Path(__file__).resolve().parent
HIST = HERE.parent / "data" / "league_history.json"
BOARD = HERE.parent.parent / "public" / "draft_data.json"

# A RUN, defined identically for real and simulated drafts so the comparison is
# apples to apples: >= RUN_K picks of one position inside a RUN_W-pick window.
RUN_W = 5
RUN_K = 3


def position_map():
    """player_id -> position, from the board plus every dedicated starter slot
    the harvest recorded (99%+ coverage on all three real drafts)."""
    pos = {}
    art = json.loads(BOARD.read_text())
    for p in art.get("players", []):
        if p.get("position"):
            pos[str(p["player_id"])] = p["position"]
    for k in art.get("kept_players", []):
        if k.get("position"):
            pos[str(k["player_id"])] = k["position"]
    hist = json.loads(HIST.read_text())
    for s in hist["seasons"]:
        tpl = s.get("roster_positions") or []
        for entries in (s.get("weeks") or {}).values():
            for e in entries or []:
                for slot, pid in zip(tpl, e.get("starters") or []):
                    if slot in ("QB", "RB", "WR", "TE", "K", "DEF"):
                        pos.setdefault(str(pid), slot)
    return pos


def real_sequences():
    """[[position, ...] in pick order] for each real, non-keeper draft."""
    pos = position_map()
    hist = json.loads(HIST.read_text())
    out = {}
    for s in hist["seasons"]:
        for d in (s.get("drafts") or []):
            picks = sorted((p for p in (d.get("picks") or []) if not p.get("is_keeper")),
                           key=lambda p: p.get("pick_no") or 0)
            seq = [pos.get(str(p["player_id"])) for p in picks]
            seq = [x for x in seq if x]
            if len(seq) > 50:
                out[str(s["season"])] = seq
    return out


# --- the statistics (computed identically on real and simulated sequences) ----

def run_stats(seq):
    """Fraction of picks inside a run, plus the run-length distribution."""
    in_run = [False] * len(seq)
    lengths = []
    i = 0
    while i < len(seq):
        # longest same-position streak-within-window starting at i
        window = seq[i:i + RUN_W]
        c = Counter(window)
        pos, n = (c.most_common(1)[0] if c else (None, 0))
        if n >= RUN_K:
            for j in range(i, min(i + RUN_W, len(seq))):
                if seq[j] == pos:
                    in_run[j] = True
            lengths.append(n)
            i += RUN_W
        else:
            i += 1
    return {"run_share": round(sum(in_run) / max(1, len(seq)), 3),
            "runs_per_draft": len(lengths),
            "mean_run_len": round(sum(lengths) / len(lengths), 2) if lengths else 0.0}


def timing_curve(seq, buckets=5):
    """Position share by draft phase — the shape of when positions go."""
    n = len(seq)
    out = {}
    for b in range(buckets):
        chunk = seq[int(b * n / buckets):int((b + 1) * n / buckets)]
        c = Counter(chunk)
        tot = max(1, len(chunk))
        out[f"q{b + 1}"] = {p: round(c.get(p, 0) / tot, 3) for p in ("QB", "RB", "WR", "TE")}
    return out


def summarize(seqs):
    rs = [run_stats(s) for s in seqs]
    return {
        "run_share": round(sum(r["run_share"] for r in rs) / len(rs), 3),
        "runs_per_draft": round(sum(r["runs_per_draft"] for r in rs) / len(rs), 2),
        "mean_run_len": round(sum(r["mean_run_len"] for r in rs) / len(rs), 2),
        "timing": timing_curve([p for s in seqs for p in s]),
    }


# --- simulated sequences, with the cascade term -------------------------------

def sim_sequences(n_rooms, cascade, seed=CC.SEED):
    pool, my_keepers, opp_keepers, my_picks = CC.load_world()
    seqs = []
    for i in range(n_rooms):
        rng = random.Random(seed + 5000 + i)
        seq = CC.draft_room_sequence(pool, my_keepers, opp_keepers, my_picks, rng,
                                     cascade=cascade)
        seqs.append(seq)
    return seqs


def fit_cascade(real, grid, rooms):
    """Pick the cascade magnitude whose run_share best matches the real drafts.
    FITTED FROM OUR OWN THREE SEASONS — cited, not chosen for taste."""
    target = real["run_share"]
    rows = []
    for c in grid:
        sim = summarize(sim_sequences(rooms, c))
        rows.append({"cascade": c, "run_share": sim["run_share"],
                     "runs_per_draft": sim["runs_per_draft"],
                     "err": round(abs(sim["run_share"] - target), 4)})
    best = min(rows, key=lambda r: r["err"])
    return best, rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--rooms", type=int, default=24)
    ap.add_argument("--out", default=str(HERE / "sim-fidelity.json"))
    ap.add_argument("--report", default=str(HERE / "SIM-FIDELITY.md"))
    args = ap.parse_args()

    real_seqs = real_sequences()
    real = summarize(list(real_seqs.values()))
    grid = [0.0, 1.0, 2.0, 4.0, 8.0, 16.0]
    best, rows = fit_cascade(real, grid, args.rooms)
    fitted = summarize(sim_sequences(args.rooms, best["cascade"]))
    baseline = summarize(sim_sequences(args.rooms, 0.0))

    def cmp(stat, r, s, tol):
        ok = abs(r - s) <= tol
        return {"stat": stat, "real": r, "sim": s, "tolerance": tol, "reproduces": ok}

    checks = [
        cmp("run_share", real["run_share"], fitted["run_share"], 0.05),
        cmp("runs_per_draft", real["runs_per_draft"], fitted["runs_per_draft"], 1.5),
        cmp("mean_run_len", real["mean_run_len"], fitted["mean_run_len"], 0.5),
    ]
    for q in ("q1", "q3", "q5"):
        for p in ("RB", "WR", "QB"):
            checks.append(cmp(f"timing_{q}_{p}", real["timing"][q][p],
                              fitted["timing"][q][p], 0.15))
    cannot = [c["stat"] for c in checks if not c["reproduces"]]

    result = {
        "definition": {"run_window": RUN_W, "run_min": RUN_K},
        "real": real, "sim_independent": baseline, "sim_fitted": fitted,
        "fitted_cascade": best["cascade"], "fit_grid": rows,
        "checks": checks, "cannot_reproduce": cannot,
        "not_measurable_locally": [
            "reach / ADP-deviation distribution — historical ADP lives in the "
            "CI-built bundles (egress); this comparison runs in the replay-bridge job"],
    }
    Path(args.out).write_text(json.dumps(result, indent=1))

    L = ["# SIMULATOR FIDELITY — Monte-Carlo rooms vs our three real drafts", "",
         f"_run = ≥{RUN_K} of one position inside a {RUN_W}-pick window, computed "
         f"identically on real and simulated sequences · {args.rooms} sim rooms per point_", "",
         "## The finding that forced this",
         "",
         "Experiment 2 §6 reported `run_pressure` at **0% incidence**. That is a "
         "**MODEL finding, not a league finding** — positional runs demonstrably "
         "occur in our real drafts "
         f"(**{real['run_share']:.0%}** of real picks sit inside a run, "
         f"**{real['runs_per_draft']:.1f}** runs per draft). The independent "
         f"sampler produced **{baseline['run_share']:.0%}**. Opponents drawing "
         "with uncorrelated noise never cascade; real runs ARE correlated — one "
         "reach triggers the next as humans watch a position empty.", "",
         "## The cascade term (fitted to our own three seasons)", "",
         "| cascade | sim run share | runs/draft | |err| vs real |", "|---|---|---|---|"]
    for r in rows:
        mark = " ← fitted" if r["cascade"] == best["cascade"] else ""
        L.append(f"| {r['cascade']} | {r['run_share']:.0%} | {r['runs_per_draft']} | {r['err']}{mark} |")
    L += ["", f"**Fitted magnitude: {best['cascade']}** — the value whose run frequency "
          f"best matches the real drafts (real {real['run_share']:.0%} vs fitted "
          f"{fitted['run_share']:.0%}). Fitted from OUR data, not chosen for taste.", "",
          "## Statistic-by-statistic: what the simulator can and cannot reproduce", "",
          "| statistic | real | sim (fitted) | tol | reproduces? |", "|---|---|---|---|---|"]
    for c in checks:
        L.append(f"| {c['stat']} | {c['real']} | {c['sim']} | ±{c['tolerance']} "
                 f"| {'✅' if c['reproduces'] else '❌'} |")
    L += ["", "## ⚠️ STANDING LIMITATION — states these experiments CANNOT test", ""]
    if cannot:
        L.append("The simulator does not reproduce: **" + ", ".join(cannot) + "**. "
                 "Any experiment conditioning on these states is measuring the model, "
                 "not the league — its result must be read as a model finding and its "
                 "state reported as untestable, exactly as `run_pressure` should have been.")
    else:
        L.append("Every measured statistic reproduces within tolerance. This does NOT "
                 "mean the sim is faithful in general — only that these statistics are.")
    L += ["", "**Not measurable locally:** " + result["not_measurable_locally"][0] + ".", "",
          "_This section is standing: it re-runs with the Lab and any statistic that "
          "drifts out of tolerance becomes a new limitation entry. The measurement "
          "being structurally unable to see a thing is itself a finding._"]
    Path(args.report).write_text("\n".join(L))

    print(f"real run_share {real['run_share']:.0%} ({real['runs_per_draft']} runs/draft) | "
          f"independent sim {baseline['run_share']:.0%} | fitted cascade {best['cascade']} "
          f"-> {fitted['run_share']:.0%}")
    print("cannot reproduce:", cannot or "none of the measured statistics")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
