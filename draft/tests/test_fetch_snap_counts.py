# TERRITORY: A
"""The snap-count fetcher's REFUSALS, which are the part worth testing.

Fetching is not the risk here — a broken fetch is loud. The risk is a fetch that
SUCCEEDS PARTIALLY and writes a store that looks complete, because the reader
then cannot tell "he had no snaps" from "our join lost him". Those are different
facts, one of them is the whole reason this feed exists, and no amount of
downstream care recovers the distinction once it has been merged.

So these tests pin the three places the module says no:
  1. a season whose join rate falls below MIN_JOIN_RATE is refused, not written
  2. a player-week with no `offense_snaps` is omitted, never written as zero
  3. a season nflverse has not published yet is NOT an error

(3) is easy to get wrong in the other direction. The weekly job runs from now
through the season and there is no snap_counts_2026.csv until week 1, so
"not published" must exit green — but a genuine failure must still go red, or
the job silently stops capturing and reports success while doing it.
"""
from __future__ import annotations

import json
import os
import urllib.error

import pytest

from draft.backtest import fetch_snap_counts as F


def _row(pfr, week, pos="WR", snaps="40", pct="0.60"):
    return {"pfr_player_id": pfr, "week": str(week), "position": pos,
            "offense_snaps": snaps, "offense_pct": pct}


# A crosswalk where p1/p2/p3 resolve and p_lost does not, so join loss is real
# rather than simulated by deleting rows.
XW_GSIS = {"p1": "g1", "p2": "g2", "p3": "g3", "p_lost": "g_lost"}
XW_SLEEP = {"g1": "s1", "g2": "s2", "g3": "s3"}


def test_absent_snaps_are_omitted_never_written_as_zero(monkeypatch):
    """"Did not play" and "played zero offensive snaps" are different facts and
    only one of them is a fact this feed can assert. A zero here would be an
    invented observation, and it would land in exactly the population — deep,
    intermittently-used players — the volatility measure is most sensitive to."""
    rows = [_row("p1", 1, snaps="55"), _row("p1", 2, snaps=""), _row("p1", 3, snaps="0")]
    monkeypatch.setattr(F, "season_rows", lambda season: rows)
    doc = F.build_season(2024, XW_GSIS, XW_SLEEP)

    assert doc["weeks"][1]["s1"]["snaps"] == 55.0
    assert 2 not in doc["weeks"], "a blank offense_snaps must vanish, not become 0"
    # ... while a genuine, reported zero is KEPT. The distinction only means
    # something if the real zero survives.
    assert doc["weeks"][3]["s1"]["snaps"] == 0.0


def test_join_loss_is_reported_per_hop_rather_than_summarised(monkeypatch):
    """A single "join rate 82%" cannot be acted on. Knowing the loss is at
    pfr->gsis (nflverse's own crosswalk) versus gsis->sleeper (our id mapping)
    points at two different fixes, so the accounting keeps them apart."""
    rows = [_row("p1", 1), _row("p_lost", 1), _row("p_nogsis", 1)]
    monkeypatch.setattr(F, "season_rows", lambda season: rows)
    j = F.build_season(2024, XW_GSIS, XW_SLEEP)["join"]

    assert j["distinct_pfr_ids"] == 3
    assert j["lost_at_pfr_to_gsis"] == 1       # p_nogsis: not in players.csv
    assert j["lost_at_gsis_to_sleeper"] == 1   # p_lost: has gsis, no sleeper id
    assert j["resolved_to_sleeper"] == 1
    # 4dp is the field's declared precision, not an accident — assert at it.
    assert j["join_rate"] == pytest.approx(1 / 3, abs=1e-4)


def test_a_season_below_the_join_floor_is_refused_and_writes_nothing(monkeypatch, tmp_path):
    """THE CENTRAL REFUSAL. A partial store that looks whole is worse than no
    store, so a bad join must produce a non-zero exit AND an empty directory —
    a warning printed next to a written file would be ignored within a week."""
    rows = [_row(f"p_bad{i}", 1) for i in range(10)] + [_row("p1", 1)]
    monkeypatch.setattr(F, "season_rows", lambda season: rows)
    monkeypatch.setattr(F, "crosswalk", lambda: (XW_GSIS, XW_SLEEP))
    monkeypatch.setattr(F, "HERE", tmp_path)
    monkeypatch.setattr("sys.argv", ["f", "--seasons", "2024"])

    assert F.main() == 1, "a refused season must not exit green"
    assert list(tmp_path.glob("snap_counts_*.json")) == [], "refusal must write nothing"


def test_a_healthy_season_is_written_with_its_accounting(monkeypatch, tmp_path):
    """The other side of the refusal: a good join writes, and the store carries
    the join numbers with it so a later reader can re-check the population
    without re-running the fetch."""
    rows = [_row(p, w) for p in ("p1", "p2", "p3") for w in range(1, 6)]
    monkeypatch.setattr(F, "season_rows", lambda season: rows)
    monkeypatch.setattr(F, "crosswalk", lambda: (XW_GSIS, XW_SLEEP))
    monkeypatch.setattr(F, "HERE", tmp_path)
    monkeypatch.setattr("sys.argv", ["f", "--seasons", "2024"])

    assert F.main() == 0
    doc = json.loads((tmp_path / "snap_counts_2024.json").read_text())
    assert doc["join"]["join_rate"] == 1.0
    assert doc["_note"], "the store must explain itself to a reader who lacks this file"


def test_check_mode_reports_without_writing(monkeypatch, tmp_path):
    """--check exists so the join can be verified BEFORE any store lands. If it
    wrote, it would be the thing it is meant to guard against."""
    rows = [_row(p, w) for p in ("p1", "p2", "p3") for w in range(1, 6)]
    monkeypatch.setattr(F, "season_rows", lambda season: rows)
    monkeypatch.setattr(F, "crosswalk", lambda: (XW_GSIS, XW_SLEEP))
    monkeypatch.setattr(F, "HERE", tmp_path)
    monkeypatch.setattr("sys.argv", ["f", "--seasons", "2024", "--check"])

    assert F.main() == 0
    assert list(tmp_path.glob("*.json")) == []


def test_an_unpublished_season_is_green_but_a_real_failure_is_not(monkeypatch, tmp_path):
    """Before week 1 there is no file for the current season, and the weekly job
    must not go red for it — a job that is red every week until September is a
    job we stop reading. But the escape hatch must be NARROW: a 500, a timeout,
    anything that is not "not published", still fails.
    """
    monkeypatch.setattr(F, "crosswalk", lambda: (XW_GSIS, XW_SLEEP))
    monkeypatch.setattr(F, "HERE", tmp_path)
    monkeypatch.setattr("sys.argv", ["f", "--seasons", "2026"])

    def not_published(season):
        raise F.NotPublished(f"no snap_counts_{season}.csv yet")

    monkeypatch.setattr(F, "season_rows", not_published)
    assert F.main() == 0, "an unpublished season is the expected pre-season state"
    assert list(tmp_path.glob("*.json")) == []

    def server_error(season):
        raise urllib.error.HTTPError("u", 500, "boom", {}, None)

    monkeypatch.setattr(F, "season_rows", server_error)
    with pytest.raises(urllib.error.HTTPError):
        F.main()


def test_volatility_needs_enough_weeks_to_mean_anything(monkeypatch):
    """A week-to-week sd computed on three weeks is noise about noise, and it
    would land hardest on exactly the deep, intermittent players whose apparent
    volatility is most tempting to over-read. Four is the declared floor."""
    doc = {"weeks": {w: {"s1": {"snaps": 10, "pct": 0.1 * w}} for w in (1, 2, 3)}}
    assert F.season_share_volatility(doc) == {}

    doc["weeks"][4] = {"s1": {"snaps": 10, "pct": 0.4}}
    out = F.season_share_volatility(doc)
    assert out["s1"]["weeks"] == 4 and out["s1"]["sd_pct"] > 0


def test_volatility_ignores_weeks_with_no_share_rather_than_calling_them_zero(monkeypatch):
    """The absent-is-absent rule again, one layer up. A None pct counted as 0.0
    would manufacture volatility for a player who simply was not reported —
    inventing the exact signal this feed was built to measure."""
    weeks = {1: {"s1": {"snaps": 10, "pct": 0.5}}, 2: {"s1": {"snaps": 10, "pct": None}},
             3: {"s1": {"snaps": 10, "pct": 0.5}}, 4: {"s1": {"snaps": 10, "pct": 0.5}},
             5: {"s1": {"snaps": 10, "pct": 0.5}}}
    out = F.season_share_volatility({"weeks": weeks})
    assert out["s1"]["weeks"] == 4, "the None week must be skipped, not zeroed"
    assert out["s1"]["sd_pct"] == 0.0, "a steady player must not be given volatility"


def test_the_join_floor_is_high_enough_to_be_worth_having():
    """A floor set low enough to never trigger is decoration.

    THIS TEST USED TO ASSERT `>= 0.70` AND GET THE ARGUMENT BACKWARDS. Its own
    docstring said the floor "has real headroom below current reality" — 0.70
    against observed rates of 0.971-0.992 is not headroom, it is twenty-seven
    points of slack in which the two-hop crosswalk could lose a quarter of the
    league and still write a green store. The test named the right invariant and
    then asserted the bound that violates it.

    Pinned against the STORED RATES rather than a literal, so it keeps meaning
    the same thing as the data moves: the floor must sit below every season we
    actually have (or the fetcher would refuse its own history) and within a
    short distance of the worst of them (or it cannot fire before the store
    becomes misleading).
    """
    import glob
    BACKTEST = os.path.join(os.path.dirname(os.path.dirname(
        os.path.abspath(__file__))), "backtest")
    rates = []
    for path in sorted(glob.glob(os.path.join(BACKTEST, "snap_counts_*.json"))):
        rates.append(json.load(open(path))["join"]["join_rate"])
    assert rates, "no stored seasons to check the floor against"
    worst = min(rates)

    assert F.MIN_JOIN_RATE < worst, (
        f"floor {F.MIN_JOIN_RATE} would refuse a season we already store "
        f"(worst observed {worst})")
    assert worst - F.MIN_JOIN_RATE <= 0.10, (
        f"floor {F.MIN_JOIN_RATE} is {worst - F.MIN_JOIN_RATE:.3f} below the "
        f"worst observed season ({worst}). A guard that far from reality cannot "
        f"fire before the store stops being trustworthy.")
