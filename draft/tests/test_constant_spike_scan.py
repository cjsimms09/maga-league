"""The spike scan must FIRE, or it joins the class it polices (rule 3e).

Every arm runs the REAL scan() / main() — a copy of the logic passing is not
evidence about the detector (commitments_check.test.js's rule, applied here).
The live-board arm is the known-positive control: the scan proved it can fire
on its first real run (7 hits, all traced to documented rulings, 08-18).
"""
from __future__ import annotations

import json
import random
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "draft" / "tools"))
import constant_spike_scan as S  # noqa: E402


def synth_players(n=120, seed=7):
    """A clean board: every numeric field genuinely per-player."""
    rng = random.Random(seed)
    return [{"name": f"p{i}",
             "proj_mean": 50 + rng.random() * 250,
             "proj_floor": 30 + rng.random() * 150,
             "adp": 1 + rng.random() * 200}
            for i in range(n)]


def test_clean_board_has_no_findings():
    f = S.scan(synth_players())
    assert f["constant_spikes"] == []
    assert f["ratio_locks"] == []


def test_FAIL_ARM_planted_constant_is_detected():
    """The rookie_affinity shape: a 'measurement' that is one number."""
    players = synth_players()
    for p in players:
        p["dead_field"] = 0.0
    hits = [h["field"] for h in S.scan(players)["constant_spikes"]]
    assert "dead_field" in hits


def test_FAIL_ARM_planted_ratio_lock_is_detected():
    """The proj_ceiling=1.35x shape: field B is field A in a trench coat."""
    players = synth_players()
    for p in players:
        p["proj_ceiling"] = p["proj_mean"] * 1.35
    locks = [tuple(h["pair"]) for h in S.scan(players)["ratio_locks"]]
    assert ("proj_ceiling", "proj_mean") in locks or ("proj_mean", "proj_ceiling") in locks


def test_FAIL_ARM_majority_spike_below_100pct_still_fires():
    """adp_sd's shape: two values across 94.6% — not fully constant, still dead."""
    players = synth_players(n=100)
    for i, p in enumerate(players):
        p["mostly_flat"] = 3.4 if i < 70 else 1.0 + i * 0.01
    hits = [h["field"] for h in S.scan(players)["constant_spikes"]]
    assert "mostly_flat" in hits


def test_known_legitimate_spike_routes_to_known_not_finding():
    players = synth_players()
    for p in players:
        p["adp_season"] = 2026.0
    f = S.scan(players)
    assert "adp_season" in [h["field"] for h in f["known_legitimate_hits"]]
    assert "adp_season" not in [h["field"] for h in f["constant_spikes"]]


def test_every_allowlist_entry_carries_a_reason():
    """An entry without a reason is itself a finding — the docstring's pin,
    made mechanical. The allowlist is only honest while it stays annotated."""
    for field, reason in S.KNOWN_LEGITIMATE.items():
        assert isinstance(reason, str) and len(reason) >= 15, field
    for pair, reason in S.KNOWN_LOCKED_PAIRS.items():
        assert isinstance(reason, str) and len(reason) >= 15, pair


def test_live_board_known_positive_and_report_only_exit():
    """Rule 3e: the scan fires on the REAL board (the ruled opportunity_adj
    pin and the proj identity locks guarantee known hits today), and exits 0
    regardless — report-only is a design pin, not an accident."""
    board = ROOT / "public" / "draft_data.json"
    players = [p for p in json.loads(board.read_text()).get("players", [])
               if p.get("proj_mean")]
    f = S.scan(players)
    assert len(f["known_legitimate_hits"]) + len(f["known_locked_hits"]) >= 3, (
        "the scan found nothing on the live board — either the board changed "
        "shape or the detector lost the ability to fire; both are findings")
    assert S.main(["--board", str(board), "--json"]) == 0
