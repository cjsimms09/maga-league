#!/usr/bin/env python3
# TERRITORY: relay (spec + audit); the engine integration is A's.
"""ROSTER GRAMMAR — the rules of the FORMAT, as hard legality, not weights.

Cory, 2026-09-02: "it was doing things like drafting 4 TEs.. that shows a real
lack of football knowledge and fantasy football knowledge." He is right about
the class, and the shipped record shows it in every seat (audit below): on
draft night the tool recommended a kicker TWICE at his seat and two QBs in a
one-QB league, RBs at 10 of 12 picks at seat 10, and never a K or DEF at all
in nine seats; in the 2023-25 replay it drafted SEVEN quarterbacks in one seat
and nine wide receivers in another. The engine's own comment already says why:
"roster-awareness has to be a CONSTRAINT, not a weight — a weighted term
competes with VONA and loses, a constraint cannot" (engine.js ~350). The hard
caps that existed were deleted on 08-14 because they were implemented wrong
(a flex-starting TE counted against the spare); nothing structural replaced
them, and `need` at 1.0 "contributes essentially nothing" (register 323).

THIS FILE IS THAT CONSTRAINT, DERIVED FROM THE LEAGUE CONFIG (starters + bench
+ rounds), with nothing to tune. It is the fantasy-football knowledge a human
brings to any draft, written down once:

  G1  FILL FIRST      no second body at a onesie position (QB/TE) while any
                      skill starting slot (QB, RB×2, WR×2, TE, FLEX) is empty
  G2  ONESIE CAP      QB ≤ 2, TE ≤ 2, K ≤ 1, DEF ≤ 1 — a third cannot start
  G3  DEPTH CAP       RB ≤ starters+FLEX+4, WR the same, RB+WR ≤ rounds − 4
                      (a QB, a TE, a K and a DEF have to fit)
  G4  K/DEF TIMING    K and DEF only in the last 3 picks, and only once every
                      other starting slot has a body — the wire supplies them
                      (DEF 100% of pool cycled, K 83%; draft_plan.js)
  G5  COMPLETE        the finished roster has a body in EVERY starting slot

The audit scores three populations with the same rules and prints the count
that answers Cory: violations per seat for (a) the tool's actual 2026 draft-
night recommendations, followed literally; (b) the ten humans' actual 2026
rosters; (c) the engine's 30 replay seats 2023-25. Humans are the baseline —
a grammar the humans violate is a grammar that is wrong, not a finding.

Run: python3 draft/tools/roster_grammar.py
Writes draft/data/roster_grammar.json (the rules, for the engine to read —
one derivation) and draft/audit/roster_grammar_audit_<date>.json.
"""
from __future__ import annotations

import collections
import datetime as _dt
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SKILL = ("QB", "RB", "WR", "TE")
FLEX_ELIGIBLE = ("RB", "WR", "TE")
ONESIE_SPARE = {"QB": 1, "TE": 1, "K": 0, "DEF": 0}


def grammar_from_league(league: dict) -> dict:
    st = dict(league.get("starters") or {})
    slots = dict(league.get("roster_slots") or {})
    rounds = int(league.get("rounds") or sum(slots.values()) or 15)
    flex = int(st.get("FLEX") or 0)
    depth_cap = {}
    for pos in ("RB", "WR"):
        depth_cap[pos] = int(st.get(pos, 0)) + flex + 4
    onesie_cap = {pos: int(st.get(pos, 0)) + ONESIE_SPARE[pos] for pos in ONESIE_SPARE if st.get(pos)}
    return {
        "_what": "Roster grammar derived from league.starters/roster_slots — hard legality for recommendations (roster_grammar.py)",
        "starters": st, "rounds": rounds, "flex": flex,
        "onesie_cap": onesie_cap,
        "depth_cap": depth_cap,
        "rb_wr_total_cap": rounds - sum(1 for p in ("QB", "TE", "K", "DEF") if st.get(p)),
        "kdef_last_picks": 3,
        "rules": ["G1 fill first", "G2 onesie cap", "G3 depth cap", "G4 K/DEF timing", "G5 complete roster (K required — Cory 09-02: nobody else can start in that spot; take him last)"],
    }


def _open_skill_slots(counts: collections.Counter, st: dict) -> int:
    """Skill starting slots still without a body, counting FLEX as fillable by
    any surplus RB/WR/TE."""
    open_ = 0
    surplus = 0
    for pos in SKILL:
        need = int(st.get(pos, 0))
        have = counts.get(pos, 0)
        open_ += max(0, need - have)
        if pos in FLEX_ELIGIBLE:
            surplus += max(0, have - need)
    flex_open = max(0, int(st.get("FLEX", 0)) - surplus)
    return open_ + flex_open


def check_pick(counts: collections.Counter, pos: str, picks_left_after: int, g: dict) -> list:
    """Violations a pick of `pos` would commit given the roster so far
    (`counts`) and how many picks remain AFTER this one."""
    st = g["starters"]
    v = []
    have = counts.get(pos, 0)
    if pos in ("QB", "TE") and have >= int(st.get(pos, 0)) and _open_skill_slots(counts, st) > 0:
        v.append(f"G1 {pos}{have + 1} while {_open_skill_slots(counts, st)} skill starting slot(s) empty")
    cap = g["onesie_cap"].get(pos)
    if cap is not None and have + 1 > cap:
        v.append(f"G2 {pos}{have + 1} > cap {cap}")
    if pos in g["depth_cap"] and have + 1 > g["depth_cap"][pos]:
        v.append(f"G3 {pos}{have + 1} > depth cap {g['depth_cap'][pos]}")
    if pos in ("RB", "WR") and counts.get("RB", 0) + counts.get("WR", 0) + 1 > g["rb_wr_total_cap"]:
        v.append(f"G3 RB+WR {counts.get('RB', 0) + counts.get('WR', 0) + 1} > {g['rb_wr_total_cap']}")
    if pos in ("K", "DEF"):
        others_open = sum(max(0, int(st.get(p, 0)) - counts.get(p, 0)) for p in SKILL) \
            + max(0, int(st.get("FLEX", 0)) - sum(max(0, counts.get(p, 0) - int(st.get(p, 0))) for p in FLEX_ELIGIBLE)) \
            + (0 if pos == "K" else max(0, int(st.get("K", 0)) - counts.get("K", 0))) \
            + (0 if pos == "DEF" else max(0, int(st.get("DEF", 0)) - counts.get("DEF", 0)))
        if picks_left_after >= g["kdef_last_picks"]:
            v.append(f"G4 {pos} with {picks_left_after} picks still to come")
        elif others_open > 0 and picks_left_after < others_open:
            v.append(f"G4 {pos} with {others_open} starting slot(s) still empty and only {picks_left_after} pick(s) left")
    return v


def check_sequence(positions: list, g: dict, total_picks: int | None = None) -> dict:
    """Walk a pick sequence (positions in draft order, keepers included as
    already-held bodies when passed first). Returns violations per pick and
    the G5 verdict on the finished roster."""
    total = total_picks or len(positions)
    counts: collections.Counter = collections.Counter()
    out = []
    for i, pos in enumerate(positions):
        left_after = total - (i + 1)
        v = check_pick(counts, pos, left_after, g)
        if v:
            out.append({"pick_index": i + 1, "pos": pos, "violations": v})
        counts[pos] += 1
    st = g["starters"]
    # THE KICKER, RULED TWICE ON 09-02 AND THE SECOND WORD WINS — Cory: "you
    # can't start anyone else in a kicker spot so not having one is not smart..
    # but it's probably right to wait til dead last pick as replacement value
    # is null." So: a roster with no K IS incomplete (G5 counts him), and a K
    # taken before the last picks is a waste (G4). The value function earns
    # this by pricing an empty required slot at the end of the draft, not by
    # a cap — see mlv_grammar_probe.js arm mlv_bench_complete.
    missing = [p for p in ("QB", "RB", "WR", "TE", "K", "DEF") if counts.get(p, 0) < int(st.get(p, 0))]
    g5 = [f"G5 no body for {p}" for p in missing]
    return {"shape": dict(counts), "pick_violations": out,
            "n_violations": sum(len(x["violations"]) for x in out) + len(g5),
            "g5": g5}


# ── audit over the three populations ─────────────────────────────────────────

def _board():
    return json.loads((ROOT / "public" / "draft_data.json").read_text())


def _positions_index(board):
    idx = {}
    for p in board.get("players", []) + board.get("kept_players", []):
        idx[str(p.get("player_id"))] = p.get("position")
        idx[(p.get("name") or "").lower()] = p.get("position")
    return idx


def _pos_of(x, idx):
    if isinstance(x, dict):
        return x.get("position") or x.get("pos") or idx.get(str(x.get("player_id"))) or idx.get((x.get("name") or "").lower())
    if x is None:
        return None
    return idx.get(str(x)) or idx.get(str(x).lower())


def audit_2026_shadow(g, idx):
    rows = [json.loads(l) for l in (ROOT / "draft" / "data" / "draft_shadow_2026.jsonl").read_text().splitlines() if l.strip()]
    by_seat = collections.defaultdict(list)
    for r in sorted(rows, key=lambda r: r["pick_no"]):
        by_seat[r["seat"]].append(r)
    tool, human = {}, {}
    for seat, rs in sorted(by_seat.items()):
        keepers = [_pos_of(r.get("actual_player"), idx) for r in rs if r.get("is_keeper")]
        tool_seq = keepers + [_pos_of(r.get("tool_recommendation"), idx) for r in rs if not r.get("is_keeper")]
        human_seq = [_pos_of(r.get("actual_player"), idx) for r in rs]
        tool_seq = [p for p in tool_seq if p]
        human_seq = [p for p in human_seq if p]
        tool[str(seat)] = check_sequence(tool_seq, g, total_picks=len(rs))
        tool[str(seat)]["keepers_held"] = len(keepers)
        human[str(seat)] = check_sequence(human_seq, g, total_picks=len(rs))
    return tool, human


def audit_replay(g):
    d = json.loads((ROOT / "draft" / "data" / "engine_seat_replay.json").read_text())
    out = {}
    for yr, yv in d["years"].items():
        seats = yv["seats"].values() if isinstance(yv["seats"], dict) else yv["seats"]
        for s in seats:
            if not isinstance(s, dict) or "engine_roster" not in s:
                continue
            seq = [x.get("pos") or x.get("position") for x in s["engine_roster"] if isinstance(x, dict)]
            out[f"{yr}:{s.get('owner')}"] = check_sequence([p for p in seq if p], g)
    return out


def summarize(pop: dict) -> dict:
    n = len(pop)
    tot = sum(v["n_violations"] for v in pop.values())
    seats_clean = sum(1 for v in pop.values() if v["n_violations"] == 0)
    by_rule = collections.Counter()
    for v in pop.values():
        for pv in v["pick_violations"]:
            for s in pv["violations"]:
                by_rule[s.split()[0]] += 1
        for s in v["g5"]:
            by_rule["G5"] += 1
    return {"seats": n, "violations_total": tot, "violations_per_seat": round(tot / n, 2) if n else None,
            "seats_clean": seats_clean, "by_rule": dict(by_rule)}


def main() -> int:
    board = _board()
    league = dict(board["league"])
    league.setdefault("rounds", 15)
    g = grammar_from_league(league)
    (ROOT / "draft" / "data" / "roster_grammar.json").write_text(json.dumps(g, indent=1))
    idx = _positions_index(board)
    tool, human = audit_2026_shadow(g, idx)
    replay = audit_replay(g)
    # CONTROLS (Rule 3e): the grammar must fire on a known pileup and stay quiet on a clean draft
    seven_qb = check_sequence(["QB"] * 7 + ["RB", "RB", "WR", "WR", "TE", "K", "DEF"], g)
    clean = check_sequence(["RB", "WR", "RB", "WR", "TE", "QB", "RB", "WR", "WR", "RB", "QB", "TE", "WR", "K", "DEF"], g)
    controls = {"C1_seven_qb_seat_fires": seven_qb["n_violations"] > 0,
                "C2_clean_15_pick_draft_is_silent": clean["n_violations"] == 0}
    doc = {
        "_territory": "relay audit — roster_grammar.py; engine integration is A's (ROUTES 09-02)",
        "_question": "Cory 09-02: 'drafting 4 TEs shows a real lack of fantasy football knowledge' — how often does the tool break the format's grammar, vs the humans?",
        "generated_at": _dt.datetime.now(_dt.timezone.utc).isoformat(timespec="seconds"),
        "grammar": g, "controls": controls,
        "summary": {"tool_recs_2026_followed_literally": summarize(tool),
                    "humans_2026_actual": summarize(human),
                    "engine_replay_2023_25": summarize(replay)},
        "tool_recs_2026": tool, "humans_2026": human, "engine_replay": replay,
        "_note_replay_order": "engine_roster lists are read in stored order as pick order; G1/G4 timing on the replay is therefore approximate, G2/G3/G5 are order-free and exact",
    }
    out = ROOT / "draft" / "audit" / f"roster_grammar_audit_{_dt.date.today().isoformat()}.json"
    out.write_text(json.dumps(doc, indent=1))
    print("ROSTER GRAMMAR AUDIT —", doc["generated_at"])
    print(" controls:", controls)
    for k, v in doc["summary"].items():
        print(f"  {k:34} {v}")
    print(" tool recs 2026, per seat:")
    for seat, v in tool.items():
        print(f"   seat {seat:>2} shape={v['shape']} violations={v['n_violations']} g5={v['g5']}")
    print(f" wrote {out.relative_to(ROOT)}")
    return 0 if all(controls.values()) else 1


if __name__ == "__main__":
    raise SystemExit(main())
