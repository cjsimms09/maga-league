#!/usr/bin/env python3
# TERRITORY: relay — PREPARED, GATED, AND REFUSES TO APPLY WITHOUT A'S APPROVAL.
"""GIVE `proj_ceiling` THE PLAYER-SPECIFIC INPUT IT HAS NEVER HAD.

Cory, 2026-08-17: "adjusters dont see to do anything. should be searching for
more upside in later rounds." Then: "fix and send to A for approval."

WHAT THE MEASUREMENTS ESTABLISHED FIRST, so this is not a guess:

  * register 4j — **0 of 535 players share a `proj_mean` and differ on ANY
    dispersion field.** `proj_ceiling`, `proj_floor`, `proj_sd`, `weekly_sd`,
    `variance` are pure functions of `(position, proj_mean)`. Within position,
    Spearman(mean, ceiling) = .984-.9994.
  * register 4m — the ceiling WEIGHT is therefore nearly inert where it is
    wanted: swinging it 20x moves 1, 1, 0, 0, 0 of the top 60 at picks 108, 113,
    128, 133, 148. And `CEILING_LATE_FROM` is fully inert: opening the gate 19
    picks earlier moves ZERO at every pick.

**So neither the weight nor the gate can deliver late-round upside. The FIELD
carries no information the `value` term does not already have.** That is the
thing to fix, and it is the only one of the three that can work.

── THE SIGNAL, AND WHY THIS ONE ───────────────────────────────────────────

`adp_sd` — how much ten thousand drafters DISAGREE about a player. Measured on
the live board: **617/617 coverage, 131 distinct values, and it reaches nothing
today.** It is named in advance in `UPSIDE-PLAYER-SPECIFIC-PREREG.md` as the arm
to watch, before any number existed. A player the market cannot agree on has a
wider outcome distribution than one it is certain about — that is what
disagreement MEANS — and it is exactly the "who has more upside than his
projection suggests" question the board cannot currently answer.

── THE DESIGN, AND WHAT IT DELIBERATELY DOES NOT TOUCH ────────────────────

    new_ceiling = proj_mean + (proj_ceiling - proj_mean) * (1 + k*z)

**IT SCALES THE SPREAD ABOVE THE MEAN AND NEVER THE MEAN.** `proj_mean` is
untouched, so `vorp` is untouched, so the BOARD ORDER is untouched. Nothing
moves except through the `ceiling` term itself. That is the narrowest possible
blast radius for a dispersion change four days before a draft, and it is why
this is safe to even propose now.

`z` is a robust within-position score of `adp_sd` (median / MAD, not mean / sd,
so a handful of wildly-disagreed-upon players cannot set the scale for everyone
else). `k` is capped, same shape and same reversibility as `opportunity_cap`.

── IT REFUSES TO APPLY ────────────────────────────────────────────────────

Default is REPORT ONLY. `--apply` additionally requires `--approved-by` naming
who approved it, and the string is written into the board's provenance so a
reader in 2027 can see it was a decision rather than a drift. The same shape as
`apply_rookie_prior_own_model_2026.py`, and for the same reason: a tool that can
change the board on its own eventually will.

Run:  python3 draft/tools/apply_player_specific_ceiling.py            # report
      python3 draft/tools/apply_player_specific_ceiling.py --apply --approved-by "A"
"""
from __future__ import annotations

import argparse
import json
import statistics as st
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BOARD = ROOT / "public" / "draft_data.json"
SKILL = ("QB", "RB", "WR", "TE")
CAP = 0.15          # max +/- fraction applied to the SPREAD, never to the mean
MAD_TO_SD = 1.4826  # makes MAD comparable to a standard deviation


def _z_by_position(players):
    """Robust within-position z of `adp_sd`, median/MAD rather than mean/sd.

    MAD because `adp_sd` is long-tailed: a few players the room cannot agree on
    at all would otherwise set the scale and squash everyone else toward zero,
    which is how a "player-specific" term quietly becomes a two-group flag.
    """
    out = {}
    for pos in SKILL:
        vals = [p["adp_sd"] for p in players
                if p.get("position") == pos and isinstance(p.get("adp_sd"), (int, float))]
        if len(vals) < 8:
            continue                     # too thin to standardise: leave the position alone
        med = st.median(vals)
        mad = st.median([abs(v - med) for v in vals]) * MAD_TO_SD
        if mad <= 0:
            continue                     # no dispersion to read: refuse rather than divide
        out[pos] = (med, mad)
    return out


def compute(board, cap=CAP):
    players = board.get("players") or []
    scales = _z_by_position(players)
    rows = []
    for p in players:
        pos = p.get("position")
        if pos not in scales:
            continue
        sd, mean, ceil = p.get("adp_sd"), p.get("proj_mean"), p.get("proj_ceiling")
        if not isinstance(sd, (int, float)) or not mean or not ceil or ceil <= mean:
            continue
        med, mad = scales[pos]
        z = (sd - med) / mad
        mult = 1.0 + max(-1.0, min(1.0, z / 2.0)) * cap
        rows.append({
            "player_id": p.get("player_id"), "name": p.get("name"), "position": pos,
            "adp": p.get("adp"), "adp_sd": sd, "proj_mean": mean,
            "old_ceiling": ceil, "z": round(z, 3), "mult": round(mult, 4),
            "new_ceiling": round(mean + (ceil - mean) * mult, 2),
        })
    return rows


def _breaks_4j(rows):
    """Does this actually FIX the thing it is for?

    4j's defining property: players with the same `proj_mean` have the same
    ceiling. If that still holds after the change, the term is not
    player-specific and this whole tool is decoration.
    """
    by_mean = {}
    differing = same = 0
    for r in rows:
        key = (r["position"], r["proj_mean"])
        if key in by_mean:
            if abs(by_mean[key] - r["new_ceiling"]) > 1e-9:
                differing += 1
            else:
                same += 1
        else:
            by_mean[key] = r["new_ceiling"]
    return differing, same


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--approved-by", default="")
    ap.add_argument("--cap", type=float, default=CAP)
    a = ap.parse_args()

    board = json.loads(BOARD.read_text())
    rows = compute(board, a.cap)
    if not rows:
        print("REFUSING: no player carries both adp_sd and a ceiling above the mean.")
        return 1

    moved = [r for r in rows if abs(r["mult"] - 1.0) > 1e-9]
    ups = sorted(rows, key=lambda r: -r["mult"])[:10]
    downs = sorted(rows, key=lambda r: r["mult"])[:5]
    differing, same = _breaks_4j(rows)

    print("PLAYER-SPECIFIC CEILING — PREPARED DIFF, NOT APPLIED\n")
    print(f"  cap +/-{a.cap:.0%} on the SPREAD above the mean. proj_mean untouched,")
    print("  so vorp and the board ORDER are untouched — only the ceiling term moves.\n")
    print(f"  {len(rows)} players priced, {len(moved)} actually move")
    print(f"  multiplier range {min(r['mult'] for r in rows):.4f} .. "
          f"{max(r['mult'] for r in rows):.4f}\n")

    print("  DOES IT FIX 4j? (players sharing a proj_mean, do their ceilings now DIFFER?)")
    print(f"    differ: {differing}    still identical: {same}")
    if differing == 0:
        print("    ⚠️ ZERO DIFFER — the term is NOT player-specific and this tool is")
        print("       decoration. Do not approve it.")
    else:
        print("    ✅ the board can now say 'same projection, different upside'.")

    print("\n  BIGGEST UPSIDE BOOSTS (market disagrees most):")
    for r in ups:
        print(f"    {str(r['name'])[:22]:22s} {r['position']:3s} adp {str(r['adp'])[:6]:>6s} "
              f"sd {r['adp_sd']:>5} z {r['z']:>6}  ceiling {r['old_ceiling']:>7} -> {r['new_ceiling']:>7}")
    print("\n  BIGGEST HAIRCUTS (market is most certain):")
    for r in downs:
        print(f"    {str(r['name'])[:22]:22s} {r['position']:3s} adp {str(r['adp'])[:6]:>6s} "
              f"sd {r['adp_sd']:>5} z {r['z']:>6}  ceiling {r['old_ceiling']:>7} -> {r['new_ceiling']:>7}")

    if not a.apply:
        print("\n  REPORT ONLY — nothing was written.")
        print("  To apply: --apply --approved-by \"<name>\"  (both required).")
        return 0
    if not a.approved_by.strip():
        print("\n  REFUSING TO APPLY: --approved-by is required and empty.")
        print("  A board change with no name on it is a drift, not a decision.")
        return 1

    idx = {r["player_id"]: r for r in rows}
    for p in board.get("players") or []:
        r = idx.get(p.get("player_id"))
        if r:
            p["proj_ceiling"] = r["new_ceiling"]
            p["proj_ceiling_source"] = "measured-2023-25-p90 + adp_sd player term"
    board.setdefault("provenance", {})["player_specific_ceiling"] = {
        "approved_by": a.approved_by, "cap": a.cap, "players_moved": len(moved),
        "signal": "adp_sd, robust within-position z (median/MAD)",
        "note": "scales the SPREAD above proj_mean only; proj_mean and vorp untouched",
    }
    BOARD.write_text(json.dumps(board, indent=1))
    print(f"\n  APPLIED, approved by {a.approved_by}. {len(moved)} players moved.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
