"""Offline pipeline entry point — emits public/draft_data.json.

Runs nightly in CI (which has network access), commits the artifact, and the
browser engine consumes it. Nothing here runs during a live draft: the only
latency-sensitive math (VONA, survival updates) is client-side.

Usage:
    python build.py --league-id 1374848328470102016
    python build.py --offline            # rebuild from cache/fixtures only
"""
from __future__ import annotations
import argparse
import json
import sys
import time
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))

import config_schema  # noqa: E402
import keepers as keepers_mod  # noqa: E402
import projections as proj_mod  # noqa: E402
import vorp as vorp_mod  # noqa: E402
import managers as managers_mod  # noqa: E402

ARTIFACT_VERSION = 1
OUT = HERE.parent / "public" / "draft_data.json"
CONFIG_PATH = HERE / "config" / "league_config.json"
KEEPERS_PATH = HERE / "config" / "keepers.json"
PROFILES_PATH = HERE / "config" / "manager_profiles.json"

# Positions the draft board cares about. IDP leagues would extend this.
DRAFTABLE = {"QB", "RB", "WR", "TE", "K", "DEF"}


def load_players(cfg: dict, offline: bool) -> list[dict]:
    """Sleeper player DB + ADP + consensus projections -> our player rows."""
    if offline:
        fixture = HERE / "fixtures" / "players.json"
        if fixture.exists():
            print("  offline: using fixture player pool")
            return json.loads(fixture.read_text())
        print("  offline: no fixture, empty pool")
        return []

    import sleeper_import as si
    raw = si.fetch_players()
    projections = si.fetch_projections(cfg.get("season") or str(time.gmtime().tm_year))
    baseline = proj_mod.baseline_from_projections(projections, cfg["scoring"])

    players = []
    for pid, p in raw.items():
        pos = (p.get("fantasy_positions") or [p.get("position")])[0] if p.get("fantasy_positions") else p.get("position")
        if pos not in DRAFTABLE or p.get("active") is False:
            continue
        rank = p.get("search_rank")
        if rank is None or rank >= 9_999_999:
            continue
        players.append({
            "player_id": str(pid),
            "name": p.get("full_name") or f"{p.get('first_name','')} {p.get('last_name','')}".strip() or str(pid),
            "position": pos,
            "team": p.get("team") or "FA",
            "bye": (p.get("metadata") or {}).get("bye_week"),
            "age": p.get("age"),
            "years_exp": p.get("years_exp"),
            "injury_status": p.get("injury_status"),
            "depth_chart_order": p.get("depth_chart_order"),
            "raw_adp": float(rank),
            "consensus_rank": float(rank),
        })
    print(f"  {len(players)} draftable players, {len(baseline)} with consensus projections")
    return proj_mod.blend(players, baseline, load_opportunity(cfg, offline), cfg)


def load_opportunity(cfg: dict, offline: bool) -> dict:
    """nflfastR play-by-play -> opportunity metrics. Optional by design."""
    if offline:
        return {}
    try:
        import nfl_data_py as nfl
    except ImportError:
        print("  ! nfl_data_py not installed; skipping opportunity adjustment")
        return {}
    try:
        season = int(cfg.get("season") or time.gmtime().tm_year)
        seasons = [season - 1, season - 2]
        print(f"  pulling play-by-play for {seasons} ...")
        pbp = nfl.import_pbp_data(seasons, downcast=True, cache=False)
        weekly = None
        return proj_mod.opportunity_metrics(pbp, weekly, seasons, cfg.get("recency_weights", [0.7, 0.3]))
    except Exception as exc:  # noqa: BLE001 - never fail a build over an optional input
        print(f"  ! opportunity data unavailable ({exc}); using consensus only")
        return {}


def load_keepers(cfg: dict) -> dict[int, list[dict]]:
    """{team_slot: [keeper]} from config/keepers.json (hand-maintained)."""
    if not KEEPERS_PATH.exists():
        print("  no keepers.json — building with an empty keeper set")
        return {}
    data = json.loads(KEEPERS_PATH.read_text())
    out: dict[int, list[dict]] = {}
    for entry in data.get("teams", []):
        slot = int(entry["draft_slot"])
        out[slot] = entry.get("keepers", [])
    total = sum(len(v) for v in out.values())
    print(f"  {total} keepers across {len(out)} teams")
    return out


def build_manager_profiles(cfg: dict, offline: bool) -> dict:
    """A1 — behavioural profiles from every prior draft in league history."""
    if offline:
        if PROFILES_PATH.exists():
            print("  offline: using existing manager profiles")
            return json.loads(PROFILES_PATH.read_text())
        fixture = HERE / "fixtures" / "manager_profiles.json"
        if fixture.exists():
            return json.loads(fixture.read_text())
        return {"managers": {}, "league_average": {}, "drafts_analysed": 0,
                "note": "offline build with no cached profiles"}
    import sleeper_import as si
    drafts = si.all_drafts(cfg["league_id"])
    profiles = managers_mod.build_profiles(drafts, si.fetch_players())
    managers_mod.save(profiles, PROFILES_PATH)
    return profiles


def build(cfg: dict, *, offline: bool = False) -> dict:
    print("Building draft artifact ...")
    players = load_players(cfg, offline)
    if not players:
        raise SystemExit("no players — cannot build a board")

    profiles = build_manager_profiles(cfg, offline)
    print(f"  manager profiles: {len(profiles.get('managers', {}))} from "
          f"{profiles.get('drafts_analysed', 0)} prior draft(s)")
    keeper_map = load_keepers(cfg)
    kept_ids = {str(k["player_id"]) for ks in keeper_map.values() for k in ks if k.get("player_id")}

    order = keepers_mod.build_true_pick_order(cfg, keeper_map)
    print(f"  true pick order: {len(order.picks)} picks, {len(order.forfeited)} forfeited")
    if order.my_picks:
        print(f"  my picks: {order.my_picks[:8]}{' ...' if len(order.my_picks) > 8 else ''}")

    available = keepers_mod.adjusted_adp(players, order, cfg, kept_ids)
    available, vorp_diag = vorp_mod.apply_vorp(available, cfg)
    available = vorp_mod.assign_tiers(available)

    artifact = {
        "version": ARTIFACT_VERSION,
        "built_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "league": {
            "league_id": cfg.get("league_id"),
            "name": cfg.get("league_name"),
            "season": cfg.get("season"),
            "teams": cfg["teams"],
            "draft_type": cfg["draft_type"],
            "rounds": cfg.get("rounds"),
            "my_draft_slot": cfg.get("my_draft_slot"),
            "roster_slots": cfg["roster_slots"],
            "starters": cfg["starters"],
            "scoring": cfg["scoring"],
            "keeper_rules": cfg["keepers"],
        },
        "pick_order": {
            "picks": [{"overall": p["overall"], "round": p["round"], "slot": p["team_slot"]} for p in order.picks],
            "my_picks": order.my_picks,
            "my_picks_before_keepers": order.my_original_picks,
            "forfeited": order.forfeited,
        },
        "replacement": vorp_diag,
        "manager_profiles": profiles,
        "players": available,
        "kept_player_ids": sorted(kept_ids),
        "notes": {
            "adp_blend_weight": cfg.get("adp_blend_weight"),
            "opportunity_cap": cfg.get("opportunity_cap"),
            "opportunity_applied": any(p.get("opportunity_z") for p in available),
            "config_confirmed": bool(cfg.get("confirmed")),
            "profiles_from_drafts": profiles.get("drafts_analysed", 0),
        },
    }
    return artifact


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--league-id")
    ap.add_argument("--offline", action="store_true", help="build from cache/fixtures only")
    ap.add_argument("--slot", type=int, help="my draft slot (1-indexed)")
    ap.add_argument("--out", default=str(OUT))
    args = ap.parse_args()

    if args.league_id and not args.offline:
        import sleeper_import as si
        existing = json.loads(CONFIG_PATH.read_text()) if CONFIG_PATH.exists() else {}
        cfg_raw = si.import_league(args.league_id, keeper_rules=existing.get("keepers"))
        if existing.get("my_draft_slot"):
            cfg_raw["my_draft_slot"] = existing["my_draft_slot"]
        config_schema.save(config_schema.validate(cfg_raw), CONFIG_PATH)
    if not CONFIG_PATH.exists():
        raise SystemExit(f"no league config at {CONFIG_PATH} — run with --league-id first")

    cfg = config_schema.load(CONFIG_PATH)
    if args.slot:
        cfg["my_draft_slot"] = args.slot

    if not cfg.get("confirmed"):
        print("  ! league_config has not been confirmed on the review screen — "
              "scoring and roster slots are unverified (Commish -> War Room -> League Setup)")
    artifact = build(cfg, offline=args.offline)
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(artifact, separators=(",", ":")))
    size_kb = out.stat().st_size / 1024
    print(f"wrote {out} — {len(artifact['players'])} players, {size_kb:.0f} KB")


if __name__ == "__main__":
    main()
