#!/usr/bin/env python3
"""CAN ADP BE BOUNDED TO A DATE? The question the snapshot cadence hangs on.

THE DECISION THIS MOVES. F5 requires the ADP a league saw BEFORE its draft. If a
provider can serve "ADP as of 2026-08-14" after the fact, then 2026 external
leagues can be ingested whenever we get to them and snapshot cadence is an
ordinary pre-registration item. If it can only serve a CURRENT value, or a
season AGGREGATE, then every day we do not snapshot is a day of the 2026 curve
that is unrecoverable — and the cadence is on a clock the other criteria are not.

WHY THE AGGREGATE MATTERS AS MUCH AS THE CURRENT VALUE. MFL's ADP export is
year-scoped and reports `totalDrafts` for the year. A number computed over a
whole season's drafts includes drafts that happened AFTER any given league's
draft, so using it as that league's pre-draft board is an F5 violation dressed as
historical data — the contamination that looks exactly like skill. "Historical
ADP is retrievable" (already established) is therefore NOT the same claim as
"pre-draft ADP is retrievable", and this probe is about the second.

RULE 13 IS THE SHAPE OF THIS FILE, in all three of its mechanical forms.

  1. THE SCAN REPORTS ITS OWN COMPOSITION. Every response records `totalDrafts`
     and its player count, because THE STATUS CODE IS NOT THE EVIDENCE. A
     parameter that is silently ignored returns 200 with a perfectly plausible
     payload, identical to the baseline. Only a MOVED composition shows a
     parameter did anything.

  2. TWO DELIBERATE CONTROLS, and they are the most important requests here.
     `ZZZNOTAPARAM=1` and `PERIOD=ZZZZ` are known-bogus. If those come back 200
     with the baseline's composition, then this provider SILENTLY IGNORES
     unknown parameters — and every other 200 in the run is uninformative on its
     own. Establishing that BEFORE reading the candidates is the difference
     between a probe and a guess. If instead the bogus values are refused, a
     refusal elsewhere carries real information.

  3. A BOUNDED CANDIDATE SET, RECORDED. The parameter names below are candidates,
     not knowledge. A negative result is therefore a statement about THIS SET —
     "no member of {DAYS, PERIOD, START_DATE/END_DATE, ...} bounded the window" —
     and the set ships inside the result so the null is interpretable. It is NOT
     a finding that the provider cannot do this.

A 000/connection error is a statement about the SANDBOX, not the provider: egress
to these hosts is policy-blocked here and open in CI. `classify()` refuses to
score a run that never reached anything.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent

MFL_HOST = "https://api.myfantasyleague.com"
FFC_HOST = "https://fantasyfootballcalculator.com"

# THE HEADER THE SHIPPED CLIENT SENDS. `draft/adp.py` has fetched FFC in every
# build for weeks with this User-Agent; the probe sent Python's default and got
# 403 Forbidden on every request — which the first read of that run recorded as
# "FFC is unresolved". THIRD ITERATION OF THE SAME RULE-13 CHAIN on one arm:
# "nothing was reached" was my error handling, then "403" was my request, and
# only now is anything a fact about FFC.
#
# Not re-typed as a coincidence — `test_the_probe_sends_the_SHIPPED_user_agent`
# reads the literal out of `draft/adp.py` and fails if the two drift apart.
USER_AGENT = "mfga-league-draft-tool/1.0"

# The baseline request `mfl_adp.py` documents, unchanged.
MFL_BASE = {"TYPE": "adp", "PERIOD": "DRAFT", "IS_PPR": "1", "IS_KEEPER": "N",
            "IS_MOCK": "-1", "INJURED": "-1", "CUTOFF": "5", "FCOUNT": "12", "JSON": "1"}

# CANDIDATES, not knowledge. Two controls first, deliberately — nothing below them
# can be read until the controls say what a 200 is worth.
MFL_CANDIDATES = [
    ("baseline", {}),
    ("CONTROL_bogus_param", {"ZZZNOTAPARAM": "1"}),
    ("CONTROL_bogus_period", {"PERIOD": "ZZZZ"}),
    ("days_7", {"DAYS": "7"}),
    ("days_30", {"DAYS": "30"}),
    ("period_recent", {"PERIOD": "RECENT"}),
    ("period_all", {"PERIOD": "ALL"}),
    ("date_range", {"START_DATE": "20260801", "END_DATE": "20260814"}),
    ("date_range_iso", {"START_DATE": "2026-08-01", "END_DATE": "2026-08-14"}),
    ("asof", {"AS_OF": "2026-08-14"}),
]

FFC_CANDIDATES = [
    ("baseline", {}),
    ("CONTROL_bogus_param", {"zzznotaparam": "1"}),
    ("date", {"date": "2026-08-14"}),
    ("as_of", {"as_of": "2026-08-14"}),
]


# ── the part that is pure, and therefore testable without egress ────────────
def composition(payload: dict) -> dict:
    """What a response is MADE OF — the thing a status code cannot tell you."""
    adp = (payload or {}).get("adp") or {}
    players = adp.get("player") or []
    if isinstance(players, dict):
        players = [players]
    total = adp.get("totalDrafts")
    try:
        total = int(total)
    except (TypeError, ValueError):
        total = None
    top = []
    for p in players[:5]:
        top.append({"id": str(p.get("id")), "adp": p.get("averagePick")})
    return {"total_drafts": total, "players": len(players), "top5": top}


def classify(baseline: dict, cand: dict) -> str:
    """Did this parameter DO anything? Composition, never status.

    `ignored` is the verdict that matters and it is invisible from the status
    code: a 200 whose composition is byte-for-byte the baseline means the
    provider accepted a parameter and did nothing with it.
    """
    if cand.get("error") or cand.get("status") != 200:
        return "refused"
    if cand.get("composition") is None or baseline.get("composition") is None:
        return "unreadable"
    b, c = baseline["composition"], cand["composition"]
    if (b["total_drafts"], b["players"], b["top5"]) == (c["total_drafts"], c["players"], c["top5"]):
        return "ignored"
    return "changed_composition"


def verdict(rows: list) -> dict:
    """The whole run's reading, INCLUDING what the controls make the rest worth."""
    by_name = {r["name"]: r for r in rows}
    # USABLE means a 200 we could read, not merely "something came back". A run of
    # 404s used to satisfy the old `reached` test and fall through to the control
    # analysis, which then returned a dict with no verdict at all.
    usable = [r for r in rows if r.get("status") == 200 and r.get("composition")]
    if not usable:
        # THE TWO NULLS ARE DIFFERENT FACTS. "Every request failed to leave the
        # machine" is about the network; "the provider answered every request
        # with an error" is about the request or the provider. Collapsing them is
        # what turned a probable HTTP status into "FFC is unresolved".
        answered = [r for r in rows if r.get("status")]
        if answered:
            codes = sorted({str(r.get("http_error") or r.get("status")) for r in answered})
            return {"verdict": "REACHED BUT REFUSED — the provider answered every request "
                               "with an error (%s). That is a fact about the request or the "
                               "provider, NOT about the network; read the recorded status and "
                               "body before concluding anything about availability."
                               % "; ".join(codes),
                    "controls": None, "date_bounding": None}
        return {"verdict": "NO CONCLUSION — nothing was reached. This is a statement "
                           "about the network path, not about the provider (rule 13).",
                "controls": None, "date_bounding": None}
    controls = [n for n in by_name if n.startswith("CONTROL_")]
    ctrl_verdicts = {n: by_name[n].get("classification") for n in controls}
    silent = [n for n, v in ctrl_verdicts.items() if v == "ignored"]
    real = [n for n, r in by_name.items()
            if not n.startswith("CONTROL_") and n != "baseline"
            and r.get("classification") == "changed_composition"]
    if silent:
        control_note = ("UNKNOWN PARAMETERS ARE SILENTLY ACCEPTED (%s returned the baseline's "
                        "composition with status 200). Every 200 in this run is therefore "
                        "uninformative on its own; only a MOVED composition is evidence."
                        % ", ".join(sorted(silent)))
    else:
        control_note = ("Bogus parameters were refused or changed the response, so this "
                        "provider validates its input and a refusal carries information.")
    if real:
        date_bounding = ("CANDIDATE FOUND: %s moved the composition. Date-bounded ADP may be "
                         "available; confirm the direction (a narrower window must report "
                         "FEWER drafts) before relying on it." % ", ".join(sorted(real)))
    else:
        date_bounding = ("NO member of the recorded candidate set bounded the window. That is a "
                         "statement about THIS SET, not about the provider — the set ships in "
                         "`candidates` so the null is interpretable and extendable.")
    return {"controls": control_note, "date_bounding": date_bounding,
            "candidates_tried": sorted(by_name)}


def aggregate_spans_the_season(by_year: dict) -> dict:
    """Does a year-scoped ADP number accumulate across that season?

    One run cannot watch a number grow, but it can compare a COMPLETE season with
    one IN PROGRESS. If 2025 (finished) reports far more drafts than 2026 (mid
    August), the year figure is an accumulating aggregate — which means a
    completed season's ADP NECESSARILY includes drafts later than any given
    league's, and cannot serve as that league's pre-draft board under F5.
    """
    done, live = by_year.get("2025"), by_year.get("2026")
    if not done or not live or done.get("total_drafts") is None or live.get("total_drafts") is None:
        return {"answer": "unknown — one or both years unreadable", "detail": by_year}
    if done["total_drafts"] > live["total_drafts"]:
        return {"answer": "YES — the year figure accumulates across the season",
                "detail": "2025 (complete) %d drafts vs 2026 (in progress) %d; so a completed "
                          "season's aggregate contains drafts later than any league drafting in "
                          "August, and using it as that league's pre-draft board violates F5"
                          % (done["total_drafts"], live["total_drafts"])}
    return {"answer": "NOT DEMONSTRATED by this comparison",
            "detail": "2025 %s vs 2026 %s" % (done["total_drafts"], live["total_drafts"])}


# ── the fetch, CI only ──────────────────────────────────────────────────────
def _get(url, params):  # pragma: no cover  (egress; CI only)
    """A SERVER THAT ANSWERED IS NOT A SERVER WE NEVER REACHED.

    `urlopen` raises `HTTPError` on 4xx/5xx, and the first cut caught it under a
    bare `except Exception` and filed it as `transport_error` — so a plain 404
    was indistinguishable from a blocked network path. That conflation cost a
    real answer: the FFC arm reported "nothing was reached" and I wrote that up
    as "I probably guessed the path". The path was right — it matches the shipped
    client in `draft/adp.py`. The error handling was wrong, and it manufactured a
    NETWORK verdict out of an HTTP one, which is rule 13's own confusion one
    level down.

    `HTTPError` IS a response: it carries a status and usually a body naming the
    reason, and a probe that discards them has thrown away its answer.
    """
    import urllib.error
    import urllib.parse
    import urllib.request
    full = url + "?" + urllib.parse.urlencode(params)

    def _read(status, raw):
        body = raw.decode("utf-8", "replace") if isinstance(raw, bytes) else (raw or "")
        try:
            return {"status": status, "payload": json.loads(body)}
        except json.JSONDecodeError:
            return {"status": status, "payload": None, "error": "non-JSON body",
                    "body_head": body[:300]}

    req = urllib.request.Request(full, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=45) as r:
            return _read(r.status, r.read())
    except urllib.error.HTTPError as e:
        try:
            raw = e.read()
        except Exception:
            raw = b""
        got = _read(e.code, raw)
        got["http_error"] = "%s %s" % (e.code, e.reason)
        return got
    except Exception as e:
        return {"status": None, "payload": None,
                "transport_error": "%s: %s" % (type(e).__name__, e)}


def probe(year="2026"):  # pragma: no cover  (egress; CI only)
    url = "%s/%s/export" % (MFL_HOST, year)
    rows, baseline = [], None
    for name, extra in MFL_CANDIDATES:
        params = dict(MFL_BASE, **extra)
        got = _get(url, params)
        row = {"name": name, "params": extra, "status": got.get("status"),
               "transport_error": got.get("transport_error"), "error": got.get("error"),
               "http_error": got.get("http_error"), "body_head": got.get("body_head"),
               "composition": composition(got.get("payload")) if got.get("payload") else None}
        if name == "baseline":
            baseline = row
        row["classification"] = "baseline" if name == "baseline" else classify(baseline or {}, row)
        rows.append(row)

    by_year = {}
    for y in ("2025", "2026"):
        got = _get("%s/%s/export" % (MFL_HOST, y), MFL_BASE)
        by_year[y] = composition(got.get("payload")) if got.get("payload") else {"total_drafts": None}

    ffc_rows, ffc_base = [], None
    for name, extra in FFC_CANDIDATES:
        got = _get(FFC_HOST + "/api/v1/adp/half-ppr",
                   dict({"teams": "10", "year": year, "position": "all"}, **extra))
        p = got.get("payload") or {}
        comp = {"total_drafts": p.get("meta", {}).get("total_drafts") if isinstance(p.get("meta"), dict) else None,
                "players": len(p.get("players") or []),
                "top5": [{"id": str(x.get("player_id")), "adp": x.get("adp")}
                         for x in (p.get("players") or [])[:5]]}
        row = {"name": name, "params": extra, "status": got.get("status"),
               "transport_error": got.get("transport_error"),
               "http_error": got.get("http_error"), "error": got.get("error"),
               "body_head": got.get("body_head"),
               "composition": comp if p else None}
        if name == "baseline":
            ffc_base = row
        row["classification"] = "baseline" if name == "baseline" else classify(ffc_base or {}, row)
        ffc_rows.append(row)

    out = {
        "question": "can pre-draft ADP be reconstructed AS OF a past date, or must it be "
                    "snapshotted live?",
        "year": year,
        "mfl": {"rows": rows, "verdict": verdict(rows)},
        "mfl_year_aggregate": {"by_year": by_year,
                               "spans_the_season": aggregate_spans_the_season(by_year)},
        "ffc": {"rows": ffc_rows, "verdict": verdict(ffc_rows)},
        "reading": "A NEGATIVE HERE IS ABOUT THE CANDIDATE SET, NOT THE PROVIDER (rule 13). "
                   "It is still decision-relevant: if no recorded candidate bounds the window "
                   "and the year figure accumulates, then the 2026 pre-draft curve is only "
                   "observable while it is happening, and snapshot cadence is perishable in a "
                   "way the other three unregistered criteria are not.",
    }
    (HERE / "adp_asof_probe.json").write_text(json.dumps(out, indent=1))
    print(json.dumps({"mfl": out["mfl"]["verdict"], "ffc": out["ffc"]["verdict"],
                      "aggregate": out["mfl_year_aggregate"]["spans_the_season"]}, indent=1))
    return out


if __name__ == "__main__":  # pragma: no cover
    probe(sys.argv[1] if len(sys.argv) > 1 else "2026")
