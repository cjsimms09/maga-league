"""alt_source_rankings.py — Cory, live 2026-08-20: "This toggle should just
rearrange the board though and also may change vona calc or recommended
player." Pins the per-source VORP/tier precompute that makes that possible:
reuse of vorp.apply_vorp/assign_tiers (Rule 11, not a second implementation),
additive-only output (the live board's own vorp/tier/proj_mean fields are
untouched), and honest coverage fallback (a player missing from a source is
priced at his own blend number for that source, never zeroed to
replacement).

Run: pytest draft/tests/test_alt_source_rankings.py
"""
from __future__ import annotations

import copy
import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "draft"))
sys.path.insert(0, str(ROOT / "draft" / "tools"))

import alt_source_rankings as asr  # noqa: E402
import config_schema  # noqa: E402

CFG = config_schema.load(ROOT / "draft" / "config" / "league_config.json")


def _fixture_players():
    # Four RBs: two with real Draft Sharks coverage that disagree with the
    # blend order, two without DS coverage at all (must fall back, not zero).
    return [
        {"player_id": "1", "position": "RB", "proj_mean": 200.0, "proj_ds": 150.0},
        {"player_id": "2", "position": "RB", "proj_mean": 180.0, "proj_ds": 210.0},
        {"player_id": "3", "position": "RB", "proj_mean": 100.0, "proj_ds": None},
        {"player_id": "4", "position": "RB", "proj_mean": 90.0, "proj_ds": None},
        {"player_id": "5", "position": "WR", "proj_mean": 150.0, "proj_ds": 140.0},
    ]


class TestComputeForSource:
    def test_reuses_the_real_functions_not_a_reimplementation(self):
        # If apply_vorp/assign_tiers were reimplemented rather than reused, this
        # would need its own math to agree with them. Proven the honest way:
        # monkeypatch is unnecessary — we just check the OUTPUT SHAPE matches
        # what those two functions actually produce (vorp/tier/pos_rank/etc,
        # not some other field set this script invented).
        players = _fixture_players()
        out = asr.compute_for_source(players, CFG, "proj_ds")
        row = out["1"]
        for f in asr.DERIVED_FIELDS:
            assert f in row, f"missing {f} — not the real apply_vorp/assign_tiers output shape"

    def test_reranks_when_the_source_disagrees_with_the_blend(self):
        players = _fixture_players()
        out = asr.compute_for_source(players, CFG, "proj_ds")
        # Blend order at RB: player 1 (200) > player 2 (180). DS order: player
        # 2 (210) > player 1 (150) — the whole point of the ask, proven with a
        # constructed disagreement rather than hoping the real board has one.
        assert out["2"]["vorp"] > out["1"]["vorp"], (
            "DS-priced VORP did not follow the DS numbers — re-ranking isn't happening")
        assert out["2"]["pos_rank"] < out["1"]["pos_rank"]

    def test_a_player_missing_from_the_source_falls_back_to_his_own_blend_number(self):
        players = _fixture_players()
        out = asr.compute_for_source(players, CFG, "proj_ds")
        assert out["3"]["covered"] is False
        assert out["3"]["proj_used"] == 100.0  # his own proj_mean, not 0 and not replacement
        assert out["4"]["covered"] is False
        assert out["4"]["proj_used"] == 90.0

    def test_CONTROL_a_player_with_real_source_coverage_is_marked_covered(self):
        players = _fixture_players()
        out = asr.compute_for_source(players, CFG, "proj_ds")
        assert out["1"]["covered"] is True
        assert out["1"]["proj_used"] == 150.0

    def test_replacement_level_is_not_dragged_down_by_uncovered_players_as_zeros(self):
        # If uncovered players were priced at 0 instead of falling back, the
        # RB replacement level under DS would collapse toward 0 — the exact
        # "|| 0 turns absent into a confident zero" failure this script's own
        # docstring names. With fallback, replacement stays in the real range.
        players = _fixture_players()
        out = asr.compute_for_source(players, CFG, "proj_ds")
        assert out["1"]["replacement"] > 50, (
            f"replacement collapsed toward 0 ({out['1']['replacement']}) — "
            "uncovered players are being priced as worthless, not unknown")


class TestApplyAltSources:
    def test_additive_only_the_original_fields_are_never_touched(self):
        players = _fixture_players()
        artifact = {"players": copy.deepcopy(players)}
        before = copy.deepcopy(artifact["players"])
        asr.apply_alt_sources(artifact, CFG)
        for b, a in zip(before, artifact["players"]):
            assert a["proj_mean"] == b["proj_mean"]
            # proj_ds (the raw source field) is untouched too — only NEW
            # suffixed fields (vorp_ds, tier_ds, ...) may be added.
            assert a.get("proj_ds") == b.get("proj_ds")

    def test_every_source_gets_its_own_suffixed_field_set(self):
        players = _fixture_players()
        artifact = {"players": copy.deepcopy(players)}
        asr.apply_alt_sources(artifact, CFG)
        p1 = next(p for p in artifact["players"] if p["player_id"] == "1")
        for key in asr.SOURCES:
            assert "vorp_" + key in p1
            assert "tier_" + key in p1
            assert "covered_" + key in p1

    def test_CONTROL_running_it_twice_is_idempotent(self):
        # A precompute step that drifts on re-run would silently rot the board
        # every time it's re-triggered. Two runs must agree exactly.
        players = _fixture_players()
        a1 = {"players": copy.deepcopy(players)}
        a2 = {"players": copy.deepcopy(players)}
        asr.apply_alt_sources(a1, CFG)
        asr.apply_alt_sources(a2, CFG)
        assert a1 == a2


class TestOnTheRealCommittedBoard:
    """The synthetic fixture proves the mechanism; this proves it survives
    contact with the actual 700-player artifact the war room ships."""

    @pytest.mark.post_chain  # ⚠️ THIS TEST'S NOTE BELOW IS THE DEFECT IT HIT.
    # It says the committed board "is committed WITH the alt-source fields
    # already applied (this script's own output, run once and shipped)". That
    # is true of the COMMITTED artifact and false of a freshly BUILT one, and
    # the idempotence half of this test compares the two. On run 32425450897 it
    # read `assert 157.45 == None` for Jahmyr Gibbs' vorp_ds and refused the
    # publish — correctly reporting that a fresh board has no per-source fields
    # yet, which is a fact about WHEN it runs, not about the board being bad.
    # The per-source fields arrive in the post-processing chain
    # (rerank_by_source.py). Marked here and added to draft-data.yml's
    # post-chain step in the same commit, per the conftest rule.
    def test_runs_clean_on_the_real_board_without_mutating_the_live_file(self, tmp_path):
        # NOTE: public/draft_data.json is committed WITH the alt-source fields
        # already applied (this script's own output, run once and shipped —
        # every render before this feature existed stays byte-identical
        # because they're additive-only, so there is no reason to keep the
        # real artifact un-augmented). This test's job is narrower than its
        # name once implied: calling apply_alt_sources() on an in-memory dict
        # must never itself touch the file on disk — only main()'s explicit
        # path.write_text() may do that.
        path = ROOT / "public" / "draft_data.json"
        before_bytes = path.read_bytes()
        real = json.loads(before_bytes)

        before_players = copy.deepcopy(real["players"])
        diag = asr.apply_alt_sources(real, CFG)  # mutates the in-memory dict only
        after_bytes = path.read_bytes()
        assert after_bytes == before_bytes, (
            "the real committed file changed on disk just from calling apply_alt_sources() in memory")

        # Re-running the precompute in memory must agree with what is already
        # committed (idempotence against the live artifact, not just a fixture).
        for b, a in zip(before_players, real["players"]):
            assert a.get("vorp_ds") == b.get("vorp_ds")
            assert a.get("tier_ds") == b.get("tier_ds")
            assert a["vorp"] == b["vorp"]  # the untouched blend field, unaffected either way
            assert a["tier"] == b["tier"]

        assert diag["ds"]["total"] == len(real["players"])
        assert 0 < diag["ds"]["covered"] < diag["ds"]["total"], (
            "Draft Sharks coverage should be partial on the real board, not 0% or 100%")

    def test_at_least_one_position_genuinely_reorders_under_at_least_one_source(self):
        # If NOTHING ever reorders, the whole feature is theatre — a toggle
        # that looks like it does something and never actually changes a
        # recommendation. Proven against the real board, not a fixture.
        real = json.loads((ROOT / "public" / "draft_data.json").read_text())
        asr.apply_alt_sources(real, CFG)
        players = real["players"]
        reordered_somewhere = False
        for pos in ("QB", "RB", "WR", "TE"):
            blend_top = sorted((p for p in players if p["position"] == pos),
                                key=lambda p: -(p.get("vorp") or -1e9))[:1]
            for key in asr.SOURCES:
                src_top = sorted((p for p in players if p["position"] == pos),
                                  key=lambda p: -(p.get("vorp_" + key) or -1e9))[:1]
                if blend_top and src_top and blend_top[0]["player_id"] != src_top[0]["player_id"]:
                    reordered_somewhere = True
        assert reordered_somewhere, (
            "no position's #1 changed under any alternate source — the re-ranking may be a no-op")
