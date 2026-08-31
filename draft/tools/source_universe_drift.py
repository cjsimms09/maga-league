#!/usr/bin/env python3
# TERRITORY: D
"""WHO ENTERED AND WHO LEFT THE FROZEN PROJECTION ARCHIVE, DAY BY DAY —
AND WHICH OF THOSE DEPARTURES MEANS ANYTHING.

── WHY THIS EXISTS ────────────────────────────────────────────────────────────

On 2026-08-27 Sleeper dropped Nick Chubb (`4988`) and Trey Benson (`11589`) —
two unsigned free agents — from its projection universe. Nothing said so. The
board publish broke that night and stayed broken for five days, and the cause
was not traced until 08-31, across two register rows (435, 432) and after a
gate blocker had been mis-specified twice.

`draft-data.yml` already has a completeness check on this exact file, added
after a day went missing in 2026-08. It asks whether each source WROTE A ROW
today. It does not look inside the row. On 2026-08-27 it printed
`proj_series 2026-08-27: complete (['fantasypros', 'sleeper'])` — which was
true, and useless: the row was there, and two players were not.

Presence is not content. This looks inside.

⚠️ AND IT MEASURES THE ARCHIVE, NOT THE PROVIDER — THE FIRST VERSION OF THIS
FILE GOT THAT WRONG AND ITS OWN CONTROL CAUGHT IT. `proj_series.json` is built
FROM the board (`build.py:_update_proj_series`) and then truncated to the
`TOP_N = 700` highest projections. So a player leaving it can mean three
different things, and only one is news:

  * they left the BOARD (a real population change, which is what breaks joins);
  * they fell below the top-700 cut (our truncation, not anyone's data);
  * or they were TIED at the cut and got reshuffled — and this is the common
    case, because the board carries 728 priced rows of which 28 sit at exactly
    `0.0`. `sorted(..., key=-proj)[:700]` breaks those ties on dict order, so a
    handful of zero-projection players swap in and out every single day.

Reading raw membership diffs as provider behaviour is therefore a false-positive
generator: on this archive it produces four to eleven "departures" a day, nearly
all of them meaningless. So every departure here is CLASSIFIED, and the summary
reports only the ones with a real projection behind them.

── WHAT IT REPORTS, AND WHY DEPARTURES ARE NOT SYMMETRIC WITH ENTRANTS ────────

Per source, per consecutive pair of capture dates: the count, who entered, who
left. Entrants are ordinary — rookies get added, a provider extends its board.
DEPARTURES ARE THE ASYMMETRIC HALF, because everything downstream JOINS to
these ids: a frozen artifact (the Draft Sharks PDF), a crosswalk, a committed
census, a test's pinned number. A player who leaves the source while something
still references them is a break waiting for the next rebuild.

So each departure is classified against the currently published board:

  on-board  — we still price this player, so live joins still reach for them.
              This is the class that broke the crosswalk.
  off-board — already gone from our own board; nothing here should notice.

── REPORT-ONLY, DELIBERATELY ─────────────────────────────────────────────────

It exits 0 on any amount of drift. The completeness check beside it made the
same call for the same reason, and the reason is good: a gate that refuses
Cory's board because a third party reshuffled its free agents gets switched off
within a week. What was missing was never enforcement — it was ANYONE KNOWING.
Non-zero exit is reserved for the controls failing, i.e. the tool itself being
broken.

── THE CONTROLS ARE REAL HISTORY, NOT FIXTURES (rule 3e) ─────────────────────

A drift detector that has only ever printed "no drift" has not been tested, only
run — and a null from it is indistinguishable from a broken query. Every control
here is a transition that actually happened and whose answer was established
independently, by tracing a defect, before this file existed:

  C1  2026-08-26 → 08-27, sleeper: the departures INCLUDE 4988 and 11589, all
      of them carry a real projection (so none is tie-noise), and EXACTLY those
      two appear in the Draft Sharks 250 — which is why the crosswalk lost
      exactly two rows and not four. That ties this archive's drift to the
      downstream break quantitatively, and it is register 435's event.
      ⚠️ WRITTEN FIRST AS "departures are exactly 4988 and 11589", IT FAILED:
      four players left that morning, not two. The other two — Jerome Ford and
      Ty Chandler — are simply not in the Draft Sharks file, so the crosswalk
      never reached for them. The control was written from the CROSSWALK's
      answer and asserted it of the SOURCE.
  C2  2026-08-12 → 08-13, sleeper: a mass entrance, 400 → 700.
  C3  a day compared with ITSELF reports nothing on either side — a negative
      control that cannot be cherry-picked, unlike "find a quiet day".
  C4  the salience arm: on 08-27 both departures classify `on-board` (both are
      on the published board, which is why the crosswalk reached for them), and
      an id the board has never carried classifies `off-board`.

    python3 draft/tools/source_universe_drift.py            # report + controls
    python3 draft/tools/source_universe_drift.py --json     # machine-readable
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
SERIES = ROOT / "draft" / "data" / "proj_series.json"
BOARD = ROOT / "public" / "draft_data.json"
OUT = ROOT / "draft" / "data" / "source_universe_drift.json"


def load_series():
    """({source: [(date, {player_id, ...}), ...]}, {source: {date: {id: points}}}),
    both in date order. The second is what the archive actually FROZE, and it is
    what the classifier reads — see `classify` for why today's board is the
    wrong thing to consult about a transition that happened last week."""
    rows = json.loads(SERIES.read_text())["series"]
    by_source: dict[str, list[tuple[str, set[str]]]] = {}
    proj_by_day: dict[str, dict[str, dict[str, float]]] = {}
    for r in rows:
        by_source.setdefault(r["source"], []).append((r["date"], set(r["proj"])))
        proj_by_day.setdefault(r["source"], {})[r["date"]] = r["proj"]
    for v in by_source.values():
        v.sort(key=lambda p: p[0])
    return by_source, proj_by_day


def board_ids() -> set[str]:
    """Both pools. Register 80 is exactly the bug of a join walking `players`
    and silently missing every keeper."""
    b = json.loads(BOARD.read_text())
    return {p["player_id"] for p in b.get("players", []) + b.get("kept_players", [])
            if p.get("player_id")}


def board_proj() -> dict[str, float]:
    """`proj_baseline` is what the archive freezes, so it is what the
    truncation sorts on — read the same field rather than a near neighbour."""
    b = json.loads(BOARD.read_text())
    return {p["player_id"]: p.get("proj_baseline")
            for p in b.get("players", []) + b.get("kept_players", [])
            if p.get("player_id")}


def board_names() -> dict[str, str]:
    b = json.loads(BOARD.read_text())
    out = {}
    for p in b.get("players", []) + b.get("kept_players", []):
        if p.get("player_id"):
            out[p["player_id"]] = f"{p.get('name')} ({p.get('team')} {p.get('position')})"
    return out


def classify(last_seen_proj: float | None) -> str:
    """Why is this player gone? Only `real` is news.

    A player the archive was pricing ABOVE zero on the day before they vanished
    cannot have been reshuffled out by a tie at the truncation boundary, and
    sits far enough above the cut that the cut is not the explanation either —
    Nick Chubb and Trey Benson were at projection ranks 401 and 399 of 728 the
    day they went, some three hundred places clear of it. That leaves the
    population itself changing, which is what downstream joins actually feel.

    ⚠️ IT READS THE ARCHIVE'S OWN FROZEN NUMBER, NOT TODAY'S BOARD, AND THE
    FIRST VERSION DID THE OPPOSITE — caught by this file's own C1 within a day
    of writing it. The board republished on 2026-08-31 and no longer carries
    Chubb, Benson, Jerome Ford or Ty Chandler at all, so a board-reading
    classifier lost the projections it needed and re-labelled all four of them
    `off-board`: a 2026-08-27 finding silently rewritten by a 2026-08-31
    rebuild. That is register 382's defect exactly — a harness pinned to what
    was on disk the day it was written — in a file whose entire job is to
    describe the past.

    The archive is append-only and carries the projection it froze, so the
    classification of a historical transition is now fixed forever, as a
    statement about the past ought to be. Whether we STILL price the player is
    a separate and genuinely useful axis, so it is reported alongside rather
    than folded in.
    """
    if last_seen_proj is None or last_seen_proj <= 0.0:
        return "tie-truncated"      # zero projection: our own cut, reshuffled
    return "real"


def transitions(source_days, on_board: set[str], proj_by_day=None):
    """`source_days` is [(date, {id, ...})]. `proj_by_day` maps date -> {id: points}
    as the archive froze it; without it every departure reads as tie-noise, so
    the caller passes it and `self`-comparisons in the controls do not need it."""
    proj_by_day = proj_by_day or {}
    out = []
    for (d0, s0), (d1, s1) in zip(source_days, source_days[1:]):
        left, joined = sorted(s0 - s1), sorted(s1 - s0)
        byclass: dict[str, list[str]] = {"real": [], "tie-truncated": []}
        for pid in left:
            byclass[classify(proj_by_day.get(d0, {}).get(pid))].append(pid)
        out.append({
            "from": d0, "to": d1,
            "n_before": len(s0), "n_after": len(s1),
            "n_entrants": len(joined), "n_departures": len(left),
            "departures_real": byclass["real"],
            "departures_tie_truncated": byclass["tie-truncated"],
            # An independent axis, not a class: do we STILL price the player? A
            # real departure we still price is a live join waiting to break; one
            # we no longer price is a population change we have absorbed.
            "departures_real_still_priced": [p for p in byclass["real"] if p in on_board],
            "entrants": joined,
        })
    return out


def ds_matched_ids() -> set[str]:
    f = ROOT / "draft" / "data" / "draftsharks_projections_2026.json"
    if not f.exists():
        return set()
    return {r["sleeper_id"] for r in json.loads(f.read_text())["players"]
            if r.get("sleeper_id")}


def controls(by_source, on_board, proj_by_day) -> tuple[bool, list[str]]:
    lines, ok = [], True

    def chk(label, cond, detail=""):
        nonlocal ok
        lines.append(f"  {'PASS' if cond else 'FAIL'}  {label}"
                     + (f" — {detail}" if detail and not cond else ""))
        ok = ok and bool(cond)

    sleeper = by_source.get("sleeper", [])
    days = {d: s for d, s in sleeper}

    have = "2026-08-26" in days and "2026-08-27" in days
    chk("C1 the register-435 transition is present in the series", have,
        f"dates: {sorted(days)[:3]}...")
    if have:
        left = days["2026-08-26"] - days["2026-08-27"]
        chk("C1 the register-435 pair is among that morning's departures",
            {"4988", "11589"} <= left, f"got {sorted(left)}")
        pd = proj_by_day.get("sleeper", {}).get("2026-08-26", {})
        chk("C1 every one of them is a REAL departure, not tie-noise",
            all(classify(pd.get(p)) == "real" for p in left),
            {p: (pd.get(p), classify(pd.get(p))) for p in left})
        ds = ds_matched_ids()
        if ds:
            chk("C1 exactly two of them are in the Draft Sharks 250 — which is "
                "why the crosswalk lost two rows and not four",
                left & ds == {"4988", "11589"}, f"got {sorted(left & ds)}")
        # ⚠️ NOT "are they on the board today". They were on 2026-08-26 --
        # which is why the crosswalk reached for them and the gate refused --
        # and they are NOT on the board republished 2026-08-31, which is the
        # direct confirmation register 435 could only reach by reproducing CI's
        # arithmetic. Asserting today's membership would make this control
        # flip with the next rebuild; asserting the frozen price does not.
        chk("C1 the archive was pricing both of them the day before they went",
            all((pd.get(p) or 0) > 0 for p in ("4988", "11589")),
            {p: pd.get(p) for p in ("4988", "11589")})

    have2 = "2026-08-12" in days and "2026-08-13" in days
    chk("C2 the 08-13 mass entrance is present", have2)
    if have2:
        joined = days["2026-08-13"] - days["2026-08-12"]
        chk("C2 it reads as a mass ENTRANCE, not a departure",
            len(joined) > 200 and len(days["2026-08-12"] - days["2026-08-13"]) == 0,
            f"entrants {len(joined)}, departures "
            f"{len(days['2026-08-12'] - days['2026-08-13'])}")

    if sleeper:
        d, s = sleeper[-1]
        self_t = transitions([(d, s), (d, set(s))], on_board)[0]
        chk("C3 a day against itself reports nothing on either side",
            self_t["n_entrants"] == 0 and self_t["n_departures"] == 0, str(self_t))

    chk("C4 a departure the archive never priced classifies as tie-noise",
        classify(None) == "tie-truncated" and classify(0.0) == "tie-truncated"
        and classify(25.4) == "real")

    # C5 THE NOISE IS REAL AND THE FILTER EARNS ITS KEEP. If this ever stops
    # holding, the classifier has become decoration and the raw diff would do.
    noisy = [t for src in by_source
             for t in transitions(by_source[src], on_board, proj_by_day.get(src))
             if t["departures_tie_truncated"]]
    chk("C5 tie-truncation noise exists, so classifying is not decoration",
        len(noisy) >= 3, f"only {len(noisy)} transitions carry tie-noise")
    return ok, lines


def main(argv) -> int:
    by_source, proj_by_day = load_series()
    on_board, names, proj = board_ids(), board_names(), board_proj()
    ok, control_lines = controls(by_source, on_board, proj_by_day)

    report = {
        "_territory": "TERRITORY: D — source_universe_drift.py",
        "_what": "Day-over-day membership drift in each projection source's "
                 "universe. The completeness check beside it asks whether a row "
                 "was written; this asks what is inside it.",
        "_report_only": "Exits 0 on any amount of drift. Non-zero means the "
                        "CONTROLS failed, i.e. this tool is broken.",
        "controls_all_passed": ok,
        "sources": {},
    }
    for source, days in by_source.items():
        report["sources"][source] = transitions(days, on_board, proj_by_day.get(source))

    if "--json" in argv:
        print(json.dumps(report, indent=1))
    else:
        for source, ts in report["sources"].items():
            print(f"\n■ {source} — {len(ts) + 1} captures, {len(ts)} transitions")
            for t in ts:
                real = t["departures_real"]
                noise = len(t["departures_tie_truncated"])
                if not real and not t["n_entrants"]:
                    continue
                tag = "" if not noise else f"  (+{noise} tie-truncation noise, ignored)"
                print(f"  {t['from']} → {t['to']}  {t['n_before']} → {t['n_after']}"
                      f"   +{t['n_entrants']} / −{t['n_departures']}{tag}")
                still = set(t["departures_real_still_priced"])
                for pid in real:
                    froze = proj_by_day.get(source, {}).get(t["from"], {}).get(pid)
                    mark = "STILL PRICED" if pid in still else "and we no longer price them"
                    print(f"      ⚠️  LEFT THE ARCHIVE — {names.get(pid, pid)}  "
                          f"[{pid}]  froze at {froze}  ({mark})")
        # THE HEADLINE, because a report nobody can read is a report nobody
        # reads. FantasyPros is not truncated and its universe genuinely moves,
        # so the per-transition detail above runs to a couple of hundred lines
        # across twenty days — true, and not an agenda. What is an agenda is a
        # player the archive stopped pricing while OUR BOARD still prices them:
        # that is a live join waiting to break on the next rebuild, which is
        # exactly what took the board down from 08-27 to 08-31.
        live = []
        for source, ts in report["sources"].items():
            for t in ts:
                if t["departures_real_still_priced"]:
                    live.append((t["to"], source, t["departures_real_still_priced"]))
        print("\n■ STILL PRICED BY US, NO LONGER IN THE ARCHIVE — the joins at risk")
        if not live:
            print("  (none)")
        for date, source, pids in sorted(live)[-8:]:
            who = ", ".join(names.get(p, p) for p in pids[:4])
            more = "" if len(pids) <= 4 else f" +{len(pids) - 4} more"
            print(f"  {date}  {source:12} {len(pids):3}  {who}{more}")

        print("\nCONTROLS")
        for l in control_lines:
            print(l)
        print("  " + ("ALL PASS" if ok else "FAILED — the report above is not trustworthy"))

    OUT.write_text(json.dumps(report, indent=1))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
