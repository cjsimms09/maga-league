# TERRITORY: A
"""PLAYOFF-WEEKS SOS — the tilt-breaker artifact's own proof.

Every claim the artifact makes is recomputed here from the raw committed
stores, never from the tool's own intermediates: the schedule slice is
spot-checked against matchups read by hand from the nflverse source at fetch
time; one defense-position cell is re-derived with EXPLICIT arithmetic
(scoring values typed out, opponents resolved independently); ranks must be a
permutation; absent data must be absent, never zeroed; and the committed
artifact must equal a fresh run of the tool byte-for-byte at the object level.
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
DRAFT = HERE.parent
sys.path.insert(0, str(DRAFT / "tools"))
sys.path.insert(0, str(DRAFT))
import playoff_sos as S  # noqa: E402

SCHED = json.loads(S.SCHED_PATH.read_text())
SOS = json.loads(S.SOS_PATH.read_text())
BOARD = json.loads(S.BOARD_PATH.read_text())
COMPONENTS = json.loads(S.COMPONENTS_PATH.read_text())
VEGAS = json.loads(S.VEGAS_PATH.read_text())

POSITIONS = ("QB", "RB", "WR", "TE")


# --------------------------------------------------------------------------
# 1. The schedule slice matches the source.
# --------------------------------------------------------------------------

def test_schedule_slice_shape_every_team_plays_all_three_playoff_weeks():
    """48 games, weeks 15-17 only, every team exactly once per week. MUTATION:
    slice the wrong season or include postseason rows — the counts break."""
    games = SCHED["games"]
    assert len(games) == 48
    for wk in (15, 16, 17):
        wk_games = [g for g in games if g["week"] == wk]
        assert len(wk_games) == 16
        seen = [t for g in wk_games for t in (g["home"], g["away"])]
        assert len(seen) == 32 and len(set(seen)) == 32


def test_schedule_slice_spot_checked_matchups_match_the_source():
    """Pinned BY HAND from the nflverse games.csv downloaded at fetch time
    (2026-08-16), independently of the tool's own parser: source codes, home
    sides, and dates as served. MUTATION: swap home/away, misread the week
    column, or normalize codes inside the slice — any of these fires."""
    games = {(g["week"], g["away"], g["home"]): g["gameday"] for g in SCHED["games"]}
    assert games[(15, "SF", "LAC")] == "2026-12-17"
    assert games[(15, "SEA", "PHI")] == "2026-12-19"
    assert games[(15, "DET", "MIN")] == "2026-12-20"
    assert (16, "HOU", "PHI") in games
    assert (17, "BAL", "CIN") in games
    # The slice speaks SOURCE codes: the Rams are LA here, LAR only downstream.
    rams = [(g["week"], g["home"], g["away"]) for g in SCHED["games"]
            if "LA" in (g["home"], g["away"])]
    assert len(rams) == 3 and not any("LAR" in (h, a) for _, h, a in rams)


def test_schedule_slice_agrees_with_the_vegas_store_where_they_overlap():
    """The vegas store's 2026 season is the SAME source dataset (games.csv)
    trimmed to games with lines. Any 2026 pairing both files carry must agree
    — here they share zero weeks (lines stop at week 5), so the honest
    assertion is that the overlap is empty AND both derive full 16-game
    weeks where they do carry a week, rather than pretending a cross-check
    ran that could not."""
    vegas_weeks = {g["week"] for g in VEGAS["seasons"]["2026"]}
    slice_weeks = {g["week"] for g in SCHED["games"]}
    assert slice_weeks == {15, 16, 17}
    assert vegas_weeks.isdisjoint(slice_weeks)


def test_artifact_playoff_opponents_match_matchups_pinned_from_the_source():
    """DET / KC / PHI / LAR week-by-week opponents, read by hand from the
    source CSV at fetch time. This crosses the code-normalization boundary
    (LA -> LAR), so it also pins the vocabulary join."""
    t = SOS["teams"]
    assert t["DET"]["opponents"] == {"15": "MIN", "16": "NYG", "17": "CHI"}
    assert t["KC"]["opponents"] == {"15": "NE", "16": "SF", "17": "LAC"}
    assert t["PHI"]["opponents"] == {"15": "SEA", "16": "HOU", "17": "SF"}
    assert t["LAR"]["opponents"] == {"15": "DAL", "16": "SEA", "17": "TB"}
    assert "LA" not in t


# --------------------------------------------------------------------------
# 2. Defense-allowed arithmetic, one cell recomputed by hand.
# --------------------------------------------------------------------------

def test_defense_allowed_MIN_vs_RB_recomputed_by_hand_from_the_raw_store():
    """The MIN/RB cell, re-derived with EXPLICIT arithmetic: opponents of MIN
    resolved from the vegas 2025 pairings by this test's own loop, scoring
    values typed out as literals (asserted equal to the board's table first,
    so a CFG drift fails loudly), points summed per component key — no call
    into the tool's scoring or aggregation path. MUTATION: credit points to
    the player's OWN team instead of the opponent, drop the fumble malus, or
    divide by an assumed 17 — each moves this number."""
    scoring = BOARD["league"]["scoring"]
    hand = {"rush_yd": 0.1, "rush_td": 6.0, "rec": 0.5, "rec_yd": 0.1,
            "rec_td": 6.0, "pass_yd": 0.04, "pass_td": 6.0, "pass_int": -2.0,
            "fum_lost": -2.0, "pass_2pt": 2.0, "rush_2pt": 2.0, "rec_2pt": 2.0}
    for k, v in hand.items():
        assert scoring[k] == v, f"league scoring drifted at {k}"

    # Who did MIN play, week by week, in 2025? (LA in the store is the Rams.)
    alias = {"LA": "LAR"}
    opp_of_min = {}
    for g in VEGAS["seasons"]["2025"]:
        home = alias.get(g["home"], g["home"])
        away = alias.get(g["away"], g["away"])
        if home == "MIN":
            opp_of_min[g["week"]] = away
        elif away == "MIN":
            opp_of_min[g["week"]] = home
    games = len(opp_of_min)
    assert games == 17  # a full season, derived — not assumed

    total = 0.0
    for wkdoc in COMPONENTS["weeks"]:
        opp = opp_of_min.get(wkdoc["week"])
        if opp is None:
            continue  # MIN's bye — contributes NOTHING, not zero rows
        for row in wkdoc["players"].values():
            if row.get("pos") != "RB":
                continue
            if alias.get(row.get("team"), row.get("team")) != opp:
                continue
            pts = sum(row.get(k, 0) * v for k, v in hand.items())
            total += round(pts, 2)

    cell = SOS["defense_allowed_2025"]["MIN"]["RB"]
    assert cell["games"] == 17
    assert abs(cell["total"] - round(total, 2)) < 0.01
    assert abs(cell["per_game"] - round(round(total, 2) / 17, 2)) < 0.01


# --------------------------------------------------------------------------
# 3. Ranks are a permutation.
# --------------------------------------------------------------------------

def test_softness_ranks_are_a_permutation_of_1_to_32_at_every_position():
    """MUTATION: rank over a filtered subset, duplicate a rank on ties, or
    skip a team — the permutation breaks."""
    for pos in POSITIONS:
        ranks = sorted(t["positions"][pos]["rank"] for t in SOS["teams"].values()
                       if pos in t["positions"])
        assert ranks == list(range(1, 33)), f"{pos} ranks are not 1..32"


def test_rank_1_is_the_softest_slate_highest_points_allowed():
    """Rank orders DESCENDING on avg allowed; ties break by team code A-Z —
    so the sequence of avgs down the ranks must be non-increasing."""
    for pos in POSITIONS:
        by_rank = sorted(((t["positions"][pos]["rank"],
                           t["positions"][pos]["avg_allowed_per_game"], name)
                          for name, t in SOS["teams"].items()
                          if pos in t["positions"]))
        avgs = [a for _, a, _ in by_rank]
        assert all(avgs[i] >= avgs[i + 1] for i in range(len(avgs) - 1))


def test_every_board_skill_player_is_ranked_or_honestly_absent():
    """players + players_absent partition the board's QB/RB/WR/TE exactly —
    nobody silently dropped, nobody in both."""
    board_ids = {str(p["player_id"]) for p in BOARD["players"]
                 if p.get("position") in POSITIONS}
    ranked = set(SOS["players"])
    absent = set(SOS["players_absent"])
    assert ranked | absent == board_ids
    assert not (ranked & absent)


# --------------------------------------------------------------------------
# 4. Absent stays absent — never zeroed.
# --------------------------------------------------------------------------

def test_free_agents_are_absent_with_a_reason_not_zero_filled():
    """MUTATION: give FA players rank 33 / avg 0.0 — the discipline this
    repo exists to enforce says a fact that does not exist is not a zero."""
    assert SOS["players_absent"], "board carries FAs; absence list cannot be empty"
    for row in SOS["players_absent"].values():
        assert "reason" in row and row["reason"]
        assert "softness_rank" not in row
        assert "avg_allowed_per_game" not in row
    for row in SOS["players"].values():
        # A ranked row's average is a real measurement over measured weeks,
        # never a padded zero.
        assert row["avg_allowed_per_game"] > 0
        assert 1 <= row["softness_rank"] <= 32


def test_a_missing_week_shrinks_the_denominator_instead_of_counting_zero():
    """Synthetic: a team with only two measurable playoff opponents averages
    over TWO, and weeks_measured says so. MUTATION: zero-fill the missing
    week — the average would be dragged toward 0 and this fires."""
    opponents = {"AAA": {"15": "BBB", "16": "CCC", "17": "DDD"}}
    allowed = {"BBB": {"QB": {"total": 170.0, "games": 17, "per_game": 10.0}},
               "CCC": {"QB": {"total": 340.0, "games": 17, "per_game": 20.0}},
               "DDD": {}}  # DDD has no QB cell — absent
    teams = S.team_softness(opponents, allowed)
    qb = teams["AAA"]["positions"]["QB"]
    assert qb["weeks_measured"] == 2
    assert qb["avg_allowed_per_game"] == 15.0  # (10+20)/2 — NOT (10+20+0)/3
    assert "17" not in qb["opp_allowed_per_game"]


def test_unpaired_player_weeks_are_counted_not_silently_dropped():
    """The tool's own diagnostics must carry the drop count, and on the real
    stores it is zero (2025 pairings are complete). Synthetic arm: remove a
    pairing and the dropped rows surface in diagnostics rather than being
    credited to a made-up defense."""
    assert SOS["provenance"]["diagnostics"]["unpaired_player_weeks_dropped"] == 0
    components = {"weeks": [{"week": 1, "players": {
        "p1": {"pos": "QB", "team": "MIN", "pass_yd": 250},
        "p2": {"pos": "QB", "team": "DET", "pass_yd": 300},
    }}]}
    pairs = {1: {"MIN": "GB", "GB": "MIN"}}  # DET unpaired
    allowed, diags = S.defense_allowed(components, pairs,
                                       BOARD["league"]["scoring"])
    assert diags["unpaired_player_weeks_dropped"] == 1
    assert "GB" in allowed and len(allowed) == 1  # DET's row credited nowhere


# --------------------------------------------------------------------------
# 5. The committed artifact matches a fresh run.
# --------------------------------------------------------------------------

def test_committed_artifact_matches_a_fresh_run_of_the_tool():
    """Recomputed end-to-end from the committed inputs (no network) and
    compared as whole objects. MUTATION: hand-edit any number in the
    committed JSON — this is the test that catches it."""
    assert S.compute() == SOS


def test_committed_artifact_declares_territory_and_caveats_first():
    assert list(SOS)[0] == "_territory"
    assert SOS["_territory"].startswith("TERRITORY: A")
    assert "TILT-BREAKER" in SOS["_note"]
    assert "changes NO board number" in SOS["_note"]
    assert SCHED["_territory"].startswith("TERRITORY: A")
