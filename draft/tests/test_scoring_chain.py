# TERRITORY: C
"""THE LEAGUE'S OWN TERMS, HELD IN FOUR PLACES, MUST BE THE SAME TERMS.

Two facts define what this league IS: how a point is scored, and what a legal
lineup looks like. Each is copied into several files, and a copy that drifts is
invisible — every consumer stays internally consistent while quietly answering a
different league's question.

EVERY POINT IN THIS SYSTEM IS SCORED WITH THE SAME TABLE, OR NONE OF IT MEANS
ANYTHING.

Four places hold a scoring table and all four must be the same one:

  sleeper_league_settings.scoring_settings   THE AUTHORITY — what the league
                                             actually scores, captured from
                                             Sleeper
  league_config.scoring                      what our pipeline prices with
  draft_data.league.scoring                  what the artifact ships to the
                                             client
  nflverse_weekly_points_*.weeks[].scoring   what REALIZED points were computed
                                             with

A drift between the first two silently reprices every projection. A drift
between those and the last is worse and quieter: replacement level, the waiver
shelf, the projection-error calibration and every backtest are then measured in
different units than the board is priced in, and each of them stays internally
consistent while the comparison between them stops meaning anything.

NOTHING CHECKED THIS. Every existing test that mentions `scoring_settings` uses a
FIXTURE — `{"rec": 0.5, "pass_td": 6.0}` — so the real tables had never been
compared to each other. They agree today: 44 keys, four ways, zero
disagreements, verified before this file was written rather than assumed by it.

WHY A KEY MISSING ON ONE SIDE IS A FAILURE AND NOT A SHRUG. An absent key scores
as zero, and zero is a real scoring rule. `bonus_rec_te` absent from all four
means this league has no tight-end premium; absent from ONE of them would mean
one half of the system believes it does. Set comparison, not intersection.

Run: python3 -m pytest draft/tests/test_scoring_chain.py -q
"""
import glob
import json
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
sys.path.insert(0, str(HERE.parent / "backtest"))

import nflverse_weekly_store as W  # noqa: E402

SLEEPER = ROOT / "draft" / "data" / "sleeper_league_settings.json"
CONFIG = ROOT / "draft" / "config" / "league_config.json"
BOARD = ROOT / "public" / "draft_data.json"
STORES = str(ROOT / "draft" / "backtest" / "nflverse_weekly_points_*.json")


def _load(path):
    p = Path(path)
    if not p.exists():
        return None
    return json.loads(p.read_text())


def tables() -> dict:
    """Every scoring table in the system, by where it lives.

    A source that is ABSENT is left out; a source that is PRESENT but empty is
    kept as `{}` so it fails the comparison rather than vanishing from it. Those
    are different states and only one of them is "nothing to check".
    """
    out = {}
    sl = _load(SLEEPER)
    if sl is not None:
        out["sleeper (authority)"] = sl.get("scoring_settings") or {}
    cfg = _load(CONFIG)
    if cfg is not None:
        out["league_config"] = cfg.get("scoring") or {}
    board = _load(BOARD)
    if board is not None:
        out["board artifact"] = (board.get("league") or {}).get("scoring") or {}
    for f in sorted(glob.glob(STORES)):
        doc = _load(f)
        weeks = (doc or {}).get("weeks") or []
        if weeks and weeks[0].get("scoring"):
            out["realized %s" % Path(f).stem.split("_")[-1]] = weeks[0]["scoring"]
    return out


def disagreements(ts: dict) -> list:
    """Every key where two tables differ, or where one has it and another does not.

    Compared against the AUTHORITY rather than pairwise, so a report names what
    is wrong rather than how many pairs noticed.

    ⚠ "SAME TABLE" IS DEFINED ONCE, IN `nflverse_weekly_store._canonical`, AND
    REUSED HERE. My first version compared raw floats and immediately failed on
    the 2023 store: `rec_yd` is stored as 0.10000000149011612 there, because that
    season round-tripped through float32, against 0.1 everywhere else. A
    difference of 1.5e-9 is not a scoring change — it is a representation — and
    the store's own fingerprint already treats all three seasons as identical
    (`bd8f3e50bd67a9ce` for 2023, 2024 and 2025 alike).

    Inventing a second tolerance here would have been the two-places defect: two
    definitions of when two tables are the same, drifting apart. The store's
    rounding is the definition; a real scoring change is never smaller than the
    sixth decimal, and every value in a league's table is a human-set number.
    """
    canon = lambda v: None if v is None else W._canonical(v)
    ref_name = "sleeper (authority)"
    if ref_name not in ts:
        return [("__no_authority__", "sleeper_league_settings is absent", None)]
    ref = ts[ref_name]
    out = []
    for name, t in ts.items():
        if name == ref_name:
            continue
        for k in sorted(set(ref) | set(t)):
            a, b = canon(ref.get(k)), canon(t.get(k))
            if (a is None) != (b is None) or (a is not None and a != b):
                out.append((k, "%s=%r" % (ref_name, a), "%s=%r" % (name, b)))
    return out


def test_EVERY_TABLE_IN_THE_SYSTEM_IS_PRESENT():
    """A source that quietly stops being compared is a drift nobody sees. This
    names the four rather than counting them, so losing one is a failure and not
    a smaller passing check."""
    ts = tables()
    if not ts.get("sleeper (authority)"):
        pytest.skip("UNCHECKED: no captured Sleeper settings to compare against")
    assert "league_config" in ts and "board artifact" in ts, sorted(ts)
    assert any(k.startswith("realized") for k in ts), (
        "no realized-points store — the comparison that matters most, between "
        "what we PRICE with and what we MEASURE with, is not being made: %s"
        % sorted(ts))
    assert len(ts["sleeper (authority)"]) > 20, (
        "the authority has only %d keys; that is not a league's scoring table"
        % len(ts["sleeper (authority)"]))


def test_the_COMPARISON_FIRES_on_a_planted_drift():
    """Proved before the real tables are called clean, because they ARE clean —
    a comparison that had stopped comparing would satisfy "no disagreements"
    perfectly.

    Both directions: a changed value and a MISSING key. The missing one matters
    because an absent rule scores as zero, which is itself a scoring decision.

    MUTATION: compare only the intersection of the key sets — the planted
    absence disappears and a half-configured league reads as agreeing."""
    ref = {"rec": 0.5, "pass_td": 6.0, "bonus_rec_te": 0.5}
    changed = disagreements({"sleeper (authority)": ref,
                             "x": {"rec": 1.0, "pass_td": 6.0, "bonus_rec_te": 0.5}})
    assert [d[0] for d in changed] == ["rec"], changed
    missing = disagreements({"sleeper (authority)": ref,
                             "x": {"rec": 0.5, "pass_td": 6.0}})
    assert [d[0] for d in missing] == ["bonus_rec_te"], missing


def test_THE_WHOLE_CHAIN_AGREES_WITH_THE_LEAGUE():
    """The assertion this file exists for.

    If this fails, do not adjust the table that disagrees until you know WHICH is
    right: Sleeper is the authority on what the league scores, but a realized
    store that disagrees means historical points were computed under the old
    rules and must be RE-SCORED, not relabelled."""
    ts = tables()
    if not ts.get("sleeper (authority)"):
        pytest.skip("UNCHECKED: no captured Sleeper settings to compare against")
    bad = disagreements(ts)
    assert not bad, (
        "the scoring tables in this system disagree — every projection, "
        "replacement level and backtest is priced in different units until this "
        "is resolved:\n%s" % "\n".join("  %-18s %s vs %s" % d for d in bad[:12]))


# ── THE OTHER LEAGUE FACT: WHAT A LEGAL LINEUP IS ──────────────────────────
#
# `roster_positions` decides which slots exist, therefore what the optimizer may
# fill, what VORP's replacement level is computed against, and — 15 slots x 10
# teams — that the draft is 150 picks deep. A drift here does not look like an
# error: it looks like a different league, answered confidently.
#
# Sleeper states it as a LIST with repeats (['QB','RB','RB',...]); we store it
# as counts. Comparing them means counting the list, not eyeballing it.

def roster_slots() -> dict:
    """The slot counts as each source states them, normalised to a count map."""
    out = {}
    sl = _load(SLEEPER)
    if sl is not None and sl.get("roster_positions"):
        counts = {}
        for slot in sl["roster_positions"]:
            counts[slot] = counts.get(slot, 0) + 1
        out["sleeper (authority)"] = counts
    cfg = _load(CONFIG)
    if cfg is not None and cfg.get("roster_slots"):
        out["league_config"] = dict(cfg["roster_slots"])
    board = _load(BOARD)
    if board is not None:
        rs = (board.get("league") or {}).get("roster_slots")
        if rs:
            out["board artifact"] = dict(rs)
    return out


def test_the_ROSTER_SLOT_COMPARISON_FIRES_on_a_planted_drift():
    """Proved before the real ones are called clean. An extra FLEX, or a missing
    one, is a different league — and both directions matter, because a slot we
    do not know about is one the optimizer will never fill.

    MUTATION: compare only the keys, not the counts — RB 2 against RB 3 passes,
    which is the exact drift most likely to happen and least likely to be seen."""
    ref = {"QB": 1, "RB": 2, "WR": 2, "FLEX": 1}
    assert [d[0] for d in disagreements(
        {"sleeper (authority)": ref, "x": dict(ref, RB=3)})] == ["RB"]
    assert [d[0] for d in disagreements(
        {"sleeper (authority)": ref, "x": {k: v for k, v in ref.items() if k != "FLEX"}})] == ["FLEX"]


def test_WHAT_A_LEGAL_LINEUP_IS_agrees_with_the_league():
    """QB 1, RB 2, WR 2, TE 1, FLEX 1, K 1, DEF 1, BN 6 — nine starters and
    fifteen slots, which is also why the draft runs fifteen rounds and 150 picks
    deep. If this disagrees, the optimizer, replacement level and the board's own
    depth are each answering a different league."""
    rs = roster_slots()
    if not rs.get("sleeper (authority)"):
        pytest.skip("UNCHECKED: no captured Sleeper roster_positions")
    assert "league_config" in rs and "board artifact" in rs, sorted(rs)
    bad = disagreements(rs)
    assert not bad, ("the roster slots disagree — the optimizer and the board are "
                     "built for different leagues:\n%s"
                     % "\n".join("  %-10s %s vs %s" % d for d in bad))
    total = sum(rs["sleeper (authority)"].values())
    starters = sum(v for k, v in rs["sleeper (authority)"].items() if k != "BN")
    assert (total, starters) == (15, 9), (total, starters)


def test_THE_DRAFT_IS_AS_DEEP_AS_THE_ROSTERS_ARE_WIDE():
    """The two facts have to multiply out. 15 slots x 10 teams = 150 picks, which
    is the board depth `draft_last_pick` reads and the number A's replay of three
    real drafts confirmed. A roster change that did not move the draft length —
    or the reverse — means one of them is stale."""
    rs = roster_slots()
    board = _load(BOARD)
    if not rs.get("sleeper (authority)") or board is None:
        pytest.skip("UNCHECKED: no authority or no board")
    lg = board.get("league") or {}
    teams, rounds = lg.get("teams"), lg.get("rounds")
    if teams is None or rounds is None:
        pytest.skip("UNCHECKED: the board does not state teams/rounds")
    slots = sum(rs["sleeper (authority)"].values())
    assert int(rounds) == slots, (
        "the draft runs %s rounds but a roster holds %d slots — one of them is "
        "stale, and the board's depth is wrong either way" % (rounds, slots))
    picks = int(teams) * int(rounds)
    po = (board.get("pick_order") or {}).get("picks") or []
    if po:
        assert len(po) == picks, (
            "pick_order carries %d rows; %s teams x %s rounds is %d"
            % (len(po), teams, rounds, picks))
