#!/usr/bin/env python3
"""GRAB-BY — the "stick to value, know when to grab" model.

The whole session converged here: bending the value numbers doesn't pay (every
ceiling/floor tilt graded null; the startable-cap MASK is the earner). So the edge
left is not WHAT is valuable but WHEN scarcity makes a position the value pick
instead of a reach. This model answers exactly that, per position, live as the
draft unfolds.

The one quantity that decides it is EVLW — Expected Value Lost to Waiting:

    EVLW(pos) = (best available proj at pos NOW)
              − (expected best available proj at pos at my NEXT pick)

where "available at my next pick" means the players likely to survive there
(survival_probability from ADP). If EVLW is large, the cliff falls before you
pick again and taking the position now is the VALUE-maximizing move — not a reach.
If EVLW is small, waiting costs ~nothing, so stay on best-value-available. This is
VONA aimed one pick ahead, in projection points, so positions are directly
comparable and there is no magic "importance" constant — the number is the reason.

Two guards keep it honest:
  * NEED — a position only gets a verdict if you still have a starting slot to fill
    there (dedicated slot open, or the FLEX still open and the position is
    flex-eligible). A filled position is depth, not a grab.
  * GRAB-BY PICK — the last of your remaining picks at which the current quality
    still likely survives, so "when" is a concrete pick number, not a vibe.

Pure and deterministic (survival is a closed form over ADP); unit-tested. The
build attaches the pre-draft snapshot; the LIVE client is public/js/draft/grabby.js (recomputes each pick); this Python block is the pre-draft snapshot only.
"""
from __future__ import annotations

from config_schema import FLEX_ELIGIBILITY, flex_slots, starters_at
from keepers import survival_probability

SURVIVE_THRESH = 0.5        # "likely available" at a pick = survival ≥ this
QUALITY_TOL = 3.0          # grab-by pick: quality within this many proj pts of today's best
WEEK_DIVISOR = 17.0        # season proj → per-week, for interpretable verdict banding
# Pre-registered verdict bands in PER-WEEK points lost to waiting (display heuristic;
# the real call is EVLW vs the best-overall-value pick, which the VONA layer shows).
BAND_NEGLIGIBLE = 0.3      # < this per week → WAIT (waiting is ~free)
BAND_URGENT = 0.8          # ≥ this per week → TAKE-NOW (the cliff is falling on you)


def _adp(p: dict) -> float:
    return p.get("adjusted_adp") or p.get("raw_adp") or p.get("adp") or 9999.0


def positional_need(roster: list[dict], cfg: dict) -> tuple[dict[str, int], int]:
    """(dedicated_need_by_pos, flex_open) for MY roster. dedicated_need = starters
    still unfilled at a position; flex_open = FLEX slots not yet covered by a
    flex-eligible surplus. Per-team counts (this is one seat, not the league)."""
    counts: dict[str, int] = {}
    for p in roster:
        pos = p.get("position")
        if pos:
            counts[pos] = counts.get(pos, 0) + 1
    positions = set(counts) | {"QB", "RB", "WR", "TE", "K", "DEF"}
    dedicated = {pos: max(0, starters_at(cfg, pos) - counts.get(pos, 0)) for pos in positions}
    flex_elig = FLEX_ELIGIBILITY.get("FLEX", ["RB", "WR", "TE"])
    total_flex = sum(flex_slots(cfg).values())
    surplus = sum(max(0, counts.get(p, 0) - starters_at(cfg, p)) for p in flex_elig)
    flex_open = max(0, total_flex - surplus)
    return dedicated, flex_open


def is_live_need(pos: str, dedicated: dict[str, int], flex_open: int) -> bool:
    """Is a STARTING slot still open at this position (dedicated or via the flex)?"""
    if dedicated.get(pos, 0) > 0:
        return True
    return flex_open > 0 and pos in FLEX_ELIGIBILITY.get("FLEX", ["RB", "WR", "TE"])


def expected_best_available(avail_sorted: list[dict], pick: int, thresh: float = SURVIVE_THRESH) -> dict | None:
    """The highest-proj available player LIKELY (survival ≥ thresh) to still be there
    at `pick`. avail_sorted is proj-descending. None if nobody clears the bar."""
    for p in avail_sorted:
        if survival_probability(_adp(p), pick) >= thresh:
            return p
    return None


def grab_by_pick(avail_sorted: list[dict], my_remaining: list[int], best_now: float,
                 tol: float = QUALITY_TOL) -> int | None:
    """The LAST of my remaining picks at which this quality still likely survives.
    You can always take the best-available at your CURRENT pick, so the answer is
    never earlier than that (never None while players remain) — it extends forward
    only as long as a player within `tol` proj pts of today's best still survives."""
    picks = sorted(my_remaining)
    if not picks:
        return None
    last = picks[0]                      # you can always grab now
    for pick in picks[1:]:
        eb = expected_best_available(avail_sorted, pick)
        if eb is not None and eb.get("proj_mean", 0) >= best_now - tol:
            last = pick
        else:
            break                       # once it drops, later picks only get worse
    return last


def _verdict(evlw: float, need: bool, best_now_survives_next: bool) -> str:
    if not need:
        return "FILLED"                 # depth only — not a starting-slot decision
    per_week = evlw / WEEK_DIVISOR
    if per_week >= BAND_URGENT:
        return "TAKE-NOW"
    if per_week >= BAND_NEGLIGIBLE:
        return "GRAB-SOON"
    return "WAIT"


def report(players: list[dict], drafted_ids: set[str], roster: list[dict],
           my_remaining: list[int], cfg: dict,
           positions=("QB", "RB", "WR", "TE", "K", "DEF"),
           forecast_first: bool = False) -> dict:
    """Per-position grab-by read for the CURRENT state. `players` = full board;
    `drafted_ids` = everyone already taken (keepers + picks); `roster` = MY players
    so far (for need); `my_remaining` = my remaining overall pick numbers (ascending,
    the first is 'this pick').

    forecast_first=False (LIVE): best-now = the player actually on the board (you are
    on the clock, he is pickable with certainty). forecast_first=True (PRE-DRAFT
    snapshot): best-now = who is LIKELY to survive to your first pick, so the snapshot
    shows the board you will really face, not one that assumes zero picks before you."""
    dedicated, flex_open = positional_need(roster, cfg)
    next_pick = min(my_remaining) if my_remaining else None
    after = sorted(p for p in my_remaining if next_pick is None or p > next_pick)
    second_pick = after[0] if after else None

    rows = []
    for pos in positions:
        avail = sorted([p for p in players
                        if p.get("position") == pos and str(p.get("player_id")) not in drafted_ids],
                       key=lambda p: p.get("proj_mean", 0), reverse=True)
        need = is_live_need(pos, dedicated, flex_open)
        if not avail:
            rows.append({"position": pos, "need": need, "verdict": "NONE-LEFT",
                         "best_now": None, "evlw": None, "grab_by_pick": None})
            continue
        if forecast_first and next_pick is not None:
            best = expected_best_available(avail, next_pick) or avail[0]
        else:
            best = avail[0]
        best_now = best.get("proj_mean", 0)
        eb_next = expected_best_available(avail, second_pick) if second_pick else None
        best_next = eb_next.get("proj_mean", 0) if eb_next else (avail[-1].get("proj_mean", 0))
        evlw = round(best_now - best_next, 2)
        survives_next = (second_pick is None) or (survival_probability(_adp(best), second_pick) >= SURVIVE_THRESH)
        gb = grab_by_pick(avail, my_remaining, best_now)
        rows.append({
            "position": pos, "need": need,
            "best_now": {"name": best.get("name"), "player_id": best.get("player_id"),
                         "proj_mean": best_now, "tier": best.get("tier"),
                         "tier_size": best.get("tier_size"), "tier_drop": best.get("tier_drop"),
                         "adp": _adp(best)},
            "expected_best_next_pick": ({"name": eb_next.get("name"), "proj_mean": best_next}
                                        if eb_next else None),
            "evlw": evlw, "evlw_per_week": round(evlw / WEEK_DIVISOR, 3),
            "survives_to_next_of_my_picks": survives_next,
            "grab_by_pick": gb,
            "verdict": _verdict(evlw, need, survives_next),
        })

    # The one-line "this pick" call: the neediest position with the highest EVLW.
    live = [r for r in rows if r["need"] and r.get("evlw") is not None]
    urgent = sorted(live, key=lambda r: -r["evlw"])
    headline = None
    if urgent:
        top = urgent[0]
        if top["verdict"] in ("TAKE-NOW", "GRAB-SOON"):
            headline = (f"{top['verdict']}: {top['position']} — {top['best_now']['name']} "
                        f"(lose ~{top['evlw_per_week']}/wk if you wait; "
                        f"grab-by pick {top['grab_by_pick']})")
        else:
            headline = "WAIT — no position is falling off; take best value available."
    return {"this_pick": next_pick, "headline": headline,
            "flex_open": flex_open, "dedicated_need": dedicated, "positions": rows}


def my_keeper_roster(cfg: dict, keepers_path) -> list[dict]:
    """MY kept players (position-bearing) from keepers.json, matched by my_draft_slot —
    the starting slots already filled going into the draft."""
    import json
    from pathlib import Path
    my_slot = cfg.get("my_draft_slot")
    try:
        data = json.loads(Path(keepers_path).read_text())
    except (OSError, ValueError):
        return []
    for team in data.get("teams", []):
        if int(team.get("draft_slot", -1)) == int(my_slot):
            return [{"player_id": k.get("player_id"), "position": k.get("position"),
                     "name": k.get("name")} for k in team.get("keepers", [])]
    return []


def snapshot_for_build(board: dict, cfg: dict, keepers_path) -> dict:
    """The pre-draft grab-by block the build attaches to the artifact (forecast mode)."""
    players = board.get("players", [])
    kept = set(str(x) for x in (board.get("kept_player_ids") or []))
    roster = my_keeper_roster(cfg, keepers_path)
    remaining = (board.get("pick_order") or {}).get("my_picks") or []
    return report(players, kept, roster, remaining, cfg, forecast_first=True)


if __name__ == "__main__":   # pragma: no cover
    import json, sys
    from pathlib import Path
    import config_schema
    here = Path(__file__).resolve().parent
    board = json.loads(Path(sys.argv[1] if len(sys.argv) > 1 else "public/draft_data.json").read_text())
    cfg = config_schema.load(here / "config" / "league_config.json")
    print(json.dumps(snapshot_for_build(board, cfg, here / "config" / "keepers.json"),
                     indent=2, default=str))
