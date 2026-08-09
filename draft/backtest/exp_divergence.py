#!/usr/bin/env python3
"""EDGE MAP — where the best board DIVERGES from my room's revealed behavior, and is right.

Cory's reframe (2026-08-09): "which board values players best" and "where is MY edge" are TWO
questions, and grading a board against outcomes only answers the first. Edge is DIFFERENTIAL
correctness — it exists only where the good board and my nine opponents' ACTUAL picks disagree,
in the direction the good board is right. Where the room already drafts players like the good
board, the good board buys me nothing at my seat. And the bar is never a board — it's their
picks (exp43: the room is collectively at-market, so I must beat where I can be systematically
better than they actually were).

We do not need to be told which board the room uses — the data contains it. Three inputs, all
keyed on player_id × season:
  * ROOM revealed slot  = the actual non-keeper pick_no in OUR three drafts (league_history).
    This is my opponents' revealed valuation — not national FFC ADP, MY room.
  * BEST board rank     = FantasyPros (the source grade's winner; fetched in CI).
  * REALIZED value      = per-player realized fantasy points (exp36_picks, nflverse in CI).

THE MEASUREMENTS:
  1. Does FP order realized value BETTER than the room's own draft order does?
     Spearman(-fp_rank, realized) vs Spearman(-room_slot, realized) on the same drafted players.
     If FP > room, FP is a better guide even to the room's own pool — the precondition for edge.
  2. WHERE does the edge live? divergence d = room_slot − fp_rank. d>0 = FALLER (FP values him
     more than the room; the room lets him slide → I can get an FP-good player at a discount).
     d<0 = REACH (the room takes him earlier than FP; I should fade). Compare realized across
     fallers vs reaches at MATCHED room-slot bands — if fallers out-return reaches, targeting
     FP-fallers where the room and FP disagree is the exploitable edge, and it is CONCENTRATED
     (not every pick — only the divergent ones).

Pure core (room_adp / divergence_rows / edge_summary) unit-tested in test_divergence.py. The
CI egress joins league_history + FP + exp36_picks (no new egress beyond FP, already cracked).
Thin (3 seasons, ~350 drafted players) — reports rho gaps without CIs on the gap; directional.
"""
from __future__ import annotations
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent


def _spearman(xs, ys):
    n = len(xs)
    if n < 3:
        return None
    def ranks(v):
        order = sorted(range(n), key=lambda i: v[i])
        r = [0.0] * n
        i = 0
        while i < n:
            j = i
            while j + 1 < n and v[order[j + 1]] == v[order[i]]:
                j += 1
            avg = (i + j) / 2.0 + 1
            for k in range(i, j + 1):
                r[order[k]] = avg
            i = j + 1
        return r
    rx, ry = ranks(xs), ranks(ys)
    mx, my = sum(rx) / n, sum(ry) / n
    num = sum((rx[i] - mx) * (ry[i] - my) for i in range(n))
    dx = sum((rx[i] - mx) ** 2 for i in range(n)) ** 0.5
    dy = sum((ry[i] - my) ** 2 for i in range(n)) ** 0.5
    return round(num / (dx * dy), 4) if dx and dy else None


def room_adp(picks):
    """Room's REVEALED valuation: mean actual pick_no per player across seasons, NON-KEEPER
    picks only (a keeper isn't a market decision). picks: [{player_id, pick_no, is_keeper}]."""
    by = {}
    for p in picks:
        if p.get("is_keeper") or p.get("pick_no") is None or not p.get("player_id"):
            continue
        by.setdefault(str(p["player_id"]), []).append(p["pick_no"])
    return {pid: sum(v) / len(v) for pid, v in by.items()}


def divergence_rows(room, board_rank, realized):
    """Join the three by player_id. board_rank/realized/room are {player_id: value}. Returns
    [{player_id, room_slot, board_rank, div, realized}] for players present in ALL three."""
    rows = []
    for pid, slot in room.items():
        if pid in board_rank and pid in realized:
            rows.append({"player_id": pid, "room_slot": round(slot, 1),
                         "board_rank": board_rank[pid], "div": round(slot - board_rank[pid], 1),
                         "realized": realized[pid]})
    return rows


def edge_summary(rows, div_gate=6.0, band=24.0):
    """Q1: does the board order realized better than the room's own draft order?
       Q2: at matched room-slot bands, do board-FALLERS (div>gate) out-return REACHES (div<-gate)?
    div_gate ~6 picks (~half a round); band groups room slots so faller/reach are compared like
    for like (a faller at slot 30 vs a reach at slot 120 isn't a fair contest)."""
    if len(rows) < 10:
        return {"n": len(rows), "underpowered": True}
    board_rho = _spearman([-r["board_rank"] for r in rows], [r["realized"] for r in rows])
    room_rho = _spearman([-r["room_slot"] for r in rows], [r["realized"] for r in rows])
    # matched-band faller vs reach: within each slot band, mean realized of fallers vs reaches
    fallers, reaches, matched = [], [], []
    bands = {}
    for r in rows:
        bands.setdefault(int(r["room_slot"] // band), []).append(r)
    for _b, grp in bands.items():
        f = [r["realized"] for r in grp if r["div"] >= div_gate]
        c = [r["realized"] for r in grp if r["div"] <= -div_gate]
        if f and c:
            matched.append((sum(f) / len(f)) - (sum(c) / len(c)))
        fallers += [r for r in grp if r["div"] >= div_gate]
        reaches += [r for r in grp if r["div"] <= -div_gate]
    faller_edge = round(sum(matched) / len(matched), 2) if matched else None
    return {
        "n": len(rows),
        "board_orders_realized_rho": board_rho,
        "room_order_realized_rho": room_rho,
        "board_beats_room_order": (board_rho is not None and room_rho is not None
                                   and board_rho > room_rho),
        "n_fallers": len(fallers), "n_reaches": len(reaches),
        "faller_minus_reach_realized_matched": faller_edge,
        "reading": _reading(board_rho, room_rho, faller_edge),
    }


def _reading(board_rho, room_rho, faller_edge):
    if board_rho is None or room_rho is None:
        return "underpowered"
    better = board_rho > room_rho
    if better and faller_edge and faller_edge > 0:
        return ("EDGE: the best board orders realized value better than the room's own picks, AND "
                "board-fallers out-return board-reaches at matched slots — target where FP and the "
                "room diverge and FP likes the faller.")
    if better:
        return ("the best board orders realized better than the room does, but the faller/reach "
                "split isn't separable here (thin) — directional edge, needs more seasons.")
    return ("the best board does NOT beat the room's own draft order on realized value here — no "
            "divergence edge in this sample; the room is pricing about as well as the board.")


# ---------------------------------------------------------------- CI egress
def egress_main():   # pragma: no cover  (CI only)
    """Join league_history (room slots) + FantasyPros board + exp36_picks (realized), per season,
    crosswalked on player_id. Writes exp_divergence.json."""
    sys.path.insert(0, str(HERE.parent))
    sys.path.insert(0, str(HERE.parent.parent))
    import fantasypros_adp as FP
    import adp as ADP
    import sleeper_import as SL
    hist = json.loads((HERE.parent / "data" / "league_history.json").read_text())
    picks_path = HERE / "exp36_picks.json"
    if not picks_path.exists():
        print("exp36_picks.json missing — run exp36 first (same job)"); return 0
    all_picks = json.loads(picks_path.read_text()).get("picks") or []
    index = ADP.build_index(SL.fetch_players())

    per_season, pooled_rows = {}, []
    for s in hist.get("seasons") or []:
        yr = s.get("season")
        room_picks = []
        for dr in s.get("drafts") or []:
            room_picks += (dr.get("picks") or [])
        room = room_adp(room_picks)
        if not room:
            continue
        # FP board -> {player_id: rank}
        text, fp_url, _diag = FP.fetch(int(yr))
        fp_rows = FP.parse(text) if text else []
        board_rank = {}
        for rank, r in enumerate(fp_rows, 1):
            sid, _how = ADP.match_player(r, index)
            if sid:
                board_rank[str(sid)] = rank
        # realized from exp36_picks for this season
        realized = {str(p["player_id"]): p["realized"] for p in all_picks
                    if str(p.get("season")) == str(yr) and p.get("realized") is not None
                    and p.get("player_id")}
        rows = divergence_rows(room, board_rank, realized)
        pooled_rows += rows
        per_season[yr] = {"n_room": len(room), "n_fp": len(board_rank), "n_realized": len(realized),
                          **edge_summary(rows)}
    out = {"experiment": "edge map — FantasyPros vs the room's revealed picks, graded on realized",
           "per_season": per_season, "pooled": edge_summary(pooled_rows),
           "caveat": "room slot = actual non-keeper pick_no in our 3 drafts (revealed behavior, "
                     "not national FFC ADP). Best board = FantasyPros (source-grade winner). "
                     "Realized from exp36_picks. Thin (~350 players, 3 seasons); rho gaps have no "
                     "CI — directional. This is the 'where is my edge' question, distinct from "
                     "'which board is best' (exp_source_grade)."}
    (HERE / "exp_divergence.json").write_text(json.dumps(out, indent=2))
    print(json.dumps({"pooled": out["pooled"]}, indent=2))
    return 0


if __name__ == "__main__":   # pragma: no cover
    raise SystemExit(egress_main())
