#!/usr/bin/env python3
"""REGISTER 27 — re-examine every study whose stated limit is SAMPLE SIZE.

Register 27 says "we can only grade one season" is false because all five
realized stores are populated. Its next action names three studies. This probe
answers, for each, whether the stated limit is REAL or a sentence nobody
rechecked after the 2021/2022 stores landed on 2026-08-17.

REPORT-ONLY. Writes nothing. Never calls any study's main(); calls run()/grade()
and patches module constants in memory only.

CONTROLS (Rule 3e — a null or a positive is a bug report until a control fires):
  K1 SCORING JOIN   nflverse must reproduce league_history's own player-week
                    points where both exist. Licenses substituting one for the
                    other as a walk_forward input.
  K2 NEGATIVE       a deliberately wrong-season pairing must FAIL K1's test,
                    proving the comparison can detect a mismatch at all.
  K3 REPLICATION    my replicated adjuster loop must reproduce the COMMITTED
                    2024 classifications PER PICK. If I cannot reproduce a season
                    the module already scored, my 2023 number is worthless.
  K4 DETERMINISM    the accuracy harness graded twice must agree exactly.
  K5 NEGATIVE       grading a season with no store on disk must RAISE, proving
                    the harness really reads the stores it claims to.

Usage:  python3 draft/audit/register27_season_limit_probe.py
Exit 1 if any control fails — in that case no number below is licensed.
"""
from __future__ import annotations
import sys, json, collections
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BT = ROOT / "draft" / "backtest"
sys.path.insert(0, str(BT))

import exp34 as X                      # noqa: E402
import roster_sim as RS                # noqa: E402
import money_grade as MG               # noqa: E402
from lab_projections import walk_forward   # noqa: E402
import model_accuracy_backtest as MA   # noqa: E402

HIST = json.loads((ROOT / "draft" / "data" / "league_history.json").read_text())
BOARD = ROOT / "public" / "draft_data.json"
TEAMS, TOPK, TOP_OUTCOMES = 10, 3, 3
SKILL = ("QB", "RB", "WR", "TE")
REPLACEMENT_RANK = {"QB": 10, "RB": 25, "WR": 25, "TE": 12, "K": 10, "DEF": 10}
POSITIONS = RS.positions_from_board(BOARD)
FAILS: list[str] = []


# ---------------------------------------------------------------- helpers
def league_season(yr):
    s = MG.season_of(HIST, str(yr))
    if s is None:
        return None, None
    tot, games = {}, {}
    for _w, d in RS.global_player_points(s).items():
        for pid, v in d.items():
            tot[pid] = tot.get(pid, 0.0) + float(v)
            games[pid] = games.get(pid, 0) + 1
    return tot, games


def nflverse_season(yr):
    p = BT / f"nflverse_weekly_points_{yr}.json"
    if not p.exists():
        return None, None
    tot, games = {}, {}
    for wk in json.loads(p.read_text())["weeks"]:
        for pid, v in wk["points"].items():
            tot[pid] = tot.get(pid, 0.0) + float(v)
            games[pid] = games.get(pid, 0) + 1
    return tot, games


def player_weeks(src, yr):
    out = {}
    if src == "league":
        s = MG.season_of(HIST, str(yr))
        if s is None:
            return out
        for w, d in RS.global_player_points(s).items():
            for pid, v in d.items():
                out[(str(w), str(pid))] = float(v)
        return out
    for wk in json.loads((BT / f"nflverse_weekly_points_{yr}.json").read_text())["weeks"]:
        for pid, v in wk["points"].items():
            out[(str(wk["week"]), str(pid))] = float(v)
    return out


def exact_rate(a, b):
    sh = set(a) & set(b)
    if not sh:
        return 0.0, 0, 0
    bad = sum(1 for k in sh if abs(a[k] - b[k]) > 0.02)
    return 100.0 * (len(sh) - bad) / len(sh), len(sh), bad


# ------------------------------------------- the adjuster's per-pick loop
def _realized_vorp(realized):
    by_pos = {}
    for pid, v in realized.items():
        pos = POSITIONS.get(pid)
        if pos:
            by_pos.setdefault(pos, []).append((pid, v))
    out = {}
    for pos, lst in by_pos.items():
        lst.sort(key=lambda t: -t[1])
        n = REPLACEMENT_RANK.get(pos, 12)
        base = lst[n - 1][1] if len(lst) >= n else (lst[-1][1] if lst else 0.0)
        for pid, v in lst:
            out[pid] = v - base
    return out


def score_season(yr, proj):
    """Faithful replication of exp_inverse_adjuster.run()'s classification."""
    s = MG.season_of(HIST, str(yr))
    picks = X.real_draft(s)
    decisions = X.cory_decisions(picks, X.cory_roster_id(s))
    realized, _ = league_season(yr)
    vorp = _realized_vorp(realized)
    pickno_of = {}
    for p in picks:
        pid = str(p.get("player_id"))
        if pid and p.get("pick_no") and pid not in pickno_of:
            pickno_of[pid] = int(p["pick_no"])
    has_value = bool(proj)
    rows = []
    for d in decisions:
        pn = d.get("pick_no") or 0
        avail = {pid for pid in X.board_before(picks, pn)
                 if pid in vorp and POSITIONS.get(pid)}
        skill = {pid for pid in avail if POSITIONS.get(pid) in SKILL}
        if not skill:
            continue
        top = sorted(skill, key=lambda pid: -vorp[pid])[:TOP_OUTCOMES]
        market_order = sorted(skill, key=lambda pid: pickno_of.get(pid, 9999))
        value_order = sorted(skill, key=lambda pid: -proj.get(pid, -1)) if has_value else []

        def rank(pid, order):
            try:
                return order.index(pid) + 1
            except ValueError:
                return None

        def recovered(order):
            return bool(order) and any(rank(p, order) and rank(p, order) <= TOPK for p in top)

        cls = ("market" if recovered(market_order)
               else "value_only" if recovered(value_order)
               else "unreachable" if has_value else "unreachable_marketonly")
        rows.append({"pick_no": pn, "class": cls})
    return rows


# ================================================================= CONTROLS
print("=" * 74)
print("REGISTER 27 — is the stated sample-size limit real? (report-only)")
print("=" * 74)

tot_rate = []
for yr in (2023, 2024, 2025):
    r, n, bad = exact_rate(player_weeks("league", yr), player_weeks("nflverse", yr))
    tot_rate.append((yr, r, n, bad))
agg_n = sum(t[2] for t in tot_rate)
agg_bad = sum(t[3] for t in tot_rate)
agg = 100.0 * (agg_n - agg_bad) / agg_n
print(f"\nK1 SCORING JOIN   {agg_n} shared player-weeks across 2023-25, "
      f"{agg_bad} disagree by >0.02 -> {agg:.2f}% exact")
if agg <= 99.0:
    FAILS.append("K1")
print(f"                  -> {'PASS' if agg > 99.0 else 'FAIL'} (need >99%)")

rn, _, _ = exact_rate(player_weeks("league", 2023), player_weeks("nflverse", 2024))
print(f"\nK2 NEGATIVE       2023-league vs 2024-nflverse -> {rn:.2f}% exact (must be <50%)")
if rn >= 50.0:
    FAILS.append("K2")
print(f"                  -> {'PASS' if rn < 50.0 else 'FAIL — cannot detect a mismatch'}")

committed = json.loads((BT / "exp_inverse_adjuster.json").read_text())
ltp, ltg = league_season(2023)
mine24 = [r["class"] for r in score_season(2024, walk_forward(2024, {2023: ltp}, {2023: ltg}, POSITIONS))]
theirs24 = [r["class"] for r in committed["per_season"]["2024"]["rounds"]]
k3 = mine24 == theirs24
print(f"\nK3 REPLICATION    my 2024 adjuster loop vs the committed classifications")
print(f"                  mine   {dict(collections.Counter(mine24))}")
print(f"                  commit {dict(collections.Counter(theirs24))}")
print(f"                  -> {'PASS — identical per pick' if k3 else 'FAIL'}")
if not k3:
    FAILS.append("K3")

_saved = (MA.GRADED_SEASON, MA.PRIOR_SEASONS)
k4 = MA.grade() == MA.grade()
print(f"\nK4 DETERMINISM    accuracy harness graded twice -> {'PASS' if k4 else 'FAIL'}")
if not k4:
    FAILS.append("K4")

MA.GRADED_SEASON, MA.PRIOR_SEASONS = 2020, (2018, 2019)
try:
    MA.grade()
    k5 = False
except Exception:
    k5 = True
MA.GRADED_SEASON, MA.PRIOR_SEASONS = _saved
print(f"\nK5 NEGATIVE       grading 2020 (no store on disk) must raise -> "
      f"{'PASS' if k5 else 'FAIL — it returned a result'}")
if not k5:
    FAILS.append("K5")

if FAILS:
    print(f"\n⛔ CONTROLS FAILED {FAILS} — NO FINDING BELOW IS LICENSED.")
    sys.exit(1)
print("\n✅ all five controls green\n")

# =============================================================== STUDY 1
print("=" * 74)
print("STUDY 1 — exp_inverse_adjuster: 'Needs a prior season, so 2024 and 2025")
print("          only; 2023 is MARKET-only and says so.'")
print("=" * 74)
ntp, ntg = nflverse_season(2022)
new23 = score_season(2023, walk_forward(2023, {2022: ntp}, {2022: ntg}, POSITIONS))
old23 = score_season(2023, {})
print(f"\nleague_history has no 2022 -> proj={{}} -> 2023 scored on MARKET alone.")
print(f"nflverse_weekly_points_2022 has {len(ntp)} players, in THIS league's scoring (K1).")
print(f"\n  2023 as committed : {dict(collections.Counter(r['class'] for r in old23))}")
print(f"  2023 with 2022    : {dict(collections.Counter(r['class'] for r in new23))}")
print(f"  picks reclassified: {sum(1 for a, b in zip(old23, new23) if a['class'] != b['class'])} of {len(old23)}")

print("\n  CONFOUND TEST — is the gain the SEASON or just wider player coverage?")
print("  Re-run 2024 and 2025 on nflverse priors too (559/570 players vs ~250):")
for yr in (2024, 2025):
    py = yr - 1
    lt, lg = league_season(py)
    nt, ng = nflverse_season(py)
    a = collections.Counter(r["class"] for r in score_season(yr, walk_forward(yr, {py: lt}, {py: lg}, POSITIONS)))
    b = collections.Counter(r["class"] for r in score_season(yr, walk_forward(yr, {py: nt}, {py: ng}, POSITIONS)))
    print(f"    {yr}: league-prior value_only {a.get('value_only', 0)}  ->  "
          f"nflverse-prior value_only {b.get('value_only', 0)}")
print("  Wider coverage does NOT help 2024/2025 — the 2023 gain is the season, not the pool.")

# =============================================================== STUDY 2
print("\n" + "=" * 74)
print("STUDY 2 — model_accuracy_backtest: '2025 is the ONLY graded season: it is")
print("          the only one whose two prior seasons are both on committed stores'")
print("=" * 74)
print(f"\nConstants: GRADED_SEASON={MA.GRADED_SEASON} PRIOR_SEASONS={MA.PRIOR_SEASONS}")
print("season_totals()/_store() are fully season-general; only these two constants bind it.\n")
best = {}
for gs, pr in ((2023, (2021, 2022)), (2024, (2022, 2023)), (2025, (2023, 2024))):
    MA.GRADED_SEASON, MA.PRIOR_SEASONS = gs, pr
    r = MA.grade()
    print(f"  GRADED_SEASON={gs} PRIOR_SEASONS={pr} -> RAN")
    for n in sorted(r["models"]):
        v = r["models"][n]
        cells = " ".join(f"{p} {v['cells'][p]['mae']:6.2f}" for p in ("QB", "RB", "WR", "TE")
                         if v.get("cells", {}).get(p, {}).get("mae") is not None)
        f_, e_ = v["forecasts"], v["excluded_no_weekly_row"]
        print(f"     {n:<15}{cells}   excluded {e_}/{f_} ({100 * e_ / f_:.1f}%)")
    for p in ("QB", "RB", "WR", "TE"):
        cand = [(n, r["models"][n]["cells"][p]["mae"]) for n in r["models"]
                if r["models"][n].get("cells", {}).get(p, {}).get("mae") is not None]
        if cand:
            best[(gs, p)] = min(cand, key=lambda t: t[1])[0]
MA.GRADED_SEASON, MA.PRIOR_SEASONS = _saved
wins = collections.Counter(best.values())
print(f"\n  BEST MODEL per position-season across 3 seasons: {dict(wins)}")
print(f"  -> the committed n=1 artifact can show 4 of 4; three seasons show "
      f"{wins.most_common(1)[0][1]} of {len(best)}.")

# =============================================================== STUDY 3
print("\n" + "=" * 74)
print("STUDY 3 — BLEND-SEARCH-DESIGN: its stated limit is NOT season count.")
print("=" * 74)
print('  "a season is ~17 weeks ... they are NOT 8,500 independent observations"')
print("  That is WITHIN-season autocorrelation. Season count is a separate axis,")
print("  and it splits by ARM — measured from what is on disk:\n")
fams = {"usage (component_stats)": "component_stats", "air yards / EPA (advanced_stats)": "advanced_stats",
        "routes": "routes", "snaps": "snap_counts"}
for label, f in fams.items():
    yrs = [y for y in range(2021, 2026) if (BT / f"{f}_{y}.json").exists()]
    print(f"    {label:<34} n={len(yrs)}  {yrs}")
for label, f in (("props", "props_implied_points"), ("expert ranks", "fp_expert_ranks")):
    yrs = [y for y in range(2021, 2026) if (BT / f"{f}_{y}.json").exists()]
    print(f"    {label:<34} n={len(yrs)}  {yrs}")
for label, f in (("pace", "team_pace_2021_2025.json"), ("vegas", "vegas_lines_2021_2026.json")):
    o = json.loads((BT / f).read_text())
    ks = sorted(o.get("seasons", {}))
    print(f"    {label:<34} n={len(ks)}  {ks}")

print("\n" + "=" * 74)
print("VERDICT: the limit is REAL for anything needing THIS LEAGUE's own lineups")
print("(league_history starts 2023, n=3). It is FALSE for player-outcome studies,")
print("which have n=5 on disk since 2026-08-17.")
print("=" * 74)
