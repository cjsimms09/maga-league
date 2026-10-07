#!/usr/bin/env python3
"""WHY DOES SLEEPER RETURN 7,630 ROWS AND NOT ONE PROJECTION?

── WHAT IS AT STAKE, AND IT IS THE WHOLE POINT OF THIS SEASON ─────────────────

Cory, 2026-10-07: *"make sure we are getting everything we need to have a better
model next year.. this is our goal for this year."*

Two captures exist for exactly that, and both are named for it:

    weekly-proj-snapshot.yml       "the 2027-gradeable proj freeze"
    weekly-projection-archive.yml  "the 2027-gradeable weekly archive"

**Both have been failing on the same upstream response since the season
started, and the archive holds ONE file — week 1, captured 2026-08-20, three
weeks before kickoff.** Zero weeks of real football are banked. Every one of
those weeks is unbackfillable: Sleeper's projection surface is LIVE, not an
archive (`sleeper_hist_proj.py`'s own header says so), so a week we do not take
on the day is a week that never existed for us.

That matters more than any other gap because the January-2027 experiment — the
only thing that can settle whether our model beats Sleeper and FantasyPros — is
graded on these frozen weekly projections. No archive, no experiment.

Both jobs refuse to write rather than bank an empty week, which is correct and
is why this is a clean missing-data problem rather than a corrupt one.

── THE SYMPTOM, VERBATIM FROM BOTH RUNS ───────────────────────────────────────

    projections /projections/nfl/regular/{season}: SKIPPED — no {week} in the path
    projections /projections/nfl/2026/4?season_type=regular: 7630 rows, 0 with stats
    projections /projections/nfl/2026/4:                      7630 rows, 0 with stats
    ! projections: no endpoint shape returned usable data

Rows come back. Stats do not. That is a SHAPE answer, not an outage — an outage
returns an error, not 7,630 well-formed rows.

── THE HYPOTHESIS THIS TESTS ──────────────────────────────────────────────────

`draft/tools/free_source_discovery.py` already carries a weekly Sleeper URL that
is expected to yield `pts_ppr`/`pts_half_ppr`/`pts_std`, and it differs from the
failing one in exactly one respect — it passes POSITION FILTERS:

    .../projections/nfl/2026/1?season_type=regular
        &position[]=QB&position[]=RB&position[]=WR&position[]=TE

The guess is that unfiltered, Sleeper hands back its whole player universe with
empty stat objects, and the filters are what make it populate them. 7,630 rows
is about the size of every NFL player who has ever existed, not of a week's
projections — which is itself evidence for that reading.

**But a guess is not a finding, and this sandbox cannot reach Sleeper** (the
egress proxy rejects api.sleeper.app outright). CI can. So this is the
hand-curl, automated, exactly as `underdog_426_probe.py` was for register 504 —
that one found the answer in a single run after the question had sat unanswered
for twenty-two days.

── HOW IT AVOIDS ANSWERING CONFIDENTLY AND WRONGLY ────────────────────────────

  * a KNOWN-POSITIVE control (`/v1/state/nfl`) must return a week, or the runner
    has no usable egress and every "no stats" below is a false negative, not a
    finding (rule 3e);
  * a CONTROL-NEGATIVE — the exact URL the captures send today — which must
    still return rows-without-stats. If it suddenly works, the upstream fixed
    itself and NOTHING should be changed;
  * every arm reports the row count, the count WITH a usable projection, and a
    sample row's keys, so a shape change we did not guess still teaches us
    something rather than reading as another flat "no".

It writes nothing and changes nothing.

Run: python3 draft/tools/sleeper_projections_probe.py [--season 2026] [--week 4]
"""
from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request

UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      "Accept": "application/json"}

POSITIONS = "position[]=QB&position[]=RB&position[]=WR&position[]=TE"
#: The scoring keys a usable projection row must carry. If none is present the
#: row is a name with no number in it, which is what "0 with stats" means.
PTS_KEYS = ("pts_ppr", "pts_half_ppr", "pts_std")


def get(url, timeout=45):
    req = urllib.request.Request(url, headers=UA)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            # FULL body. Truncating before json.loads() reports the vendor's
            # payload as malformed when it is only half-read — that exact
            # mistake cost a round trip on the Underdog probe.
            return r.status, r.read().decode("utf-8", "ignore"), None
    except urllib.error.HTTPError as e:
        try:
            body = e.read().decode("utf-8", "ignore")[:400]
        except Exception:                                      # noqa: BLE001
            body = "<unreadable>"
        return e.code, body, None
    except Exception as e:                                     # noqa: BLE001
        return 0, "", f"{type(e).__name__}: {e}"


def stat_of(row):
    """The projection numbers on a row, wherever Sleeper is keeping them."""
    if not isinstance(row, dict):
        return {}
    for key in ("stats", "projection", "projections"):
        v = row.get(key)
        if isinstance(v, dict) and v:
            return v
    # some shapes put pts_* at the top level
    return {k: row[k] for k in PTS_KEYS if k in row} or {}


def summarise(body):
    """rows, rows-with-a-projection, and what a row actually looks like."""
    try:
        doc = json.loads(body)
    except Exception as e:                                     # noqa: BLE001
        return {"error": f"not JSON ({e}); first 160: {body[:160]!r}"}

    rows = doc if isinstance(doc, list) else (
        doc.get("players") if isinstance(doc, dict) and isinstance(doc.get("players"), list)
        else list(doc.values()) if isinstance(doc, dict) else [])

    withstats = 0
    sample_keys, sample_stat_keys, sample_row = [], [], None
    for r in rows:
        st = stat_of(r)
        if any(k in st for k in PTS_KEYS):
            withstats += 1
            if sample_row is None:
                sample_row = r
                sample_keys = sorted(r)[:14] if isinstance(r, dict) else []
                sample_stat_keys = sorted(st)[:14]
    if sample_row is None and rows:
        first = rows[0]
        sample_keys = sorted(first)[:14] if isinstance(first, dict) else []
        sample_stat_keys = sorted(stat_of(first))[:14]

    return {"rows": len(rows), "with_stats": withstats,
            "row_keys": sample_keys, "stat_keys": sample_stat_keys,
            "top_level": (sorted(doc)[:8] if isinstance(doc, dict) else "list")}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--season", default="2026")
    ap.add_argument("--week", default="4")
    a = ap.parse_args(argv)
    s, w = a.season, a.week

    print("=" * 78)
    print("CONTROL (known-positive): Sleeper state — proves this runner reaches Sleeper")
    code, body, err = get("https://api.sleeper.app/v1/state/nfl")
    print(f"   HTTP {code} {('ERR ' + err) if err else ''} body[:120]={body[:120]!r}")
    if code != 200:
        print("\n🔴 CONTROL FAILED — no usable egress to Sleeper from here, so every")
        print("   'no stats' below is a FALSE NEGATIVE, not a finding (rule 3e).")
        return 1
    print("   ✅ Sleeper is reachable.\n")

    arms = [
        ("control-negative: EXACTLY what the captures send today",
         f"https://api.sleeper.app/projections/nfl/{s}/{w}?season_type=regular"),
        ("bare weekly path (the captures' second attempt)",
         f"https://api.sleeper.app/projections/nfl/{s}/{w}"),
        ("⭐ weekly + position[] filters (free_source_discovery's form)",
         f"https://api.sleeper.app/projections/nfl/{s}/{w}?season_type=regular&{POSITIONS}"),
        ("weekly + position[] + order_by=ppr",
         f"https://api.sleeper.app/projections/nfl/{s}/{w}?season_type=regular&{POSITIONS}&order_by=ppr"),
        ("weekly + order_by only",
         f"https://api.sleeper.app/projections/nfl/{s}/{w}?season_type=regular&order_by=ppr"),
        ("api.sleeper.COM instead of .app, with filters",
         f"https://api.sleeper.com/projections/nfl/{s}/{w}?season_type=regular&{POSITIONS}"),
        ("SEASON endpoint + filters (worked 2026-08-17: 8,625 rows with stats)",
         f"https://api.sleeper.app/projections/nfl/{s}?season_type=regular&{POSITIONS}"),
        ("season endpoint, legacy /regular/ path",
         f"https://api.sleeper.app/projections/nfl/regular/{s}"),
    ]

    print("=" * 78)
    print(f"SLEEPER WEEKLY PROJECTIONS — season {s}, week {w}")
    print("=" * 78)
    results = []
    for label, url in arms:
        code, body, err = get(url)
        if err:
            print(f"   HTTP ---  {label}\n     url={url}\n     transport error: {err}\n")
            results.append((False, 0, label, url))
            continue
        info = summarise(body) if code == 200 else {"error": f"HTTP {code}: {body[:160]!r}"}
        ok = bool(info.get("with_stats"))
        results.append((ok, info.get("with_stats", 0), label, url))
        print(f"{'✅' if ok else '  '} HTTP {code}  {label}")
        print(f"     url={url}")
        if "error" in info:
            print(f"     {info['error']}")
        else:
            print(f"     rows={info['rows']}  WITH PROJECTIONS={info['with_stats']}")
            print(f"     row keys  : {info['row_keys']}")
            print(f"     stat keys : {info['stat_keys']}")
        print()

    neg = next((r for r in results if "control-negative" in r[2]), None)
    winners = [r for r in results if r[0] and "control-negative" not in r[2]]

    print("=" * 78)
    if neg and neg[0]:
        print("⚠️  THE CONTROL-NEGATIVE NOW WORKS: the URL the captures already send")
        print("    returns projections again. Upstream fixed itself — change NOTHING,")
        print("    just re-run the two captures and confirm they write.")
    elif winners:
        best = max(winners, key=lambda r: r[1])
        print(f"✅ {len(winners)} arm(s) returned real projections. Richest:")
        print(f"     {best[1]} rows with projections — {best[2]}")
        print(f"     {best[3]}")
        print("    Wire that URL shape into the two capture tools. The weeks already")
        print("    missed CANNOT be recovered (the surface is live, not an archive),")
        print("    so the value of fixing it is every week from today onward.")
    else:
        print("🔴 NO ARM RETURNED PROJECTIONS, and the control proves Sleeper is")
        print("    reachable — so this is a real finding, not a broken probe. Read the")
        print("    'row keys' / 'stat keys' lines: if rows come back with a shape we do")
        print("    not recognise, the parser needs rewriting, not the URL. If every arm")
        print("    is empty, Sleeper has stopped publishing weekly projections and the")
        print("    2027 experiment needs a different comparator — which is a finding")
        print("    worth having NOW rather than in January.")
    print("=" * 78)
    return 0


if __name__ == "__main__":
    sys.exit(main())
