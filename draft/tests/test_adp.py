"""Tests for the real-ADP path and its name matcher.

Everything here runs offline against fixtures. The one thing these tests
*cannot* prove is what FFC's live payload actually contains — that answer comes
from `describe_payload()` in a real build log, which is exactly why that
function exists and is printed.
"""
import pytest

import adp


# --- fixtures ---------------------------------------------------------------

SLEEPER_PLAYERS = {
    "4034": {"full_name": "Christian McCaffrey", "position": "RB", "team": "SF"},
    "6794": {"full_name": "D.K. Metcalf", "position": "WR", "team": "SEA"},
    "7564": {"full_name": "Ja'Marr Chase", "position": "WR", "team": "CIN"},
    "8112": {"full_name": "Amon-Ra St. Brown", "position": "WR", "team": "DET"},
    "4029": {"full_name": "Michael Thomas", "position": "WR", "team": "NO"},
    "1234": {"full_name": "Michael Thomas", "position": "TE", "team": "NYG"},
    "5849": {"full_name": "Kyler Murray", "position": "QB", "team": "ARI"},
    "2216": {"full_name": "Marvin Harrison Jr.", "position": "WR", "team": "ARI"},
    "BUF": {"full_name": "", "position": "DEF", "team": "BUF"},
    "SF":  {"full_name": "", "position": "DEF", "team": "SF"},
    "9001": {"full_name": "Justin Tucker", "position": "K", "team": "BAL"},
    # Not in any FFC payload we use — exercises the fallback path.
    "9999": {"full_name": "Deep Bench Guy", "position": "RB", "team": "NYJ"},
}


def ffc(name, pos, team, rank, adp_val, **extra):
    return dict({"name": name, "position": pos, "team": team,
                 "adp_rank": rank, "adp": adp_val}, **extra)


PAYLOAD = {
    "status": "Success", "teams": 10, "year": 2026, "format": "half-ppr",
    "players": [
        ffc("Christian McCaffrey", "RB", "SF", 1, 1.4),
        ffc("Ja'Marr Chase", "WR", "CIN", 2, 2.6),
        ffc("DK Metcalf", "WR", "SEA", 3, 30.2),            # no periods
        ffc("Amon Ra St. Brown", "WR", "DET", 4, 12.1),      # no hyphen
        ffc("Marvin Harrison", "WR", "ARI", 5, 22.0),        # suffix dropped
        ffc("Kyler Murray", "QB", "ARZ", 6, 88.5),           # team alias
        ffc("Michael Thomas", "WR", "NO", 7, 140.0),         # ambiguous name
        ffc("Buffalo Bills", "DEF", "BUF", 8, 150.0),
        ffc("Justin Tucker", "PK", "BAL", 9, 160.0),         # position alias
    ],
}


@pytest.fixture
def index():
    return adp.build_index(SLEEPER_PLAYERS)


# --- normalization ----------------------------------------------------------

@pytest.mark.parametrize("a,b", [
    ("D.K. Metcalf", "DK Metcalf"),
    ("Ja'Marr Chase", "JaMarr Chase"),
    ("Amon-Ra St. Brown", "Amon Ra St Brown"),
    ("Marvin Harrison Jr.", "Marvin Harrison"),
    ("Kenneth Walker III", "Kenneth Walker"),
])
def test_normalization_collapses_known_variants(a, b):
    assert adp.normalize_name(a) == adp.normalize_name(b)


def test_normalization_does_not_collapse_different_people():
    assert adp.normalize_name("Michael Thomas") != adp.normalize_name("Michael Thomasson")


# --- matching ---------------------------------------------------------------

def test_matches_every_fixture_player(index):
    for entry in PAYLOAD["players"]:
        pid, method = adp.match_player(entry, index)
        assert pid, f"{entry['name']} did not match (method={method})"


def test_ambiguous_name_resolved_by_position(index):
    """Two Michael Thomases. The WR must not become the TE."""
    pid, method = adp.match_player(
        ffc("Michael Thomas", "WR", "NO", 7, 140.0), index)
    assert pid == "4029"
    assert "pos" in method


def test_initials_variant_matches(index):
    pid, method = adp.match_player(ffc("DK Metcalf", "WR", "SEA", 3, 30.2), index)
    assert pid == "6794"


def test_team_alias_matches(index):
    pid, _ = adp.match_player(ffc("Kyler Murray", "QB", "ARZ", 6, 88.5), index)
    assert pid == "5849"


def test_defense_matches_by_team(index):
    pid, method = adp.match_player(ffc("Buffalo Bills", "DEF", "BUF", 8, 150.0), index)
    assert pid == "BUF"


def test_unknown_player_does_not_match(index):
    pid, _ = adp.match_player(ffc("Nonexistent Person", "WR", "KC", 400, 400.0), index)
    assert pid is None


# --- build + reporting ------------------------------------------------------

def test_build_reports_payload_shape(monkeypatch):
    monkeypatch.setattr(adp, "fetch_adp", lambda *a, **k: PAYLOAD)
    out = adp.build_adp_table(SLEEPER_PLAYERS, fmt="half-ppr", teams=10, year=2026)
    rep = out["report"]
    assert rep["matched"] == len(PAYLOAD["players"])
    assert rep["unmatched_count"] == 0
    # The question the work order asks: does FFC publish a stdev?
    assert "stdev_field" in rep["payload"]


def test_unmatched_top_player_fails_the_build(monkeypatch):
    """The whole point of P0.1: a broken matcher must not degrade silently."""
    broken = dict(PAYLOAD, players=PAYLOAD["players"] + [
        ffc("Totally Unknown Rookie", "RB", "KC", 12, 44.0)])
    monkeypatch.setattr(adp, "fetch_adp", lambda *a, **k: broken)
    with pytest.raises(RuntimeError, match="did not match"):
        adp.build_adp_table(SLEEPER_PLAYERS, fmt="half-ppr", teams=10, year=2026)


def test_unmatched_outside_top_n_is_reported_not_fatal(monkeypatch):
    late = dict(PAYLOAD, players=PAYLOAD["players"] + [
        ffc("Totally Unknown Rookie", "RB", "KC", 400, 400.0)])
    monkeypatch.setattr(adp, "fetch_adp", lambda *a, **k: late)
    out = adp.build_adp_table(SLEEPER_PLAYERS, fmt="half-ppr", teams=10, year=2026)
    assert out["report"]["unmatched_count"] == 1
    assert out["report"]["unmatched_in_top_n"] == []


# --- standard deviation -----------------------------------------------------

def test_published_sd_is_used_when_present():
    sd, src = adp.fitted_sd(100.0, 9.5)
    assert sd == 9.5 and src == "ffc"


def test_fitted_sd_is_tighter_than_the_old_heuristic():
    """Old rule: max(3, 0.22*adp) -> 22.0 at adp=100, roughly double reality."""
    sd, src = adp.fitted_sd(100.0, None)
    old = max(3.0, 0.22 * 100.0)
    assert sd < old
    assert sd == pytest.approx(15.0)   # clamped
    assert src == "clamped-linear"


def test_fitted_sd_floor_and_ceiling():
    assert adp.fitted_sd(1.0, None)[0] == 3.0        # floor
    assert adp.fitted_sd(300.0, None)[0] == 15.0     # ceiling


# --- fallback provenance ----------------------------------------------------

def test_fallback_is_recorded_per_player(monkeypatch):
    monkeypatch.setattr(adp, "fetch_adp", lambda *a, **k: PAYLOAD)
    table = adp.build_adp_table(SLEEPER_PLAYERS, fmt="half-ppr", teams=10, year=2026)["adp"]
    board = [{"player_id": "4034", "search_rank": 1},
             {"player_id": "9999", "search_rank": 250}]
    prov = adp.apply_with_fallback(board, table, teams=10)
    assert board[0]["adp_source"] == "ffc"
    assert board[1]["adp_source"] == "search_rank"
    assert prov["fallback_count"] == 1


def test_high_fallback_rate_raises_a_warning(monkeypatch):
    monkeypatch.setattr(adp, "fetch_adp", lambda *a, **k: PAYLOAD)
    table = adp.build_adp_table(SLEEPER_PLAYERS, fmt="half-ppr", teams=10, year=2026)["adp"]
    board = [{"player_id": "9999", "search_rank": 200 + i} for i in range(10)]
    prov = adp.apply_with_fallback(board, table, teams=10)
    assert prov["fallback_rate"] == 1.0
    assert prov["warning"] and "degraded" in prov["warning"]


def test_low_fallback_rate_has_no_warning(monkeypatch):
    monkeypatch.setattr(adp, "fetch_adp", lambda *a, **k: PAYLOAD)
    table = adp.build_adp_table(SLEEPER_PLAYERS, fmt="half-ppr", teams=10, year=2026)["adp"]
    board = [{"player_id": "4034", "search_rank": 1}] * 20 + [{"player_id": "9999", "search_rank": 250}]
    prov = adp.apply_with_fallback(board, table, teams=10)
    assert prov["warning"] is None
