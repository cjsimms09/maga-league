# TERRITORY: A
"""EVERY NIGHTLY REBUILD WAS TURNING THE MEASURED CEILING BACK OFF.

Found 2026-08-17 by reading the code, after the publication gate refused a fresh
board on `test_measured_ceiling::test_the_measured_ceiling_is_ON_and_its_sibling_is_not`.

The nightly always runs `build.py --league-id <id>`. That path rebuilt
`draft/config/league_config.json` from `si.import_league()` and saved it
verbatim, carrying over exactly two keys by hand — `keepers` and
`my_draft_slot`. Every other committed key was destroyed, because Sleeper has
never heard of it.

What that wiped, the same day Cory ruled on it, was `use_measured_ceiling`:

    "We absolutely need to change draft board if we aren't considering upside"

The flag went on; the next build turned it off; the board reverted to the
Gaussian ceiling that ruling had overturned. **The gate caught it and refused to
publish — the refusal was the system working, not the thing to fix.**

`my_draft_slot` was ALREADY special-cased in that block, with a comment about a
hardcoded slot silently undoing a slot change. So this class had bitten once
before and been fixed one key at a time. `preserve_local_rulings` fixes the class:
a key Sleeper supplies is Sleeper's; a key only the committed file has is a
decision made here, and a fetch that does not mention it is not a retraction.

Run: python -m pytest draft/tests/test_config_local_rulings_survive.py
"""
from __future__ import annotations

import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

from draft.build import preserve_local_rulings as merge  # noqa: E402


def test_THE_BUG_the_measured_ceiling_ruling_survives_a_rebuild():
    """The exact case. Sleeper returns a league; the committed file carries a
    ruling Sleeper cannot know about; the ruling must still be there after."""
    existing = {"teams": 10, "use_measured_ceiling": True,
                "_use_measured_ceiling_why": "Cory 2026-08-17",
                "player_spread_in_sd": False}
    fetched = {"teams": 10, "roster_slots": {"QB": 1}}
    out = merge(existing, fetched)
    assert out["use_measured_ceiling"] is True
    assert out["_use_measured_ceiling_why"] == "Cory 2026-08-17"
    assert out["player_spread_in_sd"] is False


def test_CONTROL_the_old_behaviour_really_did_lose_it():
    """Known-positive. Without the merge, the fetched dict IS the saved config —
    this is what shipped every night."""
    existing = {"use_measured_ceiling": True}
    fetched = {"teams": 10}
    assert "use_measured_ceiling" not in fetched          # the old save()
    assert merge(existing, fetched)["use_measured_ceiling"] is True


def test_sleeper_still_WINS_on_every_key_it_supplies():
    """The other half, and the one that keeps this from becoming a config that
    can never change. The league's structure is not ours to remember."""
    existing = {"teams": 10, "roster_slots": {"QB": 1}, "scoring": {"rec": 0.5}}
    fetched = {"teams": 12, "roster_slots": {"QB": 2}, "scoring": {"rec": 1.0}}
    out = merge(existing, fetched)
    assert out["teams"] == 12
    assert out["roster_slots"] == {"QB": 2}
    assert out["scoring"] == {"rec": 1.0}


def test_a_falsy_local_ruling_is_preserved_not_dropped():
    """`False`, `0` and `""` are decisions too. A truthiness test here would
    reintroduce the bug for exactly the flag that turns something OFF — and
    `player_spread_in_sd: False` is a deliberate off in the shipped config."""
    existing = {"player_spread_in_sd": False, "some_zero": 0, "some_empty": ""}
    out = merge(existing, {"teams": 10})
    assert out["player_spread_in_sd"] is False
    assert out["some_zero"] == 0
    assert out["some_empty"] == ""


def test_it_does_not_mutate_either_input():
    existing = {"local": 1}
    fetched = {"teams": 10}
    merge(existing, fetched)
    assert "local" not in fetched, "the fetched dict was mutated in place"
    assert existing == {"local": 1}


def test_the_shipped_config_actually_carries_the_ruling_this_protects():
    """CONTROL AGAINST VACUITY. If the committed config ever stops carrying
    `use_measured_ceiling`, every test above still passes while protecting
    nothing — so assert the thing exists to be protected."""
    import json
    cfg = json.load(open(os.path.join(os.path.dirname(HERE),
                                      "config", "league_config.json"),
                         encoding="utf8"))
    assert cfg.get("use_measured_ceiling") is True, (
        "the shipped config no longer carries the measured-ceiling ruling — "
        "either it was reverted, or a rebuild wiped it again")
    assert cfg.get("_use_measured_ceiling_why"), "the ruling must carry its reason"


def test_the_draft_start_ruling_survives_a_rebuild():
    """CORY, 2026-08-18, verbatim: "Yes it's 6pm" — CORY-ASKS A10.

    Same class as the keeper deadline and the measured ceiling. Sleeper has
    never heard of `draft`, so without preserve_local_rulings the first nightly
    rebuild after this commit would silently delete the ruling and the repo
    would go back to having no recorded draft time at all — which is the state
    that made the ask necessary.

    ⚠️ THE RULING AND THE SURFACE ARE TWO DIFFERENT THINGS, and this test only
    guards the first. `src/dashboard.js` reads `world.config.draft_time` from
    the RUNTIME store, not this file, so a green test here does NOT mean the
    league is being shown 6:00 PM — it means the decision cannot be lost.
    """
    existing = {"teams": 10, "draft": {"start_date": "2026-08-22",
                                       "start_time": "6:00 PM", "tz": "CDT",
                                       "cory_ruling_verbatim": "Yes it's 6pm"}}
    fetched = {"teams": 10, "roster_slots": {"QB": 1}}
    out = merge(existing, fetched)
    assert out["draft"]["start_time"] == "6:00 PM"
    assert out["draft"]["start_date"] == "2026-08-22"
    assert out["draft"]["cory_ruling_verbatim"] == "Yes it's 6pm"


def test_the_LIVE_committed_config_carries_the_draft_ruling():
    """A test on a fixture proves the merge; this proves the file.

    The keeper deadline needed both for the same reason: preserve_local_rulings
    can be correct while nobody has actually written the ruling down.
    """
    import json
    import pathlib
    cfg = json.loads((pathlib.Path(HERE).parent / "config"
                      / "league_config.json").read_text())
    assert cfg["draft"]["start_time"] == "6:00 PM", cfg.get("draft")
    assert cfg["draft"]["start_date"] == "2026-08-22"
    assert cfg["draft"]["tz"] == "CDT"
    assert "6pm" in cfg["draft"]["cory_ruling_verbatim"]
