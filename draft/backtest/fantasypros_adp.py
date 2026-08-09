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
import re

PARSE_FLOOR = 20
_POS = re.compile(r"\b(QB|RB|WR|TE|K|DST|DEF)\d*\b")   # FP prints "WR1"/"RB12" — allow the rank suffix
_TEAM_PARENS = re.compile(r"\(([A-Z]{2,3})\)")
_FLOAT = re.compile(r"\d+\.\d+")
_TR = re.compile(r"<tr\b[^>]*>(.*?)</tr>", re.I | re.S)
_TD = re.compile(r"<td\b[^>]*>(.*?)</td>", re.I | re.S)
_ATAG = re.compile(r"<a\b[^>]*>(.*?)</a>", re.I | re.S)
_TAGS = re.compile(r"<[^>]+>")


def _text(html):
    return re.sub(r"\s+", " ", _TAGS.sub(" ", html or "")).strip()


def _norm_pos(p):
    if not p:
        return None
    p = p.upper()
    return "DEF" if p == "DST" else p


def parse(html):
    """FantasyPros ADP HTML -> [{name, position, team, adp}] sorted by adp ascending.
    Defensive: reads each row, takes the linked player name, the (TEAM) in parens, the
    first QB/RB/WR/TE/K/DST token as position, and the ADP as the LAST float in the row
    (the AVG/consensus column on FP's board). Rows without a name+adp are skipped."""
    rows = []
    for tr in _TR.findall(html or ""):
        tds = _TD.findall(tr)
        if len(tds) < 2:
            continue
        # player name: the first <a> text in the row (the player-label link)
        name = None
        for td in tds:
            a = _ATAG.search(td)
            if a:
                cand = _text(a.group(1))
                if cand and not cand.isdigit():
                    name = cand
                    break
        if not name:
            continue
        rowtext = _text(tr)
        team_m = _TEAM_PARENS.search(rowtext)
        pos_m = _POS.search(rowtext)
        floats = _FLOAT.findall(rowtext)
        if not floats:
            continue
        try:
            adp = float(floats[-1])          # AVG column = last float on FP's row
        except ValueError:
            continue
        rows.append({"name": name, "position": _norm_pos(pos_m.group(1)) if pos_m else None,
                     "team": team_m.group(1) if team_m else None, "adp": adp})
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
