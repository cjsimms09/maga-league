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

import adp as adp_mod  # noqa: E402
import config_schema  # noqa: E402
import keepers as keepers_mod  # noqa: E402
import projections as proj_mod  # noqa: E402
import vorp as vorp_mod  # noqa: E402
import managers as managers_mod  # noqa: E402

ARTIFACT_VERSION = 2

# Provenance accumulators. Module-level because they are written deep in the
# load path and read at artifact-assembly time; both are reset per build.
# The rule they exist to enforce: degrading gracefully is right, degrading
# invisibly is not. Every fallback writes its reason here, the artifact carries
# it, and the War Room renders it.
ADP_PROVENANCE: dict = {}
OPPORTUNITY_PROVENANCE: dict = {}
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
            ADP_PROVENANCE.update({
                "adp_source": "fixture",
                "warning": "DISABLED — offline build. This board is fixture data, "
                           "not real ADP or real projections. Do not draft off it.",
            })
            OPPORTUNITY_PROVENANCE["status"] = "DISABLED — offline build"
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

    # Real ADP replaces search_rank as the market signal. search_rank stays as a
    # *declared* fallback — recorded per player, surfaced in the UI above a
    # threshold — never as a silent one.
    try:
        table = adp_mod.build_adp_table(
            raw, fmt=_ffc_format(cfg), teams=int(cfg.get("teams") or 10),
            year=int(cfg.get("season") or time.gmtime().tm_year))
        ADP_PROVENANCE.update(adp_mod.apply_with_fallback(players, table["adp"],
                                                          teams=int(cfg.get("teams") or 10)))
        ADP_PROVENANCE["report"] = table["report"]
    except Exception as exc:  # noqa: BLE001 — reported loudly below, not swallowed
        print(f"  ! ADP unavailable ({exc}); the whole board falls back to search_rank")
        for p in players:
            p["adp"] = float(p["raw_adp"])
            p["adp_sd"] = max(6.0, min(0.25 * p["adp"], 24.0))
            p["adp_source"] = "search_rank"
        ADP_PROVENANCE.update({
            "adp_source": "search_rank",
            "fallback_rate": 1.0,
            "warning": f"DISABLED — real ADP unavailable ({exc}). Every market-derived "
                       "number on this board (survival odds, VONA, run detection) is "
                       "running on Sleeper popularity rank, not draft behaviour.",
        })

    # raw_adp is what the rest of the pipeline keys on; point it at the real
    # thing now that we have one.
    for p in players:
        p["raw_adp"] = p.get("adp", p["raw_adp"])
        p["consensus_rank"] = p["raw_adp"]

    return proj_mod.blend(players, baseline, load_opportunity(cfg, offline), cfg)


def _ffc_format(cfg: dict) -> str:
    """Pick FFC's format path segment from our actual scoring, not a guess."""
    rec = float((cfg.get("scoring") or {}).get("rec", 0) or 0)
    if rec >= 0.75:
        return "ppr"
    if rec >= 0.25:
        return "half-ppr"
    return "standard"


def load_opportunity(cfg: dict, offline: bool) -> dict:
    """nflfastR play-by-play -> opportunity metrics.

    Optional by design, but never *invisibly* optional: every exit path writes
    its reason into OPPORTUNITY_PROVENANCE, which lands in the artifact and is
    rendered as a banner in the War Room. A schema change upstream used to
    present as "no opportunity data" and pass every test; now it presents as a
    red banner saying exactly what broke.
    """
    if offline:
        OPPORTUNITY_PROVENANCE["status"] = "DISABLED — offline build"
        return {}
    try:
        import nfl_data_py as nfl
    except ImportError:
        OPPORTUNITY_PROVENANCE["status"] = "DISABLED — nfl_data_py not installed"
        print("  ! nfl_data_py not installed; skipping opportunity adjustment")
        return {}
    try:
        season = int(cfg.get("season") or time.gmtime().tm_year)
        seasons = [season - 1, season - 2]
        print(f"  pulling play-by-play for {seasons} ...")
        pbp = nfl.import_pbp_data(seasons, downcast=True, cache=False)
        weekly = None
        # Record the shape we actually received. The audit's point: this code had
        # never run against a real response, and a schema drift would be silent.
        try:
            OPPORTUNITY_PROVENANCE["pbp_columns"] = sorted(map(str, pbp.columns))[:200]
            OPPORTUNITY_PROVENANCE["pbp_rows"] = int(len(pbp))
            print(f"  pbp: {len(pbp)} rows, {len(pbp.columns)} columns")
        except Exception:  # noqa: BLE001 — diagnostics must never break the build
            pass
        metrics = proj_mod.opportunity_metrics(
            pbp, weekly, seasons, cfg.get("recency_weights", [0.7, 0.3]))
        OPPORTUNITY_PROVENANCE["status"] = "ok"
        OPPORTUNITY_PROVENANCE["players_with_metrics"] = len(metrics)
        return metrics
    except Exception as exc:  # noqa: BLE001 - degrade, but on the record
        OPPORTUNITY_PROVENANCE["status"] = f"DISABLED — {type(exc).__name__}: {exc}"
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
    players_db = si.fetch_players()

    # Contemporaneous ADP for each prior season. Without it, `reach_delta` and
    # `bpa_vs_need` judge a 2019 pick against 2026 popularity — a manager whose
    # pick busted looks like a reacher in hindsight. FFC's `year` parameter
    # makes that measurable instead of estimated.
    seasons = sorted({str(d.get("season")) for d in drafts if d.get("season")})
    hist = {}
    if seasons:
        try:
            hist = adp_mod.historical_adp(
                players_db, fmt=_ffc_format(cfg), teams=int(cfg.get("teams") or 10),
                years=[int(s) for s in seasons if str(s).isdigit()])
        except Exception as exc:  # noqa: BLE001 — profiles still build, on the proxy path
            print(f"  ! historical ADP unavailable ({exc}); manager market metrics stay proxied")

    profiles = managers_mod.build_profiles(drafts, players_db, historical_adp=hist)
    proxied = [p["name"] for p in profiles.get("managers", {}).values()
               if (p.get("reach_delta") or {}).get("proxy")]
    if proxied:
        print(f"  manager market metrics still proxied for {len(proxied)}: {', '.join(proxied[:6])}")
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
        # Read this before trusting anything above it.
        "provenance": {
            "adp": dict(ADP_PROVENANCE),
            "opportunity_adjustment": OPPORTUNITY_PROVENANCE.get("status", "unknown"),
            "opportunity_detail": {k: v for k, v in OPPORTUNITY_PROVENANCE.items() if k != "status"},
        },
    }
    _assert_opportunity_coverage(available, artifact)
    return artifact


# In a healthy build most of the top of the board should carry a non-zero
# opportunity adjustment. If that collapses, the metrics silently stopped
# matching players and every projection is consensus-only without saying so.
OPPORTUNITY_MIN_COVERAGE = 0.60
OPPORTUNITY_COVERAGE_TOP_N = 200


def _assert_opportunity_coverage(players: list, artifact: dict) -> None:
    status = OPPORTUNITY_PROVENANCE.get("status", "unknown")
    if status != "ok":
        # Already declared disabled — that path is honest, let it through.
        print(f"  opportunity adjustment: {status}")
        return
    top = sorted(players, key=lambda p: p.get("raw_adp") or 9999)[:OPPORTUNITY_COVERAGE_TOP_N]
    hit = sum(1 for p in top if p.get("opportunity_z"))
    cov = hit / max(len(top), 1)
    artifact["provenance"]["opportunity_coverage"] = round(cov, 3)
    print(f"  opportunity coverage: {cov:.0%} of the top {len(top)}")
    if cov < OPPORTUNITY_MIN_COVERAGE:
        raise RuntimeError(
            f"opportunity adjustment reached only {cov:.0%} of the top {len(top)} players "
            f"(expected >= {OPPORTUNITY_MIN_COVERAGE:.0%}). The metrics ran but matched "
            "almost nobody — that is a join/schema failure, not a quiet degradation."
        )


REAL_FIXTURES = HERE / "tests" / "fixtures" / "real"


def snapshot(league_id: str | None) -> int:
    """Record what the real APIs actually return, and diff it against the
    fixtures the test suite has been trusting.

    The audit's point stands: a green test suite built entirely on hand-written
    fixtures proves the code is self-consistent, not that it matches reality.
    This runs once with network, writes `tests/fixtures/real/`, and reports
    every place a hand-written fixture disagrees with the live schema. Any
    fixture this contradicts should be deleted and replaced with the real one.

    Exit code is non-zero when a mismatch is found, so CI can gate on it.
    """
    REAL_FIXTURES.mkdir(parents=True, exist_ok=True)
    findings, recorded = [], {}

    def record(name: str, fn):
        try:
            data = fn()
        except Exception as exc:  # noqa: BLE001 — a snapshot run reports, it does not crash
            findings.append(f"{name}: FETCH FAILED — {type(exc).__name__}: {exc}")
            return None
        path = REAL_FIXTURES / f"{name}.json"
        path.write_text(json.dumps(data, indent=1, default=str)[:8_000_000])
        recorded[name] = data
        print(f"  recorded {name} -> {path.name}")
        return data

    cfg = config_schema.load(CONFIG_PATH) if CONFIG_PATH.exists() else {}
    lid = league_id or cfg.get("sleeper_league_id")

    import sleeper_import as si
    if lid:
        record("sleeper_league", lambda: si.fetch_league(lid))
        record("sleeper_rosters", lambda: si.fetch_rosters(lid))
        record("sleeper_users", lambda: si.fetch_users(lid))

    # FFC: the one call whose real field set we have never seen.
    ffc = record("ffc_adp", lambda: adp_mod.fetch_adp(
        _ffc_format(cfg), int(cfg.get("teams") or 10),
        int(cfg.get("season") or time.gmtime().tm_year)))
    if ffc:
        desc = adp_mod.describe_payload(ffc)
        (REAL_FIXTURES / "ffc_adp.describe.json").write_text(json.dumps(desc, indent=1, default=str))
        if not desc["stdev_field"]:
            findings.append("ffc_adp: NO standard-deviation field in the payload — "
                            "the fitted sd rule stays in place (this is information, not a failure)")

    # nflfastR: the path that has never executed against real data.
    try:
        import nfl_data_py as nfl
        season = int(cfg.get("season") or time.gmtime().tm_year)
        pbp = nfl.import_pbp_data([season - 1], downcast=True, cache=False)
        cols = sorted(map(str, pbp.columns))
        (REAL_FIXTURES / "nflfastr_pbp.schema.json").write_text(json.dumps(
            {"season": season - 1, "rows": int(len(pbp)), "columns": cols}, indent=1))
        print(f"  recorded nflfastR schema: {len(pbp)} rows, {len(cols)} columns")
        (REAL_FIXTURES / "nflfastr_pbp.head.json").write_text(
            pbp.head(200).to_json(orient="records"))
        # The columns projections.py actually reads. If one is missing, the
        # opportunity path was never going to work and no test would say so.
        needed = ["player_id", "receiver_player_id", "rusher_player_id", "posteam",
                  "season", "week", "pass_attempt", "rush_attempt", "yardline_100",
                  "air_yards", "complete_pass"]
        missing = [c for c in needed if c not in cols]
        if missing:
            findings.append(f"nflfastr_pbp: MISSING columns used by projections.py: {missing}")
    except ImportError:
        findings.append("nflfastr_pbp: nfl_data_py not installed — the opportunity "
                        "adjustment cannot run in this environment at all")
    except Exception as exc:  # noqa: BLE001
        findings.append(f"nflfastr_pbp: FETCH FAILED — {type(exc).__name__}: {exc}")

    # Diff against the hand-written fixtures.
    hand = HERE / "fixtures"
    for name, real in recorded.items():
        cand = hand / f"{name}.json"
        if not cand.exists():
            continue
        old = json.loads(cand.read_text())
        rk = set(real[0].keys()) if isinstance(real, list) and real and isinstance(real[0], dict) \
            else set(real.keys()) if isinstance(real, dict) else set()
        ok = set(old[0].keys()) if isinstance(old, list) and old and isinstance(old[0], dict) \
            else set(old.keys()) if isinstance(old, dict) else set()
        if rk and ok and rk != ok:
            findings.append(
                f"{name}: hand-written fixture disagrees with live schema. "
                f"only-in-fixture={sorted(ok - rk)} only-in-live={sorted(rk - ok)}")

    print("\n=== snapshot findings ===")
    if not findings:
        print("none — live schemas match the fixtures")
    for f in findings:
        print(f"  ! {f}")
    print(f"\nreal responses in {REAL_FIXTURES}")
    return 1 if findings else 0


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--league-id")
    ap.add_argument("--offline", action="store_true", help="build from cache/fixtures only")
    ap.add_argument("--snapshot", action="store_true",
                    help="record real API responses to tests/fixtures/real/ and diff "
                         "them against the hand-written fixtures, then exit")
    ap.add_argument("--slot", type=int, help="my draft slot (1-indexed)")
    ap.add_argument("--out", default=str(OUT))
    args = ap.parse_args()

    if args.snapshot:
        raise SystemExit(snapshot(args.league_id))

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
