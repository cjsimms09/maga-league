# TERRITORY: A
"""ENGINE ABLATION, REPLAY FRAME — mechanics tests.

What is pinned here: the ablation configs are REAL switches (each one changes
the drafted roster on a fixture where its rule binds — a flag that changes
nothing is a broken ablation), the rail-off parameterization actually
disables the rail, the driver's parity discipline (primary == committed
replay) is enforced, and the committed artifact carries its declared shape.
What the layers MEASURED belongs in draft/audit/engine_ablation_2026-08-16.md
— a strategy question has no pass/fail, only a report.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "draft" / "tools"))

import draft_replay_2025 as DR  # noqa: E402
import engine_ablation_replay as EAR  # noqa: E402

ARTIFACT = ROOT / "draft" / "data" / "engine_ablation_replay_2026.json"


# ── a fixture draft where every rail binds ───────────────────────────────────
# 4 rounds, 2 teams (Cory roster 1, opponent roster 2), no keepers. The board
# holds 4 QBs that outscore everything by VORP, so an uncapped/unrailed tool
# drafts QBs forever; the caps and the feasibility rail each cut in at a
# different point.

def _fixture():
    picks = []
    order = [1, 2, 2, 1, 1, 2, 2, 1]      # 2-team snake
    for i, rid in enumerate(order):
        picks.append({"pick_no": i + 1, "roster_id": rid,
                      "player_id": f"opp{i}" if rid == 2 else f"slot{i}"})
    # Opponent picks are history (their player_ids never collide with the
    # pool); Cory's four slots are the tool's picks.
    positions = {}
    proj = {}
    for i in range(8):
        positions[f"opp{i}"] = "WR"
    for q in range(4):
        positions[f"qb{q}"] = "QB"
        proj[f"qb{q}"] = 400.0 - q          # QBs dominate raw value
    for r in range(4):
        positions[f"rb{r}"] = "RB"
        proj[f"rb{r}"] = 200.0 - r
    for w in range(4):
        positions[f"wr{w}"] = "WR"
        proj[f"wr{w}"] = 150.0 - w
    repl = {"QB": 0.0, "RB": 0.0, "WR": 0.0, "TE": 0.0}
    return picks, positions, proj, repl


def _tool_positions(rep, positions):
    return [positions[p] for p in sorted(rep["tool_roster"])]


def test_onesie_cap_ablation_changes_the_draft():
    picks, positions, proj, repl = _fixture()
    capped = DR.replay_draft(picks, set(), proj, repl, positions,
                             caps={"QB": 1, "RB": 7, "WR": 7, "TE": 2},
                             starters={"QB": 1, "RB": 1, "WR": 1, "TE": 0},
                             flex_slots=0)
    open_caps = DR.replay_draft(picks, set(), proj, repl, positions,
                                caps=EAR.OPEN_CAPS,
                                starters={"QB": 1, "RB": 1, "WR": 1, "TE": 0},
                                flex_slots=0)
    # Capped: exactly one QB. Uncapped: the rail still forces RB/WR starters,
    # but the spare picks go to more QBs.
    assert _tool_positions(capped, positions).count("QB") == 1
    assert _tool_positions(open_caps, positions).count("QB") > 1
    assert capped["tool_roster"] != open_caps["tool_roster"]


def test_feasibility_rail_ablation_changes_the_draft_where_the_rail_binds():
    picks, positions, proj, repl = _fixture()
    railed = DR.replay_draft(picks, set(), proj, repl, positions,
                             caps=EAR.OPEN_CAPS,
                             starters={"QB": 1, "RB": 2, "WR": 1, "TE": 0},
                             flex_slots=0)
    unrailed = DR.replay_draft(picks, set(), proj, repl, positions,
                               caps=EAR.OPEN_CAPS,
                               starters=EAR.NO_STARTERS, flex_slots=0)
    # With 4 picks and 4 starter slots the rail forces RB/RB/WR after QB1;
    # without it the tool takes all four QBs.
    assert railed["forced_picks"] > 0
    assert _tool_positions(unrailed, positions) == ["QB", "QB", "QB", "QB"]
    assert _tool_positions(railed, positions).count("QB") == 1


def test_no_starters_parameterization_never_forces():
    picks, positions, proj, repl = _fixture()
    unrailed = DR.replay_draft(picks, set(), proj, repl, positions,
                               caps=EAR.OPEN_CAPS,
                               starters=EAR.NO_STARTERS, flex_slots=0)
    assert unrailed["forced_picks"] == 0


def test_configs_cover_the_declared_ladder():
    assert set(EAR.CONFIGS) == {"primary", "minus_onesie_caps",
                                "minus_feasibility_rail",
                                "minus_position_caps", "minus_all_rails"}
    # primary must BE the harness defaults — anything else and the parity pin
    # against the committed replay is comparing different policies.
    caps, starters, flex, _ = EAR.CONFIGS["primary"]
    assert caps is DR.POSITION_CAPS
    assert starters is DR.STARTER_SLOTS
    assert flex == DR.FLEX_SLOTS


def test_committed_artifact_shape_and_parity_discipline():
    doc = json.loads(ARTIFACT.read_text())
    # _territory first — the artifact discipline every research file carries.
    assert next(iter(doc)) == "_territory"
    assert doc["question_verbatim"] == EAR.QUESTION_VERBATIM
    assert set(doc["years"]) == {"2023", "2024", "2025"}
    committed = json.loads(
        (ROOT / "draft" / "data" / "draft_replay_2025.json").read_text())
    for y in ("2023", "2024", "2025"):
        cells = doc["years"][y]["cells"]
        # The parity the driver enforces before writing, re-checked on the
        # committed copy: primary == the replay audit's primary cell, and the
        # onesie-cap ablation == the grid's room_caps cell.
        assert cells["primary"]["delta_tool_minus_cory"] == \
            committed["years"][y]["arms"]["optimal"]["delta_tool_minus_cory"]
        assert cells["minus_onesie_caps"]["delta_tool_minus_cory"] == \
            committed["years"][y]["sensitivity_grid_optimal_arm"]["room_caps"][
                "delta_tool_minus_cory"]
    # Every sim-frame layer that cannot run here is named with a reason —
    # the honesty boundary is data, not prose.
    for layer in ("wire_bench", "kov_term", "room_mix", "conserve",
                  "opportunity", "depth_chart", "seat_plan"):
        assert layer in doc["not_period_computable"]
    # n=3 honesty: no CI fields anywhere in the pooled block.
    assert "ci95" not in json.dumps(doc["pooled_layer_contribution"])


def test_artifact_internal_consistency():
    doc = json.loads(ARTIFACT.read_text())
    for y, yd in doc["years"].items():
        prim = yd["cells"]["primary"]["delta_tool_minus_cory"]
        for name, cell in yd["cells"].items():
            if name == "primary":
                continue
            key = name.replace("minus_", "")
            assert abs(yd["layer_contribution_optimal_pts"][key]
                       - round(prim - cell["delta_tool_minus_cory"], 2)) < 1e-6
    for key, row in doc["pooled_layer_contribution"].items():
        vals = list(row["per_year"].values())
        assert abs(row["mean_pts_per_season"]
                   - round(sum(vals) / len(vals), 2)) < 1e-6
        assert row["sign_stable_across_years"] == (
            all(v > 0 for v in vals) or all(v < 0 for v in vals))
