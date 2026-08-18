# TERRITORY: C
"""CENSUS STAGE 2 — parse real 2026 season projection tables from the six
sources stage 1 found reachable (ROUTES.md, A -> C, 2026-08-18).

URLs, position codes and parse targets are NOT guessed — pulled from
`ffanalytics`'s own maintained scraper (`source_scrapes.R`, fetched via
WebFetch on raw.githubusercontent.com 2026-08-18, the one host this
sandbox's egress block does not cover). That still leaves real risk: a site
can have changed its markup since ffanalytics's code was written, and this
sandbox cannot browse the live pages to check (every candidate host 403s at
CONNECT here — confirmed stage 1). So EVERY source carries a PLANTED-VALUE
CONTROL, per this ask's own instruction: "a scraper that cannot find a known
number must not report a table." A parser that silently returns garbage on
a changed page is worse than one that reports VOID.

THE CONTROL: the top 15 players by `overall_rank` on our OWN committed
board (`public/draft_data.json`) — real, current, universally-drafted names.
A genuine 2026 season-projection table must contain a meaningful fraction of
them. `MIN_CONTROL_HITS` names found -> the table is trusted; fewer -> VOID,
named, not guessed at.

SIX SOURCES, TWO KINDS OF RISK NAMED HONESTLY RATHER THAN PAPERED OVER:
  - CBS, NumberFire, FFToday: real HTML tables, parsed via `pandas.read_html`
    (robust to minor markup drift, unlike a brittle single CSS selector) plus
    the control.
  - Walterfootball: not scraped at all — ffanalytics downloads a committed
    .xlsx file directly (`fantasy{season}rankingsexcel.xlsx`).
  - ESPN: a JSON API, not HTML. Its response carries per-stat-category
    values, not one number — ffanalytics recomputes a total from them, which
    this module does not reproduce (their per-stat column mapping cannot be
    verified without a live response to inspect). This tries ESPN's
    documented `appliedTotal` convention as a best-effort SINGLE field read,
    gated by the SAME control, and reports VOID rather than a fabricated
    number if that field is absent.
  - FantasyFootballNerd: ffanalytics's OWN code calls it with
    `apikey=TEST` — a demo placeholder, not a working credential. NOT
    attempted here; reported VOID BY NAME rather than burning a request on a
    known-blocked path. We do not hold a paid FantasyFootballNerd API key.

SCORING BASIS IS NOT NORMALIZED TO OUR LEAGUE. Each source publishes its own
default scoring convention (standard/half/full PPR) and this captures that
number AS PUBLISHED — the deliverable is a DISPLAY-ONLY disagreement badge
(published facts, no board number moves, per this ask), not a ceiling input,
so a per-source scoring mismatch is a real caveat to carry in the artifact,
not a blocker to capturing it.

CI-ONLY — every candidate host 403s at CONNECT from this sandbox (stage 1).

Run: python3 draft/backtest/discovery_projection_spread_capture.py
Reads public/draft_data.json (control names, committed).
Writes draft/backtest/discovery_projection_spread_capture.json (full
per-source detail) and, only if >=3 sources validate,
public/projection_spread_2026.json (the display artifact).
"""
from __future__ import annotations

import json
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
BOARD_PATH = ROOT / "public" / "draft_data.json"
DETAIL_OUT = HERE / "discovery_projection_spread_capture.json"
SPREAD_OUT = ROOT / "public" / "projection_spread_2026.json"

SEASON = 2026
POSITIONS = ("QB", "RB", "WR", "TE")
MIN_CONTROL_HITS = 5

CBS_POS = {"QB": "QB", "RB": "RB", "WR": "WR", "TE": "TE"}
FFTODAY_POS = {"QB": 10, "RB": 20, "WR": 30, "TE": 40}
ESPN_SLOT = {"QB": 0, "RB": 2, "WR": 4, "TE": 6}

#: The three FantasyFootballNerd needs a real key ffanalytics itself does
#: not have either (its own code ships `apikey=TEST`) — not a fetch bug,
#: a real entitlement gap, named rather than attempted with a fake key.
FFNERD_BLOCKED_REASON = ("requires a paid FantasyFootballNerd API key -- "
                         "ffanalytics's own scraper uses a TEST placeholder "
                         "key, not a working one, and we hold no key")


def _norm(name: str) -> str:
    """Same normalization discipline as expert_grading._norm -- one
    definition, reused rather than re-invented (rule 11)."""
    s = re.sub(r"[^a-z ]", "", (name or "").lower().replace(".", " "))
    s = re.sub(r"\b(jr|sr|ii|iii|iv|v)\b", "", s)
    return re.sub(r"\s+", " ", s).strip()


def control_names() -> set[str]:
    """Top-15 by overall_rank on our own committed board -- names a real
    2026 season-projection table almost certainly contains."""
    doc = json.loads(BOARD_PATH.read_text())
    players = [p for p in doc.get("players") or [] if p.get("overall_rank")]
    players.sort(key=lambda p: p["overall_rank"])
    return {_norm(p["name"]) for p in players[:15] if p.get("name")}


def _get(url, timeout=25, headers=None):
    import requests
    h = {"User-Agent": "Mozilla/5.0 (compatible; maga-league-projection-capture/1.0)"}
    if headers:
        h.update(headers)
    resp = requests.get(url, timeout=timeout, headers=h)
    resp.raise_for_status()
    return resp


#: A CBS-style combined cell packs "Name  POS  TEAM" (or "NamePOSTEAM" with no
#: separating space, when pandas.read_html merges adjacent text nodes) into
#: ONE cell rather than separate columns. ffanalytics's own scraper needs the
#: identical extraction from raw HTML text (`tidyr::extract` with a regex
#: matching this exact shape) — confirmed via its actual scrape_cbs source,
#: not guessed. Applied to EVERY HTML/table source, not just CBS: a table
#: that already carries a clean name column is unaffected (the regex simply
#: fails to match and the raw string is kept), so this is safe as a default
#: rather than a per-source special case.
_POS_CODES = ("QB", "RB", "WR", "TE", "K", "DST", "DEF", "PK", "FB")
_TRAILING_POS_TEAM = re.compile(
    r"^(?P<name>.+?)\s*(?:%s)\s*[A-Z]{2,4}\s*$" % "|".join(_POS_CODES))


def _clean_name(raw):
    s = re.sub(r"\s+", " ", str(raw)).strip()
    m = _TRAILING_POS_TEAM.match(s)
    if m and m.group("name"):
        return m.group("name").strip()
    return s


def _best_table(html, name_hints=("player", "name"),
                points_hints=("fpts", "pts", "points", "proj", "fp", "total")):
    """Every table on the page via pandas.read_html; pick the one whose
    columns look like a player/points table. Returns (name_col, points_col,
    DataFrame) or None -- robust to markup drift a single CSS selector isn't,
    per the module docstring."""
    import io as _io
    import pandas as pd
    try:
        # StringIO, not the raw string: pandas ≥2.1 deprecated (and the CI
        # runner's build now REJECTS) literal HTML passed to read_html — it
        # treats the markup as a file path and raises FileNotFoundError.
        # Found by the board gate on 2026-08-18: 12/12 green on the older
        # local pandas, 3 red on the runner's. Same code, two behaviours —
        # the wrap is correct on both.
        tables = pd.read_html(_io.StringIO(html))
    except ValueError:
        return None
    for df in tables:
        cols = [str(c).strip().lower() for c in df.columns]
        name_col = next((df.columns[i] for i, c in enumerate(cols)
                         if any(h in c for h in name_hints)), None)
        pts_col = next((df.columns[i] for i, c in enumerate(cols)
                        if any(h in c for h in points_hints)), None)
        if name_col is not None and pts_col is not None and len(df) >= 10:
            return name_col, pts_col, df
    return None


def _rows_from_table(name_col, pts_col, df, position):
    out = []
    for _, row in df.iterrows():
        name = _clean_name(row[name_col])
        pts = row[pts_col]
        try:
            pts = float(re.sub(r"[^0-9.\-]", "", str(pts)))
        except ValueError:
            continue
        if not name or name.lower() == "nan":
            continue
        out.append({"name": name, "position": position, "points": pts})
    return out


def fetch_cbs(position):
    url = ("https://www.cbssports.com/fantasy/football/stats/%s/%d/"
          "restofseason/projections/nonppr/" % (CBS_POS[position], SEASON))
    html = _get(url).text
    found = _best_table(html)
    if not found:
        return [], url
    name_col, pts_col, df = found
    return _rows_from_table(name_col, pts_col, df, position), url


def fetch_numberfire(position):
    url = "https://www.numberfire.com/nfl/fantasy/remaining-projections/%s" % position.lower()
    html = _get(url).text
    found = _best_table(html)
    if not found:
        return [], url
    name_col, pts_col, df = found
    return _rows_from_table(name_col, pts_col, df, position), url


def fetch_fftoday(position):
    url = "https://www.fftoday.com/rankings/playerproj.php?PosID=%d&LeagueID=1" % FFTODAY_POS[position]
    html = _get(url).text
    found = _best_table(html)
    if not found:
        return [], url
    name_col, pts_col, df = found
    return _rows_from_table(name_col, pts_col, df, position), url


def fetch_walterfootball():
    """One file, every position -- downloaded, not scraped."""
    import pandas as pd
    import io
    url = "http://walterfootball.com/fantasy%drankingsexcel.xlsx" % SEASON
    content = _get(url).content
    xl = pd.ExcelFile(io.BytesIO(content))
    rows = []
    for sheet in xl.sheet_names:
        pos = next((p for p in POSITIONS if p.lower() in sheet.lower()), None)
        if not pos:
            continue
        df = xl.parse(sheet)
        cols = [str(c).strip().lower() for c in df.columns]
        name_col = next((df.columns[i] for i, c in enumerate(cols) if "name" in c or "player" in c), None)
        pts_col = next((df.columns[i] for i, c in enumerate(cols)
                        if "fpts" in c or "point" in c or "proj" in c), None)
        if name_col is not None and pts_col is not None:
            rows.extend(_rows_from_table(name_col, pts_col, df, pos))
    return rows, url


def fetch_espn(position):
    """Best-effort: ESPN's documented `appliedTotal` per-player field.
    ffanalytics itself recomputes a total from raw per-category stats
    instead (unverifiable here without a live response) -- this reads the
    simpler, commonly-documented field and VOIDs if absent rather than
    guessing a stat-id mapping blind."""
    url = ("https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/"
          "%d/segments/0/leaguedefaults/3?scoringPeriodId=0&view=kona_player_info" % SEASON)
    headers = {
        "Accept": "application/json",
        "X-Fantasy-Source": "kona",
        "X-Fantasy-Filter": json.dumps({
            "players": {"filterSlotIds": {"value": [ESPN_SLOT[position]]},
                       "filterStatsForSourceIds": {"value": [1]}}}),
    }
    doc = _get(url, headers=headers).json()
    rows = []
    for p in (doc.get("players") or []):
        player = p.get("player") or {}
        name = player.get("fullName")
        total = None
        for stat in (player.get("stats") or []):
            if stat.get("statSourceId") == 1 and stat.get("appliedTotal") is not None:
                total = stat["appliedTotal"]
                break
        if name and total is not None:
            rows.append({"name": name, "position": position, "points": float(total)})
    return rows, url


#: name -> (fetch_fn, needs_position) -- needs_position sources are called
#: once per POSITIONS entry; the rest once total.
SOURCES = {
    "cbs": (fetch_cbs, True),
    "numberfire": (fetch_numberfire, True),
    "fftoday": (fetch_fftoday, True),
    "walterfootball": (fetch_walterfootball, False),
    "espn": (fetch_espn, True),
}


def capture_source(name, controls):  # pragma: no cover  (egress; CI only)
    if name == "fantasyfootballnerd":
        return {"source": name, "status": "VOID", "reason": FFNERD_BLOCKED_REASON}
    fetch_fn, needs_position = SOURCES[name]
    all_rows, urls = [], []
    try:
        if needs_position:
            for pos in POSITIONS:
                rows, url = fetch_fn(pos)
                all_rows.extend(rows)
                urls.append(url)
        else:
            rows, url = fetch_fn()
            all_rows.extend(rows)
            urls.append(url)
    except Exception as exc:                                    # noqa: BLE001
        return {"source": name, "status": "VOID",
               "reason": "%s: %s" % (type(exc).__name__, exc), "urls": urls}

    found_names = {_norm(r["name"]) for r in all_rows}
    hits = len(controls & found_names)
    # ⚠️ SAMPLE NAMES ARE CARRIED ON VOID TOO, not only on success. The first
    # dispatch found CBS/Walterfootball parsing REAL row counts (377/247)
    # with 0/15 control hits and gave the next reader nothing to diagnose
    # from but a guess — this is that fix: whatever the parser actually
    # extracted is now in the artifact, so a repeat mismatch is read, not
    # re-guessed.
    sample = [r["name"] for r in all_rows[:8]]
    if hits < MIN_CONTROL_HITS:
        return {"source": name, "status": "VOID",
               "reason": "planted-value control failed: only %d/%d known top "
                         "players found in %d parsed rows -- the parser is "
                         "not trusted to have found a real table"
                         % (hits, len(controls), len(all_rows)),
               "control_hits": hits, "rows_parsed": len(all_rows), "urls": urls,
               "sample_names": sample}

    return {"source": name, "status": "OK", "control_hits": hits,
           "rows_parsed": len(all_rows), "urls": urls, "sample_names": sample,
           "rows": all_rows}


def capture_all() -> dict:  # pragma: no cover  (egress; CI only)
    controls = control_names()
    results = {name: capture_source(name, controls)
              for name in list(SOURCES) + ["fantasyfootballnerd"]}
    ok = [n for n, r in results.items() if r["status"] == "OK"]
    return {
        "_territory": "TERRITORY: C — produced by discovery_projection_spread_capture.py",
        "_note": "Stage 2 of the ffanalytics ask (ROUTES.md A->C 2026-08-18). "
                 "Each source's own default scoring convention, NOT normalized "
                 "to our league's rules -- a display-only disagreement badge, "
                 "not a ceiling input (per the ask).",
        "control_names_used": sorted(controls),
        "min_control_hits": MIN_CONTROL_HITS,
        "sources": results,
        "validated_sources": ok,
        "validated_count": len(ok),
        "clears_3_source_bar": len(ok) >= 3,
    }


def build_spread(capture: dict) -> dict:
    """PURE. Joins validated sources' rows by normalized name -> per-player
    n_sources/min/median/max/spread. A player only ONE source names is not
    a spread -- excluded, named in `single_source_dropped`."""
    import statistics as st

    by_player: dict[str, dict] = {}
    used = []
    for name, result in capture["sources"].items():
        if result["status"] != "OK":
            continue
        used.append(name)
        for r in result["rows"]:
            key = _norm(r["name"])
            if not key:
                continue
            d = by_player.setdefault(key, {"name": r["name"], "position": r["position"], "points": {}})
            d["points"][name] = r["points"]

    out_rows, dropped = [], 0
    for key, d in by_player.items():
        pts = list(d["points"].values())
        if len(pts) < 2:
            dropped += 1
            continue
        out_rows.append({
            "name": d["name"], "position": d["position"],
            "n_sources": len(pts), "sources": sorted(d["points"]),
            "min_points": round(min(pts), 1), "median_points": round(st.median(pts), 1),
            "max_points": round(max(pts), 1), "spread": round(max(pts) - min(pts), 1),
        })
    out_rows.sort(key=lambda r: -r["spread"])

    return {
        "_territory": "TERRITORY: C — produced by discovery_projection_spread_capture.py",
        "_note": "Per-source scoring conventions differ and are NOT normalized "
                 "-- part of the spread reflects real disagreement, part "
                 "reflects scoring-format differences across sources. "
                 "Display-only: not blended into proj_ceiling/proj_mean.",
        "season": SEASON,
        "sources_used": sorted(used),
        "players": out_rows,
        "single_source_players_dropped": dropped,
    }


def main() -> int:  # pragma: no cover  (egress; CI only)
    capture = capture_all()
    DETAIL_OUT.write_text(json.dumps(capture, indent=2) + "\n")
    print("validated %d/%d sources: %s" % (
        capture["validated_count"], len(capture["sources"]), capture["validated_sources"]))
    for name, r in capture["sources"].items():
        if r["status"] != "OK":
            print("  VOID %s: %s" % (name, r.get("reason")))

    if not capture["clears_3_source_bar"]:
        print("< 3 sources validated -- that is a real answer; NOT writing "
             "public/projection_spread_2026.json")
        return 0

    spread = build_spread(capture)
    SPREAD_OUT.write_text(json.dumps(spread, indent=2) + "\n")
    print("wrote %s: %d players, %d dropped (single-source)"
         % (SPREAD_OUT.name, len(spread["players"]), spread["single_source_players_dropped"]))
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
