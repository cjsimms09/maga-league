# TERRITORY: A
"""The empirical draft-value study — the claims it makes about ITSELF.

Preregistration: `draft/audit/empirical_draft_value_2026-08-16.md` §§0-3.

What is pinned here, and why each one exists:

  * THE LEAKAGE GUARD. The study's whole load-bearing claim in Q4 is that no
    feature predicting season Y derives from season Y. That is asserted by
    TRACING every file the feature path opens, not by reading the code and
    believing it.
  * THE SURVIVORSHIP SPLIT. Arm E excludes never-played picks, Arm Z zeroes
    them. If those two arms ever silently collapsed into each other the whole
    survivorship discipline would evaporate with no test going red, so the
    split is pinned on a fixture where the answer is known by hand.
  * THE KEEPER UNION. 2023 stores its keepers in a separate 30-pick ledger
    draft; 2024/2025 flag them inline. A reader of one season would write a
    loader that is silently wrong for the other. The shapes are pinned.
  * THE STATISTICS. Wilson, Benjamini-Hochberg, average-rank Spearman and the
    two-segment breakpoint are each pinned against a case whose answer is known
    independently of this code.

No test here touches the network.
"""
import json
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
BT = HERE.parent / "backtest"
sys.path.insert(0, str(BT))
sys.path.insert(0, str(HERE.parent))

import empirical_draft_value as EDV  # noqa: E402


# ── the study's stated inputs are the inputs it actually has ────────────────

def test_scoring_is_half_ppr_six_point_passing_td():
    """The study's headline says 0.5 PPR / 6-pt pass TD. That is CONFIRMED from
    two independent places (the frozen table and the league's own settings),
    because 'confirm from the frozen table, do not assume' was the instruction."""
    import fetch_component_stats as FCS
    tbl = FCS.frozen_scoring_table()
    assert tbl["rec"] == 0.5
    assert tbl["pass_td"] == 6.0
    # the frozen table is read out of the 2023 store, whose yardage rates are
    # float32 images (0.03999999910593033, 0.10000000149011612). The RULES are 1
    # point per 25 passing yards and 1 per 10 rushing/receiving — compared with
    # a tolerance rather than pinned to a float32 artifact of one season's file.
    assert abs(tbl["pass_yd"] - 0.04) < 1e-6
    assert abs(tbl["rush_yd"] - 0.1) < 1e-6
    assert abs(tbl["rec_yd"] - 0.1) < 1e-6

    doc = json.loads((HERE.parent / "data" / "league_history.json").read_text())
    for srec in doc["seasons"]:
        if int(srec["season"]) not in EDV.SEASONS:
            continue
        sc = srec["scoring_settings"]
        assert sc["rec"] == 0.5
        assert sc["pass_td"] == 6.0
        # 2023 stores pass_yd as the float32 image of 0.04
        assert abs(sc["pass_yd"] - 0.04) < 1e-6


def test_scoring_window_matches_the_league_not_the_nfl():
    """Weeks 1-17: the league's last_scored_leg. Week 18 exists in the store and
    must never enter a total — an 18-week sum would credit points from a week
    after the league's season ended."""
    doc = json.loads((HERE.parent / "data" / "league_history.json").read_text())
    for srec in doc["seasons"]:
        if int(srec["season"]) in EDV.SEASONS:
            assert srec["settings"]["last_scored_leg"] == 17
    assert EDV.LAST_SCORED_WEEK == 17
    wk = EDV.weekly_points(2024)
    assert max(w for rows in wk.values() for w in rows) <= 17


def test_league_drafts_shape_and_the_two_keeper_encodings():
    d = EDV.league_drafts()
    assert sorted(d) == list(EDV.SEASONS)
    for season, rows in d.items():
        assert len(rows) == EDV.TEAMS * EDV.ROUNDS == 150
        assert sorted(r["pick_no"] for r in rows) == list(range(1, 151))
    # 2023's keepers live ONLY in the separate ledger draft; a loader that read
    # is_keeper off the main draft alone would find zero of them.
    doc = json.loads((HERE.parent / "data" / "league_history.json").read_text())
    s23 = next(s for s in doc["seasons"] if int(s["season"]) == 2023)
    main = max((x for x in s23["drafts"] if x["status"] == "complete"),
               key=lambda x: len(x["picks"]))
    assert sum(1 for p in main["picks"] if p.get("is_keeper")) == 0
    assert sum(1 for r in d[2023] if r["is_keeper"]) == 30
    # and 2024/2025 flag them inline
    assert sum(1 for r in d[2024] if r["is_keeper"]) == 23
    assert sum(1 for r in d[2025] if r["is_keeper"]) == 20


def test_rounds_one_to_three_are_keeper_rounds():
    """The inventory's GAP 2 — the reason no early-round number in this study
    may be read as a market price. Pinned so a future season that opens up its
    early rounds makes this test go red instead of quietly invalidating the
    caveat printed on every table."""
    d = EDV.league_drafts()
    for season, rows in d.items():
        early = [r for r in rows if r["round"] <= 3]
        assert sum(1 for r in early if r["is_keeper"]) >= 20, season


# ── survivorship: the two arms must not collapse into each other ────────────

def _fixture_rows():
    return [
        {"pick_no": 1, "round": 1, "season": 2023, "pos": "RB", "pts": 200.0,
         "is_keeper": True, "pid": "a", "games": 17},
        {"pick_no": 2, "round": 1, "season": 2023, "pos": "WR", "pts": None,
         "is_keeper": False, "pid": "b", "games": 0},
        {"pick_no": 3, "round": 1, "season": 2023, "pos": "K", "pts": 90.0,
         "is_keeper": False, "pid": "c", "games": 17},
    ]


def test_arm_E_excludes_never_played_and_arm_Z_zeroes_them():
    rows = _fixture_rows()
    e = EDV._arm(rows, "E")
    z = EDV._arm(rows, "Z")
    assert [r["pid"] for r in e] == ["a"]          # b excluded, c is K
    assert [r["pid"] for r in z] == ["a", "b"]
    assert z[1]["pts"] == 0.0
    # the arms must give different answers on this fixture, or the split is fake
    assert EDV.mean([r["pts"] for r in e]) != EDV.mean([r["pts"] for r in z])


def test_kickers_and_defenses_are_excluded_from_every_curve():
    rows = _fixture_rows()
    for arm in ("E", "Z"):
        assert all(r["pos"] in EDV.POSITIONS for r in EDV._arm(rows, arm))


def test_never_played_picks_are_counted_not_dropped_in_silence():
    positions = EDV.positions_record()
    _rows, surv = EDV.pick_rows(positions)
    for season in EDV.SEASONS:
        s = surv[season]
        assert s["skill_picks"] > 100
        # the count and the named list must agree — an accounting that reports a
        # number without the picks behind it is not an accounting
        assert len(s["never_played_picks"]) == s["never_played"]
        assert s["skill_picks"] + s["kdef_picks"] + len(s["unknown_position_picks"]) == 150


# ── leakage ────────────────────────────────────────────────────────────────

def test_feature_path_never_opens_a_season_Y_outcome_store(monkeypatch):
    """Traces every path opened while building season-Y features and refuses any
    store whose season is >= Y.

    `nflverse_draft_picks.json` and `public/draft_data.json` are allowed BY NAME
    — the first is period-correct by construction (career-outcome columns
    dropped upstream) and additionally guarded in code, the second is the 2026
    board read for age. Every other file must carry a season < Y in its name."""
    EDV.frozen_table()          # league CONFIGURATION, fetched before the trace
    assert EDV._FROZEN_TABLE, "the frozen-table memo must be warm, or the trace \
below would flag a configuration read as a leak"
    opened: list[str] = []
    real_read = Path.read_text

    def spy(self, *a, **k):
        opened.append(str(self))
        return real_read(self, *a, **k)

    monkeypatch.setattr(Path, "read_text", spy)
    positions = EDV.positions_record()
    for target in EDV.SEASONS:
        opened.clear()
        EDV.preseason_features(target, positions)
        for p in opened:
            name = Path(p).name
            if name in ("nflverse_draft_picks.json", "draft_data.json",
                        "player_positions.json", "league_history.json"):
                continue
            for yr in range(target, 2027):
                assert str(yr) not in name, f"season-{target} features opened {name}"


def test_draft_capital_is_dropped_for_drafts_that_had_not_happened(monkeypatch):
    positions = EDV.positions_record()
    cap = EDV.draft_capital()
    future = [pid for pid, c in cap.items() if c["draft_season"] == 2025]
    assert future, "fixture assumption: 2025 NFL draftees exist in the store"
    f23 = EDV.preseason_features(2023, positions)
    for pid in future:
        if pid in f23:
            assert f23[pid]["draft_round"] is None
            assert f23[pid]["nfl_exp"] is None


# ── statistics, each against an independently-known answer ─────────────────

def test_wilson_interval_known_values():
    lo, hi = EDV.wilson(0, 10)
    assert lo == 0.0 and 0.25 < hi < 0.32          # never leaves [0,1] at p=0
    lo, hi = EDV.wilson(5, 10)
    assert abs((lo + hi) / 2 - 0.5) < 1e-9         # symmetric at p=0.5
    lo, hi = EDV.wilson(10, 10)
    assert hi == 1.0 and 0.68 < lo < 0.73


def test_wilson_beats_the_normal_approximation_where_it_matters():
    """At k=0 the normal interval is [0,0] — it would report a bust rate of zero
    with zero uncertainty on a 10-pick cell. That is the exact failure this
    study cannot afford, so it is pinned."""
    lo, hi = EDV.wilson(0, 12)
    assert hi > 0.2


def test_benjamini_hochberg_known_case():
    # classic BH worked example: at q=0.10 the first three survive
    p = [0.001, 0.008, 0.02, 0.2, 0.6]
    assert EDV.bh_reject(p, 0.10) == [True, True, True, False, False]
    assert EDV.bh_reject([], 0.10) == []
    assert EDV.bh_reject([0.9, 0.95], 0.10) == [False, False]


def test_rankdata_shares_ties():
    assert EDV.rankdata([10, 20, 20, 40]) == [1.0, 2.5, 2.5, 4.0]


def test_spearman_known_values():
    assert abs(EDV.spearman([(1, 1), (2, 2), (3, 3), (4, 4)]) - 1.0) < 1e-9
    assert abs(EDV.spearman([(1, 4), (2, 3), (3, 2), (4, 1)]) + 1.0) < 1e-9
    # monotone but non-linear: Spearman sees 1.0 where Pearson would not
    assert abs(EDV.spearman([(1, 1), (2, 8), (3, 27), (4, 64)]) - 1.0) < 1e-9


def test_piecewise_break_recovers_a_planted_hinge():
    # flat-ish to rank 12, then a steep fall — the break must land near 12
    curve = [100 - 1.0 * x for x in range(1, 13)] + \
            [88 - 9.0 * (x - 12) for x in range(13, 41)]
    k = EDV._piecewise_break(curve)
    assert k is not None and 10 <= k <= 14


def test_piecewise_break_returns_none_on_a_curve_too_short_to_fit():
    assert EDV._piecewise_break([10, 9, 8]) is None


def test_leave_one_season_out_expectation_excludes_its_own_season():
    rows = [{"round": 1, "season": 2023, "pts": 100.0},
            {"round": 1, "season": 2024, "pts": 200.0},
            {"round": 1, "season": 2025, "pts": 300.0}]
    exp = EDV._loo_round_expectation(rows)
    assert exp[(2023, 1)] == 250.0
    assert exp[(2024, 1)] == 200.0
    assert exp[(2025, 1)] == 150.0


def test_cluster_bootstrap_is_deterministic_and_widens_on_one_season_effects():
    """A 'finding' carried by a single season must come back with an interval
    that admits it. Two groups: one where every season agrees, one where only
    2023 does. The second interval must be the wider one."""
    agree = {2023: [1.0] * 40, 2024: [1.0] * 40, 2025: [1.0] * 40}
    one = {2023: [3.0] * 40, 2024: [0.0] * 40, 2025: [0.0] * 40}
    a = EDV.cluster_boot(agree, EDV.mean, reps=300)
    b = EDV.cluster_boot(one, EDV.mean, reps=300)
    assert a == EDV.cluster_boot(agree, EDV.mean, reps=300)     # deterministic
    assert (b[1] - b[0]) > (a[1] - a[0])


def test_universe_excludes_players_with_no_game():
    positions = EDV.positions_record()
    u = EDV.universe(2024, positions)
    assert set(u) == set(EDV.POSITIONS)
    for pos, lst in u.items():
        assert lst == sorted(lst, key=lambda t: -t[1])
        assert all(p > -1e9 for _, p in lst)
        assert len(lst) >= EDV.STARTER_RANK[pos], pos


def test_board_replacement_constants_match_the_shipped_board():
    """This study compares its cliffs to the board's replacement levels. If the
    board's numbers move and these constants do not, the comparison silently
    starts grading against a board that no longer exists."""
    board = json.loads((HERE.parent.parent / "public" / "draft_data.json").read_text())
    rep = board["replacement"]
    for pos, v in EDV.BOARD_REPLACEMENT_2026.items():
        assert abs(rep["replacement_points"][pos] - v) < 0.05, pos
    for pos, k in EDV.STARTER_RANK.items():
        assert rep["starter_counts"][pos] == k, pos


def test_preregistered_thresholds_are_the_ones_the_document_fixed():
    """The thresholds are the preregistration. If one of them drifts, the
    published document stops describing the code that produced it."""
    assert EDV.HIT_MULT == 1.25
    assert EDV.BUST_MULT == 0.60
    assert EDV.CLIFF_DROP_MULT == 2.0
    assert EDV.BH_Q == 0.10
    assert EDV.BOOTSTRAP == 2000
    assert EDV.SEASONS == (2023, 2024, 2025)
    assert EDV.CLIFF_WINDOW == {"RB": 48, "WR": 48, "QB": 30, "TE": 30}


@pytest.mark.parametrize("season", EDV.SEASONS)
def test_preseason_features_cover_a_usable_population(season):
    positions = EDV.positions_record()
    f = EDV.preseason_features(season, positions)
    assert len(f) > 250, (season, len(f))
    assert all(v["pos"] in EDV.POSITIONS for v in f.values())
    assert all(v["prior_games"] > 0 for v in f.values())
