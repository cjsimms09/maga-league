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
