#!/usr/bin/env python3
"""ROOM READ — the uncopyable edge, made draft-day actionable.

We model all nine opponents from three seasons of their real picks (opponent_profiles.py):
position shares vs the field, and the round each takes a position, tagged hard/firm/loose by
its cross-season spread. That analysis is the edge nobody else in the league has — but until
now it was consumed only by a dev tool, invisible on draft day. This turns the STABLE tells
(hard/firm only; loose leans are noise and are dropped) into two things Cory can act on while
the clock runs:

  1. PER-OWNER counter-moves — for each reliable tell, what Cory does about it (jump the run,
     or let it pass and bank the value they ignore).
  2. ROOM-LEVEL run timing — the earliest reliable round each position starts leaving the
     board, so "the QB run is coming" is a number, not a vibe.

DISCIPLINE: only hard/firm reads (persistence-filtered by sd across >=2 seasons) become tells;
an owner tagged predictability 'thin'/'low' is surfaced as "plays market-average, no reliable
tell" rather than fitted into a personality. Local data (opponent_profiles.json); no egress.
This installs no board change — it is a reading aid; the pick math stays the needrule + market.
"""
from __future__ import annotations
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE / "backtest"))
import opponent_profiles as OP  # noqa: E402  reuse matchup_read / _signature

PROFILES = HERE / "backtest" / "opponent_profiles.json"
OUT_MD = HERE / "data" / "room_read.md"
OUT_JSON = HERE / "data" / "room_read.json"
ME = "coryjsimms"
ONESIE = ("QB", "TE")          # a single reliable owner here sets a run clock worth planning around
BELLCOW = ("RB", "WR")         # everyone takes these early — only a DEVIATION from the field tells
STREAM = ("K", "DEF")          # universal late — never a per-owner tell (kept in the room clock only)
DEVIATION_RD = 1.5             # rounds off the field norm before an RB/WR timing read is worth stating


def _onesie_move(pos: str, rd: float, conf: str) -> str:
    r = round(rd)
    return (f"{pos} run clock: reliably takes {pos} ~rd {r} ({conf}). Want the elite {pos}? pick "
            f"the round BEFORE rd {r}; else let their {pos} go and bank RB/WR while the room chases it.")


def _bellcow_move(pos: str, rd: float, conf: str, field_rd: float) -> str | None:
    """RB/WR timing only tells when it DEVIATES from the field — everyone takes them early, so the
    round itself is not a tell; taking one notably early or late is."""
    r, f = round(rd), round(field_rd)
    if rd <= field_rd - DEVIATION_RD:
        return f"takes {pos} EARLY (rd {r} vs field {f}, {conf}): competes for {pos} ahead of you — don't wait behind them."
    if rd >= field_rd + DEVIATION_RD:
        return f"WAITS on {pos} (rd {r} vs field {f}, {conf}): won't fight you early, but is {pos}-hungry later — that run comes from them."
    return None


def _lean_move(pos: str, lean: float) -> str:
    if lean >= 0.05:
        return f"{pos}-heavy (+{round(lean*100)}% vs field): they hoover {pos}; fade it against them."
    return f"light {pos} ({round(lean*100)}% vs field): they punt {pos} — it falls to you against them."


def _field_rounds(reads: list) -> dict:
    """Field mean round per position across every owner's reliable timing — the baseline an
    individual RB/WR round is judged against (deviation, not the raw round, is the tell)."""
    acc: dict = {}
    for r in reads:
        for pos, hr in (r.get("hard_reads") or {}).items():
            acc.setdefault(pos, []).append(hr["round"])
    return {pos: sum(v) / len(v) for pos, v in acc.items() if v}


def build(profiles: dict) -> dict:
    opponents = [o for o in profiles if o != ME]
    reads = OP.matchup_read(profiles, opponents)      # reuse the hard/firm distillation
    field = _field_rounds(reads)

    owners = []
    run_clock: dict = {}                              # pos -> [(round, owner, conf)] — ALL positions
    for r in reads:
        o = r["owner"]
        pred = r.get("predictability")
        tells = []
        if pred in ("high", "medium"):
            for pos, hr in sorted(r["hard_reads"].items(), key=lambda kv: kv[1]["round"]):
                # Every reliable read feeds the room-level run clock (incl. K/DEF: "wait till rd 12").
                run_clock.setdefault(pos, []).append((hr["round"], o, hr["confidence"]))
                # But a PER-OWNER tell must be discriminating: onesie run clocks and RB/WR
                # deviations only. K/DEF are universal-late — never a personal tell.
                move = None
                if pos in ONESIE:
                    move = _onesie_move(pos, hr["round"], hr["confidence"])
                elif pos in BELLCOW:
                    move = _bellcow_move(pos, hr["round"], hr["confidence"], field.get(pos, hr["round"]))
                if move:
                    tells.append({"position": pos, "round": hr["round"], "sd": hr["sd"],
                                  "confidence": hr["confidence"], "move": move})
        leans = [{"position": pos, "lean": v, "move": _lean_move(pos, v)}
                 for pos, v in sorted((r.get("leans") or {}).items(), key=lambda kv: -abs(kv[1]))
                 if pos not in STREAM]        # a K/DEF share lean is noise
        has_signal = bool(tells or leans)
        owners.append({
            "owner": o, "signature": r["signature"], "predictability": pred,
            "reliable": pred in ("high", "medium") and has_signal,
            "tells": tells, "leans": leans,
            "note": (None if (pred in ("high", "medium") and has_signal)
                     else "plays market-average across seasons — no discriminating tell to plan around"),
        })

    # ROOM-LEVEL: earliest reliable round each position starts leaving = the run clock.
    runs = {}
    for pos, entries in run_clock.items():
        entries.sort(key=lambda e: e[0])
        first_r, first_o, first_c = entries[0]
        runs[pos] = {"starts_round": round(first_r), "first_mover": first_o,
                     "confidence": first_c, "n_owners_reliable": len(entries),
                     "owners": [f"{o} rd{round(rd)}" for rd, o, _ in entries]}

    return {
        "experiment": "room read — stable opponent tells -> draft-day counter-moves",
        "n_opponents": len(opponents),
        "n_reliable": sum(1 for o in owners if o["reliable"]),
        "run_clock": dict(sorted(runs.items(), key=lambda kv: kv[1]["starts_round"])),
        "owners": owners,
        "caveat": ("Tells are hard/firm only (cross-season sd-filtered); owners tagged thin/low "
                   "predictability show no tell rather than a fitted one. 3 seasons — a hard read "
                   "is 3 consistent years, not a law. Reading aid; changes no pick math."),
        "source_tier": "league-primary (uncopyable — their own picks)",
    }


def render_md(rr: dict) -> str:
    L = ["# ROOM READ — who does what, and your move", "",
         "_Generated from three seasons of the room's real picks. Hard/firm tells only._", ""]
    L.append("## The run clock — when each position starts leaving")
    if rr["run_clock"]:
        for pos, r in rr["run_clock"].items():
            L.append(f"- **{pos}**: starts ~round {r['starts_round']} "
                     f"({r['first_mover']}, {r['confidence']}) · {r['n_owners_reliable']} owner(s) reliable "
                     f"— {', '.join(r['owners'])}")
    else:
        L.append("- _no position has a reliable cross-owner run clock in the sample._")
    L.append("")
    L.append(f"## The nine — {rr['n_reliable']} of {rr['n_opponents']} have a tell you can plan around")
    for o in rr["owners"]:
        L.append(f"### {o['owner']} — {o['signature']} _(predictability: {o['predictability']})_")
        if not o["reliable"]:
            L.append(f"- {o['note']}")
        for t in o["tells"]:
            L.append(f"- {t['move']}")
        for ln in o["leans"]:
            L.append(f"- {ln['move']}")
        L.append("")
    L.append("> " + rr["caveat"])
    return "\n".join(L)


def main():   # pragma: no cover  (I/O)
    profiles = json.loads(PROFILES.read_text()).get("profiles", {})
    rr = build(profiles)
    OUT_JSON.write_text(json.dumps(rr, indent=1))
    OUT_MD.write_text(render_md(rr))
    print(f"room read: {rr['n_reliable']}/{rr['n_opponents']} opponents with a reliable tell; "
          f"run clock covers {len(rr['run_clock'])} position(s) -> {OUT_MD}")


if __name__ == "__main__":
    main()
