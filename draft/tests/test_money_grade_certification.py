"""THE MONEY-GRADER CERTIFICATION GATE (Cory, 2026-08-08).

The reconciliation gate stands as the certification order: **before ANY experiment
consumes this grader, this must be green.** It reproduces all three completed
seasons' actual money outcomes and matches the known money table TO THE DOLLAR —
every owner, every season. The efficiency-leak finding (~$445–595/team) is
computed by the same machinery, so a green gate certifies that number too.

External truth anchors (cited by Cory from the master sheet): Cory 2023 = $400,
mhagen 2025 = $1,325. The rest of the table is locked here as a regression
baseline; it conserves each era's pot and independently reconciles to the Money
Board (test_data_spine.py). If this file goes red, the grader changed — stop and
find out why before trusting a single experiment verdict.
"""
from __future__ import annotations
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backtest"))
import money_grade as MG  # noqa: E402

# Sleeper user_ids are stable across seasons (roster_ids are not).
NAME_BY_UID = {
    "434915673219526656": "coryjsimms", "434921290978029568": "ds7mmet",
    "434921916734631936": "cashworth", "440723317066821632": "Jreis",
    "439662843298574336": "B8T3S", "461443264013135872": "MarianSaar",
    "458507445241638912": "mhagen", "471160336402083840": "Richard2121",
    "459850070410391552": "Schmelley", "739930057887334400": "Sadbru",
}

# The KNOWN money table — total $ per owner per season. Owners not listed for a
# season collected $0. Cory 2023=400 and mhagen 2025=1325 are Cory's cited truths;
# the rest conserves the era pot and matches the Money Board independently.
KNOWN_TOTALS = {
    "2023": {"mhagen": 1050, "ds7mmet": 800, "Schmelley": 550, "coryjsimms": 400,
             "Jreis": 200, "Sadbru": 200, "B8T3S": 100, "MarianSaar": 100, "Richard2121": 100},
    "2024": {"ds7mmet": 950, "Jreis": 900, "MarianSaar": 750, "cashworth": 600,
             "coryjsimms": 400, "Richard2121": 200, "mhagen": 100, "Schmelley": 100},
    "2025": {"mhagen": 1325, "B8T3S": 875, "ds7mmet": 800, "Jreis": 600,
             "Richard2121": 200, "MarianSaar": 100, "Schmelley": 100},
}


@pytest.fixture(scope="module")
def hp():
    return MG.load_history(), MG.load_payouts()


def _owner_uid(season_obj, roster_id):
    """roster_id -> owner user_id for a season (the mapping changes per season)."""
    for r in season_obj.get("final_rosters", []) or []:
        if r.get("roster_id") == roster_id:
            return str(r.get("owner_id"))
    return None


def _totals_by_name(hp, season):
    hist, pay = hp
    s = MG.season_of(hist, season)
    g = MG.grade_actual(hist, pay, season)
    out = {}
    for rid, v in g["per_roster"].items():
        uid = _owner_uid(s, rid)
        name = NAME_BY_UID.get(uid, uid)
        out[name] = out.get(name, 0) + v["total"]
    return out


@pytest.mark.parametrize("season", ["2023", "2024", "2025"])
def test_reproduces_the_known_money_table_to_the_dollar(hp, season):
    got = _totals_by_name(hp, season)
    want = KNOWN_TOTALS[season]
    for name, amount in want.items():
        assert got.get(name, 0) == pytest.approx(amount), \
            f"{season} {name}: grader ${got.get(name, 0)} != known ${amount}"
    # Nobody outside the known table collected a dollar.
    for name, amount in got.items():
        if amount > 0:
            assert name in want, f"{season}: {name} got ${amount} but is not in the known table"


def test_external_anchor_cory_2023_is_400(hp):
    assert _totals_by_name(hp, "2023")["coryjsimms"] == 400


def test_external_anchor_mhagen_2025_is_1325(hp):
    assert _totals_by_name(hp, "2025")["mhagen"] == 1325


@pytest.mark.parametrize("season,pot", [("2023", 3500), ("2024", 4000), ("2025", 4000)])
def test_each_seasons_table_sums_to_its_era_pot(hp, season, pot):
    assert sum(KNOWN_TOTALS[season].values()) == pot          # the table itself
    assert sum(_totals_by_name(hp, season).values()) == pytest.approx(pot)   # and the grader
