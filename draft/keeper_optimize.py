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
    # KEPT PLAYERS ARE IN A DIFFERENT LIST, and missing them broke this tool
    # completely. Fixed 2026-08-16, six days before the draft, after running it
    # and reading: "RECOMMENDED: keep 0 — nobody", best offer Cameron Dicker (a
    # KICKER, VORP 0) at round 1. Cory's three real designations — Chase, Henry,
    # Walker — did not appear at all.
    #
    # Cause: build.py moves designated keepers out of `players[]` into
    # `kept_players[]`, so a board that indexes only `players[]` cannot see the
    # very players this tool exists to price. The loop below then hit a bare
    # `continue` and dropped them in silence, which is how a decision tool came
    # to recommend the opposite of the right answer without any error.
    #
    # `kept_players` rows carry `proj_mean` but NOT `vorp` (the prune runs
    # before VORP is assigned), so the value is recovered the same way
    # vorp.apply_vorp computes it: proj_mean minus the position's replacement
    # level, both read from this same artifact. A keeper that still cannot be
    # priced is REFUSED LOUDLY below rather than skipped.
    by_id = {str(p["player_id"]): p for p in art["players"]}
    _rep = ((art.get("replacement") or {}).get("replacement_points") or {})
    for kp in (art.get("kept_players") or []):
        pid = str(kp.get("player_id"))
        if pid in by_id:
            continue
        row = dict(kp)
        if row.get("vorp") is None and row.get("proj_mean") is not None:
            base = _rep.get(row.get("position"))
            if base is not None:
                row["vorp"] = round(float(row["proj_mean"]) - float(base), 2)
        by_id[pid] = row

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

    eligible, unpriced = [], []
    for pid in roster_ids:
        p = by_id.get(pid)
        # REFUSE LOUDLY, never `continue`. A silently dropped roster player is
        # how this tool recommended "keep nobody" while holding three real
        # keepers. A missing player is UNKNOWN, not worthless, and the person
        # about to make a keeper decision has to be told which ones vanished.
        if not p or p.get("vorp") is None:
            unpriced.append((pid, (p or {}).get("name") or "unknown"))
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
    if unpriced:
        # Loud, above the recommendation, because a recommendation computed
        # without some of your roster is not a recommendation.
        lines.append("!! %d ROSTER PLAYER(S) COULD NOT BE PRICED and are EXCLUDED "
                     "from every option below:" % len(unpriced))
        for pid, nm in unpriced:
            lines.append("     %s (%s)" % (nm, pid))
        lines.append("   The recommendation is incomplete until these are priced.")
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
