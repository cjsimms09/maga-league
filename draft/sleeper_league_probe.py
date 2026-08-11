"""Dump the FULL Sleeper league object and report what we ignore.

WHY THIS EXISTS. The importer takes what it was written to take. Everything else
in that object is free information nobody has looked at — trade deadline, trade
review type, playoff seed count and round type, waiver clear days, reserve slots
— and none of it costs an extra request. This prints all of it, and separates
"we reference this somewhere" from "this key appears nowhere in the repo".

IT ALSO CONFIRMS THE WAIVER SYSTEM AGAINST `waiver_type` rather than memory.
`league_config.json` says `is_faab: false` with a vestigial `budget: 100`, which
does not distinguish rolling priority from reverse standings — and the waiver
stopping rule refuses to run until that is resolved.

RUN FROM CI. Sleeper egress is denied at the gateway from the dev sandbox
(connect_rejected, policy denial), so this is a workflow_dispatch job.

THE GREP'S LIMIT, STATED. "Referenced somewhere in the repo" is not "used" — a
key named only in a comment counts as referenced here (rule 11e: a source scan
cannot tell an implementation from a mention). So UNREFERENCED is a hard fact
and REFERENCED is an upper bound on what we actually consume.
"""
import json
import os
import re
import subprocess
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LEAGUE_ID = os.environ.get("SLEEPER_LEAGUE_ID") or "1374848328470102016"
OUT = os.path.join(ROOT, "draft", "data", "sleeper_league_settings.json")

# Sleeper's own documented meanings. Recorded so a bare integer in the dump is
# not left for the reader to guess at — a code with no legend is a value nobody
# can act on.
WAIVER_TYPE = {0: "rolling waivers (priority depletes: claiming sends you to the back)",
               1: "reverse standings (priority resets weekly off record — NO depletion)",
               2: "FAAB (free-agent auction budget)"}
TRADE_REVIEW = {0: "commissioner approves", 1: "league votes", 2: "no review (auto)"}
PLAYOFF_ROUND = {0: "one week per round", 1: "two weeks per round (total points)",
                 2: "two weeks per round (record)"}


def fetch(path):
    req = urllib.request.Request("https://api.sleeper.app/v1" + path,
                                 headers={"accept": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


def referenced_keys():
    """Which setting names appear ANYWHERE in our source. Upper bound, not usage."""
    try:
        out = subprocess.run(
            ["grep", "-rhoE", r'"[a-z_]{3,40}"', "--include=*.py", "--include=*.js",
             "--include=*.json", "draft/", "src/", "public/js/"],
            cwd=ROOT, capture_output=True, text=True, timeout=120).stdout
    except Exception as exc:                                   # noqa: BLE001
        print("  ! grep failed (%s) — REFERENCED column unavailable" % exc)
        return None
    return {t.strip('"') for t in out.split()}


def main():
    lg = fetch("/league/%s" % LEAGUE_ID)
    settings = lg.get("settings") or {}
    ref = referenced_keys()

    print("LEAGUE: %s  season %s  status %s" % (lg.get("name"), lg.get("season"), lg.get("status")))
    print("top-level keys: %s" % ", ".join(sorted(lg.keys())))
    print()
    wt = settings.get("waiver_type")
    print("== THE ANSWER THE WAIVER RULE IS BLOCKED ON ==")
    print("  waiver_type = %r -> %s" % (wt, WAIVER_TYPE.get(wt, "UNKNOWN CODE — do not guess")))
    print("  waiver_budget      = %r" % settings.get("waiver_budget"))
    print("  waiver_clear_days  = %r" % settings.get("waiver_clear_days"))
    print("  waiver_day_of_week = %r" % settings.get("waiver_day_of_week"))
    print("  daily_waivers      = %r" % settings.get("daily_waivers"))
    print()
    for label, key, legend in (("trade review", "trade_review_days", None),
                               ("trade deadline", "trade_deadline", None),
                               ("waiver/trade review type", "disable_trades", None),
                               ("playoff round type", "playoff_round_type", PLAYOFF_ROUND),
                               ("playoff teams", "playoff_teams", None),
                               ("playoff seed type", "playoff_seed_type", None),
                               ("reserve slots", "reserve_slots", None),
                               ("taxi slots", "taxi_slots", None)):
        v = settings.get(key)
        extra = ("  -> %s" % legend.get(v)) if (legend and v in legend) else ""
        print("  %-26s %-20s = %r%s" % (label, key, v, extra))
    print()
    print("== EVERY SETTING, and whether the repo mentions it anywhere ==")
    unref = []
    for k in sorted(settings):
        mark = "?" if ref is None else ("referenced" if k in ref else "UNREFERENCED")
        if ref is not None and k not in ref:
            unref.append(k)
        print("  %-28s = %-14r %s" % (k, settings[k], mark))
    print()
    print("UNREFERENCED anywhere in the repo (%d): %s" % (len(unref), ", ".join(unref) or "none"))
    print("NOTE: 'referenced' means the string appears in source — including in a")
    print("      comment. It is an UPPER BOUND on what we consume, not proof of use.")

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as fh:
        json.dump({"fetched_league_id": LEAGUE_ID, "name": lg.get("name"),
                   "season": lg.get("season"), "status": lg.get("status"),
                   "top_level_keys": sorted(lg.keys()),
                   "settings": settings,
                   "waiver_type_meaning": WAIVER_TYPE.get(settings.get("waiver_type")),
                   "unreferenced_in_repo": unref,
                   "roster_positions": lg.get("roster_positions"),
                   "scoring_settings": lg.get("scoring_settings")}, fh,
                  indent=2, sort_keys=True)
    print("wrote %s" % OUT)
    return 0


if __name__ == "__main__":
    sys.exit(main())
