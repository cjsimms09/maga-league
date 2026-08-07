"""Generate config/keepers.json from REAL keeper designations, not fixtures.

Sources each team's keepers from the league-history final_rosters `keepers`
field and joins name/position from the artifact. Keyed by DRAFT SLOT.

PRE-DRAFT LIMITATION, stated loudly: draft slots are not assigned until the
draft, so only teams whose slot is known can be placed. Right now that is my
own seat (my_draft_slot in config). Other teams populate as they designate
keepers AND as the draft order is set — re-run this then. Under top_picks_flat
each kept team forfeits its rounds 1..N, so a missing team is modelled as
keeping nobody, which is correct for teams that have not designated yet.
"""
import json, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MY_OWNER = "434915673219526656"


def main():
    cfg = json.load(open(os.path.join(ROOT, "draft", "config", "league_config.json")))
    art = json.load(open(os.path.join(ROOT, "public", "draft_data.json")))
    hist = json.load(open(os.path.join(ROOT, "draft", "data", "league_history.json")))
    by_id = {str(p["player_id"]): p for p in art["players"]}
    season = max(hist["seasons"], key=lambda s: int(s["season"]))
    fr = season.get("final_rosters") or []

    # roster_id -> draft_slot. Only mine is known pre-draft (from config).
    my_slot = int(cfg.get("my_draft_slot") or 4)
    slot_by_owner = {MY_OWNER: my_slot}

    teams_out, placed, unplaced = [], 0, []
    for r in fr:
        owner = str(r.get("owner_id"))
        keepers = [str(x) for x in (r.get("keepers") or [])]
        if not keepers:
            continue
        slot = slot_by_owner.get(owner)
        if slot is None:
            unplaced.append((owner, keepers))
            continue
        entry = {"draft_slot": slot, "keepers": []}
        for pid in keepers:
            p = by_id.get(pid, {})
            entry["keepers"].append({
                "player_id": pid, "name": p.get("name", pid),
                "position": p.get("position", "?"),
                # original_round is moot under top_picks_flat (positional), kept
                # for other cost models; 1 is a safe placeholder.
                "original_round": 1, "years_kept": 1,
            })
        teams_out.append(entry)
        placed += 1

    out = {"teams": teams_out,
           "_note": "generated from final_rosters keeper designations; regenerate "
                    "as teams designate and draft slots are assigned",
           "_placed_teams": placed, "_unplaced_designations": len(unplaced)}
    open(os.path.join(ROOT, "draft", "config", "keepers.json"), "w").write(
        json.dumps(out, indent=2) + "\n")
    print("wrote keepers.json: %d team(s) placed, %d designation(s) unplaced "
          "(slot unknown pre-draft)" % (placed, len(unplaced)))
    for owner, ks in unplaced:
        print("  unplaced: owner %s keeps %s" % (owner[:8], ks))


if __name__ == "__main__":
    main()
