#!/usr/bin/env python3
"""DOSSIER-DRIVEN OPPONENT MODEL — seats that genuinely differ.

WHY (Cory, 2026-08-08). Every landed Lab verdict was measured against
HOMOGENEOUS rooms: nine identical ADP-softmax agents. Identical agents cannot
produce the variety a real room has — which is why `run_pressure` needed a
binarizer rescue to vary at all, why my-turn adjacency was never instrumented,
and why WR Feast's +$86 and the inverted-U dose-responses are, strictly,
findings about a room that does not exist.

This replaces the uniform sampler with PER-SEAT models fitted from three
seasons of real drafts — already computed and shrinkage-weighted in
`draft/config/manager_profiles.json` (fitted with real ADP coverage:
`reach_delta.proxy = false`). Nothing here is invented; every parameter is read
from that file, which is itself derived from picks our league actually made.

WHAT EACH SEAT CARRIES
  positional earliness  `positional_timing[pos].vs_league` — rounds earlier
                        (negative) or later (positive) than the league mean for
                        that position. ds7mmet's documented early-QB pattern is
                        this number, not a story.
  reach tendency        `reach_delta.mean` — how far past ADP they habitually
                        reach; scales how deep into the board they will dip.
  predictability        `shrinkage_weight` + `reach_delta.sd` — a manager with
                        few picks or high variance gets pulled toward league
                        average, so a thin sample cannot masquerade as a
                        personality.

WHAT IT DOES NOT CARRY, stated because it bounds every conclusion:
  platform adherence    exp 31's caveat — historical Sleeper rankings are NOT
                        archived, so adherence-to-platform-ordering cannot be
                        fitted. That dimension stays out of the model rather
                        than being guessed.
"""
from __future__ import annotations
import json
import math
import random
from pathlib import Path

HERE = Path(__file__).resolve().parent
PROFILES = HERE.parent / "config" / "manager_profiles.json"

# How strongly a manager's fitted earliness bends their pick probability. The
# units of `vs_league` are ROUNDS; one round of earliness is a real but not
# overwhelming preference, so a round maps to a modest multiplier and the
# effect saturates. Deliberately gentle: the dossier is evidence, not destiny.
EARLINESS_PER_ROUND = 0.35
MAX_POS_MULT = 3.0
BASE_TEMP = 6.0
REACH_TEMP_PER_ROUND = 0.25      # a habitual reacher samples deeper


def load_profiles(path: Path | None = None) -> dict:
    return json.loads((path or PROFILES).read_text())


def seat_params(profiles: dict) -> dict:
    """{manager_name: {pos_mult, temp, shrinkage, source}} — the fitted room."""
    mgrs = profiles.get("managers") or {}
    out = {}
    for _, d in mgrs.items():
        shrink = float(d.get("shrinkage_weight") or 0.0)
        timing = d.get("positional_timing") or {}
        pos_mult = {}
        for pos, t in timing.items():
            vs = t.get("vs_league")
            if vs is None:
                continue
            # NEGATIVE vs_league = takes the position EARLIER than the league.
            # Shrink toward 1.0 (no preference) by the manager's own weight, so
            # a 5-pick sample cannot invent a personality.
            raw = math.exp(-EARLINESS_PER_ROUND * float(vs))
            mult = 1.0 + shrink * (raw - 1.0)
            pos_mult[pos] = max(1.0 / MAX_POS_MULT, min(MAX_POS_MULT, mult))
        reach = (d.get("reach_delta") or {}).get("mean")
        temp = BASE_TEMP
        if reach is not None:
            # A reacher (positive mean past ADP) samples deeper into the board.
            temp = BASE_TEMP + shrink * REACH_TEMP_PER_ROUND * float(reach)
        out[d.get("name")] = {
            "pos_mult": pos_mult, "temp": max(2.0, min(14.0, temp)),
            "shrinkage": shrink, "picks_analysed": d.get("picks_analysed"),
            "source": "manager_profiles.json (3 seasons, shrinkage-weighted)",
        }
    return out


def heterogeneous_picker(params, cascade, cascade_window):
    """A per-seat sampler: ADP order × that seat's fitted positional preference,
    with the herding term applied on top (a real room has both)."""
    def pick(board, rng, seat_name, recent=None):
        p = params.get(seat_name) or {}
        temp = p.get("temp", BASE_TEMP)
        mult = p.get("pos_mult") or {}
        top = sorted(board, key=lambda x: x["adp"])[:12]
        w = []
        for i, cand in enumerate(top):
            base = math.exp(-i / (temp / 2))
            w.append(base * mult.get(cand["position"], 1.0))
        if cascade and recent:
            window = recent[-cascade_window:]
            if window:
                dens = {}
                for pos in window:
                    dens[pos] = dens.get(pos, 0) + 1
                for j, cand in enumerate(top):
                    d = dens.get(cand["position"], 0) / len(window)
                    w[j] *= (1.0 + cascade * d * d)
        tot = sum(w)
        if tot <= 0:
            return top[0]
        return rng.choices(top, weights=w, k=1)[0]
    return pick


def describe(params) -> list[dict]:
    """One row per seat — what the room actually believes about each manager."""
    rows = []
    for name, p in params.items():
        tilts = sorted(((pos, m) for pos, m in (p["pos_mult"] or {}).items()),
                       key=lambda kv: -kv[1])[:2]
        rows.append({"manager": name, "temp": round(p["temp"], 2),
                     "shrinkage": p["shrinkage"], "picks": p["picks_analysed"],
                     "strongest_tilts": [f"{pos}×{m:.2f}" for pos, m in tilts]})
    return sorted(rows, key=lambda r: -r["temp"])


if __name__ == "__main__":
    prm = seat_params(load_profiles())
    print(f"{len(prm)} seats fitted from manager_profiles.json")
    for r in describe(prm):
        print(f"  {r['manager']:14s} temp {r['temp']:5.2f}  shrink {r['shrinkage']:.2f}  "
              f"picks {str(r['picks']):>4}  tilts {', '.join(r['strongest_tilts'])}")
