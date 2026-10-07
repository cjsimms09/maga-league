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


def week_retention_sweep(season):
    """⭐ WHICH WEEKS DOES SLEEPER STILL SERVE? The question that decides the fix.

    The first probe run answered the URL question and raised a bigger one. Asked
    for week 5 (not yet played) the PLAIN url returned 972 rows with
    projections; the captures asking for week 4 got zero from the same url on
    the same shape. If that is a RETENTION window rather than a URL fault, then:

      * nothing needs rewiring — the captures are simply running too late;
      * and every week already missed is PERMANENTLY gone, because a projection
        for a played week is not something anyone back-fills.

    Those two readings call for opposite work (rewrite the fetch vs move the
    schedule), so guessing between them would waste the rest of the season.
    This asks every week of the season with ONE url shape and prints the
    boundary, which is the only thing that can tell them apart.
    """
    print("=" * 78)
    print("WEEK RETENTION SWEEP — which weeks still carry projections TODAY?")
    print("  (one url shape, every week: any difference is the WEEK, not the url)")
    print("=" * 78)
    rows = []
    for wk in range(1, 19):
        url = f"https://api.sleeper.app/projections/nfl/{season}/{wk}?season_type=regular&order_by=ppr"
        code, body, err = get(url)
        if err or code != 200:
            print(f"  week {wk:>2}: HTTP {code} {err or ''}")
            rows.append((wk, None))
            continue
        info = summarise(body)
        n = info.get("with_stats", 0)
        rows.append((wk, n))
        print(f"  week {wk:>2}: {info.get('rows', 0):>5} rows, {n:>4} with projections")
    live = [w for w, n in rows if n]
    dead = [w for w, n in rows if n == 0]
    print()
    print(f"  weeks WITH projections : {live}")
    print(f"  weeks EMPTY            : {dead}")
    if dead and live and max(dead) < min(live):
        print()
        print("  ⛔ RETENTION BOUNDARY CONFIRMED: every empty week is EARLIER than every")
        print("     live one. Sleeper drops a week's projections once it has been played.")
        print("     => The captures are not mis-wired, they are running TOO LATE, and")
        print("        every missed week is unrecoverable. Fix the SCHEDULE, not the URL.")
    elif not dead:
        print("\n  every week answers — retention is not the constraint.")
    else:
        print()
        print("  ⚠️ NOT a clean boundary — empty and live weeks interleave, so this is")
        print("     not simple retention. Read the per-week rows before changing anything.")
    return rows


def user_agent_experiment(season, week):
    """⭐ THE SAME URL, TWO CLIENTS — the experiment that actually settles it.

    The capture ran four minutes after this probe's first run, asked for the
    SAME week, from the SAME CI environment, and got `7630 rows, 0 with stats`
    while the probe got `9420 rows, 972 with projections`. Identical url string.
    Different payload, and different ROW COUNTS, so it is a different response
    rather than different parsing — which rules out "transient upstream" (I had
    written that down; it was wrong) and points at the one thing that differs
    between the two clients: the headers.

    This probe sends a browser User-Agent. `urllib` with no headers announces
    itself as `Python-urllib/3.x`. If Sleeper serves a reduced, stat-less
    payload to the default agent, the fix is one line in each capture and every
    remaining week of the season is saved.

    Both arms hit the identical url, so the ONLY variable is the header.
    """
    url = f"https://api.sleeper.app/projections/nfl/{season}/{week}?season_type=regular"
    print("=" * 78)
    print("USER-AGENT EXPERIMENT — identical url, the header is the only variable")
    print(f"  {url}")
    print("=" * 78)

    out = {}
    for label, headers in (("browser UA (what this probe sends)", UA),
                           ("urllib default (what the captures send)", None)):
        req = urllib.request.Request(url, headers=headers or {})
        try:
            with urllib.request.urlopen(req, timeout=45) as r:
                body = r.read().decode("utf-8", "ignore")
            info = summarise(body)
        except Exception as e:                                 # noqa: BLE001
            info = {"error": f"{type(e).__name__}: {e}"}
        out[label] = info
        if "error" in info:
            print(f"  {label:<42} {info['error']}")
        else:
            print(f"  {label:<42} rows={info['rows']:>6}  with projections={info['with_stats']:>5}")

    a = out.get("browser UA (what this probe sends)", {})
    b = out.get("urllib default (what the captures send)", {})
    print()
    if a.get("with_stats") and not b.get("with_stats"):
        print("  ⛔ CONFIRMED: Sleeper serves a STAT-LESS payload to the default agent.")
        print("     The captures are not mis-scheduled and upstream is not flaky —")
        print("     they simply do not identify themselves. Send a User-Agent and")
        print("     every remaining week of the season is captured.")
    elif a.get("with_stats") and b.get("with_stats"):
        print("  both agents got projections — the User-Agent is NOT the discriminator,")
        print("  so the difference lies elsewhere in how the capture builds its request.")
    else:
        print("  neither agent got projections on this run — inconclusive here; do not")
        print("  conclude anything from this arm alone.")
    return out


def v1_prefix_experiment(season, week):
    """⭐⭐ THE ROOT CAUSE, AND IT WAS HIDING IN THE LOG LINE ALL ALONG.

    `draft/sleeper_import.py` sets `BASE = "https://api.sleeper.app/v1"` and
    every capture fetches `BASE + path`. The log prints only the PATH, so its
    line reads

        projections /projections/nfl/2026/5?season_type=regular: 7630 rows, 0 with stats

    which looks character-for-character like the url this probe calls — and
    this probe gets 9,420 rows with 972 projections from it. The capture is
    actually calling **/v1/projections/...**, a different surface.

    That single missing distinction cost four hypotheses: a url fault, a
    retention window, a transient upstream, and a User-Agent. Every one was
    tested and killed, and the real answer was a prefix the log never showed.

    Both arms below differ ONLY in the /v1 prefix.
    """
    tail = f"/projections/nfl/{season}/{week}?season_type=regular"
    print("=" * 78)
    print("/v1 PREFIX EXPERIMENT — the only difference between the two requests")
    print("=" * 78)
    out = {}
    for label, url in (("root  (what this probe calls)", "https://api.sleeper.app" + tail),
                       ("/v1   (what the captures call)", "https://api.sleeper.app/v1" + tail)):
        code, body, err = get(url)
        if err or code != 200:
            print(f"  {label:<34} HTTP {code} {err or ''}")
            out[label] = {"with_stats": 0, "code": code}
            continue
        info = summarise(body)
        out[label] = info
        print(f"  {label:<34} HTTP {code}  rows={info.get('rows'):>6}  "
              f"with projections={info.get('with_stats'):>5}")
        print(f"     url={url}")
    root = out.get("root  (what this probe calls)", {})
    v1 = out.get("/v1   (what the captures call)", {})
    print()
    if root.get("with_stats") and not v1.get("with_stats"):
        print("  ⛔ ROOT CAUSE CONFIRMED: the /v1 surface returns rows with NO")
        print("     projections; the root surface returns them. Every capture that")
        print("     builds its url from sleeper_import.BASE has been asking the wrong")
        print("     endpoint all season. One constant, four dead hypotheses, and every")
        print("     remaining week of 2026 recoverable the moment it is fixed.")
    elif root.get("with_stats") and v1.get("with_stats"):
        print("  both surfaces answer — /v1 is NOT the discriminator either.")
    else:
        print("  inconclusive on this run; do not conclude from this arm alone.")
    return out


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
    print()
    week_retention_sweep(s)
    print()
    user_agent_experiment(s, w)
    print()
    v1_prefix_experiment(s, w)
    return 0


if __name__ == "__main__":
    sys.exit(main())
