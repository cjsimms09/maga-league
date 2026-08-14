# TERRITORY: A
"""HOW MUCH DOES OUR SCORING DISAGREE WITH THE MARKET THAT PRICES OUR BOARD?

Found 2026-08-14. Two facts that had never been put next to each other:

    our league scores   pass_td 6, pass_int -2   (league_config)
    our ADP comes from  scoring=HALF             (FantasyPros consensus, and
                        FFC's half-ppr) — a 4-point passing TD, -1 INT market

So `proj_mean` knows a quarterback is worth more here, and every quantity
anchored to ADP does not: survival, VONA, the LRM deadlines, run detection.

THIS IS A CANDIDATE MECHANISM FOR A THING WE ALREADY MEASURED. The room takes
quarterbacks earlier than market at every slot, 18 of 18 observations, and that
has been carried as an unexplained quirk with "no correction is fitted — three
drafts give a direction, not a magnitude". A 4-point-TD ADP in a 6-point-TD
league predicts exactly that deviation from first principles.

── WHY THIS IS A MEASUREMENT AND NOT A CORRECTION ────────────────────────────

It fits nothing and changes no price. It answers one question in points: for each
position, how far apart are the two scorings on the SAME projected stat lines?
That number is what a decision to correct (or not) should be made from, and it
did not exist.

── WHY IT LIVES IN THE BUILD ─────────────────────────────────────────────────

It needs RAW STAT LINES. The artifact carries only already-scored points
(`proj_baseline`, `proj_mean`), so the difference between two scorings is not
recoverable from a shipped board — I tried. The raw payload exists exactly once,
inside `load_players`, which is why this is called from there.

A RANK-BASED PROXY WOULD HAVE BEEN CONFOUNDED and is deliberately not used:
quarterbacks go later than their raw points in EVERY league, because one starts
where two or three running backs do. That is replacement-level economics, not
scoring, and it would have produced a large QB number in a league with no
scoring difference at all.

Run: imported by build.py; `python draft/backtest/lab_scoring_gap.py` self-tests.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scoring import score_stat_line  # noqa: E402

#: The scoring the ADP feed is priced in. Half-PPR consensus is the market's
#: standard: 4-point passing TD, -1 interception. Everything else matches ours
#: (0.5 PPR, 6-point rushing/receiving TDs, 0.1/yd), which is WHY the gap is a
#: quarterback story and not a board-wide one — the checks below assert that
#: rather than assuming it.
MARKET_OVERRIDES = {"pass_td": 4, "pass_int": -1}


def market_scoring(scoring: dict) -> dict:
    """Our scoring table with the market's passing terms substituted in."""
    out = dict(scoring or {})
    for k, v in MARKET_OVERRIDES.items():
        if k in out:
            out[k] = v
    return out


def measure(raw_projections: dict, scoring: dict, players: list) -> dict:
    """Per-position points gap between our scoring and the ADP feed's.

    `raw_projections` is the provider payload — {pid: stat_line} or
    {pid: {"stats": ...}} — the same shape `baseline_from_projections` consumes.
    """
    if not raw_projections:
        return {"measured": False,
                "why": "no raw projection payload — the gap is NOT recoverable from "
                       "a built board, which carries only already-scored points"}

    pos_of = {str(p.get("player_id")): p.get("position") for p in (players or [])}
    mkt = market_scoring(scoring)
    by_pos: dict[str, list[float]] = {}
    ours_by_pos: dict[str, list[float]] = {}
    scored = 0
    for pid, line in raw_projections.items():
        stats = line.get("stats") if isinstance(line, dict) and "stats" in line else line
        if not isinstance(stats, dict):
            continue
        pos = pos_of.get(str(pid))
        if not pos:
            continue
        ours = score_stat_line(stats, scoring)
        theirs = score_stat_line(stats, mkt)
        by_pos.setdefault(pos, []).append(ours - theirs)
        ours_by_pos.setdefault(pos, []).append(ours)
        scored += 1

    if not scored:
        return {"measured": False,
                "why": "payload present but no stat line joined a board player"}

    def mean(xs):
        return round(sum(xs) / len(xs), 2) if xs else None

    positions = {
        pos: {
            "n": len(deltas),
            "mean_gap_points": mean(deltas),
            "max_gap_points": round(max(deltas), 2),
            "mean_ours": mean(ours_by_pos.get(pos, [])),
            # The share of a player's value that exists ONLY in our scoring.
            "gap_share_of_value": (
                round(mean(deltas) / mean(ours_by_pos[pos]), 4)
                if ours_by_pos.get(pos) and mean(ours_by_pos[pos]) else None),
        }
        for pos, deltas in sorted(by_pos.items())
    }

    # THE STARTERS ARE THE COMPARISON THAT MATTERS. A gap averaged over 60
    # quarterbacks includes 40 nobody drafts; the ones being priced are the top
    # dozen, and their gap is the one that moves a pick.
    qb = sorted(zip(ours_by_pos.get("QB", []), by_pos.get("QB", [])),
                key=lambda t: -t[0])[:12]
    starters = {
        "n": len(qb),
        "mean_gap_points": mean([g for _, g in qb]),
        "mean_ours": mean([o for o, _ in qb]),
    } if qb else None

    return {
        "measured": True,
        "players_scored": scored,
        "market_overrides": MARKET_OVERRIDES,
        "positions": positions,
        "top12_qb": starters,
        "what_this_is": (
            "points our scoring adds to the SAME projected stat line versus the "
            "scoring our ADP feed is priced in. A measurement, not a correction: "
            "nothing here changes a price."),
        "what_this_is_not": (
            "evidence that ADP is wrong. It is evidence that ADP answers a "
            "different question than our projections do, at one position."),
    }


# ── SELF-TEST ────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    SC = {"pass_td": 6, "pass_int": -2, "pass_yd": 0.04,
          "rush_td": 6, "rush_yd": 0.1, "rec": 0.5, "rec_td": 6, "rec_yd": 0.1}
    # A QB with 30 passing TDs and 10 INTs; an RB with none of either.
    raw = {"q1": {"pass_td": 30, "pass_int": 10, "pass_yd": 4500},
           "r1": {"rush_td": 12, "rush_yd": 1200, "rec": 40, "rec_yd": 300}}
    players = [{"player_id": "q1", "position": "QB"},
               {"player_id": "r1", "position": "RB"}]
    out = measure(raw, SC, players)
    qb_gap = out["positions"]["QB"]["mean_gap_points"]
    rb_gap = out["positions"]["RB"]["mean_gap_points"]
    # 30 TDs x 2 extra = +60; 10 INTs x 1 extra penalty = -10. Net +50.
    assert qb_gap == 50.0, f"expected +50 for the QB, got {qb_gap}"
    assert rb_gap == 0.0, f"the gap must be ZERO off the passing stats, got {rb_gap}"
    assert measure({}, SC, players)["measured"] is False
    assert measure(raw, SC, [])["measured"] is False
    print("lab_scoring_gap self-test OK")
    print(f"  worked example: a 30-TD / 10-INT quarterback is worth {qb_gap:+.0f} "
          f"points more in our scoring than in the market that prices our board.")
    print("  A running back with no passing stats: "
          f"{rb_gap:+.0f} — the gap is structural to the position, not board-wide.")
