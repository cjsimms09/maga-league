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

    # ── TWO FALLBACKS, BOTH ARGUED A PRIORI, NEITHER FITTED (register 91) ────
    # `crosswalk_misses` shipped as a bare COUNT of 9 and named nobody. One of
    # the nine was **Kenneth Walker III at ECR 23 — one of Cory's three
    # keepers** — so his expert-split badge was silently blank on the surface
    # Cory drafts from. That is register 80's shape in a second artifact.
    #
    # (1) COLLISION + UNIQUE POSITION. `sleeper_name_index` deliberately drops
    #     any name held by two rostered players — *"a caller gets no answer
    #     rather than a wrong one"*, which is the right instinct. But it
    #     discards the candidates, and **this caller already knows the
    #     position**: it checks `hit.position == row.position` on the next
    #     line. "kenneth walker" collides between an inactive WR (4634) and
    #     the KC running back (8151); only one is an RB, so the ambiguity the
    #     exclusion protects against does not exist for this caller. The
    #     store publishes `collisions`, so this needs no change in C's
    #     territory. **Where the position does NOT disambiguate, nothing is
    #     resolved** — Kyle Williams (3 WRs) and Frank Gore Jr. (2 RBs) stay
    #     unmatched, which preserves the principle rather than eroding it.
    #
    # (2) `adp.NICKNAMES`, because rule 11 says one crosswalk. "Hollywood
    #     Brown" -> "Marquise Brown" is already in that table and this join
    #     was not reading it. Reusing it is the fix; inventing a fuzzy
    #     name rule here is what rule 11 exists to prevent — and a
    #     "conservative prefix rule" I proposed on 08-19 for a sibling defect
    #     would itself have missed Gainwell, so the general lesson is bought.
    collisions = json.loads(
        (HERE / "sleeper_name_index.json").read_text()).get("collisions") or {}
    try:
        sys.path.insert(0, str(ROOT / "draft"))
        from adp import NICKNAMES
    except Exception:                                   # noqa: BLE001
        NICKNAMES = {}

    rows, misses, recovered = [], 0, []
    for p in src["players"]:
        ranks = list((p.get("expert_ranks") or {}).values())
        if len(ranks) < 5:
            continue
        norm = EG._norm(p.get("name"))
        pos = (p.get("position") or "").upper()
        hit = idx.get(norm)
        pid = None
        if hit and (hit.get("position") or "").upper() == pos:
            pid = str(hit["player_id"])
        else:
            same_pos = [c for c in collisions.get(norm, [])
                        if (c.get("position") or "").upper() == pos]
            if len(same_pos) == 1:
                pid = str(same_pos[0]["player_id"])
                recovered.append({"name": p.get("name"), "position": pos,
                                  "player_id": pid, "via": "collision+position"})
            elif norm in NICKNAMES:
                alt = idx.get(NICKNAMES[norm])
                if alt and (alt.get("position") or "").upper() == pos:
                    pid = str(alt["player_id"])
                    recovered.append({"name": p.get("name"), "position": pos,
                                      "player_id": pid, "via": "adp.NICKNAMES"})
        if pid is None:
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
           "crosswalk_misses": misses,
           # NAMED, not just counted. Register 80's whole lesson is that a
           # diagnostic nobody can act on is worse than none, because its
           # existence is mistaken for the check having been done — and a bare
           # `9` cannot tell you one of them is a keeper.
           "crosswalk_unmatched": [
               {"name": r["name"], "position": r["position"],
                "rank_ecr": r["rank_ecr"]}
               for r in rows if not r["player_id"]],
           "crosswalk_recovered": recovered,
           "players": rows}
    out = json.dumps(doc, indent=1)
    (ROOT / "public" / "expert_spread_2026.json").write_text(out)
    (ROOT / "draft" / "data" / "expert_spread_2026.json").write_text(out)
    return doc


if __name__ == "__main__":
    d = build()
    print(f"wrote expert_spread_2026.json: {len(d['players'])} players, "
          f"{d['crosswalk_misses']} unmatched names")
