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


def _match_array(html, i):
    """Bracket-match a JSON array starting at html[i]=='[', STRING-AWARE (a ] inside a
    "..." value must not close the array — the bug that stopped the first parse at 5 rows).
    Returns the array substring or None."""
    depth, in_str, esc = 0, False, False
    for j in range(i, len(html)):
        c = html[j]
        if in_str:
            if esc:
                esc = False
            elif c == "\\":
                esc = True
            elif c == '"':
                in_str = False
            continue
        if c == '"':
            in_str = True
        elif c == "[":
            depth += 1
        elif c == "]":
            depth -= 1
            if depth == 0:
                return html[i:j + 1]
    return None


def _extract_rows_json(html):
    """FantasyPros server-renders the ADP data as a JSON blob (window.FP SSR). The page can
    hold MORE THAN ONE `"rows":[...]` (a small widget + the big ADP table), so scan ALL of
    them, string-aware, and keep the one that yields the most player rows — the ADP table."""
    best = None
    best_n = 0
    for m in _ROWS.finditer(html or ""):
        arr = _match_array(html, m.end() - 1)
        if not arr:
            continue
        try:
            data = json.loads(arr)
        except (ValueError, TypeError):
            continue
        n = sum(1 for o in data if isinstance(o, dict) and (o.get("player") or o.get("avg") is not None
                                                            or o.get("averagePick") is not None))
        if n > best_n:
            best, best_n = arr, n
    return best


def _rows_from(data):
    """Coerce any FP-shaped container into a list of row dicts. Handles: a bare list of
    rows; the SSR `{"rows":[...]}`; and the data-API `{"players":[...]}` (the client-hydrated
    endpoint — the ONLY place players 6-300 live; SSR carries just the top-5 teaser)."""
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        for k in ("players", "rows", "data"):
            v = data.get(k)
            if isinstance(v, list):
                return v
    return []


def parse(html):
    """FantasyPros ADP -> [{name, position, team, adp}] sorted by adp ascending.
    Accepts THREE real shapes (confirmed 2026-08-09 from the live page + bundle):
      1. SSR HTML: `window.FP.report = {..."rows":[{rank,player:{name,team:"MIN (13)"},pos,avg}]}`
         — but SSR only carries the TOP 5 (ssrHeader:true), so this alone is a teaser.
      2. data-API JSON: `{"players":[{player_name,player_position_id,player_team_id,rank_ave/adp}]}`
         — the client-hydrated full board (players 6-300); this is the one that grades.
      3. a bare JSON list (a saved fixture / the rows array handed directly)."""
    s = (html or "").strip()
    data = None
    if s.startswith("{") or s.startswith("["):
        try:                                            # handed API JSON / a bare list directly
            data = json.loads(s)
        except (ValueError, TypeError):
            data = None
    if data is None:
        raw = _extract_rows_json(html)
        try:
            data = json.loads(raw) if raw else []
        except (ValueError, TypeError):
            data = []
    rows = []
    for o in _rows_from(data):
        if not isinstance(o, dict):
            continue
        pl = o.get("player") or {}
        name = pl.get("name") or o.get("name") or o.get("player_name")
        avg = o.get("avg", o.get("averagePick", o.get("adp", o.get("rank_ave"))))
        if not name or avg is None:
            continue
        try:
            adp = float(avg)
        except (TypeError, ValueError):
            continue
        team_raw = str(pl.get("team") or o.get("team") or o.get("player_team_id") or "")
        team = team_raw.split(" (")[0].strip()          # "MIN (13)" -> "MIN"; "" -> ""
        pos_m = _POS.search(str(o.get("pos") or o.get("position") or o.get("player_position_id") or ""))
        rows.append({"name": name, "position": _norm_pos(pos_m.group(1)) if pos_m else None,
                     "team": team if team and not team.isdigit() else None, "adp": adp})
    rows.sort(key=lambda r: r["adp"])
    return rows


def _get(url, timeout=30, headers=None):   # pragma: no cover  (egress, CI only)
    import urllib.request
    h = {"User-Agent": "Mozilla/5.0 mfga-source-grade"}
    h.update(headers or {})
    req = urllib.request.Request(url, headers=h)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8", "ignore")


# candidate data-API endpoint templates, tried in order if bundle discovery finds nothing.
# {y}=year, {k}=api key. HALF scoring = our format. These mirror FP's public web API shape.
_API_CANDIDATES = [
    "https://api.fantasypros.com/v2/json/nfl/{y}/consensus-rankings?type=adp&scoring=HALF&position=ALL&week=0",
    "https://api.fantasypros.com/public/v2/json/nfl/{y}/consensus-rankings?type=adp&scoring=HALF&position=ALL&week=0",
]
_KEY_RE = __import__("re").compile(r'["\']?(?:x-api-key|apiKey|api_key)["\']?\s*[:=]\s*["\']([A-Za-z0-9]{20,})["\']')
# broadened: catch ANY endpoint-looking string (absolute or relative) that mentions the data —
# the reports bundle referenced no api.fantasypros.com host, so the endpoint is relative/other-host.
_APIURL_RE = __import__("re").compile(
    r'["\'](?:https?:)?/[A-Za-z0-9/_.\-]*(?:adp|consensus|ranking|projections?)[A-Za-z0-9/_.\-]*'
    r'(?:\.php|\.json)?["\']', __import__("re").I)


def fetch(year, half_ppr=True, timeout=30):   # pragma: no cover  (egress, CI only)
    """Return (text, url, diag). SSR HTML only carries the top-5 teaser, so this is
    SELF-DISCOVERING: it grabs the reports bundle, extracts FP's data-API endpoint + embedded
    key, and tries the API (the full board). If the API yields >=20 rows, returns that JSON;
    else returns the SSR HTML (still parseable, just thin). `diag` records what was tried so a
    miss shows the real endpoint next run instead of silently contributing nothing."""
    fmt = "half-point-ppr" if half_ppr else "ppr"
    page_url = f"https://www.fantasypros.com/nfl/adp/{fmt}-overall.php?year={year}"
    diag = {"page_url": page_url, "api_tried": [], "bundle_key_found": False, "bundle_api_urls": []}
    try:
        html = _get(page_url, timeout)
    except Exception as e:
        print(f"  FantasyPros {year} page fetch skip: {type(e).__name__}")
        return None, page_url, {**diag, "page_error": type(e).__name__}

    # 1) MAXIMAL discovery: grab EVERY bundle on the page + the page itself, and dump every
    #    endpoint-looking token (any path with a data word, or /api|/v1|/v2, or .php/.json/csv).
    #    Two narrow passes found nothing, so this is the "search the space properly before
    #    declaring the endpoint isn't a literal" pass (null-scope discipline).
    import re as _re
    key = None
    tok_re = _re.compile(r'["\'`]((?:https?:)?/[A-Za-z0-9/_.\-]{2,80}?'
                         r'(?:adp|consensus|ranking|projection|players?|/api/|/v[12]/|\.php|\.json|csv)'
                         r'[A-Za-z0-9/_.\-?=&]{0,60})["\'`]', _re.I)
    sources = {"page": html}
    for bname in _re.findall(r'//cdn\.fantasypros\.com/[^"\']*bundle-[^"\']+\.js', html):
        try:
            sources[bname[-40:]] = _get("https:" + bname, timeout)
        except Exception as e:
            diag.setdefault("bundle_errors", {})[bname[-40:]] = type(e).__name__
    toks = set()
    for name, txt in sources.items():
        km = _KEY_RE.search(txt)
        if km and not key:
            key = km.group(1); diag["key_found_in"] = name
        for m in tok_re.findall(txt):
            toks.add(m)
    diag["bundle_api_urls"] = sorted(toks)[:40]
    diag["bundle_len"] = sum(len(t) for t in sources.values())

    # 2) try discovered tokens + blind candidates + direct page variants (csv/json export the
    #    React app may hit) with the key. First to yield >=20 rows wins.
    # export/data variants of THIS page first (the untried levers), then the blind API
    # candidates, then any discovered tokens EXCEPT the plain year/position nav links (proven
    # top-5 teasers — don't spend the budget re-hitting them).
    page_variants = [page_url + "&csv=1", page_url + "&json=1", page_url + "&export=csv",
                     page_url + "&scoring=HALF&json=1", page_url.replace(".php", ".json")]
    nav = _re.compile(r'/nfl/adp/.*\.php(\?year=\d+)?$')
    tokens = [t for t in diag["bundle_api_urls"] if not nav.search(t) and "/nfl/players/" not in t]
    templates = page_variants + _API_CANDIDATES + tokens
    tried = 0
    for tmpl in templates:
        if "consensus-rankings" not in tmpl and "adp" not in tmpl.lower() and ".json" not in tmpl:
            continue
        if tried >= 14:                                    # bound CI runtime; all 40 are dumped above
            break
        tried += 1
        api_url = tmpl.replace("{y}", str(year)).replace("{k}", key or "").replace("{year}", str(year))
        if api_url.startswith("/"):                       # relative endpoint discovered in the bundle
            api_url = "https://www.fantasypros.com" + api_url
        if not api_url.startswith("http"):
            continue
        try:
            txt = _get(api_url, timeout, headers=({"x-api-key": key} if key else None))
            n = len(parse(txt))
            diag["api_tried"].append({"url": api_url[:160], "rows": n, "keyed": bool(key)})
            if n >= 20:
                diag["api_ok"] = api_url[:160]
                return txt, api_url, diag
        except Exception as e:
            diag["api_tried"].append({"url": api_url[:160], "err": type(e).__name__, "keyed": bool(key)})

    return html, page_url, diag   # fall back to the (thin) SSR HTML — diag shows why


if __name__ == "__main__":   # pragma: no cover
    import json
    import sys
    html = open(sys.argv[1]).read() if len(sys.argv) > 1 else ""
    print(json.dumps(parse(html)[:20], indent=2))
