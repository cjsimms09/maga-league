"""The external replay harness's two guards, tested by trying to defeat them.

RULE 10 APPLIES HERE EXPLICITLY. Each guard below was deliberately broken once
and observed failing BY NAME before being trusted — a guard that has only ever
been seen passing is an untested claim about the future. The four failures that
made that a rule were all checks that looked fine until someone tried them.

The guards are worth this much care because both failures they prevent are
SILENT. A backtest that peeks at the future does not crash; it reports an edge
nobody can collect. And external observations minted under a superseded policy
do not error; they keep grading and keep reading like evidence about the live
tool.
"""
import re
import sys
from datetime import date
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "backtest"))

import external_replay as X  # noqa: E402
from asof import TimeTravelError  # noqa: E402


FP = "test-policy-fingerprint"


def store(draft_date="2025-08-20", snaps=None):
    # `snaps or [...]` would treat an EMPTY list as "not provided" and hand back
    # the defaults — which silently defeated the no-snapshot exclusion test.
    if snaps is None:
        snaps = [
            {"observed_at": "2025-08-01", "rows": [{"player_id": "1", "adp": 3.0}]},
            {"observed_at": "2025-08-18", "rows": [{"player_id": "1", "adp": 5.0}]},
        ]
    return X.ExternalAsOfStore("L1", draft_date, snaps, FP)


# ── F5: strictly before the draft ───────────────────────────────────────────
def test_board_uses_the_latest_snapshot_before_the_draft():
    assert store().snapshot_date() == date(2025, 8, 18)


def test_a_snapshot_taken_ON_draft_day_is_refused():
    """`<` not `<=`. A same-day snapshot may already contain the draft's picks,
    and ADP that has seen the draft it predicts is worthless in the exact way
    that looks like skill."""
    s = store(snaps=[{"observed_at": "2025-08-20", "rows": [{"player_id": "1", "adp": 99}]}])
    with pytest.raises(TimeTravelError):
        s.board()


def test_a_snapshot_taken_AFTER_the_draft_is_refused():
    s = store(snaps=[{"observed_at": "2025-09-01", "rows": [{"player_id": "1", "adp": 99}]}])
    with pytest.raises(TimeTravelError):
        s.board()


def test_post_draft_rows_never_leak_into_the_frozen_board():
    """The whole point, stated as one assertion: a league that HAS post-draft
    data still replays only on pre-draft data."""
    s = store(snaps=[
        {"observed_at": "2025-08-10", "rows": [{"player_id": "1", "adp": 4.0}]},
        {"observed_at": "2025-08-25", "rows": [{"player_id": "1", "adp": 1.0}]},
    ])
    assert [r["adp"] for r in s.board()] == [4.0]


def test_a_league_with_no_pre_draft_snapshot_is_EXCLUDED_not_backfilled():
    """F4: excluded whole. The temptation is to fall back to the nearest
    snapshot; that is the loosening the pre-registration forbids."""
    with pytest.raises(TimeTravelError):
        store(snaps=[]).board()


# ── earliest-timestamp-wins ─────────────────────────────────────────────────
def test_earliest_observation_wins_when_a_player_appears_twice():
    """A later revision may have been revised BECAUSE of news that also moved
    the draft, so the earliest observation is authoritative."""
    s = store(snaps=[{"observed_at": "2025-08-18", "rows": [
        {"player_id": "1", "adp": 5.0, "observed_at": "2025-08-17"},
        {"player_id": "1", "adp": 2.0, "observed_at": "2025-08-18"},
    ]}])
    assert [r["adp"] for r in s.board()] == [5.0]


def test_earliest_wins_regardless_of_row_order():
    """Order-independence matters: a provider that happens to emit the revision
    first must not win by arriving first."""
    s = store(snaps=[{"observed_at": "2025-08-18", "rows": [
        {"player_id": "1", "adp": 2.0, "observed_at": "2025-08-18"},
        {"player_id": "1", "adp": 5.0, "observed_at": "2025-08-17"},
    ]}])
    assert [r["adp"] for r in s.board()] == [5.0]


def test_an_unstamped_row_never_displaces_a_stamped_one():
    """'Unknown' must not win a recency argument."""
    s = store(snaps=[{"observed_at": "2025-08-18", "rows": [
        {"player_id": "1", "adp": 5.0, "observed_at": "2025-08-17"},
        {"player_id": "1", "adp": 2.0},
    ]}])
    assert [r["adp"] for r in s.board()] == [5.0]


def test_distinct_players_are_all_kept():
    s = store(snaps=[{"observed_at": "2025-08-18", "rows": [
        {"player_id": "1", "adp": 5.0}, {"player_id": "2", "adp": 7.0},
    ]}])
    assert len(s.board()) == 2


# ── timestamps are never guessed ────────────────────────────────────────────
@pytest.mark.parametrize("bad", [None, "", "not-a-date", 20250820, {}, "2025-13-45"])
def test_an_unusable_timestamp_raises_rather_than_being_coerced(bad):
    """The contamination rule IS a date comparison, so a value that does not
    really carry a date must never reach it."""
    with pytest.raises(TimeTravelError):
        X._as_date(bad)


def test_lead_days_reports_staleness_without_dropping():
    assert store().lead_days() == 2


# ── the policy drift guard ──────────────────────────────────────────────────
def test_fingerprint_is_derived_from_the_shipped_weights():
    """Not a constant, and not a second copy of the numbers: it must move when
    engine.js moves."""
    fp = X.policy_fingerprint()
    assert isinstance(fp, str) and len(fp) == 16


def test_fingerprint_changes_when_a_weight_changes(monkeypatch):
    import graduation_gate
    base = X.policy_fingerprint()
    real = graduation_gate.loaded_weights          # capture BEFORE patching, or
    monkeypatch.setattr(graduation_gate, "loaded_weights",   # the lambda recurses
                        lambda: dict(real(), tier=99.0))
    assert X.policy_fingerprint() != base


def test_observations_from_the_current_policy_pass():
    fp = X.policy_fingerprint()
    out = X.assert_policy_current([{"policy_fingerprint": fp}])
    assert out["observations"] == 1


def test_observations_from_a_SUPERSEDED_policy_are_refused():
    """The silent failure: they would otherwise keep grading and keep reading
    like evidence about the tool we ship."""
    with pytest.raises(X.PolicyDriftError):
        X.assert_policy_current([{"policy_fingerprint": "stale-fingerprint"}])


def test_drift_error_names_both_policies_so_the_fix_is_obvious():
    with pytest.raises(X.PolicyDriftError) as e:
        X.assert_policy_current([{"policy_fingerprint": "stale-fingerprint"}])
    msg = str(e.value)
    assert "stale-fingerprint" in msg and X.policy_fingerprint() in msg
    assert "re-replay" in msg


def test_an_observation_with_no_fingerprint_is_refused():
    """Missing provenance is not a pass. An unstamped observation is exactly as
    unattributable as a stale one."""
    with pytest.raises(X.PolicyDriftError):
        X.assert_policy_current([{"payload": {}}])


# ── the forecast contract ───────────────────────────────────────────────────
def _src(name):
    return (HERE.parent.parent / "src" / name).read_text()


def test_emitted_kinds_match_the_home_ledger():
    """One grader serves both samples, so the schema cannot diverge. Read from
    src/predledger.js rather than restated — restating it from memory is how the
    first cut of this module invented 'survival' and 'room_seat' as KINDS when
    they are an ftype and a key prefix."""
    kinds = re.search(r"const KINDS = \[(.*?)\];", _src("predledger.js"), re.S).group(1)
    for kind in X.FORECAST_KINDS:
        assert f"'{kind}'" in kinds, f"{kind} is not a home ledger kind"


def test_emitted_ftypes_match_the_home_ledger():
    types = re.search(r"const FORECAST_TYPES = \[(.*?)\];", _src("predledger.js"), re.S).group(1)
    for t in X.FORECAST_TYPES:
        assert f"'{t}'" in types, f"{t} is not a home ledger ftype"


def test_an_unknown_ftype_is_refused():
    with pytest.raises(ValueError):
        X.emit_forecast(store(), "k", "vibes", 1, "rule")


def test_a_probability_outside_0_1_is_refused():
    with pytest.raises(ValueError):
        X.emit_forecast(store(), "k", "probability", 1.4, "rule")


def test_a_forecast_with_no_resolution_rule_is_refused():
    """Without a pre-stated rule the outcome can be reinterpreted after the
    fact, which is exactly how a null becomes a success."""
    with pytest.raises(ValueError):
        X.emit_forecast(store(), "k", "probability", 0.4, "")


def test_a_forecast_with_no_value_is_refused():
    with pytest.raises(ValueError):
        X.emit_forecast(store(), "k", "probability", None, "rule")


def _fc(**kw):
    args = dict(key="room_seat:r1p7", ftype="probability", value=0.4,
                resolution_rule="who actually went at that overall pick")
    args.update(kw)
    return X.emit_forecast(store(), **args)


def test_every_observation_is_labelled_external():
    """Rule 1 labelling at the RECORD level: an external observation must never
    be mistakable for a home one inside an aggregate."""
    assert _fc()["sample"] == "external"


def test_every_observation_carries_its_provenance():
    rec = _fc()
    assert rec["board_asof"] == "2025-08-18"
    assert rec["draft_date"] == "2025-08-20"
    assert rec["policy_fingerprint"] == FP
    assert rec["payload"]["resolution_rule"]
