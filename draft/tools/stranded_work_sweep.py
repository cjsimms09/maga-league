#!/usr/bin/env python3
# TERRITORY: relay
"""STRANDED WORK SWEEP — finished, tested work that reached nobody.

Cory's standing complaint, and the relay's own outcome line in CLAUDE.md:
*nothing is lost*. The failure this catches is not a bug and not a dropped
ask — it is a lane finishing something, CI proving it green, and the commit
never becoming part of `main`. ROUTES cannot show it: ROUTES lists what a
lane WROTE DOWN, and an unrouted commit is indistinguishable from a lane
that did nothing.

MEASURED 2026-09-05, which is why this exists: of 98 distinct commits CI had
tested since 08-29, **21 were neither an ancestor of `main` nor the head of
any branch**, and five of those were real finished work nobody could use —
**mark-as-paid** (the site's only unclosable money loop, 19 tests),
**pick'em vs the model** (10), **chat reactions** (10), **register 41's
interior-hole guard** (4, and the weekly series it guards starts at week 1),
and the **source_universe_drift nightly wiring**. All five were recovered
and shipped the same day. Four of the five had been sitting for three days.

HOW IT DECIDES (and what it deliberately does not claim):
  • ON MAIN        — an ancestor of origin/main. Fine, whatever the branch.
  • LIVE BRANCH    — the head of some branch. Someone can still merge it;
                     this tool does not chase it, ROUTES does.
  • STRANDED       — neither. Nothing points at it; only a sha nobody holds.
A stranded MERGE commit is almost always superseded and is reported
separately from stranded WORK, because a merge whose parents both landed has
lost nothing. The tool never guesses whether stranded work is still WANTED —
it prints what the commit touched and lets a human read it. Recovering one
is `curl -H 'Accept: application/vnd.github.v3.diff' .../commits/<sha>`
piped to `git apply --3way`, since a bare sha cannot be fetched.

CONTROL (Rule 3e — a sweep that has never found anything has not been
tested): `--control` asserts the five commits recovered on 2026-09-05 are
classified ON MAIN today. They were stranded that morning and their content
is on main tonight, so a sweep that cannot see them has broken its join and
its nulls mean nothing.

Needs the GitHub API (a run's head sha, and whether a sha heads a branch),
so it runs in CI or anywhere GITHUB_TOKEN/gh auth reaches; offline it says
so rather than reporting a clean sweep.

Run:  python3 draft/tools/stranded_work_sweep.py [--since 2026-08-29] [--json] [--control]
"""
import argparse
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REPO = "cjsimms09/maga-league"
API = f"https://api.github.com/repos/{REPO}"

# The pieces recovered on 2026-09-05 — this sweep's known positives. Their
# CONTENT is on main now; the shas themselves stay stranded forever (applying
# a patch makes a new sha), so the control checks the FILES they added, which
# is the thing that actually had to arrive.
RECOVERED_2026_09_05 = {
    "mark-as-paid": "draft/tests/settlement_mark_paid.test.js",
    "pickem-vs-model": "draft/tests/pickem_vs_model.test.js",
    "chat-reactions": "draft/tests/chat_reactions.test.js",
    "interior-hole guard": "draft/tests/test_weekly_series_have_no_interior_holes.py",
    "graded: convention": "draft/tests/test_graded_artifacts_match_the_ledger.py",
}

# RESOLVED — a stranded sha whose CONTENT has since arrived, or which a later
# commit superseded. Recovering by patch makes a new sha, so the original stays
# stranded forever and would be re-reported every run until the list stopped
# being read. EVERY ENTRY CARRIES A REASON AND WAS VERIFIED BY LOOKING FOR THE
# CONTENT ON MAIN, not by remembering that somebody said they landed it — that
# assumption is the whole failure class this tool exists to catch. Adding an
# entry without checking is how this becomes a mute button.
RESOLVED = {
    "3606f021af74451ee1f5b62ef16cc504db411f5b": "RECOVERED 09-05 — D's `graded:` convention. Sharpest case of the class: 9153fc14 landed the ROUTES row ANNOUNCING it on main while the work itself stayed stranded. test_graded_artifacts_match_the_ledger.py + test_studies_are_reproducible.py, 7/7.",
    "e1d8d4aa0aef39d565dd6a4a3c50b832b0b4d189": "RECOVERED 09-05 — mark-as-paid, the site's only unclosable money loop (19 tests). Stranded three days.",
    "8f5e681bb897b9f6998d3edc2719fc1bb1200797": "RECOVERED 09-05 — chat reactions, site review item 6 half (10 tests).",
    "9a8be85983e78c8aed9782cd71f5ad235ec9a025": "RECOVERED 09-05 — pick'em vs the model, site review item 7 (10 tests).",
    "2419631952df4ad6214806022d939a2287e6f307": "RECOVERED 09-05 — register 41's interior-hole guard (4 tests); the weekly series it guards starts at week 1.",
    "6a2508da89a22c7e69d61903c0d50d98b53879ec": "RECOVERED 09-05 — source_universe_drift wired into the nightly (register 444).",
    "bfdad824a53b115eb86d3edb581930d4cab1f5f8": "SUPERSEDED — earlier attempt at the same drift wiring; 6a2508da's version was the one applied.",
    "a3a863fef467eafdfad16730d9a83f6c653b1c8a": "RECOVERED 09-04 — the free-props-writer import crash (a 3-arg props_snapshot_path against a 4-arg call). Verified on main: `from weekly_props_arm import props_snapshot_path`.",
    "a0554364cf52a3ee0d059c72540490ad03ca45de": "RECOVERED 09-04 — the 09-03 GO sweep's ROUTES/register rows, cherry-picked by the relay.",
    "51ed106bb7c67dcb068c82ca376f089ea4306f82": "SUPERSEDED — A landed the same waiver ratchet (8 -> 6) as 884b2250 on 09-04. Verified: KNOWN_UNRESOLVABLE_ACQUISITIONS = 6 on main.",
    "3c41a272fc516e0a72967817a1869764d404efa9": "SUPERSEDED — same waiver ratchet as 51ed106b; A's 884b2250 is the copy on main.",
    "84cc14e4bea7115bb41eee0d7405a0c1a17212f6": "SUPERSEDED — the 09-05 daily routine pushed the same GO sweep to main as 937cda10. Verified: register 488 is on main.",
    "53cf26088f1c544d1f0297eb630e700d78dcc24f": "SUPERSEDED 09-06 — its SITE-REVIEW-2026-09-02.md items 3/6/7 update is a subset of what's on main now: main's text for all three carries the fuller 09-05-recovery notes (mark-as-paid/chat-reactions/pick'em-vs-model), verified by reading the file on main.",
    "7560262164f013cdc04a39e77ef35492df1ff837": "SUPERSEDED 09-06 — a 2026-09-04 sync merge; its two distinguishing pieces (weekly-grade.yml cron '30 12 * * 2', the weekly_projection_archive conflict resolution) are both verified live on main.",
    "bc707793465808415ec2a41c302afd1a52a51117": "SUPERSEDED 09-06 — a 2026-09-06T05:00 GO-sweep sync merge (30 commits) predating this session's main; verified its distinguishing content (source_universe_drift step, register 444) is already on main by a different path.",
}


def _get(url):
    req = urllib.request.Request(url, headers={"Accept": "application/vnd.github+json",
                                               "User-Agent": "stranded-work-sweep"})
    tok = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
    if tok:
        req.add_header("Authorization", f"Bearer {tok}")
    with urllib.request.urlopen(req, timeout=45) as r:
        return json.loads(r.read().decode("utf-8", "ignore"))


def git(*args):
    return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True)


def on_main(sha):
    """Is `sha` an ancestor of origin/main?

    MEASURED 2026-09-06 (register — the GO sweep that found this): a plain
    shallow clone (this container's default) only fetches ~50 commits of
    history, so `git merge-base --is-ancestor` errors on any older sha with
    "Not a valid object name" and the function returns False — a commit that
    landed on main DAYS ago reads as freshly STRANDED. One run of this tool
    on a fresh container reported 30 stranded commits; 27 of them were
    already on main and only looked stranded because the local clone could
    not see that far back (`git fetch --depth=500` and re-running dropped it
    to 3). Local git is a Rule-3f probe that has silently never had its
    control checked against a shallow clone — the GitHub compare API does
    not depend on how much history this checkout happens to hold, so it is
    the primary check; local git is kept only as a fast path when it can
    answer without erroring.
    """
    r = git("merge-base", "--is-ancestor", sha, "origin/main")
    if r.returncode == 0:
        return True
    if "Not a valid object name" not in (r.stderr or "") and "unknown revision" not in (r.stderr or ""):
        # local git resolved both refs and said "not an ancestor" — trust it.
        return False
    try:
        cmp = _get(f"{API}/compare/main...{sha}")
    except urllib.error.HTTPError:
        return False
    return cmp.get("status") in ("identical", "behind")


def heads_a_branch(sha):
    try:
        return len(_get(f"{API}/commits/{sha}/branches-where-head")) > 0
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return False
        raise


def sweep(since):
    runs = _get(f"{API}/actions/workflows/ci.yml/runs?per_page=100&created=%3E{since}")
    seen = {}
    for r in runs.get("workflow_runs", []):
        seen.setdefault(r["head_sha"], (r["created_at"][:16], (r.get("display_title") or "")[:90]))
    git("fetch", "-q", "origin", "main")
    work, merges, resolved, live, landed = [], [], [], 0, 0
    for sha, (when, title) in sorted(seen.items(), key=lambda kv: kv[1][0]):
        if on_main(sha):
            landed += 1
            continue
        if heads_a_branch(sha):
            live += 1
            continue
        row = {"sha": sha, "when": when, "title": title}
        if sha in RESOLVED:
            resolved.append({**row, "why": RESOLVED[sha]})
        elif title.startswith("Merge remote-tracking branch"):
            merges.append(row)
        else:
            work.append(row)
    return {
        "_territory": "TERRITORY: relay — produced by draft/tools/stranded_work_sweep.py",
        "_what": ("Commits CI has tested that are neither an ancestor of origin/main nor the head of any "
                  "branch. Nothing points at them; the work exists and nobody can use it."),
        "since": since, "commits_tested": len(seen), "on_main": landed, "on_a_live_branch": live,
        "stranded_work": work, "stranded_merges": merges, "resolved": resolved,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--since", default="2026-08-29")
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--control", action="store_true")
    a = ap.parse_args()

    if a.control:
        missing = [name for name, f in RECOVERED_2026_09_05.items() if not (ROOT / f).exists()]
        if missing:
            print("🔴 CONTROL FAILED — work recovered on 2026-09-05 is not on main any more: "
                  + ", ".join(missing))
            print("   Either it was reverted, or this sweep's premise is wrong. Do not trust a clean run.")
            return 1
        print(f"✅ CONTROL PASSED — all {len(RECOVERED_2026_09_05)} recovered pieces are present on main.")

    try:
        doc = sweep(a.since)
    except Exception as e:  # noqa: BLE001
        print(f"⚠️  CANNOT SWEEP (GitHub API unreachable: {type(e).__name__}). "
              "This is NOT a clean sweep — no claim is made either way.")
        return 2

    if a.json:
        print(json.dumps(doc, indent=1))
        return 0

    print(f"STRANDED WORK SWEEP — CI runs since {doc['since']}\n")
    print(f"  {doc['commits_tested']} commits tested · {doc['on_main']} on main · "
          f"{doc['on_a_live_branch']} on a live branch · {len(doc['resolved'])} recovered/superseded · "
          f"{len(doc['stranded_work'])} STRANDED work · {len(doc['stranded_merges'])} stranded merges\n")
    if doc["stranded_work"]:
        print("  🔴 FINISHED WORK NOBODY CAN USE — read each, then recover or let it go:")
        for r in doc["stranded_work"]:
            print(f"     {r['sha'][:10]}  {r['when']}  {r['title']}")
        print("\n     recover:  curl -sSL -H 'Accept: application/vnd.github.v3.diff' \\")
        print(f"                 {API}/commits/<sha> | git apply --3way -")
        print("     (a bare sha cannot be fetched; the diff endpoint is the way in)")
    else:
        print("  ✅ nothing stranded — every tested commit is on main or on a branch someone holds.")
    if doc["resolved"]:
        print(f"\n  ({len(doc['resolved'])} sha(s) recorded as recovered or superseded, each with a reason "
              "in RESOLVED — a patch-apply makes a new sha, so the original stays stranded forever.)")
    if doc["stranded_merges"]:
        print(f"\n  ({len(doc['stranded_merges'])} stranded merge commits not listed — a merge whose "
              "parents landed has lost nothing.)")
    return 1 if doc["stranded_work"] else 0


if __name__ == "__main__":
    sys.exit(main())
