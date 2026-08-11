#!/usr/bin/env python3
"""Predict all 10 owners' 2026 keeper slates from their 2025 rosters under the
league's flat-cost math (top_picks_flat) — the K0 optimizer pointed at everyone.

Keeping k players forfeits rounds 1..k, whose picks are worth ~VORP thresholds
(pick ~5/15/25 → 104/62/36 on the current board). The optimal k maximises
sum(top-k roster VORP) − sum(round-cost thresholds). Each predicted keeper carries
a confidence from its surplus margin. Cory's intel (MarianSaar keeps Bowers) is a
high-confidence OVERRIDE.

Predictions feed mock/rehearsal boards (marked PREDICTED) until real designations
land. Output: draft/data/predicted_keepers.json + a report.

Run: python draft/predict_keepers.py
"""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
HIST = HERE / "data" / "league_history.json"
BOARD = HERE.parent / "public" / "draft_data.json"
OUT = HERE / "data" / "predicted_keepers.json"
MAX_KEEPERS = 3

# Cory intel overrides. Locked reads that override / confirm the model.
INTEL_OVERRIDES = [
    {"owner": "MarianSaar", "player": "Brock Bowers", "confidence": "high", "source": "Cory intel"},
    # Batch 2 — Cory 100% confidence: Richard2121's full 3-keeper slate.
    {"owner": "Richard2121", "player": "Bijan Robinson", "confidence": "certain", "source": "Cory intel"},
    {"owner": "Richard2121", "player": "Trey McBride", "confidence": "certain", "source": "Cory intel"},
    {"owner": "Richard2121", "player": "Nico Collins", "confidence": "certain", "source": "Cory intel"},
]


def _round_thresholds(board_players):
    ranked = sorted((p for p in board_players if (p.get("proj_mean") or 0) > 0),
                    key=lambda p: (p.get("overall_rank") or p.get("consensus_rank") or 1e9))
    def vorp_at(pick):
        i = min(max(0, pick - 1), len(ranked) - 1)
        return ranked[i].get("vorp") or 0
    # cost rounds 1,2,3 ~ picks 5,15,25
    return [vorp_at(5), vorp_at(15), vorp_at(25)]


def _confidence(surplus):
    if surplus >= 25:
        return "high"
    if surplus >= 8:
        return "medium"
    return "low"


def main():
    hist = json.loads(HIST.read_text())
    board = json.loads(BOARD.read_text())
    season = next((s for s in hist["seasons"] if s.get("season") == "2025"), None)
    if not season:
        print("no 2025 season in history")
        return 1

    val = {str(p["player_id"]): p for p in board.get("players", []) if p.get("player_id") is not None}
    # kept_players (mine) carry no vorp on the board; give them a proj-based proxy
    # so my own slate validates. proxy vorp ~ proj_mean - replacement(~150).
    for k in board.get("kept_players", []):
        pid = str(k["player_id"])
        if pid not in val:
            val[pid] = dict(k, vorp=max(0, (k.get("proj_mean") or 0) - 150))
    name_by_id = {pid: (p.get("name") or pid) for pid, p in val.items()}
    pos_by_id = {pid: p.get("position") for pid, p in val.items()}

    thresholds = _round_thresholds(board.get("players", []))
    owners = season.get("owners") or {}
    name_by_roster = {str(rid): (o.get("display_name") or ("roster " + str(rid)))
                      for rid, o in owners.items()} if isinstance(owners, dict) else {}

    predictions = {}
    for r in season.get("final_rosters", []) or []:
        rid = str(r.get("roster_id"))
        owner = name_by_roster.get(rid, "roster " + rid)
        # value this roster's players (those we can price), best VORP first.
        players = []
        for pid in (r.get("players") or []):
            pid = str(pid)
            v = (val.get(pid) or {}).get("vorp")
            if v is None:
                continue
            players.append({"player_id": pid, "name": name_by_id.get(pid, pid),
                            "position": pos_by_id.get(pid), "vorp": round(v, 1)})
        players.sort(key=lambda x: -x["vorp"])

        # Optimal keeper count k: maximise sum(top-k vorp) − sum(thresholds[:k]).
        best_k, best_net = 0, 0.0
        for k in range(1, min(MAX_KEEPERS, len(players)) + 1):
            net = sum(p["vorp"] for p in players[:k]) - sum(thresholds[:k])
            if net > best_net:
                best_net, best_k = net, k
        kept = []
        for i in range(best_k):
            surplus = round(players[i]["vorp"] - thresholds[i], 1)
            kept.append({**players[i], "cost_round": i + 1, "surplus": surplus,
                         "confidence": _confidence(surplus)})
        predictions[owner] = {"roster_id": rid, "predicted_keepers": kept,
                              "next_best": players[best_k]["name"] if best_k < len(players) else None,
                              "source": "model"}

    # Apply intel overrides — force the player onto that owner's slate, high conf.
    for ov in INTEL_OVERRIDES:
        pred = predictions.get(ov["owner"])
        if not pred:
            continue
        existing = next((k for k in pred["predicted_keepers"]
                         if ov["player"].split()[-1] in (k["name"] or "")), None)
        if existing:
            # The model ALREADY predicts this keeper — intel CONFIRMS it. Upgrade
            # confidence to the intel level and tag the source (model + intel agree).
            existing["confidence"] = ov["confidence"]
            existing["override"] = ov["source"] + " (confirms model)"
        else:
            # find the player's value if on the board
            hit = next((p for p in board.get("players", []) if p.get("name") == ov["player"]), None)
            v = round((hit or {}).get("vorp", 0), 1) if hit else None
            pred["predicted_keepers"].insert(0, {
                "player_id": (hit or {}).get("player_id"), "name": ov["player"],
                "position": (hit or {}).get("position"), "vorp": v,
                "cost_round": 1, "surplus": None,
                "confidence": ov["confidence"], "override": ov["source"]})
            # keeping the override may push the slate over MAX; trim the weakest model pick.
            model_picks = [k for k in pred["predicted_keepers"] if not k.get("override")]
            if len(pred["predicted_keepers"]) > MAX_KEEPERS and model_picks:
                weakest = min(model_picks, key=lambda k: k.get("surplus") or 0)
                pred["predicted_keepers"].remove(weakest)
            # renumber cost rounds by value order
            for i, k in enumerate(sorted(pred["predicted_keepers"], key=lambda x: -(x.get("vorp") or 0))):
                k["cost_round"] = i + 1
        pred["source"] = "model + intel override"

    OUT.write_text(json.dumps({"provenance": "predicted (flat-cost surplus) + Cory intel",
                               "note": "PREDICTED slates for MOCK/REHEARSAL ONLY — never applied to the live board (Cory, 2026-08-11: a prediction rendered indistinguishably from a fact IS a fact as far as behaviour is concerned). Real designations are read from live Sleeper by the nightly draft-data rebuild; there is no keeper-watch process. Assumes keeper-eligibility (max_years=3 not verifiable for opponents).",
                               "round_cost_vorp": thresholds,
                               "predictions": predictions}, indent=2))

    # --- Report ---
    print("PREDICTED KEEPER SLATES (flat-cost surplus; round-cost VORP "
          + "/".join(str(round(t)) for t in thresholds) + ")\n")
    for owner, pred in sorted(predictions.items(), key=lambda kv: -sum((k.get("vorp") or 0) for k in kv[1]["predicted_keepers"])):
        ks = pred["predicted_keepers"]
        tag = " [+intel]" if "intel" in pred["source"] else ""
        print(f"{owner}{tag}: " + (", ".join(
            f"{k['name']} ({k['position']}, r{k['cost_round']}, "
            + (f"surplus {k['surplus']:+.0f}, " if k.get('surplus') is not None else "")
            + f"{k['confidence']})" for k in ks) if ks else "predicted to keep NONE"))

    # Validation: my own predicted slate vs my real keepers.
    cory = predictions.get("coryjsimms") or {}
    got = sorted(k["name"] for k in cory.get("predicted_keepers", []))
    print("\nVALIDATION — my predicted slate:", got or "none")
    print("  (my real keepers: Chase / Henry / Walker — a predictor that recovers "
          "these from my 2025 roster is trustworthy for opponents.)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
