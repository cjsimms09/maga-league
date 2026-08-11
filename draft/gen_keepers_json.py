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
import json, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
import sys
sys.path.insert(0, os.path.join(ROOT, "draft"))
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
            rosters = si.fetch_rosters(_LEAGUE_ID) or []
            src = "sleeper"
        except Exception as exc:                     # noqa: BLE001
            # LOUDLY: a fallback that looks like a success is how a stale board
            # ships. The source travels with the data.
            print("  ! could not reach Sleeper for designations (%s: %s) — "
                  "falling back to league_history.json, which may be STALE"
                  % (type(exc).__name__, exc))
            rosters, src = None, "history (sleeper unreachable)"
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
    teams = int(cfg.get("teams") or 10)
    my_slot = int(cfg.get("my_draft_slot") or 4)

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


def main():
    cfg = json.load(open(os.path.join(ROOT, "draft", "config", "league_config.json")))
    art = json.load(open(os.path.join(ROOT, "public", "draft_data.json")))
    hist = json.load(open(os.path.join(ROOT, "draft", "data", "league_history.json")))
    out = build(cfg, art, hist)
    open(os.path.join(ROOT, "draft", "config", "keepers.json"), "w").write(
        json.dumps(out, indent=2) + "\n")
    print("wrote keepers.json: %d designating team(s), %d keeper(s), "
          "%d provisional slot(s)"
          % (out["_designating_teams"], out["_total_keepers"],
             out["_provisional_slots"]))
    for p in out["_problems"]:
        print("  PROBLEM [%s] %s" % (p["kind"], p["reason"]))
    # ACCOUNTING, ASSERTED. The failure this replaces was designations going
    # missing without the total ever being checked against the input.
    accounted = len(out["teams"]) + len(
        [p for p in out["_problems"] if p["kind"] == "no_free_slot"])
    if accounted != out["_designating_teams"]:
        raise SystemExit(
            "gen_keepers_json: %d designating teams but %d accounted for — a "
            "designation went missing without a reason" % (out["_designating_teams"], accounted))


if __name__ == "__main__":
    main()
