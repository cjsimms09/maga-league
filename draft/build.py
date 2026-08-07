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
PROJECTION_PROVENANCE: dict = {}

# Below this many players carrying non-zero projected points, the provider has
# not published projections for the season yet and the baseline is worthless.
PROJECTION_MIN_NONZERO = 100

# A board where the top of the draft has no value attached is not a degraded
# board, it is an unusable one: VONA is a bet on value-vs-market divergence, and
# with every VORP at zero the tool is just re-printing ADP.
VALUE_MIN_COVERAGE = 0.90
OUT = HERE.parent / "public" / "draft_data.json"
CONFIG_PATH = HERE / "config" / "league_config.json"
KEEPERS_PATH = HERE / "config" / "keepers.json"
PROFILES_PATH = HERE / "config" / "manager_profiles.json"

# Positions the draft board cares about. IDP leagues would extend this.
DRAFTABLE = {"QB", "RB", "WR", "TE", "K", "DEF"}

# config_confirmed single source of truth (item 2 fix 3).
# The committed league_config.json is a CACHE of what the commissioner confirmed
# on the live site; the AUTHORITY is the Blob the League Setup screen writes.
# The bug this closes: a commissioner confirms on the site (Blob=true) but the
# nightly build reads the stale file (false) and ships an artifact that warns
# "unconfirmed" forever. The build now fetches the live flag and stamps where
# the value came from into provenance, so the file can never masquerade as
# authority. If the live flag is unreachable we fall back to the file BUT label
# it file-cache and warn — a silent fallback that claimed authority would be the
# exact dishonesty the provenance discipline exists to prevent.
CONFIG_STATUS_URL_ENV = "DRAFT_CONFIG_STATUS_URL"


def fetch_authoritative_confirmed(cfg: dict) -> dict:
    """Resolve config_confirmed from its authority (the Blob), not the file.

    Returns a provenance record: the value actually used, its source
    ('blob' when the live endpoint answered, 'file-cache' otherwise), whether
    that source is authoritative, and a warning when it is not.
    """
    import os

    file_value = bool(cfg.get("confirmed"))
    url = os.environ.get(CONFIG_STATUS_URL_ENV, "").strip()
    fetched_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    if not url:
        return {
            "value": file_value,
            "source": "file-cache",
            "authoritative": False,
            "warning": (f"{CONFIG_STATUS_URL_ENV} not set — used the committed file, "
                        "which is a cache of the site's confirmation, not the authority"),
            "file_value": file_value,
            "fetched_at": fetched_at,
        }
    import urllib.request

    endpoint = url.rstrip("/")
    if not endpoint.endswith("/api/draft-config-status"):
        endpoint = endpoint + "/api/draft-config-status"
    try:
        with urllib.request.urlopen(endpoint, timeout=10) as resp:
            live = json.loads(resp.read().decode("utf-8"))
        value = bool(live.get("confirmed"))
        rec = {
            "value": value,
            "source": "blob",
            "authoritative": True,
            "warning": None,
            "url": endpoint,
            "confirmed_at": live.get("confirmed_at"),
            "cost_model": live.get("cost_model"),
            "file_value": file_value,
            "fetched_at": fetched_at,
        }
        if value != file_value:
            # Not an error — this is exactly the drift the fetch exists to catch.
            print(f"  config_confirmed: live={value} overrides stale file={file_value} "
                  f"(authority: {endpoint})")
        return rec
    except Exception as exc:  # noqa: BLE001 — any failure must fall back loudly
        return {
            "value": file_value,
            "source": "file-cache",
            "authoritative": False,
            "warning": (f"could not reach {endpoint} ({exc.__class__.__name__}): "
                        "fell back to the committed file, which is a cache not the authority"),
            "url": endpoint,
            "file_value": file_value,
            "fetched_at": fetched_at,
        }


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
    season_str = str(cfg.get("season") or time.gmtime().tm_year)
    projections = si.fetch_projections(season_str)
    baseline = proj_mod.baseline_from_projections(projections, cfg["scoring"])
    nonzero = sum(1 for v in baseline.values() if v and v > 0)
    print(f"  projections {season_str}: {len(baseline)} rows, {nonzero} with points")
    PROJECTION_PROVENANCE.update({"source": "sleeper_projections", "season": season_str,
                                  "rows": len(baseline), "nonzero": nonzero})

    # In August the upcoming season has no projections yet: Sleeper returns the
    # player list with empty stat lines, baseline_from_projections dutifully
    # scores them all to zero, and the board comes out with proj_mean, VORP and
    # every ceiling at 0.0 while ADP and opportunity metrics look perfectly
    # healthy. That is the whole value side of the engine silently dead, and it
    # is exactly what the first real board did.
    if nonzero < PROJECTION_MIN_NONZERO:
        prior = str(int(season_str) - 1)
        print(f"  ! only {nonzero} projections carry points — falling back to {prior} actuals")
        stats = si.fetch_stats(prior)
        fallback = proj_mod.baseline_from_projections(stats, cfg["scoring"])
        fb_nonzero = sum(1 for v in fallback.values() if v and v > 0)
        print(f"  {prior} actuals: {len(fallback)} rows, {fb_nonzero} with points")
        if fb_nonzero > nonzero:
            baseline = fallback
            PROJECTION_PROVENANCE.update({
                "source": f"sleeper_stats_{prior}",
                "rows": len(fallback), "nonzero": fb_nonzero,
                "warning": f"No {season_str} projections published yet — this board is "
                           f"built on {prior} actual scoring. Rookies and players whose "
                           "role changed are undervalued; treat the value side as a "
                           "starting point, not a forecast.",
            })

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
        teams_n = int(cfg.get("teams") or 10)
        rounds_n = int(cfg.get("rounds") or 0) or max(
            1, int(cfg.get("roster_size") or 15) - int((cfg.get("keepers") or {}).get("count") or 0))
        ADP_PROVENANCE.update(adp_mod.apply_with_fallback(
            players, table["adp"], teams=teams_n, draft_picks=teams_n * rounds_n))
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

    opportunity = _rekey_opportunity(load_opportunity(cfg, offline), raw)
    return proj_mod.blend(players, baseline, opportunity, cfg)


def _id_crosswalk(sleeper_players: dict) -> dict:
    """GSIS id -> Sleeper id.

    Two sources, in order of reliability:

    1. `nfl_data_py.import_ids()` — a maintained crosswalk built for exactly
       this problem, carrying gsis_id alongside sleeper_id. This is the right
       answer and covers players Sleeper has no gsis_id for.
    2. Sleeper's own `gsis_id` field, as a supplement. On the first real run
       this alone translated 221 of 761 keys, which is why (1) exists.
    """
    out = {}
    try:
        import nfl_data_py as nfl
        ids = nfl.import_ids()
        cols = set(map(str, ids.columns))
        if {"gsis_id", "sleeper_id"} <= cols:
            for g, sid in zip(ids["gsis_id"], ids["sleeper_id"]):
                if g and sid and str(g) != "nan" and str(sid) != "nan":
                    out[str(g).strip()] = str(sid).strip().split(".")[0]
            print(f"  id crosswalk: {len(out)} gsis->sleeper pairs from nfl_data_py")
        else:
            print(f"  ! import_ids() lacks gsis_id/sleeper_id; columns={sorted(cols)[:25]}")
    except Exception as exc:  # noqa: BLE001 — supplement below still applies
        print(f"  ! id crosswalk unavailable ({type(exc).__name__}: {exc})")

    supplement = 0
    for pid, p in sleeper_players.items():
        if not isinstance(p, dict):
            continue
        g = p.get("gsis_id")
        if g and str(g).strip() not in out:
            out[str(g).strip()] = str(pid)
            supplement += 1
    print(f"  id crosswalk: +{supplement} from Sleeper's own gsis_id "
          f"({len(out)} total)")
    return out


def _rekey_opportunity(metrics: dict, sleeper_players: dict) -> dict:
    """Translate nflfastR player ids into Sleeper player ids.

    THE BUG THIS FIXES: nflfastR keys players by GSIS id ("00-0036389"); the
    board keys by Sleeper's own numeric id. The two never overlapped, so the
    opportunity join produced zero matches on every build since it was written
    — and because the failure path was "no opportunity data", every test passed
    and the ±15% adjustment was simply absent. The first real CI run reported
    0% coverage, which is what surfaced it.

    Sleeper's player DB carries `gsis_id`, so the translation is a lookup.
    """
    if not metrics:
        return metrics
    gsis_to_sleeper = _id_crosswalk(sleeper_players)

    out, hit, unmapped = {}, 0, []
    for key, val in metrics.items():
        k = str(key).strip()
        sid = gsis_to_sleeper.get(k)
        if sid:
            out[sid] = val
            hit += 1
        else:
            # Already a Sleeper id (or a player in neither crosswalk); keep it
            # either way so a partially-translated feed still contributes.
            out[k] = val
            unmapped.append(k)
    OPPORTUNITY_PROVENANCE["gsis_translated"] = hit
    OPPORTUNITY_PROVENANCE["gsis_untranslated"] = len(unmapped)
    print(f"  opportunity ids: {hit} translated from GSIS, {len(unmapped)} unmapped")
    if unmapped:
        # Print samples from both sides. Without these, a join failure is a
        # number with no lead to follow.
        print(f"    unmapped sample : {unmapped[:5]}")
        print(f"    crosswalk sample: {list(gsis_to_sleeper.items())[:3]}")
    return out


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


def build_manager_profiles(cfg: dict, offline: bool, force: bool = False) -> dict:
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

    # RUN ONCE, NOT NIGHTLY.
    #
    # These are built from COMPLETED drafts, and a completed draft never
    # changes — so recomputing them every night re-derives an identical answer
    # at the cost of the full pick pull plus the 5MB player DB, every time.
    #
    # But "never again" would be wrong too: this league drafts again on 22
    # August, and that draft is the most informative one there will ever be.
    # So the cheap question — "is there a completed draft I have not seen?" —
    # is asked every run, and the expensive work happens only when the answer
    # is yes, or when --refresh-profiles forces it.
    if not force and PROFILES_PATH.exists():
        try:
            cached = json.loads(PROFILES_PATH.read_text())
            if cached.get("locked"):
                print("  manager profiles are locked — keeping hand-edited file")
                return cached
            have = set(cached.get("draft_ids") or [])
            if have:
                live = set(si.completed_draft_ids(cfg["league_id"]))
                new_drafts = live - have
                if not new_drafts:
                    print(f"  manager profiles: reusing {len(have)} analysed draft(s) — "
                          "no new completed draft on Sleeper")
                    return cached
                print(f"  manager profiles: {len(new_drafts)} new completed draft(s) "
                      f"({', '.join(sorted(new_drafts))}) — rebuilding")
        except (json.JSONDecodeError, OSError) as exc:
            print(f"  ! could not read cached profiles ({exc}); rebuilding")

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


def build(cfg: dict, *, offline: bool = False, force_profiles: bool = False,
          confirmed_status: dict | None = None) -> dict:
    print("Building draft artifact ...")
    # Resolve config_confirmed from its authority before assembling the artifact,
    # so both the league block and provenance carry the same, honestly-sourced
    # value. When a caller (e.g. a test) passes it in, use theirs verbatim.
    if confirmed_status is None:
        confirmed_status = fetch_authoritative_confirmed(cfg)
    players = load_players(cfg, offline)
    if not players:
        raise SystemExit("no players — cannot build a board")

    profiles = build_manager_profiles(cfg, offline, force=force_profiles)
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
            # DERIVED FROM THE DATA, and from the field that actually proves
            # the adjustment reached a projection.
            #
            # THE BUG THIS FIXES: this read `opportunity_z`, which is the input
            # to the adjustment, not evidence of it. A fixture that populates z
            # without ever calling blend() therefore reported
            # `opportunity_applied: True` while `opportunity_adj` was None on
            # every one of 203 players and the provenance flag said DISABLED.
            # Three claims about one thing, two wrong, and the wrong one was the
            # COMPUTED one — which is worse, because computed reads like proof.
            #
            # `opportunity_adj` is set only by projections.blend(), in the same
            # statement that applies the adjustment to the projection. It cannot
            # be non-null unless the adjustment actually happened.
            "opportunity_applied": any(p.get("opportunity_adj") for p in available),
            "opportunity_adj_coverage": round(
                sum(1 for p in available if p.get("opportunity_adj") is not None)
                / max(1, len(available)), 3),
            # AUTHORITATIVE value (from the Blob when reachable), not the file.
            "config_confirmed": bool(confirmed_status.get("value")),
            "profiles_from_drafts": profiles.get("drafts_analysed", 0),
        },
        # Read this before trusting anything above it.
        "provenance": {
            "projections": dict(PROJECTION_PROVENANCE),
            "adp": dict(ADP_PROVENANCE),
            "opportunity_adjustment": OPPORTUNITY_PROVENANCE.get("status", "unknown"),
            "opportunity_detail": {k: v for k, v in OPPORTUNITY_PROVENANCE.items() if k != "status"},
            # Where config_confirmed actually came from — 'blob' (authority) or
            # 'file-cache' (fallback, with a warning). The file is never trusted
            # silently.
            "config_confirmed": dict(confirmed_status),
        },
    }
    _assert_provenance_matches_data(available, artifact)
    _assert_opportunity_coverage(available, artifact)
    _assert_value_side(available, artifact)
    return artifact


def _assert_value_side(players: list, artifact: dict) -> None:
    """Fail if the board has no value on it.

    The first real build produced proj_mean, proj_ceiling, proj_sd, VORP and
    replacement all exactly 0.0 for every player, with real ADP and real
    opportunity metrics alongside. Every test passed. Nothing warned.
    """
    top = sorted(players, key=lambda p: p.get("raw_adp") or 9999)[:100]
    if not top:
        return
    with_value = sum(1 for p in top if (p.get("proj_mean") or 0) > 0)
    cov = with_value / len(top)
    artifact["provenance"]["value_coverage"] = round(cov, 3)
    print(f"  value coverage: {cov:.0%} of the top {len(top)} have a non-zero projection")
    if cov < VALUE_MIN_COVERAGE:
        sample = ", ".join(
            f"{p.get('name')}={p.get('proj_mean')}" for p in top[:5])
        raise RuntimeError(
            f"only {cov:.0%} of the top {len(top)} players carry a projection "
            f"(expected >= {VALUE_MIN_COVERAGE:.0%}). Every VORP, ceiling and VONA on "
            "this board would be zero — the tool would be re-printing ADP and calling "
            "it analysis.\n"
            f"  projection provenance: {json.dumps(PROJECTION_PROVENANCE)}\n"
            f"  top of board: {sample}"
        )


# In a healthy build most of the top of the board should carry a non-zero
# opportunity adjustment. If that collapses, the metrics silently stopped
# matching players and every projection is consensus-only without saying so.
OPPORTUNITY_MIN_COVERAGE = 0.60
OPPORTUNITY_COVERAGE_TOP_N = 200


def _assert_provenance_matches_data(players: list, artifact: dict) -> None:
    """Provenance must agree with the data it describes, or the build stops.

    A label that can disagree with its own data is not a guarantee, it is
    decoration — and the entire loud-degradation design rests on those labels
    being true. The pre-draft checklist reads them. The War Room banners read
    them. If they can drift, all of that is theatre.

    So the claim is recomputed here from the players themselves and compared
    against what the pipeline asserted. Disagreement fails the build rather
    than shipping an artifact whose provenance is fiction.
    """
    prov = artifact["provenance"]
    claimed = str(prov.get("opportunity_adjustment", "unknown"))
    claims_ok = claimed == "ok"
    observed = any(p.get("opportunity_adj") for p in players)

    prov["opportunity_claimed_ok"] = claims_ok
    prov["opportunity_observed_in_data"] = observed

    if claims_ok != observed:
        raise SystemExit(
            "PROVENANCE DISAGREES WITH THE DATA.\n"
            f"  provenance.opportunity_adjustment = {claimed!r} (ok={claims_ok})\n"
            f"  players with a non-null opportunity_adj = {observed}\n"
            "One of them is lying. The adjustment either reached the projections "
            "or it did not, and the artifact must not ship claiming both."
        )


def _assert_opportunity_coverage(players: list, artifact: dict) -> None:
    status = OPPORTUNITY_PROVENANCE.get("status", "unknown")
    if status != "ok":
        # Already declared disabled — that path is honest, let it through.
        print(f"  opportunity adjustment: {status}")
        return
    top = sorted(players, key=lambda p: p.get("raw_adp") or 9999)[:OPPORTUNITY_COVERAGE_TOP_N]
    # `is not None`, not truthiness: a player sitting exactly at the positional
    # mean has opportunity_z == 0.0 and is covered, not missing.
    hit = sum(1 for p in top if p.get("opportunity_z") is not None)
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


def _log_run_time() -> None:
    """State the local time this actually ran.

    GitHub Actions cron is UTC and ignores DST, so a schedule written for 06:00
    Central is an hour off for half the year. Logging both times makes that
    visible instead of assumed.
    """
    import datetime
    utc = datetime.datetime.now(datetime.timezone.utc)
    try:
        central = utc.astimezone(datetime.timezone(datetime.timedelta(hours=-5)))
        print(f"run started {utc:%Y-%m-%d %H:%M} UTC ({central:%H:%M} US/Central-ish)")
    except Exception:  # noqa: BLE001
        print(f"run started {utc:%Y-%m-%d %H:%M} UTC")


def main() -> None:
    _log_run_time()
    ap = argparse.ArgumentParser()
    ap.add_argument("--league-id")
    ap.add_argument("--offline", action="store_true", help="build from cache/fixtures only")
    ap.add_argument("--snapshot", action="store_true",
                    help="record real API responses to tests/fixtures/real/ and diff "
                         "them against the hand-written fixtures, then exit")
    ap.add_argument("--slot", type=int, help="my draft slot (1-indexed)")
    ap.add_argument("--refresh-profiles", action="store_true",
                    help="re-analyse every past draft even if the committed "
                         "profiles already cover them (they are otherwise built "
                         "once, since a completed draft never changes)")
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

    status = fetch_authoritative_confirmed(cfg)
    if status.get("warning"):
        print(f"  ! config_confirmed resolved from {status['source']}: {status['warning']}")
    if not status.get("value"):
        print("  ! league_config has not been confirmed on the review screen — "
              "scoring and roster slots are unverified (Commish -> War Room -> League Setup)")
    artifact = build(cfg, offline=args.offline, force_profiles=args.refresh_profiles,
                     confirmed_status=status)
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(artifact, separators=(",", ":")))
    size_kb = out.stat().st_size / 1024
    print(f"wrote {out} — {len(artifact['players'])} players, {size_kb:.0f} KB")


if __name__ == "__main__":
    main()
