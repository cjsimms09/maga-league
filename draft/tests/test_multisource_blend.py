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
ROOT = HERE.parent.parent
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


def test_DEF_keeps_our_exact_mean_and_still_gains_the_dispersion(tmp_path):
    """THE PUBLISH GATE FOUND THIS, and it is the reason the rule exists.

    For DEF the board's `proj_mean` is not an estimate — it is our own component
    line scored exactly under this league's table, and
    `test_all_32_sweep_correction_is_exactly_the_td_components` pins that
    identity. The first blended board overwrote it (ARI 80.0 -> 87.2, DEF
    replacement 103.0 -> 108.05) and CI refused to publish, correctly.

    Both halves are asserted, because keeping only the first would let someone
    "fix" this by dropping DEF from the blend entirely — which would throw away
    the dispersion that our own pipeline structurally cannot produce.
    """
    players = [{"player_id": str(i), "name": f"D{i}", "position": "DEF",
                "proj_mean": 100.0, "years_exp": 5} for i in range(40)]
    src = {str(i): {"by_source": {"CBS": 120.0 + i, "ESPN": 110.0}} for i in range(40)}
    MS.apply_multisource(players, store_path=_store(tmp_path, src))
    for p in players:
        assert p["proj_mean"] == 100.0, "DEF mean must stay first-party"
        assert "proj_mean_sleeper_only" not in p
        assert "proj_mean_source" not in p
        # ...and the band is still real, and still centred on OUR mean
        assert p["proj_sd_source"] == "cross-source-disagreement"
        assert p["proj_floor"] < 100.0 < p["proj_ceiling"]
    ratios = {round(p["proj_sd"] / p["proj_mean"], 4) for p in players}
    assert len(ratios) > 20, (
        "DEF dispersion collapsed to a constant — that is the defect this "
        "replaces (all 32 defences once shared one ratio, 0.380)")


def test_a_skill_position_still_takes_the_blended_mean(tmp_path):
    """The known-negative control for the rule above: if the DEF carve-out ever
    widens to everything, the blend is inert and this test says so."""
    players = [{"player_id": str(i), "name": f"W{i}", "position": "WR",
                "proj_mean": 100.0, "years_exp": 5} for i in range(40)]
    src = {str(i): {"by_source": {"CBS": 120.0, "ESPN": 110.0}} for i in range(40)}
    MS.apply_multisource(players, store_path=_store(tmp_path, src))
    assert all(p["proj_mean_source"] == "multisource-mean-2026" for p in players)
    assert all(p["proj_mean_sleeper_only"] == 100.0 for p in players)
    assert all(p["proj_mean"] == 110.0 for p in players)


def test_KEEPERS_ARE_IN_THE_JOIN_UNIVERSE():
    """Register 80. `build.py` moves kept players OUT of `players` and into
    `kept_players`, so a capture that joins over `board["players"]` alone can
    never match a keeper — and on 2026-08-19 that silently left Cory's entire
    keeper slate (Derrick Henry, Ja'Marr Chase, Kenneth Walker) on Sleeper-only
    projections while the rest of the board was blended, with their VORP
    computed against a replacement level that HAD moved.

    The capture's own `unmatched` diagnostic named two of them the whole time.
    Nobody read it, so this asserts it instead.
    """
    src = (ROOT / "draft" / "tools" / "multisource_projections.py").read_text()
    assert 'board.get("kept_players")' in src, (
        "the multisource join no longer reads kept_players — keepers are "
        "excluded from board['players'] by construction, so this drops every "
        "kept player out of the store without erroring")
    # both join paths, not just the first: the name index AND the Sleeper
    # comparison universe both walk the board and both were wrong.
    assert src.count('board.get("kept_players")') >= 2, (
        "only one of the two board walks includes kept_players — the other "
        "will report a coverage or agreement figure computed over a different "
        "population than the one it blended")


def test_a_board_with_kept_players_blends_them(tmp_path):
    """The behavioural half: a keeper present in the store must be blended like
    anyone else. Guards against a 'fix' that reads kept_players and then drops
    them somewhere downstream."""
    players = _board(40)
    keeper = {"player_id": "999", "name": "Kept Man", "position": "WR",
              "proj_mean": 100.0, "years_exp": 5, "is_keeper": True}
    src = {str(i): {"by_source": {"CBS": 110.0, "ESPN": 110.0}} for i in range(40)}
    src["999"] = {"by_source": {"CBS": 110.0, "ESPN": 110.0}}
    MS.apply_multisource(players + [keeper], store_path=_store(tmp_path, src))
    # mean(CBS 110, ESPN 110, Sleeper 100) = 106.67 — Sleeper is an OPINION in
    # the average, not a thing the blend replaces, so the expected value is not
    # the scrapers' own mean. (My first version of this test asserted 110.0 and
    # failed on correct code.)
    assert keeper["proj_mean"] == pytest.approx(106.67, abs=0.01), (
        "a kept player in the store was not blended — keepers must be priced "
        "on the same basis as the pool their VORP is measured against")
    assert keeper["proj_mean_source"] == "multisource-mean-2026"
    assert keeper["proj_mean_sleeper_only"] == 100.0
