"""Full-board pick audit — pure core, no egress.
Run: python -m pytest draft/tests/test_exp43.py -q
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backtest"))
import exp43_fullboard as FB  # noqa: E402


def _row(season, seat, pick_no, rnd, pos, adp, realized):
    return {"season": season, "roster_id": seat, "pick_no": pick_no, "round": rnd,
            "position": pos, "adp": adp, "realized": realized}


def test_reach_and_residual_signs():
    rows = [_row(2023, 1, 40, 4, "RB", 25, 100)]   # picked at 40, adp 25 -> reached 15
    out = FB.with_residuals(rows)
    assert out[0]["reach"] == 15.0                  # pick_no - adp, positive = reach
    # single row: expected == its own realized -> residual 0; sign logic tested below


def test_residual_is_relative_to_adp_curve():
    # Low-ADP players return ~200; high-ADP ~50. A high-ADP player returning 200
    # is a huge positive residual; a low-ADP player returning 50 is negative.
    rows = []
    for i in range(20):
        rows.append(_row(2023, 1, i + 1, 1, "WR", i + 1, 200))       # early, high value
    for i in range(20):
        rows.append(_row(2023, 2, i + 100, 10, "WR", i + 100, 50))   # late, low value
    steal = _row(2023, 3, 150, 12, "WR", 119.5, 220)   # late ADP (distinct), elite outcome
    bust = _row(2023, 4, 5, 1, "WR", 3.5, 40)          # early ADP (distinct), bust outcome
    rr = FB.with_residuals(rows + [steal, bust])
    steal_r = next(r for r in rr if r["adp"] == 119.5)
    bust_r = next(r for r in rr if r["adp"] == 3.5)
    assert steal_r["residual"] > 80      # beat its (~50-value) slot massively
    assert bust_r["residual"] < -100     # missed its (~200-value) slot massively


def test_residual_is_within_position_qb_does_not_confound():
    # QBs score ~300 raw, WRs ~120. A CROSS-position curve would make every QB read
    # hugely positive and every WR negative from scale alone. Within-position, an
    # AVERAGE QB and an AVERAGE WR both read ~0.
    rows = []
    for i in range(16):
        rows.append(_row(2023, 1, 100 + i, 10, "QB", 100 + i, 300))   # QBs, high scale
    for i in range(16):
        rows.append(_row(2023, 2, 40 + i, 4, "WR", 40 + i, 120))      # WRs, low scale
    rr = FB.with_residuals(rows)
    qb = [r["residual"] for r in rr if r["position"] == "QB"]
    wr = [r["residual"] for r in rr if r["position"] == "WR"]
    # an average member of each position sits near 0 residual — no scale confound
    assert abs(FB._mean(qb)) < 30 and abs(FB._mean(wr)) < 30


def test_floor_marks_thin_cells():
    rows = [_row(2023, 1, i + 1, 4, "TE", i + 1, 100) for i in range(3)]  # n=3 < 8
    out = FB.run(rows)
    cell = out["by_round_position_residual"]["R4-7"]["TE"]
    assert cell["thin"] is True and cell["n"] == 3
    assert "beats_market" not in cell     # no verdict below floor


def test_ci_excludes_zero_only_when_clear():
    # A clean positive-residual owner vs a noisy break-even owner.
    rows = []
    # leaguewide curve: everyone at adp~50 returns ~100 on average
    for i in range(60):
        rows.append(_row(2023, 99, i + 1, 5, "RB", 50, 100))
    # owner 1: consistently +30 above the slot (n=12)
    for i in range(12):
        rows.append(_row(2023, 1, i + 1, 5, "RB", 50, 130))
    out = FB.run(rows)
    o1 = out["who_drafts_well"]["1"]
    assert o1["thin"] is False
    assert o1["beats_market"] is True and o1["ci95"][0] > 0


def test_bh_fdr_is_at_most_nominal():
    # one strong result among 19 clearly non-significant ones: only the strong survives.
    pv = [0.001] + [0.30] * 19
    survive = FB.bh_flags(pv, q=0.10)
    assert 0 in survive                 # the strongest survives
    assert survive == {0}               # multiplicity prunes the marginal ones


def test_cory_vs_field_separates_when_real():
    rows = []
    for i in range(80):
        rows.append(_row(2023, 50, i + 1, 5, "WR", 40, 100))     # field baseline & curve
    for i in range(30):
        rows.append(_row(2023, 7, i + 1, 5, "WR", 40, 140))      # Cory +40 every pick
    out = FB.run(rows, cory_seat=7)
    cvf = out["cory_vs_field"]
    assert cvf["difference"]["mean"] > 0
    assert "different" in cvf["verdict"]


def test_loso_sign_stability():
    # positive in all three seasons -> stable
    rows = []
    for yr in (2023, 2024, 2025):
        for i in range(40):
            rows.append(_row(yr, 60, i + 1, 5, "RB", 40, 100))   # curve
        for i in range(12):
            rows.append(_row(yr, 1, i + 1, 5, "RB", 40, 125))    # owner 1 +25 each yr
    stable = FB.loso_sign_stable(rows, lambda rr: FB._mean(
        [r["residual"] for r in rr if r.get("roster_id") == 1 and r.get("residual") is not None]))
    assert stable is True
