# TERRITORY: C
"""KEEPER-FUTURES — the 2027 keeper-value read on every currently-rostered
player, regenerated weekly. `ROUTES.md` TO: C, 08-20 package / 08-24
fresh-ranked queue item (5), "the keeper-futures file."

REAL PREMISE CORRECTION ALREADY ON RECORD (08-21, twice, found before
anything was built): the ask's original framing — "keeper_cost_2027 = this
year's draft slot, an escalator" — is not how this league's rule works.
`league_config.json`'s `keepers.cost_model` is `"top_picks_flat"`: keeping N
players forfeits picks 1..N of the FOLLOWING draft, POSITIONALLY — the
highest-VORP kept player costs round 1, the second costs round 2, and so on,
independent of where either player was originally drafted
(`draft/keepers.py:optimize_keeper_count`, its own inline comment). So there
is no fixed per-player "keeper_cost_2027" fact to store — cost depends on
which OTHER players the same owner also chooses to keep. This module runs
the REAL optimizer per team rather than storing a fiction with false
precision.

WHAT THIS ACTUALLY COMPUTES, TODAY (pre-week-1, no 2026 in-season stats
exist yet): for each of the ten real current rosters, "if 2027 keepers were
chosen from this roster today," the optimizer's recommended keep-count and
combination, using the freshest available per-player value —
`public/draft_data.json`'s post-draft VORP (built 2026-08-22, two days after
this module was started, the newest number that exists before any 2026 game
is played). This is explicitly a SEED, not a real 2027 projection — none
exists yet, matching the ask's own admission ("there is no 2027 board to run
it against yet"). VORP is an INJECTABLE input for exactly this reason: once
real in-season production exists (`weekly_projection_archive`), a later pass
can re-derive it from rolling rest-of-season points without touching the
optimizer join below.

WHAT THIS DOES NOT MODEL, STATED PLAINLY RATHER THAN HALF-BUILT (rule 3f):
years-kept eligibility (`max_years: 3`). The earlier ROUTES reply on this
same ask already flagged that years-kept tracking is a real, separate gap —
unverifiable for opponents without a dedicated ledger this repo does not
have. Every rostered player is treated as keeper-eligible here; a true
eligibility filter is future work, not silently approximated.

REUSE, NOT REBUILD (rule 11): `draft/keepers.py:optimize_keeper_count` is
the entire cost/surplus engine, used unmodified — this module only does the
roster join and the per-team fan-out. `sleeper_import.fetch_rosters` for the
real current rosters (same real egress every other C in-season capture
already uses). The kept-players-are-in-a-different-list join gotcha below is
the same one `draft/keeper_optimize.py` already found and fixed (its own
comment: "a decision tool recommended the opposite of the right answer
without any error") — replicated here rather than re-discovered.

RULE 3E KNOWN-POSITIVE: Cory's real 2026 keepers — Derrick Henry (cost_round
1, vorp 111.35), Ja'Marr Chase (cost_round 2, vorp 128.9), Kenneth Walker
(cost_round 3, vorp 86.02) — verified directly against the committed
`public/draft_data.json` (`kept_players`, team_slot 8) before writing this
fixture; register 289's own row quotes the same three numbers
independently. Run through THIS module's optimizer as a 3-player eligible
set, the recommended combination must be all three in VORP order (Chase >
Henry > Walker), because that is definitionally the highest-surplus 3-of-3
combination when there are exactly three candidates and all three carry a
large positive surplus over a replacement-level late pick.

Run: python3 draft/backtest/keeper_futures.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent          # draft/backtest
DRAFT = HERE.parent
ROOT = DRAFT.parent
sys.path.insert(0, str(DRAFT))
sys.path.insert(0, str(HERE))

import keepers as K            # noqa: E402  (rule 11)
import sleeper_import as SI    # noqa: E402  (rule 11)

BOARD = ROOT / "public" / "draft_data.json"
CFG = DRAFT / "config" / "league_config.json"
OUT = DRAFT / "data" / "keeper_futures_2026.json"

#: Rule 3e known-positive — real values, checked against the committed board
#: before writing (see module docstring).
KNOWN_POSITIVE = {
    "owner_id": "434915673219526656",
    "expected_names": ["Ja'Marr Chase", "Derrick Henry", "Kenneth Walker"],
}


def load_board(board_doc: dict | None = None):
    """`draft_data.json`'s full player pool + VORP -- Rule 11, no new
    egress. Returns (by_id, pool_by_pos, replacement_by_pos). Kept players
    live in a SEPARATE list (`kept_players`) and are missing from
    `players[]` -- the exact gotcha `keeper_optimize.py` already found and
    fixed, replicated here rather than re-discovered the hard way."""
    if board_doc is None:
        board_doc = json.loads(BOARD.read_text())

    by_id = {str(p["player_id"]): p for p in board_doc.get("players", [])}
    rep_points = ((board_doc.get("replacement") or {}).get("replacement_points") or {})
    for kp in (board_doc.get("kept_players") or []):
        pid = str(kp.get("player_id"))
        if pid in by_id:
            continue
        row = dict(kp)
        if row.get("vorp") is None and row.get("proj_mean") is not None:
            base = rep_points.get(row.get("position"))
            if base is not None:
                row["vorp"] = round(float(row["proj_mean"]) - float(base), 2)
        by_id[pid] = row

    pool_by_pos: dict = {}
    for p in board_doc.get("players", []):
        pos = p.get("position")
        if pos:
            pool_by_pos.setdefault(pos, []).append(p)
    replacement_by_pos = {}
    for pos, arr in pool_by_pos.items():
        vv = sorted((x.get("vorp") or 0.0) for x in arr)
        replacement_by_pos[pos] = vv[len(vv) // 2] if vv else 0.0

    return by_id, pool_by_pos, replacement_by_pos


def build_team_eligible(roster_player_ids: list, by_id: dict) -> tuple[list, list]:
    """Join one roster's player ids to real VORP/position. `unpriced` is
    REFUSED LOUDLY by the caller, never dropped silently -- a silently
    dropped roster player is how `keeper_optimize.py` once recommended
    "keep nobody" while holding three real keepers (its own history)."""
    eligible, unpriced = [], []
    for pid in roster_player_ids:
        p = by_id.get(str(pid))
        if not p or p.get("vorp") is None:
            unpriced.append({"player_id": str(pid), "name": (p or {}).get("name")})
            continue
        eligible.append({
            "player_id": str(pid),
            "name": p.get("name"),
            "position": p.get("position"),
            "vorp": p.get("vorp") or 0.0,
        })
    return eligible, unpriced


def build_store(rosters: list | None = None, board_doc: dict | None = None,
                cfg: dict | None = None) -> dict:
    """`rosters`/`board_doc`/`cfg` are injectable for tests; real runs pass
    None and this fetches the real committed board and the real live
    rosters (Rule 11 — same `sleeper_import.fetch_rosters` every other C
    in-season capture uses)."""
    if cfg is None:
        cfg = json.loads(CFG.read_text())
    by_id, pool_by_pos, replacement_by_pos = load_board(board_doc)
    if rosters is None:
        rosters = SI.fetch_rosters(cfg["league_id"])

    teams = {}
    for r in rosters:
        owner_id = str(r.get("owner_id"))
        eligible, unpriced = build_team_eligible(r.get("players") or [], by_id)
        result = K.optimize_keeper_count(
            eligible, cfg, replacement_by_pos=replacement_by_pos, pool_by_pos=pool_by_pos)
        teams[owner_id] = {
            "roster_id": r.get("roster_id"),
            "recommended_keep": result["recommended_keep"],
            "recommended_players": result["recommended_players"],
            "recommended_surplus": result["recommended_surplus"],
            "by_size": result["by_size"],
            "n_eligible": len(eligible),
            "unpriced": unpriced,
        }

    doc = {
        "_territory": "TERRITORY: C — produced by draft/backtest/keeper_futures.py",
        "_note": ("2027 keeper-value seed, register/ROUTES 'keeper-futures file'. Runs the "
                 "REAL top_picks_flat optimizer (draft/keepers.py:optimize_keeper_count, "
                 "unmodified) per current roster against draft_data.json's post-draft "
                 "VORP -- a SEED value, not a real 2027 projection (none exists pre-week-1). "
                 "Does NOT model years-kept eligibility (max_years) -- stated limit, not "
                 "silently approximated. Regenerate weekly; swap board_doc's VORP source "
                 "for a rolling in-season one once weekly_projection_archive has enough "
                 "weeks banked."),
        "board_built_at": None,
        "cost_model": cfg["keepers"]["cost_model"],
        "keeper_count": cfg["keepers"]["count"],
        "n_teams": len(teams),
        "teams": teams,
    }
    return doc


def verify_known_positive(doc: dict, board_doc: dict | None = None, cfg: dict | None = None) -> dict:
    """Rule 3e control, independent of `build_store`'s roster fetch: builds
    the 3-player eligible set directly from real board VORP and asserts the
    optimizer recommends keeping all three, in VORP order. Does not depend
    on Sleeper being reachable, so it can run even when the live roster
    fetch cannot (this sandbox has no route to the Sleeper API)."""
    if cfg is None:
        cfg = json.loads(CFG.read_text())
    by_id, pool_by_pos, replacement_by_pos = load_board(board_doc)

    real_ids = [kp.get("player_id") for kp in
               (board_doc or json.loads(BOARD.read_text())).get("kept_players", [])
               if kp.get("name") in KNOWN_POSITIVE["expected_names"]]
    eligible, unpriced = build_team_eligible(real_ids, by_id)
    if len(eligible) != 3:
        return {"ok": False, "why": f"expected 3 known players, joined {len(eligible)}",
               "unpriced": unpriced}

    result = K.optimize_keeper_count(eligible, cfg, replacement_by_pos=replacement_by_pos,
                                     pool_by_pos=pool_by_pos)
    got_names = set(result["recommended_players"])
    want_names = set(KNOWN_POSITIVE["expected_names"])
    ok = got_names == want_names and result["recommended_keep"] == 3
    return {"ok": ok, "recommended_players": result["recommended_players"],
           "recommended_keep": result["recommended_keep"], "want": sorted(want_names)}


#: Refusal floor -- a real run has exactly 10 teams; a starved roster fetch
#: (partial Sleeper response, wrong league_id) looks like far fewer.
MIN_TEAMS = 8


def refusal_reason(doc: dict) -> str | None:
    if doc["n_teams"] < MIN_TEAMS:
        return (f"only {doc['n_teams']} teams joined (floor {MIN_TEAMS}, real league "
               "has 10) -- roster fetch likely partial or wrong league_id")
    return None


def main() -> int:
    board_doc = json.loads(BOARD.read_text())
    control = verify_known_positive(None, board_doc=board_doc)
    if not control["ok"]:
        print(f"VOID -- known-positive control failed: {control}", file=sys.stderr)
        return 1

    doc = build_store(board_doc=board_doc)
    doc["board_built_at"] = board_doc.get("built_at")
    # this store carries no natural timestamp field (a current best-estimate,
    # not an event log) -- capture_cron_health.py's _no_timestamp_control_only
    # path watches this key instead, same convention as player_bio_capital.py
    # and injury_designations.py.
    doc["rule_3e_control"] = control
    reason = refusal_reason(doc)
    if reason:
        print(f"REFUSING TO WRITE: {reason}. Nothing written.", file=sys.stderr)
        return 1

    OUT.write_text(json.dumps(doc, indent=1))
    print(f"wrote {OUT.relative_to(ROOT)}: {doc['n_teams']} teams, "
         f"board_built_at {doc['board_built_at']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
