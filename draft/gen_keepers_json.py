"""Generate config/keepers.json from REAL keeper designations, not fixtures.

Sources each team's keepers from the league-history final_rosters `keepers`
field and joins name/position from the artifact. Keyed by DRAFT SLOT.

═══ WHY THIS FILE STOPPED DISCARDING DESIGNATIONS ═══════════════════════════

Draft slots are not assigned until the draft, and this script needs one per
owner. It used to place only the owners whose slot it knew — mine — and
`continue` past every other designation. The count went into `_unplaced` and
nothing downstream ever read it.

THE OLD DOCSTRING SAID: "a missing team is modelled as keeping nobody, which is
correct for teams that have not designated yet." That sentence is true and it
was being applied to the wrong teams. These teams HAD designated. Treating a
designation we could not place as a team keeping nobody is absent-is-not-zero,
and it was the whole defect: `keepers.json` fed BOTH the pick order and the
draftable pool, so four teams' designations became one, the board carried 147
picks instead of 133, my first pick read 34 instead of 20, and fourteen kept
players stayed in the pool at ADP 1.1-22.1. No error, no missing field — a
filter over a real board always returns something plausible.

═══ WHY A MISSING SLOT TURNS OUT NOT TO MATTER ══════════════════════════════

The blocker was assumed to be the unknown seat. It is not, for either consumer:

  • THE POOL is `kept_ids`, a set of player_ids. Slots do not enter it at all.
  • MY PICK NUMBERS are invariant to WHICH slot holds which keeper count. Under
    top_picks_flat every keeper forfeits a round in 1..3, so with three of my
    own my first pick sits in round 4 and every keeper in the league is ahead
    of it. Enumerated over all 630 placements of the predicted slate: the
    answer is the same every time. Only the COUNT moves my schedule.

So an unplaceable designation is placed on a free slot and MARKED PROVISIONAL.
The board gets the right pool and the right schedule for me; what stays unknown
is which opponent sits in which seat, which was already unknown and is now
labelled instead of silently absent. Assignment is deterministic (owners sorted,
lowest free slot) so a nightly re-run does not churn the board.

═══ AND NOTHING IS DROPPED SILENTLY ═════════════════════════════════════════

Anything that still cannot be represented is recorded in `_problems` WITH A
REASON and printed. A count of discards tells you something went missing; it
does not tell you what or why, and it cannot be acted on. Reasons can.
"""
import datetime
import json, os
import re
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
import sys
sys.path.insert(0, os.path.join(ROOT, "draft"))
# draft_has_started MOVED to config_schema (A, 2026-08-25): standing_check needs
# the same predicate, and two copies of "has the draft happened" is how the
# ninth caller gets written without one. Same reason as live_context.myKeepers.
from config_schema import draft_has_started  # noqa: E402,F401

MY_OWNER = "434915673219526656"
_LEAGUE_ID = "1374848328470102016"


def designations(hist, rosters=None):
    """Who has designated keepers, and from WHICH SOURCE — reported, not assumed.

    THE SECOND HALF OF THE SAME DEFECT. This script read `league_history.json`
    while the board's own slate stamp reads LIVE Sleeper, and the history export
    is behind a manual `workflow_dispatch` flag (draft-data.yml:98) that the
    nightly rebuild never sets. So the generator saw a cached file that could be
    weeks old while the stamp saw the truth — 2 designating teams against 4 — and
    the disagreement was structural rather than a timing race.

    Live Sleeper is now the source, the SAME call the stamp makes, so the two
    agree by construction rather than by both happening to be fresh. History is
    the fallback for offline builds, and which one was used is recorded.
    """
    if rosters is None:
        try:
            import sleeper_import as si  # noqa: PLC0415
            _fetched = si.fetch_rosters(_LEAGUE_ID)
            src = "sleeper"
        except Exception as exc:                     # noqa: BLE001
            # LOUDLY: a fallback that looks like a success is how a stale board
            # ships. The source travels with the data.
            print("  ! could not reach Sleeper for designations (%s: %s) — "
                  "falling back to league_history.json, which may be STALE"
                  % (type(exc).__name__, exc))
            _fetched, src = None, "history (sleeper unreachable)"

        # ⚠️ CHECKED OUTSIDE THE `try`, AND THE FIRST VERSION WAS NOT.
        #
        # `or []` used to turn an empty or null response — bad league id, API
        # change, empty cached body — into an empty roster list labelled
        # `src="sleeper"`: zero designations reported as a successful live read,
        # every keeper silently returned to the draftable pool.
        #
        # My first fix raised inside the `try`, where the `except Exception`
        # above CAUGHT IT and converted the refusal into the quiet history
        # fallback. The guard against a swallowed failure, swallowed. Caught by
        # its own test, which is the only reason it is not still there.
        #
        # A league always has rosters. Zero is a broken read, not a state.
        if src == "sleeper" and not _fetched:
            raise RuntimeError(
                "Sleeper returned NO rosters for league %s. That is not "
                "'nobody has designated yet' — a league always has rosters, so "
                "this is a bad league id, an API change, or an empty cached "
                "body. Refusing to emit a keeper file that would silently drop "
                "every keeper from the pool." % _LEAGUE_ID)
        rosters = _fetched
    else:
        # Injected by a caller (tests, offline replay). Labelled as such rather
        # than as "sleeper": a source field that can claim a live read it did not
        # make is worth less than no source field at all.
        src = "injected"

    if rosters is None:
        season = max(hist["seasons"], key=lambda s: int(s["season"]))
        rosters = season.get("final_rosters") or []

    out = []
    for r in rosters:
        ks = r.get("keepers") or (r.get("metadata") or {}).get("keepers")
        ks = [str(x) for x in (ks or []) if x is not None]
        if ks:
            out.append((str(r.get("owner_id")), ks))
    return out, src


def build(cfg, art, hist, rosters=None):
    """Pure given its inputs — returns the keepers.json dict. Testable."""
    by_id = {str(p["player_id"]): p for p in art.get("players") or []}
    for k in art.get("kept_players") or []:          # my own kept players are NOT
        by_id.setdefault(str(k["player_id"]), k)     # in `players` (already rostered)
    # ⚠️ THESE WERE `or 10` AND `or 4` — DEFAULTS THAT LOOK LIKE ANSWERS.
    #
    # `my_draft_slot` decides WHOSE ROUNDS ARE FORFEITED. Defaulting it to 4
    # silently forfeits another team's picks and every pick number downstream is
    # wrong, on a board that looks entirely normal. The committed keepers.json
    # carries `draft_slot: 4` today while league_config says 8 — whatever the
    # provenance of that file, the default is exactly the shape that produces it
    # and cannot be told apart from a real 4.
    #
    # An absent seat is not a 4. Refuse.
    _teams = cfg.get("teams")
    _slot = cfg.get("my_draft_slot")
    if not _teams:
        raise SystemExit("gen_keepers_json: league_config has no `teams` — refusing "
                         "to assume 10; the pool and the pick order both scale on it")
    if not _slot:
        raise SystemExit("gen_keepers_json: league_config has no `my_draft_slot` — "
                         "refusing to assume 4. This value decides whose rounds are "
                         "forfeited; a wrong seat corrupts every pick number on a "
                         "board that otherwise looks correct.")
    teams = int(_teams)
    my_slot = int(_slot)

    designating, source = designations(hist, rosters)
    problems = []
    # Deterministic order so a re-run reproduces the same board: mine first (its
    # slot is real), then the rest by owner_id.
    designating.sort(key=lambda t: (t[0] != MY_OWNER, t[0]))

    free = [s for s in range(1, teams + 1) if s != my_slot]
    teams_out, provisional = [], 0
    for owner, keepers in designating:
        if owner == MY_OWNER:
            slot, prov = my_slot, False
        elif free:
            slot, prov = free.pop(0), True
            provisional += 1
        else:
            # More designating teams than seats. Cannot happen in a sane league,
            # but if it does it is RECORDED rather than dropped on the floor.
            problems.append({
                "kind": "no_free_slot", "owner": owner, "keepers": keepers,
                "reason": "every draft slot is taken; this designation is NOT on "
                          "the board, so the pool and the pick order are both short",
            })
            continue
        entry = {"draft_slot": slot, "slot_provisional": prov, "owner_id": owner,
                 "keepers": []}
        for pid in keepers:
            p = by_id.get(pid)
            if p is None:
                # The keeper is not in the player universe — it still costs a
                # round and still leaves the pool, so it is KEPT with the gap
                # named rather than dropped or silently renamed to its id.
                problems.append({
                    "kind": "player_not_in_artifact", "owner": owner, "player_id": pid,
                    "reason": "designated keeper is absent from the artifact's player "
                              "list; forfeit is still charged, name/position unknown",
                })
                p = {}
            entry["keepers"].append({
                "player_id": pid, "name": p.get("name", pid),
                "position": p.get("position", "?"),
                # original_round is moot under top_picks_flat (positional), kept
                # for other cost models; 1 is a safe placeholder.
                "original_round": 1, "years_kept": 1,
            })
        teams_out.append(entry)

    total = sum(len(t["keepers"]) for t in teams_out)
    return {
        "teams": teams_out,
        "_note": "generated from final_rosters keeper designations. Slots marked "
                 "slot_provisional=true are placeholders: the COUNT is real and "
                 "drives the pool and my pick numbers correctly, but WHICH seat "
                 "that team occupies is not known until the draft order is set.",
        "_placed_teams": len(teams_out),
        "_provisional_slots": provisional,
        "_total_keepers": total,
        # Every designation is accounted for: placed + problems == designating.
        "_designating_teams": len(designating),
        # WHICH SOURCE said so. A board built from a stale cache and one built
        # from live Sleeper are different claims and must not read alike.
        "_designations_source": source,
        "_problems": problems,
    }




def main(cfg=None, art=None, hist=None, rosters=None, dest=None, now=None):
    """Every input is injectable for the same reason `_assert_accounting` was
    extracted: the control flow below decides whether the real keepers.json is
    overwritten, and until 2026-08-25 the only way to exercise it was to run the
    whole generator against live Sleeper. The arms that matter most — post-draft
    zero, and a stale fallback disagreeing with the board — are exactly the ones
    that cannot be reached from a test machine that cannot reach Sleeper."""
    if cfg is None:
        cfg = json.load(open(os.path.join(ROOT, "draft", "config", "league_config.json")))
    if art is None:
        art = json.load(open(os.path.join(ROOT, "public", "draft_data.json")))
    if hist is None:
        hist = json.load(open(os.path.join(ROOT, "draft", "data", "league_history.json")))
    out = build(cfg, art, hist, rosters)

    if dest is None:
        dest = os.path.join(ROOT, "draft", "config", "keepers.json")
    for p in out["_problems"]:
        print("  PROBLEM [%s] %s" % (p["kind"], p["reason"]))

    # ⚠️ ONCE THE DRAFT HAS RUN, ZERO DESIGNATIONS IS THE TRUTH, NOT A BROKEN READ.
    #
    # Sleeper consumes keeper designations when the draft starts, so from that
    # moment `designations()` legitimately returns nothing. The refusal below was
    # written for the PRE-draft window, where zero can only mean the read broke —
    # and it was given no expiry. **That is what has blocked every scheduled board
    # publish since 2026-08-22** (register 319): runs 111, 112 and 113 all died
    # here, and with them the history export, the board build, the acceptance
    # gate, the commit and the deploy — a whole cascade, from a guard doing
    # exactly what it was told.
    #
    # It is the same shape as `build.py:1963` ruling the keeper-pool effect
    # immaterial "at about 1.8 points": a judgement correct under a condition
    # that nobody attached an expiry to, still being applied after the condition
    # ended. Both are register 283's family.
    #
    # AND IT MUST NOT REGENERATE THE FILE EITHER. Post-draft `keepers.json` is a
    # RECORD of what was kept. Rewriting it from a source that no longer carries
    # designations would replace that record with an empty one — precisely the
    # damage the refusal exists to prevent, arriving through the door it does not
    # watch. So: leave the file alone, say why, exit 0.
    started = draft_has_started(cfg, now=now)
    if started and out["_designating_teams"] == 0:
        print("draft started (%s %s %s) and Sleeper reports no live keeper "
              "designations, which is expected once designations are consumed. "
              "LEAVING keepers.json UNTOUCHED — post-draft it is a record of what "
              "was kept, not something to regenerate from an empty source."
              % ((cfg.get("draft") or {}).get("start_date"),
                 (cfg.get("draft") or {}).get("start_time"),
                 (cfg.get("draft") or {}).get("tz")))
        return

    # ⚠️ ASSERT BEFORE WRITE. This ran AFTER the write until 2026-08-25, so the
    # guard whose own message reads "a keeper file with no teams silently returns
    # every kept player to the draftable pool. Refusing." had already written
    # that exact file to disk before refusing. On a CI runner the workspace is
    # thrown away and no harm reaches the repo; run by hand it destroys the real
    # keepers.json and exits 1, which is how a probe clobbered it on 08-25.
    # A refusal that fires after the damage is a report, not a guard.
    _assert_accounting(out, art)

    open(dest, "w").write(json.dumps(out, indent=2) + "\n")
    print("wrote keepers.json: %d designating team(s), %d keeper(s), "
          "%d provisional slot(s)"
          % (out["_designating_teams"], out["_total_keepers"],
             out["_provisional_slots"]))


def _assert_accounting(out, art):
    """The accounting, EXTRACTED so it can be tested.

    It lived inline in `main()`, which meant the only way to exercise it
    was to run the whole generator against live Sleeper — so the arm that
    is supposed to catch a missing input had never been run against one.
    """
    # ACCOUNTING, ASSERTED. The failure this replaces was designations going
    # missing without the total ever being checked against the input.
    accounted = len(out["teams"]) + len(
        [p for p in out["_problems"] if p["kind"] == "no_free_slot"])
    if accounted != out["_designating_teams"]:
        raise SystemExit(
            "gen_keepers_json: %d designating teams but %d accounted for — a "
            "designation went missing without a reason" % (out["_designating_teams"], accounted))

    # ⚠️ THE ASSERTION ABOVE IS CONSERVATION, AND CONSERVATION CANNOT SEE AN
    # INPUT THAT NEVER ARRIVED.
    #
    # Both sides of it derive from the SAME `designating` list. If that list is
    # empty the check reads 0 == 0 and passes — so the workflow's claim that
    # "the only way it exits non-zero is its own accounting assertion:
    # designations went missing" is false for the one failure that matters most.
    # It catches designations lost AFTER the read and is blind to the read
    # returning nothing.
    #
    # THE INDEPENDENT CHECK: the artifact already knows how many teams Sleeper
    # says have designated (`keeper_slate.teams_designated`, computed in build.py
    # from the same rosters endpoint). Comparing against it is a second source,
    # not a restatement of the first.
    #
    # A WARNING, NOT A REFUSAL, and deliberately: the two are read at different
    # moments, so a team designating between them is a legitimate difference. A
    # hard failure here would block builds for a benign race. What is NOT benign
    # is the silent zero, so that arm refuses.
    slate = (art.get("keeper_slate") or {})
    expected = slate.get("teams_designated")
    if out["_designating_teams"] == 0 and expected:
        raise SystemExit(
            "gen_keepers_json: read ZERO designating teams, but the last board's "
            "keeper_slate says %d team(s) had designated. A keeper file with no "
            "teams silently returns every kept player to the draftable pool. "
            "Refusing." % expected)
    # ⚠️ A DISAGREEMENT FROM THE STALE FALLBACK IS NOT A RACE, AND THIS FILE'S
    # OWN DOCSTRING ALREADY SAYS SO — `designations()` describes seeing "2
    # designating teams against 4" and calls the disagreement "structural rather
    # than a timing race". It was diagnosed and then left as a print.
    #
    # Measured again 2026-08-25, unchanged: with Sleeper unreachable the history
    # fallback reports 2 designating teams against the board's 9, writes that
    # over the real keepers.json, and EXITS 0. In CI a Sleeper outage would
    # therefore rebuild the board on a 2-team keeper slate — seven teams' keepers
    # silently returned to the draftable pool — on a GREEN run. draft-data.yml's
    # own comment states the intended trade exactly: "A board that fails to
    # rebuild is VISIBLE (built_at goes stale and the staleness alarm fires); a
    # board that rebuilds wrong is not."
    #
    # SPLIT BY SOURCE, because the benign-race argument holds only for live
    # Sleeper. Read live, a difference can be a team designating between the two
    # reads — warn. Read from the fallback, the file is of unknown age and cannot
    # be newer than the board it disagrees with — refuse.
    if expected is not None and out["_designating_teams"] != expected:
        # THE HAZARD IS A CACHE OF UNKNOWN AGE, so name it exactly rather than
        # by exclusion. `designations()` tags exactly three sources: "sleeper"
        # (live), "injected" (a caller supplied the rosters and knows what it
        # has), and "history (sleeper unreachable)".
        #
        # Two wrong versions of this line, both caught by running it:
        #   `"sleeper" not in source` — the fallback label literally CONTAINS the
        #     word sleeper, so the stale read tested as live and sailed straight
        #     through the guard written to stop it.
        #   `source != "sleeper"` — swept in "injected" too, which refuses on
        #     every offline replay and broke four existing tests, one of which
        #     (test_keeper_path_silence) exists specifically to pin that a
        #     different nonzero count only WARNS.
        from_fallback = str(out.get("_designations_source") or "").startswith("history")
        msg = ("designating teams: %d here vs %d on the last board"
               % (out["_designating_teams"], expected))
        if from_fallback:
            raise SystemExit(
                "gen_keepers_json: %s, and this read came from the STALE FALLBACK "
                "(%s) rather than live Sleeper. A cached file cannot be newer than "
                "the board it disagrees with, so this is not a race — it is the "
                "structural disagreement this file's own docstring describes. "
                "Writing it would return %d team(s)' keepers to the draftable pool "
                "on a green run. Refusing."
                % (msg, out.get("_designations_source"),
                   abs(expected - out["_designating_teams"])))
        print("  ! %s — expected if a team designated between the two reads, "
              "worth a look if not" % msg)


if __name__ == "__main__":
    main()
