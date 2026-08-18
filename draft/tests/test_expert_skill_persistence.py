"""The gate must be able to say BOTH things, or it is not a gate.

If this harness cannot detect real persistence when it is planted, a "no persistence"
verdict means nothing — the same known-positive discipline the ceiling probe needed.
And if it cannot report NO persistence on pure noise, it is a rubber stamp.
"""
import random
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backtest"))

import expert_skill_persistence as E  # noqa: E402


def _players(n_players=60, n_experts=40, seed=1, skilled=()):
    """Synthetic season. `skilled` experts rank players close to true ability; the
    rest rank at random. Realized points follow true ability."""
    rnd = random.Random(seed)
    truth = {f"P{i}": 100 - i for i in range(n_players)}      # P0 best
    names = list(truth)
    players = []
    order_by_expert = {}
    for e in range(n_experts):
        eid = str(e)
        if eid in skilled:
            noise = 3.0
        else:
            noise = 500.0
        scored = sorted(names, key=lambda nm: -(truth[nm] + rnd.gauss(0, noise)))
        order_by_expert[eid] = {nm: i + 1 for i, nm in enumerate(scored)}
    for nm in names:
        players.append({"name": nm,
                        "expert_ranks": {e: order_by_expert[e][nm]
                                         for e in order_by_expert}})
    realized = {nm: float(truth[nm]) for nm in names}
    return players, realized


def _ident(name):
    return name


def test_KNOWN_POSITIVE_a_genuinely_skilled_expert_scores_above_a_random_one():
    """The control. If a planted skill difference is invisible here, every verdict
    this file produces is worthless."""
    players, realized = _players(skilled={"0", "1", "2"})
    got = E.score_experts(players, realized, _ident)["experts"]
    skilled = st_mean([got[e]["skill"] for e in ("0", "1", "2")])
    rest = st_mean([v["skill"] for k, v in got.items() if k not in ("0", "1", "2")])
    assert skilled > rest + 0.3, (skilled, rest)


def st_mean(xs):
    return sum(xs) / len(xs)


def test_skill_is_signed_so_that_HIGHER_IS_BETTER():
    """A raw Spearman between rank number and points is NEGATIVE for a good expert.
    A sign slip here would invert the entire study and still produce a tidy number."""
    players, realized = _players(skilled={"0"})
    got = E.score_experts(players, realized, _ident)["experts"]
    assert got["0"]["skill"] > 0, "the best expert must score POSITIVE"


def test_PLANTED_PERSISTENCE_IS_DETECTED():
    """Same experts skilled in both seasons -> the gate must see it."""
    skilled = {str(i) for i in range(12)}
    s1, r1 = _players(seed=1, skilled=skilled)
    s2, r2 = _players(seed=2, skilled=skilled)
    scored = {2024: E.score_experts(s1, r1, _ident),
              2025: E.score_experts(s2, r2, _ident)}
    rows = E.persistence(scored)
    assert rows[0]["rho"] is not None and rows[0]["rho"] > 0.4, rows
    assert "PASSED" in E.verdict(rows) or "MARGINAL" in E.verdict(rows), E.verdict(rows)


def test_PURE_NOISE_REPORTS_NO_PERSISTENCE_rather_than_a_flattering_number():
    """The other half. Nobody is skilled in either season, so the gate must FAIL."""
    s1, r1 = _players(seed=11, skilled=set())
    s2, r2 = _players(seed=22, skilled=set())
    scored = {2024: E.score_experts(s1, r1, _ident),
              2025: E.score_experts(s2, r2, _ident)}
    rows = E.persistence(scored)
    assert abs(rows[0]["rho"] or 0) < 0.3, rows
    assert "FAILED" in E.verdict(rows) or "MARGINAL" in E.verdict(rows), E.verdict(rows)


def test_a_ranked_player_with_no_realized_points_is_scored_ZERO_not_dropped():
    """Dropping him would score every expert only on the players who worked out,
    which flatters everyone and erases the downside half of judgement."""
    players, realized = _players(n_players=30, n_experts=10, skilled={"0"})
    del realized["P29"]                       # the bust
    out = E.score_experts(players, realized, _ident)
    assert out["population"]["scored_zero_no_realized_points"] == 1
    assert out["population"]["joined"] == 30, "the bust must still be scored"


def test_unjoinable_names_are_counted_and_excluded_identically_for_every_expert():
    players, realized = _players(n_players=30, n_experts=10)
    out = E.score_experts(players, realized, lambda n: None if n == "P5" else n)
    assert out["population"]["unjoined_names"] == 1
    assert out["population"]["joined"] == 29


def test_the_common_set_makes_a_deep_ranker_comparable_to_a_shallow_one():
    """§9's second null. Without this an expert ranking the long tail is scored on a
    noisier population and looks worse for reasons unrelated to judgement."""
    players, realized = _players(n_players=50, n_experts=20)
    # one expert ranks only the top 10
    for p in players[10:]:
        p["expert_ranks"].pop("0", None)
    pool, n_exp = E.common_set(players)
    assert n_exp == 20
    assert len(pool) == 50, "players are common; it is the EXPERT who is shallow"
    out = E.score_experts(players, realized, _ident)
    assert "0" not in out["experts"], "a shallow expert must not be scored on 20% coverage"


def test_underpowered_transitions_are_flagged_and_never_drive_the_verdict():
    s1, r1 = _players(n_experts=5, seed=3)
    s2, r2 = _players(n_experts=5, seed=4)
    rows = E.persistence({2024: E.score_experts(s1, r1, _ident),
                          2025: E.score_experts(s2, r2, _ident)})
    assert rows[0]["underpowered"] is True
    assert "NO USABLE MEASUREMENT" in E.verdict(rows)


def test_season_points_uses_only_the_fantasy_weeks():
    """Weeks 18+ in the store are NFL week 18 and the playoffs. No fantasy season
    counts them, and including them would reward players on deep playoff teams."""
    store = {"weeks": [
        {"week": 1, "points": {"7": 10.0}},
        {"week": 17, "points": {"7": 5.0}},
        {"week": 18, "points": {"7": 99.0}},
        {"week": 21, "points": {"7": 99.0}},
    ]}
    assert E.season_points(store) == {"7": 15.0}


def test_verdict_says_the_arm_is_dead_in_words_when_persistence_is_absent():
    rows = [{"from": 2023, "to": 2024, "shared_experts": 100, "rho": 0.01,
             "underpowered": False, "reading": ""}]
    v = E.verdict(rows)
    assert "GATE FAILED" in v and "DOES NOT SHIP" in v


@pytest.mark.parametrize("rho,word", [(0.5, "PERSISTS"), (0.15, "WEAK"),
                                      (0.0, "NO PERSISTENCE"), (-0.4, "NEGATIVE")])
def test_every_band_of_the_reading_is_reachable(rho, word):
    assert word in E._read(rho, 100)
