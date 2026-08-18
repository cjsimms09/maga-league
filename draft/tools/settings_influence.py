#!/usr/bin/env python3
"""WHICH SLEEPER SETTINGS ACTUALLY REACH league_config.json — measured, not declared.

WHY THIS EXISTS. `draft/config/sleeper_settings_registry.json` classified 49
settings and marked 19 of them `imported`, meaning "read by our code". That
disposition was written by hand from a reading of the import, and a disposition
written by hand is a DECLARED value — the exact thing the registry was built to
stop. Nothing checked it. `sleeper_registry.test.js` checked the key SET against
Sleeper's dump and the presence of a reason string, and passed while ten of the
nineteen were read by nothing at all.

HOW THIS MEASURES IT. Not by grepping for the name — a name appears in comments,
in unrelated identifiers (`leg` is a side-bet payment leg), and in our own
function names (`config_schema.draft_rounds` is OUR derivation, not Sleeper's
`settings.draft_rounds`). All three of those would have passed a grep. Instead:
PERTURB the setting and re-run the import offline. If the resulting config
changes, the setting reaches it. If it does not, no amount of the name appearing
in the file makes it imported.

WHAT IT CANNOT SEE. Only path A — `sleeper_import.import_league` ->
league_config.json. The web app reads Sleeper's settings by a SECOND path
(`src/sleeper.js` season bundle -> `sData.league.settings.*`), which this cannot
reach from Python. Path B is measured separately by settings_access.js. A key
this reports as unreached may still be genuinely read over there, and the
reconciliation has to consider both before calling anything unused.

AND REACHING THE CONFIG IS NOT THE SAME AS BEING USED. A key can land in
league_config.json and be read by nobody — produced-and-unread. This tool
reports WHICH CONFIG FIELD each setting lands in, so that second question can be
asked of the field rather than of the setting.

Offline: `_get` is replaced wholesale, so this never touches Sleeper.

Run: python3 draft/tools/settings_influence.py [--json]
"""
from __future__ import annotations

import json
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "draft"))

import sleeper_import as SI  # noqa: E402

DUMP = os.path.join(ROOT, "draft", "data", "sleeper_league_settings.json")
LID = "1374848328470102016"


def _league_from_dump() -> dict:
    """The real league object, rebuilt from the probe dump.

    The dump is a projection of the API response, not the response — so this
    states which fields it carries rather than pretending it is the whole thing.
    Only `settings` is under test; everything else is scaffolding to let the
    import run.
    """
    with open(DUMP, encoding="utf-8") as fh:
        d = json.load(fh)
    return {
        "league_id": LID,
        "name": d.get("name"),
        "season": d.get("season"),
        "status": d.get("status"),
        "total_rosters": len(d.get("owner_to_roster") or {}) or 10,
        "roster_positions": d.get("roster_positions") or [],
        "scoring_settings": d.get("scoring_settings") or {},
        "settings": dict(d.get("settings") or {}),
        # No previous_league_id: league_history() walks it backward and would
        # otherwise need the whole chain stubbed. Absent == chain ends here.
    }


def _install_offline(league: dict):
    """Replace the ONE network chokepoint. Any path not served raises loudly.

    Serving an unknown path as `{}` would let a fetch silently degrade to empty
    and make an influential setting look uninfluential — a false negative in the
    direction that matters.
    """
    rosters = [{"roster_id": i + 1, "owner_id": "u%d" % (i + 1), "players": []}
               for i in range(int(league.get("total_rosters") or 10))]
    users = [{"user_id": "u%d" % (i + 1), "display_name": "Team %d" % (i + 1),
              "metadata": {}} for i in range(len(rosters))]

    def fake_get(path: str, **kw):
        if path == "/league/%s" % LID:
            return league
        if path == "/league/%s/users" % LID:
            return users
        if path == "/league/%s/rosters" % LID:
            return rosters
        if path == "/league/%s/drafts" % LID:
            return []          # no prior drafts -> original_rounds is empty
        raise AssertionError("offline probe asked for an unstubbed path: " + path)

    SI._get = fake_get  # noqa: SLF001


def _perturb(v):
    """A value guaranteed different from `v`, of a type the reader will accept.

    Not `None` and not a string sentinel: `settings.get(k, DEFAULT)` returns the
    stored value even when it is None, so a None perturbation of an absent-ish
    key can collide with the default and read as no-change.
    """
    if isinstance(v, bool):
        return not v
    if isinstance(v, (int, float)):
        return v + 7 if v != -7 else 0
    if isinstance(v, str):
        return v + "_PERTURBED"
    return 424242


def _stable(cfg: dict) -> str:
    c = dict(cfg)
    c.pop("imported_at", None)          # a wall clock, not a consequence
    return json.dumps(c, sort_keys=True, default=str)


def _changed_fields(a: dict, b: dict, prefix: str = "") -> list[str]:
    """Which config fields moved — AS DOTTED PATHS, not as top-level objects.

    ⚠️ THIS USED TO COMPARE ONLY TOP-LEVEL KEYS, and that collapsed five settings
    onto one name. `daily_waivers`, `waiver_budget`, `waiver_clear_days`,
    `waiver_day_of_week` and `waiver_type` all land inside `config.waivers`, so
    all five reported `reaches: ["waivers"]` and `has_consumer` credited a read
    of ANY field in that object to EVERY setting landing in it.

    Measured 2026-08-14 (routed by B, reproduced here): `field_reads["waivers"]`
    is 0 on main, so nothing was wrong yet. B then added a legitimate read of
    `config.waivers.type_code` — the league's waiver rule, correctly consumed —
    and that single read would have marked all five as consumed, including
    `daily_waivers`, whose registry note is still exactly true: "Reaches
    config.waivers.daily_waivers; read by nobody."

    THE FIX IS NOT TO PROMOTE daily_waivers, which is what the failure message
    asks for. That would label a setting as read when nothing reads it — the
    precise lie this suite exists to prevent — and the promotion would then be
    pinned by test_every_imported_key_has_a_consumer demanding a consumer that
    does not exist. The granularity was lost HERE, so it is restored HERE.

    Recursive rather than one-level: nothing in the config nests deeper today,
    and a rule that only holds at depth two is a rule waiting to be wrong.
    """
    out = []
    for k in set(a) | set(b):
        if not prefix and k == "imported_at":
            continue
        path = f"{prefix}{k}"
        av, bv = a.get(k), b.get(k)
        if (json.dumps(av, sort_keys=True, default=str)
                == json.dumps(bv, sort_keys=True, default=str)):
            continue
        if isinstance(av, dict) and isinstance(bv, dict):
            out.extend(_changed_fields(av, bv, prefix=path + "."))
        else:
            out.append(path)
    return sorted(out)


def measure() -> dict:
    league = _league_from_dump()
    base_settings = dict(league["settings"])
    _install_offline(league)

    league["settings"] = dict(base_settings)
    base = SI.import_league(LID)
    base_s = _stable(base)

    reaches, inert = {}, []
    for k in sorted(base_settings):
        league["settings"] = dict(base_settings)
        league["settings"][k] = _perturb(base_settings[k])
        got = SI.import_league(LID)
        if _stable(got) == base_s:
            inert.append(k)
        else:
            reaches[k] = _changed_fields(base, got)

    league["settings"] = dict(base_settings)   # leave the fixture as found
    return {
        "_what": "Sleeper settings PERTURBED one at a time; a key `reaches` the "
                 "config iff changing it changes league_config. Path A only "
                 "(sleeper_import.import_league). Path B is settings_access.js.",
        "league_id": LID,
        "n_settings": len(base_settings),
        "reaches_config": reaches,
        "does_not_reach_config": inert,
    }


if __name__ == "__main__":
    out = measure()
    if "--json" in sys.argv:
        print(json.dumps(out, indent=2, sort_keys=True))
    else:
        print("\n%d/%d settings reach league_config.json\n"
              % (len(out["reaches_config"]), out["n_settings"]))
        for k, fields in sorted(out["reaches_config"].items()):
            print("  REACHES  %-24s -> %s" % (k, ", ".join(fields)))
        print("\n  INERT (%d): %s" % (len(out["does_not_reach_config"]),
                                      ", ".join(out["does_not_reach_config"])))
