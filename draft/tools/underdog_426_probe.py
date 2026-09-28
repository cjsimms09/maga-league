#!/usr/bin/env python3
"""WHAT DOES UNDERDOG ACTUALLY WANT? — the probe register 504 has needed for 22 days.

── WHY THIS EXISTS ────────────────────────────────────────────────────────────

`free-props-writer` has failed on every run since 2026-09-06 with
`HTTP 426: Upgrade Required` from Underdog. Register 504 has been 🔴 ESCALATED
since 09-09 and its ask has never been actionable, in its own words: *"NOT
REPRODUCIBLE FROM THIS SANDBOX — this environment's egress proxy rejects the
connection outright"*, so it asked C to hand-curl the endpoint from somewhere
with real egress. Nobody has. Twenty-two days, and the props arm — which the
in-season edge plan ranks FIRST, beating the live champion at all four
positions in the backtest — has had no fresh file since 09-04.

**GitHub Actions has egress.** That is the whole idea here: stop asking a human
to hand-curl from a laptop and let CI answer it, the way every other provider
probe in this repo already does.

── AND THE DIAGNOSIS IS ALREADY IN, IT WAS JUST NEVER READ ────────────────────

Register 504 spent 19 days theorising between "a protocol-upgrade response",
"Underdog's WAF blocking plain urllib/HTTP-1.1", and "bot-defense change". The
error-body logging added on 09-09 (by that row's own recommendation) answered it
on the very next run and the answer sat in the log:

    {"error":{"api_code":"upgrade_required",
              "detail":"A new version is required to continue",
              "title":"Upgrade required","http_status_code":426}}

That is **not** an HTTP protocol upgrade and not a WAF challenge — a WAF does
not return a JSON envelope in the vendor's own error schema. It is Underdog's
APPLICATION-LEVEL CLIENT-VERSION GATE: their API is refusing the client because
it does not identify itself with a version they still support. A 426 carrying
`api_code: upgrade_required` is the vendor saying "your client is too old",
which is a header problem, not a network one. The fix space is therefore narrow
and testable — which is what this does.

── HOW IT ANSWERS RATHER THAN GUESSES (rules 3e/3f) ───────────────────────────

Every arm below is a hypothesis about what the endpoint wants, tried
independently, with the result printed. Two controls decide whether the run is
worth reading at all:

  * a KNOWN-POSITIVE — Sleeper's lines endpoint, which is the other half of the
    same writer and is NOT failing. If that comes back non-200, this runner has
    no usable egress and every "no" below is a false negative (rule 3e: a null
    from a probe that has never returned a positive is a bug report).
  * a KNOWN-NEGATIVE — the exact request the writer makes today, which MUST
    still 426. If it suddenly works, the outage ended on its own and no header
    change should be made at all.

It writes nothing and changes nothing. It prints a table and exits 0 unless the
known-positive control fails.

Run: python3 draft/tools/underdog_426_probe.py
"""
from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request

UA = ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) "
      "Chrome/124.0 Safari/537.36")
BASE = {"User-Agent": UA, "Accept": "application/json"}
REFERER = {"Referer": "https://underdogfantasy.com/"}

V5 = "https://api.underdogfantasy.com/beta/v5/over_under_lines"
V6 = "https://api.underdogfantasy.com/beta/v6/over_under_lines"
V3 = "https://api.underdogfantasy.com/v1/over_under_lines"
SLEEPER = "https://api.sleeper.app/lines/available?sport=nfl"

#: Underdog's own web client identifies itself with these. The exact version
#: string is the thing we cannot know from here — so the probe tries a spread
#: and, more usefully, tries them ABSENT-BUT-NAMED so the server's reply tells
#: us which key it is actually reading.
ARMS = [
    ("control-negative: exactly what the writer sends today", V5, {**REFERER}),
    ("client-type web only", V5, {**REFERER, "client-type": "web"}),
    ("client-version only", V5, {**REFERER, "client-version": "20260101"}),
    ("client-type + client-version (web)", V5,
     {**REFERER, "client-type": "web", "client-version": "20260101"}),
    ("client-type + high semver", V5,
     {**REFERER, "client-type": "web", "client-version": "999.999.999"}),
    ("X-Client-Type / X-Client-Version", V5,
     {**REFERER, "X-Client-Type": "web", "X-Client-Version": "999.999.999"}),
    ("User-Agent as the UD app", V5,
     {**REFERER, "User-Agent": "UnderdogFantasy/999.0.0 (web)"}),
    ("v6 endpoint, writer's headers", V6, {**REFERER}),
    ("v6 endpoint + client-type/version", V6,
     {**REFERER, "client-type": "web", "client-version": "999.999.999"}),
    ("v1 endpoint, writer's headers", V3, {**REFERER}),
]


def probe(url, headers, timeout=30, limit=4000):
    """GET and return (status, body, headers).

    ⚠️ `limit` EXISTS BECAUSE THE FIRST VERSION TRUNCATED AT 4000 BYTES
    UNCONDITIONALLY, and the shape check then tried to json.loads() a cut-off
    document and reported `Unterminated string at char 3969` — which reads
    exactly like "the vendor sent us malformed JSON". It did not; I cut it in
    half. The arm table wants a short body (ten arms of full payload is an
    unreadable log); the shape check needs the whole thing. Rule 3f: the probe
    written to answer a question returned confident, plausible, wrong output.
    """
    req = urllib.request.Request(url, headers={**BASE, **headers})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            body = (r.read() if limit is None else r.read(limit)).decode("utf-8", "ignore")
            return r.status, body, dict(r.headers)
    except urllib.error.HTTPError as e:
        try:
            body = e.read().decode("utf-8", "ignore")[:400]
        except Exception:                                  # noqa: BLE001
            body = "<unreadable>"
        return e.code, body, dict(e.headers or {})
    except Exception as e:                                 # noqa: BLE001
        return 0, f"<transport error: {e!r}>", {}


def api_code(body: str) -> str:
    try:
        return ((json.loads(body) or {}).get("error") or {}).get("api_code") or ""
    except Exception:                                      # noqa: BLE001
        return ""


#: The exact paths `fetch_free_props.parse_underdog` walks. A 200 is not a fix
#: if the payload is shaped differently — that would fetch fine and parse to
#: nothing, the writer's self-check would refuse, and we would have burned
#: another day believing it was wired. So the winning endpoint gets its SHAPE
#: checked against what the parser actually reads, before anyone rewires it.
def report_shape(url, headers):
    # limit=None: the WHOLE document, or json.loads() is parsing a fragment.
    code, body, _ = probe(url, headers, limit=None)
    print("=" * 78)
    print(f"SHAPE CHECK — does {url} carry what parse_underdog() reads?")
    print("=" * 78)
    if code != 200:
        print(f"   HTTP {code} — nothing to inspect.")
        return
    try:
        doc = json.loads(body)
    except Exception as e:                                 # noqa: BLE001
        print(f"   body did not parse as JSON ({e!r}); {len(body)} bytes read; "
              f"first 200: {body[:200]!r}")
        return

    print(f"   top-level keys: {sorted(doc)}")
    for key in ("appearances", "games", "over_under_lines", "players"):
        v = doc.get(key)
        print(f"   {key:<18} {'MISSING' if v is None else f'{len(v)} row(s)'}")

    apps = doc.get("appearances") or []
    if apps:
        a = apps[0]
        print(f"   appearance[0] keys : {sorted(a)[:14]}")
        print(f"     match_id={a.get('match_id')!r} sport_id={a.get('sport_id')!r}")
    games = doc.get("games") or []
    if games:
        g = games[0]
        print(f"   game[0] keys       : {sorted(g)[:14]}")
        print(f"     title={g.get('title')!r} sport_id={g.get('sport_id')!r}")
    lines = doc.get("over_under_lines") or []
    if lines:
        ln = lines[0]
        ou = ln.get("over_under") or {}
        ast = ou.get("appearance_stat") or {}
        print(f"   line[0] keys       : {sorted(ln)[:14]}")
        print(f"     stat_value={ln.get('stat_value')!r}")
        print(f"     over_under.appearance_stat.display_stat={ast.get('display_stat')!r}")
        print(f"     over_under.appearance_stat.appearance_id={ast.get('appearance_id')!r}")
        opts = ln.get("options") or []
        if opts:
            o = opts[0]
            print(f"     options[0]: choice={o.get('choice')!r} "
                  f"american_price={o.get('american_price')!r} "
                  f"selection_header={o.get('selection_header')!r}")
        stats = sorted({((l.get('over_under') or {}).get('appearance_stat') or {}).get('display_stat')
                        for l in lines} - {None})
        print(f"   distinct display_stat values ({len(stats)}): {stats[:25]}")

    needed = ["appearances", "games", "over_under_lines"]
    missing = [k for k in needed if not doc.get(k)]
    print()
    if missing:
        print(f"   🔴 parse_underdog() would find NOTHING: missing/empty {missing}.")
        print("      A 200 with the wrong shape is not a fix — the parser needs rewriting")
        print("      for this payload, or another key carries the same data under a new name.")
    else:
        print("   ✅ every path parse_underdog() walks is present. Swapping the URL is")
        print("      the whole change; the parser can stay as it is.")


def main() -> int:
    print("=" * 78)
    print("CONTROL (known-positive): Sleeper lines — the half of the writer that WORKS")
    code, body, _ = probe(SLEEPER, {})
    print(f"   HTTP {code}  body[:120]={body[:120]!r}")
    if code != 200:
        print("\n🔴 CONTROL FAILED. This runner cannot reach the free-props sources at all,")
        print("   so every result below is a FALSE NEGATIVE, not a finding (rule 3e).")
        return 1
    print("   ✅ egress is real and the sources are reachable from here.\n")

    print("=" * 78)
    print("UNDERDOG ARMS")
    print("=" * 78)
    results = []
    for label, url, headers in ARMS:
        code, body, _ = probe(url, headers)
        ac = api_code(body)
        ok = code == 200
        results.append((ok, code, ac, label))
        print(f"{'✅' if ok else '  '} HTTP {code:<4} {('[' + ac + ']') if ac else '':<22} {label}")
        print(f"     url={url}")
        print(f"     extra headers={sorted(k for k in headers if k != 'Referer') or '(none)'}")
        if not ok:
            print(f"     body[:200]={body[:200]!r}")
        else:
            print(f"     body[:200]={body[:200]!r}")
        print()

    winners = [r for r in results if r[0]]
    neg = next((r for r in results if "control-negative" in r[3]), None)

    print("=" * 78)
    if neg and neg[0]:
        print("⚠️  THE CONTROL-NEGATIVE SUCCEEDED: the request the writer already makes now")
        print("    returns 200. The outage ended on its own — change NO headers; just re-run")
        print("    free-props-writer and confirm. (Register 504 can close on that.)")
    elif winners:
        print(f"✅ {len(winners)} arm(s) got through. The narrowest one is the fix:")
        for _, code, ac, label in winners:
            print(f"     HTTP {code}  {label}")
        print("    Wire the winning header(s) into fetch_free_props.py's UNDERDOG call.")
        print("    ⚠️ If the winner is a hardcoded VERSION string, it will expire again —")
        print("       say so in the code and give it a recheck date.")
    else:
        print("🔴 NO ARM GOT THROUGH, and the control proves egress is fine — so this is a")
        print("    real finding, not a broken probe. Underdog wants something not tried here.")
        print("    Read the api_code column: every arm returning `upgrade_required` means the")
        print("    version gate is still unsatisfied; a DIFFERENT api_code means we moved it")
        print("    and the next question changed.")
        print("    Per Cory's standing ruling this stays FREE-SOURCE ONLY — the answer is")
        print("    another free door (Sleeper Picks alone already primes the file), never a")
        print("    purchase.")
    print("=" * 78)

    # The narrowest winner gets its payload shape checked against the parser.
    win = next((r for r in results if r[0] and "control-negative" not in r[3]), None)
    if win:
        label = win[3]
        url, headers = next((u, h) for l, u, h in ARMS if l == label)
        print()
        report_shape(url, headers)
    return 0


if __name__ == "__main__":
    sys.exit(main())
