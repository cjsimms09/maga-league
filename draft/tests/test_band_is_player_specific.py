# TERRITORY: A
"""ARE THE FLOOR AND CEILING THE SAME PERCENTAGE OFF THE MEAN, PER PLAYER?

Cory, 2026-08-19: "we also need to make sure mean proj is what is showing on
draft day including draft shark, the proj max and floor values are correct and
the same % apart from mean proj (for each player, player specific)."

Cory, 2026-08-20: "And the mean ceiling and floors match same percentage as
draft sharks ceiling and floors from dark shark mean?"

He asked twice, and the second time it found a live defect I had shipped:
`attach_draftsharks.py` collapsed `proj_floor == proj_ceiling == proj_mean` for
363 players -- every player Draft Sharks does not cover. The intent ("do not
invent a band") was right; the bug was confusing "DS has no band for him" with
"he has no band", when the board already held a measured, player-specific one.
Darren Waller went from 61.95 / 87.72 / 113.5 to flat. TEN were inside Cory's
own draft range, including Cooper Kupp and Ja'Kobi Lane.

⚠️ WHY A FLAT BAND IS NOT A NEUTRAL FALLBACK. `MEASURED_WEIGHTS.ceiling` is
0.45. A ceiling equal to the mean does not abstain -- it asserts the player has
no upside, and prices him accordingly against everyone who has one.

⚠️ AND THE OPPOSITE FAILURE IS THE ONE THIS PROJECT ALREADY PAID FOR. In August
every dispersion field on the board was `proj_mean x a per-band constant` --
zero player-specific information -- and it was the single cause of three
conclusions we had believed. So a band being PRESENT is not enough; it has to
VARY. Both directions are checked below.

Run: python3 draft/tests/test_band_is_player_specific.py
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BOARD = json.loads((ROOT / "public" / "draft_data.json").read_text())
P = [p for p in BOARD["players"] if (p.get("proj_mean") or 0) > 0]

_fails = []


def ck(name, cond, detail=None):
    if cond:
        print("PASS  " + name)
    else:
        # ⚠️ THE DETAIL GOES INTO _fails TOO, ADDED 2026-08-20, AND THE REASON
        # IS AN HOUR OF MY OWN TIME. `_fails` used to carry only the check's
        # NAME, and this file's names carry HISTORICAL context -- "ten did,
        # including Cooper Kupp and Ja'Kobi Lane" is register 140's story, not a
        # live count. So when the post-chain gate refused a rebuild, the CI
        # assertion printed that sentence and nothing else, and it reads exactly
        # like a measurement of the board in front of you. It is not. The live
        # answer that run was ONE player (Jayden Higgins, ADP 121.5) and I spent
        # an hour investigating ten, including two men who were fine.
        #
        # A failure message that names a stale example instead of the live one
        # is a false negative wearing a number (Rule 3i: never quote a value
        # without the population behind it).
        _fails.append(name + ("  — LIVE: " + repr(detail)[:320]
                              if detail is not None else ""))
        print("FAIL  " + name + ("  — " + repr(detail)[:320] if detail is not None else ""))


has_ds = [p for p in P if (p.get("proj_ds") or 0) > 0 and p.get("proj_ds_floor") is not None]
no_ds = [p for p in P if p not in has_ds]

# ── 1. CORY'S QUESTION, LITERALLY: same % as Draft Sharks' own band ──────────
ck("CONTROL — the board actually carries Draft Sharks bands, so this can fire",
   len(has_ds) > 100, len(has_ds))

# ⚠️ THE TOLERANCE IS DERIVED, NOT CHOSEN, AND MY FIRST VERSION OF IT WAS A
# FLAT 0.5 PERCENTAGE POINTS THAT FAILED ON A 20.8-POINT PLAYER. Loosening a
# flat bar until it passes is exactly what `no_fit_guard` forbids, so instead
# the bound comes from the arithmetic:
#
#   the board stores proj_* on a 0.1 grid, so proj_mean carries +/- 0.05 of
#   rounding, and the band is `mean x ratio` -- which multiplies that error by
#   the ratio itself. Add the band's own 0.05 of storage rounding:
#
#       tolerance(player) = 0.05 x ratio + 0.05     [in POINTS]
#
# A player with a 2.95 ceiling ratio (Braelon Allen) therefore admits 0.198
# points of unavoidable error, and a flat 1.0 ratio admits 0.10. Every player
# is checked against HIS OWN bound. Observed max is 0.186 against a bound of
# 0.198 -- the reconstruction is exact to the precision the board stores.
STEP = 0.05                      # half of the 0.1 storage grid
worst_ratio = 0.0
worst_who = None
breaches = []
for p in has_ds:
    for ours, ds_v in ((p["proj_floor"], p["proj_ds_floor"]),
                       (p["proj_ceiling"], p["proj_ds_ceiling"])):
        ratio = ds_v / p["proj_ds"]
        expected = p["proj_mean"] * ratio
        tol = STEP * ratio + STEP
        err = abs(expected - ours)
        if err > tol:
            breaches.append((p["name"], round(err, 4), round(tol, 4)))
        if tol and err / tol > worst_ratio:
            worst_ratio, worst_who = err / tol, (p["name"], round(err, 4), round(tol, 4))

ck("our floor and ceiling ARE the same percentage off our mean as Draft Sharks' "
   "own floor and ceiling are off THEIR mean — per player, to the precision the "
   "board stores (tolerance derived per player, not chosen)",
   not breaches, {"breaches": breaches[:5], "n_breached": len(breaches),
                  "closest_to_the_bound": worst_who})

# ── 2. EVERY player has a band, not just the DS-covered ones ────────────────
flat = [p for p in P if abs(p["proj_ceiling"] - p["proj_mean"]) <= 0.01]
ck("almost nobody is left with a COLLAPSED band (ceiling == mean), because a "
   "flat ceiling prices a man as having no upside rather than abstaining",
   len(flat) <= 15, {"flat": len(flat), "of": len(P),
                     "examples": [(p["name"], p["proj_mean"]) for p in flat[:5]]})

in_range_flat = [p for p in flat if (p.get("adp") or 999) <= 200]
ck("and NOBODY inside Cory's actual draft range (ADP <= 200) has a flat band — "
   "ten did, including Cooper Kupp and Ja'Kobi Lane",
   not in_range_flat, [(p["name"], p.get("adp")) for p in in_range_flat])

# ── 3. THE OTHER DIRECTION: present is not enough, it must VARY ─────────────
for label, group in (("Draft Sharks band", has_ds), ("pre-DS band", no_ds)):
    banded = [p for p in group if abs(p["proj_ceiling"] - p["proj_mean"]) > 0.01]
    ratios = {round(p["proj_ceiling"] / p["proj_mean"], 4) for p in banded}
    ck("the %s is PLAYER-SPECIFIC, not a per-band constant (August's defect: "
       "every dispersion field was mean x a constant)" % label,
       len(banded) == 0 or len(ratios) > max(10, len(banded) * 0.2),
       {"players": len(banded), "distinct_ratios": len(ratios)})

# ── 4. and the band must be ordered ─────────────────────────────────────────
bad = [p["name"] for p in P
       if p["proj_floor"] > p["proj_mean"] + 0.01 or p["proj_ceiling"] < p["proj_mean"] - 0.01]
ck("floor <= mean <= ceiling for every player on the board", not bad, bad[:5])

# ── PYTEST ENTRY POINT, ADDED 2026-08-20 ────────────────────────────────────
#
# ⚠️ THIS FILE COLLECTED **ZERO** TESTS UNDER PYTEST AND HAD BEEN READING AS
# GREEN. It is named test_*.py, so the gate's `pytest draft/tests` imports it —
# the checks above run at IMPORT and the old tail called sys.exit(1) on failure.
# pytest reports that as a collection ERROR, not a FAILED line. The board gate
# greps for "^FAILED" to decide what broke, found nothing, and refused to
# publish with "no FAILED lines parsed — treating as BLOCKING". That is the gate
# behaving correctly on a file I wrote badly, and it cost Cory a board rebuild
# the night before keeper lock.
#
# Found by test_ci_loop_integrity, which exists for exactly this: "a test_*.py
# that collects zero tests is a silent no-op — pytest passes it."
#
# The checks still run at import, so the standalone `python3 <file>` output is
# unchanged. This just gives pytest something to collect and fail on.


import pytest  # noqa: E402


@pytest.mark.post_chain  # the per-player band only exists after attach_draftsharks runs; deselected in the PRE-chain gate,
# run explicitly in draft-data.yml's post-chain step. Marked here and
# added there in the same commit, per the conftest rule.
def test_all_checks_pass():
    assert not _fails, "%d check(s) failed: " % len(_fails) + "; ".join(_fails)


if __name__ == "__main__":
    print("\n%d checks, %d failed" % (7, len(_fails)))
    if _fails:
        print("FAILED")
        sys.exit(1)
