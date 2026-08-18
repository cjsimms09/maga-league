# TERRITORY: A
"""BLENDED proj_mean — the constructibility gate, the coverage census, the
five candidate policies, and the mechanism probe.

Preregistered in `draft/backtest/PROJ-MEAN-BLEND-PREREG.md` (+ Amendment 1),
committed BEFORE this file produced any artifact — commit order is the proof.
Executes Cory's 2026-08-16 ruling to blend `proj_mean` rather than swap it,
and his follow-up ruling on the rookie/K/DEF fallback, subject to the bars
frozen in that prereg.

REFUSAL-FIRST. Prereg §2 is checked before anything is graded, because a blend
is a PER-PLAYER average and its accuracy is decided by the ERROR CORRELATION
between sources — a quantity no aggregate MAE can carry. If the per-player
history for the control arm does not exist, the honest output is a named
refusal, not a plausible number computed from a substitute.

Run: python3 draft/backtest/proj_mean_blend.py
Writes draft/backtest/proj_mean_blend.json
"""
from __future__ import annotations

import copy
import json
import statistics
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(ROOT))

OUT = HERE / "proj_mean_blend.json"
BOARD = ROOT.parent / "public" / "draft_data.json"
POSITIONS = ("QB", "RB", "WR", "TE")
ALL_POSITIONS = ("QB", "RB", "WR", "TE", "K", "DEF")
MIN_N = 25                                        # prereg §3
YEAR_WEIGHT = {"2023": 0.5, "2024": 1.0, "2025": 1.0}   # prereg §3, fixed pre-run
ROOKIE_BLOC_LIMIT = 3.0                           # prereg §4, the veto
POLICIES = ("P1", "P2", "P3", "P4", "P5")


def _load(path: Path):
    try:
        return json.loads(path.read_text())
    except Exception:
        return None


# ─────────────────────────────────────────────────────────────────────────────
# §2  THE CONSTRUCTIBILITY GATE
# ─────────────────────────────────────────────────────────────────────────────

def _sleeper_history_paths() -> list[Path]:
    """Every place an archived pre-season Sleeper projection could live.

    An enumeration rather than a single check, so the negative is READ AS
    CLOSELY AS A POSITIVE (SESSION-A clause 13g): the instrument names what it
    looked for, so "nothing is there" is a claim carrying its own evidence
    rather than an unexamined absence.
    """
    out: list[Path] = []
    for season in (2023, 2024, 2025):
        out += [HERE / f"sleeper_projections_{season}.json",
                HERE / f"proj_sleeper_{season}.json",
                HERE / f"sleeper_proj_{season}.json",
                ROOT / "data" / f"sleeper_projections_{season}.json"]
    return out


def _fp_history_paths() -> list[Path]:
    out: list[Path] = []
    for season in (2023, 2024, 2025):
        out += [HERE / f"fp_projections_{season}.json",
                HERE / f"exp_fp_hist_proj_rows_{season}.json",
                HERE / f"fantasypros_projections_{season}.json"]
    return out


def _proj_series_seasons() -> dict:
    doc = _load(ROOT / "data" / "proj_series.json") or {}
    dates = sorted(str(s.get("date")) for s in (doc.get("series") or [])
                   if s.get("date"))
    return {"snapshots": len(dates),
            "earliest": dates[0] if dates else None,
            "latest": dates[-1] if dates else None}


def constructibility_gate() -> dict:
    """Prereg §2. Per-arm per-player availability for 2023/24/25."""
    sl_searched = _sleeper_history_paths()
    sl_found = [p for p in sl_searched if p.exists()]

    fp_agg = _load(HERE / "exp_fp_hist_proj.json") or {}
    fp_rows_retained = any(
        isinstance(y, dict) and ({"rows", "players", "projections"} & set(y))
        for y in (fp_agg.get("years") or {}).values())
    fp_searched = _fp_history_paths()
    fp_found = [p for p in fp_searched if p.exists()]

    own_stores = [HERE / f"nflverse_weekly_points_{s}.json" for s in (2023, 2024, 2025)]
    own_found = [p for p in own_stores if p.exists()]

    def rel(paths):
        out = []
        for p in paths:
            try:
                out.append(str(p.relative_to(ROOT.parent)))
            except ValueError:      # a path outside the repo (test fixtures)
                out.append(str(p))
        return out

    arms = {
        "sleeper": {
            "per_player_history": bool(sl_found),
            "searched": rel(sl_searched),
            "found": rel(sl_found),
            "proj_series": _proj_series_seasons(),
            "why": ("Sleeper published no pre-2026 preseason projection archive and "
                    "none was ever captured here. draft/data/proj_series.json — the "
                    "only Sleeper freeze that exists — starts 2026-08-09, so it "
                    "covers the 2026 season and no earlier one. Recorded "
                    "independently three times in this repo before this run: "
                    "model_accuracy_backtest.py's docstring ('a backtest of the "
                    "SOURCES against 2023-25 is UNMEASURABLE from this repo'), "
                    "draft/audit/projection_skill_backtest_2026-08-15.md § 'what "
                    "can never be known', and SOURCE-WEIGHT-PRIOR-PREREG.md §4. A "
                    "retroactive fetch leaks (exp33): it grades flatteringly "
                    "because it already knows the injuries."),
            "what_a_positive_would_look_like": (
                "a committed per-player file keyed by Sleeper player_id carrying a "
                "2023/24/25 preseason projection, dated before that season's week 1 "
                "and passing the EXP-FP-HIST-PROJ marker gate (a dead top pick still "
                "projected full-season-sized). No such file exists at any searched "
                "path, and proj_series.json's earliest snapshot post-dates every "
                "gradeable season."),
        },
        "fantasypros": {
            "per_player_history": bool(fp_found) or fp_rows_retained,
            "searched": rel(fp_searched) + ["draft/backtest/exp_fp_hist_proj.json"],
            "found": rel(fp_found),
            "aggregate_only": bool(fp_agg) and not fp_rows_retained,
            "why": ("exp_fp_hist_proj graded 2023/24/25 in CI and passed every "
                    "authenticity gate, but committed ONLY per-position aggregates "
                    "(n / MAE / bias / Spearman). The per-player archive rows were "
                    "deliberately not retained — SOURCE-WEIGHT-PRIOR-PREREG.md §4 "
                    "states it and draws the same consequence: 'the ideal held-out "
                    "test ... is NOT constructible offline'. Re-fetching is CI-only "
                    "egress and is unreachable from this sandbox — the agent proxy "
                    "answers CONNECT for fantasypros.com with 403 (verified this "
                    "run, both via urllib and curl)."),
        },
        "own_v6": {
            "per_player_history": len(own_found) == len(own_stores),
            "searched": rel(own_stores),
            "found": rel(own_found),
            "why": ("reproducible offline and leak-free from the committed weekly "
                    "and component stores; own_model_v6's construction is a "
                    "deterministic function of them."),
        },
    }

    if not arms["sleeper"]["per_player_history"]:
        status = "no_control"
        why = ("The CONTROL arm — Sleeper alone — has no per-player history for any "
               "graded season, so 'does the blend rank players better than Sleeper "
               "alone' has no measurable answer on 2023/2024/2025. Prereg §2: a "
               "missing control is a REFUSAL, and substituting a different "
               "professional source would be a different test wearing this one's "
               "name.")
    elif not arms["fantasypros"]["per_player_history"]:
        status, why = "unconstructible:fantasypros", "FP per-player rows absent."
    elif not arms["own_v6"]["per_player_history"]:
        status, why = "unconstructible:own_v6", "own-model weekly stores absent."
    else:
        status, why = "constructible", "every arm has per-player history."

    # AMENDMENT 2 (a)/(b) — the position-weighted arm A3 has a SECOND
    # requirement beyond per-player history: its weights must be fitted on
    # seasons OTHER than the one graded, or they are the answer key.
    stores = sorted(int(p.name.split("_")[-1].split(".")[0])
                    for p in HERE.glob("nflverse_weekly_points_*.json"))
    # An own-model arm needs two prior seasons, so a season Y is predictable
    # only when Y-1 and Y-2 are both on committed stores.
    predictable = [y for y in stores if (y - 1) in stores and (y - 2) in stores]
    a3 = {
        "requires": ("per-player history for every source (as A1/A2) AND at least "
                     "two independently gradeable seasons, so weights fitted on one "
                     "can be applied to another"),
        "weekly_stores": stores,
        "seasons_predictable_leak_free": predictable,
        "fit_seasons_available": max(0, len(predictable) - 1),
        "constructible": bool(arms["sleeper"]["per_player_history"]
                             and arms["fantasypros"]["per_player_history"]
                             and len(predictable) >= 2),
        "verdict": "DROPPED",
        "dropped_for_reasons": ["no_per_player_source_history"],
        "why_dropped": (
            "ONE block now, where there were two. (1) STILL BINDING: the same "
            "per-player history gap as A1/A2 — there is no Sleeper or FantasyPros "
            "per-player series to weight, so a position weight between THOSE "
            "sources cannot be fitted on any season. (2) DISSOLVED 2026-08-17: "
            "this used to also say only ONE season was predictable leak-free "
            "(2025 needs 2023+2024; grading 2024 needed 2022, which was not "
            "committed). nflverse_weekly_points_{2021,2022}.json were then "
            "rebuilt offline from the committed component stores — licensed by an "
            "exact reproduction of the committed 2023 store, 5,371 player-weeks "
            "and 0 disagreements — so `seasons_predictable_leak_free` is now "
            "[2023, 2024, 2025] and a fit-on-2023+2024 / grade-on-2025 weight IS "
            "constructible. The arm stays dropped on (1) alone."),
        "reason_2_was_tested_separately": (
            "Amendment 2 (b) predicted a fitted-on-itself position weight would be "
            "'the strongest-looking number in this study and would mean nothing'. "
            "Once reason (2) dissolved that became checkable rather than merely "
            "asserted, and it was checked on the own-model arms in "
            "draft/backtest/position_weight_transfer.py (prereg: "
            "POSITION-WEIGHT-TRANSFER-PREREG.md, verdict: "
            "draft/audit/position_weight_transfer_2026-08-17.md). The precaution "
            "was still right to take, but the measured leak is worth a MEDIAN OF "
            "0.00000 rho and a maximum of 0.0058 — the answer-key arm is not the "
            "strongest-looking number, because inverse-MSE weighting between two "
            "similar arms is too insensitive for even the answer key to exploit. "
            "The mechanism itself came back NULL, so (1) dissolving would not "
            "resurrect this arm either."),
    }

    return {"status": status, "why": why, "arms": arms,
            "position_weighted_arm_A3": a3}


# ─────────────────────────────────────────────────────────────────────────────
# §4  THE COVERAGE CENSUS
# ─────────────────────────────────────────────────────────────────────────────

def _rank_fallback_value(p: dict) -> float:
    """projections._rank_fallback, reproduced so a board row can be tested for
    'this proj_baseline is an ADP decay, not a Sleeper projection'."""
    adp = p.get("raw_adp") or 200
    base = {"QB": 320, "RB": 270, "WR": 260, "TE": 190,
            "K": 130, "DEF": 120}.get(p.get("position"), 200)
    return max(20.0, base * (1.0 - 0.0035 * float(adp)))


def sources_of(p: dict) -> dict:
    """The three sources for one board row.

    `proj_sleeper` is NOT the Sleeper presence test: build.py stamps it only
    inside the FantasyPros attach block, so it is absent wherever FP is absent
    and would undercount Sleeper by exactly FP's coverage gap. The Sleeper value
    is `proj_baseline` — what projections.blend() actually consumed.
    """
    base = p.get("proj_baseline")
    fallback = (base is not None
                and abs(float(base) - _rank_fallback_value(p)) < 0.01)
    return {
        "sleeper": None if base is None else float(base),
        "sleeper_is_adp_fallback": bool(fallback),
        "fantasypros": None if p.get("proj_fantasypros") is None else float(p["proj_fantasypros"]),
        "own": None if p.get("proj_ownmodel") is None else float(p["proj_ownmodel"]),
    }


def is_rookie(p: dict) -> bool:
    return (p.get("years_exp") or 0) == 0


def coverage_census(rows: list[dict]) -> dict:
    """Prereg §4. Per position x {rookie, veteran}, how many REAL sources."""
    cells: dict = {}
    for p in rows:
        pos = p.get("position") or "?"
        grp = "rookie" if is_rookie(p) else "veteran"
        s = sources_of(p)
        real = sum([
            int(s["sleeper"] is not None and not s["sleeper_is_adp_fallback"]),
            int(s["fantasypros"] is not None),
            int(s["own"] is not None)])
        cell = cells.setdefault(pos, {}).setdefault(grp, {
            "n": 0, "sources_0": 0, "sources_1": 0, "sources_2": 0, "sources_3": 0,
            "sleeper_adp_fallback_only": 0, "has_fp": 0, "has_own": 0})
        cell["n"] += 1
        cell[f"sources_{real}"] += 1
        cell["sleeper_adp_fallback_only"] += int(s["sleeper_is_adp_fallback"])
        cell["has_fp"] += int(s["fantasypros"] is not None)
        cell["has_own"] += int(s["own"] is not None)
    return cells


# ─────────────────────────────────────────────────────────────────────────────
# THE FIVE POLICIES
# ─────────────────────────────────────────────────────────────────────────────

def level_offsets(rows: list[dict]) -> dict:
    """P2's correction: per position, median(source − Sleeper) measured ONLY on
    players carrying both. Anchors every source to SLEEPER's level, which is the
    constructible half of the idea: it needs no knowledge of Sleeper's own bias
    against truth (the quantity §2 proves does not exist).

    Absent != zero — a position with fewer than MIN_N paired rows gets no offset
    and says so, and P2 then refuses to blend that source rather than applying 0.
    """
    out: dict = {}
    for pos in ALL_POSITIONS:
        d_fp, d_own = [], []
        for p in rows:
            if p.get("position") != pos:
                continue
            s = sources_of(p)
            if s["sleeper"] is None or s["sleeper_is_adp_fallback"]:
                continue
            if s["fantasypros"] is not None:
                d_fp.append(s["fantasypros"] - s["sleeper"])
            if s["own"] is not None:
                d_own.append(s["own"] - s["sleeper"])
        out[pos] = {
            "fantasypros": {"n": len(d_fp),
                            "offset": round(statistics.median(d_fp), 2) if len(d_fp) >= MIN_N else None},
            "own": {"n": len(d_own),
                    "offset": round(statistics.median(d_own), 2) if len(d_own) >= MIN_N else None},
        }
    return out


def measured_biases() -> dict:
    """P4's correction (Cory's option (a)): each source's measured per-position
    bias against REALIZED points.

    own_v6 from model_accuracy_v6.json (2025). FantasyPros from
    exp_fp_hist_proj.json, averaged across years under prereg §3's weighting
    (2023 at 0.5). Sleeper's own bias against realized points DOES NOT EXIST —
    §2 is exactly that finding — so P4 must carry 0 for it BY ASSUMPTION, and
    that assumption is stamped in the output rather than buried.
    """
    own = {}
    v6 = _load(HERE / "model_accuracy_v6.json") or {}
    cells = (((v6.get("arm_2025") or {}).get("models") or {})
             .get("own_v6") or {}).get("cells") or {}
    for pos in POSITIONS:
        c = cells.get(pos) or {}
        own[pos] = c.get("bias") if c.get("status") == "measured" else None

    fp = {}
    hist = _load(HERE / "exp_fp_hist_proj.json") or {}
    for pos in POSITIONS:
        num = den = 0.0
        years = []
        for yr, doc in (hist.get("years") or {}).items():
            w = YEAR_WEIGHT.get(str(yr))
            cell = ((doc.get("metrics") or {}).get("fp_cells") or {}).get(pos) or {}
            if w and cell.get("status") == "measured" and cell.get("bias") is not None:
                num += w * float(cell["bias"])
                den += w
                years.append({"year": yr, "weight": w, "bias": cell["bias"]})
        fp[pos] = round(num / den, 2) if den else None
        fp.setdefault("_years", {})[pos] = years

    return {
        "own": own,
        "fantasypros": {k: v for k, v in fp.items() if k != "_years"},
        "fantasypros_years": fp.get("_years", {}),
        "sleeper": {pos: 0.0 for pos in ALL_POSITIONS},
        "sleeper_is_an_assumption": (
            "ZERO BY ASSUMPTION, NOT BY MEASUREMENT. Sleeper's bias against "
            "realized points is the quantity the constructibility gate proves "
            "does not exist for any graded season. P4 therefore corrects two of "
            "three sources onto the truth scale and leaves the third where it is "
            "— an unmeasured term sitting inside the correction whose whole "
            "purpose is to remove unmeasured terms. Read every P4 number with "
            "that in it."),
        "stationarity_caveat": (
            "own_v6's biases are one season (2025); FP's are 2023-25 weighted. "
            "Both are past-season measurements applied to a 2026 board and "
            "nothing here shows they are stationary."),
    }


def _percentiles(values: dict) -> dict:
    """{key: value} -> {key: percentile in [0,1]}, ties share the average rank."""
    if len(values) < 2:
        return {k: 0.5 for k in values}
    items = sorted(values.items(), key=lambda kv: kv[1])
    out, i, n = {}, 0, len(items)
    while i < n:
        j = i
        while j + 1 < n and items[j + 1][1] == items[i][1]:
            j += 1
        pct = ((i + j) / 2) / (n - 1)
        for k in range(i, j + 1):
            out[items[k][0]] = pct
        i = j + 1
    return out


def policy_baselines(rows: list[dict], policy: str, offsets: dict,
                     biases: dict) -> dict:
    """{player_id: new proj_baseline} for the rows this policy actually blends.

    A player absent from the returned dict KEEPS Sleeper. None is never coerced
    to 0 anywhere in here.
    """
    if policy == "P0":
        return {}
    if policy == "P5":
        return _rank_space_baselines(rows)

    out: dict = {}
    for p in rows:
        pid = str(p.get("player_id"))
        s = sources_of(p)
        if s["sleeper"] is None:
            continue
        pos = p.get("position")
        present = 1 + int(s["fantasypros"] is not None) + int(s["own"] is not None)
        if policy == "P1" and present < 3:
            continue
        if policy == "P3" and present < 2:
            continue

        vals = [s["sleeper"]]
        if policy == "P2":
            off = offsets.get(pos) or {}
            ok = True
            for key, name in (("fantasypros", "fantasypros"), ("own", "own")):
                if s[key] is None:
                    continue
                o = (off.get(name) or {}).get("offset")
                if o is None:          # no measured offset -> keep Sleeper, do not assume 0
                    ok = False
                    break
                vals.append(s[key] - o)
            if not ok:
                continue
        elif policy == "P4":
            ok = True
            for key, table in (("fantasypros", biases["fantasypros"]),
                               ("own", biases["own"])):
                if s[key] is None:
                    continue
                b = table.get(pos)
                if b is None:          # no measured bias at this position -> refuse
                    ok = False
                    break
                vals.append(s[key] - b)
            if not ok:
                continue
        else:                          # P1 / P3 — naive average of what is present
            for key in ("fantasypros", "own"):
                if s[key] is not None:
                    vals.append(s[key])

        if len(vals) < 2:
            continue
        out[pid] = sum(vals) / len(vals)
    return out


def _rank_space_baselines(rows: list[dict]) -> dict:
    """P5 — Cory's option (b), with the population correction from Amendment 1.

    Per position:
      pct_sleeper   percentile of proj_baseline among ALL rows at the position
      QUANTILE TRANSFER: for player i covered by source s, take his rank under
                    s inside C_s = {rows carrying Sleeper AND s}, find the
                    player j holding that same rank inside C_s under SLEEPER,
                    and read off j's GLOBAL Sleeper percentile. That is source
                    s's opinion expressed on the one scale everybody shares.
      delta_s(i)    pct_transferred(i) − pct_sleeper_global(i)
      blended_pct   pct_sleeper_global + mean(delta a player actually has)
      back-map      the position's Sleeper values, re-dealt in blended_pct order

    WHY THE TRANSFER RATHER THAN A BARE SUB-POPULATION PERCENTILE, and this was
    found by measuring rather than by reasoning: the first construction here
    subtracted two percentiles both taken INSIDE C_s and added the difference to
    a percentile taken on the FULL position. Those are different rulers.
    own_v6's coverage is veterans-only and veterans sit mostly at the top of the
    board, so a fixed shift in veteran-space is a LARGER shift in board-space,
    and the veteran bloc moved for that reason alone — the exact class of defect
    §4 exists to catch, reproduced inside the fix for it. Measured: the bare
    version moved rookies down a mean 12.3 board ranks against veterans' 4.7 up.
    The transfer carries no density assumption, so it does not have that failure.

    The back-map is an exact within-position PERMUTATION, so the multiset of
    proj_baseline at each position is unchanged: replacement level, the flex
    allocation and the cross-position dollar scale cannot move. Only ordering
    within a position can. K and DEF, which no second source covers, come out
    byte-identical.
    """
    out: dict = {}
    by_pos: dict[str, list[dict]] = {}
    for p in rows:
        if p.get("proj_baseline") is None:
            continue
        by_pos.setdefault(p.get("position") or "?", []).append(p)

    for pos, group in by_pos.items():
        sl = {str(p["player_id"]): float(p["proj_baseline"]) for p in group}
        pct_sl_global = _percentiles(sl)

        deltas: dict[str, list[float]] = {pid: [] for pid in sl}
        for key in ("fantasypros", "own"):
            cov = {}
            for p in group:
                v = sources_of(p)[key]
                if v is not None:
                    cov[str(p["player_id"])] = v
            if len(cov) < MIN_N:
                continue                       # too thin to speak; contributes nothing
            # The shared population, ordered by each ruler.
            by_src = sorted(cov, key=lambda pid: cov[pid])
            by_sl = sorted(cov, key=lambda pid: sl[pid])
            for rank, pid in enumerate(by_src):
                transferred = pct_sl_global[by_sl[rank]]
                deltas[pid].append(transferred - pct_sl_global[pid])

        blended = {}
        for pid in sl:
            d = deltas[pid]
            blended[pid] = (pct_sl_global[pid]
                            + (statistics.fmean(d) if d else 0.0))

        # Back-map: re-deal this position's own Sleeper values in blended order.
        # Tie-break on the original percentile so the map is deterministic and
        # a player with no opinion attached cannot be shuffled by sort order.
        order = sorted(sl, key=lambda pid: (blended[pid], pct_sl_global[pid], pid))
        ladder = sorted(sl.values())
        for slot, pid in enumerate(order):
            if abs(ladder[slot] - sl[pid]) > 1e-9:
                out[pid] = ladder[slot]
    return out


# ─────────────────────────────────────────────────────────────────────────────
# APPLYING A POLICY AND MEASURING WHAT MOVED
# ─────────────────────────────────────────────────────────────────────────────

def disagreement_decomposition(rows: list[dict]) -> dict:
    """ARTIFACT OR OPINION — the question the bloc test alone cannot answer.

    A rookie bloc can move for two completely different reasons and they demand
    opposite responses:

      COVERAGE ARTIFACT   the group moved because it caught fewer sources.
                          A bug. Fix the policy.
      GENUINE DISAGREEMENT a source that DOES cover both groups ranks rookies
                          differently from Sleeper. That is a football opinion
                          and suppressing it would be suppressing the signal
                          the blend exists to capture.

    Measured here per source, per position, on the shared population only: the
    mean rank-percentile disagreement against Sleeper, split rookie vs veteran.
    A source covering both groups whose rookie mean differs from its veteran
    mean is expressing an OPINION about rookies. A source covering only one
    group can express nothing and shows as `no_coverage`.
    """
    out: dict = {}
    by_pos: dict[str, list[dict]] = {}
    for p in rows:
        if p.get("proj_baseline") is None:
            continue
        by_pos.setdefault(p.get("position") or "?", []).append(p)

    for pos, group in by_pos.items():
        sl = {str(p["player_id"]): float(p["proj_baseline"]) for p in group}
        pct_sl_global = _percentiles(sl)
        rookie = {str(p["player_id"]): is_rookie(p) for p in group}
        cell = {}
        for key in ("fantasypros", "own"):
            cov = {}
            for p in group:
                v = sources_of(p)[key]
                if v is not None:
                    cov[str(p["player_id"])] = v
            if len(cov) < MIN_N:
                cell[key] = {"n": len(cov), "status": "too_thin"}
                continue
            by_src = sorted(cov, key=lambda pid: cov[pid])
            by_sl = sorted(cov, key=lambda pid: sl[pid])
            d_rook, d_vet = [], []
            for rank, pid in enumerate(by_src):
                d = pct_sl_global[by_sl[rank]] - pct_sl_global[pid]
                (d_rook if rookie[pid] else d_vet).append(d)
            cell[key] = {
                "n": len(cov),
                "n_rookie_covered": len(d_rook),
                "n_veteran_covered": len(d_vet),
                "status": "measured",
                "rookie_mean_delta_pct": round(statistics.fmean(d_rook), 4) if d_rook else None,
                "veteran_mean_delta_pct": round(statistics.fmean(d_vet), 4) if d_vet else None,
                "reading": ("no_coverage — this source sees no rookie at this "
                            "position, so it can express no opinion about them "
                            "and any bloc movement it causes is ARTIFACT"
                            if not d_rook else
                            "covers both groups — a difference between the two "
                            "means is a genuine OPINION about rookies"),
            }
        out[pos] = cell
    return out


def _apply(rows: list[dict], policy: str, offsets: dict, biases: dict,
           cfg: dict) -> dict:
    """Recompute proj_baseline -> proj_mean -> VORP -> overall rank.

    Each row keeps the `opportunity_adj` it already carries, so the ONLY thing
    that moves is the baseline. That isolates the change under test.
    """
    import vorp as vorp_mod

    work = copy.deepcopy(rows)
    new = policy_baselines(work, policy, offsets, biases)
    for p in work:
        b = new.get(str(p.get("player_id")))
        if b is None:
            continue
        adj = float(p.get("opportunity_adj") or 0.0)
        p["proj_baseline"] = round(b, 2)
        p["proj_mean"] = round(b * (1 + adj), 2)
    work, diag = vorp_mod.apply_vorp(work, cfg)
    return {"rows": {str(p["player_id"]): p for p in work},
            "blended": len(new), "replacement": diag["replacement_points"]}


def _dist(rows: dict, pos: str) -> dict:
    v = sorted(float(p["proj_mean"]) for p in rows.values()
               if p.get("position") == pos and p.get("proj_mean") is not None)
    if not v:
        return {"n": 0}
    return {"n": len(v), "sum": round(sum(v), 1), "max": round(v[-1], 2),
            "median": round(statistics.median(v), 2), "min": round(v[0], 2)}


def _draftable_cut(draftable: dict) -> dict:
    """POST-HOC, AND LABELLED AS SUCH — it cannot rescue a policy.

    The preregistered veto counts every row on a 685-row board, so a player
    sliding from rank 500 to rank 823 counts the same as one sliding out of
    round 3. That is a real weakness in the bar I wrote, and it was visible only
    after the run (median gaps small, mean gaps large — the movement lives in a
    tail nobody drafts). This cut restricts to `adp <= 225`, the draftable
    threshold this repo already uses. It is reported so the next attempt can
    preregister a better bar; prereg §4 governs the ship decision and this does
    not touch it.
    """
    r, v = draftable["rookie"], draftable["veteran"]
    if not (r and v):
        return {"status": "unmeasurable", "n_rookie": len(r), "n_veteran": len(v)}
    med = round(abs(statistics.median(r) - statistics.median(v)), 2)
    mean = round(abs(statistics.fmean(r) - statistics.fmean(v)), 2)
    return {
        "status": "post_hoc_diagnostic_only",
        "n_rookie": len(r), "n_veteran": len(v),
        "rookie_median_delta": round(statistics.median(r), 2),
        "veteran_median_delta": round(statistics.median(v), 2),
        "rookie_mean_delta": round(statistics.fmean(r), 2),
        "veteran_mean_delta": round(statistics.fmean(v), 2),
        "median_gap": med, "mean_gap": mean,
        "would_have_passed": bool(med < ROOKIE_BLOC_LIMIT and mean < ROOKIE_BLOC_LIMIT),
        "cannot_rescue": ("Declared: this cut was chosen AFTER seeing the "
                          "preregistered veto fail. It is a diagnostic for the "
                          "next preregistration, never a second chance at this "
                          "one."),
    }


def policy_report(rows: list[dict], policy: str, base: dict, offsets: dict,
                  biases: dict, cfg: dict) -> dict:
    """Prereg §4's veto plus the K/DEF rescale check Amendment 1 requires."""
    cand = _apply(rows, policy, offsets, biases, cfg)

    deltas = {"rookie": [], "veteran": []}
    draftable = {"rookie": [], "veteran": []}
    movers = []
    for pid, b in base["rows"].items():
        c = cand["rows"].get(pid)
        if c is None:
            continue
        d = c["overall_rank"] - b["overall_rank"]        # +ve = moved DOWN the board
        grp = "rookie" if is_rookie(b) else "veteran"
        deltas[grp].append(d)
        if (b.get("adp") or 999) <= 225:
            draftable[grp].append(d)
        movers.append((abs(d), d, b.get("name"), b.get("position"), grp,
                       b.get("overall_rank"), c["overall_rank"]))
    movers.sort(reverse=True)

    r, v = deltas["rookie"], deltas["veteran"]
    med_gap = (None if not (r and v) else
               round(abs(statistics.median(r) - statistics.median(v)), 2))
    mean_gap = (None if not (r and v) else
                round(abs(statistics.fmean(r) - statistics.fmean(v)), 2))
    passes = (med_gap is not None and mean_gap is not None
              and med_gap < ROOKIE_BLOC_LIMIT and mean_gap < ROOKIE_BLOC_LIMIT)

    repl = {}
    for pos in ALL_POSITIONS:
        b0, b1 = base["replacement"].get(pos), cand["replacement"].get(pos)
        repl[pos] = {"before": b0, "after": b1,
                     "delta": None if b0 is None or b1 is None else round(b1 - b0, 2)}

    dists = {pos: {"before": _dist(base["rows"], pos),
                   "after": _dist(cand["rows"], pos)} for pos in ALL_POSITIONS}
    kdef_moved = any(dists[pos]["before"] != dists[pos]["after"] for pos in ("K", "DEF"))

    def st(vals, f):
        return round(f(vals), 2) if vals else None

    return {
        "policy": policy,
        "blended_rows": cand["blended"],
        "n_rookie": len(r), "n_veteran": len(v),
        "rookie_median_delta": st(r, statistics.median),
        "veteran_median_delta": st(v, statistics.median),
        "rookie_mean_delta": st(r, statistics.fmean),
        "veteran_mean_delta": st(v, statistics.fmean),
        "median_gap": med_gap, "mean_gap": mean_gap, "limit": ROOKIE_BLOC_LIMIT,
        "bloc_veto": "PASS" if passes else "FAIL",
        "post_hoc_draftable_only": _draftable_cut(draftable),
        "moved_ge_5": sum(1 for m in movers if m[0] >= 5),
        "moved_ge_10": sum(1 for m in movers if m[0] >= 10),
        "max_abs_rank_move": movers[0][0] if movers else 0,
        "replacement_levels": repl,
        "position_distributions": dists,
        "k_def_distribution_moved": kdef_moved,
        "largest_movers": [{"name": m[2], "position": m[3], "group": m[4],
                            "rank_before": m[5], "rank_after": m[6], "delta": m[1]}
                           for m in movers[:10]],
    }


# ─────────────────────────────────────────────────────────────────────────────
# §5  THE MECHANISM PROBE
# ─────────────────────────────────────────────────────────────────────────────

def _pearson(xs, ys):
    n = len(xs)
    if n < 3:
        return None
    mx, my = statistics.fmean(xs), statistics.fmean(ys)
    num = sum((a - mx) * (b - my) for a, b in zip(xs, ys))
    dx = sum((a - mx) ** 2 for a in xs) ** 0.5
    dy = sum((b - my) ** 2 for b in ys) ** 0.5
    return None if dx == 0 or dy == 0 else round(num / (dx * dy), 4)


def _probe_models() -> tuple[dict, dict, dict]:
    """Rebuild the 2025 per-player arms from the SAME committed helpers
    own_model_v6 uses. Reconstructed here rather than imported from that
    module's run() because own_model_v* is read-only to this task — nothing in
    it is edited, and every constant still comes from its committed prereg.
    """
    import fetch_component_stats as FCS      # imported read-only; never edited
    import own_model_v5 as V5
    from lab_projections import walk_forward
    from model_accuracy_backtest import positions_record, season_totals
    from own_model_v2 import features_for, fit_transition, predict
    from own_model_v3 import build_v3, market_ranks, rank_curve
    from own_model_v4 import (build_v4, league_draft_picks, qb_active_games,
                              qb_availability_correction, weekly_points)
    from own_model_v6 import _baselines, board_ages, build_v6

    graded, priors = 2025, (2023, 2024)
    positions, ages = positions_record(), board_ages()

    fits = fit_transition(features_for(2024, (2023,), positions, ages),
                          season_totals(2024)[0])
    feat = features_for(graded, priors, positions, ages)
    v2 = predict(feat, fits)
    base = _baselines(graded, priors)
    blend = base["recency_blend"]

    picks = league_draft_picks(graded)
    curve = rank_curve(max(priors), positions)
    mrank = market_ranks(picks, positions)
    v3 = build_v3(v2, blend, mrank, curve, positions)
    corr, _mu = qb_availability_correction(qb_active_games(weekly_points(max(priors)),
                                                           positions))
    v4 = build_v4(v3, blend, corr, positions)
    v5 = V5.build_v5(v3, V5.comp_opinion(graded, priors, positions, ages,
                                         FCS.implied_team_totals(graded, 1, 1)),
                     blend, corr, mrank, curve, positions)
    v6 = build_v6(v4, v5, positions)

    prior_pts, prior_games = {}, {}
    for y in priors:
        prior_pts[y], prior_games[y] = season_totals(y)
    v1 = walk_forward(graded, prior_pts, prior_games, positions, ages={})

    models = {"own_v6": v6, "own_v5": v5, "own_v4": v4, "own_v3": v3, "own_v2": v2,
              "walk_forward_v1": v1, "recency_blend": blend,
              "naive_prev": base["naive_prev"]}
    return models, positions, season_totals(graded)[0]


def _cross_fit_weighted(pred_a: dict, pred_b: dict, pids: list, actual: dict) -> dict:
    """Amendment 2's position-weighted variant, weights fitted OUT OF SAMPLE.

    Two folds, split deterministically by player id. Weights ∝ 1/MSE are fitted
    on one fold and applied to the other, both directions, so no player is ever
    graded under a weight his own error helped choose.

    NAMED LIMITATION, from the amendment: this is a PLAYER holdout, not a SEASON
    holdout. It cannot see whether a position weight transfers across seasons,
    which is the transfer that matters — and it is the friendly case, because
    both folds share 2025's idiosyncratic shocks. A weighting that fails here has
    failed the easiest test available.
    """
    folds = ([p for p in pids if int(str(p)[-1]) % 2 == 0],
             [p for p in pids if int(str(p)[-1]) % 2 == 1])
    if min(len(f) for f in folds) < 8:
        return {"rho": None, "weight_a_folds": None, "why": "fold too thin"}

    from lab_projections import spearman

    blended, weights = {}, []
    for fit, grade in (folds, folds[::-1]):
        mse_a = statistics.fmean((pred_a[p] - actual[p]) ** 2 for p in fit)
        mse_b = statistics.fmean((pred_b[p] - actual[p]) ** 2 for p in fit)
        if mse_a <= 0 or mse_b <= 0:
            return {"rho": None, "weight_a_folds": None, "why": "degenerate mse"}
        wa = (1 / mse_a) / ((1 / mse_a) + (1 / mse_b))
        weights.append(round(wa, 3))
        for p in grade:
            blended[p] = wa * pred_a[p] + (1 - wa) * pred_b[p]
    ordered = [p for p in pids if p in blended]
    return {"rho": round(spearman([blended[p] for p in ordered],
                                  [actual[p] for p in ordered]), 4),
            "weight_a_folds": weights}


def mechanism_probe() -> dict:
    """Prereg §5. Blend every pair of the offline-constructible 2025 arms and
    ask whether the average beats the better parent. CANNOT license the ship."""
    import itertools

    from lab_projections import spearman

    models, positions, actual = _probe_models()
    names = list(models)

    # REPRODUCTION CHECK — own_v6 is rebuilt here from its committed helpers
    # rather than imported from own_model_v6.run(), so the reconstruction must
    # be PROVEN faithful before any pair result is worth reading. A probe built
    # on a mis-assembled model would produce plausible numbers about nothing.
    committed = ((((_load(HERE / "model_accuracy_v6.json") or {}).get("arm_2025") or {})
                  .get("models") or {}).get("own_v6") or {}).get("cells") or {}
    repro = {}
    for pos in POSITIONS:
        pids = [p for p in models["own_v6"] if positions.get(p) == pos and p in actual]
        want = committed.get(pos) or {}
        got = round(spearman([models["own_v6"][p] for p in pids],
                             [actual[p] for p in pids]), 4) if len(pids) >= MIN_N else None
        same_pop = want.get("n") == len(pids)
        exact = (got is not None and want.get("spearman") is not None
                 and abs(got - want["spearman"]) < 0.0005)
        repro[pos] = {"n_here": len(pids), "n_committed": want.get("n"),
                      "population_delta": (None if want.get("n") is None
                                           else len(pids) - want["n"]),
                      "spearman_here": got, "spearman_committed": want.get("spearman"),
                      "matches": exact and same_pop,
                      "verdict": ("exact" if exact and same_pop
                                  else "population_differs" if not same_pop
                                  else "MODEL_DIFFERS")}
    # A population difference is explainable and benign; a model difference is not.
    # own_model_v2.board_ages() reads public/draft_data.json, so own_v6's graded
    # population tracks the NIGHTLY BOARD REBUILD and is not a pure function of
    # the committed stores. A row added or dropped since the committed run moves
    # a cell's n by exactly that much. Reported rather than smoothed over.
    model_differs = any(c["verdict"] == "MODEL_DIFFERS" for c in repro.values())
    exact_cells = sum(1 for c in repro.values() if c["verdict"] == "exact")
    faithful = not model_differs

    pairs = []
    for a, b in itertools.combinations(names, 2):
        shared = sorted(set(models[a]) & set(models[b]) & set(actual))
        row = {"pair": [a, b], "n_shared": len(shared), "positions": {}}
        for pos in POSITIONS:
            pids = [p for p in shared if positions.get(p) == pos]
            if len(pids) < MIN_N:
                row["positions"][pos] = {"n": len(pids), "status": "unmeasurable"}
                continue
            act = [actual[p] for p in pids]
            ra = spearman([models[a][p] for p in pids], act)
            rb = spearman([models[b][p] for p in pids], act)
            rbl = spearman([(models[a][p] + models[b][p]) / 2 for p in pids], act)
            rw = _cross_fit_weighted(models[a], models[b], pids, actual)
            row["positions"][pos] = {
                "n": len(pids), "status": "measured",
                "rho_a": round(ra, 4), "rho_b": round(rb, 4),
                "rho_equal_blend": round(rbl, 4),
                "rho_weighted_blend": rw["rho"],
                "weight_a_folds": rw["weight_a_folds"],
                "weighted_beat_equal": (None if rw["rho"] is None
                                        else bool(rw["rho"] > rbl)),
                "weighted_beat_better_parent": (None if rw["rho"] is None
                                                else bool(rw["rho"] > max(ra, rb))),
                "beat_better_parent": bool(rbl > max(ra, rb)),
                "error_corr": _pearson([models[a][p] - actual[p] for p in pids],
                                       [models[b][p] - actual[p] for p in pids]),
            }
        pairs.append(row)

    cells = [c for r in pairs for c in r["positions"].values()
             if c.get("status") == "measured"]
    wins = sum(1 for c in cells if c["beat_better_parent"])
    corrs = [c["error_corr"] for c in cells if c["error_corr"] is not None]
    lowcorr = [c for c in cells if c["error_corr"] is not None and c["error_corr"] < 0.8]
    return {
        "status": "measured" if faithful else "reconstruction_unfaithful",
        "graded_season": 2025,
        "arms": names,
        "reproduction_check": {
            "faithful": faithful,
            "cells_exact": exact_cells,
            "cells": repro,
            "why": ("own_v6 is rebuilt from its committed helpers here rather than "
                    "imported from own_model_v6.run(), which exposes no per-player "
                    "predictions and is read-only to this task. The rebuild must "
                    "reproduce model_accuracy_v6.json's committed cells or the probe "
                    "is measuring a different model and says so instead of "
                    "reporting numbers."),
            "incidental_finding": (
                "own_v6's graded cells are NOT a pure function of the committed "
                "stores. own_model_v2.board_ages() reads public/draft_data.json, so "
                "the model's population — and therefore every cell's n and every "
                "published MAE/rho — tracks the nightly board rebuild. Reported "
                "here, not fixed: own_model_v* is read-only to this task."),
        },
        "pairs": pairs,
        "summary": {
            "cells": len(cells),
            "blend_beat_better_parent": wins,
            "share": round(wins / len(cells), 4) if cells else None,
            "median_error_correlation": round(statistics.median(corrs), 4) if corrs else None,
            "min_error_correlation": round(min(corrs), 4) if corrs else None,
            "max_error_correlation": round(max(corrs), 4) if corrs else None,
            "cells_with_error_corr_below_0.8": len(lowcorr),
            "blend_won_among_those": sum(1 for c in lowcorr if c["beat_better_parent"]),
            "weighted_cells": sum(1 for c in cells if c.get("rho_weighted_blend") is not None),
            "weighted_beat_equal": sum(1 for c in cells if c.get("weighted_beat_equal")),
            "weighted_beat_better_parent": sum(
                1 for c in cells if c.get("weighted_beat_better_parent")),
            "weighting_note": (
                "Amendment 2 (a)/(b): weights ∝ 1/MSE fitted by 2-fold cross-fit "
                "over PLAYERS, never on the player being graded. This is a player "
                "holdout, NOT a season holdout — every offline arm can only predict "
                "2025 — so it cannot test whether a position weight transfers "
                "across seasons, which is the transfer that matters. The shipped "
                "arm A3 is DROPPED for exactly that reason; see "
                "constructibility_gate.position_weighted_arm_A3."),
        },
        "cannot_license_the_ship": (
            "Prereg §5, declared before the run: no outcome here changes the ship "
            "decision. None of these arms is Sleeper or FantasyPros, and every arm "
            "from own_v3 up consumes recency_blend internally, so these pairs are "
            "far more correlated than two independent professional forecasts. This "
            "prices the MECHANISM and locates the error-correlation regime; it does "
            "not grade the shipped blend."),
    }


# ─────────────────────────────────────────────────────────────────────────────

def board_rows() -> list[dict]:
    doc = _load(BOARD) or {}
    return list(doc.get("players") or []) + list(doc.get("kept_players") or [])


def run() -> dict:
    import config_schema

    gate = constructibility_gate()
    rows = board_rows()
    cfg = config_schema.load(ROOT / "config" / "league_config.json")
    offsets = level_offsets(rows)
    biases = measured_biases()

    doc = {
        "_territory": "TERRITORY: A — produced by draft/backtest/proj_mean_blend.py",
        "_prereg": ("draft/backtest/PROJ-MEAN-BLEND-PREREG.md (+ Amendment 1), "
                    "both committed before this artifact existed"),
        "_ruling": ("Cory 2026-08-16: 'not replace Sleeper with own_v6 ... but "
                    "blend. A blended proj_mean is a smaller, safer change than a "
                    "swap ... Let's do it' — and, on coverage, 'Can we use sleeper "
                    "or fantasy pros on rookies, k and def'"),
        "board_rows": len(rows),
        "constructibility_gate": gate,
        "graded_test": {
            "status": gate["status"],
            "why": gate["why"],
            "consequence": ("Prereg §3's bar cannot be evaluated on 2023/2024/2025. "
                            "Prereg §2 and §7: the ship decision is REFUSE and "
                            "nothing on the board changes."),
        } if gate["status"] != "constructible" else {"status": "run_the_bar"},
        "coverage_census": coverage_census(rows),
        "disagreement_decomposition": disagreement_decomposition(rows),
        "level_offsets": offsets,
        "measured_biases": biases,
        "policies": {},
        "mechanism_probe": None,
        "ship": None,
    }

    base = _apply(rows, "P0", offsets, biases, cfg)
    for policy in POLICIES:
        doc["policies"][policy] = policy_report(rows, policy, base, offsets,
                                                biases, cfg)

    try:
        doc["mechanism_probe"] = mechanism_probe()
    except Exception as exc:   # noqa: BLE001 — a probe must never masquerade as a grade
        doc["mechanism_probe"] = {"status": "error",
                                  "why": f"{type(exc).__name__}: {exc}"}

    eligible = [k for k, v in doc["policies"].items() if v["bloc_veto"] == "PASS"]
    doc["ship"] = {
        "decision": "REFUSE" if gate["status"] != "constructible" else "SEE_BAR",
        "why": doc["graded_test"].get("why"),
        "policies_passing_bloc_veto": eligible,
        "note": ("The bloc veto is NECESSARY, NOT SUFFICIENT. A policy that passes "
                 "it is still ungraded against realized points, and prereg §3's bar "
                 "— which the constructibility gate says cannot be evaluated — is "
                 "the ship criterion."),
    }
    return doc


def main() -> None:
    doc = run()
    OUT.write_text(json.dumps(doc, indent=1))
    g = doc["constructibility_gate"]
    print(f"constructibility gate: {g['status']}")
    for arm, a in g["arms"].items():
        print(f"    {arm:12s} per-player history: {a['per_player_history']}")
    for k, v in doc["policies"].items():
        print(f"  {k}: blended {v['blended_rows']:4d} rows | bloc veto {v['bloc_veto']} "
              f"| median gap {v['median_gap']} mean gap {v['mean_gap']} "
              f"| K/DEF moved {v['k_def_distribution_moved']} "
              f"| max rank move {v['max_abs_rank_move']}")
    mp = (doc.get("mechanism_probe") or {}).get("summary")
    if mp:
        print(f"  mechanism probe: equal blend beat the better parent in "
              f"{mp['blend_beat_better_parent']}/{mp['cells']} cells; median error "
              f"correlation {mp['median_error_correlation']}")
    print(f"SHIP: {doc['ship']['decision']}")


if __name__ == "__main__":
    main()
