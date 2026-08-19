# TERRITORY: A
# TERRITORY-GRANT: C scraped_at register 79 2026-08-19
"""OBSERVED expert disagreement per player, published for the war room.

Cory, 08-18, on the skill grading: "Yes! Best way to implement this data into
our model??" — the graded answer was that the flat consensus is already
optimal for RANKING, and the experts' remaining value is WHERE THEY DISAGREE.
This artifact ships that signal as observed fact — min/max/std of ~200 real
experts' ranks per player — not as a fitted ceiling. The fitted-ceiling
question stays behind EXPERT-SPREAD-CEILING-PREREG's grading and ship rule;
displaying the raw published distribution asserts nothing a source did not
state. Same publication pattern as opponent_need_2026.json.

Run: python3 -c "import sys; sys.path.insert(0,'draft/backtest');
import expert_spread_artifact as E; E.build()"
"""
from __future__ import annotations

import json
import statistics
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent


def build() -> dict:
    import sys
    sys.path.insert(0, str(HERE))
    import expert_grading as EG

    src = json.loads((HERE / "fp_expert_ranks_2026.json").read_text())
    idx = EG.name_index()
    rows, misses = [], 0
    for p in src["players"]:
        ranks = list((p.get("expert_ranks") or {}).values())
        if len(ranks) < 5:
            continue
        hit = idx.get(EG._norm(p.get("name")))
        pid = None
        if hit and (hit.get("position") or "").upper() == (p.get("position") or "").upper():
            pid = str(hit["player_id"])
        else:
            misses += 1
        rows.append({
            "player_id": pid, "name": p.get("name"),
            "position": p.get("position"), "rank_ecr": p.get("rank_ecr"),
            "n_experts": len(ranks), "rank_min": min(ranks),
            "rank_max": max(ranks), "spread": max(ranks) - min(ranks),
            "rank_std": round(statistics.pstdev(ranks), 1)})
    doc = {"_territory": "TERRITORY: A — written by expert_spread_artifact.py",
           "_what": "observed per-player disagreement of individual FantasyPros "
                    "expert ranks, 2026 preseason. DISPLAY DATA: not a ceiling, "
                    "not fitted, asserts nothing beyond what experts published.",
           "_source": src.get("url"), "season": 2026,
           "scraped_at": src.get("scraped_at"),
           "crosswalk_misses": misses, "players": rows}
    out = json.dumps(doc, indent=1)
    (ROOT / "public" / "expert_spread_2026.json").write_text(out)
    (ROOT / "draft" / "data" / "expert_spread_2026.json").write_text(out)
    return doc


if __name__ == "__main__":
    d = build()
    print(f"wrote expert_spread_2026.json: {len(d['players'])} players, "
          f"{d['crosswalk_misses']} unmatched names")
