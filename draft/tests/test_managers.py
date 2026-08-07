"""A1 acceptance tests — league-mate behavioural models."""
from __future__ import annotations
import math
import random
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

import pytest  # noqa: E402
import managers as M  # noqa: E402

TEAMS = 10
ROUNDS = 15

# Planted tendencies. The estimator has to recover these from picks alone.
PERSONAS = {
    "u1": {"qb_round": 3,  "homer": "KC",  "rookies": 0.30},   # early QB, Chiefs homer, rookie chaser
    "u2": {"qb_round": 12, "homer": None,  "rookies": 0.02},   # waits forever on QB
    "u3": {"qb_round": 4,  "homer": "SF",  "rookies": 0.05},
    "u4": {"qb_round": 11, "homer": None,  "rookies": 0.05},
    "u5": {"qb_round": 10, "homer": None,  "rookies": 0.10},
    "u6": {"qb_round": 5,  "homer": "DAL", "rookies": 0.05},
    "u7": {"qb_round": 13, "homer": None,  "rookies": 0.03},
    "u8": {"qb_round": 9,  "homer": None,  "rookies": 0.08},
    "u9": {"qb_round": 6,  "homer": None,  "rookies": 0.04},
    "u10": {"qb_round": 12, "homer": None, "rookies": 0.02},
}
NFL_TEAMS = ["KC", "SF", "DAL", "BUF", "PHI", "CIN", "DET", "MIA"]


def synth_players(n=400):
    """A player DB shaped like Sleeper's."""
    db = {}
    for i in range(1, n + 1):
        pos = ["RB", "WR", "WR", "QB", "TE", "RB", "WR", "K", "DEF", "RB"][i % 10]
        db[str(i)] = {
            "position": pos,
            "team": NFL_TEAMS[i % len(NFL_TEAMS)],
            "search_rank": i,
            "years_exp": 0 if i % 11 == 0 else 3,
            "full_name": f"{pos} {i}",
        }
    return db


def synth_draft(season: str, db: dict, seed: int) -> dict:
    """One draft where each manager follows their persona."""
    rng = random.Random(seed)
    available = sorted(db.keys(), key=lambda k: db[k]["search_rank"])
    picks = []
    pick_no = 0
    # One QB per manager per draft. Without this cap the early-QB personas take
    # a QB in every round of their window and starve the late-QB personas, which
    # is both unrealistic and destroys the signal the test is trying to measure.
    took_qb = set()
    for rnd in range(1, ROUNDS + 1):
        order = list(PERSONAS) if rnd % 2 == 1 else list(reversed(list(PERSONAS)))
        for uid in order:
            pick_no += 1
            persona = PERSONAS[uid]
            pool = available[:40]
            choice = None

            # Persona 1: take exactly one QB, in your usual round (±1).
            if uid not in took_qb and abs(rnd - persona["qb_round"]) <= 1:
                qbs = [p for p in pool if db[p]["position"] == "QB"]
                if qbs:
                    choice = qbs[0]
                    took_qb.add(uid)
            # Persona 2: homer bias.
            if choice is None and persona["homer"] and rng.random() < 0.35:
                homers = [p for p in pool if db[p]["team"] == persona["homer"]]
                if homers:
                    choice = homers[0]
            # Persona 3: rookie affinity.
            if choice is None and rng.random() < persona["rookies"]:
                rooks = [p for p in pool if db[p]["years_exp"] == 0]
                if rooks:
                    choice = rooks[0]
            # Otherwise near-best-available with a little noise, skipping QBs so
            # the planted timing stays the only source of QB signal.
            if choice is None:
                non_qb = [p for p in pool if db[p]["position"] != "QB"]
                candidates = non_qb or pool
                choice = candidates[min(len(candidates) - 1, int(abs(rng.gauss(0, 2))))]
                if db[choice]["position"] == "QB":
                    took_qb.add(uid)

            available.remove(choice)
            info = db[choice]
            picks.append({
                "pick_no": pick_no, "round": rnd, "draft_slot": list(PERSONAS).index(uid) + 1,
                "player_id": choice, "picked_by": uid,
                "metadata": {"position": info["position"], "team": info["team"]},
            })
    return {
        "season": season, "league_id": "L" + season, "draft_id": "D" + season,
        "picks": picks,
        "users": [{"user_id": u, "display_name": u} for u in PERSONAS],
        "rosters": [{"roster_id": i + 1, "owner_id": u} for i, u in enumerate(PERSONAS)],
    }


@pytest.fixture(scope="module")
def history():
    db = synth_players()
    drafts = [synth_draft(str(2021 + i), db, seed=100 + i) for i in range(4)]
    return db, drafts


def test_profiles_build_for_every_manager(history):
    db, drafts = history
    out = M.build_profiles(drafts, db)
    assert out["drafts_analysed"] == 4
    assert len(out["managers"]) == len(PERSONAS)
    for prof in out["managers"].values():
        assert prof["sample_size"] == 4
        assert prof["summary"]
        assert "softmax" in prof


def test_profiles_recover_planted_qb_timing(history):
    db, drafts = history
    out = M.build_profiles(drafts, db)
    early = out["managers"]["u1"]["positional_timing"].get("QB")
    late = out["managers"]["u2"]["positional_timing"].get("QB")
    assert early and late
    assert early["mean_round"] < late["mean_round"] - 3, (
        f"planted early-QB manager ({early['mean_round']}) should land well before "
        f"the late-QB manager ({late['mean_round']})")


def test_profiles_recover_homer_bias(history):
    db, drafts = history
    out = M.build_profiles(drafts, db)
    assert out["managers"]["u1"]["homer_index"]["team"] == "KC"
    assert out["managers"]["u1"]["homer_index"]["rate"] > out["managers"]["u2"]["homer_index"]["rate"]


def test_shrinkage_regresses_thin_samples(history):
    db, drafts = history
    one = M.build_profiles(drafts[:1], db)
    many = M.build_profiles(drafts, db)
    p1 = one["managers"]["u1"]
    p4 = many["managers"]["u1"]
    assert p1["shrinkage_weight"] < p4["shrinkage_weight"]
    league_qb = one["league_average"]["first_round_by_position"]["QB"]
    # With one draft the estimate must sit closer to the league average than the
    # raw observation does — a single draft never drives a strong prior.
    raw = p1["positional_timing"]["QB"]["raw_mean_round"]
    shrunk = p1["positional_timing"]["QB"]["mean_round"]
    assert abs(shrunk - league_qb) < abs(raw - league_qb) + 1e-9
    assert "only 1 prior draft" in p1["summary"]


def test_profiles_beat_league_average_on_heldout_draft(history):
    """THE acceptance test: profiles must predict a held-out draft better than
    a league-average baseline. Scored by log-loss on the position taken."""
    db, drafts = history
    train, heldout = drafts[:3], drafts[3]
    out = M.build_profiles(train, db)
    league_avg = out["league_average"]

    def logloss(use_profiles: bool) -> float:
        total, n = 0.0, 0
        available = {pid: db[pid]["position"] for pid in db}
        for pick in sorted(heldout["picks"], key=lambda p: p["pick_no"]):
            pid = pick["player_id"]
            actual = db[pid]["position"]
            positions = set(available.values())
            if len(positions) < 2:
                break
            profile = out["managers"].get(pick["picked_by"]) if use_profiles else None
            probs = M.predict_position(profile, league_avg, pick["round"], positions)
            total -= math.log(max(1e-9, probs.get(actual, 1e-9)))
            n += 1
            available.pop(pid, None)
        return total / max(1, n)

    with_profiles = logloss(True)
    baseline = logloss(False)
    assert with_profiles < baseline, (
        f"profiles ({with_profiles:.4f}) must beat the league-average baseline "
        f"({baseline:.4f}) on a held-out draft")
    # And by a real margin, not a rounding artefact.
    assert (baseline - with_profiles) / baseline > 0.02, (
        f"improvement {(baseline - with_profiles) / baseline:.3%} is too small to trust")


def test_no_prior_drafts_degrades_gracefully():
    out = M.build_profiles([], {})
    assert out["managers"] == {}
    assert "no prior drafts" in out["note"]


def test_hand_edits_are_never_clobbered(tmp_path, history):
    db, drafts = history
    out = M.build_profiles(drafts, db)
    path = tmp_path / "manager_profiles.json"
    M.save(out, path)

    import json
    edited = json.loads(path.read_text())
    edited["managers"]["u1"]["summary"] = "Trades his whole draft for a six-pack."
    edited["managers"]["u1"]["locked"] = True
    path.write_text(json.dumps(edited))

    M.save(M.build_profiles(drafts, db), path)   # rebuild over the top
    after = json.loads(path.read_text())
    assert after["managers"]["u1"]["summary"] == "Trades his whole draft for a six-pack."


# --- historical ADP de-proxying (work order Phase 1, item 4) -----------------

def _draft_with(season, picks_spec):
    """picks_spec: [(pick_no, manager, player_id, position)]"""
    return {
        "season": str(season),
        "users": [{"user_id": m, "display_name": m} for _, m, _, _ in picks_spec],
        "rosters": [],
        "picks": [{"pick_no": n, "round": (n - 1) // 2 + 1, "picked_by": m,
                   "player_id": pid, "draft_slot": (n - 1) % 2 + 1,
                   "metadata": {"position": pos}}
                  for n, m, pid, pos in picks_spec],
    }


HIST_DRAFTS = [
    _draft_with(2024, [(1, "alice", "p1", "RB"), (2, "bob", "p2", "WR"),
                       (3, "alice", "p3", "WR"), (4, "bob", "p4", "RB")]),
    _draft_with(2025, [(1, "alice", "p2", "WR"), (2, "bob", "p1", "RB"),
                       (3, "alice", "p4", "RB"), (4, "bob", "p3", "WR")]),
]

# Today's consensus: p1 busted and now ranks last; p4 broke out and ranks first.
PLAYERS_DB = {
    "p1": {"position": "RB", "team": "SF", "search_rank": 40, "years_exp": 3},
    "p2": {"position": "WR", "team": "KC", "search_rank": 30, "years_exp": 3},
    "p3": {"position": "WR", "team": "NO", "search_rank": 20, "years_exp": 2},
    "p4": {"position": "RB", "team": "NYJ", "search_rank": 1, "years_exp": 1},
}

# What the market actually thought at the time — the reverse of the above.
HISTORICAL_ADP = {
    "2024": {"p1": {"adp": 1.0}, "p2": {"adp": 2.0}, "p3": {"adp": 3.0}, "p4": {"adp": 4.0}},
    "2025": {"p1": {"adp": 1.0}, "p2": {"adp": 2.0}, "p3": {"adp": 3.0}, "p4": {"adp": 4.0}},
}


def test_without_historical_adp_metrics_are_flagged_proxy():
    prof = M.build_profiles(HIST_DRAFTS, PLAYERS_DB)
    alice = prof["managers"]["alice"]
    assert alice["reach_delta"]["proxy"] is True
    assert alice["bpa_vs_need"]["proxy"] is True
    assert alice["reach_delta"]["adp_coverage"] == 0.0


def test_with_historical_adp_the_proxy_flag_comes_off():
    prof = M.build_profiles(HIST_DRAFTS, PLAYERS_DB, historical_adp=HISTORICAL_ADP)
    alice = prof["managers"]["alice"]
    assert alice["reach_delta"]["proxy"] is False
    assert alice["bpa_vs_need"]["proxy"] is False
    assert alice["reach_delta"]["adp_coverage"] == 1.0


def test_partial_coverage_keeps_the_proxy_flag():
    """Half the picks priced by real ADP is not enough to drop the safeguard."""
    partial = {"2024": HISTORICAL_ADP["2024"]}   # 2025 unpriced
    prof = M.build_profiles(HIST_DRAFTS, PLAYERS_DB, historical_adp=partial)
    alice = prof["managers"]["alice"]
    assert alice["reach_delta"]["proxy"] is True
    assert 0.0 < alice["reach_delta"]["adp_coverage"] < M.ADP_REAL_THRESHOLD


def test_real_adp_changes_the_reach_measurement():
    """The whole point: hindsight ranking and contemporaneous ADP disagree."""
    proxied = M.build_profiles(HIST_DRAFTS, PLAYERS_DB)
    real = M.build_profiles(HIST_DRAFTS, PLAYERS_DB, historical_adp=HISTORICAL_ADP)
    assert (proxied["managers"]["alice"]["reach_delta"]["raw_mean"]
            != real["managers"]["alice"]["reach_delta"]["raw_mean"])


def test_shrinkage_relaxes_once_metrics_are_real():
    """Proxy metrics are shrunk at n/(n+4); real ones at n/(n+2)."""
    assert M.PROXY_PRIOR_STRENGTH > M.PRIOR_STRENGTH
    n = 2
    proxy_w = n / (n + M.PROXY_PRIOR_STRENGTH)
    real_w = n / (n + M.PRIOR_STRENGTH)
    assert real_w > proxy_w


# ---------------------------------------------------------------------------
# Keepers are not draft decisions, and sequence is not a mean.
# ---------------------------------------------------------------------------

def _draft(season, picks, n_teams=10):
    """picks: list of (roster_id, player_id, round, pick_no, is_keeper)."""
    owners = {str(i): {"user_id": f"u{i}"} for i in range(1, n_teams + 1)}
    return {
        "season": season, "league_id": f"lg{season}", "draft_id": f"d{season}",
        "users": [{"user_id": v["user_id"], "display_name": f"mgr{k}"}
                  for k, v in owners.items()],
        "rosters": [{"roster_id": int(k), "owner_id": v["user_id"]}
                    for k, v in owners.items()],
        "picks": [{"roster_id": r, "player_id": str(pid), "round": rnd,
                   "pick_no": pno, "is_keeper": kp}
                  for (r, pid, rnd, pno, kp) in picks],
        "settings": {},
    }


def _db(spec):
    """spec: {player_id: (position, team, search_rank, years_exp)}"""
    return {str(k): {"position": p, "team": t, "search_rank": sr,
                     "years_exp": ye, "full_name": f"{p}{k}"}
            for k, (p, t, sr, ye) in spec.items()}


def test_keepers_are_excluded_from_behaviour():
    """A kept QB charged to round 2 must not read as "takes a QB in round 2".

    This is the bug: in a keeper league a fifth of every draft is last year's
    decision, priced by the keeper cost model rather than chosen off a board.
    """
    db = _db({1: ("QB", "KC", 1, 3), 2: ("RB", "SF", 2, 3), 3: ("RB", "DAL", 3, 3),
              4: ("WR", "BUF", 4, 3), 5: ("WR", "PHI", 5, 3), 6: ("TE", "KC", 6, 3)})
    # Manager 1 KEEPS a QB in round 1 every year, and never drafts one.
    seasons = []
    for yr in ("2023", "2024", "2025"):
        picks = [(1, 1, 1, 1, True), (1, 2, 2, 11, False),
                 (1, 3, 3, 21, False), (1, 4, 4, 31, False)]
        # nine other managers, all taking RB/WR, none taking a QB early
        pno = 2
        for r in range(2, 11):
            picks.append((r, 2 + (r % 4), 1, pno, False))
            pno += 1
        seasons.append(_draft(yr, picks))
    prof = M.build_profiles(seasons, db)

    assert prof["picks_kept_excluded"] == 3, prof["picks_kept_excluded"]
    me = prof["managers"]["u1"]
    assert me["keepers"]["excluded_from_metrics"] == 3
    # The kept QB must not appear as a positional tendency at all.
    assert "QB" not in me["positional_timing"], me["positional_timing"]
    # And his real picks are still counted.
    assert me["picks_analysed"] == 9, me["picks_analysed"]
    # The kept player is still RECORDED — excluded from behaviour, not hidden.
    assert len(me["keepers"]["picks_kept"]) == 3


def test_unknown_position_is_missing_not_a_position():
    """With no player DB every position is "?" — that must not become an answer.

    Before this guard, run-following read a confident 1.0 for all ten managers,
    because every pick in every window shared the sentinel position.
    """
    picks = [(r, r, 1, r, False) for r in range(1, 11)]
    picks += [(r, 10 + r, 2, 10 + r, False) for r in range(1, 11)]
    prof = M.build_profiles([_draft("2024", picks)], {})   # empty player DB
    assert prof["position_coverage"] == 0.0
    for p in prof["managers"].values():
        assert p["draft_patterns"]["run_following"]["rate"] == 0.0
        assert p["draft_patterns"]["openings"]["by_season"] == {}
        assert p["draft_patterns"]["position_coverage"] == 0.0


def test_openings_recover_a_repeated_shape():
    """"RB-RB every year" is the finding a mean throws away."""
    db = _db({1: ("RB", "KC", 1, 3), 2: ("RB", "SF", 2, 3), 3: ("WR", "DAL", 3, 3),
              4: ("TE", "BUF", 4, 3), 5: ("QB", "PHI", 5, 3)})
    seasons = []
    for yr in ("2023", "2024", "2025"):
        picks = [(1, 1, 1, 1, False), (1, 2, 2, 11, False),
                 (1, 3, 3, 21, False), (1, 4, 4, 31, False)]
        pno = 2
        for r in range(2, 11):
            picks.append((r, 5, 1, pno, False)); pno += 1
        seasons.append(_draft(yr, picks))
    op = M.build_profiles(seasons, db)["managers"]["u1"]["draft_patterns"]["openings"]
    assert op["by_season"]["2024"] == ["RB", "RB", "WR", "TE"], op["by_season"]
    assert op["most_common_open"] == "RB-RB"
    assert op["most_common_open_count"] == 3
    assert op["repeats"] is True


def test_consistency_separates_a_habit_from_an_average():
    """Round 4 every year and 1/4/7 have the same mean and opposite meanings."""
    db = _db({1: ("QB", "KC", 1, 3), 9: ("RB", "SF", 9, 3)})
    def build(rounds):
        seasons = []
        for yr, rnd in zip(("2023", "2024", "2025"), rounds):
            picks = [(1, 1, rnd, (rnd - 1) * 10 + 1, False)]
            picks += [(1, 9, r, (r - 1) * 10 + 1, False)
                      for r in range(1, 9) if r != rnd]
            pno = 2
            for r in range(2, 11):
                picks.append((r, 9, 1, pno, False)); pno += 1
            seasons.append(_draft(yr, picks))
        return M.build_profiles(seasons, db)["managers"]["u1"]["draft_patterns"]["consistency"]

    steady = build((4, 4, 4))
    erratic = build((1, 4, 7))
    assert steady["QB"]["spread"] == 0 and steady["QB"]["predictable"] is True
    assert erratic["QB"]["spread"] == 6 and erratic["QB"]["predictable"] is False
    # Same mean round, opposite verdicts — which is the entire point.
    assert sum(steady["QB"]["rounds"]) == sum(erratic["QB"]["rounds"])


def test_repeat_targets_find_a_favourite_player():
    """The most human pattern there is: he takes the same man every year."""
    db = _db({7: ("WR", "KC", 7, 3), 9: ("RB", "SF", 9, 3)})
    seasons = []
    for yr, rnd in (("2023", 5), ("2024", 3), ("2025", 2)):
        picks = [(1, 7, rnd, (rnd - 1) * 10 + 1, False), (1, 9, 8, 71, False)]
        pno = 2
        for r in range(2, 11):
            picks.append((r, 9, 1, pno, False)); pno += 1
        seasons.append(_draft(yr, picks))
    rt = M.build_profiles(seasons, db)["managers"]["u1"]["draft_patterns"]["repeat_targets"]
    fav = [x for x in rt if x["player_id"] == "7"]
    assert len(fav) == 1
    assert fav[0]["times"] == 3
    assert fav[0]["rounds"] == [5, 3, 2]        # and he is paying more each year
    assert fav[0]["position"] == "WR"


def test_run_following_needs_the_whole_draft_not_one_manager():
    """A run is made of OTHER people's picks.

    Scoring a manager against only his own picks leaves the window permanently
    short, and every manager scores a flat zero — the failure mode that looks
    exactly like "nobody follows runs".
    """
    db = _db({i: ("RB" if i <= 20 else "WR", "KC", i, 3) for i in range(1, 41)})
    # Picks 1-6 are all RB (a run). Manager 7 picks 7th and takes an RB too.
    picks = [(r, r, 1, r, False) for r in range(1, 7)]          # RB run
    picks.append((7, 7, 1, 7, False))                            # follower: RB
    picks.append((8, 25, 1, 8, False))                           # contrarian: WR
    picks += [(r, 26 + r, 1, r, False) for r in range(9, 11)]
    prof = M.build_profiles([_draft("2024", picks)], db)
    follower = prof["managers"]["u7"]["draft_patterns"]["run_following"]
    contrarian = prof["managers"]["u8"]["draft_patterns"]["run_following"]
    assert follower["rate"] == 1.0, follower
    assert contrarian["rate"] == 0.0, contrarian
    assert follower["league_rate"] == prof["managers"]["u8"]["draft_patterns"]["run_following"]["league_rate"]


def test_seat_count_survives_null_draft_slots():
    """Historical picks carry roster_id and a null draft_slot.

    max(draft_slot or 1) then yields 1 and the league reads as one team.
    """
    picks = [(r, r, 1, r, False) for r in range(1, 11)]
    prof = M.build_profiles([_draft("2024", picks)], {})
    assert len(prof["managers"]) == 10


def test_profiles_record_which_drafts_they_came_from():
    """The basis for building once and rebuilding only on a genuinely new draft."""
    picks = [(r, r, 1, r, False) for r in range(1, 11)]
    prof = M.build_profiles([_draft("2024", picks), _draft("2025", picks)], {})
    assert prof["draft_ids"] == ["d2024", "d2025"]
    assert prof["drafts_analysed"] == 2


def test_bpa_is_measured_against_the_whole_board_not_your_own_picks():
    """All ten managers cannot be above the league average.

    The board must be reconstructed from every pick in the draft; only the rows
    being measured are scored against it. Reconstructing it from one manager's
    40 picks means almost nothing better is ever "still available", and he comes
    out at 70% against a league average of 31%.
    """
    db = _db({i: ("RB" if i % 2 else "WR", "KC", i, 3) for i in range(1, 101)})
    # Everyone drafts in exact market order: a perfect best-available draft.
    picks = []
    pid = 1
    for rnd in range(1, 6):
        seats = range(1, 11) if rnd % 2 else range(10, 0, -1)
        for i, seat in enumerate(seats):
            picks.append((seat, pid, rnd, (rnd - 1) * 10 + i + 1, False))
            pid += 1
    prof = M.build_profiles([_draft("2024", picks)], db)
    rates = [p["bpa_vs_need"]["bpa_rate"] for p in prof["managers"].values()]
    league = prof["managers"]["u1"]["bpa_vs_need"]["league_rate"]
    # In a strictly-by-rank draft, everybody IS best-available, league included.
    assert league > 0.95, league
    assert all(r > 0.95 for r in rates), rates
    # And nobody is implausibly far from the league — the two are comparable now.
    assert max(abs(r - league) for r in rates) < 0.1, (rates, league)


def test_a_single_reacher_stands_out_from_a_disciplined_league():
    db = _db({i: ("RB" if i % 2 else "WR", "KC", i, 3) for i in range(1, 121)})
    picks = []
    pid = 1
    for rnd in range(1, 6):
        for i, seat in enumerate(range(1, 11)):
            # Seat 3 always grabs somebody 40 places down the board.
            chosen = 100 + rnd if seat == 3 else pid
            picks.append((seat, chosen, rnd, (rnd - 1) * 10 + i + 1, False))
            if seat != 3:
                pid += 1
    prof = M.build_profiles([_draft("2024", picks)], db)
    reacher = prof["managers"]["u3"]["bpa_vs_need"]["bpa_rate"]
    others = [p["bpa_vs_need"]["bpa_rate"] for k, p in prof["managers"].items() if k != "u3"]
    assert reacher < min(others), (reacher, others)


def test_reach_is_reported_relative_to_the_league():
    """Keepers shift every pick "ahead of market" by construction.

    A relative figure cancels that; an absolute one puts the same systematic
    offset on all ten managers and calls it ten findings.
    """
    db = _db({i: ("RB", "KC", i + 40, 3) for i in range(1, 61)})   # ADP offset by 40
    picks = []
    pid = 1
    for rnd in range(1, 5):
        for i, seat in enumerate(range(1, 11)):
            picks.append((seat, pid, rnd, (rnd - 1) * 10 + i + 1, False))
            pid += 1
    prof = M.build_profiles([_draft("2024", picks)], db)
    for p in prof["managers"].values():
        # Everybody drafted identically, so relative reach is ~0 for all...
        assert abs(p["reach_delta"]["mean"]) < 1.0, p["reach_delta"]
        # ...while the raw-vs-ADP figure carries the shared offset, and is kept
        # so the number is auditable rather than just quietly adjusted.
        assert p["reach_delta"]["league_mean_vs_adp"] > 5, p["reach_delta"]


def test_softmax_is_actually_centred_on_the_league_average():
    """A perfectly average manager must lean neither to need nor to value.

    The comment claimed "centred so league-average lands at 1.0/1.0" while the
    arithmetic gave 0.5/2.0 — every average seat modelled as weighting value
    four times need, in every survival calculation the tool ran.
    """
    db = _db({i: ("RB" if i % 2 else "WR", "KC", i, 3) for i in range(1, 101)})
    picks = []
    pid = 1
    for rnd in range(1, 6):
        for i, seat in enumerate(range(1, 11)):
            picks.append((seat, pid, rnd, (rnd - 1) * 10 + i + 1, False))
            pid += 1
    prof = M.build_profiles([_draft("2024", picks)], db)
    # Everybody drafted identically, so everybody IS the league average.
    for p in prof["managers"].values():
        assert abs(p["softmax"]["alpha_need"] - 1.0) < 0.15, p["softmax"]
        assert abs(p["softmax"]["beta_value"] - 1.0) < 0.15, p["softmax"]
        # And symmetric about 1.0, not merely close to it.
        assert abs((p["softmax"]["alpha_need"] + p["softmax"]["beta_value"]) - 2.0) < 0.01
