# TERRITORY: A
"""The multi-source blend's refusals are the product — pin them.

Every test here is for a case where the module must DECLINE. The applying path
is easy and was right the first time; what was wrong the first time was the
absence of these gates, and a gate with no test is a comment.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

import multisource_blend as MS  # noqa: E402


def _store(tmp_path: Path, players: dict) -> Path:
    p = tmp_path / "ms.json"
    p.write_text(json.dumps({"sources_used": ["CBS", "ESPN", "FFToday"],
                             "players": players}))
    return p


def _board(n: int = 40, base: float = 100.0) -> list[dict]:
    return [{"player_id": str(i), "name": f"P{i}", "position": "WR",
             "proj_mean": base, "years_exp": 3} for i in range(n)]


def test_absent_store_leaves_the_board_untouched():
    players = _board()
    diag = MS.apply_multisource(players, store_path=Path("/nonexistent/x.json"))
    assert diag["applied"] is False
    assert "multi-source store absent" in diag["reason"]
    assert all("proj_mean_sleeper_only" not in p for p in players)


def test_thin_coverage_refuses_rather_than_half_applying(tmp_path):
    """A blend reaching a fraction of the board is worse than none: nothing
    downstream can tell a blended player from an unblended one."""
    players = _board(100)
    src = {str(i): {"by_source": {"CBS": 100.0, "ESPN": 100.0}} for i in range(5)}
    diag = MS.apply_multisource(players, store_path=_store(tmp_path, src))
    assert diag["applied"] is False
    assert "below the" in diag["reason"]
    assert all(p["proj_mean"] == 100.0 for p in players)


def test_incoherent_sources_are_declined_not_averaged(tmp_path):
    """THE REGRESSION THIS FILE EXISTS FOR. Sleeper 2.5 against CBS 86 is not a
    disagreement about performance, it is a disagreement about whether the man
    plays. Averaging produced a number no source believed and moved late-board
    players up to 80 places within their position."""
    players = _board(40)
    players[0]["proj_mean"] = 2.5
    src = {str(i): {"by_source": {"CBS": 100.0, "ESPN": 100.0}} for i in range(40)}
    src["0"] = {"by_source": {"CBS": 86.0, "ESPN": 65.0}}
    diag = MS.apply_multisource(players, store_path=_store(tmp_path, src))
    assert diag["applied"] is True
    # the coherent 39 moved; the 34x-spread player did not
    assert players[0]["proj_mean"] == 2.5
    assert "proj_mean_source" not in players[0]
    assert players[1]["proj_mean_source"] == "multisource-mean-2026"
    assert diag["skipped_incoherent"] + diag["skipped_below_role_floor"] == 1


def test_a_coherent_spread_just_under_the_bound_still_blends(tmp_path):
    """The known-POSITIVE control for the gate above. A gate that declines
    everything would pass the refusal tests and be useless (rule 3e), so the
    boundary is pinned from both sides."""
    players = _board(40)
    players[0]["proj_mean"] = 60.0
    src = {str(i): {"by_source": {"CBS": 100.0, "ESPN": 100.0}} for i in range(40)}
    src["0"] = {"by_source": {"CBS": 110.0, "ESPN": 100.0}}   # 110/60 = 1.83 < 2.0
    diag = MS.apply_multisource(players, store_path=_store(tmp_path, src))
    assert diag["skipped_incoherent"] == 0
    assert players[0]["proj_mean_source"] == "multisource-mean-2026"
    assert players[0]["proj_mean_sleeper_only"] == 60.0


def test_rookie_bloc_veto_still_refuses(tmp_path):
    """The test that refused the 2026-08-16 attempt, kept executable. Rookies
    are pushed one way and veterans the other; the permutation must see it.

    THE FIXTURE HAS WITHIN-BLOC SPREAD ON PURPOSE, and the first version of this
    test did not — two perfectly constant blocs give a permutation test NO
    POWER (almost every 30/30 reshuffle of 30 highs and 30 lows reproduces the
    observed median gap, so p -> 1) and the veto did not fire. That is a
    property of the method, not a bug in it, but it means this test would have
    passed a module whose veto was wired to nothing had I asserted the other
    way. Real shift distributions are continuous; this fixture is too.
    """
    players = []
    for i in range(60):
        rookie = i < 30
        players.append({"player_id": str(i), "name": f"P{i}", "position": "WR",
                        "proj_mean": 100.0, "years_exp": 0 if rookie else 5})
    src = {}
    for i in range(60):
        # rookies drift up ~+25-35%, veterans sit within a few % of Sleeper —
        # both spread out, and both inside the coherence gate's 2x bound.
        v = (125.0 + (i % 11)) if i < 30 else (99.0 + (i % 7) * 0.5)
        src[str(i)] = {"by_source": {"CBS": v, "ESPN": v + (i % 3)}}
    diag = MS.apply_multisource(players, store_path=_store(tmp_path, src))
    assert diag["applied"] is False
    assert "ROOKIE-BLOC VETO" in diag["reason"]
    assert all(p["proj_mean"] == 100.0 for p in players)


def test_dispersion_comes_from_the_spread_and_never_from_a_constant(tmp_path):
    """The half of this change that our own pipeline structurally cannot
    produce: 31 distinct dispersion values for 31 defences, where
    fetch_component_stats.py's K/DST exclusion leaves one shared ratio."""
    players = _board(40)
    src = {}
    for i in range(40):
        src[str(i)] = {"by_source": {"CBS": 100.0 + i, "ESPN": 100.0 - i * 0.5}}
    MS.apply_multisource(players, store_path=_store(tmp_path, src))
    blended = [p for p in players if p.get("proj_sd_source")]
    assert len(blended) > 30
    ratios = {round(p["proj_sd"] / p["proj_mean"], 4) for p in blended}
    assert len(ratios) > 20, "dispersion collapsed to a constant — the defect this replaces"
    for p in blended:
        assert p["proj_floor"] < p["proj_mean"] < p["proj_ceiling"]
        assert p["proj_floor"] >= 0.0


def test_the_permutation_is_seeded_so_a_build_cannot_flip_its_own_verdict():
    a = [0.1 * (i % 7) for i in range(40)]
    b = [0.1 * (i % 5) for i in range(40)]
    assert MS._permutation_p(a, b) == MS._permutation_p(a, b)


def test_too_few_opinions_is_left_alone(tmp_path):
    """One scraper plus Sleeper is not a consensus. Absent stays absent — the
    board never fabricates a peer to reach the threshold."""
    players = _board(40)
    src = {str(i): {"by_source": {"CBS": 120.0}} for i in range(40)}
    diag = MS.apply_multisource(players, store_path=_store(tmp_path, src))
    assert diag["applied"] is False       # coverage 0 -> refuses
    assert all(p["proj_mean"] == 100.0 for p in players)
