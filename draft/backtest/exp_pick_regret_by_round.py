# TERRITORY: A
"""WHERE THE DRAFT-DAY MONEY IS LEFT — per-pick regret, decomposed by ROUND.

Cory, 2026-08-19: "Are we sure we are extracting as much value as possible
while drafting full roster? ... Are we looking for upside late?" Every
graded study so far answers a POLICY question (which archetype, which
tilt) and all ten lost. None answers the prior question: at which picks
does a policy actually leave points on the table? This does.

REGRET, defined once: at each of Cory's real pick slots, over the pool
that was legally available at that pick (the tournament's own
`board_before` counterfactual),

    regret = realized_points(best available) - realized_points(taken)

summed within ROUND across 2023/2024/2025. Realized points are the
committed weekly stores under our own scoring (season_totals), so a
"best available" is best BY OUTCOME, which is exactly the hindsight
ceiling the oracle column measures at roster level.

TWO POLICIES, because the question has two halves:
  cory_actual   what Cory really took -> where HE left points
  market        take the best available by the room's own ADP -> where a
                pure follow-the-market board would leave points

CONTROL (rule 3e, and the reason this can be believed): the ORACLE runs
through the identical instrument. It picks the realized-best legal player
by construction, so its per-round regret must be ~0 everywhere. If it is
not, the instrument is measuring something other than what it claims and
no other row here means anything.

REPORTED per round: total and per-pick regret for each policy, and
regret as a SHARE of the points available at that round (best-available
points), because the absolute and relative pictures answer different
halves of Cory's question.

Blind predictions: ledger P105, filed before this module first ran.
Run: python3 draft/backtest/exp_pick_regret_by_round.py
Writes exp_pick_regret_by_round.json next to this file.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import exp34 as X  # noqa: E402
import exp_strategy_tournament as T  # noqa: E402
import money_grade as MG  # noqa: E402
import roster_sim as RS  # noqa: E402
from model_accuracy_backtest import season_totals  # noqa: E402

SEASONS = ("2023", "2024", "2025")
POSITIONS = ("QB", "RB", "WR", "TE")


def _legal(avail, positions, roster):
    """The tournament's own legality view, reused rather than re-derived."""
    return T._eligible(avail, positions, roster)


def season_rows(hist, yr):
    """[{round, policy, taken_pts, best_pts, regret}] for every real slot."""
    s = MG.season_of(hist, yr)
    positions = RS.positions_from_board(T.BOARD)
    rid = X.cory_roster_id(s)
    picks = X.real_draft(s)
    decisions = X.cory_decisions(picks, rid)
    cory_real = [str(p["player_id"]) for p in decisions]
    keepers = [str(p["player_id"]) for p in picks
               if p.get("roster_id") == rid and p.get("is_keeper")]
    adp = {}
    for p in picks:
        pid, pn = str(p.get("player_id")), p.get("pick_no")
        if pid and pn and pid not in adp:
            adp[pid] = int(pn)

    realized, _games = season_totals(int(yr))

    def pts(pid):
        return float(realized.get(str(pid), 0.0))

    policies = {
        "cory_actual": lambda avail, pos, roster, rnd, left, a: None,  # replaced below
        "market": T.strat_market,
        "oracle": None,   # built inside the loop (needs realized)
    }

    def oracle_fn(avail, pos, roster, rnd, left, adp_ignored):
        bk = T._legality_first(avail, pos, roster, left,
                               {pid: -pts(pid) for pid in avail})
        if bk:
            return bk
        cands = _legal(avail, pos, roster)
        return max(((pts(p), p) for p in cands), default=(None, None))[1]

    out = []
    for policy in ("cory_actual", "market", "oracle"):
        taken_set = set(keepers)
        roster = list(keepers)
        for i, p in enumerate(decisions):
            pn = p.get("pick_no") or 0
            avail = (X.board_before(picks, pn) | set(cory_real[:i])) - taken_set
            rnd = T._round_of(pn)
            left = len(decisions) - i
            if policy == "cory_actual":
                chosen = cory_real[i]
            elif policy == "market":
                chosen = T.strat_market(avail, positions, roster, rnd, left, adp)
            else:
                chosen = oracle_fn(avail, positions, roster, rnd, left, adp)
            if chosen is None:
                chosen = cory_real[i]
            chosen = str(chosen)
            legal = _legal(avail, positions, roster)
            best = max((pts(x) for x in legal), default=0.0)
            out.append({"season": yr, "round": rnd, "policy": policy,
                        "taken_pts": round(pts(chosen), 1),
                        "best_pts": round(best, 1),
                        "regret": round(best - pts(chosen), 1)})
            taken_set.add(chosen)
            roster.append(chosen)
    return out


def run():
    hist = MG.load_history()
    rows = []
    for yr in SEASONS:
        rows.extend(season_rows(hist, yr))

    by = {}
    for r in rows:
        cell = by.setdefault((r["policy"], r["round"]), {
            "n_picks": 0, "regret_total": 0.0, "best_total": 0.0})
        cell["n_picks"] += 1
        cell["regret_total"] += r["regret"]
        cell["best_total"] += r["best_pts"]

    per_round = {}
    for (policy, rnd), c in sorted(by.items()):
        per_round.setdefault(policy, {})[str(rnd)] = {
            "n_picks": c["n_picks"],
            "regret_total": round(c["regret_total"], 1),
            "regret_per_pick": round(c["regret_total"] / c["n_picks"], 1),
            "share_of_available": (round(c["regret_total"] / c["best_total"], 3)
                                   if c["best_total"] else None),
        }

    oracle_max = max((v["regret_per_pick"] for v in per_round.get("oracle", {}).values()),
                     default=None)
    doc = {
        "_territory": "TERRITORY: A — exp_pick_regret_by_round.py",
        "_prereg": "blind predictions ledger P105, filed before first execution",
        "seasons": list(SEASONS),
        "control_oracle_max_regret_per_pick": oracle_max,
        "control_ok": (oracle_max is not None and abs(oracle_max) < 1.0),
        "per_round": per_round,
    }
    if not doc["control_ok"]:
        doc["_warning"] = ("ORACLE CONTROL FAILED — the instrument does not "
                           "reproduce zero regret for a realized-best picker, "
                           "so no row here is trustworthy")
    return doc


def main():
    doc = run()
    (HERE / "exp_pick_regret_by_round.json").write_text(json.dumps(doc, indent=1))
    print("oracle control max regret/pick:", doc["control_oracle_max_regret_per_pick"],
          "ok:", doc["control_ok"])
    for policy in ("cory_actual", "market"):
        print(f"== {policy}")
        for rnd in sorted(doc["per_round"].get(policy, {}), key=int):
            c = doc["per_round"][policy][rnd]
            print(f"   r{rnd:>2}: regret/pick {c['regret_per_pick']:7.1f}  "
                  f"share_of_available {c['share_of_available']}  n={c['n_picks']}")
    print("wrote exp_pick_regret_by_round.json")


if __name__ == "__main__":
    main()
