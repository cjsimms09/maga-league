# TERRITORY: A
"""Market-implied per-player upside from Kalshi season ladders, for display.

Cory's resource review, 08-18: the Kalshi capture holds 351 real-money player
season-stat threshold ladders — the only MONEY-BACKED per-player distribution
we have — and it reached nothing. This publishes the coherent ones as war-room
display data: P(at least threshold) per rung, per player, per stat, plus the
open interest so a thin market cannot masquerade as conviction.

DISPLAY OF PUBLISHED PRICES ONLY — the capture's own note says "NOT a board
input" and that stands: nothing here feeds a projection, a ceiling, or a
recommendation. Same publication pattern as expert_spread_2026.json.

Run: python3 draft/backtest/market_upside_artifact.py
"""
from __future__ import annotations

import json
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
LADDERS = ROOT / "draft" / "data" / "kalshi" / "season_ladders_2026-08-17.json"

STAT_LABEL = {"rec": "receptions", "rec_yd": "receiving yards",
              "rec_td": "receiving TDs", "rush_yd": "rushing yards",
              "rush_td": "rushing TDs", "pass_yd": "passing yards"}


def _name_from_titles(rungs) -> str | None:
    for r in rungs:
        m = re.match(r"Will (.+?) (?:have|record|reach|get|score|throw)", r.get("title") or "")
        if m:
            return m.group(1).strip()
    return None


def build() -> dict:
    import sys
    sys.path.insert(0, str(HERE))
    import expert_grading as EG

    src = json.loads(LADDERS.read_text())
    idx = EG.name_index()
    players: dict[str, dict] = {}
    dropped_incoherent = 0
    unmatched = 0
    for lad in src["ladders"]:
        if not (lad.get("coherence") or {}).get("monotone"):
            dropped_incoherent += 1
            continue
        name = _name_from_titles(lad.get("rungs") or [])
        hit = idx.get(EG._norm(name)) if name else None
        if not hit:
            unmatched += 1
            continue
        pid = str(hit["player_id"])
        oi = round(sum(float(r.get("open_interest") or 0) for r in lad["rungs"]), 1)
        entry = players.setdefault(pid, {
            "player_id": pid, "name": name,
            "position": hit.get("position"), "stats": {}})
        imp = lad.get("implied") or {}
        entry["stats"][lad["stat"]] = {
            "label": STAT_LABEL.get(lad["stat"], lad["stat"]),
            "survival": imp.get("survival"),
            "p_top_rung": imp.get("p_top_rung"),
            "top_threshold": imp.get("top_threshold"),
            "open_interest": oi}
    doc = {"_territory": "TERRITORY: A — written by market_upside_artifact.py",
           "_what": "market-implied P(at least threshold) per player season stat, "
                    "from Kalshi real-money ladders captured 2026-08-17. DISPLAY "
                    "DATA: published prices, not a model claim; thin markets are "
                    "visible via open_interest, incoherent ladders excluded.",
           "captured_at": src.get("captured_at"), "season": 2026,
           "players_covered": len(players),
           "ladders_dropped_incoherent": dropped_incoherent,
           "ladders_unmatched_name": unmatched,
           "players": sorted(players.values(), key=lambda p: p["name"] or "")}
    out = json.dumps(doc, indent=1)
    (ROOT / "public" / "market_upside_2026.json").write_text(out)
    (ROOT / "draft" / "data" / "market_upside_2026.json").write_text(out)
    return doc


if __name__ == "__main__":
    d = build()
    print(f"wrote market_upside_2026.json: {d['players_covered']} players, "
          f"{d['ladders_dropped_incoherent']} incoherent dropped, "
          f"{d['ladders_unmatched_name']} unmatched")
