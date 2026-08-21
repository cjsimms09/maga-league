# TERRITORY: C
"""GAME-DAY WEATHER — source-hunt item 1, REBUILT 2026-08-21 after Cory's
direct catch: "Make sure we're getting weather for every game and from the
right stadium where game is being played (home team)."

⚠️ THAT CATCH WAS RIGHT, AND THE FIRST VERSION OF THIS MODULE HAD THE EXACT
BUG NAMED. It looked up a HOME TEAM'S usual stadium from a hand-compiled
table, which is wrong for any neutral-site game — and there are real ones:
**8 of the 272 games on the actual 2026 schedule are neutral-site
internationals** (Melbourne, Rio de Janeiro, London x2, Paris, Madrid,
Munich, Mexico City — verified directly against nflverse's real schedule
data, not assumed), and 7 more were played at neutral sites in 2024 alone
(Brazil, London x2, Germany, plus a wildfire-relocated Rams "home" playoff
game and the Super Bowl). The old design would have fetched Philadelphia's
weather for a game actually played in São Paulo, and would have SKIPPED a
real outdoor London game because it thought Jacksonville's home stadium
(marked "ambiguous") was the venue.

THE FIX, both root causes: (1) the schedule source. `nfl_schedule_2026.json`
(Ball Don't Lie's free tier) carries no venue field at all — team codes and
dates only, so a neutral-site game was structurally invisible to it. This
module now reads nflverse's `games.csv` release directly (rule 11: the same
reachable host every other capture this session already uses), which
carries the REAL per-game `stadium`, `location` ("Home"/"Neutral"), `roof`,
and even real historical `temp`/`wind` — measured fact per game, not a
compiled guess about the home team. (2) `STADIUM_COORDS` below is now keyed
by the real STADIUM NAME nflverse reports for that specific game, never by
team code — the same team's `stadium_id` in nflverse's own data does NOT
change for a neutral-site game (it stays tagged to the "home" team), so
keying coordinates by team the way the old module did would have
reproduced the exact same bug even reading the right source.

ROOF, MEASURED PER GAME, NOT ASSUMED PER TEAM: nflverse's `roof` column
takes real values {"outdoors", "dome", "open", "closed", NaN} — "open" and
"closed" are a RETRACTABLE roof's actual state for that specific game,
which the old module could not see and treated every retractable venue as
permanently excluded. NaN is real too, not a data gap: for 2026, every
retractable-roof stadium's future games (Houston, Indianapolis, Atlanta,
Arizona, Dallas) carry `roof: NaN` because the open/closed call is a
game-week decision, not settled months out. `is_weather_relevant()` only
answers True for a MEASURED "outdoors"/"open" — never a guess.

WHAT NFLVERSE DOES NOT CARRY: precipitation. Its schedule has `temp`/`wind`
(real box-score readings for played games) but no rain/snow field, so
open-meteo is still the source for precipitation on every game, and the
temp/wind backstop for games nflverse has not captured yet (upcoming 2026
weeks, or any game its own capture missed — the international 2024 games
above show real NaN temp/wind in nflverse's own data too).

⚠️ RECHECK reachability caveat still applies to open-meteo specifically:
`api.open-meteo.com` proxy-403s from this dev sandbox, so its exact
response shape is confirmed only by nflverse-data (proven reachable and
used directly below) — the precipitation fetch stays CI-gated and untrusted
until a first real dispatch's known-positive control passes.

Run: python3 draft/backtest/game_weather.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
DRAFT = HERE.parent
ROOT = DRAFT.parent

OUT = HERE / "game_weather.json"

GAMES_URL = ("https://github.com/nflverse/nflverse-data/releases/download/"
            "schedules/games.csv")
GAMES_COLUMNS = ["game_id", "season", "game_type", "week", "gameday",
                 "gametime", "away_team", "home_team", "location", "roof",
                 "temp", "wind", "stadium", "stadium_id"]

HIST_URL = "https://archive-api.open-meteo.com/v1/archive"
FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
HOURLY_VARS = "precipitation"

SEASONS = (2021, 2022, 2023, 2024, 2025, 2026)

#: real values nflverse's `roof` column uses for a game played with no roof
#: overhead -- "outdoors" (fixed no-roof venue) or "open" (a retractable
#: roof, open for THIS game). "dome"/"closed"/NaN are all excluded.
WEATHER_RELEVANT_ROOF = {"outdoors", "open"}

#: {stadium name (nflverse's own string, exactly) -> {lat, lon, confidence}}.
#: COMPILED FROM GENERAL KNOWLEDGE, NOT FETCHED — no reachable source this
#: session found serves stadium coordinates. Spot-check before trusting a
#: start/sit decision on it. Renamed stadiums at the SAME physical site
#: (naming-rights changes) share coordinates; genuinely uncertain entries
#: (mostly recent international venues) are marked "medium"/"low".
STADIUM_COORDS = {
    "AT&T Stadium": {"lat": 32.7473, "lon": -97.0945, "confidence": "high"},
    "Acrisure Stadium": {"lat": 40.4468, "lon": -80.0158, "confidence": "high"},
    "Heinz Field": {"lat": 40.4468, "lon": -80.0158, "confidence": "high"},
    "GEHA Field at Arrowhead Stadium": {"lat": 39.0489, "lon": -94.4839, "confidence": "high"},
    "Arrowhead Stadium": {"lat": 39.0489, "lon": -94.4839, "confidence": "high"},
    "Bank of America Stadium": {"lat": 35.2258, "lon": -80.8528, "confidence": "high"},
    "Empower Field at Mile High": {"lat": 39.7439, "lon": -105.0201, "confidence": "high"},
    "Sports Authority Field at Mile High": {"lat": 39.7439, "lon": -105.0201, "confidence": "high"},
    "EverBank Stadium": {"lat": 30.3239, "lon": -81.6373, "confidence": "high"},
    "EverBank Field": {"lat": 30.3239, "lon": -81.6373, "confidence": "high"},
    "TIAA Bank Stadium": {"lat": 30.3239, "lon": -81.6373, "confidence": "high"},
    "FedExField": {"lat": 38.9076, "lon": -76.8645, "confidence": "high"},
    "Northwest Stadium": {"lat": 38.9076, "lon": -76.8645, "confidence": "high"},
    "FirstEnergy Stadium": {"lat": 41.5061, "lon": -81.6995, "confidence": "high"},
    "Huntington Bank Field": {"lat": 41.5061, "lon": -81.6995, "confidence": "high"},
    "Gillette Stadium": {"lat": 42.0909, "lon": -71.2643, "confidence": "high"},
    "Hard Rock Stadium": {"lat": 25.9580, "lon": -80.2389, "confidence": "high"},
    "Highmark Stadium": {"lat": 42.7738, "lon": -78.7870, "confidence": "high"},
    "New Era Field": {"lat": 42.7738, "lon": -78.7870, "confidence": "high"},
    "Lambeau Field": {"lat": 44.5013, "lon": -88.0622, "confidence": "high"},
    "Levi's Stadium": {"lat": 37.4032, "lon": -121.9698, "confidence": "high"},
    "Lincoln Financial Field": {"lat": 39.9008, "lon": -75.1675, "confidence": "high"},
    "Lucas Oil Stadium": {"lat": 39.7601, "lon": -86.1639, "confidence": "high"},
    "Lumen Field": {"lat": 47.5952, "lon": -122.3316, "confidence": "high"},
    "M&T Bank Stadium": {"lat": 39.2780, "lon": -76.6227, "confidence": "high"},
    "Mercedes-Benz Stadium": {"lat": 33.7554, "lon": -84.4008, "confidence": "high"},
    "MetLife Stadium": {"lat": 40.8135, "lon": -74.0745, "confidence": "high"},
    "NRG Stadium": {"lat": 29.6847, "lon": -95.4107, "confidence": "high"},
    "Reliant Stadium": {"lat": 29.6847, "lon": -95.4107, "confidence": "high"},
    "Nissan Stadium": {"lat": 36.1665, "lon": -86.7713, "confidence": "high"},
    "Paul Brown Stadium": {"lat": 39.0954, "lon": -84.5160, "confidence": "high"},
    "Paycor Stadium": {"lat": 39.0954, "lon": -84.5160, "confidence": "high"},
    "Raymond James Stadium": {"lat": 27.9759, "lon": -82.5033, "confidence": "high"},
    "Soldier Field": {"lat": 41.8623, "lon": -87.6167, "confidence": "high"},
    "State Farm Stadium": {"lat": 33.5276, "lon": -112.2626, "confidence": "high"},
    "University of Phoenix Stadium": {"lat": 33.5276, "lon": -112.2626, "confidence": "high"},
    # ── international / neutral-site venues ─────────────────────────────
    "Wembley Stadium": {"lat": 51.5560, "lon": -0.2795, "confidence": "high"},
    "Tottenham Stadium": {"lat": 51.6043, "lon": -0.0664, "confidence": "high"},
    "Tottenham Hotspur Stadium": {"lat": 51.6043, "lon": -0.0664, "confidence": "high"},
    "Arena Corinthians": {"lat": -23.5453, "lon": -46.4742, "confidence": "medium"},
    "Deutsche Bank Park": {"lat": 50.0686, "lon": 8.6455, "confidence": "medium"},
    "Allianz Arena": {"lat": 48.2188, "lon": 11.6247, "confidence": "medium"},
    "FC Bayern Munich Stadium": {"lat": 48.2188, "lon": 11.6247, "confidence": "medium",
                                 "note": "same physical venue as Allianz Arena, "
                                         "nflverse names it differently in the "
                                         "2026 schedule than in 2024's"},
    "Azteca Stadium": {"lat": 19.3029, "lon": -99.1505, "confidence": "medium"},
    "Maracana Stadium": {"lat": -22.9121, "lon": -43.2302, "confidence": "medium"},
    "Bernabeu": {"lat": 40.4531, "lon": -3.6883, "confidence": "medium",
                "note": "Real Madrid's Santiago Bernabeu, retractable roof "
                        "-- treat roof state the same as any domestic "
                        "retractable, off nflverse's own roof field"},
    "Stade de France": {"lat": 48.9244, "lon": 2.3601, "confidence": "medium"},
    "Melbourne Cricket Ground": {"lat": -37.8199, "lon": 144.9834, "confidence": "medium"},
    "Estadio Banorte": {"lat": 25.6694, "lon": -100.2792, "confidence": "low",
                        "note": "Monterrey, Mexico (formerly Estadio BBVA) "
                                "-- LOWER CONFIDENCE than the rest of this "
                                "table; verify before trusting this one "
                                "specifically, it is the least certain entry"},
}

#: Real, verified control (checked against nflverse's own REG-season data
#: before writing this, rule 3f — NOT the assumed-but-unverified BUF game
#: the first version of this module shipped with, and not the -4F Chiefs
#: game either, which turned out to be a playoff game this module's own
#: REG-only filter correctly excludes): NO @ CLE, 2022-12-24, a real,
#: widely-reported brutal-cold regular-season game during a major winter
#: storm. nflverse's own box score: temp=6.0F, wind=27.0mph.
KNOWN_POSITIVE = {"home": "CLE", "gameday": "2022-12-24",
                  "expected_temp_max": 15.0, "expected_wind_min": 15.0}


def is_weather_relevant(roof) -> bool:
    """True only for a MEASURED outdoors/open roof for THIS game — never a
    guess from a team's usual venue. NaN (undetermined, common for future
    retractable-roof games not yet decided) and dome/closed all return
    False, correctly absent rather than a manufactured value."""
    return roof in WEATHER_RELEVANT_ROOF


def stadium_coords(stadium_name: str) -> dict | None:
    return STADIUM_COORDS.get(stadium_name)


def kickoff_hour_iso(gameday: str, gametime) -> str | None:
    """nflverse's `gameday`+`gametime` (local venue time, HH:MM) combined
    into the hour-truncated ISO string open-meteo's hourly series keys on.
    Returns None if either half is missing — never a guessed kickoff hour."""
    if not gameday or not gametime or gametime != gametime:  # NaN check
        return None
    hh = str(gametime).split(":")[0].zfill(2)
    return f"{gameday}T{hh}:00"


def parse_precip(doc: dict, kickoff_hour_iso_str: str) -> float | None:
    """Pure parser for open-meteo's hourly precipitation series. Returns
    None (never a guess) if the shape doesn't match or the hour is absent —
    a shape mismatch must surface as 'nothing extracted', never a wrong
    number silently emitted."""
    hourly = (doc or {}).get("hourly")
    if not isinstance(hourly, dict):
        return None
    times = hourly.get("time") or []
    precip = hourly.get("precipitation")
    if kickoff_hour_iso_str not in times or not isinstance(precip, list):
        return None
    idx = times.index(kickoff_hour_iso_str)
    return precip[idx] if idx < len(precip) else None


def build_store(game_rows: list, precip_by_game: dict) -> dict:
    """game_rows: nflverse games.csv rows, already filtered to this
    league's SEASONS and REG-only. precip_by_game: {game_id: float or None},
    already fetched -- this function is pure, no I/O.

    temp/wind come from nflverse's OWN box score when present (real,
    measured — not a forecast); precipitation always comes from
    open-meteo, since nflverse's schedule does not carry it at all.
    """
    out = {}
    skipped_not_relevant = 0
    skipped_no_coords = 0
    for row in game_rows:
        if not is_weather_relevant(row.get("roof")):
            skipped_not_relevant += 1
            continue
        stadium = row.get("stadium")
        coords = stadium_coords(stadium)
        if coords is None:
            skipped_no_coords += 1
            continue
        gid = row.get("game_id")
        out[str(gid)] = {
            "season": row.get("season"), "week": row.get("week"),
            "home": row.get("home_team"), "away": row.get("away_team"),
            "location": row.get("location"), "stadium": stadium,
            "gameday": row.get("gameday"),
            "temp_f": row.get("temp"), "wind_mph": row.get("wind"),
            "precip_in": precip_by_game.get(gid),
            "coord_confidence": coords["confidence"],
        }

    doc = {
        "_territory": "TERRITORY: C — produced by draft/backtest/game_weather.py",
        "_note": ("Per-game weather for every MEASURED outdoors/open-roof "
                 "game (nflverse's own roof field, per game, not a "
                 "compiled guess by home team). temp/wind are nflverse's "
                 "own real box-score readings when present; precip_in is "
                 "always from open-meteo, since nflverse's schedule "
                 "carries no precipitation field. Neutral-site games are "
                 "included and correctly located via the real `stadium` "
                 "name, not the home team's usual venue."),
        "population": {"games_with_weather": len(out),
                       "skipped_not_weather_relevant": skipped_not_relevant,
                       "skipped_no_stadium_coords": skipped_no_coords},
        "games": out,
    }
    return doc


#: A real 2026 neutral-site game (verified against nflverse's own schedule
#: before writing this): HOU @ JAX, week 6, at Wembley Stadium, London --
#: home team is JAX (its usual stadium is EverBank, Jacksonville), but the
#: game is played in London. THIS IS THE EXACT DEFECT CLASS CORY CAUGHT:
#: any lookup keyed on the home team's usual venue instead of the real
#: per-game stadium would silently attribute Jacksonville's weather to a
#: London game.
NEUTRAL_SITE_CONTROL = {"home": "JAX", "week": 6, "season": 2026,
                        "expected_stadium": "Wembley Stadium"}


def verify_neutral_site_handling(game_rows: list) -> dict:
    """Rule 3e control for the specific bug Cory caught: a home team's
    neutral-site game must resolve to the REAL stadium played at, not the
    team's usual venue. Checked against nflverse's own real 2026 schedule,
    not asserted."""
    match = None
    for row in game_rows:
        if (row.get("home_team") == NEUTRAL_SITE_CONTROL["home"]
                and row.get("week") == NEUTRAL_SITE_CONTROL["week"]
                and row.get("season") == NEUTRAL_SITE_CONTROL["season"]):
            match = row
            break
    if match is None:
        return {"ok": False, "why": "neutral-site known-positive game not found"}
    ok = (match.get("location") == "Neutral"
          and match.get("stadium") == NEUTRAL_SITE_CONTROL["expected_stadium"])
    return {"ok": ok, "real_stadium": match.get("stadium"),
           "real_location": match.get("location")}


def verify_known_positive(doc: dict, game_rows: list) -> dict:
    """Rule 3e control, checked against nflverse's own real data before
    writing this fixture (rule 3f), not assumed from memory the way the
    first version of this module's control was."""
    match = None
    for row in game_rows:
        if row.get("home_team") == KNOWN_POSITIVE["home"] and \
           str(row.get("gameday")) == KNOWN_POSITIVE["gameday"]:
            match = row
            break
    if match is None:
        return {"ok": False, "why": "known-positive game not found"}
    entry = doc["games"].get(str(match.get("game_id")))
    if entry is None:
        return {"ok": False, "why": "known-positive game has no weather entry"}
    temp, wind = entry.get("temp_f"), entry.get("wind_mph")
    ok = (temp is not None and temp <= KNOWN_POSITIVE["expected_temp_max"]
          and wind is not None and wind >= KNOWN_POSITIVE["expected_wind_min"])
    return {"ok": ok, "entry": entry}


# ── I/O: real fetches (CI only — see docstring on reachability) ────────────

def _fetch_games() -> list:  # pragma: no cover  (egress)
    import pandas as pd
    df = pd.read_csv(GAMES_URL)
    df = df[df["season"].isin(SEASONS) & (df["game_type"] == "REG")]
    return df[GAMES_COLUMNS].to_dict("records")


def _fetch_precip(lat: float, lon: float, date: str, base_url: str) -> dict:  # pragma: no cover
    import urllib.request
    url = (f"{base_url}?latitude={lat}&longitude={lon}"
          f"&start_date={date}&end_date={date}&hourly={HOURLY_VARS}"
          f"&precipitation_unit=inch&timezone=UTC")
    with urllib.request.urlopen(url, timeout=30) as resp:
        return json.loads(resp.read())


def run() -> dict:  # pragma: no cover  (egress)
    import datetime as _dt
    today = _dt.datetime.now(_dt.timezone.utc).date().isoformat()
    game_rows = _fetch_games()

    precip_by_game = {}
    for row in game_rows:
        if not is_weather_relevant(row.get("roof")):
            continue
        coords = stadium_coords(row.get("stadium"))
        if coords is None:
            continue
        gameday = str(row.get("gameday", ""))[:10]
        kh = kickoff_hour_iso(gameday, row.get("gametime"))
        if not gameday or not kh:
            continue
        base_url = HIST_URL if gameday < today else FORECAST_URL
        try:
            raw = _fetch_precip(coords["lat"], coords["lon"], gameday, base_url)
            precip_by_game[row["game_id"]] = parse_precip(raw, kh)
        except Exception as exc:  # noqa: BLE001
            precip_by_game[row["game_id"]] = None
            print(f"! precip fetch failed for game {row.get('game_id')} "
                 f"({row.get('stadium')}, {gameday}): "
                 f"{type(exc).__name__}: {exc}", file=sys.stderr)

    doc = build_store(game_rows, precip_by_game)
    doc["rule_3e_control"] = verify_known_positive(doc, game_rows)
    doc["rule_3e_control_neutral_site"] = verify_neutral_site_handling(game_rows)
    return doc


def main() -> int:  # pragma: no cover  (egress)
    doc = run()
    control = doc["rule_3e_control"]
    neutral_control = doc["rule_3e_control_neutral_site"]
    if not control["ok"] or not neutral_control["ok"]:
        print(f"VOID -- a known-positive control failed: weather={control}, "
             f"neutral_site={neutral_control}", file=sys.stderr)
        return 1
    OUT.write_text(json.dumps(doc, indent=1))
    print(f"wrote {OUT.relative_to(ROOT)}: "
         f"{doc['population']['games_with_weather']} games with weather")
    return 0


if __name__ == "__main__":
    sys.exit(main())
