"""Stamp the FOUR REMAINING SOURCES onto the board as per-player fields.

CORY, 2026-08-21: "Where are all the other sources we got?? We got more than
that?" He was right and the gap was mine to have spotted.

WHAT WAS WRONG. The blend is built from SEVEN sources — sleeper, fantasypros,
cbs, espn, clay, fftoday, draftsharks — and `source_boards.json` already shows
all of them (plus the blend) in the "best available by source" panel. But the
BIG BOARD toggle reads per-player `overall_rank_<key>` fields, and those are
written by `alt_source_rankings.py`, which could only rank a source whose
projection is a field ON THE BOARD. Only four ever were: proj_ds, proj_sleeper,
proj_ownmodel, proj_fantasypros. So CBS, ESPN, FFToday and Mike Clay were
ingested, committed, blended into the number Cory drafts on, and then invisible
on the one tab he asked to see them on.

AND THE TWO ON THE TOGGLE WERE THE WORST-COVERED ONES. Measured inside his top
200 before this ran: ESPN 99%, CBS 97%, FFToday 94%, Clay 89% — against Draft
Sharks 95% and FantasyPros 90%. The four that were missing are not a thin tail;
two of them cover his draft range better than either source he already had.

WHAT THIS DOES, AND ALL IT DOES. It joins two stores that are already committed
and already read elsewhere in this pipeline —
`draft/data/multisource_projections.json` (`players[id].by_source.{CBS,ESPN,
FFToday}`) and `draft/data/clay_projections_2026.json`
(`players[id].proj_clay_scored`, scored under OUR half-PPR table by C, never
Clay's own full-PPR column) — and writes `proj_cbs`, `proj_espn`,
`proj_fftoday`, `proj_clay` onto each board player.

OUTPUT IS ADDITIVE ONLY, exactly as alt_source_rankings.py's is. These are new
field names nothing on the board reads today, so running this changes no number
Cory drafts on. It only makes those four sources RANKABLE by the step that runs
next. `proj_mean` and the blend are untouched — whether Clay belongs in the
blend is a separate decision with a separate blast radius (source_boards.js
makes the same point in its own header, and it is still true).

ABSENT IS None, NEVER 0. A player a source does not carry gets no field rather
than a zero, because `|| 0 turns absent into a confident zero` is a failure this
codebase has already paid for — and downstream, `compute_for_source` reads
`raw is not None` to set `covered`, so a zero would be recorded as real coverage
and the war room would drop nobody while showing a replacement-level phantom.

Run: python3 draft/tools/attach_multisource.py [--path public/draft_data.json]
"""
from __future__ import annotations
import argparse
import json
import sys
import datetime as _dt
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent
MS_PATH = ROOT / "draft" / "data" / "multisource_projections.json"
CLAY_PATH = ROOT / "draft" / "data" / "clay_projections_2026.json"

#: board field -> how to read it out of a store. Kept explicit rather than
#: derived: a source that silently reads `undefined` for every player produces
#: a perfectly plausible empty column (rule 3e), and the controls below exist
#: to make that impossible to ship.
MS_SOURCES = {"proj_cbs": "CBS", "proj_espn": "ESPN", "proj_fftoday": "FFToday"}
CLAY_FIELD = "proj_clay"

ALL_FIELDS = list(MS_SOURCES) + [CLAY_FIELD]


def _load(path: Path) -> dict:
    with path.open() as fh:
        return json.load(fh)


def attach(board: dict) -> dict:
    ms = (_load(MS_PATH).get("players") or {})
    clay = (_load(CLAY_PATH).get("players") or {})
    players = board.get("players") or []

    written = {f: 0 for f in ALL_FIELDS}
    for p in players:
        pid = str(p.get("player_id"))
        rec = ms.get(pid) or {}
        by_src = rec.get("by_source") or {}
        for field, key in MS_SOURCES.items():
            v = by_src.get(key)
            if v is not None:
                p[field] = float(v)
                written[field] += 1
        c = clay.get(pid) or {}
        cv = c.get("proj_clay_scored")
        if cv is not None:
            p[CLAY_FIELD] = float(cv)
            written[CLAY_FIELD] += 1
    return written


def controls(board: dict, written: dict) -> list[str]:
    """Every one of these has a way to FAIL, and each was run against a case
    with a known answer before this file was trusted (rule 3f)."""
    failures: list[str] = []
    players = board.get("players") or []
    by_id = {str(p.get("player_id")): p for p in players}

    # C1 KNOWN POSITIVE, RE-DERIVED BY A DIFFERENT PATH. Read the stores again,
    # independently of attach(), and confirm a specific stamped value matches.
    # A join that matched nobody, or matched the wrong key, cannot survive this.
    ms = (_load(MS_PATH).get("players") or {})
    clay = (_load(CLAY_PATH).get("players") or {})
    checked = 0
    for field, key in MS_SOURCES.items():
        hit = next((pid for pid, r in ms.items()
                    if (r.get("by_source") or {}).get(key) is not None and pid in by_id), None)
        if hit is None:
            failures.append(f"C1: no player in {key} could be joined to the board at all")
            continue
        want = float(ms[hit]["by_source"][key])
        got = by_id[hit].get(field)
        checked += 1
        if got is None or abs(got - want) > 1e-9:
            failures.append(f"C1: {key} player {hit} stamped {got!r}, store says {want!r}")
    hit = next((pid for pid, r in clay.items()
                if r.get("proj_clay_scored") is not None and pid in by_id), None)
    if hit is None:
        failures.append("C1: no Clay player could be joined to the board at all")
    else:
        want = float(clay[hit]["proj_clay_scored"])
        got = by_id[hit].get(CLAY_FIELD)
        checked += 1
        if got is None or abs(got - want) > 1e-9:
            failures.append(f"C1: Clay player {hit} stamped {got!r}, store says {want!r}")

    # C2 KNOWN NEGATIVE. A player a source does not carry must have NO field —
    # not 0, not proj_mean. This is the one that catches a `|| 0` regression.
    for field, key in MS_SOURCES.items():
        miss = next((p for p in players
                     if (ms.get(str(p.get("player_id"))) or {}).get("by_source", {}).get(key) is None),
                    None)
        if miss is not None and field in miss:
            failures.append(
                f"C2: {miss.get('name')} is absent from {key} but carries {field}={miss[field]!r}")

    # C3 THE COLUMNS MUST ACTUALLY DISAGREE. If a join silently copied proj_mean
    # (or one source into all four), every column would look populated and the
    # war room would show four labels over one opinion — which reads as
    # consensus rather than as a bug. Compare on the top 200, where all four are
    # well covered, so a real disagreement is expected.
    top = [p for p in players
           if p.get("adjusted_adp") is not None and p["adjusted_adp"] <= 200]
    for field in ALL_FIELDS:
        vals = [(p.get(field), p.get("proj_mean")) for p in top if p.get(field) is not None]
        if not vals:
            failures.append(f"C3: {field} is null for every one of the top 200")
            continue
        same = sum(1 for a, b in vals if b is not None and abs(a - b) < 1e-9)
        if same == len(vals):
            failures.append(
                f"C3: {field} equals proj_mean for all {len(vals)} covered top-200 players "
                f"— the join is echoing the blend, not the source")

    # C4 COVERAGE REPORTED, NOT ASSUMED. A source that stamps almost nothing is
    # a broken ingest wearing a working one's clothes.
    for field in ALL_FIELDS:
        if written[field] < 100:
            failures.append(f"C4: {field} stamped only {written[field]} players — suspiciously thin")

    # C5 TWO SOURCES THAT ARE ONE SOURCE. C3 compares each column to the BLEND
    # and would not have caught this; it took a stray identical pair in a sample
    # print to notice. Mike Clay IS ESPN's projections man, and both stores score
    # RAW STAT LINES under the same league table, so `proj_clay` and `proj_espn`
    # come out identical on 92.4% of the players they share.
    #
    # NOT FATAL, because it is now a known and recorded property rather than a
    # surprise, and because the honest fix (whose opinion leaves the blend) is
    # Cory's call and not a build step's. But it is COUNTED and written into the
    # artifact every run, so a new duplicate pair — or this one silently getting
    # worse — shows up as a number instead of being discovered by accident.
    dupes = {}
    everything = ALL_FIELDS + ["proj_ds", "proj_sleeper", "proj_fantasypros"]
    for i, a in enumerate(everything):
        for b in everything[i + 1:]:
            pairs = [(p[a], p[b]) for p in players
                     if p.get(a) is not None and p.get(b) is not None]
            if len(pairs) < 50:
                continue
            same = sum(1 for x, y in pairs if abs(x - y) < 1e-9)
            frac = same / len(pairs)
            if frac >= 0.5:
                dupes[f"{a}|{b}"] = {"identical": same, "of": len(pairs),
                                     "pct": round(100 * frac, 1)}
    globals()["_DUPES"] = dupes

    if checked < 4:
        failures.append(f"C1: only {checked} of 4 sources had a known-positive to check")
    return failures


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--path", default=str(ROOT / "public" / "draft_data.json"))
    args = ap.parse_args()
    path = Path(args.path)
    board = _load(path)

    written = attach(board)
    failures = controls(board, written)

    top = [p for p in (board.get("players") or [])
           if p.get("adjusted_adp") is not None and p["adjusted_adp"] <= 200]
    cov = {f: sum(1 for p in top if p.get(f) is not None) for f in ALL_FIELDS}

    print("  multisource attach — per-player projections stamped onto the board")
    for f in ALL_FIELDS:
        pct = (100.0 * cov[f] / len(top)) if top else 0.0
        print(f"    {f:<14} {written[f]:>4} of {len(board.get('players') or [])}"
              f"   top-200 {cov[f]:>3} ({pct:.0f}%)")

    board["multisource_attach"] = {
        "at": _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "written": written,
        "top200_coverage": cov,
        "stores": [str(MS_PATH.relative_to(ROOT)), str(CLAY_PATH.relative_to(ROOT))],
        "controls_all_passed": not failures,
        "duplicate_source_pairs": globals().get("_DUPES", {}),
        "why": "Cory 2026-08-21: the blend uses seven sources and the Big Board "
               "toggle offered four. These four were ingested and blended but "
               "never rankable, because alt_source_rankings.py can only rank a "
               "source whose projection is a field on the board.",
    }

    if failures:
        print("\n  ! CONTROLS FAILED — board NOT written:")
        for f in failures:
            print(f"      {f}")
        return 1

    with path.open("w") as fh:
        json.dump(board, fh, separators=(",", ":"))
    dup = globals().get("_DUPES", {})
    if dup:
        print("\n  ! SOURCES THAT ARE NOT INDEPENDENT (C5, reported not fatal):")
        for k, v in sorted(dup.items(), key=lambda kv: -kv[1]["pct"]):
            print(f"      {k:<28} identical on {v['identical']}/{v['of']} ({v['pct']}%)")
        print("      Counting these as separate opinions overstates agreement.")
    print(f"\n  controls passed ({len(ALL_FIELDS)} sources); wrote {path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
