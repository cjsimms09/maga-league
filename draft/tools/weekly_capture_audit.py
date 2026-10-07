#!/usr/bin/env python3
"""IS EVERY PLAYED WEEK ACTUALLY ON DISK? — per week, per capture, by artifact.

Cory, 2026-10-07: *"Every week going forward needs to work! And needs to work
in a way that helps us draft and manage better next year."*

── WHY A RED WORKFLOW WAS NOT ENOUGH ──────────────────────────────────────────

The two 2027-gradeable captures failed LOUDLY on every single run for seven
weeks. Nothing was hidden, nothing was swallowed, and both correctly refused to
bank an empty week. It still cost four weeks of the Sleeper comparator, because
**a red workflow sitting in a list of red workflows is invisible, while a missed
week of unbackfillable evidence cannot be recovered.** The GO sweep reported
"last run: failure" every day and that sentence reads the same whether a week
was lost or not.

So this does not watch JOBS. It watches ARTIFACTS, and asks the only question
that matters for next year's model: *for every week that has actually been
played, is the file on disk?* A job can go green and bank nothing; a job can go
red having already banked. Only the artifact settles it.

⚠️ IT ALSO CATCHES A COUNT PASSED OFF AS COVERAGE. Reporting "props: 5 files"
sounds healthy and is not an answer — the five files are weeks 1, 1_sun, 3, 4
and 4_sun, so weeks 2 and 5 are missing and the count hides it. (I made exactly
that mistake the same day, which is why this reports WHICH WEEKS and never a
total.) Rule 3i: a number is not a finding until you have seen the distribution
behind it.

── WHAT COUNTS AS A PLAYED WEEK ───────────────────────────────────────────────

The harvest, not a clock. A week is owed a capture once somebody has actually
scored in it — the same test `season_played.has_been_played` applies, and the
same reason: a date is a second source that can disagree with the scores, and
this repo keeps finding condition-bound rules whose condition expired quietly.

Run:  python3 draft/tools/weekly_capture_audit.py [--season 2026] [--json]
Exit: 1 if any played week is missing a capture that is owed for that week.
"""
from __future__ import annotations

import argparse
import glob
import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

#: Every weekly capture that 2027 depends on, and WHY it matters — stated per
#: row so a future reader can judge whether a gap is worth chasing rather than
#: guessing from a filename. `serves` is deliberately in Cory's terms: DRAFT
#: (makes next year's draft better) or MANAGE (makes in-season decisions
#: better); most serve both and say so.
CAPTURES = [
    {
        "key": "sleeper_fp_archive",
        "label": "Sleeper+FP weekly projections (the 2027 experiment)",
        "glob": "draft/data/weekly_projection_archive/weekly_projection_archive_{season}_w{week}.json",
        "serves": "DRAFT+MANAGE — the ONLY artifact that can settle whether our "
                  "model beats Sleeper and FantasyPros. No archive, no experiment.",
        "unbackfillable": True,
    },
    {
        "key": "own_weekly",
        "label": "our own weekly projection (the forward record)",
        "glob": "draft/data/weekly_own/own_weekly_{season}_w{week}.json",
        "serves": "DRAFT+MANAGE — our side of the same comparison, committed "
                  "BEFORE kickoff so the forward guarantee is a timestamp, not a claim.",
        "unbackfillable": True,
    },
    {
        "key": "props",
        "label": "free player props (market-implied points)",
        "glob": "draft/data/props/weekly_props_{season}_w{week}.json",
        "serves": "MANAGE — the arm the in-season edge plan ranks FIRST (it beat "
                  "the live champion at all four positions in the 2025 backtest). "
                  "Also DRAFT: a season of market-implied weekly points is a prior "
                  "nothing else gives us.",
        "unbackfillable": True,
    },
]

#: Daily (not weekly) market captures. Counted by DATE rather than week, because
#: a line is a point-in-time price and a week is not the unit. Reported beside
#: the weekly rows because "are we testing sports odds" is answered by both.
DAILY = [
    {"key": "kalshi", "label": "Kalshi weekly markets",
     "globs": ["draft/data/kalshi/weekly_markets_{date}.json"],
     "serves": "MANAGE — independent market read on outcomes."},
    {"key": "odds", "label": "game-line odds snapshots",
     #: TWO patterns because there are two fetchers: fetch_sgo.py writes
     #: sgo_<date>.json and is the live one; fetch_odds.py's odds_<date>.json is
     #: the older shape. The first version of this row listed ONLY odds_* and so
     #: reported the newest capture as 2026-09-13 — 24 days stale — when
     #: sgo_2026-10-04.json was sitting right beside it. A capture audit that
     #: cries wolf from its own glob is worse than none, because people stop
     #: reading it; `_pattern_control` below now refuses a pattern that matches
     #: nothing anywhere.
     "globs": ["draft/data/odds/sgo_{date}.json", "draft/data/odds/odds_{date}.json"],
     "serves": "DRAFT+MANAGE — team context (totals/spreads) behind player volume."},
]


def played_weeks(season: str) -> list:
    """Weeks with real football in them, read from the committed harvest."""
    p = ROOT / "draft" / "data" / "league_history.json"
    if not p.exists():
        return []
    try:
        doc = json.loads(p.read_text(encoding="utf8"))
    except Exception:                                        # noqa: BLE001
        return []
    for s in doc.get("seasons") or []:
        if str(s.get("season")) != str(season):
            continue
        out = []
        for wk, rows in (s.get("weeks") or {}).items():
            if any(isinstance(r.get("points"), (int, float)) and r["points"] > 0
                   for r in (rows or [])):
                out.append(int(wk))
        return sorted(out)
    return []


def present_weeks(pattern: str, season: str) -> set:
    """Which weeks this capture actually has on disk."""
    pat = pattern.format(season=season, week="*")
    found = set()
    rx = re.compile(re.escape(pattern.format(season=season, week="\x00"))
                    .replace("\x00", r"(\d+)"))
    for path in glob.glob(str(ROOT / pat)):
        rel = os.path.relpath(path, ROOT)
        m = rx.search(rel)
        if m:
            found.add(int(m.group(1)))
    return found


def _pattern_control(season: str) -> list:
    """⚠️ A GLOB THAT MATCHES NOTHING IS A BROKEN PATTERN, NOT AN EMPTY SEASON.

    Rule 3e in the place it bites hardest here: this tool reports ABSENCE, and
    absence is exactly what a wrong pattern also produces. The first version of
    the odds row globbed `odds_<date>.json` while the live fetcher writes
    `sgo_<date>.json`, and it duly reported the newest capture as 24 days old
    with a fresh one beside it. Had that reached anyone it would have burned the
    alarm's credibility, which is the whole asset.

    So: every pattern must match at least one file SOMEWHERE (any week, any
    date). If it matches nothing at all, the pattern is suspect and says so,
    rather than reporting every week missing.
    """
    bad = []
    for cap in CAPTURES:
        if not glob.glob(str(ROOT / cap["glob"].format(season=season, week="*"))):
            # genuinely-empty is possible preseason, so only flag when the
            # DIRECTORY has files in it and none match the pattern
            d = Path(ROOT / cap["glob"]).parent
            sib = list(d.glob("*.json")) if d.is_dir() else []
            if sib:
                bad.append(f"{cap['key']}: pattern matches nothing, but "
                           f"{len(sib)} file(s) sit in {d.relative_to(ROOT)} — "
                           f"the GLOB is probably wrong, not the capture")
    for d in DAILY:
        if not any(glob.glob(str(ROOT / g.format(date="*"))) for g in d["globs"]):
            bad.append(f"{d['key']}: no file matches any of its patterns")
    return bad


def audit(season: str) -> dict:
    owed = played_weeks(season)
    rows = []
    for cap in CAPTURES:
        have = present_weeks(cap["glob"], season)
        missing = [w for w in owed if w not in have]
        rows.append({**cap, "have": sorted(have), "missing": missing,
                     "owed": owed, "ok": not missing})
    daily = []
    for d in DAILY:
        files = []
        for g in d["globs"]:
            files += glob.glob(str(ROOT / g.format(date="*")))
        #: ⚠️ DATED FILES ONLY. These directories carry pointer files
        #: (`sgo_latest.json`, `latest.json`) alongside the snapshots, and
        #: sorting by name puts "latest" after every date — so the first version
        #: reported `newest: sgo_latest.json`, which says nothing at all about
        #: freshness and is precisely the question this row exists to answer.
        dated = [f for f in files if re.search(r"\d{4}-\d{2}-\d{2}", os.path.basename(f))]
        dated.sort(key=lambda f: re.search(r"\d{4}-\d{2}-\d{2}", os.path.basename(f)).group(0))
        newest = os.path.basename(dated[-1]) if dated else None
        files = dated
        daily.append({**d, "count": len(files), "newest": newest,
                      "pattern_ok": bool(files)})
    return {"season": season, "played_weeks": owed, "captures": rows,
            "daily": daily, "pattern_problems": _pattern_control(season)}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--season", default="2026")
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args(argv)

    res = audit(a.season)
    if a.json:
        print(json.dumps(res, indent=1))
        return 1 if any(not r["ok"] for r in res["captures"]) else 0

    owed = res["played_weeks"]
    print("=" * 74)
    print(f"WEEKLY CAPTURE AUDIT — {a.season}")
    print(f"weeks with football played: {owed or 'none yet'}")
    print("=" * 74)
    if not owed:
        print("no played weeks yet — nothing is owed, and that is the only state")
        print("in which a missing week is not a finding.")
        return 0

    if res["pattern_problems"]:
        print("\n⚠️  PATTERN CONTROL FAILED — fix these before believing anything below:")
        for p in res["pattern_problems"]:
            print(f"     {p}")
        print()

    bad = []
    for r in res["captures"]:
        mark = "✅" if r["ok"] else "🔴"
        print(f"\n{mark} {r['label']}")
        print(f"     have   : weeks {r['have'] or 'NONE'}")
        if r["missing"]:
            bad.append(r)
            print(f"     MISSING: weeks {r['missing']}"
                  + ("  ← UNBACKFILLABLE" if r.get("unbackfillable") else ""))
        print(f"     serves : {r['serves']}")

    print("\n" + "-" * 74)
    print("MARKET CAPTURES (daily, counted by date — a price is point-in-time)")
    for d in res["daily"]:
        print(f"  {d['label']:<34} {d['count']:>4} files   newest: {d['newest']}")
        print(f"     serves : {d['serves']}")

    print("\n" + "=" * 74)
    if not bad:
        print("✅ every played week is captured in every weekly class.")
        return 0
    total = sum(len(r["missing"]) for r in bad)
    print(f"🔴 {total} MISSING WEEK(S) across {len(bad)} capture(s).")
    print("   A missing week is not a failed job to retry — for the rows marked")
    print("   UNBACKFILLABLE it is evidence that no longer exists, and next")
    print("   year's model is built from exactly this. Fix the capture, then")
    print("   accept the gap in writing rather than letting it go unnoticed.")
    print("=" * 74)
    return 1


if __name__ == "__main__":
    sys.exit(main())
