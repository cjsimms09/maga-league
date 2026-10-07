#!/usr/bin/env python3
"""DID FFC BREAK, OR DID THE SOURCE END? — the one measurement register 538 waits on.

`external_source_prices.json` read as the daily time series it is (measured
2026-10-07): FFC decays 233 -> 228 -> 226 -> 209 -> 202 -> 187 -> 160 -> 157 ->
154 rows and then STOPS APPEARING ENTIRELY — no `ffc` entry at all in the last
~22 daily rows. Meanwhile FantasyPros sits at exactly 365 rows / 287 on-board
for ~28 consecutive days.

That is why the board has not published since 2026-09-10:
`lab_source_composition.load()` keeps only the NEWEST entry per source, so it is
still ranking FantasyPros against FFC's last gasp from September, and
`n_shared` is 132 against a floor of 150.

── WHY THIS PROBE EXISTS INSTEAD OF A FIX ─────────────────────────────────────

The two possible causes call for OPPOSITE changes:

  BROKEN  — FFC still publishes and our capture stopped reaching it. Fix the
            capture. The gate was right to hold the board and the 150 floor
            stays exactly as it is.
  ENDED   — FFC stopped publishing 2026 ADP once drafts were over. Then a
            two-pricing-source requirement is a DRAFT-WINDOW assumption that
            expired at kickoff, which is the dominant defect class of
            2026-10-07, and the in-season board (draft-data.yml calls it "the
            waiver/wire pipeline") should not be gated on ADP agreement at all.

The decay curve 233 -> 154 -> absent is consistent with BOTH. Lowering the
threshold without knowing which would publish a board priced by a source that
has not reported in three weeks.

── ⚠️ RULE 3e, WHICH IS THE WHOLE POINT OF THIS FILE ──────────────────────────

A null from a probe is a bug report until the probe has returned a positive.
"Nothing found" and "asked wrong" are indistinguishable from the outside, and
this exact probe has NEVER returned a positive in October.

It was already proved necessary: run from the dev sandbox, all five arms —
including the 2024 and 2025 arms whose ADP certainly exists — returned nothing.
Read naively that is "FFC is gone". The real answer was
`CONNECT tunnel failed: 403 Forbidden`: the sandbox's egress proxy denies the
host. A probe without controls would have reported a dead source and sent
someone to rewrite a gate.

So every run carries KNOWN-POSITIVE arms (2024, 2025 — seasons whose ADP must
exist), the CONTROL-NEGATIVE arm is byte-for-byte what the capture asks for,
and the verdict REFUSES to speak about 2026 unless a control came back
populated. Raw response shape is recorded for every arm.

Run:  python3 draft/tools/ffc_adp_probe.py [--json out.json]
Exit: always 0 — this is a read-only diagnostic. The VERDICT is the output.
"""
from __future__ import annotations

import argparse
import datetime as _dt
import json
import sys
import urllib.request

HOST = "https://fantasyfootballcalculator.com"
UA = "maga-league-backtest"          # the same agent the capture sends

#: `control` marks an arm whose answer we already know, which is what licenses
#: any statement about the arms whose answer we do not.
ARMS = [
    {"key": "capture_2026", "control": False,
     "why": "byte-for-byte what external-adp-capture asks for",
     "url": f"{HOST}/api/v1/adp/half-ppr?teams=10&year=2026"},
    {"key": "known_positive_2025", "control": True,
     "why": "2025 ADP certainly existed — if THIS is empty the probe is broken",
     "url": f"{HOST}/api/v1/adp/half-ppr?teams=10&year=2025"},
    {"key": "known_positive_2024", "control": True,
     "why": "a second known positive, so one bad season cannot fake a verdict",
     "url": f"{HOST}/api/v1/adp/half-ppr?teams=10&year=2024"},
    {"key": "variant_2026_12team", "control": False,
     "why": "is it the 10-team slice specifically, or 2026 as a whole",
     "url": f"{HOST}/api/v1/adp/half-ppr?teams=12&year=2026"},
    {"key": "variant_2026_ppr", "control": False,
     "why": "a different scoring format — same question, independent path",
     "url": f"{HOST}/api/v1/adp/ppr?teams=10&year=2026"},
    {"key": "variant_2026_standard", "control": False,
     "why": "third format",
     "url": f"{HOST}/api/v1/adp/standard?teams=10&year=2026"},
    {"key": "html_2026", "control": False,
     "why": "the human page — an INDEPENDENT path from the API, so an API "
            "retirement and a site-wide end look different",
     "url": f"{HOST}/adp/half-ppr/10-team/all"},
]

#: Below this many players an ADP payload is a stub, not a board. FFC's own
#: half-ppr 10-team file carried 200+ for most of the season and its LAST
#: captured day still had 154, so a populated answer is unambiguous.
POPULATED = 100


def fetch(url: str, timeout: int = 45) -> dict:
    """Status, size and SHAPE — never a bare boolean.

    A 404 body parsed as JSON and a real payload with zero rows are different
    findings, and only the shape tells them apart.
    """
    out = {"url": url}
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            body = r.read()
            out["status"] = r.status
            out["bytes"] = len(body)
            text = body.decode("utf8", "replace")
    except Exception as exc:                                 # noqa: BLE001
        out["status"] = None
        out["error"] = f"{type(exc).__name__}: {exc}"
        #: THE CASE THAT MADE THIS FILE. A proxy refusal is not a dead source.
        out["is_access_failure"] = any(
            s in str(exc) for s in ("Tunnel connection failed", "CONNECT",
                                    "403", "Forbidden", "NameResolution",
                                    "Temporary failure in name resolution"))
        return out

    out["head"] = text[:160]
    if "json" in url or url.rstrip("/").split("/")[-1].startswith("adp?") or "/api/" in url:
        try:
            d = json.loads(text)
        except ValueError as exc:
            out["parsed"] = False
            out["parse_error"] = str(exc)[:120]
            return out
        out["parsed"] = True
        players = d.get("players") if isinstance(d, dict) else None
        out["players"] = len(players) if isinstance(players, list) else None
        if isinstance(d, dict):
            out["payload_meta"] = {k: d.get(k) for k in
                                   ("status", "teams", "year", "position", "format")
                                   if k in d}
            if isinstance(players, list) and players:
                out["first_row_keys"] = sorted(players[0])[:12]
    else:
        # the HTML arm: count table rows as a crude populated/empty signal
        out["parsed"] = None
        out["adp_mentions"] = text.lower().count("adp")
        out["row_mentions"] = text.count("<tr")
    return out


def verdict(results: dict) -> dict:
    """⚠️ CORRECTED 2026-10-07, SAME DAY, AFTER ITS FIRST REAL RUN.

    The first version asked "is ANY 2026 arm populated" and so returned
    SOURCE_FINE__OUR_CAPTURE_BROKE off this measurement:

        capture_2026  (half-ppr)  200  players= 54   <- THE FORMAT WE CAPTURE
        variant_2026_ppr          200  players= 29
        variant_2026_standard     200  players=118   <- what tripped the verdict
        CONTROL 2025  (half-ppr)  200  players=156
        CONTROL 2024  (half-ppr)  200  players=178

    It judged 2026 on `standard`, a format this league does not use and this
    repo does not capture, and reported that our capture had broken. The arm
    that matters reads 54 against its own 2024/2025 history of 178/156 — the
    endpoint is healthy and the POOL IS WINDING DOWN, which is a third thing
    that the original two-way split could not say.

    That is rule 3i one level up: the arms were all recorded, and the verdict
    still quoted the single value that fit a story. The fix is to judge on the
    capture's own format and let the variants be context.
    """
    controls = [k for k, a in results.items()
                if a.get("_control") and (a.get("players") or 0) >= POPULATED]
    access_fail = [k for k, a in results.items() if a.get("is_access_failure")]
    all_control_keys = [k for k, a in results.items() if a.get("_control")]

    if not controls:
        return {
            "verdict": "PROBE_OR_ACCESS_BROKEN",
            "says_nothing_about_ffc": True,
            "why": (
                "NOT ONE known-positive control came back populated "
                f"({all_control_keys}), so this run carries no information about "
                "2026. 2024 and 2025 ADP certainly exist; if we cannot see them "
                "we cannot conclude anything from not seeing 2026. "
                + (f"Access failures on {access_fail} — a proxy or DNS refusal, "
                   "not a dead source." if access_fail else
                   "No access error, so the endpoint shape may have changed: "
                   "read `head` and `payload_meta` on the control arms.")),
            "next": "Run this where the capture runs. Rule 3e.",
        }

    live = {k: a.get("players") for k, a in results.items()
            if not a.get("_control") and a.get("players") is not None}

    #: THE ARM THAT DECIDES is the one the capture actually sends. A variant in
    #: a format we do not use cannot vouch for the feed we do.
    cap = results.get("capture_2026", {})
    cap_n = cap.get("players")
    control_ns = [a.get("players") or 0 for a in results.values() if a.get("_control")]
    control_floor = min(control_ns) if control_ns else POPULATED

    if cap_n is None:
        return {
            "verdict": "PROBE_OR_ACCESS_BROKEN",
            "says_nothing_about_ffc": True,
            "why": ("the controls answered but the CAPTURE arm did not parse, so "
                    f"the format we actually fetch is unmeasured (arms: {live})"),
            "next": "Read the capture arm's raw shape in the artifact.",
        }

    if cap_n >= POPULATED:
        return {
            "verdict": "SOURCE_FINE__OUR_CAPTURE_BROKE",
            "why": (f"controls populated ({controls}) AND the capture's own "
                    f"format returns {cap_n} players — FFC still serves what we "
                    "ask for, so the missing days are a capture failure."),
            "next": ("Fix the capture. The board gate was RIGHT to hold and the "
                     "150 floor stays as it is. Register 538 ③."),
        }

    if cap_n > 0:
        return {
            "verdict": "SOURCE_WINDING_DOWN",
            "why": (f"the endpoint is HEALTHY (HTTP 200) and the probe proved "
                    f"itself on {controls}, but the format we capture returns "
                    f"only {cap_n} players against a known-good history of "
                    f"{sorted(control_ns)} — and the other 2026 formats agree "
                    f"it is thin ({live}). This is a draft market winding down "
                    "after drafts stopped, not a broken fetch and not a dead "
                    "source."),
            "next": ("TWO consequences, and neither is lowering a floor. (a) The "
                     "capture's COLLAPSE_KEEP_FRACTION refuses any day losing "
                     ">50% of a source's rows, justified in its own comment by "
                     "'in mid-August boards GROW' — a draft-window assumption "
                     "that expired at kickoff, which is why FFC vanished from the "
                     "archive silently instead of being recorded as thin. (b) The "
                     "board's 150-shared-player requirement cannot be met by a "
                     "post-draft ADP market, so SCOPE when it applies against "
                     "league_config.draft.start_date. Register 538 ②/③."),
        }

    return {
        "verdict": "FFC_NO_LONGER_SERVES_2026",
        "why": (f"controls populated ({controls}) so the probe demonstrably "
                f"works, and the capture's format returns nothing ({live}) — "
                "including the HTML page, an independent path."),
        "next": ("The two-pricing-source requirement is a DRAFT-WINDOW "
                 "assumption that expired at kickoff. Scope WHEN the 150 floor "
                 "applies against league_config.draft.start_date — do NOT lower "
                 "it. Register 538 ②."),
    }


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", dest="out")
    a = ap.parse_args(argv)

    results = {}
    print("=" * 74)
    print("FFC ADP PROBE — did the source break, or did it end? (register 538)")
    print("=" * 74)
    for arm in ARMS:
        r = fetch(arm["url"])
        r["_control"] = arm["control"]
        r["_why"] = arm["why"]
        results[arm["key"]] = r
        tag = "CONTROL" if arm["control"] else "       "
        n = r.get("players")
        n = str(n) if n is not None else (
            f"html:{r.get('row_mentions')}rows" if "row_mentions" in r else "-")
        print(f"  {tag} {arm['key']:<24} status={str(r.get('status')):<5} "
              f"players={n:<14} {r.get('error', '')[:60]}")

    v = verdict(results)
    doc = {"probed_at": _dt.datetime.now(_dt.timezone.utc).isoformat(),
           "populated_threshold": POPULATED,
           "arms": results, **v}

    print("\n" + "-" * 74)
    print(f"VERDICT: {v['verdict']}")
    print(f"  why : {v['why']}")
    print(f"  next: {v['next']}")
    if v.get("says_nothing_about_ffc"):
        print("\n  ⚠️  THIS RUN IS NOT EVIDENCE. Rule 3e: a null from a probe is a "
              "bug\n      report until the probe has returned a positive.")
    print("-" * 74)

    if a.out:
        with open(a.out, "w", encoding="utf8") as fh:
            json.dump(doc, fh, indent=1)
        print(f"wrote {a.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
