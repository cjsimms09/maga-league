"""THE REGISTRY'S `imported` CLAIM, CHECKED AGAINST THE CODE INSTEAD OF BELIEVED.

WHAT WENT WRONG. `draft/config/sleeper_settings_registry.json` was built so a
Sleeper setting could not sit unread and unnamed — the failure that let
`waiver_type` go unlooked-at while the waiver system was held by memory, and the
memory was wrong. It classified all 49 settings and marked 19 `imported`, whose
declared meaning is "read by our code".

Ten of those nineteen were read by nothing. `disable_trades`, `draft_rounds`,
`leg`, `num_teams`, `playoff_round_type`, `playoff_seed_type`, `reserve_slots`,
`taxi_slots`, `trade_deadline`, `trade_review_days` — no consumer, on any path.
Two more (`max_keepers`, `type`) are read only by a backtest filter that picks
which PUBLIC leagues to sample, and never by anything that models ours. Five
more reach `league_config.json` and are read by nobody once there.

The registry was a hand-written account of what the code does. That is a
DECLARED value, which is the one thing the registry existed to stop, and
`sleeper_registry.test.js` did not catch it because it checked the key SET
against Sleeper's dump and the presence of a `why` string — never the
disposition against a consumer. A guard that exists and does not guard.

SO THE DISPOSITION IS NOW DERIVED. Two measurements, neither of them a grep for
the name:
  · path A — `settings_influence.py` PERTURBS each setting and re-runs the
    import offline; a setting reaches the config iff changing it changes the
    config. No opinion about the source text is involved.
  · path B — `settings_access.py` looks for the SHAPE of a read (`.get("k")`,
    `["k"]`, `x.k`) on a line that mentions settings, with comments stripped.
    Still source inspection, and it says so.

AND WHAT THIS TEST CANNOT DO TODAY (rule 10d, stated rather than hidden). The
dispositions were written FROM this measurement, so on the day it lands it
cannot fail — a fixture whose input derives from the code under test always
passes. Its job starts at the next change: a setting that stops being read, a
setting that starts being read, or a hand-edit of the registry now diverges and
goes red. The two assertions at the bottom are the exceptions — they check facts
about the LEAGUE that nothing in this repo derives, so they can fail today.

Run: python3 -m pytest draft/tests/test_settings_registry_truth.py
"""
import json
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "draft", "tools"))

import settings_access as ACCESS      # noqa: E402
import settings_influence as INFL     # noqa: E402

REG = json.load(open(os.path.join(ROOT, "draft", "config",
                                  "sleeper_settings_registry.json"), encoding="utf-8"))
DUMP = json.load(open(os.path.join(ROOT, "draft", "data",
                                   "sleeper_league_settings.json"), encoding="utf-8"))
SETTINGS = REG["settings"]
LIVE = DUMP["settings"]

_measured = {}


def measured():
    """Both probes, once. Perturbation runs the import 50 times — not per-test."""
    if not _measured:
        infl = INFL.measure()
        keys = sorted(LIVE)
        acc = ACCESS.scan(keys)
        fields = sorted({f for fs in infl["reaches_config"].values() for f in fs})
        field_reads = ACCESS.scan(fields, require_settings=False) if fields else {}
        _measured.update(reaches=infl["reaches_config"], access=acc, field_reads=field_reads)
    return _measured


def has_consumer(key: str) -> bool:
    """A setting is USED if something reads it — as a setting, or as the config
    field it lands in. Landing in a config field nobody reads is not use."""
    m = measured()
    if m["access"].get(key, {}).get("reads"):
        return True
    return any(m["field_reads"].get(f, {}).get("reads")
               for f in m["reaches"].get(key, []))


def test_every_imported_key_has_a_consumer():
    """`imported` means read. Not 'mentioned', not 'lands in a file'."""
    bad = {k: measured()["reaches"].get(k, []) for k in SETTINGS
           if SETTINGS[k]["disposition"] == "imported" and not has_consumer(k)}
    assert not bad, (
        "classified `imported` with no consumer on either path — this is the "
        "exact defect the registry was built to prevent, pointed at itself: %s" % bad)


def test_imported_unread_reaches_the_config_and_stops_there():
    """Rule 14 made explicit: produced, and read by nobody.

    Fails in BOTH directions. If someone wires one of these up, this goes red
    and asks for it to be promoted — so the honest label does not outlive the
    condition that earned it.
    """
    for k, v in SETTINGS.items():
        if v["disposition"] != "imported_unread":
            continue
        assert k in measured()["reaches"], (
            "%s is labelled imported_unread but does not reach league_config at "
            "all — it is not imported in any sense" % k)
        assert not has_consumer(k), (
            "%s now HAS a consumer — promote it to `imported` rather than "
            "leaving it labelled unread" % k)


def test_nothing_we_actually_read_is_filed_as_unused():
    """The other direction: a key we consume must not sit under ignored/should_import.

    Understating what we use is the more dangerous error — it invites someone to
    change or drop a value the code depends on.
    """
    unused = ("ignored", "should_import")
    wrong = {k: measured()["access"][k]["reads"][:3] for k in SETTINGS
             if SETTINGS[k]["disposition"] in unused and has_consumer(k)}
    assert not wrong, "filed as unused but read by: %s" % wrong


def test_the_registry_covers_exactly_what_sleeper_emits():
    """Same claim sleeper_registry.test.js makes, restated where the data is."""
    assert set(SETTINGS) == set(LIVE), {
        "unclassified": sorted(set(LIVE) - set(SETTINGS)),
        "stale": sorted(set(SETTINGS) - set(LIVE))}


def test_draft_rounds_is_still_the_trap_its_reason_says_it_is():
    """INDEPENDENT OF OUR CODE — this can fail today.

    `settings.draft_rounds` is 3 and the draft's own `settings.rounds` is 15.
    Reading the league setting would build a three-round board. That disagreement
    is the whole reason `draft_rounds` is ignored, so the reason is asserted
    rather than trusted; if Sleeper ever reconciles them, the entry is stale.
    """
    league_rounds = LIVE.get("draft_rounds")
    draft_rounds = ((DUMP.get("draft") or {}).get("settings") or {}).get("rounds")
    assert league_rounds != draft_rounds, (
        "league.settings.draft_rounds now agrees with draft.settings.rounds (%s) "
        "— the trap that justifies ignoring it is gone, so re-read the entry"
        % draft_rounds)
    assert SETTINGS["draft_rounds"]["disposition"] == "ignored"


def test_reserve_slots_names_a_roster_spot_the_slot_count_cannot_see():
    """INDEPENDENT OF OUR CODE — this can fail today.

    `roster_slots_from` counts `roster_positions`, which lists no IR entry, while
    `reserve_slots` is 1. So the league has a roster spot our slot count does not
    include. That gap is the reason the entry is `should_import`; if either side
    changes, the reason no longer holds.
    """
    assert LIVE.get("reserve_slots", 0) > 0
    assert not any(str(p).upper() in ("IR", "RESERVE")
                   for p in (DUMP.get("roster_positions") or [])), (
        "roster_positions now carries an IR slot — roster_slots_from sees it, so "
        "reserve_slots is no longer invisible to the slot count")
    assert SETTINGS["reserve_slots"]["disposition"] == "should_import"


def test_num_teams_agrees_with_the_source_we_actually_use():
    """Two Sleeper facts for one question; the import uses the other one.

    `num_teams` is ignored because `league.total_rosters` is what the import
    counts. That is only safe while they agree — a disagreement would mean a
    roster left without the setting following, and the ignored reason would
    become a bug.
    """
    assert LIVE["num_teams"] == len(DUMP.get("owner_to_roster") or {}), (
        "num_teams (%s) no longer matches the roster count (%s)"
        % (LIVE["num_teams"], len(DUMP.get("owner_to_roster") or {})))
