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


def fetch_draft_picks(draft_id: str) -> list:
    return _get(f"/draft/{draft_id}/picks")


def fetch_players() -> dict:
    """The full player DB (~5MB). Cached for a day — it changes slowly."""
    return _get("/players/nfl", ttl=24 * 60 * 60)


def fetch_projections(season: str, week: int | str = "season") -> dict:
    """Consensus projections. Endpoint shape varies by season; caller tolerates None."""
    try:
        return _get(f"/projections/nfl/{season}/{week}?season_type=regular", ttl=6 * 60 * 60)
    except Exception as exc:  # noqa: BLE001 - projections are optional input
        print(f"  ! projections unavailable ({exc}); falling back to rank-based baseline")
        return {}


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
    if settings.get("reversal_round"):
        draft_type = "third_round_reversal"

    cfg = {
        "league_id": league_id,
        "league_name": league.get("name"),
        "season": league.get("season"),
        "teams": int(league.get("total_rosters") or len(rosters) or 10),
        "draft_type": draft_type,
        "roster_slots": roster_slots_from(league),
        "scoring": dict(league.get("scoring_settings") or {}),
        "playoff_week_start": settings.get("playoff_week_start", 15),
        "playoff_teams": settings.get("playoff_teams", 4),
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
