"""EXP 34 DOLLAR ARM — pure core, verifiable WITHOUT egress.

The dollar arm's grading is pure over the HARVEST (`league_history.json`), so the
whole roster->weekly->dollars pipeline is exercisable in the sandbox with a
SYNTHETIC ranker — only the ranker's inputs (FFC ADP + nflverse priors) need
egress, and those pick WHICH players, not HOW the money is graded. This tests the
logic that is easy to get wrong: the counterfactual available pool, the full-seat
guarantee, the single-pick-swap marginal attribution, and the aggregate/interval.

Run: python -m pytest draft/tests/test_exp34_dollars.py -q
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backtest"))
import exp34_dollars as D          # noqa: E402
import money_grade as MG           # noqa: E402

HIST = json.loads((ROOT / "data" / "league_history.json").read_text())
PAY = json.loads((ROOT / "config" / "payouts.json").read_text())


# ── a tiny synthetic draft fixture for the pure roster-construction logic ──
# Cory is roster_id 2. Overall picks 1..8; Cory picks at 2, 4(KEEPER), 6, 8.
FIX = {
    "season": 2099,
    "owners": {"1": {"display_name": "rival"}, "2": {"display_name": "coryjsimms"}},
    "drafts": [{"picks": [
        {"pick_no": 1, "round": 1, "roster_id": 1, "player_id": "a", "is_keeper": None},
        {"pick_no": 2, "round": 1, "roster_id": 2, "player_id": "b", "is_keeper": None},   # cory
        {"pick_no": 3, "round": 1, "roster_id": 1, "player_id": "c", "is_keeper": None},
        {"pick_no": 4, "round": 1, "roster_id": 2, "player_id": "k", "is_keeper": True},   # cory KEEPER
        {"pick_no": 5, "round": 1, "roster_id": 1, "player_id": "e", "is_keeper": None},
        {"pick_no": 6, "round": 1, "roster_id": 2, "player_id": "f", "is_keeper": None},   # cory
        {"pick_no": 7, "round": 1, "roster_id": 1, "player_id": "g", "is_keeper": None},
        {"pick_no": 8, "round": 1, "roster_id": 2, "player_id": "h", "is_keeper": None},   # cory
    ]}],
}
PICKS = FIX["drafts"][0]["picks"]
RID = 2


def test_keepers_anchor_both_policies():
    assert D.cory_keepers(PICKS, RID) == ["k"]


def test_full_seat_and_pick_order():
    # A ranker that always takes the alphabetically-first available id.
    def alpha(avail):
        return min(avail) if avail else None
    roster, trace = D.build_policy_roster(PICKS, RID, alpha)
    # keeper leads; then one body per non-keeper decision (3 of them: picks 2,6,8)
    assert roster[0] == "k"
    assert len(roster) == 1 + 3, roster
    assert [t["pick_no"] for t in trace] == [2, 6, 8]


def test_counterfactual_pool_addback_and_no_repeat():
    # Deterministic ranker: prefer this fixed priority order where available.
    priority = ["b", "a", "f", "h", "c", "e", "g"]
    rank = {pid: i for i, pid in enumerate(priority)}   # lower = better

    def pick(avail):
        cand = [(rank[p], p) for p in avail if p in rank]
        return min(cand)[1] if cand else None

    roster, trace = D.build_policy_roster(PICKS, RID, pick)
    chosen = [t["chosen"] for t in trace]
    # slot 1 (pick 2): board = {b,c,k,e,f,g,h} minus keeper k -> best by priority = b
    assert chosen[0] == "b"
    # slot 2 (pick 6): 'a' was Cory's? no — 'a' went to rival at pick 1, so NOT on the
    # board. Add-back only returns Cory's OWN earlier real picks ('b'), already taken.
    # board_before(6) = {f,g,h} (a,b,c,k,e gone) -> best by priority among {f,g,h} = f
    assert chosen[1] == "f", chosen
    # slot 3 (pick 8): board_before(8) = {h} -> h
    assert chosen[2] == "h", chosen
    # no id repeats across the roster
    assert len(set(roster)) == len(roster)


def test_addback_lets_policy_take_corys_own_earlier_pick():
    # If the policy DIDN'T take Cory's real slot-1 pick 'b', 'b' is back on the board
    # at slot 2 (Cory didn't take it in this counterfactual).
    # Ranker: at slot 1 prefer 'c'... but 'c' (rival, pick 3) isn't on board at pick 2.
    # Use a ranker that takes 'f' first (available at pick 2), leaving 'b' for later.
    order = ["f", "b", "h", "g"]
    rank = {pid: i for i, pid in enumerate(order)}

    def pick(avail):
        cand = [(rank[p], p) for p in avail if p in rank]
        return min(cand)[1] if cand else None

    roster, trace = D.build_policy_roster(PICKS, RID, pick)
    chosen = [t["chosen"] for t in trace]
    # slot1 pick2: board has f -> take f (not b)
    assert chosen[0] == "f"
    # slot2 pick6: 'b' is added back (Cory's real slot-1 pick he didn't take here) and
    # board_before(6) also lacks it, but add-back restores it -> best by order among
    # {b, g, h(? not yet)} ... board_before(6)={f,g,h}\{f taken} + addback{b} = {b,g,h}
    # -> b ranks best
    assert chosen[1] == "b", chosen


def test_fallback_when_ranker_blind():
    # A ranker that can rank nobody -> every slot falls back to Cory's real pick.
    roster, trace = D.build_policy_roster(PICKS, RID, lambda avail: None)
    assert all(t["used_fallback"] for t in trace)
    assert [t["chosen"] for t in trace] == ["b", "f", "h"]   # Cory's real non-keeper picks


# ── the grading pipeline over the REAL harvest (pure; no egress) ──
def _cory_rid(season_num):
    s = MG.season_of(HIST, season_num)
    owners = s.get("owners") or {}
    items = owners.items() if isinstance(owners, dict) else enumerate(owners)
    for k, o in items:
        if (o or {}).get("display_name") == "coryjsimms":
            return int(k) if str(k).isdigit() else int(o.get("roster_id"))
    return None


def test_real_roster_grades_bounded_and_decomposed():
    """A synthetic policy roster built from real drafted ids grades to real dollars,
    bounded by the pot, decomposed into the three components. This certifies the
    dollar arm's own machinery end-to-end against the certified grader."""
    import exp34 as X
    import roster_sim as RS
    for yr in (2023, 2024, 2025):
        s = MG.season_of(HIST, yr)
        rid = _cory_rid(yr)
        assert rid is not None
        picks = X.real_draft(s)
        pos = RS.infer_positions(s)
        # "actual" policy = always keep Cory's real pick (ranker returns None)
        roster, _ = D.build_policy_roster(picks, rid, lambda a: None)
        g = D.roster_dollars(HIST, PAY, yr, rid, roster, pos)
        d = D._dollars_of(g)
        pot = MG.season_pay(PAY, yr)["total_pot"] or 4000
        for comp in D.COMPONENTS:
            assert d[comp] is None or d[comp] >= 0, (yr, comp, d[comp])
        assert d["total"] is not None and 0 <= d["total"] <= pot, (yr, d["total"])


def test_season_delta_and_marginal_shapes():
    import exp34 as X
    import roster_sim as RS
    yr = 2024
    s = MG.season_of(HIST, yr)
    rid = _cory_rid(yr)
    picks = X.real_draft(s)
    pos = RS.infer_positions(s)
    # two different synthetic rankers to force a real delta:
    #   "our"  = highest fake proj (prefer high player_id numbers)
    #   "adp"  = lowest fake adp (prefer low player_id numbers)
    ids = sorted({str(p["player_id"]) for p in picks}, key=lambda x: int(x) if x.isdigit() else 0)
    proj = {pid: float(int(pid)) for pid in ids if pid.isdigit()}
    adp = {pid: float(int(pid)) for pid in ids if pid.isdigit()}
    keepers = D.cory_keepers(picks, rid)
    our_roster, our_trace = D.build_policy_roster(picks, rid, D.our_pick_fn(proj), keepers=keepers)
    adp_roster, _ = D.build_policy_roster(picks, rid, D.adp_pick_fn(adp), keepers=keepers)
    row = D.season_delta(HIST, PAY, yr, rid, our_roster, adp_roster, pos)
    assert set(row["delta"]) == set(D.COMPONENTS + ("total",))
    marg = D.marginal_dollars_by_band(HIST, PAY, yr, rid, adp_roster, our_trace, proj, pos)
    assert len(marg) == len(our_trace)
    # marginal for a non-deviation slot must be exactly 0
    for m in marg:
        if not m["deviated"]:
            assert m["marginal_dollars"] == 0.0


def test_aggregate_verdict_and_interval():
    # inconclusive when the per-season deltas straddle zero
    rows = [{"season": "2023", "delta": {"total": 100.0, "weekly_high": 0, "regular_season": 0, "playoff": 100.0}},
            {"season": "2024", "delta": {"total": -120.0, "weekly_high": 0, "regular_season": 0, "playoff": -120.0}},
            {"season": "2025", "delta": {"total": 10.0, "weekly_high": 0, "regular_season": 0, "playoff": 10.0}}]
    agg = D.aggregate(rows)
    assert agg["n_seasons"] == 3
    assert agg["thin"] is True
    lo, hi = agg["ci95_mean_season"]
    assert lo <= 0 <= hi
    assert agg["verdict"] == "inconclusive"
    # a clean, consistent win reads as our-earns-more
    win = [{"season": s, "delta": {"total": v, "weekly_high": 0, "regular_season": 0, "playoff": v}}
           for s, v in [("2023", 200.0), ("2024", 220.0), ("2025", 260.0), ("2026", 240.0)]]
    aw = D.aggregate(win)
    assert aw["verdict"] == "our-earns-more"
    assert aw["sign_consistent"] is True


def test_agreement_interesting_result():
    # ranks better (corr beat) but dollars inconclusive -> the thin-n framing
    agg = {"verdict": "inconclusive"}
    ag = D._agreement(agg, {"verdict": "beat"})
    assert ag["ranks_better"] is True
    assert "inconclusive" in ag["state"]
    # ranks better but ADP earns more -> THE INTERESTING RESULT (portfolio doctrine)
    ag2 = D._agreement({"verdict": "adp-earns-more"}, {"verdict": "beat"})
    assert "PORTFOLIO DOCTRINE" in ag2["state"].upper()
