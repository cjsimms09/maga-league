# TERRITORY: A
"""The keeper optimizer must be able to see Cory's actual keepers.

FOUND LIVE 2026-08-16, six days before the draft. Running the tool printed:

    RECOMMENDED: keep 0 — nobody  (total surplus 0.0)
      keep 1: Cameron Dicker  K  VORP 0  costs R1  -> surplus -10

A kicker at round 1, and Chase / Henry / Walker absent entirely. build.py moves
designated keepers out of `players[]` into `kept_players[]`; the optimizer
indexed only `players[]`, missed all three, and a bare `continue` dropped them
in silence. A decision tool recommended the exact opposite of the right answer
with no error, no warning, and a confident total of 0.0.

After the fix it recommends keep 3 at +108.7 surplus, which independently
matches the +108.6 a separate analysis reached by working around the bug.
"""
import json

import pytest
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BOARD = ROOT / "public" / "draft_data.json"


def test_designated_keepers_live_outside_the_players_list():
    # The premise of the bug. If build.py ever stops splitting them out, this
    # test should fail loudly so the workaround can be retired deliberately
    # rather than left as cargo.
    art = json.loads(BOARD.read_text())
    kept = art.get("kept_players") or []
    assert kept, "no kept_players on the board — premise changed, re-read the fix"
    ids = {str(p.get("player_id")) for p in art["players"]}
    for k in kept:
        assert str(k.get("player_id")) not in ids


@pytest.mark.repo_parity
def test_kept_players_carry_proj_mean_AND_stamped_vorp():
    # CONTRACT FLIPPED 2026-08-18 (E's sweep 16, A's source ruling): the old
    # pin asserted vorp is None here BECAUSE the keeper prune runs before
    # apply_vorp — and that None is exactly what engine.js's (vorp || 0)
    # turned into a confident zero, making the keeper badge name the wrong
    # man at pick 33. build.py now stamps keeper vorp from the board's own
    # identity (proj_mean − replacement[pos]); this module's recompute keeps
    # working either way. A None here is the badge lie coming back.
    art = json.loads(BOARD.read_text())
    for k in (art.get("kept_players") or []):
        assert k.get("proj_mean") is not None, k.get("name")
        assert k.get("vorp") is not None, (
            f"{k.get('name')}: kept without vorp — the (vorp || 0) badge-lie "
            "input is back on the board (sweep 16)")


def test_optimizer_recommends_the_real_keepers_not_a_kicker():
    r = subprocess.run([sys.executable, str(ROOT / "draft" / "keeper_optimize.py")],
                       capture_output=True, text=True, timeout=600)
    out = r.stdout
    assert "keep 0 — nobody" not in out, out[:600]
    # The three real designations must all be priced and present.
    for name in ("Ja'Marr Chase", "Derrick Henry", "Kenneth Walker"):
        assert name in out, f"{name} missing from optimizer output"
    # A kicker at round 1 was the smoking gun; it must not come back.
    assert "Cameron Dicker" not in out.split("RECOMMENDED")[1].split("\n")[0]


def test_unpriceable_roster_players_are_reported_not_silently_dropped():
    # The real defect was the SILENCE, not the miss. Whatever cannot be priced
    # must be named above the recommendation.
    src = (ROOT / "draft" / "keeper_optimize.py").read_text()
    assert "COULD NOT BE PRICED" in src
    assert "unpriced.append" in src
    # and the bare skip that caused it must be gone
    assert "if not p:\n            continue" not in src
