"""Module 0 — league settings auto-import from Sleeper.

Pulls everything Sleeper actually knows (scoring, roster slots, teams, prior
draft results) so none of it has to be transcribed by hand. What Sleeper does
*not* know — house keeper rules — is prompted for separately and merged in.

The prior draft matters: it is the only way to recover each player's original
draft round, which the `original_round` keeper cost model needs.
"""
from __future__ import annotations
import json
import time
import urllib.request
import urllib.error
from pathlib import Path

BASE = "https://api.sleeper.app/v1"
CACHE = Path(__file__).parent / ".cache"
CACHE_TTL = 60 * 60  # 1h; league settings change rarely, be polite to a free API


def _get(path: str, *, ttl: int = CACHE_TTL, retries: int = 3):
    """GET with on-disk caching and backoff. Sleeper is free — do not hammer it."""
    CACHE.mkdir(exist_ok=True)
    key = CACHE / (path.strip("/").replace("/", "_") + ".json")
    if key.exists() and (time.time() - key.stat().st_mtime) < ttl:
        return json.loads(key.read_text())

    last = None
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(f"{BASE}{path}", timeout=20) as resp:
                data = json.loads(resp.read())
            key.write_text(json.dumps(data))
            return data
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
            last = exc
            time.sleep(1.5 * (attempt + 1))
    # Stale cache beats no data when a nightly build hits a blip.
    if key.exists():
        print(f"  ! {path} unreachable ({last}); using stale cache")
        return json.loads(key.read_text())
    raise RuntimeError(f"Sleeper unreachable for {path}: {last}")


def fetch_league(league_id: str) -> dict:
    return _get(f"/league/{league_id}")


def fetch_users(league_id: str) -> list:
    return _get(f"/league/{league_id}/users")


def fetch_rosters(league_id: str) -> list:
    return _get(f"/league/{league_id}/rosters")


def fetch_drafts(league_id: str) -> list:
    return _get(f"/league/{league_id}/drafts")


def fetch_draft_picks(draft_id: str, *, live: bool = False) -> list:
    """`live=True` bypasses the 1-hour cache — REQUIRED for a draft in progress.

    Found by the 2026-08-16 chaos drill: the draft-night sync loop polls every
    20s, but the default cache served the FIRST poll's snapshot from disk for a
    full hour, so the pick log trailed the live draft by up to an hour while
    reporting added:0. Historical/completed drafts (build.py, history_export)
    keep the cache — their pick lists do not change, and Sleeper is a free API.
    On a live failure the stale-cache fallback in `_get` still applies, which
    is correct draft-night behavior: picks are Sleeper's record, the next
    successful poll backfills, and the fallback SAYS it is serving stale.
    """
    return _get(f"/draft/{draft_id}/picks", ttl=0 if live else CACHE_TTL)


def fetch_players() -> dict:
    """The full player DB (~5MB). Cached for a day — it changes slowly."""
    return _get("/players/nfl", ttl=24 * 60 * 60)


# Sleeper publishes projections and stats under two different URL shapes
# depending on season and endpoint version, and the wrong one returns a
# well-formed payload with empty stat lines rather than an error. That is how a
# board of zeroes got built while the log cheerfully reported thousands of rows.
# Try every known shape, score each by how many rows actually carry stats, and
# say out loud which one won.
_PROJECTION_PATHS = [
    "/projections/nfl/regular/{season}",
    "/projections/nfl/{season}/{week}?season_type=regular",
    "/projections/nfl/{season}/{week}",
]
_STATS_PATHS = [
    "/stats/nfl/regular/{season}",
    "/stats/nfl/{season}/{week}?season_type=regular",
    "/stats/nfl/{season}/{week}",
]


def _rows_with_stats(payload) -> int:
    """How many entries carry a non-empty stat line — the only measure that matters."""
    if isinstance(payload, list):
        payload = {str(i): v for i, v in enumerate(payload)}
    if not isinstance(payload, dict):
        return 0
    n = 0
    for v in payload.values():
        stats = v.get("stats") if isinstance(v, dict) and "stats" in v else v
        if isinstance(stats, dict) and any(
                isinstance(x, (int, float)) and x for x in stats.values()):
            n += 1
    return n


def _best_payload(paths: list, season: str, week, label: str, ttl: int) -> dict:
    best, best_n, best_path = {}, 0, None
    for tmpl in paths:
        path = tmpl.format(season=season, week=week)
        try:
            data = _get(path, ttl=ttl)
        except Exception as exc:  # noqa: BLE001 — try the next shape
            print(f"    {label} {path}: FAILED ({type(exc).__name__})")
            continue
        n = _rows_with_stats(data)
        size = len(data) if hasattr(data, "__len__") else 0
        print(f"    {label} {path}: {size} rows, {n} with stats")
        if n > best_n:
            best, best_n, best_path = data, n, path
    if best_path:
        print(f"  {label}: using {best_path} ({best_n} rows with stats)")
    else:
        print(f"  ! {label}: no endpoint shape returned usable data")
    # Normalise a list payload into the {player_id: row} shape callers expect.
    if isinstance(best, list):
        best = {str(r.get("player_id")): r for r in best if isinstance(r, dict) and r.get("player_id")}
    return best


def fetch_projections(season: str, week: int | str = "season") -> dict:
    """Consensus projections. Endpoint shape varies by season; caller tolerates None."""
    print(f"  probing projection endpoints for {season}:")
    return _best_payload(_PROJECTION_PATHS, season, week, "projections", 6 * 60 * 60)


def fetch_stats(season: str, week: int | str = "season") -> dict:
    """Actual stat lines for a completed season.

    Used as the projection baseline when the provider has no projections for the
    upcoming season yet — which is the normal state of the world in August, and
    which used to produce a board of zeroes without saying so.
    """
    print(f"  probing stats endpoints for {season}:")
    return _best_payload(_STATS_PATHS, season, week, "stats", 24 * 60 * 60)


# --- roster slot + scoring extraction ---------------------------------------

def roster_slots_from(league: dict) -> dict:
    """Sleeper gives roster_positions as a flat list; count them."""
    slots: dict[str, int] = {}
    for pos in league.get("roster_positions", []):
        slots[pos] = slots.get(pos, 0) + 1
    return slots


def original_rounds(league_id: str) -> dict[str, int]:
    """{player_id: round drafted} from the most recent completed draft.

    Feeds the `original_round` keeper cost model. Players not in the result were
    undrafted (waiver adds) and fall under the league's undrafted_rule.
    """
    drafts = fetch_drafts(league_id)
    if not drafts:
        return {}
    completed = [d for d in drafts if d.get("status") == "complete"] or drafts
    latest = sorted(completed, key=lambda d: d.get("created", 0), reverse=True)[0]
    picks = fetch_draft_picks(latest["draft_id"])
    return {str(p["player_id"]): int(p["round"]) for p in picks if p.get("player_id") and p.get("round")}


def league_history(league_id: str, *, max_depth: int = 15) -> list[dict]:
    """Walk previous_league_id backward and return every season, newest first.

    Prior seasons are where all the behavioural signal lives (A1) and where
    original draft rounds come from, so this chain is load-bearing.
    """
    out, seen, current = [], set(), league_id
    for _ in range(max_depth):
        if not current or current in seen:
            break
        seen.add(current)
        try:
            lg = fetch_league(current)
        except Exception as exc:  # noqa: BLE001 - a broken link ends the chain
            print(f"  ! history stops at {current}: {exc}")
            break
        out.append(lg)
        current = lg.get("previous_league_id")
    return out


def completed_draft_ids(league_id: str) -> list[str]:
    """Every completed draft id across league history, cheaply.

    Deliberately does NOT fetch picks or the 5MB player DB. Behavioural profiles
    are built from completed drafts, and a completed draft never changes — so
    the only question worth asking nightly is "is there a draft I have not seen
    yet", and that costs one small call per season instead of the whole pull.
    """
    out = []
    for lg in league_history(league_id):
        try:
            drafts = fetch_drafts(lg["league_id"])
        except Exception:                                    # noqa: BLE001
            continue
        for d in sorted(drafts, key=lambda x: x.get("created", 0), reverse=True):
            if d.get("status") == "complete":
                out.append(str(d["draft_id"]))
                break
    return sorted(out)


def all_drafts(league_id: str) -> list[dict]:
    """Every completed draft across league history, newest season first.

    Each entry: {season, league_id, draft_id, picks, users, rosters}. Cached on
    disk by the fetch layer — the full historical pull happens once.
    """
    seasons = league_history(league_id)
    print(f"  league history: {len(seasons)} season(s) — {[s.get('season') for s in seasons]}")
    out = []
    for lg in seasons:
        lid = lg["league_id"]
        try:
            drafts = fetch_drafts(lid)
        except Exception as exc:  # noqa: BLE001
            print(f"  ! no drafts for {lg.get('season')}: {exc}")
            continue
        for d in sorted(drafts, key=lambda x: x.get("created", 0), reverse=True):
            if d.get("status") not in ("complete", "paused", "drafting"):
                continue
            try:
                picks = fetch_draft_picks(d["draft_id"])
            except Exception as exc:  # noqa: BLE001
                print(f"  ! picks unavailable for draft {d['draft_id']}: {exc}")
                continue
            if not picks:
                continue
            out.append({
                "season": lg.get("season"),
                "league_id": lid,
                "draft_id": d["draft_id"],
                "picks": picks,
                "users": fetch_users(lid),
                "rosters": fetch_rosters(lid),
                "settings": d.get("settings") or {},
            })
            break  # one draft per season
    print(f"  collected {len(out)} historical draft(s), "
          f"{sum(len(d['picks']) for d in out)} picks")
    return out


def import_league(league_id: str, *, keeper_rules: dict | None = None) -> dict:
    """Module 0 end to end -> a league_config dict ready for validation."""
    print(f"Importing Sleeper league {league_id} ...")
    league = fetch_league(league_id)
    users = fetch_users(league_id)
    rosters = fetch_rosters(league_id)
    # THE DRAFT OBJECT, FETCHED — it was not, and two things live only on it:
    # `settings.reversal_round` and `slot_to_roster_id`. Both are load-bearing
    # for every pick number and neither was ever read. Newest draft for the
    # current season; a league has one per season.
    try:
        _drafts = fetch_drafts(league_id) or []
    except Exception:                      # noqa: BLE001 - import must not die here
        _drafts = []
    draft = None
    for d in sorted(_drafts, key=lambda x: x.get("created") or 0, reverse=True):
        if str(d.get("season") or "") == str(league.get("season") or ""):
            draft = d
            break
    draft = draft or (_drafts[0] if _drafts else None)

    by_user = {u["user_id"]: u for u in users}
    teams = []
    for r in rosters:
        u = by_user.get(r.get("owner_id"), {})
        teams.append({
            "roster_id": r.get("roster_id"),
            "user_id": r.get("owner_id"),
            "display_name": u.get("display_name", f"Team {r.get('roster_id')}"),
            "team_name": (u.get("metadata") or {}).get("team_name") or u.get("display_name"),
            "players": r.get("players") or [],
        })

    settings = league.get("settings") or {}
    draft_type_raw = (settings.get("draft_type") or league.get("draft_type") or "snake")
    draft_type = {
        "snake": "snake", "linear": "linear", "auction": "linear",
        "third_round_reversal": "third_round_reversal",
    }.get(str(draft_type_raw).lower(), "snake")
    # ⚠️ `reversal_round` LIVES ON THE DRAFT OBJECT, NOT THE LEAGUE.
    #
    # This read `settings` — the LEAGUE settings — for four seasons and could
    # therefore NEVER fire. Sleeper reports `draft.type == "snake"` whether or
    # not a third-round reversal is on; the ONLY place the reversal appears is
    # `draft.settings.reversal_round`. This league's own 2023 draft had it set to
    # 3, and the evidence is in the picks: rounds 2 and 3 ran in the IDENTICAL
    # order. Our model would have called that a plain snake and been wrong about
    # every pick from round 3 on, with `draft_type` agreeing with Sleeper the
    # whole time.
    #
    # It is 0 for 2026, so nothing is wrong on the live board today. It is a
    # commissioner toggle and the draft is on the 22nd.
    #
    # A MAPPING THAT READS THE WRONG OBJECT IS WORSE THAN A MISSING ONE: it is
    # commented, it is tested for reachability, and it is dead. The lookup now
    # names both places and prefers the draft.
    draft_settings = (draft or {}).get("settings") or {}
    if draft_settings.get("reversal_round") or settings.get("reversal_round"):
        draft_type = "third_round_reversal"

    cfg = {
        "league_id": league_id,
        "league_name": league.get("name"),
        "season": league.get("season"),
        "teams": int(league.get("total_rosters") or len(rosters) or 10),
        "draft_type": draft_type,
        # THE RAW FIELD, CARRIED BESIDE THE RESOLVED ONE. `draft_type` is a
        # derived label and Sleeper says "snake" either way, so storing only the
        # label loses the ability to check the derivation later. 2023 read
        # `type: "snake"` with `reversal_round: 3`.
        "reversal_round": draft_settings.get("reversal_round") or 0,
        # ⚠️ MY DRAFT SLOT, FROM SLEEPER, WHERE IT ACTUALLY LIVES.
        #
        # `my_draft_slot` has been a HAND-ENTERED CONSTANT in
        # draft/config/league_config.json this whole time, and it is the single
        # number every pick, seat and simulation is built on. Cory, 2026-08-13:
        # "I am slot 8 on the board (all slot info is in sleeper)". It is —
        # `draft.slot_to_roster_id` — and nothing read it.
        #
        # It is NOT written into `my_draft_slot` here, deliberately: build.py
        # already preserves an operator-set slot across imports, and silently
        # overwriting the number the whole draft depends on is not a change to
        # make in an import. It is carried as EVIDENCE so a guard can compare
        # them and say which one Sleeper agrees with.
        "slot_to_roster_id": dict((draft or {}).get("slot_to_roster_id") or {}),
        "roster_slots": roster_slots_from(league),
        "scoring": dict(league.get("scoring_settings") or {}),
        "playoff_week_start": settings.get("playoff_week_start", 15),
        "playoff_teams": settings.get("playoff_teams", 4),
        # Waiver economics (2026-08-08). Cory confirmed the league has NO FAAB, so
        # the in-season waiver engine runs on PRIORITY economics, not bids. Capture
        # the raw Sleeper fields so the pipeline stamps the truth rather than the
        # tool assuming FAAB. Sleeper waiver_type: 0=rolling priority, 1=reverse
        # standings, 2=FAAB. `budget`/faab is present only for FAAB leagues — its
        # absence/zero is the machine-checkable confirmation of no-FAAB.
        "waivers": {
            "type_code": settings.get("waiver_type"),
            "day_of_week": settings.get("waiver_day_of_week"),
            "clear_days": settings.get("waiver_clear_days"),
            "budget": settings.get("waiver_budget"),
            "daily_waivers": settings.get("daily_waivers"),
            "is_faab": bool(settings.get("waiver_budget")) and settings.get("waiver_type") == 2,
        },
        # TRADE WINDOW — imported so no surface has to hard-code week 11.
        # SharedValuation.tradeActionability() consumes exactly these two, and
        # nothing calls it yet: the rule and its input are both built and not
        # connected, which is why the registry files this imported_unread rather
        # than imported. Recorded that way rather than dressed up.
        # NAMED `trade_window`, NOT `trades`, ON PURPOSE. The first version used
        # `trades` and settings_access reported it READ — by
        # import_master_sheet.py's `out["trades"]`, the master sheet's trade
        # NOTES, an unrelated dict that happens to share the word. A generic
        # config field name collides across the repo and turns the reconciler's
        # answer into a coincidence.
        "trade_window": {
            "deadline_week": settings.get("trade_deadline"),
            "review_days": settings.get("trade_review_days"),
            "pick_trading": settings.get("pick_trading"),
        },
        "teams_detail": teams,
        "original_rounds": original_rounds(league_id),
        "keepers": keeper_rules or {
            # Sleeper cannot tell us these — defaults match the house rules and
            # are confirmed on the editable review screen before any build.
            "count": 3,
            "cost_model": "original_round",
            "max_years": 3,
            "undrafted_rule": "assigned_round",
            "undrafted_round": 10,
        },
        "imported_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "history": [
            {"season": h.get("season"), "league_id": h.get("league_id"), "name": h.get("name")}
            for h in league_history(league_id)
        ],
        "confirmed": False,   # flipped by the review screen; a build warns until then
    }
    print(f"  {cfg['teams']} teams · {len(cfg['scoring'])} scoring rules · "
          f"{sum(cfg['roster_slots'].values())} roster slots · "
          f"{len(cfg['original_rounds'])} prior-draft rounds recovered")
    return cfg


if __name__ == "__main__":
    import sys
    from config_schema import validate, save
    lid = sys.argv[1] if len(sys.argv) > 1 else "1374848328470102016"
    out = Path(__file__).parent / "config" / "league_config.json"
    save(validate(import_league(lid)), out)
    print(f"wrote {out}")
