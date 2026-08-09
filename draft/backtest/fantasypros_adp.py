#!/usr/bin/env python3
"""FANTASYPROS ADP — the THIRD gradeable source, and a closer format match than MFL.

FantasyPros publishes a consensus ADP aggregated from commissioner sites (revealed drafter
behavior, the kind that cleared our null — not paid expert rankings), free, back to 2015,
and critically in **HALF-POINT PPR** — OUR format, where MFL only offered full-PPR. So it
is both the tiebreaker on the directional FFC-vs-MFL finding AND the source whose scoring
matches ours without a format offset.

The page is HTML (no clean JSON/CSV field the probe could confirm), so this is a defensive
REGEX parser — no bs4 in the Lab image. parse(html) -> [{name, position, team, adp}],
mirroring mfl_adp.parse so it drops straight into exp_source_grade's crosswalk.

SELF-DIAGNOSING (the no-silent-failure rule): the probe only captured FP's experts-modal,
not the ADP data table, so the exact column layout is unconfirmed. If a fetch parses fewer
than PARSE_FLOOR rows, egress saves the raw head to the result so the NEXT run shows the
real structure instead of silently contributing nothing — a parse miss must look like a
miss, not an absent source. Unit-tested on a synthetic FP-shaped table.
"""
from __future__ import annotations
import json
import re

PARSE_FLOOR = 20
_POS = re.compile(r"\b(QB|RB|WR|TE|K|DST|DEF)\d*\b")   # FP prints "WR1"/"RB12" — allow the rank suffix
_ROWS = re.compile(r'"rows"\s*:\s*\[')


def _norm_pos(p):
    if not p:
        return None
    p = p.upper()
    return "DEF" if p == "DST" else p


def _extract_rows_json(html):
    """FantasyPros server-renders the ADP data as a JSON blob (window.FP SSR): a
    `"rows":[ {...}, ... ]` array. Find it and bracket-match to the closing ]."""
    m = _ROWS.search(html or "")
    if not m:
        return None
    i = m.end() - 1                          # index of the opening '['
    depth = 0
    for j in range(i, len(html)):
        c = html[j]
        if c == "[":
            depth += 1
        elif c == "]":
            depth -= 1
            if depth == 0:
                return html[i:j + 1]
    return None


def parse(html):
    """FantasyPros ADP page -> [{name, position, team, adp}] sorted by adp ascending.
    FP embeds the data as JSON, NOT an HTML table (confirmed 2026-08-09 from the live page):
    rows are {rank, player:{name, team:"MIN (13)", url}, pos:"WR1", avg}. `avg` is the
    consensus ADP. Also accepts a bare JSON list (a saved fixture)."""
    raw = _extract_rows_json(html)
    if raw is None:
        # tolerate being handed the rows array / list directly (fixtures, tests)
        s = (html or "").strip()
        raw = s if s.startswith("[") else None
    try:
        data = json.loads(raw) if raw else []
    except (ValueError, TypeError):
        data = []
    rows = []
    for o in data:
        if not isinstance(o, dict):
            continue
        pl = o.get("player") or {}
        name = pl.get("name") or o.get("name")
        avg = o.get("avg", o.get("averagePick", o.get("adp")))
        if not name or avg is None:
            continue
        try:
            adp = float(avg)
        except (TypeError, ValueError):
            continue
        team_raw = (pl.get("team") or o.get("team") or "")
        team = team_raw.split(" (")[0].strip()          # "MIN (13)" -> "MIN"; "" -> ""
        pos_m = _POS.search(str(o.get("pos") or o.get("position") or ""))
        rows.append({"name": name, "position": _norm_pos(pos_m.group(1)) if pos_m else None,
                     "team": team if team and not team.isdigit() else None, "adp": adp})
    rows.sort(key=lambda r: r["adp"])
    return rows


def fetch(year, half_ppr=True, timeout=30):   # pragma: no cover  (egress, CI only)
    """FP consensus ADP page for a year. half-point-ppr-overall = our format. Returns
    (html, url) or (None, url) on failure — a season that fails is skipped, not fatal."""
    import urllib.request
    fmt = "half-point-ppr" if half_ppr else "ppr"
    url = f"https://www.fantasypros.com/nfl/adp/{fmt}-overall.php?year={year}"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 mfga-source-grade"})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.read().decode("utf-8", "ignore"), url
    except Exception as e:
        print(f"  FantasyPros {year} fetch skip: {type(e).__name__}")
        return None, url


if __name__ == "__main__":   # pragma: no cover
    import json
    import sys
    html = open(sys.argv[1]).read() if len(sys.argv) > 1 else ""
    print(json.dumps(parse(html)[:20], indent=2))
