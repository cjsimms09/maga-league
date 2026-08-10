#!/usr/bin/env python3
"""OPPONENT TENDENCY PROFILES — the room edge. What each of the nine does at the table.

The keeper-need rule and the market read tell us WHAT to draft; this tells us who
picks between our turns and what they'll do — the asymmetry no general tool has and no
competitor can copy (SESSION-A.md core directive). Built from OUR league's actual
drafts: every non-keeper pick by every owner, 2023-25.

Per owner, from the pick data:
  * position_share  — how their roster leans (RB-heavy? WR-heavy?)
  * first_round_by_position — the mean round they take their FIRST at each position
    (QB first-round 9 = waits on QB; RB first-round 2 = RB early)
  * early_lean — what they spend rounds 1-3 on (their opening signature)
  * onesie_timing — when QB/TE/K/DEF come off their board (early vs streamed late)
  * seasons — cross-season consistency (a one-year quirk is not a tendency)

REACH tendency (do they reach vs wait vs ADP) needs ADP joined per pick — that rides
exp36_picks.json (has adp+owner) in CI; the timing/lean/share here are ADP-free and
run LOCALLY on league_history + draft_data. Feeds the survival/room model (per-seat,
not generic) and the war-room "who's up between my picks, what they need, what they do."

Pure core unit-tested in draft/tests/test_opponent_profiles.py; the local runner joins
league_history.json + public/draft_data.json (no egress). No install — intel surface.
"""
from __future__ import annotations
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
POSITIONS = ("QB", "RB", "WR", "TE", "K", "DEF")
ONESIES = ("QB", "TE", "K", "DEF")
EARLY_ROUNDS = 3


def _mean(xs):
    return round(sum(xs) / len(xs), 2) if xs else None


def _sd(xs):
    """Population SD across seasons — the SPREAD of a timing tendency. None if <2 samples
    (a one-season 'tendency' has no measurable consistency and must not masquerade as one)."""
    if not xs or len(xs) < 2:
        return None
    m = sum(xs) / len(xs)
    return round((sum((x - m) ** 2 for x in xs) / len(xs)) ** 0.5, 2)


def _timing_confidence(sd, n_seasons):
    """Turn a mean+spread into an actionable tag. A round-9-QB with sd 0.5 across 3 seasons is
    a HARD rule you can plan around; the same mean with sd 4 is a loose lean; <2 seasons is thin."""
    if n_seasons < 2 or sd is None:
        return "thin"                # one season — a data point, not a pattern
    if sd <= 1.0:
        return "hard"                # takes it in essentially the same round every year
    if sd <= 2.5:
        return "firm"
    return "loose"                   # ranges widely — the mean is nearly meaningless


def build_profiles(rows):
    """rows: [{season, owner, pick_no, round, position, is_keeper}]. Non-keeper picks
    are the decisions. Returns {owner: profile}."""
    decisions = [r for r in rows if not r.get("is_keeper") and r.get("owner") and r.get("position")]
    owners = sorted({r["owner"] for r in decisions})
    field_share = _position_share(decisions)
    out = {}
    for o in owners:
        mine = [r for r in decisions if r["owner"] == o]
        # first pick at each position per (owner, season): mean AND spread across seasons.
        # The spread is the "push further" Cory asked for — a mean round is only actionable
        # if you know whether it's a hard rule or a wide range.
        first_round, timing = {}, {}
        for pos in POSITIONS:
            firsts = []
            for s in {r["season"] for r in mine}:
                at = [r for r in mine if r["position"] == pos and r["season"] == s]
                if at:
                    firsts.append(min(r["round"] for r in at))
            if firsts:
                sd = _sd(firsts)
                first_round[pos] = _mean(firsts)
                timing[pos] = {"mean": _mean(firsts), "sd": sd, "n_seasons": len(firsts),
                               "confidence": _timing_confidence(sd, len(firsts))}
        early = [r["position"] for r in mine if (r.get("round") or 99) <= EARLY_ROUNDS]
        early_lean = _position_share([{"position": p} for p in early]) if early else {}
        share = _position_share(mine)
        out[o] = {
            "n_decisions": len(mine),
            "seasons": sorted({r["season"] for r in mine}),
            "position_share": share,
            "position_share_vs_field": {p: round((share.get(p, 0) - field_share.get(p, 0)), 3)
                                        for p in POSITIONS},
            "first_round_by_position": first_round,
            "timing_by_position": timing,              # {pos: {mean, sd, n_seasons, confidence}}
            "early_lean": early_lean,
            "onesie_timing": {p: first_round.get(p) for p in ONESIES},
            "predictability": _predictability(len(mine), timing),
        }
    return out


def _predictability(n_decisions, timing):
    """How much to TRUST this owner's reads overall: enough picks + tight timing = plan around
    them; thin sample or wide spreads = treat as league-average. Guards a thin sample from
    masquerading as a personality (the shrinkage discipline, stated as a tag)."""
    # count consistency in SKILL positions only — everyone streams K/DEF late, so onesie-late
    # consistency is universal and doesn't discriminate one owner from another.
    skill = ("QB", "RB", "WR", "TE")
    hard = sum(1 for pos, t in timing.items()
               if pos in skill and t["confidence"] in ("hard", "firm"))
    if n_decisions < 12:
        return "thin"                 # <~4 picks/season — pulled toward league average
    if hard >= 3:
        return "high"                 # several SKILL positions taken in a consistent round each year
    if hard >= 1:
        return "medium"
    return "low"                      # skill picks vary too much year to year to plan around


def _position_share(rows):
    n = len(rows) or 1
    c = {}
    for r in rows:
        c[r["position"]] = c.get(r["position"], 0) + 1
    return {p: round(c.get(p, 0) / n, 3) for p in POSITIONS if c.get(p)}


def _signature(prof):
    """A one-line behavioral tag for the draft table."""
    fr = prof.get("first_round_by_position") or {}
    tags = []
    if fr.get("RB") is not None and fr["RB"] <= 2.5:
        tags.append("RB-early")
    if fr.get("WR") is not None and fr["WR"] <= 2.5:
        tags.append("WR-early")
    if fr.get("QB") is not None:
        tags.append("QB-early" if fr["QB"] <= 5 else "QB-late")
    if fr.get("TE") is not None and fr["TE"] <= 5:
        tags.append("elite-TE")
    vs = prof.get("position_share_vs_field") or {}
    heavy = max(vs.items(), key=lambda kv: kv[1]) if vs else None
    if heavy and heavy[1] >= 0.05:
        tags.append(heavy[0] + "-heavy")
    return ", ".join(tags) or "market-balanced"


def matchup_read(profiles, upcoming_owners):
    """For the war room: the owners picking before my next turn, each with what they do — now
    with the SPREAD, so a read is labelled hard/firm/loose, not just a bare mean. `hard_reads`
    are the positions this owner takes in a consistent round every year (plan around them);
    `predictability` says how much to trust the whole profile."""
    out = []
    for o in upcoming_owners:
        if o not in profiles:
            continue
        p = profiles[o]
        timing = p.get("timing_by_position") or {}
        hard_reads = {pos: {"round": t["mean"], "sd": t["sd"], "confidence": t["confidence"]}
                      for pos, t in timing.items() if t.get("confidence") in ("hard", "firm")}
        out.append({
            "owner": o, "signature": _signature(p),
            "predictability": p.get("predictability"),
            "qb_first_round": (p.get("onesie_timing") or {}).get("QB"),
            "hard_reads": hard_reads,     # positions they take in the same round yearly
            "leans": {pos: v for pos, v in (p.get("position_share_vs_field") or {}).items()
                      if abs(v) >= 0.05},
        })
    return out


def _load_local_rows():   # pragma: no cover  (I/O)
    hist = json.loads((HERE.parent / "data" / "league_history.json").read_text())
    board = json.loads((HERE.parent.parent / "public" / "draft_data.json").read_text())
    pos_by_id = {str(p["player_id"]): p.get("position")
                 for p in (board.get("players") or []) if p.get("player_id")}
    rows = []
    for s in hist.get("seasons") or []:
        owners = s.get("owners") or {}
        yr = s.get("season")
        for dr in (s.get("drafts") or []):
            for p in (dr.get("picks") or []):
                rid = p.get("roster_id")
                rows.append({"season": yr, "pick_no": p.get("pick_no"), "round": p.get("round"),
                             "position": pos_by_id.get(str(p.get("player_id"))),
                             "is_keeper": bool(p.get("is_keeper")),
                             "owner": (owners.get(str(rid)) or {}).get("display_name") if rid is not None else None})
    return rows


def run():   # pragma: no cover
    rows = _load_local_rows()
    profiles = build_profiles(rows)
    matched = sum(1 for r in rows if r.get("position"))
    return {"experiment": "opponent tendency profiles (local: league_history + draft_data, no egress)",
            "n_picks": len(rows), "n_position_matched": matched,
            "profiles": profiles,
            "caveat": ("timing/lean/share only (ADP-free); REACH tendency + which-board-they-draft-from "
                       "ride exp36_picks.json (adp+owner) in CI. 3 seasons — a lean <0.05 vs field or a "
                       "single-season pattern is noise, not a tendency. Feeds the survival/room model "
                       "per-seat + the war-room matchup read. No install."),
            "source_tier": "league-primary"}


if __name__ == "__main__":   # pragma: no cover
    out = run()
    (HERE / "opponent_profiles.json").write_text(json.dumps(out, indent=2))
    print(json.dumps({"n_picks": out["n_picks"], "matched": out["n_position_matched"],
                      "owners": {o: _signature(p) for o, p in out["profiles"].items()}}, indent=2))
