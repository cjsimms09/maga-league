#!/usr/bin/env python3
# TERRITORY: relay — the relay owns "nothing is lost", and a finished measurement
# that nothing reads is lost in the only way that matters: it exists, so nobody
# looks for it again.
"""WHICH COMMITTED ARTIFACTS DOES NOTHING READ?

── THE PATTERN, WITH THREE NAMED INSTANCES ────────────────────────────────────

Not written after a failure. Written because the same shape has now happened
three times in this repo and each was found by accident:

  1. `decision_contract.js` — ON the war-room page since ca034f3, verified
     present at runtime by `module_check.js`, and `grep DecisionContract app.js`
     returned ZERO hits. `app.js:5473` records it: *"a module loaded, checked for
     presence, and never read. Produced-and-unread, at the one surface that
     answers 'why this player'."*
  2. The opportunity fields — `build.py:1248`: nine were computed from
     play-by-play, three were written to the board, and `air_yards_share`,
     `adot`, `rz_targets`, `carries`, `gl_carries` and `rz_share` were *"derived
     from play-by-play, consumed inside composite_z, and then dropped at the
     board's edge — 0 of 682 rows."*
  3. `nflverse_durability.json` (found 2026-08-18) — C's per-player availability
     record for 135 of 146 draftable players, plus a 114-row ranked table built
     for the draft. **Its only readers are its own producer and tests.**

**The cost is not the wasted work. It is that an artifact which EXISTS stops
anybody looking for the answer again** — the question reads as closed. Three
times is a rate, and none of the three was found by looking.

── WHAT COUNTS AS A READER, AND WHY TESTS DO NOT ──────────────────────────────

A reader is a source file that names the artifact and is NOT (a) the tool that
writes it, (b) a test, or (c) documentation. Tests are excluded deliberately and
it is the whole point of the check: `nflverse_durability.json` has SEVEN test
references and zero consumers. A well-tested artifact nobody uses is exactly the
thing that looks healthy from every angle except the one that matters.

── WHAT THIS IS NOT ───────────────────────────────────────────────────────────

**A REPORT, NEVER A GATE.** Plenty of artifacts are legitimately terminal — a
study's output is meant to be read by a human once and cited in prose, and no
static rule can tell that from an oversight. Same standing as `prior_art.py` and
`stale_blockers.py`: every line is a question ("should something read this?"),
never an answer. Precision is stated in the output, not assumed.

Run:  python3 draft/tools/unread_artifacts.py
      python3 draft/tools/unread_artifacts.py --min-bytes 50000
"""
from __future__ import annotations

import argparse
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

#: Where committed measurements live.
ARTIFACT_DIRS = ("draft/backtest", "draft/data")

#: Where a consumer could live. Deliberately excludes draft/tests.
SOURCE_DIRS = ("draft", "src", "public/js", "netlify")

#: A file that cannot be a consumer: it is the producer, a test, or prose.
NOT_A_CONSUMER = re.compile(r"(^|/)(tests?|__pycache__|node_modules)/|"
                            r"(^|/)test_|_test\.|\.test\.|\.md$|\.json$")


def artifacts(root: Path = ROOT, min_bytes: int = 0) -> list:
    out = []
    for d in ARTIFACT_DIRS:
        base = root / d
        if not base.exists():
            continue
        for f in sorted(base.glob("*.json")):
            if f.stat().st_size >= min_bytes:
                out.append(f)
    return out


def sources(root: Path = ROOT) -> list:
    out = []
    for d in SOURCE_DIRS:
        base = root / d
        if not base.exists():
            continue
        for pat in ("**/*.py", "**/*.js", "**/*.ejs"):
            for f in base.glob(pat):
                rel = str(f.relative_to(root))
                if NOT_A_CONSUMER.search(rel):
                    continue
                out.append(f)
    return sorted(set(out))


def readers(name: str, srcs: list, root: Path = ROOT) -> list:
    """Source files naming `name`, minus the one that writes it.

    THE PRODUCER IS THE HARD PART, and getting it wrong makes the tool useless in
    one direction or the other. A file that WRITES the artifact obviously names
    it; counting that as a reader means nothing is ever reported. So a file is
    treated as the producer when it names the artifact within ~120 characters of
    a write call. That is a heuristic and it is stated as one.
    """
    stem = name.rsplit(".", 1)[0]
    #: ⚠️ THE FAMILY STEM, AND WITHOUT IT THIS TOOL IS MOSTLY MEASURING
    #: "does the filename contain a year".
    #:
    #: First run reported 39 of 116 unread, and roughly twenty of those were
    #: season-suffixed families — `snap_counts_2021..2025`, `advanced_stats_2022..
    #: 2025`, `routes_2021..2025`, `fp_expert_ranks_2023..2025`. They are all read,
    #: through an f-string: `(HERE / f"advanced_stats_{season}.json").read_text()`,
    #: `_load(f"snap_counts_{season}.json")`. A literal-filename search cannot see
    #: a name that is assembled at runtime.
    #:
    #: That is a probe returning a clean-looking "nothing reads this" for a file
    #: read five different ways — rule 3e, in the tool I wrote to apply rule 3e.
    #: So a reader naming the FAMILY (`advanced_stats_`) counts for every member.
    family = re.sub(r"_(19|20)\d{2}$", "_", stem)
    needles = {name, stem} | ({family} if family != stem else set())
    hits = []
    for f in srcs:
        if f.resolve() == Path(__file__).resolve():
            # THIS FILE NAMES EVERY ARTIFACT IT REPORTS ON. Without this line the
            # tool credits itself as the consumer of its own founding case, which
            # is how the first version reported `nflverse_durability.json` as READ.
            continue
        try:
            text = f.read_text(encoding="utf8", errors="ignore")
        except OSError:
            continue
        if not any(nd in text for nd in needles):
            continue
        # PRODUCER-SIDE BY IMPORT, not just by writing. `nflverse_run.py` is the
        # pipeline runner: it invokes `nflverse_durability` and then reads the
        # artifact back to print a report. That is the producer reading its own
        # output, not a consumer — and counting it made the tool blind to the
        # exact case it was built for. A file importing the artifact's own module
        # is on the producing side of the line.
        if re.search(r"\b(import|require)\b[^\n]{0,60}" + re.escape(stem), text):
            continue
        writes = False
        for m in re.finditer("|".join(re.escape(nd) for nd in sorted(needles, key=len, reverse=True)), text):
            window = text[max(0, m.start() - 120): m.end() + 120]
            if re.search(r"write_text|json\.dump|dumps\(|writeFileSync|"
                         r"\bsave\b|open\([^)]*['\"]w", window):
                writes = True
                break
        if not writes:
            hits.append(f.relative_to(root))
    return hits


def scan(root: Path = ROOT, min_bytes: int = 0) -> tuple:
    srcs = sources(root)
    unread, read = [], []
    for a in artifacts(root, min_bytes):
        r = readers(a.name, srcs, root)
        (read if r else unread).append((a, r))
    return unread, read, len(srcs)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--min-bytes", type=int, default=0,
                    help="ignore artifacts smaller than this")
    ap.add_argument("--limit", type=int, default=30)
    a = ap.parse_args()

    unread, read, n_src = scan(ROOT, a.min_bytes)
    total = len(unread) + len(read)

    print("=" * 78)
    print("UNREAD ARTIFACTS — committed measurements no source file consumes")
    print("=" * 78)
    print(f"  {total} artifact(s) scanned against {n_src} source file(s)")
    print(f"  {len(read)} have a consumer · {len(unread)} have NONE\n")

    if not unread:
        print("  Every artifact is read by something. That is not the usual answer —")
        print("  check the producer heuristic before believing it.")
        print("=" * 78)
        return 0

    for art, _ in sorted(unread, key=lambda t: -t[0].stat().st_size)[:a.limit]:
        kb = art.stat().st_size / 1024
        print(f"  {art.relative_to(ROOT)}   ({kb:,.0f} KB)")
    if len(unread) > a.limit:
        print(f"  … and {len(unread) - a.limit} more")

    print("\n  Each line is a QUESTION — should something read this? — never an answer.")
    print("  A study whose output is meant for a human to read once and cite in prose")
    print("  is legitimately terminal, and no static rule tells that from an oversight.")
    print("  TESTS ARE NOT COUNTED AS READERS, on purpose: nflverse_durability.json")
    print("  has seven test references and zero consumers, which is the exact shape")
    print("  that looks healthy from every angle except the one that matters.")
    print("=" * 78)
    return 0


if __name__ == "__main__":   # pragma: no cover
    raise SystemExit(main())
