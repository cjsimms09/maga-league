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
# season_stamp lives under backtest/ but is an INGEST-TIME contract, not an
# analysis helper — the board is stamped where each value is attached, which is
# here. There is no package __init__, so the directory joins the path directly.
sys.path.insert(0, str(HERE / "backtest"))

import adp as adp_mod  # noqa: E402
import season_stamp  # noqa: E402
import board_activity  # noqa: E402
import config_schema  # noqa: E402
import keepers as keepers_mod  # noqa: E402
import projections as proj_mod  # noqa: E402
from backtest import lab_scoring_gap  # noqa: E402
import vorp as vorp_mod  # noqa: E402
import managers as managers_mod  # noqa: E402
import keeper_slate as keeper_slate_mod  # noqa: E402
import adp_series as adp_series_mod  # noqa: E402
import proj_series as proj_series_mod  # noqa: E402
import grab_by as grab_by_mod  # noqa: E402

ARTIFACT_VERSION = 2

# Provenance accumulators. Module-level because they are written deep in the
# load path and read at artifact-assembly time; both are reset per build.
# The rule they exist to enforce: degrading gracefully is right, degrading
# invisibly is not. Every fallback writes its reason here, the artifact carries
# it, and the War Room renders it.
ADP_PROVENANCE: dict = {}
OPPORTUNITY_PROVENANCE: dict = {}
PROJECTION_PROVENANCE: dict = {}


def attach_sleeper_column(board: list[dict], baseline: dict) -> int:
    """Stamp the raw Sleeper projection on every row Sleeper actually projected.

    Returns how many rows this call stamped. See the call site in build_bundle
    for the defect this closes (`proj_sleeper` was gated on FantasyPros).

    `baseline` is the PRE-FALLBACK truth: a player absent from it has no Sleeper
    projection, and `proj_baseline` will be carrying projections._rank_fallback's
    ADP decay for him. Stamping that as `proj_sleeper` would put a fabricated
    number under a source's name, so it is refused — absent is not zero and it is
    not a guess either.
    """
    stamped = 0
    for p in board:
        if (p.get("proj_sleeper") is None
                and baseline.get(str(p.get("player_id"))) is not None
                and p.get("proj_baseline") is not None):
            p["proj_sleeper"] = round(float(p["proj_baseline"]), 2)
            stamped += 1
    return stamped

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
PAYOUTS_PATH = HERE / "config" / "payouts.json"
PROFILES_PATH = HERE / "config" / "manager_profiles.json"
# The Lab's enrolled-doctrine verdict (experiment 19b). Read-only to the build.
DOCTRINE_PATH = HERE / "backtest" / "cory-conditional.json"
# Predicted opponent keeper slate — REHEARSAL fidelity input (not draft truth).
PREDICTED_PATH = HERE / "data" / "predicted_keepers.json"
# THE RETAINED ADP SERIES — the append-only dated record that makes ADP
# rate-of-change computable. The board overwrites draft_data.json every night, so
# without this the only series is git history (~2 days). This file is committed by
# the nightly workflow; every un-retained day before the draft is unrecoverable.
ADP_SERIES_PATH = HERE / "data" / "adp_series.json"
# Frozen preseason projection snapshots (Sleeper from the board; FP added by the CI probe).
# The clean grade-input a retroactive fetch can never give (exp33 leak lesson).
PROJ_SERIES_PATH = HERE / "data" / "proj_series.json"

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


IDENTITY_PATH = HERE / "config" / "identity_map.json"
# Whose seat this tool plays. The identity table is the ONE place real name <->
# Sleeper handle <-> owner_id lives (money_history already keys on it), so this
# reads it rather than introducing a second copy.
MY_REAL_NAME = "Cory"


def preserve_local_rulings(existing: dict, fetched: dict) -> dict:
    """Sleeper owns what it RETURNS. Every other committed key is a local ruling.

    THE BUG THIS CLOSES, found 2026-08-17 from the publication gate. The nightly
    always runs `build.py --league-id ...`, and that path rebuilt the config from
    `si.import_league()` and saved it verbatim, carrying over exactly two keys by
    hand: `keepers` and `my_draft_slot`. **Everything else the commissioner or
    Cory had decided was destroyed on every build**, because Sleeper has never
    heard of it.

    What that wiped, the same day Cory ruled on it: `use_measured_ceiling`. His
    words were "We absolutely need to change draft board if we aren't considering
    upside", the flag went on, and the next nightly turned it back off —
    reverting the board to the Gaussian ceiling the ruling had overturned.
    `test_measured_ceiling::test_the_measured_ceiling_is_ON_and_its_sibling_is_not`
    caught it and refused to publish. **The gate was right and the refusal was the
    system working.**

    `my_draft_slot` was already special-cased here, with a comment about a
    hardcoded slot 4 silently undoing a slot change. So this exact class had bitten
    once before and was fixed ONE KEY AT A TIME. That is why this is a rule about
    provenance rather than a third named key: the next local ruling to be added
    would otherwise be wiped in the same silence.

    THE RULE. A key Sleeper supplies is Sleeper's — it wins, because the league's
    structure is not ours to remember. A key only the committed file has is a
    decision made here, and a fetch that does not mention it is not evidence that
    it was revoked. Absence is not a retraction.

    NOTE THE ONE THING THIS GIVES UP, because it is a real trade: if Sleeper stops
    returning a key it used to return, the last committed value now persists
    instead of disappearing. That is the safer direction — a stale league setting
    is visible on the board and in provenance, whereas a silently reverted local
    ruling looks exactly like a board that was never configured.
    """
    out = dict(fetched)
    for key, value in existing.items():
        if key not in out:
            out[key] = value
    return out


def adp_season_stamps(adp_source: str | None, year: int) -> dict:
    """Season stamps for the ADP columns, chosen by WHERE THE VALUE CAME FROM.

    Module-level and named rather than inline in the build loop, so the test suite
    can exercise THE RULE ITSELF. A test that re-implements this branch in its own
    helper passes just as happily when the branch here is wrong, which makes it a
    description of intent rather than a guard on behaviour.

    Two provenances, and a single blanket stamp would have to lie about one:

      real ADP (fantasypros / ffc)
          The season is IN THE REQUEST URL, and `adp.py` derives the cache key
          from that url, so even a cache hit cannot be a different season. The
          year is a fact about the fetch -> `seasonal`.

      search_rank (the fallback branch)
          Sleeper POPULARITY rank. No season anywhere in the payload. Stamping it
          with the target year would be an assertion wearing a measurement's
          clothes -- the exact defect the gate exists to stop -> `current`.

    `current` is deliberately not normalised to `year`: doing so would destroy the
    record of which fields were actually verified, and the gate could never be
    tightened later because nothing would distinguish a proven year from an
    assumed one.
    """
    src = (season_stamp.CURRENT_STATE if adp_source == "search_rank"
           else season_stamp.seasonal(year))
    return season_stamp.stamp({}, {"raw_adp": src, "adp": src,
                                   "consensus_rank": src})


def _my_owner_id() -> str | None:
    """My Sleeper owner_id, for the client's opponent-room model (D6).

    Returns None rather than guessing if the table is missing or shaped
    differently — the client then keeps the whole room and labels it, which is a
    ~1/10 dilution, where a WRONG id would silently delete a real opponent from
    the model and leave me modelling myself as an opponent.
    """
    if not IDENTITY_PATH.exists():
        print("  ! identity_map.json missing — client cannot drop me from the opponent room")
        return None
    try:
        table = json.loads(IDENTITY_PATH.read_text()).get("by_real_name") or {}
    except (json.JSONDecodeError, OSError) as exc:
        print(f"  ! identity_map.json unreadable ({exc}) — opponent room keeps every manager")
        return None
    oid = (table.get(MY_REAL_NAME) or {}).get("owner_id")
    if not oid:
        print(f"  ! no owner_id for {MY_REAL_NAME} in identity_map — opponent room keeps every manager")
        return None
    return str(oid)


def _load_payouts() -> dict | None:
    """The payout table (money function ground truth). Validates the checksum so a
    fat-fingered edit fails loud rather than corrupting every E[$] downstream."""
    if not PAYOUTS_PATH.exists():
        print("  ! payouts.json missing — the money function has no ground truth")
        return None
    p = json.loads(PAYOUTS_PATH.read_text())
    parts = (p.get("weekly_high", {}).get("total", 0)
             + p.get("regular_season", {}).get("total", 0)
             + p.get("playoffs", {}).get("total", 0))
    if parts != p.get("total_pot"):
        raise SystemExit(f"payouts.json checksum failed: parts sum to {parts}, "
                         f"total_pot says {p.get('total_pot')}")
    print(f"  payouts: ${p.get('total_pot')} pot "
          f"(weekly-high ${p.get('weekly_high', {}).get('total')} = "
          f"{round(100 * p.get('weekly_high', {}).get('total', 0) / max(1, p.get('total_pot', 1)))}%)")
    return p


def _load_doctrine() -> dict | None:
    """The ENROLLED DOCTRINE, stamped from the Lab's own verdict file.

    Data spine: one fact, one home, many readers. The enrolled plan is decided
    by experiment 19b (`cory_conditional.py`), lives in `cory-conditional.json`,
    and reaches the War Room banner ONLY through this stamp — the client never
    guesses a doctrine, and no second copy of the verdict exists to drift.

    A missing/unreadable file, or a race in which nothing was enrolled, yields
    None. The banner then runs the control and says nothing was enrolled; an
    un-raced doctrine must never render as a verdict.
    """
    if not DOCTRINE_PATH.exists():
        print("  ! cory-conditional.json missing — no doctrine enrolled (banner runs the control)")
        return None
    try:
        v = json.loads(DOCTRINE_PATH.read_text())
    except (json.JSONDecodeError, OSError) as exc:
        print(f"  ! cory-conditional.json unreadable ({exc}) — no doctrine enrolled")
        return None
    board = v.get("leaderboard") or []
    enrolled = v.get("enrolled")
    winner = next((r for r in board if r.get("archetype") == enrolled), None)
    if not enrolled or not winner:
        print("  doctrine: nothing enrolled (no archetype cleared its gate)")
        return None
    runner = next((r for r in board if r.get("archetype") != enrolled), None)
    out = {
        "enrolled": enrolled,
        "edge": winner.get("mean_edge"),
        "ci95": winner.get("ci95"),
        "runner_up": (runner or {}).get("archetype"),
        "runner_up_edge": (runner or {}).get("mean_edge"),
        "rooms": v.get("rooms"),
        "control": v.get("control"),
        "source": "experiment 19b — paired-room Cory-conditional race (heterogeneous opponents)",
    }
    print(f"  doctrine: {enrolled} enrolled at +${out['edge']} over {v.get('control')}")
    return out


def _load_predicted_keepers() -> dict | None:
    """The PREDICTED opponent keeper slate, for rehearsal-board fidelity.

    In a real draft ~27 opponent keepers are off the board before pick one; in a
    Sleeper mock they are all available, so the value landscape at my picks is
    nothing like draft night. Pre-removing the predicted slate makes a rehearsal
    rehearse the right board.

    THIS IS A PREDICTION, NOT TRUTH. It is stamped under its own key, labelled at
    the point of use, and never merges into `kept_players` (which is my real,
    confirmed slate). A prediction that reads as settled fact is the failure this
    separation prevents.
    """
    if not PREDICTED_PATH.exists():
        print("  ! predicted_keepers.json missing — rehearsal board cannot pre-remove opponents")
        return None
    try:
        v = json.loads(PREDICTED_PATH.read_text())
    except (json.JSONDecodeError, OSError) as exc:
        print(f"  ! predicted_keepers.json unreadable ({exc})")
        return None
    preds = v.get("predictions") or {}
    n = sum(len((x or {}).get("predicted_keepers") or []) for x in preds.values())
    print(f"  predicted keepers: {n} across {len(preds)} owners (rehearsal input)")
    return {"provenance": v.get("provenance"), "note": v.get("note"),
            "predictions": preds}


def _parse_12h(t):
    import re
    m = re.match(r"(\d{1,2}):(\d{2})\s*(AM|PM)", str(t or "").strip(), re.I)
    if not m:
        return (23, 59)                     # unparseable time -> end of day, the late direction
    hh = int(m.group(1)) % 12
    if m.group(3).upper() == "PM":
        hh += 12
    return (hh, int(m.group(2)))


def _keeper_lock_passed(cfg: dict, placements, now=None) -> bool:
    """Has the keeper lock passed? (register 5l — the flag was permanently False)

    TWO INDEPENDENT PATHS, EITHER SUFFICIENT, because the previous version had
    ZERO and read as if it had one:
      * placements exist on the draft — the commissioner has placed keepers,
        which cannot happen before the lock; this is the DERIVED path the
        standing_check docstring believed was already wired.
      * the configured deadline has passed — Cory's ruling, verbatim, in
        league_config.json rather than a literal in this file.
    A hardcoded date alone would be a second definition of the lock. A
    placement-only rule misses a lock that passes with teams unplaced, which is
    exactly the state the standing_check escalation exists to catch. `now` is
    injectable so the test can drive the clock instead of waiting for Friday.
    """
    import datetime as _dt
    if placements:
        return True
    d = ((cfg.get("keepers") or {}).get("deadline") or {})
    if not d.get("date"):
        return False                        # unknown is NOT "passed" — the safe direction
    tz = _dt.timezone(_dt.timedelta(hours=-5))          # CDT
    hh, mm = _parse_12h(d.get("time") or "11:59 PM")
    y, m, dd = (int(x) for x in str(d["date"]).split("-"))
    current = now if now is not None else _dt.datetime.now(tz)
    return current >= _dt.datetime(y, m, dd, hh, mm, tzinfo=tz)


def _assess_keeper_slate(cfg: dict, offline: bool) -> dict:
    """SLATE RAILS (keeper_slate.py): stamp an honest CONFIRMED/PREDICTED status so the
    board can never present a wrong/incomplete slate as truth. Sleeper is the source:
    roster.keepers = DESIGNATIONS (intentions); the upcoming draft's is_keeper picks =
    PLACEMENTS (the confirmed signal). Offline builds are always 'predicted'."""
    teams = int(cfg.get("teams") or 10)
    if offline:
        return keeper_slate_mod.assess_slate(teams, {}, placements=None,
                                             keeper_lock_passed=_keeper_lock_passed(cfg, None))
    try:
        import sleeper_import as si
        lid = cfg["league_id"]
        rosters = si.fetch_rosters(lid) or []
        # designations: a team is present ONLY if it actually carries a keepers list;
        # absent teams are UNKNOWN (empty!=none), never modelled as keeping zero.
        designations = {}
        for r in rosters:
            ks = r.get("keepers") or (r.get("metadata") or {}).get("keepers")
            if ks:
                designations[str(r.get("roster_id"))] = [str(x) for x in ks]
        # placements: the upcoming draft's keeper picks (is_keeper). None until placed.
        placements = None
        drafts = si.fetch_drafts(lid) or []
        upcoming = next((d for d in drafts if d.get("status") in ("pre_draft", "drafting", "paused")), None)
        if upcoming and upcoming.get("draft_id"):
            picks = si.fetch_draft_picks(upcoming["draft_id"]) or []
            kp = {}
            for p in picks:
                if p.get("is_keeper"):
                    kp.setdefault(str(p.get("roster_id")), []).append(str(p.get("player_id")))
            if kp:
                placements = kp
        slate = keeper_slate_mod.assess_slate(teams, designations, placements=placements,
                                              keeper_lock_passed=_keeper_lock_passed(cfg, placements))
        print(f"  keeper slate: {slate['status']} — {slate['teams_designated']}/{teams} designated, "
              f"placements={'yes' if slate['placements_present'] else 'no'}"
              + (f", {len(slate['mismatches'])} MISMATCH" if slate['mismatches'] else ""))
        return slate
    except Exception as exc:                              # noqa: BLE001
        # Loudly: 'could not verify' must never read as 'verified'. Unknown -> not confirmed.
        print(f"  ! keeper-slate verification failed ({type(exc).__name__}: {exc}) — status UNKNOWN")
        s = keeper_slate_mod.assess_slate(teams, {}, placements=None,
                                          keeper_lock_passed=_keeper_lock_passed(cfg, None))
        s["status"] = "unverified"; s["confirmed"] = False; s["safe_to_treat_as_truth"] = False
        s["reason"] = f"could not reach Sleeper to verify the slate ({type(exc).__name__})"
        return s


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

    # THE CORY-RULED PROJECTION-CORRECTNESS RECORD (2026-08-16, "Don't agree
    # with timelines we fix now" — DECISIONS #0 DEF TD vocabulary, #000 FP
    # dropped receptions), stamped BY THE BUILD from what its own scoring path
    # just did — never retyped counts. Run 31948330004's gate refused every
    # fresh board because only the promotion's HAND stamp
    # (provenance.projection_correctness_2026_08_16, committed board) carried
    # the record and build.py never wrote it; fresh boards run the fixed code
    # paths (scoring.normalize_def_stat_line inside baseline_from_projections;
    # adp.recover_fp_dropped_stats inside the FP parse, whose measured diag
    # already lands at provenance.projections.fantasypros.fp_proj_recovered)
    # but carried no provenance of it. This stamp is the native home;
    # test_projection_correctness.py accepts either. The DEF rows are
    # re-derived here from the SAME payload the baseline was scored from, so
    # the record cannot disagree with the board it rides.
    from scoring import (normalize_def_stat_line as _pc_norm,   # noqa: E402
                         score_stat_line as _pc_score)
    _pc_rows = (projections if PROJECTION_PROVENANCE.get("source") == "sleeper_projections"
                else stats)
    _pc_def = []
    for _pc_pid, _pc_line in (_pc_rows or {}).items():
        if str(_pc_pid).isdigit():
            continue        # team defenses only — Sleeper keys DSTs by team code
        _pc_stats = (_pc_line.get("stats")
                     if isinstance(_pc_line, dict) and "stats" in _pc_line else _pc_line)
        if not isinstance(_pc_stats, dict):
            continue
        _pc_old = _pc_score(_pc_stats, cfg["scoring"])
        _pc_new = _pc_score(_pc_norm(_pc_stats), cfg["scoring"])
        if _pc_new != _pc_old:
            _pc_def.append({"team": str(_pc_pid),
                            "old": round(_pc_old, 2), "new": round(_pc_new, 2)})
    PROJECTION_PROVENANCE["projection_correctness"] = {
        "ruling": "Cory 2026-08-16: 'Don't agree with timelines we fix now'",
        "date_fixed": "2026-08-16",
        "def_td_vocabulary": {
            "algorithm": "scoring.normalize_def_stat_line (DEF_PROJ_TD_ALIASES, "
                         "aggregate-wins / components-sum)",
            "def_rows_corrected": sorted(_pc_def, key=lambda r: r["team"]),
        },
        "fp_dropped_stats": {
            "algorithm": "adp.recover_fp_dropped_stats (rec_rec receptions, 2pt_tds)",
            "diag_home": "provenance.projections.fantasypros.fp_proj_recovered",
        },
    }
    if _pc_def:
        print(f"  projection-correctness: DEF TD vocabulary corrected "
              f"{len(_pc_def)} rows (stamped in provenance.projections)")

    # TEAM -> BYE WEEK, derived from the pool itself. Sleeper populates
    # metadata.bye_week on only SOME players per team, but a bye belongs to the
    # TEAM, so one populated player is enough to fix it for the whole roster. Most
    # common value per team wins (a stray bad row cannot outvote the real one).
    # See the "bye" field below for why this is derived here rather than read from
    # src/nfl_byes.json (that file is generated FROM this artifact — circular).
    _bye_votes: dict = {}
    for _p in raw.values():
        _t = _p.get("team")
        _b = (_p.get("metadata") or {}).get("bye_week")
        if not _t or _t == "FA" or _b in (None, "", 0):
            continue
        try:
            _b = int(_b)
        except (TypeError, ValueError):
            continue
        _bye_votes.setdefault(_t, {})
        _bye_votes[_t][_b] = _bye_votes[_t].get(_b, 0) + 1
    team_byes = {t: max(v.items(), key=lambda kv: kv[1])[0] for t, v in _bye_votes.items() if v}
    print(f"  byes: derived for {len(team_byes)} teams from the player pool")
    if len(team_byes) < 32:
        # Loud, not silent: a missing team means every one of its players will
        # render "—" and any bye-collision guard is dormant for them.
        print(f"  ! only {len(team_byes)}/32 teams have a derived bye — "
              f"bye flags will be inert for the rest")

    players = []
    dst_kept = 0
    for pid, p in raw.items():
        pos = (p.get("fantasy_positions") or [p.get("position")])[0] if p.get("fantasy_positions") else p.get("position")
        if pos not in DRAFTABLE:
            continue
        # DST are team ENTITIES (player_id = team abbrev, e.g. "PHI"), not people.
        # Sleeper marks many of them active=False (a team is not an "active
        # player") and/or leaves search_rank null — so the two generic filters
        # below silently dropped EVERY defense. The board then carried a DEF
        # starter slot it could never fill: the legality filter could not be
        # satisfied, the forced-pick endgame could not fire, and the robot's
        # "legal roster from every state" test passed against a pool where the
        # DEF requirement was untestable. Defenses are streamable and roughly
        # interchangeable, so neither an inactive flag nor a missing rank is a
        # reason to exclude a team unit — keep them with a late fallback rank
        # that real DEF ADP/projections refine below. (Fix 2026-08-08; the
        # exclusion carried no citation, so it read as intentional.)
        is_dst = pos == "DEF"
        # ⚠️ THIS TEST IS `is False`, SO A MISSING OR NULL FLAG PASSES IT.
        # Sleeper leaves `active` unset for a great many players it still lists,
        # and there is no rank ceiling below either — which is how Marshawn
        # Lynch, retired since 2019 at search_rank 621, reached the 2026 board.
        # (src/sleeper.js's players() drops rank > 600; this path does not.)
        # The one line that settles whether the flag is usable at all needs
        # egress this session does not have: fetch /players/nfl and print
        # Counter(v.get("active") for v in raw.values()). Until then the
        # projection guard below does not depend on the flag.
        if p.get("active") is False and not is_dst:
            continue
        rank = p.get("search_rank")
        if (rank is None or rank >= 9_999_999):
            if is_dst:
                rank = 400.0   # late fallback; ADP/projection join refines it
            else:
                continue
        if is_dst:
            dst_kept += 1
        players.append({
            "player_id": str(pid),
            "name": p.get("full_name") or f"{p.get('first_name','')} {p.get('last_name','')}".strip() or str(pid),
            "position": pos,
            "team": p.get("team") or "FA",
            # BYE: Sleeper's per-player metadata.bye_week is SPARSELY populated —
            # on the 2026 board it was missing for 16 of 32 defenses, 90 of 107
            # kickers and most of the deep pool, so B's bye flags silently did
            # nothing for those rows and the bye card showed "—" (2026-08-10
            # critique). A bye is a property of the TEAM, not the player, so we
            # DERIVE a team->bye map from the pool itself (all 32 teams have at
            # least one player carrying bye_week) and apply it to that team's whole
            # roster. Deliberately NOT read from src/nfl_byes.json: that file is
            # GENERATED FROM this artifact, so joining it here would be circular
            # and an error could never self-correct. Deriving from the upstream
            # Sleeper pool each build is self-healing. FA has no bye by definition
            # (Daniel Carlson, team FA, correctly stays null).
            "bye": team_byes.get(p.get("team")) or (p.get("metadata") or {}).get("bye_week"),
            "age": p.get("age"),
            "years_exp": p.get("years_exp"),
            "injury_status": p.get("injury_status"),
            "depth_chart_order": p.get("depth_chart_order"),
            "raw_adp": float(rank),
            "consensus_rank": float(rank),
            # Exp 31 (platform anchoring): the platform's OWN ordering, kept
            # verbatim so the delta board can price Sleeper-vs-market divergence.
            "sleeper_rank": float(rank),
        })
    print(f"  {len(players)} draftable players ({dst_kept} DST), {len(baseline)} with consensus projections")
    if dst_kept == 0:
        # Fail loud: a board with a DEF starter slot and zero defenses is broken.
        print("  ! WARNING: no DST ingested — the DEF starter slot cannot be filled")

    # Real ADP replaces search_rank as the market signal. search_rank stays as a
    # *declared* fallback — recorded per player, surfaced in the UI above a
    # threshold — never as a silent one.
    try:
        year_n = int(cfg.get("season") or time.gmtime().tm_year)
        table = adp_mod.build_adp_table(
            raw, fmt=_ffc_format(cfg), teams=int(cfg.get("teams") or 10), year=year_n)
        teams_n = int(cfg.get("teams") or 10)
        # Draft length from the ONE source (config_schema.draft_rounds).
        rounds_n = config_schema.draft_rounds(cfg)

        # PRIMARY ANCHOR = FantasyPros, FFC gap-fill, search_rank last. FP is the
        # source-grade winner (orders realized value best AND is our exact half-PPR
        # format, de-confounding the full-PPR handicap MFL carried); the 2026 probe
        # confirmed 98% top-150 coverage, ρ=0.885 vs FFC. Coverage-gated: a thin or
        # failed FP fetch keeps FFC untouched, so this can NEVER drop the board below
        # its FFC baseline. (DECISIONS-NEEDED #1)
        anchor_table = table["adp"]
        try:
            fp_table, fp_diag = adp_mod.build_fantasypros_table(raw, year=year_n)
            if fp_table:
                anchor_table, merge_stats = adp_mod.merge_primary_over_ffc(table["adp"], fp_table)
                ADP_PROVENANCE["primary_source"] = "fantasypros"
                ADP_PROVENANCE["fantasypros"] = {**fp_diag, **merge_stats}
                print(f"  ADP anchor: FantasyPros PRIMARY — {merge_stats['primary_priced']} "
                      f"priced by FP, {merge_stats['ffc_gap_fill']} gap-filled by FFC")
            else:
                ADP_PROVENANCE["primary_source"] = "ffc"
                ADP_PROVENANCE["fantasypros"] = fp_diag
                print(f"  ADP anchor: FFC (FantasyPros not used — {fp_diag.get('reason')})")
        except Exception as fpx:  # noqa: BLE001 — FP is an upgrade, never a dependency
            ADP_PROVENANCE["primary_source"] = "ffc"
            ADP_PROVENANCE["fantasypros"] = {"error": f"{type(fpx).__name__}: {fpx}"}
            print(f"  ! FantasyPros anchor skipped ({type(fpx).__name__}: {fpx}); FFC stands")

        # `projections=baseline` IS LOAD-BEARING, NOT A CONVENIENCE. The deep-pool
        # ordering inside apply_with_fallback used to read `p["proj_mean"]`, which
        # is not assigned until `projections.blend()` fifty lines BELOW this call
        # — so it was empty on every build and all 348 fallback players got the
        # identical unprojected sentinel. `baseline` is computed at :365 and is
        # the same quantity in the same scoring, available here. Passing it is
        # what makes the ordering actually run.
        #
        # It cannot simply be deferred until after blend(): `raw_adp` is copied
        # from `adp` at :571, still above blend, so an ordering applied later
        # would never reach raw_adp — which is the field the acceptance test
        # reads and the one a stale-ordering bug hides in.
        ADP_PROVENANCE.update(adp_mod.apply_with_fallback(
            players, anchor_table, teams=teams_n, draft_picks=teams_n * rounds_n,
            projections=baseline))
        # apply_with_fallback hardcodes adp_source='ffc' in its provenance; the per-player
        # rows already carry the true source, so correct the top-level label to the real
        # primary now (it drives the War Room's "priced by" banner).
        ADP_PROVENANCE["adp_source"] = ADP_PROVENANCE.get("primary_source", "ffc")
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
    #
    # AND STAMP ITS SEASON HERE, at the point the value is attached, because this
    # is the only place that still knows WHERE IT CAME FROM. Cory, HIGH: a player
    # drafted high in 2025 may go late or undrafted in 2026, so a prior-season ADP
    # reaching this board is a silent, plausible-looking error.
    #
    # THE STAMP IS PER-PLAYER AND NOT A BLANKET seasonal(2026), because the two
    # branches above have genuinely different provenance and a single stamp would
    # have to lie about one of them:
    #
    #   fantasypros / ffc  -> the season is IN THE REQUEST URL (C verified: the
    #       fp_url carries /nfl/2026/consensus-rankings, and adp.py:136 derives the
    #       cache key FROM that url, so even a cache hit cannot be another season).
    #       That is `seasonal` — a fact about the fetch, not an assumption.
    #
    #   search_rank        -> Sleeper POPULARITY rank from the fallback branch. It
    #       is live state with no season anywhere in the payload. Stamping it 2026
    #       would be an assertion wearing a measurement's clothes, which is the
    #       exact defect this gate exists to stop, so it is `current`.
    adp_year = int(cfg.get("season") or time.gmtime().tm_year)
    for p in players:
        p["raw_adp"] = p.get("adp", p["raw_adp"])
        p["consensus_rank"] = p["raw_adp"]
        p.update(adp_season_stamps(p.get("adp_source"), adp_year))

    # ── THE SCORING GAP, MEASURED WHERE THE STAT LINES STILL EXIST ──────────
    #
    # Our league scores pass_td 6 / pass_int -2; the ADP that prices this board
    # comes from a scoring=HALF consensus — 4 and -1. So `proj_mean` knows a
    # quarterback is worth more here and every ADP-anchored quantity does not.
    # That is a candidate mechanism for a deviation we have already measured 18
    # of 18 times, and it had no number attached to it.
    #
    # HERE because the raw payload exists exactly once. A built board carries
    # only already-scored points, so the difference between two scorings is not
    # recoverable downstream — the measurement has to happen while `projections`
    # is still in hand. It fits nothing and changes no price.
    try:
        PROJECTION_PROVENANCE["scoring_gap_vs_adp_market"] = lab_scoring_gap.measure(
            projections, cfg["scoring"], players)
    except Exception as exc:  # noqa: BLE001 — a measurement must never fail a build
        PROJECTION_PROVENANCE["scoring_gap_vs_adp_market"] = {
            "measured": False, "why": f"{type(exc).__name__}: {exc}"}

    opportunity = _rekey_opportunity(load_opportunity(cfg, offline), raw)
    board = proj_mod.blend(players, baseline, opportunity, cfg)

    # ── THE FIELD NAMED AFTER ONE SOURCE WAS GATED ON A SECOND ──────────────
    #
    # `proj_sleeper` used to be stamped ONLY inside the FantasyPros block below,
    # so a player FP missed lost his Sleeper number from every surface that reads
    # the per-source columns. app.js:593 named this trap in prose — "'does this
    # player have a Sleeper projection' cannot be answered by the field called
    # proj_sleeper" — and left it standing. Measured on the shipped board while
    # building the blend study (draft/audit/proj_mean_blend_2026-08-16.md):
    # **77 rows** carried a real Sleeper projection with `proj_sleeper` absent,
    # and it is not a tail problem —
    #
    #   · consensus.js averages whatever per-source fields are present, so those
    #     rows rendered our own model ALONE under the raw-projection label.
    #     Kenneth Walker (ADP 17, a keeper) displayed 171.2 where Sleeper says
    #     225.5 — a 54-point understatement on a second-round player, labelled
    #     "Our model proj" on the war room six days before the draft.
    #   · memberweek.js derives the member-facing WIN ODDS from proj_sleeper and
    #     correctly refuses a starter it thinks Sleeper does not project. It was
    #     refusing on players Sleeper projects fine.
    #
    # Stamped here, from the SAME value the old line used (`proj_baseline`, raw
    # and unmodelled), independent of any other source. The FP block below keeps
    # its own assignment — it is now a no-op on these rows, and leaving it means
    # this fix cannot be undone by an edit to FP's branch.
    #
    # ONLY WHERE SLEEPER ACTUALLY PROJECTED HIM. `proj_baseline` falls back to
    # projections._rank_fallback (an ADP decay) when Sleeper has no number, and
    # stamping THAT as `proj_sleeper` would replace a missing value with a
    # fabricated one wearing a source's name — absent is not zero, and it is not
    # a guess either. `baseline` is the pre-fallback truth and is still in scope
    # here, which is why the stamp belongs at this line and not inside blend().
    _sleeper_stamped = attach_sleeper_column(board, baseline)
    PROJECTION_PROVENANCE["sleeper_column_attached"] = _sleeper_stamped
    print(f"  projections: Sleeper raw column on {_sleeper_stamped} players")

    # SECOND PROJECTION SOURCE (C3 real consensus). The projection column is a check
    # on our OWN machinery, and a single-source check can be wrong in the same
    # direction the machinery is wrong — two sources DISAGREEING is most of the point
    # of the feature (Cory, 2026-08-10). So attach FantasyPros projections, scored
    # under OUR scoring, alongside the raw Sleeper baseline. When FP lands, each
    # player carries BOTH raw sources (proj_sleeper + proj_fantasypros) and the client
    # shows a true consensus; when it doesn't, nothing is attached and the client
    # stays honestly single-source (proj_mean labelled 'Sleeper proj').
    #
    # Coverage-gated and never a build dependency (FP is an upgrade). Egress — CI
    # only; this IS the empirical probe of 'does FP serve projections', recording
    # coverage as evidence rather than assuming from our once-empty archive.
    try:
        fp_proj, fpp_diag = adp_mod.build_fantasypros_projections(
            raw, year=year_n, scoring=cfg["scoring"])
        PROJECTION_PROVENANCE["fantasypros"] = fpp_diag
        if fp_proj:
            attached = 0
            for p in board:
                v = fp_proj.get(str(p.get("player_id")))
                if v is not None and p.get("proj_baseline") is not None:
                    p["proj_sleeper"] = round(float(p["proj_baseline"]), 2)  # raw, unmodelled
                    p["proj_fantasypros"] = v
                    attached += 1
            PROJECTION_PROVENANCE["fantasypros_attached"] = attached
            PROJECTION_PROVENANCE["consensus_sources"] = 2 if attached else 1
            print(f"  projections: FantasyPros 2nd source on {attached} players — CONSENSUS live")
        else:
            PROJECTION_PROVENANCE["consensus_sources"] = 1
            print(f"  projections: single-source Sleeper (FP not used — {fpp_diag.get('reason')})")
    except Exception as fppx:  # noqa: BLE001 — FP is an upgrade, never a dependency
        PROJECTION_PROVENANCE["fantasypros"] = {"error": f"{type(fppx).__name__}: {fppx}"}
        PROJECTION_PROVENANCE["consensus_sources"] = 1
        print(f"  ! FantasyPros projections skipped ({type(fppx).__name__}); single-source Sleeper")

    # THIRD PROJECTION SOURCE — OUR OWN MODEL — is attached AFTER the activity
    # prune below, not here beside the other two sources. See the block after
    # the prune for why (population reproducibility — runs 31949909332 and
    # 31950441042, 2026-08-16).

    # ── PLAYERS WHO HAVE NOT PLAYED A DOWN IN TWO YEARS ─────────────────────
    #
    # Tom Brady, Drew Brees, Gronkowski, Edelman, Antonio Brown, Fitzgerald,
    # Todd Gurley and Marshawn Lynch were all on the 2026 board. `load_players`
    # gates on `p.get("active") is False`, and Sleeper leaves `active` UNSET for
    # much of what it lists — `None is False` is False, so a null sails through.
    # The only other gate is `search_rank`, which Sleeper never retires; Brady's
    # is 74, so no rank ceiling would have caught him either.
    #
    # HERE, NOT IN `load_players`, because this is the first point where both a
    # market ADP and a projection exist — and those are the two exemptions that
    # stop this deleting somebody real. Run it earlier and 7 rows FFC actually
    # prices go with it.
    #
    # The evidence is `nflverse_weekly_points_*.json`: did this player score in a
    # real NFL game in 2024 or 2025. That is a MEASUREMENT, where `active` is
    # metadata that can be left unset. `board_activity` owns the conditions and
    # every exemption, and is IMPORTED rather than reimplemented so there is one
    # definition of dormant instead of two that drift.
    #
    # It REFUSES rather than pruning when the stores cannot be read: an absence
    # of evidence must never read as evidence of absence, and a build that
    # quietly dropped half the board because an artifact moved would be far worse
    # than one carrying eight retired players.
    #
    # ── HELD 08-13, RESTORED 08-14, AND WHAT CHANGED IS EVIDENCE ────────────
    #
    # C wrote this, then held it: the blast radius had been verified on
    # DECISIONS but not on DEPENDENTS, and simulating it turned five tests red.
    # That was the right call and the reason it is un-held is that every one of
    # those reds is now measured away rather than argued away — on a real 683-row
    # pruned board the python suite runs 1,848 passed / 0 failed, and the last
    # blocker was a LIVE DEFECT (waiver_replacement priced the 2023-25 wire
    # through the 2026 board, moving TE 6.30 -> 3.20 under the prune) fixed at
    # the root by `player_positions.json`.
    #
    # I re-verified the JS half, which did not exist when C simulated it: on the
    # pruned board every one of Cory's twelve picks still scores 536+ candidates
    # and renders 3 strategy directions (2 at his last), and the board-size
    # assertions hold — 616 byes and 683 names, both against floors of 500.
    #
    # AND IT DOES SOMETHING NOBODY MEASURED, WHICH IS WHY IT IS WORTH LANDING
    # BEFORE THE DRAFT RATHER THAN AFTER. Cory: *"The search for player tool is
    # not working and not convenient."* 165 of the dropped rows share a SURNAME
    # with a top-150 player, so on the clock "jones" returns 24 hits and
    # "williams" 26, with Dalvin Cook, Jared Cook, Rohan Jones and Tanner Brown
    # sitting among the men he can actually take. It also removes the board's
    # only same-name/same-position collision (Frank Gore Sr and Jr) and both
    # duplicate names — the "listed twice" hazard, at the root.
    # ZERO draftable rows are lost at any position (`adp <= 225`).
    #
    # The guarantee test stays either way and that is deliberate: the prune can
    # be reverted, skipped by its own exception guard, or refused because the
    # stores moved, and in each of those cases the dormant rows are back.
    # `test_board_activity` asserts no dormant row reaches a rank, a VORP or the
    # relevant board — a property that must hold whether or not this ran.
    # Snapshot the PRE-prune board for the position record below. The record's
    # own contract says "written from the board BEFORE any filter", but as
    # first coded it iterated `board` AFTER the prune reassigned it — so a
    # player seen for the FIRST time on a board that also prunes him would
    # never enter the union, exactly the row the wire measurement needs.
    # (2026-08-15 data audit; test_data_assumptions.py pins the contract.)
    _pre_prune_board = list(board)
    try:
        _act = board_activity.dormant({"players": board})
        if _act["status"] == "measured" and _act["n"]:
            _drop = {str(p.get("player_id")) for p in _act["rows"]}
            before = len(board)
            board = [p for p in board if str(p.get("player_id")) not in _drop]
            print(f"  inactive: dropped {before - len(board)} player(s) with no "
                  f"scored week in {_act['seasons_read']} — not rookies, not "
                  f"market-priced, not projected ({len(board)} remain)")
        elif _act["status"] != "measured":
            print(f"  ! inactive filter NOT APPLIED — {_act['note']}")
    except Exception as _ax:  # noqa: BLE001 — a hygiene filter is never a build dependency
        print(f"  ! inactive filter skipped ({type(_ax).__name__}: {_ax}); "
              f"the board keeps every row it had")

    # THIRD PROJECTION SOURCE — OUR OWN MODEL, own_v6 since 2026-08-16 (Cory:
    # "YES on V6", upgrading his same-day v4 acceptance; v6 = v4's QB arm +
    # v5's component arms, cleared the REC-3 bar at all four positions: beat
    # both naive baselines, both metrics, held-out 2025). Same
    # additive pattern as FantasyPros above: attach alongside, never a build
    # dependency, never touches proj_mean/proj_baseline/VORP/ranking — the
    # promotion swapped the ALGORITHM behind the labeled third-opinion column,
    # not its role; entering proj_mean's composition stays blocked on the
    # January 2027 Sleeper grade (REC-2). The v6 path reads committed stores
    # (zero egress, unlike v1's live fetches). Coverage: QB/RB/WR/TE with
    # prior-season NFL production; rookies and K/DEF carry no proj_ownmodel —
    # same "absent, not zero" discipline as proj_feed.js.
    #
    # AFTER THE ACTIVITY PRUNE, DELIBERATELY (2026-08-16, runs 31949909332 and
    # 31950441042): computed before the prune, the model's population was the
    # FULL draftable pool (1,863 rows), whose ~90 later-pruned 2024/25
    # producers entered the v2 OLS fit and v5's league-efficiency/availability
    # means — so every published value depended on rows the published board no
    # longer carries, and NO recompute from the artifact could reproduce the
    # column (the gate's soundness test measured 352 mismatching rows against
    # both honest artifact populations; reproduced offline at 351 by
    # simulating the pre-prune pool). Here the population is exactly the rows
    # the board publishes — players + kept_players, the keeper split being
    # below — so the column is auditable from the artifact alone, which is
    # also the population class the promotion's accepted hand-attach used.
    # The prune never reads proj_ownmodel (dormant() judges market/projection/
    # rookie/keeper), so ordering it first changes nothing the prune sees; and
    # if the prune ever refuses and the full board ships, this population IS
    # that board, so the reproducibility contract holds on that arm too.
    try:
        from own_projections import compute_own_projections, attach_own_model
        own_proj, own_diag = compute_own_projections(board, cfg, season=year_n)
        PROJECTION_PROVENANCE["own_model"] = own_diag
        attached_own = attach_own_model(board, own_proj)
        PROJECTION_PROVENANCE["own_model_attached"] = attached_own
        # The ALGORITHM NAME comes from the diag (own_projections.py stamps
        # provenance["algorithm"]), never typed here: this line said "(own_v6)"
        # verbatim, which is one promotion away from lying in the build log —
        # the same class as the FFC footer credit (2026-08-10). Surfaces that
        # name the algorithm read provenance; so does the log.
        print(f"  projections: own model ({own_diag.get('algorithm', '?')}) "
              f"3rd source on {attached_own} players")
    except Exception as ownx:  # noqa: BLE001 — own model is an upgrade, never a dependency
        PROJECTION_PROVENANCE["own_model"] = {"error": f"{type(ownx).__name__}: {ownx}"}
        print(f"  ! own-model projections skipped ({type(ownx).__name__}: {ownx})")

    # ── ROOKIE CAPITAL PRIOR — Cory's take-a-swing ruling, 2026-08-17 ──────
    # The own-model column above is walk-forward and carries NO rookie (0 of
    # 153). The preregistered Prior(pos, capital-bucket) CLEARED its 25% bar
    # on the 3-season all-seats replay (+25.1 pooled optimal = 38% of the
    # Cory gap, realistic-arm league position 2/10 -> 4/10 —
    # league_benchmark_2026-08-16.md §4), and sat gated on Cory's recorded
    # approval. He gave it, verbatim in league_config's rookie_capital_prior
    # key (preserved across rebuilds by preserve_local_rulings), so the fill
    # runs IN THE BUILD — the one-shot applier's patch died at every nightly
    # rebuild, which is exactly the erasure class preserve_local_rulings
    # exists for, applied one level down. Same additive discipline as the
    # own-model attach: proj_mean/VORP/ranks untouched; only null
    # proj_ownmodel on years_exp==0 skill players gains a value.
    _rcp = (cfg.get("rookie_capital_prior") or {})
    if _rcp.get("enabled"):
        try:
            sys.path.insert(0, str(HERE / "tools"))
            from apply_rookie_prior_own_model_2026 import fill_players
            # `board` HERE is the players LIST (load_players scope), not the
            # artifact dict — board["players"] threw TypeError on the first CI
            # build, the by-design except swallowed it into a skip line, and
            # the ruled layer silently vanished from the candidate (refused by
            # the gate's vanished-stamp assertion, run 32079172201 — the gate
            # caught in CI what this comment now prevents at the source).
            _n = fill_players(board)
            PROJECTION_PROVENANCE["rookie_capital_prior"] = {
                "applied": _n, "ruled": _rcp.get("ruled"),
                "cory_approval_verbatim": _rcp.get("cory_approval_verbatim")}
            print(f"  projections: rookie capital prior filled {_n} rookies "
                  f"(Cory's ruling {_rcp.get('ruled')})")
        except Exception as rpx:  # noqa: BLE001 — an upgrade, never a dependency
            PROJECTION_PROVENANCE["rookie_capital_prior"] = {
                "error": f"{type(rpx).__name__}: {rpx}"}
            print(f"  ! rookie capital prior skipped ({type(rpx).__name__}: {rpx})")

    # ── NFL DRAFT CAPITAL — AN INFORMATIONAL COLUMN, NOT A PROJECTION ──────
    #
    # Cory 2026-08-17: "I'd want to give these players a boost due to upside
    # potential especially in dead rounds." This is STEP 0 of that and only
    # step 0 — nothing can key on "first-round rookie WR" until a board row
    # carries the NFL round. It changes no projection, no ranking and no
    # weight; draft/tests/test_draft_capital.py proves the attach is additive
    # rather than trusting this comment.
    #
    # WHY IT IS NOT A BOOST YET. The evidence
    # (draft/audit/rookie_wr_capital_2026-08-17.md, EXPLORATORY) is that rd1
    # rookie WRs are the only tier NOT MEASURABLY WORSE than streaming the
    # spot — +7.4 vs the wire on n=15, interval [-19.7, +34.3], which spans
    # zero. The decisive rows are rd3 (0 of 17 reached 150 pts) and rd4-7
    # (-99.4, 1 of 55, and that one is Puka Nacua). What that licenses today is
    # a WARNING about the bottom tiers, not a boost for the top one, and the
    # boost itself is gated on the harness arm that graded the other ten
    # strategy ideas.
    #
    # Wrapped like the own-model attach above: an upgrade, never a dependency.
    try:
        from draft_capital import attach_capital, load_capital
        cap_diag = attach_capital(board, load_capital(), season=year_n)
        PROJECTION_PROVENANCE["draft_capital"] = cap_diag
        _unm = cap_diag["unmatched_this_class"]
        print(f"  draft capital: attached to {cap_diag['attached']} players "
              f"({cap_diag['matched_by_id']} by id, "
              f"{cap_diag['matched_by_name']} by name)")
        if _unm:
            # PRINTED, NOT COUNTED. A rookie missing from this column reads to
            # every consumer as "not a rookie", so the names have to be visible
            # in the build log where a human will see them.
            print(f"  ! {len(_unm)} of this year's class did not join the "
                  f"board by name: {', '.join(_unm)}")
    except Exception as capx:  # noqa: BLE001
        PROJECTION_PROVENANCE["draft_capital"] = {"error": f"{type(capx).__name__}: {capx}"}
        print(f"  ! draft-capital column skipped ({type(capx).__name__}: {capx})")

    # ── LATE-SEASON TRAJECTORY (F7) — THE ONE MEASURED 50/50 TIE-BREAKER ───
    #
    # edge_hunt_2026-08-16 §3: of nine pick-time-knowable features graded over
    # 259 historical near-ties, eight predicted NOTHING; the hotter-prior-
    # season-finish side won 58.0% of 176 (Wilson 95% CI [.506, .650]; p=.035,
    # Bonferroni x9=.31 — a lean, not a law). A ruled 2026-08-17: APPLY the
    # prepared diff — trajectory fact FIRST in verdict.js tiebreakFacts (that
    # half is PREPARED at draft/patches/tiebreak_facts_bake.patch; a sibling
    # worktree owns app.js/verdict.js today) plus this board field, its data
    # plumbing. Informational column, same contract as draft capital above:
    # no projection, ranking or weight reads it, absence stays absence, and
    # test_late_trajectory.py proves the attach is additive.
    try:
        from late_trajectory import attach_late_trajectory, compute_late_trajectory
        lt_diag = attach_late_trajectory(board, compute_late_trajectory(year_n))
        PROJECTION_PROVENANCE["late_trajectory"] = lt_diag
        print(f"  late trajectory: attached to {lt_diag['attached']} players "
              f"(F7 from the {year_n - 1} component store)")
    except Exception as ltx:  # noqa: BLE001 — an upgrade, never a dependency
        PROJECTION_PROVENANCE["late_trajectory"] = {"error": f"{type(ltx).__name__}: {ltx}"}
        print(f"  ! late-trajectory column skipped ({type(ltx).__name__}: {ltx})")

    # ── SAY WHAT proj_mean IS, AND SAY IT SEPARATELY FROM WHAT WE DISPLAY ───
    #
    # `consensus_sources` was set to 2 inside the FantasyPros branch and never
    # revisited when the own model became a third column, so the provenance has
    # been asserting 2 while three sources attach. Nothing reads the field, so
    # this was never a live defect — but it is a durable record stating
    # something untrue about the board's own projections, and the name is the
    # reason: "consensus sources" reads equally as "sources inside proj_mean"
    # and "sources in the displayed consensus", which are DIFFERENT NUMBERS
    # (1 and up to 3). A field that answers two questions answers neither.
    #
    # So both are now stated explicitly and neither is inferable from the other:
    #
    #   proj_mean_composition        what the board RANKS ON. Single-source
    #                                Sleeper. Entering a blend here stays gated
    #                                on the January 2027 Sleeper grade (REC-2).
    #                                Cory OVERRODE that gate on 2026-08-16 for a
    #                                blend rather than a swap ("A blended
    #                                proj_mean is a smaller, safer change than a
    #                                swap ... Let's do it"); the study he ordered
    #                                RAN and REFUSED — the control arm does not
    #                                exist, so "does it make the board worse" is
    #                                unanswerable, and all five coverage policies
    #                                failed the preregistered rookie-bloc veto.
    #                                Full verdict:
    #                                draft/audit/proj_mean_blend_2026-08-16.md.
    #   display_consensus_sources    how many raw columns consensus.js can
    #                                average. PER POSITION, because it is not
    #                                uniform and the uniform number is the lie:
    #                                K and DEF are Sleeper-only BY NECESSITY —
    #                                FantasyPros' feed does not cover them and
    #                                the own model never has — and NO ROOKIE at
    #                                any position carries three.
    _cov: dict = {}
    for _p in board:
        _pos = _p.get("position") or "?"
        _c = _cov.setdefault(_pos, {"n": 0, "sleeper": 0, "fantasypros": 0, "own": 0})
        _c["n"] += 1
        _c["sleeper"] += int(_p.get("proj_sleeper") is not None)
        _c["fantasypros"] += int(_p.get("proj_fantasypros") is not None)
        _c["own"] += int(_p.get("proj_ownmodel") is not None)
    PROJECTION_PROVENANCE["proj_mean_composition"] = {
        "sources": ["sleeper"],
        "formula": "sleeper_baseline * (1 + opportunity_adj)",
        "blended": False,
        "gate": "REC-2 (January 2027 Sleeper grade)",
        "override_ruled": "Cory 2026-08-16 — for a BLEND, not a swap",
        "override_outcome": "REFUSED — draft/audit/proj_mean_blend_2026-08-16.md",
    }
    PROJECTION_PROVENANCE["display_consensus_sources"] = {
        "note": ("count of RAW per-source columns available to consensus.js — a "
                 "display sanity check beside the valuation, never an input to "
                 "proj_mean. Partial and uneven by position; K/DEF are "
                 "Sleeper-only by necessity."),
        "by_position": _cov,
    }
    # Corrected in place rather than removed: no consumer reads it, and a field
    # that silently disappears is harder to notice than one that starts telling
    # the truth. It counts DISPLAY columns, which is the reading the FP branch
    # meant when it wrote 2.
    PROJECTION_PROVENANCE["consensus_sources"] = max(
        [1] + [1 + int(c["fantasypros"] > 0) + int(c["own"] > 0) for c in _cov.values()])

    # ── THE POSITION RECORD IS **NOT** HELD, AND THAT IS DELIBERATE ─────────
    #
    # The prune above is off the build path. This stays on it, because it is not
    # part of the prune — it is what makes the prune SAFE TO TURN BACK ON, and it
    # has to have been running BEFORE that day to be any use.
    #
    # When the filter ran once (CI 31750835657) it silently shrank a measurement
    # about 2023: `wire_level.js` sourced its positions from the LIVE board, so a
    # man added off the wire in 2023 who has since retired fell out of a sample
    # ABOUT 2023. Scored acquisitions 422 -> 417; the RB wire 7.80 -> 7.95, in the
    # flattering direction, because a waiver add who washes out of the league is
    # exactly the one who scored badly. Nothing would have gone red — a shrinking
    # denominator reads as a smaller league rather than as a bug.
    #
    # Written from the board BEFORE any filter and MERGED rather than
    # overwritten: a historical record may only grow. A position CORRECTION still
    # reaches the measurement, because the reader overlays the live board on top.
    try:
        _pp = HERE / "data" / "player_positions.json"
        _prev = json.loads(_pp.read_text())if _pp.exists() else {}
        _pos = dict(_prev.get("positions") or {})
        _added = 0
        for _p in _pre_prune_board:
            _q = _p.get("position")
            if _q and str(_p.get("player_id")) not in _pos:
                _pos[str(_p["player_id"])] = _q
                _added += 1
        _prev["_territory"] = _prev.get("_territory", "A")
        _prev["_note"] = _prev.get("_note") or (
            "HISTORICAL POSITIONS — id -> position, UNION OVER BUILDS, never "
            "pruned. Written from the board BEFORE the activity filter, because "
            "the realized-wire measurement is about 2023-2025 and must not shrink "
            "when the 2026 board is cleaned.")
        _prev["positions"] = dict(sorted(
            _pos.items(), key=lambda kv: int(kv[0]) if kv[0].isdigit() else 0))
        _pp.write_text(json.dumps(_prev, indent=1))
        print(f"  position history: {len(_pos)} ids on file (+{_added} new) — "
              f"written BEFORE the activity filter so the wire sample cannot shrink")
    except Exception as _px:  # noqa: BLE001 — never a build dependency
        print(f"  ! position history NOT updated ({type(_px).__name__}: {_px}); "
              f"wire_level will fall back to the live board and its sample may shrink")
    return board


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
        OPPORTUNITY_PROVENANCE["pbp_seasons_requested"] = list(seasons)
        try:
            OPPORTUNITY_PROVENANCE["pbp_columns"] = sorted(map(str, pbp.columns))[:200]
            OPPORTUNITY_PROVENANCE["pbp_rows"] = int(len(pbp))
            print(f"  pbp: {len(pbp)} rows, {len(pbp.columns)} columns")
        except Exception:  # noqa: BLE001 — diagnostics must never break the build
            pass
        # ── WHICH SEASONS CAME BACK, READ FROM THE FRAME ─────────────────────
        #
        # `seasons` above is what we ASKED FOR. Six fields on every board row —
        # target_share, wopr, opportunity_share/_z/_adj, games_expected — are
        # priors built from whatever actually arrived, and they print beside
        # injury_status as if they were current numbers. Until now the artifact
        # recorded only `pbp_rows`, so which seasons produced them was an
        # inference from a row count.
        #
        # THAT INFERENCE WAS DOABLE AND C DID IT — 2024 (49492) + 2025 (48771) =
        # 98263, matching the board exactly (draft/backtest/nflverse_pbp_census.json).
        # But the nearest competing pair, 2022+2025, is only 58 rows away, so an
        # upstream revision that size would make the count identify the WRONG
        # pair rather than fail to match. And it is not hypothetical that a
        # season can go missing: `import_weekly_data` 404s for 2025 in this
        # environment, so a neighbouring nfl_data_py call has demonstrably
        # returned less than it was asked for.
        #
        # So it is READ, not inferred, and the source of the reading is declared
        # — a field that is silently absent reads exactly like one that agrees.
        try:
            if "season" in pbp.columns:
                by_season = pbp["season"].value_counts().to_dict()
                src = "frame.season"
            else:  # nflfastR game_id is "<season>_<week>_<away>_<home>"
                by_season = pbp["game_id"].astype(str).str.slice(0, 4).value_counts().to_dict()
                src = "frame.game_id-prefix"
            rows_by_season = {int(k): int(v) for k, v in by_season.items()}
            observed = sorted(rows_by_season)
            OPPORTUNITY_PROVENANCE["pbp_seasons_observed"] = observed
            OPPORTUNITY_PROVENANCE["pbp_rows_by_season"] = dict(sorted(rows_by_season.items()))
            OPPORTUNITY_PROVENANCE["pbp_seasons_source"] = src
            if observed != sorted(seasons):
                # NOT fatal — a build with one season of priors is still better
                # than none — but it must never be silent, because the six
                # fields keep printing with the same confidence either way.
                OPPORTUNITY_PROVENANCE["pbp_seasons_mismatch"] = True
                print(f"  ! pbp: asked for {sorted(seasons)}, RECEIVED {observed} "
                      f"— opportunity priors rest on the received set")
            else:
                OPPORTUNITY_PROVENANCE["pbp_seasons_mismatch"] = False
                print(f"  pbp seasons: {observed} (rows {rows_by_season})")
        except Exception as exc:  # noqa: BLE001 — diagnostics never break the build
            # Absence would read as agreement. Say why instead.
            OPPORTUNITY_PROVENANCE["pbp_seasons_source"] = (
                f"unreadable — {type(exc).__name__}: {exc}")
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


def _keeper_map_for_board(full_map: dict, slate: dict, cfg: dict):
    """UNTIL THE SLATE CONFIRMS, THE LIVE BOARD CARRIES MY KEEPERS AND NOBODY ELSE'S.

    Cory's ruling, 2026-08-11, and the reasoning is the silence rule's: a slate
    rendered indistinguishably from a confirmed one IS a confirmed one as far as
    behaviour is concerned. He gave it for PREDICTIONS. It applies with equal
    force to a PARTIAL SET OF REAL DESIGNATIONS, and that is the case this gate
    exists for — because that case looks more legitimate, not less.

    THE ASYMMETRY, in his words and applied one step further. A board sitting on
    34 and 147 is known-provisional: he checks two numbers and knows where he is.
    A board sitting on 31 because four of ten owners have declared is
    authoritative-looking, wrong, and — the fatal part — IT ALREADY MOVED ONCE.
    Movement is then the expected behaviour, so the move that matters, when the
    real slate lands, carries no signal at all.

    So partial designations are WITHHELD from the live board and the count is
    stamped. The moment `keeper_slate.status == 'confirmed'` the whole map is
    applied — that is the switch, and it is one comparison rather than a judgment
    anyone has to remember to make.

    WITHHELD IS NOT DISCARDED. gen_keepers_json.py still places every designation
    it can, keepers.json still holds them all, and the number held back travels
    into the artifact. Absent-is-not-zero applies to the gate as much as to the
    generator: the board must be able to say "I am ignoring six keepers on
    purpose", never just be six players light.
    """
    my_slot = cfg.get("my_draft_slot")
    if (slate or {}).get("status") == "confirmed":
        return full_map, {"withheld": False, "teams": 0, "keepers": 0,
                          "reason": "slate confirmed — every designation applied"}
    mine = {}
    for k in (my_slot, str(my_slot)):
        if k in full_map:
            mine = {my_slot: full_map[k]}
            break
    held_teams = [s for s in full_map if str(s) != str(my_slot)]
    held_keepers = sum(len(full_map[s]) for s in held_teams)
    if held_keepers:
        print(f"  WITHHELD from the live board: {len(held_teams)} team(s), "
              f"{held_keepers} keeper(s) — slate is "
              f"'{(slate or {}).get('status')}', not confirmed. The board stays on "
              f"my own keepers so its pick numbers remain known-provisional.")
    return mine, {
        "withheld": bool(held_keepers), "teams": len(held_teams), "keepers": held_keepers,
        "reason": "designations exist but the slate is not confirmed; applying a "
                  "partial slate would make the board look authoritative and move "
                  "once BEFORE the move that matters",
    }


def _keeper_slate_reconciled(slate: dict, keeper_map: dict, order, cfg: dict,
                             withheld: dict | None = None,
                             full_map: dict | None = None) -> dict:
    """Say, in the artifact, how many designations actually reached the board.

    THE GAP THIS CLOSES. The slate stamp reads DESIGNATIONS straight from Sleeper;
    the pick order and the pool are built from `config/keepers.json`, which needs a
    DRAFT SLOT per owner and only has mine. `gen_keepers_json.py` drops every
    designation it cannot place. So the two numbers disagree — 4 teams designated,
    1 team in the pick order — and nothing compared them. The board looked entirely
    normal while being built on a third of the slate it knew about.

    That is the seat bug's shape: a filter over a real board always returns
    something plausible. The answer is the same one that worked there — DERIVE the
    disagreement and stamp it, rather than trusting that anyone re-reads two files.

    THE ARITHMETIC IS ALSO STAMPED, because it is the one thing a human can check
    at a glance. Every keeper costs a round in 1..3 under top_picks_flat, so with a
    full 3-keeper slate of my own my first pick sits in round 4 and EVERY keeper in
    the league is ahead of it:

        my_first_pick == N*teams + (my_slot if N+1 odd else teams+1-my_slot)
        board_picks   == teams * rounds        (keepers change NOTHING)
        live_picks    == teams * rounds - total_keepers

    where N is MY OWN keeper count. NOTHING ANOTHER TEAM KEEPS MOVES MY NUMBERS.

    THIS CARRIED `- total_keepers` ON BOTH LINES UNTIL 2026-08-13 and it was the
    compressed model: it required a forfeited pick to be DELETED and everything
    after it renumbered. Sleeper occupies the pick instead — 150 picks and round
    4 beginning at overall 31 in 2023 (0 keepers), 2024 (23) and 2025 (20) alike,
    from this league's own draft log.

    Cory caught it from the seat arithmetic: slot 8, round 4 is EVEN so the snake
    reverses, slot 10 picks first, and he is THIRD — 33, not 30.

    The old identity also carried a CONDITION ("holds only while I keep 3"),
    which was itself an artefact of renumbering: at 2 keepers the first pick
    landed in round 3 where other teams' keepers fell after me and the
    distribution mattered. Nothing renumbers now, so the identity generalises and
    the condition is gone.
    """
    out = dict(slate)
    total_keepers = sum(len(v) for v in keeper_map.values())
    teams_in_order = len([s for s, v in keeper_map.items() if v])
    designated = int(slate.get("teams_designated") or 0)

    out["teams_in_pick_order"] = teams_in_order
    out["keepers_in_pick_order"] = total_keepers

    # DESIGNATIONS THE GENERATOR FAILED TO PLACE — measured against the FULL map,
    # never against the post-gate one.
    #
    # THIS WAS WRONG FOR ONE COMMIT AND THE LIVE BOARD SHOWED IT. The subtraction
    # used `teams_in_order`, which is the map AFTER the confirmation gate strips
    # opponents out. So the moment the gate landed, this field stopped meaning
    # "the generator dropped them" and started meaning "the gate held them back"
    # — and the checklist duly reported BOTH "8 keepers WITHHELD on purpose" and
    # "3 DESIGNATIONS NOT APPLIED" for the same three teams, with a fix line
    # accusing a generator that had done its job perfectly.
    #
    # That is the precise failure the withheld/dropped split exists to prevent,
    # reintroduced one layer down by the change that added the split. A field's
    # MEANING can break while its type, its name and its tests all still pass.
    placed = len([s for s, v in (full_map if full_map is not None else keeper_map).items() if v])
    out["designations_not_applied"] = max(0, designated - placed)
    out["board_built_on_full_slate"] = (
        designated > 0 and out["designations_not_applied"] == 0)
    # WITHHELD ON PURPOSE vs MISSING BY ACCIDENT — two different states that both
    # produce a short board, and the checklist must not read them alike.
    out["withheld_from_board"] = withheld or {"withheld": False, "teams": 0, "keepers": 0}

    my_slot = cfg.get("my_draft_slot")
    teams = int(cfg.get("teams") or 10)
    mine = len(keeper_map.get(my_slot) or keeper_map.get(str(my_slot)) or [])
    first = (order.my_picks or [None])[0]
    check = None
    if my_slot and first is not None and mine >= 0:
        # Round N+1 at my slot, on Sleeper's own numbering. Odd rounds run
        # forward, even rounds reverse — so the nth pick of the round is my slot
        # or its mirror. No keeper count enters, mine or anybody's.
        rnd = mine + 1
        nth = int(my_slot) if rnd % 2 == 1 else teams + 1 - int(my_slot)
        expected = (rnd - 1) * teams + nth
        # ⚠️ THE CONDITION IS EMITTED AGAIN, AND DROPPING IT WAS A REAL DEFECT.
        #
        # The old string read "holds only while I keep 3 (first pick in round
        # 4)". I deleted it with the compressed identity because the RULE now
        # generalises to any keeper count — which is true, and beside the point.
        # THE RULE GENERALISES; THE NUMBER DOES NOT. The sheet prints "#33", and
        # #33 is true only while Cory keeps exactly three.
        #
        # `admin.js` maps this field to `keeperNote.pickRule` and prints it inside
        # `if (pickRule)`, so a missing field printed NOTHING: the sheet went from
        # "#33, and here is when that is true" to a bare "#33 — provisional", with
        # no error anywhere. A number and a number whose provenance was lost read
        # identically and are not the same claim.
        #
        # SO IT COMES BACK STRONGER THAN A CAVEAT. `my_picks_before_keepers` is
        # the full pre-keeper snake, and the first pick under N keepers is simply
        # its (N+1)th entry — keep 0 -> 8, 1 -> 13, 2 -> 28, 3 -> 33. Emitting the
        # whole map means the sheet can show what the number BECOMES rather than
        # warning that it might, and it is derived from the artifact's own list
        # rather than restated.
        snake = list(getattr(order, "my_original_picks", None) or [])
        alts = {}
        for k in range(0, int(((cfg.get("keepers") or {}).get("count")) or 3) + 1):
            if k < len(snake):
                alts[str(k)] = snake[k]
        check = {"my_first_pick": first, "expected": expected,
                 "holds": first == expected,
                 "my_keepers": mine, "first_round": rnd, "nth_pick_of_round": nth,
                 "rule": "my_first_pick == (N*teams) + (my_slot if N+1 odd else "
                         "teams+1-my_slot), N = MY keeper count",
                 "independent_of": "how many players any other team keeps",
                 # THE CONDITION IS ALWAYS EMITTED. Losing it is the defect this
                 # replaces, so an absent pre-keeper snake degrades the MAP and
                 # never the sentence — and it says the map is missing rather
                 # than shipping an empty one that reads like "no alternatives".
                 "condition": (
                     "TRUE ONLY WHILE I KEEP EXACTLY %d. The RULE holds for any "
                     "keeper count; the NUMBER moves with mine. %s"
                     % (mine,
                        ("First pick is the (N+1)th entry of the pre-keeper snake: %s."
                         % ", ".join("keep %s -> %s" % (k, v)
                                     for k, v in sorted(alts.items())))
                        if alts else
                        "The pre-keeper snake is UNAVAILABLE in this build, so the "
                        "alternatives are not priced here.")),
                 "first_pick_by_my_keeper_count": alts,
                 "board_picks": teams * int(cfg.get("rounds") or 15),
                 "live_picks": len(order.picks),
                 "total_keepers_in_map": total_keepers}
    out["arithmetic_check"] = check
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

    # `season_now` has been a build_profiles parameter since it was written and
    # was never passed, so the rookie metric had no way to ask "was he a rookie
    # AT THAT DRAFT" and fell back to today's years_exp — which pinned it at 0.0
    # for every manager (register E13). Supplying it is the whole fix.
    profiles = managers_mod.build_profiles(
        drafts, players_db, historical_adp=hist,
        season_now=int(cfg.get("season") or time.gmtime().tm_year))
    proxied = [p["name"] for p in profiles.get("managers", {}).values()
               if (p.get("reach_delta") or {}).get("proxy")]
    if proxied:
        print(f"  manager market metrics still proxied for {len(proxied)}: {', '.join(proxied[:6])}")
    managers_mod.save(profiles, PROFILES_PATH)
    return profiles


def _update_proj_series(artifact: dict, *, today: str, path: Path = PROJ_SERIES_PATH) -> None:
    """Freeze today's Sleeper PRESEASON projection (the board's proj_baseline) into the dated,
    append-only snapshot archive. proj_baseline is the consensus projection converted to our
    scoring BEFORE any opportunity adjustment — the honest 'what the source projected preseason'.
    Deduped by (date, source). Non-fatal by contract."""
    players = artifact.get("players", [])
    proj_by_id = {str(p["player_id"]): p["proj_baseline"]
                  for p in players if p.get("proj_baseline") is not None}
    if not proj_by_id:
        return
    series = []
    if path.exists():
        try:
            doc = json.loads(path.read_text())
            series = doc.get("series", []) if isinstance(doc, dict) else (doc or [])
        except (ValueError, OSError):
            series = []
    # THE SITUATION TRAVELS WITH THE NUMBER (2026-08-17). Until today this froze
    # a bare float per player, so a January 2027 grade could have said "we
    # projected 415.88, he scored 380" and never "he was QB2 carrying a
    # Questionable tag when we wrote that". Every field in SITUATION_FIELDS is
    # LIVE STATE — true today and therefore never recoverable for today again —
    # which is why this could not wait until after the draft.
    situation = proj_series_mod.situation_from_board(players)
    # The DISTRIBUTION rides with the projection (2026-08-17). Freezing the mean
    # alone means a 2027 grade can ask "did the projection hit" and never "was
    # our ceiling calibrated" — the question that turned out to matter.
    dist = proj_series_mod.distribution_from_board(players)
    series = proj_series_mod.append_snapshot(series, today, "sleeper", proj_by_id,
                                             situation_by_id=situation,
                                             dist_by_id=dist)
    froze = ["sleeper(%d)" % len(proj_by_id)]
    # SECOND SOURCE, frozen the same day (2026-08-10): the projection-source grade
    # is only clean if EVERY source is frozen preseason, not just Sleeper — a FP
    # snapshot that lands once and is never re-frozen is one build away from being
    # lost. Freeze FantasyPros whenever the board carries it (build_fantasypros_
    # projections attached proj_fantasypros), so the freeze is reliably multi-source
    # and the source grade has a real comparison a year from now.
    fp_by_id = {str(p["player_id"]): p["proj_fantasypros"]
                for p in players if p.get("proj_fantasypros") is not None}
    if fp_by_id:
        series = proj_series_mod.append_snapshot(series, today, "fantasypros", fp_by_id,
                                                 situation_by_id=situation,
                                                 dist_by_id=dist)
        froze.append("fantasypros(%d)" % len(fp_by_id))
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(
        {"_note": "Preseason projection snapshots (append-only, deduped by date+source). Frozen "
                  "for a CLEAN post-season grade — retroactive fetches leak (exp33). "
                  "See draft/proj_series.py.",
         "series": series}, separators=(",", ":")))
    print(f"  projection snapshot: preseason frozen — {', '.join(froze)} ({today})")


def _update_adp_series(artifact: dict, *, today: str, path: Path = ADP_SERIES_PATH) -> None:
    """Append today's board ADP to the retained series, persist it, and stamp
    adp_velocity / adp_stale on each board player from the accumulated series.

    This is the one place a clock touches the series: `today` is passed in (the
    caller derives it from the artifact's built_at) so the pure functions in
    adp_series stay deterministic and unit-tested. Same-day re-runs replace, not
    double (append_snapshot dedups by date).

    velocity is POSITIVE when a player is RISING (ADP number falling toward an
    earlier pick). adp_stale is set only when the move clears the threshold AND
    the series is deep enough to mean anything — day one it is None on everyone,
    which is the honest state, not a bug. Non-fatal by contract: the board must
    still ship if the series file is unreadable, so callers wrap this.
    """
    players = artifact.get("players", [])
    adp_by_id = {str(p["player_id"]): p["raw_adp"]
                 for p in players if p.get("raw_adp") is not None}

    series = []
    if path.exists():
        try:
            doc = json.loads(path.read_text())
            series = doc.get("series", []) if isinstance(doc, dict) else (doc or [])
        except (ValueError, OSError):
            series = []      # corrupt/missing series starts fresh, loudly below

    # Same situational capture as the projection freeze (2026-08-17). An ADP
    # move is only interpretable next to the roster state that caused it.
    series = adp_series_mod.append_snapshot(
        series, today, adp_by_id,
        situation_by_id=proj_series_mod.situation_from_board(players))
    span = adp_series_mod.span_days(series)

    stamped = 0
    for p in players:
        pid = str(p.get("player_id"))
        v = adp_series_mod.velocity(series, pid)
        p["adp_velocity"] = v
        flag = adp_series_mod.stale_flag(v, span)
        p["adp_stale"] = flag
        if flag:
            stamped += 1

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(
        {"_note": "Daily ADP series (append-only, deduped by date). Powers the "
                  "staleness alarm; NOT a tested momentum edge. See draft/adp_series.py.",
         "series": series},
        separators=(",", ":")))
    artifact.setdefault("notes", {})["adp_series_span_days"] = span
    print(f"  ADP series: {len(series)} day(s) retained (span {span}); "
          f"{stamped} player(s) flagged stale at span {span}")


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
    slate_status = _assess_keeper_slate(cfg, offline)
    # The FULL map is kept: `designations_not_applied` must measure what the
    # GENERATOR failed to place, not what the GATE deliberately held back.
    full_keeper_map = load_keepers(cfg)
    keeper_map, withheld = _keeper_map_for_board(full_keeper_map, slate_status, cfg)
    kept_ids = {str(k["player_id"]) for ks in keeper_map.values() for k in ks if k.get("player_id")}

    order = keepers_mod.build_true_pick_order(cfg, keeper_map)
    print(f"  true pick order: {len(order.picks)} picks, {len(order.forfeited)} forfeited")

    # Kept players are excluded from the draftable board (they are already
    # rostered), but the War Room needs their full objects to pre-populate the
    # roster panel and bye card from pick one (Final Pass A1). Capture them here,
    # from the pre-exclusion pool (so bye/position/name are present), and stamp
    # each with its team_slot and cost_round from the forfeiture record.
    forfeit_by_id = {str(f.get("player_id")): f for f in order.forfeited}
    # SSOT display fix (2026-08-08): a slate stored as raw ids leaves forfeited
    # entries with name == player_id and position "?". Resolve every one against
    # the player pool HERE, at the source, so the artifact itself never ships a
    # bare id to any reader (the client PlayerRef resolver is the belt; this is
    # the suspenders). An id with no pool match is left loud for the resolver.
    _pool_by_id = {str(p.get("player_id")): p for p in players}
    for f in order.forfeited:
        src = _pool_by_id.get(str(f.get("player_id")))
        if src:
            f["name"] = src.get("name") or src.get("full_name") or f.get("name")
            f["position"] = src.get("position") or f.get("position")
            f["team"] = src.get("team") or f.get("team")
            if src.get("bye") is not None:
                f["bye"] = src.get("bye")
    kept_players = []
    for p in players:
        pid = str(p.get("player_id"))
        if pid not in kept_ids:
            continue
        rec = dict(p)
        f = forfeit_by_id.get(pid, {})
        rec["team_slot"] = f.get("team_slot")
        rec["cost_round"] = f.get("cost_round")
        rec["original_round"] = f.get("original_round")
        rec["is_keeper"] = True
        kept_players.append(rec)
    if order.my_picks:
        print(f"  my picks: {order.my_picks[:8]}{' ...' if len(order.my_picks) > 8 else ''}")

    available = keepers_mod.adjusted_adp(players, order, cfg, kept_ids)
    available, vorp_diag = vorp_mod.apply_vorp(available, cfg)
    available = vorp_mod.assign_tiers(available)

    # E's sweep-16 finding, ruled at the SOURCE (A, 08-18): kept_players are a
    # different population from `available` and never pass through apply_vorp,
    # so they shipped with vorp absent — and engine.js's `(player.vorp || 0)`
    # turned absent into a confident zero, flipping the keeper-target bar
    # negative and naming the wrong man on screen at pick 33 ("Zay Flowers
    # beats Ja'Marr Chase by 17"). The board's own identity (vorp ==
    # proj_mean − replacement[pos], 682/682 rows) is applied here so every
    # consumer gets the same number; E's UI-side derivation becomes the
    # designed no-op fallback. Unknown position stays ABSENT — never a
    # fallback constant (the || 0 lesson, again).
    _repl = (vorp_diag or {}).get("replacement_points") or {}
    for rec in kept_players:
        if rec.get("vorp") is None:
            rp = _repl.get(rec.get("position"))
            pm = rec.get("proj_mean")
            if rp is not None and pm is not None:
                rec["vorp"] = round(float(pm) - float(rp), 2)

    # GRAB-BY — "stick to value, know when to grab". Per-position EVLW (value lost to
    # waiting one pick) + grab-by pick, aware of MY keepers' filled slots. Forecast
    # mode so the pre-draft snapshot shows the board I'll really face; the client
    # recomputes it live as picks land. See grab_by.py.
    my_keeper_roster = [{"player_id": k.get("player_id"), "position": k.get("position"),
                         "name": k.get("name")}
                        for k in keeper_map.get(cfg.get("my_draft_slot"), [])]
    try:
        grab_by_block = grab_by_mod.report(available, set(), my_keeper_roster,
                                           order.my_picks, cfg, forecast_first=True)
        print(f"  grab-by: {grab_by_block.get('headline')}")
    except Exception as exc:   # never let the decision aid break the board build
        print(f"  ! grab-by unavailable ({type(exc).__name__}: {exc})")
        grab_by_block = None

    artifact = {
        "version": ARTIFACT_VERSION,
        "built_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "league": {
            "league_id": cfg.get("league_id"),
            "name": cfg.get("league_name"),
            "season": cfg.get("season"),
            "teams": cfg["teams"],
            "draft_type": cfg["draft_type"],
            # THE RAW SHAPE FIELD, CARRIED. `draft_type` is derived and Sleeper
            # reports "snake" under a third-round reversal too — 2023 ran with
            # reversal_round 3 and type "snake". Emitting only the label means
            # nothing downstream can check the derivation.
            "reversal_round": cfg.get("reversal_round", 0),
            "rounds": cfg.get("rounds"),
            "my_draft_slot": cfg.get("my_draft_slot"),
            # ⚠️ SLEEPER'S OWN SLOT MAP, AND WHY IT IS USUALLY EMPTY.
            #
            # `my_draft_slot` is operator-set. Cory: "I am slot 8 on the board
            # (all slot info is in sleeper)". It is — `draft.slot_to_roster_id` —
            # but for a draft in `pre_draft` status Sleeper has NOT DRAWN THE
            # ORDER YET and returns {}. Confirmed against the live API on
            # 2026-08-13: empty at the source, not lost in our ingest.
            #
            # So it is carried as evidence rather than used: while it is empty
            # the slot is UNVERIFIED and the guard says so; the moment Sleeper
            # publishes an order the nightly picks it up and the guard compares
            # them. That closes by itself rather than by anybody remembering.
            "slot_to_roster_id": cfg.get("slot_to_roster_id") or {},
            # MY OWN Sleeper owner_id, from the identity table. The client needs it
            # to drop me from the "room" it mixes opponent tendencies over (D6):
            # my profile is in manager_profiles but I never pick against myself, so
            # leaving it in would model the room as ~10% me. Absent -> the client
            # keeps the whole room and says so, rather than guessing which is me.
            "my_manager_id": _my_owner_id(),
            "roster_slots": cfg["roster_slots"],
            "starters": cfg["starters"],
            "scoring": cfg["scoring"],
            "keeper_rules": cfg["keepers"],
        },
        "pick_order": {
            # THE BOARD AS SLEEPER WILL NUMBER IT — every round x slot, with
            # keeper-occupied picks FLAGGED, not removed. This used to emit the
            # renumbered survivor list: 147 rows, round 4 starting at 28, Cory's
            # first pick at 30. Sleeper's own log for this league says 150 rows
            # and round 4 at 31 in all three completed seasons, keepers or not.
            "numbering": "sleeper_uncompressed",
            "numbering_note": (
                "A keeper occupies his pick slot; the pick is not removed and "
                "nothing after it shifts up. Verified against seasons "
                "2023/2024/2025 in league_history: 150 picks and round 4 at "
                "overall 31 every year, with 0, 23 and 20 keepers respectively. "
                "`picks` is the BOARD (depth: how many players leave the pool). "
                "`live_picks` is how many SELECTIONS happen. They differ by the "
                "keeper count and conflating them is a real defect this carries "
                "both to prevent."),
            "picks": order.board,
            "live_picks": len(order.picks),
            "my_picks": order.my_picks,
            "my_picks_before_keepers": order.my_original_picks,
            "forfeited": order.forfeited,
        },
        "replacement": vorp_diag,
        "grab_by": grab_by_block,
        "manager_profiles": profiles,
        "players": available,
        "kept_player_ids": sorted(kept_ids),
        # Full objects for the kept players (bye/position/name + team_slot), so
        # the War Room can pre-populate my roster and bye card from pick one (A1).
        "kept_players": kept_players,
        # The payout table — GROUND TRUTH for the money function. Stamped so the
        # War Room can show E[$] context and a checklist line that the payout
        # structure matches the league site. Absent file is not fatal (it warns).
        "payouts": _load_payouts(),
        # THE ENROLLED DOCTRINE (war-room-v2-doctrine-banner.md §1). Stamped from
        # the Lab's verdict, never authored here. None = nothing enrolled.
        "doctrine": _load_doctrine(),
        # REHEARSAL ONLY. Predicted, not confirmed — kept separate from
        # `kept_players` so a prediction can never be read as the real slate.
        "predicted_keepers": _load_predicted_keepers(),
        # SLATE RAILS: the honest status of the keeper slate the board is built on.
        # status 'confirmed' ONLY when Sleeper placements exist for all teams and match
        # designations; otherwise 'predicted'/'partial'/'mismatch'/'unverified'. The
        # War Room reads safe_to_treat_as_truth; the live-site check alarms as the draft
        # nears an unconfirmed slate. Empty designations are UNKNOWN, never zero.
        # `slate_status` was fetched ONCE, up top, because the gate that decides
        # which keepers reach the board needs it before the board is built. A
        # second fetch here could disagree with the one the gate used.
        "keeper_slate": _keeper_slate_reconciled(
            slate_status, keeper_map, order, cfg, withheld, full_keeper_map),
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
            "opportunity_applied": any(p.get("opportunity_adj") is not None
                                       for p in available),
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
    # `is not None`, NOT truthiness — the same rule _assert_opportunity_coverage
    # below already states for opportunity_z. Under Cory's ruled
    # `opportunity_cap: 0.0` blend() runs and writes adj == 0.0 on every
    # player: the adjustment reached every projection (multiplying by 1+0.0)
    # and the metrics status is honestly "ok". A truthiness read called those
    # zeros "never ran" and killed the FIRST build that ever carried the
    # ruling (run 32042127531 — every earlier nightly had the cap erased back
    # to 0.15 by the config-rewrite bug, so this line was never exercised at
    # cap 0). The docstring above this field's writer already said "cannot be
    # non-null unless the adjustment actually happened" — the code just
    # didn't test what the comment said.
    observed = any(p.get("opportunity_adj") is not None for p in players)

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
        cfg_raw = preserve_local_rulings(existing, cfg_raw)
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
    # Retain today's ADP into the dated series and stamp velocity/staleness on the
    # board. Non-fatal: a series hiccup must never block the board from shipping.
    try:
        _update_adp_series(artifact, today=artifact["built_at"][:10])
    except Exception as exc:  # noqa: BLE001 — the board ships without the stamps
        print(f"  ! ADP series not updated ({exc}); board ships without velocity stamps")
    # Freeze today's Sleeper PRESEASON projection into the dated snapshot archive, so a
    # CLEAN projection grade is possible after the season (a retroactive fetch leaks — exp33).
    # Non-fatal. FantasyPros projections are added by the CI probe (needs egress).
    try:
        _update_proj_series(artifact, today=artifact["built_at"][:10])
    except Exception as exc:  # noqa: BLE001 — the board ships regardless
        print(f"  ! projection snapshot not updated ({exc})")
    # WEEKLY ROSTER STATE (2026-08-17). Depth chart and injury designation are
    # LIVE state — this Tuesday's values, overwritten next Tuesday with no
    # record the first ones existed. That is exactly why VAR_BACKUP and
    # VAR_INJURED could not be fitted on 2021-2025 at all: not measured-and-
    # small, unmeasurable. Nothing recovers those seasons; every season from
    # here is recoverable only if the capture starts before the state moves.
    # Non-fatal, like its siblings — the board ships regardless.
    try:
        import roster_state as roster_state_mod
        _rs = roster_state_mod.capture(artifact.get("players") or [],
                                       artifact["built_at"][:10])
        print(f"  roster state: {_rs['players']} players, "
              f"{_rs['snapshots']} snapshots retained")
    except Exception as exc:  # noqa: BLE001
        print(f"  ! roster state not captured ({exc})")
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(artifact, separators=(",", ":")))
    size_kb = out.stat().st_size / 1024
    print(f"wrote {out} — {len(artifact['players'])} players, {size_kb:.0f} KB")


if __name__ == "__main__":
    main()
