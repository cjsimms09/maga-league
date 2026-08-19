#!/usr/bin/env python3
"""POLICY RE-GRADE through the season-forward simulator — task 27.

Prereg: POLICY-REGRADE-SIM-PREREG.md (same commit, before first run).
Blind prediction: ledger P100. Design, bars and the instrument control
live in the prereg; this module implements them and nothing else.

Reuse, not re-derivation (rule 11): rosters come from
exp_strategy_tournament's own build_roster/STRATEGIES with the same
season inputs; weekly series from its neutralized_weekly; worlds from
season_forward_sim.simulate. Nothing about a roster or a payout is
re-implemented here.

Run: python3 draft/backtest/policy_regrade_sim.py [--worlds N]
Writes policy_regrade_sim.json next to this file.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import exp34 as X  # noqa: E402  cory_roster_id / real_draft / cory_decisions
import exp_strategy_tournament as T  # noqa: E402
import money_grade as MG  # noqa: E402
import roster_sim as RS  # noqa: E402
import season_forward_sim as SF  # noqa: E402

N_WORLDS = 2000
SEASONS = ("2023", "2024", "2025")
OUT = HERE / "policy_regrade_sim.json"
ARMS_BASELINE = "market"


def season_arm_series(hist, yr):
    """{arm_name: (cory_rid, {week: neutralized score})} — the tournament's
    own construction, replayed through its own functions."""
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
    ppg = T.season_ppg(s)
    realized = {pid: sum(RS.global_player_points(s)[w].get(pid, 0.0)
                         for w in RS.global_player_points(s)) for pid in ppg}

    out = {}
    for name, fn in T.STRATEGIES.items():
        roster, _fb = T.build_roster(fn, decisions, picks, cory_real,
                                     keepers, positions, adp)
        out[name] = T.neutralized_weekly(s, roster, positions, ppg)
    out["cory_actual"] = T.neutralized_weekly(s, keepers + cory_real,
                                              positions, ppg)

    def oracle_fn(avail, pos, roster, rnd, picks_left, adp_ignored):
        bk = T._legality_first(avail, pos, roster, picks_left,
                               {pid: -realized.get(pid, 0) for pid in avail})
        if bk:
            return bk
        cands = T._eligible(avail, pos, roster)
        ranked = [(realized.get(pid, 0.0), pid) for pid in cands]
        return max(ranked)[1] if ranked else None

    oracle_roster, _ = T.build_roster(oracle_fn, decisions, picks, cory_real,
                                      keepers, positions, adp)
    out["oracle_realized"] = T.neutralized_weekly(s, oracle_roster,
                                                  positions, ppg)
    return rid, out


def run(n_worlds=N_WORLDS):
    hist = MG.load_history()
    pay = MG.load_payouts()
    MG.certify_bracket_resim(hist)
    doc = {"_prereg": "POLICY-REGRADE-SIM-PREREG.md; blind prediction P100",
           "n_worlds": n_worlds, "seasons": {}}
    for yr in SEASONS:
        rid, series = season_arm_series(hist, yr)
        row = {}
        for arm, weekly in series.items():
            sim = SF.simulate(hist, pay, yr, n_worlds=n_worlds,
                              substitute=(rid, weekly))
            cell = sim["per_roster"][rid]
            # exact SE of the mean from the world totals is not stored by
            # simulate(); approximate world sd from the 90% band under a
            # normal reading (declared: crude but uniform across arms),
            # then SE = sd/sqrt(n). The separation bar uses this SE.
            band = cell["E_total"]["p95"] - cell["E_total"]["p5"]
            sd = band / 3.29 if band else 0.0
            row[arm] = {"p_playoffs": cell["p_playoffs"],
                        "E_total": cell["E_total"],
                        "E_playoff": cell["E_playoff"],
                        "E_weekly_high": cell["E_weekly_high"],
                        "se_mean": round(sd / (n_worlds ** 0.5), 3)}
        doc["seasons"][yr] = {"cory_seat": rid, "arms": row}

    def sep(a, b, yr):
        ra, rb = (doc["seasons"][yr]["arms"][a], doc["seasons"][yr]["arms"][b])
        d = ra["E_total"]["mean"] - rb["E_total"]["mean"]
        bar = 2 * (ra["se_mean"] + rb["se_mean"])
        return d, bar, abs(d) > bar

    verdicts = {"instrument_control": {}, "separations": {}}
    ctrl_ok = []
    for yr in SEASONS:
        d, bar, ok = sep("oracle_realized", "cory_actual", yr)
        verdicts["instrument_control"][yr] = {
            "delta": round(d, 2), "bar": round(bar, 2),
            "separates": ok and d > 0}
        ctrl_ok.append(ok and d > 0)
    verdicts["instrument_valid"] = all(ctrl_ok)

    for arm in T.STRATEGIES:
        if arm == ARMS_BASELINE:
            continue
        cells = {}
        signs = set()
        seps = []
        for yr in SEASONS:
            d, bar, ok = sep(arm, ARMS_BASELINE, yr)
            cells[yr] = {"delta": round(d, 2), "bar": round(bar, 2),
                         "beyond_bar": ok}
            signs.add(d > 0)
            seps.append(ok)
        cells["separates"] = all(seps) and len(signs) == 1
        verdicts["separations"][arm] = cells

    doc["verdicts"] = verdicts
    if not verdicts["instrument_valid"]:
        doc["verdicts"]["status"] = ("NOT RUN — the oracle could not "
                                     "separate; the instrument is too dull "
                                     "to certify a null (prereg bar)")
    return doc


def main():
    n = N_WORLDS
    if "--worlds" in sys.argv:
        n = int(sys.argv[sys.argv.index("--worlds") + 1])
    doc = run(n_worlds=n)
    OUT.write_text(json.dumps(doc, indent=1))
    v = doc["verdicts"]
    print("instrument_valid:", v["instrument_valid"])
    for yr, c in v["instrument_control"].items():
        print(f"  oracle-vs-cory {yr}: delta {c['delta']} bar {c['bar']} "
              f"sep {c['separates']}")
    for arm, c in v["separations"].items():
        print(f"{arm}: separates={c['separates']} " +
              " ".join(f"{yr}:{c[yr]['delta']:+.0f}" for yr in SEASONS))
    print("wrote", OUT.name)


if __name__ == "__main__":
    main()
