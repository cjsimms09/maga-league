# TERRITORY: C
"""TUESDAY WIRE SNAPSHOT — Cory's in-season queue, item 1: "the highest-value
capture nobody has." `ROUTES.md` TO: C, 2026-08-21.

Every Tuesday, before that week's waivers clear, snapshot two things that
CANNOT be reconstructed after the fact:

  (1) THE WIRE — which board-relevant players are NOT rostered by any of
      the league's ten teams, right now.
  (2) WAIVER PRIORITY ORDER — each roster's current priority position,
      right now (manifest row 14, the addendum to this same dispatch).

WHY IT CANNOT BE BACKFILLED: rosters change every week (adds/drops/trades)
and this league is REVERSE STANDINGS, not rolling priority — checked
directly against `sleeper_import.py`'s own decode comment ("Sleeper
waiver_type: 0=rolling priority, 1=reverse [standings]") and
`sleeper_league_probe.py`'s `WAIVER_TYPE` dict (`1: "reverse standings
(priority resets weekly off record — NO depletion)"`), both matching this
league's real `type_code: 1`. ⚠️ CORRECTS A REAL, PROPAGATED MISNOMER:
P304/P288/P293 in `PREDICTION-LEDGER.md` and Cory's own 08-21 dispatch all
call this "rolling priority" — see the ROUTES correction filed alongside
this module. Under reverse standings, priority resets weekly from
standings and does NOT deplete when a roster claims — so "what a roster's
priority was before it changed" is still real and still uncapturable
after the fact (this week's exact snapshot vs. a later-computed standings
table can differ on tiebreaks and same-week ordering), but the mental
model of "burning" priority by claiming does not describe this mechanic.

WHAT "THE WIRE" MEANS HERE, STATED EXPLICITLY: the board's own player
universe (`public/draft_data.json`, TERRITORY: A, read-only — reused, not
re-derived, rule 11) MINUS every player rostered on any of the ten teams
this week. This is the FANTASY-RELEVANT wire (draftable_scope, ~700
players), not literally every player in Sleeper's full NFL player table —
matches what a real waiver decision actually chooses among. A player who
matters later but is outside today's board scope is a real limit of this
definition, stated rather than hidden.

WAIVER PRIORITY, CENSUS-AWARE RATHER THAN GUESSED (rule 3e/3f — this
sandbox cannot reach Sleeper to verify a field name against a real
response, and no file in this repo has verified one either, checked by
grep before writing this module): each roster's ENTIRE `settings` object
is kept verbatim, not just one extracted field, so a wrong guess about
the field name cannot silently drop the fact this capture exists to
record. `extract_priority_guess()` also tries several documented Sleeper
conventions and records which one (if any) matched, so a human reading
the FIRST real run can confirm or correct the extraction before anything
downstream trusts it.

REUSED, NOT REBUILT (rule 11): `sleeper_import.fetch_rosters()` (the
league's real roster fetch, already used to build the board) and
`weekly_proj_snapshot.nfl_state()` (season/week auto-detection, already
used by the FP-expert-ranks weekly cron for the identical problem).

APPEND-ONLY BY DESIGN, same reasoning as `weekly_projection_archive.py`:
one dated snapshot per Tuesday, in `draft/data/tuesday_wire_snapshot/`,
never overwritten — a missed Tuesday is a gap in the record, not
something a later run can silently paper over.

Run (CI only): python3 draft/backtest/tuesday_wire_snapshot.py
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent          # draft/backtest
DRAFT = HERE.parent
ROOT = DRAFT.parent
sys.path.insert(0, str(DRAFT))                  # sleeper_import.py, weekly_proj_snapshot.py

BOARD = ROOT / "public" / "draft_data.json"
LEAGUE_CONFIG = DRAFT / "config" / "league_config.json"
OUT_DIR = DRAFT / "data" / "tuesday_wire_snapshot"

#: Every documented Sleeper roster-priority key this module knows of,
#: checked in order — NOT assumed correct, only tried. `raw_settings` is
#: always kept beside whichever of these (if any) matches, so a wrong
#: guess here costs nothing but a clearer field name later.
PRIORITY_KEY_CANDIDATES = ("waiver_position", "waiver_pos", "waiver_priority")

#: Rule 3e known-positive: a realistic 3-roster, 5-board-player fixture.
#: Board has 5 players; rosters hold 3 of them across two teams; the wire
#: must be exactly the 2 unrostered ones, and priority must resolve for
#: both rosters from their (illustrative) settings blocks.
KNOWN_POSITIVE_BOARD = {"players": [
    {"player_id": "1001", "name": "A"}, {"player_id": "1002", "name": "B"},
    {"player_id": "1003", "name": "C"}, {"player_id": "1004", "name": "D"},
    {"player_id": "1005", "name": "E"},
]}
KNOWN_POSITIVE_ROSTERS = [
    {"roster_id": 1, "owner_id": "u1", "players": ["1001", "1002"],
     "settings": {"waiver_position": 3}},
    {"roster_id": 2, "owner_id": "u2", "players": ["1003"],
     "settings": {"waiver_position": 1}},
]


def board_player_ids(board_doc: dict) -> set:
    return {str(p["player_id"]) for p in board_doc.get("players", [])
            if p.get("player_id") is not None}


def rostered_player_ids(rosters: list) -> set:
    out = set()
    for r in rosters:
        for pid in (r.get("players") or []):
            out.add(str(pid))
    return out


def compute_wire(board_doc: dict, rosters: list) -> list:
    """Board players NOT on any roster, sorted for a stable diff between
    weeks. Pure -- the whole point is this is testable without a fetch."""
    on_board = board_player_ids(board_doc)
    rostered = rostered_player_ids(rosters)
    return sorted(on_board - rostered, key=int)


def extract_priority_guess(settings: dict) -> tuple[str | None, int | None]:
    """(matched_key, value) for the first PRIORITY_KEY_CANDIDATES entry
    present in `settings`, else (None, None). Never raises on a shape it
    does not recognize -- that is exactly the case this is designed to
    surface via raw_settings, not crash on."""
    for key in PRIORITY_KEY_CANDIDATES:
        if key in settings and isinstance(settings[key], (int, float)):
            return key, settings[key]
    return None, None


def build_priority_order(rosters: list) -> list:
    """One row per roster: owner/roster ids, the best-guess priority value
    (and which key produced it, or None), and the raw settings object
    verbatim so a human can correct the guess from real data."""
    rows = []
    for r in rosters:
        settings = r.get("settings") or {}
        matched_key, value = extract_priority_guess(settings)
        rows.append({
            "roster_id": r.get("roster_id"),
            "owner_id": r.get("owner_id"),
            "waiver_priority_guess": value,
            "waiver_priority_key_matched": matched_key,
            "raw_settings": settings,
        })
    # sort by the guessed value when every roster resolved one; otherwise
    # leave in roster_id order rather than silently pretending an order
    # exists across unresolved rows.
    if all(row["waiver_priority_guess"] is not None for row in rows):
        rows.sort(key=lambda row: row["waiver_priority_guess"])
    return rows


def build_snapshot(board_doc: dict, rosters: list, *, season, week, captured_at: str) -> dict:
    wire = compute_wire(board_doc, rosters)
    priority = build_priority_order(rosters)
    unresolved = [r["roster_id"] for r in priority if r["waiver_priority_guess"] is None]
    doc = {
        "_territory": "TERRITORY: C — produced by draft/backtest/tuesday_wire_snapshot.py",
        "_note": ("Two facts that cannot be reconstructed after the fact: (1) "
                 "`wire` -- board players unrostered by any of the ten teams "
                 "this week; (2) `waiver_priority_order` -- each roster's "
                 "priority position as it stood this Tuesday. See module "
                 "docstring for the wire's exact definition and the "
                 "census-aware priority extraction."),
        "season": season, "week": week, "captured_at": captured_at,
        "n_board_players": len(board_player_ids(board_doc)),
        "n_rostered": len(rostered_player_ids(rosters)),
        "wire": wire,
        "waiver_priority_order": priority,
        "priority_extraction_unresolved_roster_ids": unresolved,
    }
    return doc


def verify_known_positive() -> dict:
    doc = build_snapshot(KNOWN_POSITIVE_BOARD, KNOWN_POSITIVE_ROSTERS,
                         season=2026, week=1, captured_at="2026-01-01T00:00:00Z")
    wire_ok = doc["wire"] == ["1004", "1005"]
    order_ok = ([r["roster_id"] for r in doc["waiver_priority_order"]] == [2, 1]
               and doc["waiver_priority_order"][0]["waiver_priority_guess"] == 1)
    return {"ok": wire_ok and order_ok, "wire_ok": wire_ok, "order_ok": order_ok,
           "doc": doc}


#: Refusal floor -- a real Tuesday has ten rosters and this league's own
#: board carries ~700 players; either number collapsing near zero is an
#: upstream failure (empty roster fetch, empty/truncated board), not a
#: real "the wire is empty this week" state, which cannot happen with a
#: ten-team league and hundreds of drafted-but-unrostered bench players.
MIN_ROSTERS = 8
MIN_WIRE_PLAYERS = 20


def refusal_reason(doc: dict) -> str | None:
    n_rosters = len(doc["waiver_priority_order"])
    if n_rosters < MIN_ROSTERS:
        return (f"only {n_rosters} rosters resolved (floor {MIN_ROSTERS}, real "
               "league has 10) -- roster fetch empty or reshaped")
    if len(doc["wire"]) < MIN_WIRE_PLAYERS:
        return (f"only {len(doc['wire'])} wire players (floor {MIN_WIRE_PLAYERS}) "
               "-- board or roster fetch empty or reshaped")
    return None


# ── egress (CI only) ─────────────────────────────────────────────────────

def _league_id() -> str:  # pragma: no cover  (egress)
    cfg = json.loads(LEAGUE_CONFIG.read_text())
    league_id = cfg.get("league_id")
    if not league_id:
        raise RuntimeError("league_config.json has no league_id -- refusing to guess one")
    return str(league_id)


def run() -> dict:  # pragma: no cover  (egress)
    import sleeper_import as SI
    import weekly_proj_snapshot as WPS

    board_doc = json.loads(BOARD.read_text())
    rosters = SI.fetch_rosters(_league_id())
    state = WPS.nfl_state()
    season = state.get("season")
    week = state.get("week")
    captured_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    doc = build_snapshot(board_doc, rosters, season=season, week=week,
                         captured_at=captured_at)
    doc["rule_3e_control"] = verify_known_positive()
    return doc


def main() -> int:  # pragma: no cover  (egress)
    doc = run()
    control = doc.pop("rule_3e_control")
    if not control["ok"]:
        print(f"VOID -- known-positive control failed: {control}", file=sys.stderr)
        return 1

    reason = refusal_reason(doc)
    if reason:
        print(f"REFUSING TO WRITE: {reason}. Nothing written.", file=sys.stderr)
        return 1

    if not doc.get("season") or not doc.get("week"):
        print("REFUSING TO WRITE: nfl_state() returned no season/week -- "
             "cannot key this snapshot. Nothing written.", file=sys.stderr)
        return 1

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    name = f"tuesday_wire_{doc['season']}_w{doc['week']}.json"
    out_path = OUT_DIR / name
    if out_path.exists():
        print(f"REFUSING TO OVERWRITE: {name} already exists -- a duplicate "
             "same-week run must not clobber the first real Tuesday capture "
             "(register-172 lesson). Nothing written.", file=sys.stderr)
        return 1
    out_path.write_text(json.dumps(doc, indent=1))

    unresolved = doc["priority_extraction_unresolved_roster_ids"]
    if unresolved:
        print(f"::warning::waiver priority guess unresolved for roster_ids "
             f"{unresolved} -- raw_settings is kept per-roster in {name}; "
             "read it and correct PRIORITY_KEY_CANDIDATES if needed.")
    print(f"wrote {out_path.relative_to(ROOT)}: season {doc['season']} week "
         f"{doc['week']}, {len(doc['wire'])} wire players, "
         f"{len(doc['waiver_priority_order'])} rosters")
    return 0


if __name__ == "__main__":
    sys.exit(main())
