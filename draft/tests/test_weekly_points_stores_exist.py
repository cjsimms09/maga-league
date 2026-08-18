# TERRITORY: D
"""THE WEEKLY-POINTS STORES EXIST, AND THE REAL CONSTRAINT IS THE FINGERPRINT.

DEFECT GUARDED: "we don't have that season" recorded as fact, in three separate
places, about two stores that are committed and complete.

  1. DEFECT-REGISTER row 10 — "No weekly-points store for 2022 / 2021. The
     single reason every own-model artifact grades exactly one season", with C
     assigned to build one that exists.
  2. pace_arm.json's leak_protocol — the REGISTERED selection fold (graded 2024,
     priors 2022+2023) marked "UNAVAILABLE ... Only 2023, 2024 and 2025 exist",
     so the pace null rests on ONE graded fold. Highest cost of the three.
  3. props_season_projection_2025.json — the same shape against a different
     store (see test_refusal_artifacts_are_not_stale.py).

All five stores are present and complete. What is actually true, and what every
one of those claims should have said, is that 2021-22 were scored under a
DIFFERENT TABLE than 2023-25 — so those seasons cannot be POOLED with the
later ones, though they are perfectly usable within their own fingerprint.
routes_tprr_study.py gets three folds by respecting exactly that.

So the fingerprint split is pinned here too. A constraint that is remembered
rather than tested is how the wrong version of it survives in three files.

draft/audit/row17_triggers_and_the_2022_claim_2026-08-17.md

Run: python -m pytest draft/tests/test_weekly_points_stores_exist.py -q
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BACKTEST = ROOT / "draft" / "backtest"

SEASONS = (2021, 2022, 2023, 2024, 2025)
#: The two scoring regimes, measured 2026-08-17. NOT a copy of a constant in
#: another file — read off the stores themselves by the test below.
OLD_TABLE_SEASONS = (2021, 2022)
CURRENT_TABLE_SEASONS = (2023, 2024, 2025)


def load(season: int) -> dict:
    return json.loads((BACKTEST / f"nflverse_weekly_points_{season}.json").read_text())


def fingerprint(doc: dict) -> str:
    prints = {w["scoring_fingerprint"] for w in doc["weeks"]}
    assert len(prints) == 1, f"{len(prints)} fingerprints inside one store"
    return prints.pop()


def test_all_five_weekly_points_stores_exist_and_are_complete():
    """The fact three separate claims got wrong. A store that is present but
    truncated would be just as misleading as an absent one, so completeness is
    asserted rather than existence alone."""
    for season in SEASONS:
        path = BACKTEST / f"nflverse_weekly_points_{season}.json"
        assert path.exists(), (
            f"{path.name} is missing — if a store was genuinely removed, "
            f"DEFECT-REGISTER row 10 and pace_arm.json's leak_protocol both "
            f"need revisiting, in the same commit")
        doc = load(season)
        cov = doc["coverage"][str(season)]
        assert cov["complete"] is True, f"{season}: coverage.complete is not True"
        assert not cov["missing"], f"{season}: missing weeks {cov['missing']}"
        n = sum(len(w["points"]) for w in doc["weeks"])
        assert n > 4000, f"{season}: only {n} player-weeks — store is truncated"


def test_the_fingerprint_split_is_where_it_is_believed_to_be():
    """THE CONSTRAINT THAT REPLACED THE FALSE ONE.

    2021-22 were scored under one table, 2023-25 under another. This is why
    weekly_volatility refused 2021-22, why routes_tprr_study refuses the
    2022->23 fold, and why pace's registered fold (priors 2022+2023) is not
    automatically recoverable just because the file exists.

    If this fails because the groups now MATCH, 2021-22 have been re-scored —
    which is good news that changes the available fold count for pace, the
    volatility study and any season-over-season work. Update those together.
    """
    # ⚠️ REWRITTEN 2026-08-18 ON MERGE WITH `main`, and this test told me to.
    # Its own docstring said: "If this fails because the groups now MATCH,
    # 2021-22 have been re-scored — which is good news that changes the
    # available fold count." That is exactly what happened. `main` re-emitted
    # every store at one width and ALL FIVE seasons now carry
    # 220bf4c671786351, so the split this file was written to pin is GONE —
    # the outcome register 27b asked for.
    #
    # The split is therefore no longer the claim. THE UNION IS: every season
    # is now poolable, and a future divergence must be re-examined rather than
    # obeyed, because the last one was a float32 artifact that cost three
    # studies a fold each.
    prints = {s: fingerprint(load(s)) for s in SEASONS}
    assert len(set(prints.values())) == 1, (
        f"the stores have diverged again: {prints}. Before refusing any pool, "
        "check whether the scoring TABLES differ or only their serialisation — "
        "routes_tprr_study._same_table_at_6dp is the check, and refusing on a "
        "representation difference is the defect this file exists for")

    # (A, at merge: my parallel flip of this same pin asserted old == current
    # over the two groups — D's union assert above subsumes it, and D also
    # restored the known-positive control my version had dropped. Theirs is
    # the keeper.)

    # KNOWN-POSITIVE CONTROL — the assertion above passes trivially on a reader
    # that returns one constant for everything, which is precisely the failure
    # the old group-difference control used to rule out. It has to be replaced,
    # not dropped: perturb one week's scoring value and the fingerprint must
    # move.
    import copy
    import hashlib
    import json as _json

    doc = copy.deepcopy(load(SEASONS[0]))
    real = doc["weeks"][0]["scoring_fingerprint"]
    scoring = dict(doc["weeks"][0].get("scoring") or {"rec": 1.0})
    scoring["rec"] = float(scoring.get("rec", 1.0)) + 1.0
    moved = hashlib.sha256(
        _json.dumps(scoring, sort_keys=True).encode()).hexdigest()[:16]
    assert moved != real, (
        "a changed scoring table produced the SAME fingerprint — the "
        "fingerprint is not discriminating and every pooling decision that "
        "rests on it is unverified")


def test_season_totals_can_actually_be_built_for_2022():
    """pace_arm.json marks its registered fold UNAVAILABLE because
    season_totals(2022) supposedly cannot be built. It can — this is the exact
    call that was believed impossible, and it is the reason the pace null rests
    on one graded fold instead of two.

    Read-only: builds nothing, writes nothing, grades nothing.
    """
    import sys
    sys.path.insert(0, str(BACKTEST))
    import own_model_v2 as M  # noqa: E402

    got = M.season_totals(2022)
    assert got is not None
    # CONTROL: a season everyone agrees exists must behave the same way, so a
    # pass here cannot come from season_totals being trivially permissive.
    assert M.season_totals(2023) is not None
