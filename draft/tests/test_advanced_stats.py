# TERRITORY: A
"""The advanced-stats stores (2021-2025) — shape, provenance, the two-family
missing-vs-zero rule, cross-store coverage against component_stats, and the
schema-choice claims fetch_advanced_stats.py's docstring makes about the two
real nflverse parquet schemas.

Live-regeneration parity was verified by hand at build time (running
fetch_advanced_stats.py a second time against the network, unforced, reports
"unchanged" for all five committed seasons — the only way that status is
possible is a byte-identical rebuild of the `weeks` payload from the same
URL) and is recorded in draft/audit/advanced_metrics_study_2026-08-16.md.
No test HERE touches the network — same discipline as test_component_stats.py
— everything below reads the committed stores and derives what it can from
committed data alone.
"""
import json
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
BT = HERE.parent / "backtest"
sys.path.insert(0, str(BT))
sys.path.insert(0, str(HERE.parent))

import fetch_advanced_stats as FAS  # noqa: E402
import fetch_component_stats as FCS  # noqa: E402

SEASONS = (2021, 2022, 2023, 2024, 2025)
POSITION_GROUPS = ("QB", "RB", "WR", "TE")
SHARE_KEYS = ("pass_air_yd", "rec_air_yd", "wopr", "ay_share")
EPA_KEYS = ("pass_epa", "rush_epa", "rec_epa", "cpoe", "racr")


@pytest.fixture(scope="module")
def stores():
    return {s: FAS.load_store(s) for s in SEASONS}


# ── shape and provenance ─────────────────────────────────────────────────────

def test_every_season_store_exists_with_territory_first(stores):
    for season, doc in stores.items():
        assert next(iter(doc)) == "_territory", season
        assert "fetch_advanced_stats.py" in doc["_territory"]
        assert doc["season"] == season


def test_provenance_block_is_complete_and_counts_match_content(stores):
    for season, doc in stores.items():
        prov = doc["provenance"]
        for k in ("url", "tried", "fetched", "weeks_span", "season_type",
                  "position_groups", "columns_kept", "schema", "crosswalk",
                  "kept_player_weeks", "players", "sleeper_mapped_players",
                  "unmapped_gsis_players", "duplicate_player_weeks_collapsed"):
            assert k in prov, (season, k)
        assert prov["url"].startswith(
            "https://github.com/nflverse/nflverse-data/releases/download/"
            "stats_player/stats_player_week_")
        assert prov["season_type"] == "REG"
        assert any(t["ok"] for t in prov["tried"])
        n_rows = sum(len(w["players"]) for w in doc["weeks"])
        pids = {p for w in doc["weeks"] for p in w["players"]}
        assert prov["kept_player_weeks"] == n_rows, season
        assert prov["players"] == len(pids), season
        unmapped = {p for p in pids if p.startswith("gsis:")}
        assert prov["unmapped_gsis_players"] == len(unmapped), season


def test_weeks_are_regular_season_ascending_unique(stores):
    for season, doc in stores.items():
        wks = [w["week"] for w in doc["weeks"]]
        assert wks == sorted(set(wks)), season
        assert min(wks) >= 1 and max(wks) <= 18, season
        assert len(wks) >= 17, season


def test_row_count_sanity(stores):
    for season, doc in stores.items():
        prov = doc["provenance"]
        assert 3000 <= prov["kept_player_weeks"] <= 8000, (
            season, prov["kept_player_weeks"])
        assert 400 <= prov["players"] <= 800, (season, prov["players"])


def test_store_sizes_stay_committable(stores):
    for season in SEASONS:
        size = FAS.store_path(season).stat().st_size
        assert size < 2_000_000, (season, size)


def test_no_duplicate_player_weeks_were_collapsed(stores):
    # measured 0/5 seasons at build time (see module docstring); pin it so a
    # future refetch surfaces the fact loudly rather than silently.
    for season, doc in stores.items():
        assert doc["provenance"]["duplicate_player_weeks_collapsed"] == 0, season


# ── the two-family missing-vs-zero rule ──────────────────────────────────────

def test_share_family_never_stores_a_zero(stores):
    for season, doc in stores.items():
        for w in doc["weeks"]:
            for pid, line in w["players"].items():
                assert line.get("pos") in POSITION_GROUPS, (season, pid)
                for k in SHARE_KEYS:
                    if k in line:
                        assert line[k] != 0, (season, w["week"], pid, k)


def test_epa_family_can_legitimately_be_exactly_zero(stores):
    # the opposite convention from the share family: a real 0.0 EPA play
    # (e.g. a spike, a dead-even kneel) must survive, not be stripped like a
    # missing stat. Assert the store actually contains at least one such row
    # for at least one season — if this fails, the zero-preserving branch of
    # _clean_epa is dead code, not merely untested.
    found = False
    for season, doc in stores.items():
        for w in doc["weeks"]:
            for line in w["players"].values():
                for k in ("pass_epa", "rush_epa", "rec_epa"):
                    if line.get(k) == 0.0:
                        found = True
    assert found, "no exact-zero EPA value found in any committed store"


def test_cpoe_only_appears_with_plausible_range(stores):
    # a single-attempt game can produce an extreme completion-%-over-expected
    # value (0-for-1 vs a 0.2-expected pass is a legitimate -20pp CPOE, and
    # the tails run wider than that on real weekly data) — the bound here is
    # sanity (catches unit errors / corruption), not a tight plausibility band.
    for season, doc in stores.items():
        for w in doc["weeks"]:
            for pid, line in w["players"].items():
                if "cpoe" in line:
                    assert -100.0 <= line["cpoe"] <= 100.0, (season, w["week"], pid)


def test_racr_and_wopr_plausible_ranges(stores):
    # same rationale as CPOE: these are weekly (not season) ratios and a
    # small denominator (1-2 targets/air yards) produces genuinely wide
    # tails on real data — measured range across all 5 committed seasons is
    # racr [-86, 116], wopr [-0.22, 1.79], ay_share [-0.9, 1.84]; bounds below
    # are sanity margins around that, not a tight plausibility claim.
    for season, doc in stores.items():
        for w in doc["weeks"]:
            for pid, line in w["players"].items():
                if "racr" in line:
                    assert -200.0 <= line["racr"] <= 200.0, (season, w["week"], pid)
                if "wopr" in line:
                    assert -1.0 <= line["wopr"] <= 5.0, (season, w["week"], pid)
                if "ay_share" in line:
                    assert -2.0 <= line["ay_share"] <= 2.0, (season, w["week"], pid)


def test_advanced_weeks_reader_round_trips_row_presence(stores):
    for season in (2021, 2024):
        aw = FAS.advanced_weeks(season, 1, 17)
        doc = stores[season]
        n = sum(1 for w in doc["weeks"] if 1 <= w["week"] <= 17
                for _ in w["players"])
        assert sum(len(v) for v in aw.values()) == n, season


# ── cross-store coverage against component_stats (the join this store exists
#    to support — see advanced_efficiency.py) ────────────────────────────────

def test_covers_almost_all_component_stats_players(stores):
    # different upstream release, so NOT expected to be identical — but the
    # overlap must be large, or the join this store exists to support would
    # be pointless. Measured overlap at build time: >=99% for 2024.
    for season in SEASONS:
        comp = FCS.load_store(season)
        cpids = {p for w in comp["weeks"] for p in w["players"]}
        apids = {p for w in stores[season]["weeks"] for p in w["players"]}
        overlap = cpids & apids
        assert len(overlap) / len(cpids) > 0.95, (
            season, len(overlap), len(cpids))


def test_schema_choice_claim_cpoe_absent_from_primary_schema():
    # this is the load-bearing claim in the module docstring's "SCHEMA
    # CHOICE" section — pin it against the actual committed column list
    # fetch_component_stats.py records for its own (different) schema, so a
    # future silent schema change on either file is caught.
    comp2024 = FCS.load_store(2024)
    assert "cpoe" not in comp2024["provenance"]["columns_kept"]
    adv2024 = FAS.load_store(2024)
    assert "cpoe" in adv2024["provenance"]["columns_kept"]
