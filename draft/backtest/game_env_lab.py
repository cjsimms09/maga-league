#!/usr/bin/env python3
# TERRITORY: A
"""GAME-ENVIRONMENT LAB — does the game around the player add anything the player's own lines do not already carry?

Cory, 2026-09-02: "Are we only considering prop bets, should over under of the
game matter as well? (ie weather, pace of play)". The game TOTAL is already in
the champion (the vegas tilt: implied team total vs the league mean) and was
measured inert in both folds (registers 463/471: 0x/0.5x/1x/1.5x span 0.02-
0.05 MAE). This lab asks the other two, on the same two folds, the same way.

CLAIMS, FIXED BEFORE THE RUN (Tier-1 single axes; report-only; nothing ships):
  C1 PACE   a tempo tilt from the PRIOR season's plays_per_game (team z-score,
            +-3% per sd, strictly prior) does NOT beat the untilted blend:v1_pull3
            on pooled MAE in either fold.
  C2 WEATHER a weather tilt on OUTDOOR games — wind >= 15 mph: x0.93 on QB/WR/TE
            (passing offence), x0.97 on RB; temp <= 32F: x0.97 on everyone —
            does NOT beat the untilted arm on pooled MAE in either fold, AND on
            the AFFECTED players alone (where any effect must show) the MAE
            difference is inside +-0.10.
  C3 PROPS  the same weather tilt on the PROPS arm does not beat untilted props
            on the affected players — the books already price the wind.
If a claim is FALSE in BOTH folds, the axis goes to D as a live Tier-1 arm
(ROUTES 1023); FALSE in one fold is noise until a third season says otherwise.

CONTROLS (rule 3e): the tilt must touch >0 players in every fold (a tilt that
changes nothing cannot fail); a SHUFFLED weather map (games permuted) is run
beside the real one — the real tilt must not be worse than its shuffle if it
is carrying information, and a real tilt that ties its shuffle carries none.

Inputs: the two backtest folds' own stores (weekly_arms_2025_backtest.py,
--season), team_pace_2021_2025.json (plays_per_game), and
nflverse_games_weather_2024_2025.json (temp/wind/roof per game, committed).
Run: python3 draft/backtest/game_env_lab.py   -> game_env_lab.json
"""
from __future__ import annotations

import importlib.util
import json
import random
import statistics as st
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BT = ROOT / "draft" / "backtest"
for p in (BT, ROOT / "draft", ROOT / "draft" / "tools"):
    sys.path.insert(0, str(p))
from start_sit_metric import pairwise_accuracy, POSITIONS  # noqa: E402

WIND_MPH = 15.0
COLD_F = 32.0
WIND_PASS, WIND_RB, COLD_ALL = 0.93, 0.97, 0.97
PACE_PER_SD = 0.03
SEED = 20260902
CODE = {"LA": "LAR"}


def harness(season: int):
    saved = sys.argv
    sys.argv = ["x", "--season", str(season)]
    try:
        spec = importlib.util.spec_from_file_location(f"bt{season}", BT / "weekly_arms_2025_backtest.py")
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        return mod
    finally:
        sys.argv = saved


def weather_by_week(season: int, shuffle: random.Random | None = None) -> dict:
    """{week: {team: {"wind": bool, "cold": bool}}} for outdoor games only."""
    doc = json.loads((BT / "nflverse_games_weather_2024_2025.json").read_text())["seasons"][str(season)]
    games = list(doc)
    if shuffle is not None:
        env = [(g["roof"], g["temp"], g["wind"]) for g in games]
        shuffle.shuffle(env)
        games = [dict(g, roof=e[0], temp=e[1], wind=e[2]) for g, e in zip(games, env)]
    out: dict = {}
    for g in games:
        if g["roof"] not in ("outdoors", "open"):
            continue
        flags = {"wind": g["wind"] is not None and g["wind"] >= WIND_MPH,
                 "cold": g["temp"] is not None and g["temp"] <= COLD_F}
        if not (flags["wind"] or flags["cold"]):
            continue
        for t in (g["home"], g["away"]):
            out.setdefault(g["week"], {})[CODE.get(t, t)] = flags
    return out


def pace_z(season: int) -> dict:
    """Prior-season plays_per_game as a team z-score — strictly prior."""
    doc = json.loads((BT / "team_pace_2021_2025.json").read_text())
    prior = (doc.get("seasons") or doc).get(str(season - 1)) or {}
    vals = {t: r["plays_per_game"] for t, r in prior.items() if isinstance(r, dict) and r.get("plays_per_game")}
    m, sd = st.mean(vals.values()), st.pstdev(vals.values())
    return {CODE.get(t, t): (v - m) / sd for t, v in vals.items()} if sd else {}


def tilt_weather(arm: dict, tp: dict, wx_w: dict) -> tuple[dict, set]:
    out, touched = dict(arm), set()
    for pid, v in arm.items():
        team, pos = tp.get(pid, (None, None))
        f = wx_w.get(team)
        if not f:
            continue
        k = 1.0
        if f["wind"]:
            k *= WIND_PASS if pos in ("QB", "WR", "TE") else WIND_RB
        if f["cold"]:
            k *= COLD_ALL
        if k != 1.0:
            out[pid] = round(v * k, 2)
            touched.add(pid)
    return out, touched


def tilt_pace(arm: dict, tp: dict, z: dict) -> tuple[dict, set]:
    out, touched = dict(arm), set()
    for pid, v in arm.items():
        team = tp.get(pid, (None, None))[0]
        if team in z:
            out[pid] = round(v * (1 + PACE_PER_SD * z[team]), 2)
            touched.add(pid)
    return out, touched


def mae_on(arm: dict, act: dict, pids) -> float | None:
    pids = [p for p in pids if p in arm and p in act]
    return round(sum(abs(arm[p] - act[p]) for p in pids) / len(pids), 3) if pids else None


def run_fold(season: int, rng: random.Random) -> dict:
    H = harness(season)
    D = H.load()
    byes = H.byes_by_week(D["vegas"])
    wx_real = weather_by_week(season)
    wx_shuf = weather_by_week(season, random.Random(rng.random()))
    z = pace_z(season)
    acc = {k: {"pooled": [0.0, 0], "touched": [0.0, 0]} for k in
           ("base", "pace", "wx", "wx_shuf", "props", "props_wx", "props_wx_shuf")}
    ss_rows = []
    touched_total = {"pace": 0, "wx": 0, "props_wx": 0}
    for w in H.WEEKS:
        tp = H.team_pos_for_week(D["comp"], w)
        implied = {H.VEGAS_TO_STATS.get(k, k): v for k, v in H.implied_from_vegas_store(D["vegas"], season, w).items()}
        byes_w = {H.VEGAS_TO_STATS.get(t, t) for t in byes[w]}
        arms = H.season_prior_arms(D["priors"], tp, implied, byes_w, w, H.realized_lists(D["act"], w) if w >= 2 else None)
        base = arms["blend:v1_pull3"]
        props, _ = H.props_arm(D["props"].get(w, {}), D["names"], tp, D["scoring"])
        act = D["act"][w]
        pace_arm, t_pace = tilt_pace(base, tp, z)
        wx_arm, t_wx = tilt_weather(base, tp, wx_real.get(w, {}))
        wxs_arm, _ = tilt_weather(base, tp, wx_shuf.get(w, {}))
        pwx, t_pwx = tilt_weather(props, tp, wx_real.get(w, {}))
        pwxs, _ = tilt_weather(props, tp, wx_shuf.get(w, {}))
        pop = [p for p in base if p in act and tp.get(p, (None, None))[1] in POSITIONS]
        ppop = [p for p in props if p in act and p in base and tp.get(p, (None, None))[1] in POSITIONS]
        touched_total["pace"] += len(t_pace); touched_total["wx"] += len(t_wx & set(pop)); touched_total["props_wx"] += len(t_pwx & set(ppop))
        for name, arm, pp, tset in (("base", base, pop, t_wx), ("pace", pace_arm, pop, t_pace), ("wx", wx_arm, pop, t_wx),
                                    ("wx_shuf", wxs_arm, pop, t_wx), ("props", props, ppop, t_pwx),
                                    ("props_wx", pwx, ppop, t_pwx), ("props_wx_shuf", pwxs, ppop, t_pwx)):
            for p in pp:
                acc[name]["pooled"][0] += abs(arm[p] - act[p]); acc[name]["pooled"][1] += 1
                if p in tset:
                    acc[name]["touched"][0] += abs(arm[p] - act[p]); acc[name]["touched"][1] += 1
        ss_rows.append({p: {"pos": tp[p][1], "actual": act[p],
                            "proj": {"base": base[p], "pace": pace_arm[p], "wx": wx_arm[p]}} for p in pop})
    mae = {k: {"pooled": round(v["pooled"][0] / v["pooled"][1], 3) if v["pooled"][1] else None,
               "touched": round(v["touched"][0] / v["touched"][1], 3) if v["touched"][1] else None,
               "n_touched": v["touched"][1]} for k, v in acc.items()}
    ss = pairwise_accuracy(ss_rows, ["base", "pace", "wx"])["sources"]
    return {"season": season, "mae": mae, "touched_player_weeks": touched_total,
            "start_sit": {a: {q: ss[a][q]["accuracy"] for q in POSITIONS} for a in ("base", "pace", "wx")},
            "weather_games": {"weeks_with_flags": len(wx_real), "team_weeks_flagged": sum(len(v) for v in wx_real.values())}}


def main() -> int:
    rng = random.Random(SEED)
    folds = {y: run_fold(y, rng) for y in (2025, 2024)}
    def better(f, a, b, key="pooled"):
        return f["mae"][a][key] is not None and f["mae"][b][key] is not None and f["mae"][a][key] < f["mae"][b][key]
    claims = {
        "C1_pace_does_not_beat_untilted": {y: not better(f, "pace", "base") for y, f in folds.items()},
        "C2_weather_does_not_beat_untilted_pooled": {y: not better(f, "wx", "base") for y, f in folds.items()},
        "C2_weather_touched_inside_0.10": {y: abs((f["mae"]["wx"]["touched"] or 0) - (f["mae"]["base"]["touched"] or 0)) <= 0.10 for y, f in folds.items()},
        "C3_props_weather_does_not_beat_untilted_touched": {y: not better(f, "props_wx", "props", "touched") for y, f in folds.items()},
    }
    controls = [
        {"id": "G1", "what": "every tilt touched >0 player-weeks in every fold",
         "ok": all(all(v > 0 for v in f["touched_player_weeks"].values()) for f in folds.values()),
         "touched": {y: f["touched_player_weeks"] for y, f in folds.items()}},
        {"id": "G2", "what": "the real weather tilt is not WORSE than its shuffle on touched players (else it carries no information)",
         "ok": all((f["mae"]["wx"]["touched"] or 0) <= (f["mae"]["wx_shuf"]["touched"] or 0) + 1e-9 for f in folds.values()),
         "real_vs_shuffle_touched": {y: [f["mae"]["wx"]["touched"], f["mae"]["wx_shuf"]["touched"]] for y, f in folds.items()}},
    ]
    doc = {"_territory": "TERRITORY: A — draft/backtest/game_env_lab.py",
           "_population_note": ("MAE here is per-arm (arm ∩ actuals), NOT the harness's shared population across all arms — "
                                "so 'base' reads ~4.0 where the harness reads ~4.55 for the same arm; compare rows within this file only"),
           "_reading_2026-09-02": ("PACE: inert in both folds (C1 TRUE/TRUE) — dead for weekly as it was for the draft. "
                                   "WEATHER on our arm: noise (pooled ±0.01; touched −0.07 in 2025 beating its shuffle, +0.02 in 2024 tying it). "
                                   "WEATHER on PROPS: −0.069 on touched players in 2025 and −0.001 in 2024, both beating the shuffled map — "
                                   "C3 FALSE by the letter in both folds, a tie in substance in 2024. Per the pre-fixed rule the axis goes to D "
                                   "as a live Tier-1 arm; it is NOT an edge yet and does not go on WHAT-STUCK as one."),
           "_claims_fixed_before_the_run": __doc__.split("CLAIMS, FIXED BEFORE THE RUN")[1].split("CONTROLS")[0].strip(),
           "params": {"wind_mph": WIND_MPH, "cold_f": COLD_F, "wind_pass": WIND_PASS, "wind_rb": WIND_RB, "cold_all": COLD_ALL, "pace_per_sd": PACE_PER_SD, "seed": SEED},
           "controls": controls, "claims": claims, "folds": folds}
    (BT / "game_env_lab.json").write_text(json.dumps(doc, indent=1))
    print("GAME-ENVIRONMENT LAB — two folds, claims fixed before the run")
    for c in controls:
        print(f"  {'OK ' if c['ok'] else '***'} {c['id']} {c['what']}  {json.dumps({k: v for k, v in c.items() if k not in ('id', 'what', 'ok')})}")
    for y, f in folds.items():
        m = f["mae"]
        print(f"\n  {y}  pooled MAE: base {m['base']['pooled']}  pace {m['pace']['pooled']}  weather {m['wx']['pooled']} (shuffle {m['wx_shuf']['pooled']})")
        print(f"        touched-only MAE: base {m['base']['touched']}  weather {m['wx']['touched']}  shuffle {m['wx_shuf']['touched']}  (n {m['wx']['n_touched']})")
        print(f"        props touched-only: props {m['props']['touched']}  props+weather {m['props_wx']['touched']}  shuffle {m['props_wx_shuf']['touched']}  (n {m['props_wx']['n_touched']})")
        print(f"        start/sit base/pace/weather: " + "  ".join(f"{q} {f['start_sit']['base'][q]}/{f['start_sit']['pace'][q]}/{f['start_sit']['wx'][q]}" for q in POSITIONS))
    print("\n  CLAIMS")
    for k, v in claims.items():
        print(f"   {k}: " + "  ".join(f"{y} {'TRUE' if t else 'FALSE'}" for y, t in v.items()))
    print(f"\n  wrote {(BT / 'game_env_lab.json').relative_to(ROOT)}")
    return 0 if all(c["ok"] for c in controls) else 1


if __name__ == "__main__":
    raise SystemExit(main())
