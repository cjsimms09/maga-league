# TERRITORY: A
"""DATA-AND-ASSUMPTIONS INVARIANTS — the facts the mechanisms stand on.

Written by the 2026-08-15 data/assumptions audit
(draft/audit/data_assumptions_audit_2026-08-15.md). Every prior audit checked
mechanisms; these tests pin the FACTS those mechanisms consume, each one a
defect (or a latent assumption) that pass actually found:

  1. src/nfl_byes.json is DERIVED from the board — a stale copy false-zeros a
     playing player in the weekly projector and poisons the bye card. Checked
     clean on 2026-08-15; this keeps it checked.
  2. draft/data/player_positions.json is a UNION OVER BUILDS that the nightly
     workflow never committed (frozen at its 2026-08-14 hand-commit while the
     board rebuilt daily) — and the three 2026 keepers plus five new pool
     players were missing from it. Both fixed; the superset property is the
     contract.
  3. The nightly commit list itself: build.py grows the union on the runner,
     so the union only actually grows if the workflow commits it.
  4. format_census_series carried a row with a ("None","None") dedup key —
     un-replaceable by the producer's own dedup forever. Backfilled with
     provenance; a keyless row must never land again.
  5. league_history stores TWO 2023 drafts (the 150-pick main draft and a
     30-pick all-keeper auxiliary). Consumers read `drafts[0]` and depend on
     Sleeper's response ordering putting the main draft first — an assumption
     nothing pinned. This pins it on the committed artifact.
  6. The daily series freezes (adp/proj) are the Jan-2027 grading substrate;
     a duplicate or unordered key silently double-weights a day.
  7. Keeper arithmetic: keepers.json, pick_order keeper slots and the board's
     arithmetic_check must tell ONE story about pick 33.

Run: python -m pytest draft/tests/test_data_assumptions.py -q
"""
from __future__ import annotations

import json
import pytest
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def _load(rel: str):
    return json.loads((ROOT / rel).read_text())


# ── 1. byes: derived copy agrees with its source ──────────────────────────

def test_nfl_byes_agrees_with_board():
    src = _load("src/nfl_byes.json")["2026"]
    board = _load("public/draft_data.json")
    seen = {}
    for p in board["players"]:
        t, b = p.get("team"), p.get("bye")
        if t and t != "FA" and b is not None:
            seen.setdefault(t, set()).add(b)
    # no team may carry two byes on one board
    split = {t: s for t, s in seen.items() if len(s) > 1}
    assert not split, f"board-internal bye conflict: {split}"
    mismatch = {t: (src.get(t), next(iter(s))) for t, s in seen.items()
                if src.get(t) != next(iter(s))}
    assert not mismatch, f"nfl_byes.json is stale vs the board: {mismatch}"
    assert len(src) == 32
    # sanity on the season's shape: byes live in a plausible window and the
    # counts sum to the league (2-6 teams a week is the NFL's real range).
    weeks = Counter(src.values())
    assert min(weeks) >= 4 and max(weeks) <= 15, f"implausible bye weeks: {sorted(weeks)}"
    assert sum(weeks.values()) == 32


# ── 2. the position union is a superset of the live board ─────────────────

def test_position_union_covers_board_and_keepers():
    pos = _load("draft/data/player_positions.json")["positions"]
    board = _load("public/draft_data.json")
    missing = [(str(p["player_id"]), p["name"]) for p in
               list(board["players"]) + list(board.get("kept_players") or [])
               if p.get("position") and str(p["player_id"]) not in pos]
    assert not missing, (
        f"player_positions.json (union over builds) is missing live-board ids: "
        f"{missing} — the union is not growing; check the workflow commit list")


# ── 3. the workflow actually commits what build.py writes ─────────────────

def test_workflow_commits_the_position_union():
    yml = (ROOT / ".github/workflows/draft-data.yml").read_text()
    m = re.search(r'PATHS="([^"]+)"', yml)
    assert m, "draft-data.yml no longer has a PATHS commit list — update this test"
    paths = m.group(1).split()
    assert "draft/data/player_positions.json" in paths, (
        "draft/data/player_positions.json missing from the nightly commit list: "
        "build.py grows the union on the runner and the growth is then discarded")


# ── 4. census series rows must be keyed ───────────────────────────────────

def test_census_rows_are_keyed():
    doc = _load("draft/data/format_census_series.json")
    for row in doc["series"]:
        assert row.get("season") is not None and row.get("observed_at") is not None, (
            "keyless census row: dedup key would be ('None','None') and the "
            "producer's own dedup could never replace it")
    keys = [(str(r["season"]), str(r["observed_at"])) for r in doc["series"]]
    dup = [k for k, n in Counter(keys).items() if n > 1]
    assert not dup, f"duplicate census keys: {dup}"


# ── 5. drafts[0] is the main draft, per season ────────────────────────────

def test_league_history_main_draft_is_first():
    lh = _load("draft/data/league_history.json")
    for s in lh["seasons"]:
        drafts = [d for d in (s.get("drafts") or []) if d.get("picks")]
        if len(drafts) < 2:
            continue
        counts = [len(d["picks"]) for d in drafts]
        assert counts[0] == max(counts), (
            f"season {s.get('season')}: drafts[0] has {counts[0]} picks but the "
            f"largest draft has {max(counts)} — every drafts[0] consumer would "
            f"silently ingest the auxiliary (all-keeper) draft")
        # the auxiliary 2023 draft is all keeper placements; if a NON-keeper
        # auxiliary ever appears, it is a new kind of data and someone must look
        for d in drafts[1:]:
            assert all(p.get("is_keeper") for p in d["picks"]), (
                f"season {s.get('season')}: auxiliary draft {d.get('draft_id')} "
                f"contains non-keeper picks — no longer safe to ignore")


# ── 6. the daily freezes: unique keys, ordered dates ──────────────────────

def test_series_freeze_keys():
    proj = _load("draft/data/proj_series.json")["series"]
    keys = [(e["date"], e["source"]) for e in proj]
    dup = [k for k, n in Counter(keys).items() if n > 1]
    assert not dup, f"proj_series duplicate (date, source): {dup}"
    assert [e["date"] for e in proj] == sorted(e["date"] for e in proj)

    adp = _load("draft/data/adp_series.json")["series"]
    dates = [e["date"] for e in adp]
    dup = [k for k, n in Counter(dates).items() if n > 1]
    assert not dup, f"adp_series duplicate dates: {dup}"
    assert dates == sorted(dates)


# ── 7. keeper arithmetic tells one story ──────────────────────────────────

def test_keeper_arithmetic_is_one_story():
    """⚠️ MADE PHASE-AWARE (A, 2026-08-25). `kept_player_ids` IS NOT ALWAYS MINE.

    This asserted `my_count == len(board["kept_player_ids"])` and
    `cfg_ids == sorted(board["kept_player_ids"])` — both true only while the
    keeper slate is PREDICTED. `draft/keeper_slate.py:85-90` documents the design
    and measured it:

        slate 'predicted'   kept_player_ids = 3       (MINE ONLY)
        slate 'confirmed'   kept_player_ids = 17

    That withholding is Cory's own ruling of 2026-08-11 and is correct: the board
    is built on NO opponent keepers until the slate confirms. At the 2026-08-23
    lock it confirmed, `kept_player_ids` became the league's 23, and these two
    assertions started reporting a designed transition as a disagreement
    (`assert 3 == 23`). Nothing was wrong with the board.

    Fourth no-expiry phase pin found this week, after the keeper guard (register
    319), the keeper-pool ruling (283) and the v6 market arm. So this reads the
    slate and asserts what is true in EACH phase rather than flipping a constant.

    The arithmetic this test is named for — my keepers, my forfeited slots, my
    first pick — is still exact, but it is MINE and now has to say so.

    ⚠️ AND I GOT THAT WRONG ON THE FIRST PASS, WHICH IS WHY IT IS WRITTEN DOWN.
    The sentence here originally read "…is unchanged and still exact; only the
    identity of `kept_player_ids` depends on the phase". That was asserted
    without checking and the very next assertion disproved it: `keeper_slot` is
    flagged on EVERY team's keeper pick, so the count went 3 -> 23 alongside
    `kept_player_ids`. Measured: 23 flagged slots league-wide, distributed
    2/3/2/3/3/3/3/3/1 across seats 1-9, of which seat 8 — mine — holds exactly 3
    (overall 8, 13, 28). The widening reaches further than one field, and a
    confident sentence about blast radius is worth no more than the grep behind
    it."""
    board = _load("public/draft_data.json")
    keepers = _load("draft/config/keepers.json")
    my_id = board["league"]["my_manager_id"]
    mine = [t for t in keepers["teams"] if t.get("owner_id") == my_id]
    my_count = len(mine[0]["keepers"]) if mine else 0
    cfg_ids = sorted(str(k["player_id"]) for k in (mine[0]["keepers"] if mine else []))
    board_ids = sorted(str(x) for x in board["kept_player_ids"])
    confirmed = bool((board.get("keeper_slate") or {}).get("confirmed"))

    if confirmed:
        # THE LEAGUE'S. Mine must be a SUBSET — anything else means my own
        # designations went missing from a slate that claims to hold everyone's.
        assert set(cfg_ids) <= set(board_ids), (
            "the slate is CONFIRMED, so kept_player_ids holds the league's "
            f"keepers — but mine are not all in it: missing "
            f"{sorted(set(cfg_ids) - set(board_ids))}")
        assert len(board_ids) >= my_count, (
            f"confirmed slate holds {len(board_ids)} ids, fewer than my own "
            f"{my_count}")
    else:
        # MINE ONLY, by Cory's 2026-08-11 withholding ruling.
        assert my_count == len(board_ids), (
            "the slate is PREDICTED, so kept_player_ids must be MINE ALONE — "
            "keepers.json and the board disagree on my keeper count")
        assert cfg_ids == board_ids

    # UNCHANGED AND PHASE-INDEPENDENT: my forfeited slots and my first pick.
    # These are the arithmetic the test is named for and they never depended on
    # what the rest of the league kept.
    # MY slots, by seat. `keeper_slot` flags every team's keeper pick — the
    # board is the whole draft, not my column of it — so this must filter to
    # my_draft_slot or it counts the league's 23 against my 3.
    my_slot = int(board["league"]["my_draft_slot"])
    slots = [p for p in board["pick_order"]["picks"]
             if p.get("keeper_slot") and int(p.get("slot", -1)) == my_slot]
    assert len(slots) == my_count, (
        f"pick_order flags {len(slots)} keeper slot(s) at my seat ({my_slot}) "
        f"but keepers.json says I kept {my_count}")
    # ...and league-wide the flags must account for every kept player, which is
    # the other half of the same arithmetic and was never checked here.
    all_slots = [p for p in board["pick_order"]["picks"] if p.get("keeper_slot")]
    assert len(all_slots) == len(board_ids), (
        f"{len(all_slots)} keeper slots flagged league-wide against "
        f"{len(board_ids)} kept player id(s) — a forfeited pick with no keeper "
        "behind it, or a keeper who forfeited nothing")
    ac = board["keeper_slate"]["arithmetic_check"]
    assert ac["holds"] is True and ac["my_first_pick"] == ac["expected"], (
        "the board's own first-pick arithmetic check fails")


def test_the_slate_phase_ACTUALLY_CHANGES_what_kept_player_ids_holds():
    """RULE 3e for the branch above. Both arms could be satisfied by a board
    where the two sets happen to coincide, and then the phase logic would be
    decorative. On a CONFIRMED slate with more than one designating team, the
    league's ids must be STRICTLY more than mine — otherwise the confirmation
    did not actually widen anything and the branch is untested."""
    board = _load("public/draft_data.json")
    slate = board.get("keeper_slate") or {}
    if not slate.get("confirmed"):
        pytest.skip("slate is not confirmed; the widening has not happened yet")
    if int(slate.get("teams_designated") or 0) <= 1:
        pytest.skip("only one team designated; mine and the league's coincide")

    keepers = _load("draft/config/keepers.json")
    my_id = board["league"]["my_manager_id"]
    mine = [t for t in keepers["teams"] if t.get("owner_id") == my_id]
    cfg_ids = {str(k["player_id"]) for k in (mine[0]["keepers"] if mine else [])}
    board_ids = {str(x) for x in board["kept_player_ids"]}

    assert board_ids > cfg_ids, (
        f"{slate.get('teams_designated')} teams designated and the slate is "
        f"CONFIRMED, but kept_player_ids ({len(board_ids)}) is not strictly "
        f"larger than my own ({len(cfg_ids)}) — either the confirmation did not "
        "widen the slate, in which case the phase branch above is untested, or "
        "opponent designations are being dropped")
