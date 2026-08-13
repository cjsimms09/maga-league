# TERRITORY: C
"""EVERY POINT IN THIS SYSTEM IS SCORED WITH THE SAME TABLE, OR NONE OF IT MEANS
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
