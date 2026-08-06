"""Complete historical league export — the substrate for every behavioural model.

Everything interesting about this league is that it is the *same nine
opponents*, every year. Sleeper hands back that history for free, but only one
week and one endpoint at a time, so this script walks the whole thing once and
writes a single versioned artifact.

What it captures, for every season reachable through `previous_league_id`:

  * every week's matchups, including `starters` AND `players` — the pair is
    what makes lineup efficiency computable (what they started vs. what they
    could have started)
  * every transaction with its FAAB bid amount
  * every draft's picks
  * final standings and end-of-season rosters

Output: `draft/data/league_history.json`, a few hundred KB. It never changes
for completed seasons, so re-runs are cheap and idempotent.

Run:  python history_export.py <league_id>            (writes the artifact)
      python history_export.py <league_id> --verify    (re-fetch, diff, exit 1)

Design rule, from the work order: **fail loudly, never silently.** A season
whose matchup data comes back empty gets recorded as an explicit gap in
`provenance.gaps`, not dropped. A consumer that finds fewer seasons than it
expected must be able to tell "the league is young" from "the fetch broke."
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

from sleeper_import import (
    _get,
    fetch_league,
    fetch_rosters,
    fetch_users,
    fetch_drafts,
    fetch_draft_picks,
    league_history,
)

ARTIFACT_VERSION = 1
OUT_DIR = Path(__file__).parent / "data"
OUT_PATH = OUT_DIR / "league_history.json"

# Sleeper returns [] for weeks that never happened, so over-fetching is safe and
# cheaper than trying to derive each season's real length up front. 18 covers
# the regular season plus playoffs in every format this league has used.
MAX_WEEK = 18

# A completed season with fewer than this many weeks of matchup data is a fetch
# problem, not a short season. Recorded as a gap rather than silently accepted.
MIN_EXPECTED_WEEKS = 13


def fetch_matchups(league_id: str, week: int) -> list:
    # Long TTL: a completed week is immutable. The current week gets refetched
    # by the caller passing a short ttl.
    return _get(f"/league/{league_id}/matchups/{week}", ttl=7 * 24 * 60 * 60)


def fetch_transactions(league_id: str, week: int) -> list:
    return _get(f"/league/{league_id}/transactions/{week}", ttl=7 * 24 * 60 * 60)


def fetch_winners_bracket(league_id: str) -> list:
    return _get(f"/league/{league_id}/winners_bracket", ttl=7 * 24 * 60 * 60)


def fetch_losers_bracket(league_id: str) -> list:
    return _get(f"/league/{league_id}/losers_bracket", ttl=7 * 24 * 60 * 60)


def _owner_index(users: list, rosters: list) -> dict:
    """roster_id -> {user_id, display_name, team_name}.

    Every downstream model keys on the human, not the roster, because roster
    ids are reassigned across seasons and the humans are not.
    """
    by_user = {u["user_id"]: u for u in users}
    out = {}
    for r in rosters:
        uid = r.get("owner_id")
        u = by_user.get(uid, {})
        meta = u.get("metadata") or {}
        out[str(r["roster_id"])] = {
            "user_id": uid,
            "display_name": u.get("display_name"),
            "team_name": meta.get("team_name") or u.get("display_name"),
        }
    return out


def _standings(rosters: list) -> list:
    """Final standings from end-of-season roster records.

    Sleeper's bracket endpoints give playoff placement; this gives the regular
    season order. Both are exported — they answer different questions.
    """
    rows = []
    for r in rosters:
        s = r.get("settings") or {}
        rows.append({
            "roster_id": r["roster_id"],
            "owner_id": r.get("owner_id"),
            "wins": s.get("wins", 0),
            "losses": s.get("losses", 0),
            "ties": s.get("ties", 0),
            # Sleeper splits points into whole and decimal parts.
            "points_for": s.get("fpts", 0) + s.get("fpts_decimal", 0) / 100,
            "points_against": s.get("fpts_against", 0) + s.get("fpts_against_decimal", 0) / 100,
            "waiver_budget_used": s.get("waiver_budget_used", 0),
        })
    rows.sort(key=lambda x: (-x["wins"], -x["points_for"]))
    for i, row in enumerate(rows, 1):
        row["rank"] = i
    return rows


def export_season(lg: dict, *, gaps: list) -> dict:
    """One season, fully hydrated. Appends to `gaps` rather than raising."""
    league_id = lg["league_id"]
    season = str(lg.get("season"))
    label = f"{season} ({league_id})"
    print(f"  · {label}")

    users = fetch_users(league_id)
    rosters = fetch_rosters(league_id)

    weeks, transactions = {}, {}
    for wk in range(1, MAX_WEEK + 1):
        try:
            m = fetch_matchups(league_id, wk)
        except Exception as exc:  # noqa: BLE001 — one bad week must not lose the season
            gaps.append({"season": season, "week": wk, "kind": "matchups", "error": str(exc)})
            continue
        if not m:
            continue
        weeks[str(wk)] = [{
            "roster_id": t.get("roster_id"),
            "matchup_id": t.get("matchup_id"),
            "points": t.get("points"),
            "starters": t.get("starters") or [],
            "players": t.get("players") or [],
            # Per-player scores are what make "optimal legal lineup" computable
            # without re-deriving scoring from raw stats.
            "players_points": t.get("players_points") or {},
            "starters_points": t.get("starters_points") or [],
        } for t in m]

        try:
            tx = fetch_transactions(league_id, wk)
        except Exception as exc:  # noqa: BLE001
            gaps.append({"season": season, "week": wk, "kind": "transactions", "error": str(exc)})
            tx = []
        if tx:
            transactions[str(wk)] = [{
                "type": t.get("type"),
                "status": t.get("status"),
                "roster_ids": t.get("roster_ids") or [],
                "adds": t.get("adds") or {},
                "drops": t.get("drops") or {},
                # The whole point of item 6: real observed FAAB bids.
                "waiver_bid": (t.get("settings") or {}).get("waiver_bid"),
                "created": t.get("created"),
            } for t in tx]

    if weeks and len(weeks) < MIN_EXPECTED_WEEKS:
        gaps.append({
            "season": season, "kind": "short_season",
            "error": f"only {len(weeks)} weeks of matchups (expected >= {MIN_EXPECTED_WEEKS})",
        })

    drafts = []
    for d in fetch_drafts(league_id):
        try:
            picks = fetch_draft_picks(d["draft_id"])
        except Exception as exc:  # noqa: BLE001
            gaps.append({"season": season, "kind": "draft", "error": str(exc)})
            continue
        drafts.append({
            "draft_id": d["draft_id"],
            "status": d.get("status"),
            "type": d.get("type"),
            "settings": d.get("settings") or {},
            # slot_to_roster_id is how a manager profile gets bound to a seat.
            "slot_to_roster_id": d.get("slot_to_roster_id") or {},
            "picks": [{
                "round": p.get("round"), "pick_no": p.get("pick_no"),
                "roster_id": p.get("roster_id"), "player_id": p.get("player_id"),
                "is_keeper": p.get("is_keeper"),
            } for p in picks],
        })

    brackets = {}
    for name, fn in (("winners", fetch_winners_bracket), ("losers", fetch_losers_bracket)):
        try:
            brackets[name] = fn(league_id)
        except Exception as exc:  # noqa: BLE001
            gaps.append({"season": season, "kind": f"{name}_bracket", "error": str(exc)})

    return {
        "season": season,
        "league_id": league_id,
        "name": lg.get("name"),
        "status": lg.get("status"),
        "settings": lg.get("settings") or {},
        "scoring_settings": lg.get("scoring_settings") or {},
        "roster_positions": lg.get("roster_positions") or [],
        "owners": _owner_index(users, rosters),
        "final_rosters": [{
            "roster_id": r["roster_id"], "owner_id": r.get("owner_id"),
            "players": r.get("players") or [], "keepers": r.get("keepers") or [],
        } for r in rosters],
        "standings": _standings(rosters),
        "weeks": weeks,
        "transactions": transactions,
        "drafts": drafts,
        "brackets": brackets,
    }


def export(league_id: str) -> dict:
    seasons_raw = league_history(league_id)
    if not seasons_raw:
        raise RuntimeError(f"no league history for {league_id} — check the id")
    print(f"exporting {len(seasons_raw)} season(s)")

    gaps: list = []
    seasons = [export_season(lg, gaps=gaps) for lg in seasons_raw]

    total_weeks = sum(len(s["weeks"]) for s in seasons)
    total_tx = sum(len(v) for s in seasons for v in s["transactions"].values())
    bid_tx = sum(1 for s in seasons for v in s["transactions"].values()
                 for t in v if t.get("waiver_bid") is not None)

    return {
        "artifact_version": ARTIFACT_VERSION,
        "built_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "root_league_id": league_id,
        "seasons": seasons,
        "provenance": {
            "source": "sleeper",
            "seasons_exported": [s["season"] for s in seasons],
            "team_weeks": total_weeks,
            "transactions": total_tx,
            "transactions_with_bids": bid_tx,
            # Loud by construction: a consumer reads this before trusting counts.
            "gaps": gaps,
            "complete": not gaps,
        },
    }


def _summarise(art: dict) -> None:
    p = art["provenance"]
    print(f"\nseasons     : {', '.join(p['seasons_exported'])}")
    print(f"week-blocks : {p['team_weeks']}")
    print(f"transactions: {p['transactions']} ({p['transactions_with_bids']} with FAAB bids)")
    if p["gaps"]:
        print(f"\n!! {len(p['gaps'])} GAP(S) — this export is incomplete:")
        for g in p["gaps"][:20]:
            print(f"   {g.get('season')} {g.get('kind')} wk={g.get('week', '-')}: {g['error']}")
        if len(p["gaps"]) > 20:
            print(f"   … and {len(p['gaps']) - 20} more")
    else:
        print("\ncomplete — no gaps")


def main(argv: list) -> int:
    if not argv:
        print(__doc__)
        return 2
    league_id, verify = argv[0], "--verify" in argv

    art = export(league_id)
    _summarise(art)

    if verify:
        if not OUT_PATH.exists():
            print("\n--verify: no existing artifact to diff against")
            return 1
        old = json.loads(OUT_PATH.read_text())
        # Completed seasons are immutable; anything that changed is either a
        # live season or a bug, and the caller should know which.
        changed = [s["season"] for s in art["seasons"]
                   if json.dumps(s, sort_keys=True) != json.dumps(
                       next((o for o in old["seasons"] if o["season"] == s["season"]), {}),
                       sort_keys=True)]
        print(f"\n--verify: {len(changed)} season(s) differ: {changed or 'none'}")
        return 1 if changed else 0

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(art, indent=1))
    size_kb = OUT_PATH.stat().st_size / 1024
    print(f"\nwrote {OUT_PATH} ({size_kb:.0f} KB)")
    return 0 if art["provenance"]["complete"] else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
