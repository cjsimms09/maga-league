# TERRITORY: C
"""GAME-DAY WEATHER — source-hunt item 1: "Weekly forecasts for outdoor
stadiums (free: NWS/open-meteo, zero key), joined to the schedule store.
Feeds K/DEF streaming and start/sit; wind is the one weather variable with
known kicker effect." `ROUTES.md` TO: C, 2026-08-21.

⚠️ REACHABILITY IS UNCONFIRMED FROM THIS SANDBOX, STATED PLAINLY RATHER THAN
ASSUMED (rule 3e/3f): both `api.open-meteo.com` and `api.weather.gov` return
a proxy 403 from this session, same as every non-nflverse host this session
has hit. Built the same way every other CI-gated capture this session was
built when a live check was impossible here: pure logic tested on realistic
fixtures, egress isolated and gated `--dry-run`/`# pragma: no cover`, and
the fetch REFUSES LOUDLY on an unrecognised response shape rather than
silently emitting a plausible-looking wrong number — the first real CI
dispatch is what actually confirms the field names below, not this module's
author. Do not trust a live run until that first dispatch's own known-
positive control (`verify_known_positive`) has been read and passed.

⚠️ THE STADIUM TABLE IS COMPILED, NOT FETCHED, AND SAYS SO ON EVERY ROW: no
reachable source this session found serves NFL venue/roof metadata (nfl_data_
py's `import_schedules` hits a non-nflverse host that is also blocked; no
nflverse-data release under `schedules`/`games` was found at any guessed
path). `STADIUM_INFO` is built from general knowledge as of this session,
each entry carries a `confidence` field, and three teams (LV, JAX, SEA) are
marked `"ambiguous"` rather than a clean outdoor/dome call, because their
real roof/canopy configurations do not reduce cleanly to the binary this
module needs. **Spot-check before trusting a start/sit decision on it** —
this is a compiled reference table, not a measurement.

ROOF POLICY, STATED EXPLICITLY: `dome` and `retractable` are BOTH excluded
from weather (no signal emitted, not a zero) — a retractable roof's actual
open/closed state on a given game day is not determinable from any source
this module has, and treating "retractable" as "outdoor" would silently
assert weather exposure on games played fully enclosed. This is a
conservative choice named here, not a hidden default.

Run: python3 draft/backtest/game_weather.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
DRAFT = HERE.parent
ROOT = DRAFT.parent

SCHEDULE = DRAFT / "data" / "nfl_schedule_2026.json"
OUT = HERE / "game_weather.json"

HIST_URL = "https://archive-api.open-meteo.com/v1/archive"
FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
HOURLY_VARS = "temperature_2m,wind_speed_10m,precipitation"

#: {team: {lat, lon, roof, confidence}} — COMPILED, NOT FETCHED (see
#: docstring). roof in {"outdoor", "dome", "retractable", "ambiguous"}.
#: Coordinates are the stadium's approximate location, precise enough for a
#: city-scale hourly forecast (this is not a siting question).
STADIUM_INFO = {
    "ARI": {"lat": 33.5276, "lon": -112.2626, "roof": "retractable", "confidence": "high"},
    "ATL": {"lat": 33.7554, "lon": -84.4008, "roof": "retractable", "confidence": "high"},
    "BAL": {"lat": 39.2780, "lon": -76.6227, "roof": "outdoor", "confidence": "high"},
    "BUF": {"lat": 42.7738, "lon": -78.7870, "roof": "outdoor", "confidence": "high"},
    "CAR": {"lat": 35.2258, "lon": -80.8528, "roof": "outdoor", "confidence": "high"},
    "CHI": {"lat": 41.8623, "lon": -87.6167, "roof": "outdoor", "confidence": "high"},
    "CIN": {"lat": 39.0954, "lon": -84.5160, "roof": "outdoor", "confidence": "high"},
    "CLE": {"lat": 41.5061, "lon": -81.6995, "roof": "outdoor", "confidence": "high"},
    "DAL": {"lat": 32.7473, "lon": -97.0945, "roof": "retractable", "confidence": "high"},
    "DEN": {"lat": 39.7439, "lon": -105.0201, "roof": "outdoor", "confidence": "high"},
    "DET": {"lat": 42.3400, "lon": -83.0456, "roof": "dome", "confidence": "high"},
    "GB": {"lat": 44.5013, "lon": -88.0622, "roof": "outdoor", "confidence": "high"},
    "HOU": {"lat": 29.6847, "lon": -95.4107, "roof": "retractable", "confidence": "high"},
    "IND": {"lat": 39.7601, "lon": -86.1639, "roof": "retractable", "confidence": "high"},
    "JAX": {"lat": 30.3239, "lon": -81.6373, "roof": "ambiguous", "confidence": "low",
           "note": "open-air bowl with a partial canopy/shade structure over "
                   "seating, not the field -- treated as unresolved rather "
                   "than guessed either way"},
    "KC": {"lat": 39.0489, "lon": -94.4839, "roof": "outdoor", "confidence": "high"},
    "LV": {"lat": 36.0909, "lon": -115.1833, "roof": "dome", "confidence": "medium",
          "note": "fixed translucent roof, generally played fully enclosed"},
    "LAC": {"lat": 33.9535, "lon": -118.3392, "roof": "dome", "confidence": "high",
           "note": "SoFi Stadium -- fixed canopy roof, effectively indoor"},
    "LAR": {"lat": 33.9535, "lon": -118.3392, "roof": "dome", "confidence": "high",
           "note": "SoFi Stadium, shared with LAC"},
    "MIA": {"lat": 25.9580, "lon": -80.2389, "roof": "outdoor", "confidence": "high",
           "note": "partial canopy over seating only, field is open"},
    "MIN": {"lat": 44.9737, "lon": -93.2577, "roof": "dome", "confidence": "high"},
    "NE": {"lat": 42.0909, "lon": -71.2643, "roof": "outdoor", "confidence": "high"},
    "NO": {"lat": 29.9511, "lon": -90.0812, "roof": "dome", "confidence": "high"},
    "NYG": {"lat": 40.8135, "lon": -74.0745, "roof": "outdoor", "confidence": "high"},
    "NYJ": {"lat": 40.8135, "lon": -74.0745, "roof": "outdoor", "confidence": "high",
           "note": "MetLife Stadium, shared with NYG"},
    "PHI": {"lat": 39.9008, "lon": -75.1675, "roof": "outdoor", "confidence": "high"},
    "PIT": {"lat": 40.4468, "lon": -80.0158, "roof": "outdoor", "confidence": "high"},
    "SEA": {"lat": 47.5952, "lon": -122.3316, "roof": "ambiguous", "confidence": "low",
           "note": "Lumen Field has a partial roof covering most seating but "
                   "the field itself is open-air -- treated as unresolved "
                   "rather than asserting a clean outdoor/dome call"},
    "SF": {"lat": 37.4032, "lon": -121.9698, "roof": "outdoor", "confidence": "high"},
    "TB": {"lat": 27.9759, "lon": -82.5033, "roof": "outdoor", "confidence": "high"},
    "TEN": {"lat": 36.1665, "lon": -86.7713, "roof": "outdoor", "confidence": "high"},
    "WAS": {"lat": 38.9076, "lon": -76.8645, "roof": "outdoor", "confidence": "high"},
}

#: Real, well-documented case usable as a known-positive once egress works:
#: BUF at home, 2024-11-17 (real week-11 2024 game, played in a real,
#: widely reported lake-effect snow event) -- exact numeric values are NOT
#: asserted here (this module cannot fetch to verify them), only that the
#: fetch for this date/location must return non-null wind and precipitation
#: at a real outdoor stadium.
KNOWN_POSITIVE = {"team": "BUF", "date": "2024-11-17",
                  "why": "real, widely reported snow game -- precipitation "
                        "must be > 0"}


def is_weather_relevant(team: str) -> bool:
    """True only for a confirmed outdoor stadium. dome/retractable/ambiguous
    all return False -- no signal, never a manufactured zero."""
    info = STADIUM_INFO.get(team)
    return bool(info) and info["roof"] == "outdoor"


def parse_hourly_response(doc: dict, kickoff_hour_iso: str) -> dict | None:
    """Pure parser for open-meteo's documented hourly response shape:
    {"hourly": {"time": [...], "temperature_2m": [...], "wind_speed_10m":
    [...], "precipitation": [...]}}. Returns None (never a guessed value) if
    the exact kickoff hour is not in the returned series, or the shape is
    not what's documented -- a shape mismatch must surface as a clear
    'nothing extracted' rather than a wrong number silently emitted."""
    hourly = (doc or {}).get("hourly")
    if not isinstance(hourly, dict):
        return None
    times = hourly.get("time") or []
    if kickoff_hour_iso not in times:
        return None
    idx = times.index(kickoff_hour_iso)
    out = {}
    for field, key in (("temp_f", "temperature_2m"),
                       ("wind_mph", "wind_speed_10m"),
                       ("precip_in", "precipitation")):
        series = hourly.get(key)
        if not isinstance(series, list) or idx >= len(series):
            return None
        out[field] = series[idx]
    return out


def kickoff_hour_iso(game_date_iso: str) -> str:
    """A game's ISO datetime, truncated to the top of its kickoff hour, in
    the shape open-meteo's hourly series keys on ('2024-11-17T18:00')."""
    return game_date_iso[:13] + ":00"


def build_store(schedule_rows: list, weather_by_game: dict) -> dict:
    """schedule_rows: the already-committed nfl_schedule_2026.json 'rows'
    list. weather_by_game: {game_id: parsed weather dict or None}, already
    fetched -- this function is pure, no I/O."""
    out = {}
    skipped_indoor = 0
    skipped_ambiguous = 0
    skipped_no_data = 0
    for row in schedule_rows:
        home = row.get("home")
        info = STADIUM_INFO.get(home)
        if not info:
            continue
        if info["roof"] in ("dome", "retractable"):
            skipped_indoor += 1
            continue
        if info["roof"] == "ambiguous":
            skipped_ambiguous += 1
            continue
        gid = row.get("game_id")
        weather = weather_by_game.get(gid)
        if weather is None:
            skipped_no_data += 1
            continue
        out[str(gid)] = {"season": row.get("season"), "week": row.get("week"),
                         "home": home, "away": row.get("away"),
                         "date": row.get("date"), **weather}

    doc = {
        "_territory": "TERRITORY: C — produced by draft/backtest/game_weather.py",
        "_note": ("Hourly kickoff-time weather (temp/wind/precip) for "
                 "confirmed-outdoor home stadiums only, from open-meteo "
                 "(no key). Dome, retractable-roof and ambiguous-roof "
                 "venues carry no entry -- absence is a real fact "
                 "(weather does not apply), not a gap. STADIUM_INFO is "
                 "compiled, not fetched -- spot-check before trusting a "
                 "start/sit decision on it (see module docstring)."),
        "population": {"games_with_weather": len(out),
                       "skipped_indoor": skipped_indoor,
                       "skipped_ambiguous_roof": skipped_ambiguous,
                       "skipped_no_data": skipped_no_data},
        "games": out,
    }
    return doc


def verify_known_positive(doc: dict, schedule_rows: list) -> dict:
    """Rule 3e control: find BUF's real 2024-11-17 game in the built store
    and require real, non-null precipitation -- a snow game with a null or
    zero precip reading means the fetch or parse is broken, not that it
    didn't snow."""
    match = None
    for row in schedule_rows:
        if row.get("home") == KNOWN_POSITIVE["team"] and \
           str(row.get("date", "")).startswith(KNOWN_POSITIVE["date"]):
            match = row
            break
    if match is None:
        return {"ok": False, "why": "known-positive game not found in the "
               "schedule store -- cannot check"}
    entry = doc["games"].get(str(match.get("game_id")))
    if entry is None:
        return {"ok": False, "why": "known-positive game has no weather "
               "entry in the built store"}
    ok = entry.get("precip_in") is not None and entry["precip_in"] > 0
    return {"ok": ok, "entry": entry}


# ── I/O: real fetches (CI only — unconfirmed reachability, see docstring) ──

def _fetch_hourly(lat: float, lon: float, date: str, base_url: str) -> dict:  # pragma: no cover
    import urllib.request
    url = (f"{base_url}?latitude={lat}&longitude={lon}"
          f"&start_date={date}&end_date={date}&hourly={HOURLY_VARS}"
          f"&temperature_unit=fahrenheit&wind_speed_unit=mph"
          f"&precipitation_unit=inch&timezone=UTC")
    with urllib.request.urlopen(url, timeout=30) as resp:
        return json.loads(resp.read())


def run() -> dict:  # pragma: no cover  (egress)
    import datetime as _dt
    today = _dt.datetime.now(_dt.timezone.utc).date().isoformat()
    schedule_doc = json.loads(SCHEDULE.read_text())
    rows = schedule_doc.get("rows") or []
    weather_by_game = {}
    for row in rows:
        home = row.get("home")
        if not is_weather_relevant(home):
            continue
        info = STADIUM_INFO[home]
        date = str(row.get("date", ""))[:10]
        if not date:
            continue
        # PAST games (already played, this season or a backfill) want the
        # ARCHIVE endpoint; UPCOMING games want the FORECAST endpoint --
        # open-meteo's archive has no data for a date that hasn't happened,
        # and its forecast horizon does not reach far into the past.
        base_url = HIST_URL if date < today else FORECAST_URL
        try:
            raw = _fetch_hourly(info["lat"], info["lon"], date, base_url)
            weather_by_game[row["game_id"]] = parse_hourly_response(
                raw, kickoff_hour_iso(row["date"]))
        except Exception as exc:  # noqa: BLE001
            weather_by_game[row["game_id"]] = None
            print(f"! fetch failed for game {row.get('game_id')} "
                 f"({home}, {date}): {type(exc).__name__}: {exc}",
                 file=sys.stderr)

    doc = build_store(rows, weather_by_game)
    doc["rule_3e_control"] = verify_known_positive(doc, rows)
    return doc


def main() -> int:  # pragma: no cover  (egress)
    doc = run()
    control = doc["rule_3e_control"]
    if not control["ok"]:
        print(f"VOID -- known-positive control failed: {control}", file=sys.stderr)
        return 1
    OUT.write_text(json.dumps(doc, indent=1))
    print(f"wrote {OUT.relative_to(ROOT)}: "
         f"{doc['population']['games_with_weather']} games with weather")
    return 0


if __name__ == "__main__":
    sys.exit(main())
