#!/usr/bin/env python3
"""EXPERIMENT 24 — the winning ceiling SHAPE, from BBM finals rosters.

THE QUESTION (the one the league structurally ignores): our weekly-high pool is
37.5% of the pot and pays DISTRIBUTION SHAPE — ceiling, not floor — and nine of
ten owners draft for head-to-head floor. So: what positional construction actually
separates a ROSTER THAT WINS the top of the pool from one that merely qualifies?

Our three seasons cannot answer it — n≈27 of Cory's picks, no counterfactual
rosters. BBM can: the finals dumps are hundreds of outcome-labelled elite rosters,
each an 18-man best-ball build with a total score that decides a $2M tournament.
Everyone in the finals already survived from ~700k entries, so "top finishers vs
typical finalist" isolates PURE CEILING — exactly the signal our weekly-high pool
rewards, measured at a sample our league will never reach.

DISCIPLINE. This does not touch the board. It reports a SHAPE DELTA (what winners
load relative to the field), tagged BBM-supporting and wrapped in the caveat wall
(bbm_translate): BBM is 12-team / 18-round / no-keepers / BBM-scored, so the
transferable object is the DIRECTION and the per-position FRACTION, never a literal
count to copy. Big foreign data proposes; our data disposes — this is a prior for a
league-conditional, money-graded test, not an install.

Run:  python3 draft/backtest/exp24_bbm_shape.py <pick_by_pick.csv> [out.json]
Pure core (fraction math, translation) unit-tested in test_exp24_bbm_shape.py.
"""
from __future__ import annotations
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import bbm_ingest as ING          # noqa: E402
import bbm_translate as TR        # noqa: E402

# The construction question depends on team-size, round-count, economics and BBM
# scoring — but NOT on lineup-setting (drafting a shape is construction, not
# execution), so it crosses the wall as a directional prior.
SHAPE_CAVEATS = ["team_size", "rounds_keepers", "economics", "scoring_is_bbm"]

# Our roster is 15 rounds; BBM is 18. To translate a BBM shape to our format we
# compare FRACTIONS of the drafted roster, not raw counts.
OUR_ROUNDS = 15


def _fraction_shape(count_shape: dict, denom: float) -> dict:
    """A count-by-position shape -> fraction-of-roster, so an 18-man BBM shape and
    our 15-man shape are on the same axis."""
    if not denom:
        return {}
    return {pos: round(n / denom, 4) for pos, n in count_shape.items()}


def translate_to_our_format(winner_frac: dict) -> dict:
    """Project the winners' per-position FRACTION onto our 15-round roster — the
    directional 'draft this many-ish' translation, explicitly a fraction*rounds
    estimate and NOT a prescription (it still must clear our gates)."""
    return {pos: round(f * OUR_ROUNDS, 2) for pos, f in winner_frac.items()}


def analyse(parsed: list[dict], top_fracs=(0.05, 0.10, 0.25)) -> dict:
    """Winning-shape delta at several top-fractions (robustness, not fitting: a
    finding that only shows at one cutoff is not a finding). Reports the raw BBM
    winner/field count shapes, the fraction shapes, the winner-minus-field delta,
    and the delta's stability across cutoffs."""
    rosters = ING.rosters_for_shape(parsed)
    pos_by_id = ING.pos_by_id_of(parsed)

    by_cut = {}
    for tf in top_fracs:
        ws = TR.winning_shape(rosters, pos_by_id, top_frac=tf)
        if not ws.get("n"):
            continue
        # Denominator = the actual mean roster size (sum of the mean count shape),
        # so fractions are fraction-of-roster whatever the format's round count.
        denom_w = sum(ws["winner_shape"].values()) or 1.0
        denom_f = sum(ws["field_shape"].values()) or 1.0
        winner_frac = _fraction_shape(ws["winner_shape"], denom_w)
        field_frac = _fraction_shape(ws["field_shape"], denom_f)
        frac_delta = {pos: round(winner_frac.get(pos, 0) - field_frac.get(pos, 0), 4)
                      for pos in set(winner_frac) | set(field_frac)}
        by_cut[f"{tf:.2f}"] = {
            "n": ws["n"], "n_winners": ws["n_winners"],
            "winner_count_shape": ws["winner_shape"],
            "field_count_shape": ws["field_shape"],
            "winner_fraction": winner_frac,
            "field_fraction": field_frac,
            "winner_minus_field_fraction": frac_delta,
            "winner_minus_field_count": ws["winner_minus_field"],
            "translated_to_our_15": translate_to_our_format(winner_frac),
        }

    # Stability: is the sign of each position's delta the same across all cutoffs?
    positions = set()
    for c in by_cut.values():
        positions |= set(c["winner_minus_field_fraction"])
    stable = {}
    for pos in positions:
        signs = {(1 if c["winner_minus_field_fraction"].get(pos, 0) > 0 else
                  (-1 if c["winner_minus_field_fraction"].get(pos, 0) < 0 else 0))
                 for c in by_cut.values()}
        stable[pos] = (len(signs) == 1 and 0 not in signs)
    return {"by_cut": by_cut, "sign_stable_across_cuts": stable}


def run(csv_path: str | Path) -> dict:
    parsed = ING.parse_pick_by_pick(csv_path)
    core = analyse(parsed)
    primary = core["by_cut"].get("0.10", {})
    delta = primary.get("winner_minus_field_fraction", {})
    # The headline, assembled from the ACTUAL deltas (no hand-written direction).
    lean = sorted(delta.items(), key=lambda kv: -kv[1])
    def phrase(kv):
        pos, v = kv
        return f"{pos} {'+' if v > 0 else ''}{v * 100:.1f}% of roster"
    note = ("Among BBM finalists, the top-decile scorers vs the typical finalist: "
            + "; ".join(phrase(kv) for kv in lean) + ". SHAPE/direction only "
            "(BBM-scored, 12-team/18-round) — a prior for a league-conditional, "
            "money-graded test, never a board install.")
    finding = TR.bbm_finding(
        {"winner_minus_field_fraction": delta,
         "translated_to_our_15": primary.get("translated_to_our_15", {})},
        note=note, depends_on=SHAPE_CAVEATS,
    )
    return {
        "experiment": "24 — BBM winning ceiling shape (finals rosters)",
        "source": str(csv_path),
        "sha256": ING.content_hash(csv_path),
        "n_rosters": len(parsed),
        "n_with_outcome": len(ING.rosters_for_shape(parsed)),
        "analysis": core,
        "finding": finding,
        "pre_registered": {
            "question": "what positional SHAPE separates top-of-pool ceiling rosters from the field",
            "reading": ("a positive winner-minus-field fraction for a position means winners "
                        "OVER-weight it; sign-stability across top-fractions is required before "
                        "the direction is trusted"),
            "gate": "BBM proposes; our data disposes — league-conditional + money-graded + null/CV before any install",
        },
        "caveats": {c: TR.CAVEAT_WALL[c] for c in SHAPE_CAVEATS},
        "source_tier": TR.SOURCE_TIER_BBM,
    }


if __name__ == "__main__":   # pragma: no cover
    csv_path = sys.argv[1]
    out = run(csv_path)
    dest = Path(sys.argv[2]) if len(sys.argv) > 2 else HERE / "exp24.json"
    dest.write_text(json.dumps(out, indent=2))
    print(json.dumps(out["finding"], indent=2))
    print(f"\nwrote {dest}")
