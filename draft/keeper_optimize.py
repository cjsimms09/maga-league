"""K0: run the keep-0/1/2/3 optimizer against my real roster, offline.

Joins my roster (from the league-history final_rosters) to the production
artifact's VORP, derives each player's original draft round from the draft
history, and runs optimize_keeper_count under the CONFIGURED cost model.

PROVISIONAL until DECISIONS D2 (the real top_picks_flat cost formula) is
answered — the current config is original_round, and the cost model changes
which keepers are worth their pick. Re-run the instant D2 lands.
"""
from __future__ import annotations
import json, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__))))
import keepers as K

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MY_OWNER = "434915673219526656"


def main() -> int:
    cfg = json.load(open(os.path.join(ROOT, "draft", "config", "league_config.json")))
    art = json.load(open(os.path.join(ROOT, "public", "draft_data.json")))
    hist = json.load(open(os.path.join(ROOT, "draft", "data", "league_history.json")))
    by_id = {str(p["player_id"]): p for p in art["players"]}

    # My roster from the current-season final_rosters.
    season = max(hist["seasons"], key=lambda s: int(s["season"]))
    mine = next((r for r in (season.get("final_rosters") or [])
                 if str(r.get("owner_id")) == MY_OWNER), None)
    if not mine:
        print("could not find my roster in final_rosters"); return 1
    roster_ids = [str(x) for x in (mine.get("players") or [])]

    # Original draft round per player = earliest round across all history drafts.
    earliest = {}
    for s in hist["seasons"]:
        for dr in (s.get("drafts") or []):
            for pk in (dr.get("picks") or []):
                pid = str(pk.get("player_id"))
                yr, rnd = int(s["season"]), pk.get("round")
                if pid in roster_ids and rnd is not None:
                    if pid not in earliest or yr < earliest[pid][0]:
                        earliest[pid] = (yr, rnd)

    eligible = []
    for pid in roster_ids:
        p = by_id.get(pid)
        if not p:
            continue
        orig = earliest.get(pid, (None, None))[1]
        eligible.append({
            "player_id": pid, "name": p.get("name"), "position": p.get("position"),
            "vorp": p.get("vorp") or 0.0,
            "original_round": orig,             # None -> undrafted_round via cost fn
            "adjusted_adp": p.get("adjusted_adp"), "raw_adp": p.get("raw_adp"),
        })

    # Pool + replacement by position from the whole artifact board.
    pool_by_pos, rep_by_pos = {}, {}
    for p in art["players"]:
        pos = p.get("position")
        if not pos:
            continue
        pool_by_pos.setdefault(pos, []).append(p)
    for pos, arr in pool_by_pos.items():
        arr.sort(key=lambda x: (x.get("adjusted_adp") or x.get("raw_adp") or 9999))
        starters = 1
        rep_by_pos[pos] = 0.0
        vv = sorted((x.get("vorp") or 0.0) for x in arr)
        rep_by_pos[pos] = vv[len(vv)//2] if vv else 0.0

    out = K.optimize_keeper_count(eligible, cfg, replacement_by_pos=rep_by_pos,
                                  pool_by_pos=pool_by_pos)

    lines = []
    lines.append("K0 KEEPER OPTIMIZER — real roster, cost_model=" + cfg["keepers"]["cost_model"]
                 + " (PROVISIONAL pending D2 top_picks_flat)")
    lines.append("artifact built_at " + str(art.get("built_at")) + " · adp_source "
                 + str(((art.get("provenance") or {}).get("adp") or {}).get("adp_source")))
    lines.append("")
    lines.append("RECOMMENDED: keep %d — %s  (total surplus %.1f)" % (
        out["recommended_keep"], ", ".join(out["recommended_players"]) or "nobody",
        out["recommended_surplus"]))
    lines.append("")
    lines.append("every option (surplus = keeper VORP minus what the forfeited pick returns):")
    for r in out["by_size"]:
        lines.append("  keep %d: %-40s surplus %+7.1f" % (
            r["keep"], (", ".join(r["players"]) or "(draft normally)"), r["total_surplus"]))
        for d in r.get("detail", []):
            lines.append("      %-18s %s  VORP %.0f  costs R%s  pick returns %.0f  -> surplus %+.0f" % (
                d["name"], d["position"], d["vorp"], d["cost_round"],
                d["alternative_vorp"], d["surplus"]))
    text = "\n".join(lines)
    print(text)
    open(os.path.join(ROOT, "draft", "KEEPER-OPTIMIZER.txt"), "w").write(text + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
