"""THE TWO CORY-RULED PROJECTION-CORRECTNESS FIXES, PINNED (2026-08-16).

Cory's ruling, verbatim: "Don't agree with timelines we fix now" — overriding
the defer-to-post-draft recommendations on DECISIONS-NEEDED #0 (DEF
`def_fum_td` maps to nothing) and #000 (WR/TE FP-vs-Sleeper ~20% scale gap).

Every number here comes from the committed raw provider capture
(draft/audit/proj_correctness_evidence_2026-08-16.json — fetched in CI where
provider egress works, scored by NOTHING at capture time) or from the live
board that capture was proven byte-consistent with. The audit chain is
draft/audit/projection_correctness_2026-08-16.md.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "draft"))

from projections import baseline_from_projections            # noqa: E402
from scoring import (DEF_PROJ_TD_ALIASES, normalize_def_stat_line,  # noqa: E402
                     score_stat_line)

EVIDENCE = json.loads(
    (ROOT / "draft" / "audit" / "proj_correctness_evidence_2026-08-16.json").read_text())
BOARD = json.loads((ROOT / "public" / "draft_data.json").read_text())
SCORING = BOARD["league"]["scoring"]
DEF_ROWS = EVIDENCE["sleeper"]["def_rows"]
BOARD_DEFS = {str(p["player_id"]): p for p in BOARD["players"]
              if p["position"] == "DEF"}


# ── #0: the Rams case, recomputed BY HAND (rule 12 style — independent sum,
#        not score_stat_line) ------------------------------------------------

def test_rams_recomputed_by_hand():
    """LAR projection row, term by term against the league's scoring table.

    The provider row (committed capture): sack 52, int 15, fum_rec 11,
    blk_kick 1, pts_allow_0 1, def_fum_td 2, def_kr_td 1, gp 1, plus adp_*/pts_*
    metadata the scorer must ignore.
    """
    row = DEF_ROWS["LAR"]
    assert row["def_fum_td"] == 2.0 and row["def_kr_td"] == 1.0

    hand = (row["sack"] * 1.0          # 52.0
            + row["int"] * 2.0         # 30.0
            + row["fum_rec"] * 2.0     # 22.0
            + row["blk_kick"] * 0.0    # this league prices blk_kick 0.0
            + row["pts_allow_0"] * 10.0)      # 10.0
    assert hand == pytest.approx(114.0)       # the OLD board value — the defect

    hand_fixed = (hand
                  + row["def_fum_td"] * 6.0   # 2 fumble-return TDs -> def_td 6.0
                  + row["def_kr_td"] * 6.0)   # 1 DST kick-return TD -> def_st_td 6.0
    assert hand_fixed == pytest.approx(132.0)

    # The live path agrees with the hand arithmetic, old and new:
    assert score_stat_line(row, SCORING) == pytest.approx(114.0)
    assert score_stat_line(normalize_def_stat_line(row), SCORING) == pytest.approx(132.0)
    # And the committed board carries the corrected number.
    assert BOARD_DEFS["LAR"]["proj_baseline"] == pytest.approx(132.0)


# ── #0: the all-32 sweep — no double-count against Sleeper's own vocabulary --

def test_all_32_def_rows_aggregates_never_present():
    """The double-count precondition, MEASURED not assumed: across all 32 DEF
    projection rows the priced aggregates (def_td / def_st_td / fum_rec_td /
    def_int_td) never appear — only component keys do. So folding components
    into the aggregates cannot double-pay any row Sleeper actually served."""
    assert len(DEF_ROWS) == 32
    for pid, row in DEF_ROWS.items():
        for agg in ("def_td", "def_st_td", "fum_rec_td", "def_int_td", "int_td"):
            assert agg not in row, (pid, agg)


def test_all_32_sweep_vs_sleepers_own_implied_totals():
    """Sleeper's own precomputed pts_std for every DEF row reconstructs as
    sack*1 + int*2 + fum_rec*2 + blk_kick*2 — WITHOUT the TD components. All 32
    rows. Two things follow: the rows are internally consistent, and Sleeper's
    own totals do NOT hide the TD components inside any stat we already pay —
    so adding them via the aliases is new value, never a second counting."""
    for pid, row in DEF_ROWS.items():
        implied = (row.get("sack", 0) * 1.0 + row.get("int", 0) * 2.0
                   + row.get("fum_rec", 0) * 2.0 + row.get("blk_kick", 0) * 2.0)
        assert implied == pytest.approx(row["pts_std"]), pid


def test_all_32_sweep_correction_is_exactly_the_td_components():
    """For every DEF row: new score - old score == 6.0 x (sum of TD component
    values), to the cent — nothing else moved. And the committed board carries
    exactly the new score as proj_baseline AND proj_mean (DEF opportunity_adj
    is 0.0 across the board)."""
    changed = 0
    for pid, row in DEF_ROWS.items():
        old = score_stat_line(row, SCORING)
        new = score_stat_line(normalize_def_stat_line(row), SCORING)
        comps = sum(float(row[k]) for k in DEF_PROJ_TD_ALIASES if k in row)
        assert new - old == pytest.approx(6.0 * comps, abs=0.011), pid
        assert BOARD_DEFS[pid]["proj_baseline"] == pytest.approx(new), pid
        assert BOARD_DEFS[pid]["proj_mean"] == pytest.approx(new), pid
        if comps:
            changed += 1
    assert changed == 11    # ARI CAR DAL DET HOU JAX LAR MIN NE NO SEA


def test_def_replacement_and_vorp_consistent():
    """DEF replacement is the flex-aware N-th best DEF proj_mean (103.0 after
    the correction; it was 99.0 before), and every DEF vorp is proj_mean minus
    that one number."""
    repl = BOARD["replacement"]["replacement_points"]["DEF"]
    assert repl == pytest.approx(103.0)
    for p in BOARD_DEFS.values():
        assert p["replacement"] == pytest.approx(repl)
        assert p["vorp"] == pytest.approx(round(p["proj_mean"] - repl, 2))


def test_aggregate_wins_components_dropped():
    """THE TRAP THE ORIGINAL FINDING NAMED: if a payload ever carries BOTH the
    aggregate and a component, the component must NOT add on top (silent
    undercount must not become silent overcount). First-writer-wins, pinned."""
    row = {"def_td": 1.0, "def_fum_td": 1.0, "sack": 10.0}
    out = normalize_def_stat_line(row)
    assert out["def_td"] == 1.0            # the provider's aggregate, untouched
    assert "def_fum_td" not in out
    assert score_stat_line(out, SCORING) == pytest.approx(10.0 * 1.0 + 6.0)


def test_components_sum_when_aggregate_absent():
    row = {"def_fum_td": 1.0, "pass_int_td": 2.0, "def_kr_td": 1.0, "pr_td": 1.0}
    out = normalize_def_stat_line(row)
    assert out["def_td"] == pytest.approx(3.0)      # fum + 2 pick-sixes
    assert out["def_st_td"] == pytest.approx(2.0)   # kick + punt return
    assert score_stat_line(out, SCORING) == pytest.approx(5 * 6.0)


def test_def_scope_individual_returners_untouched():
    """Individual returners' rows carry the same component keys (measured: 1 RB
    + 2 WR rows in the capture) and the league prices an individual ST TD at
    st_td 0.0 — baseline_from_projections must normalize ONLY team-defense rows
    (non-numeric Sleeper ids)."""
    raw = {
        "LAR": {"sack": 10.0, "def_fum_td": 1.0},         # DST: normalized
        "12345": {"rec": 50.0, "def_kr_td": 1.0, "pr_td": 1.0},  # returner: not
    }
    out = baseline_from_projections(raw, SCORING)
    assert out["LAR"] == pytest.approx(10.0 + 6.0)
    assert out["12345"] == pytest.approx(50.0 * 0.5)      # def_kr_td prices 0.0


# ── #000: the FP dropped-receptions fix --------------------------------------

def _fp_raw_by_name():
    idx = {}
    for r in EVIDENCE["fantasypros"]["raw_rows"]:
        n = " ".join(str(r.get("name") or "").lower().replace(".", "")
                     .replace("'", "").replace("-", " ").split())
        idx.setdefault(n, []).append(r["raw_stats"])
    return idx


def test_fp_payload_serves_rec_rec_never_rec():
    """The mechanism, pinned from the committed capture: FP's 2026 payload
    carries receptions ONLY as `rec_rec` — the key `_FP_STAT_MAP` knows (`rec`)
    never appears — so the unrecovered parse scored every player without
    reception points."""
    census = EVIDENCE["fantasypros"]["raw_key_census_by_pos"]
    merged = {}
    for c in census.values():
        for k, v in c.items():
            merged[k] = merged.get(k, 0) + v
    assert merged.get("rec_rec", 0) >= 400
    assert "rec" not in merged and "receptions" not in merged


def test_fp_correction_matches_fps_own_half_ppr_total():
    """Receptions were the WHOLE WR/TE gap: for board WR/TE with an unambiguous
    FP row, (mapped stats + 0.5 x rec_rec) equals FP's own points_half within a
    cent for at least 200 players — the corrected column is FP's intended
    half-PPR value, recovered exactly, not rescaled."""
    raw = _fp_raw_by_name()
    rows = EVIDENCE["fantasypros"]["rows"]
    # FP's payload carries no position field the parser recognizes (all None in
    # the capture); position comes from the BOARD side of the join, the same way
    # the build's crosswalk resolves it.
    pos_by_name = {}
    for p in BOARD["players"] + (BOARD.get("kept_players") or []):
        n = " ".join(str(p.get("name") or "").lower().replace(".", "")
                     .replace("'", "").replace("-", " ").split())
        pos_by_name[n] = p.get("position")
    errs = []
    for r in rows:
        n = " ".join(str(r.get("name") or "").lower().replace(".", "")
                     .replace("'", "").replace("-", " ").split())
        if pos_by_name.get(n) not in ("WR", "TE"):
            continue
        cands = raw.get(n) or []
        if len(cands) != 1 or cands[0].get("points_half") in (None, ""):
            continue
        rec = float(cands[0].get("rec_rec") or 0)
        two = float(cands[0].get("2pt_tds") or 0)   # FP's half total prices 2pt at 2.0, as we do
        got = score_stat_line(r.get("stats") or {}, SCORING) + 0.5 * rec + 2.0 * two
        errs.append(abs(got - float(cands[0]["points_half"])))
    # FP serves stats rounded to 2dp but computes points_half from unrounded
    # internals, so single rows can sit a few cents off. The claim under test is
    # distributional and it is tight: half the rows within 2 cents, 95% within a
    # quarter point, no row off by as much as one point — against a ~19% gap
    # (30-55 points on top rows) before the recovery.
    import statistics
    errs.sort()
    assert len(errs) >= 200
    assert statistics.median(errs) <= 0.02, statistics.median(errs)
    assert errs[int(0.95 * len(errs))] <= 0.25, errs[int(0.95 * len(errs))]
    assert errs[-1] < 1.0, errs[-1]


def test_fp_board_column_scale_restored():
    """The structural pin #000 existed for: on the committed board the median
    FP/Sleeper ratio at WR and TE is back inside [0.95, 1.20] (it shipped at
    0.824 / 0.810), and QB — which never had reception points to lose — stays
    where it was, inside [0.95, 1.05]."""
    import statistics
    ratios = {}
    pool = BOARD["players"] + (BOARD.get("kept_players") or [])
    for pos in ("QB", "WR", "TE"):
        rr = [p["proj_fantasypros"] / p["proj_sleeper"] for p in pool
              if p["position"] == pos and p.get("proj_sleeper")
              and p.get("proj_fantasypros") is not None]
        ratios[pos] = statistics.median(rr)
    assert 0.95 <= ratios["QB"] <= 1.05, ratios
    assert 0.95 <= ratios["WR"] <= 1.20, ratios
    assert 0.95 <= ratios["TE"] <= 1.20, ratios


def test_recover_fp_dropped_stats_unit():
    """The adp.py recovery helper: rec_rec recovered; an already-mapped `rec`
    is never overwritten (alias first-writer-wins); duplicate raw names are
    skipped rather than guessed; 2pt_tds only lands under uniform pricing."""
    import adp as adp_mod
    payload = {"players": [
        {"player_name": "A Wr", "player_position_id": "WR",
         "stats": {"rec_rec": 80, "rec_yds": 1000, "points_half": 140}},
        {"player_name": "B Rb", "player_position_id": "RB",
         "stats": {"rec": 40, "rec_rec": 999, "rush_yds": 900}},
        {"player_name": "Dup Guy", "player_position_id": "WR",
         "stats": {"rec_rec": 10}},
        {"player_name": "Dup Guy", "player_position_id": "WR",
         "stats": {"rec_rec": 20}},
        {"player_name": "C Qb", "player_position_id": "QB",
         "stats": {"pass_yds": 4000, "2pt_tds": 2}},
    ]}
    text = json.dumps(payload)
    parsed = [
        {"name": "A Wr", "position": "WR", "stats": {"rec_yd": 1000.0}},
        {"name": "B Rb", "position": "RB", "stats": {"rec": 40.0, "rush_yd": 900.0}},
        {"name": "Dup Guy", "position": "WR", "stats": {}},
        {"name": "C Qb", "position": "QB", "stats": {"pass_yd": 4000.0}},
    ]
    diag = adp_mod.recover_fp_dropped_stats(text, parsed, SCORING)
    assert parsed[0]["stats"]["rec"] == 80.0
    assert parsed[1]["stats"]["rec"] == 40.0          # mapped key won; 999 ignored
    assert "rec" not in parsed[2]["stats"]            # ambiguous name skipped
    assert parsed[3]["stats"]["rush_2pt"] == 2.0      # uniform 2pt pricing carrier
    assert diag["rec_recovered"] == 1
    assert diag["skipped_dup_name"] == 1
    assert diag["twopt_recovered"] == 1

    # Non-uniform 2pt pricing: the aggregate cannot be attributed -> not injected.
    parsed2 = [{"name": "C Qb", "position": "QB", "stats": {"pass_yd": 4000.0}}]
    uneven = dict(SCORING, rec_2pt=3.0)
    diag2 = adp_mod.recover_fp_dropped_stats(text, parsed2, uneven)
    assert "rush_2pt" not in parsed2[0]["stats"]
    assert diag2["twopt_recovered"] == 0


def test_board_provenance_records_the_correction():
    prov = BOARD.get("provenance", {}).get("projection_correctness_2026_08_16")
    assert prov, "the applied correction must be recorded in board provenance"
    assert "fix now" in prov["ruling"]
    assert len(prov["def_rows_corrected"]) == 11
    assert prov["fp_rows_corrected"] > 250
