# TERRITORY: E
#!/usr/bin/env python3
"""OPPONENT-NEED SURVIVAL LAYER — measured, backtested BEFORE any wiring.

THE QUESTION. The war room's wait-vs-take decision rests on P(player available
at my next pick). The shipped survival model (public/js/draft/survival.js)
prices that off market ADP + observed room drift; it does not know WHICH seats
pick in the gap or what those seats still need. This module builds that layer
from the room's own history — and grades it against what actually happened
before proposing a single line of wiring.

THE LAYER, exactly:
  1. NEED STATE per opponent seat: dedicated starter slots filled, given
     keepers + picks so far (the same STARTERS the engine and draft_behavior.py
     use; FLEX deliberately excluded, same reason as need_fill_rate there).
  2. TENDENCY per opponent: P(takes position X | round bucket, X open/filled),
     a MEASURED FREQUENCY from their real drafts. As-of rule: a tendency used
     to grade season Y is counted ONLY on seasons < Y — 2024 grades on 2023
     alone (thin, and said so), 2025 on 2023-24. A conditional cell is used
     only at n >= COND_FLOOR observations; below that the fallback chain is
     owner-unconditioned bucket rate, then league bucket rate — never a
     conditional invented from n < 5. Every rate carries its n and its source.
  3. COMPOSITION over a gap [c+1, n-1]: the baseline model's per-decision
     hazard h_ij for player j at decision i (truncated-normal, drift-corrected
     — the engine's own Layer-1 form) is tilted by how much more or less the
     seat picking at i takes j's position than the market-implied mix says:
         r_i(X) = (T_i(X) + EPS) / (M_i(X) + EPS)
         h'_ij  = min(1, h_ij * r_i(X_j))
     where T_i is the seat's need-conditioned tendency distribution and M_i is
     the baseline's own implied position mix at that decision (both normalised
     over the positions present in the eval pool). P(gone) composes as
     1 - prod(1 - h'). With every r = 1 the arm collapses EXACTLY to the
     baseline (the product telescopes to the closed-form conditional), so the
     two arms differ by the layer and nothing else.

NO-FIT GUARD. Tendencies are counted frequencies. There is no parameter
search anywhere in this file: COND_FLOOR = 5 is the work order's own stated
rule; EPS is a division guard, not a weight; the sd/drift constants are the
ENGINE'S shipped values mirrored (and pinned against survival.js by
test_opponent_need.py so the copy cannot rot); EVAL_PROXY_WINDOW and the
bootstrap machinery are draft_behavior.py's preregistered values reused.

NO ERA MARKET ADP ON FILE (draft/audit/draft_behavior_2026-08-15.md §1 walks
every archive). The baseline anchor for BOTH arms is the ROOM PROXY — a
player's mean decision index across prior seasons only — the same labeled
stand-in draft_behavior.py's preregistered forward test uses. It is not market
ADP and nothing here claims it is; both arms share it, so the DELTA between
arms is about the need layer, not the anchor.

THE GRADE, fixed before the first run produced a number:
  * Walk-forward over the 2024 and 2025 real drafts (2023 has no prior season
    to fit on and is EXCLUDED, stated). For every seat's consecutive real
    decisions (c, n) with at least one intervening decision, grade every alive
    player with proxy <= c + EVAL_PROXY_WINDOW on "gone before the seat's next
    pick": truth = taken at a decision in (c, n).
  * Brier per arm, pooled and per season; reliability table in 10 bands; ECE.
  * Paired bootstrap (BOOT resamples, seeded, clustered BY GAP so correlated
    observations within a gap are never treated as independent) on
    delta = Brier(need) - Brier(base).
  * VERDICT RULE: the layer "measurably improves" iff pooled delta < 0 AND the
    95% CI upper bound < 0. Anything else is a null and nothing ships.

LEAKAGE IS A DETECTED CONDITION, not an honor system: every tendency table is
stamped with `seasons_used`, and the grader REFUSES a table whose stamp
touches the graded season (FutureInfoTendency) unless the caller passes the
explicit, labeled allow_leak diagnostic flag. test_opponent_need.py's fail-arm
plants a future-info table and proves both the refusal and that the metric
moves when the leak is let through.

Pure core below main(); no egress. Artifact draft/data/opponent_need_2026.json
is written ONLY on an improvement verdict. Run:
    python3 draft/backtest/opponent_need_model.py
"""
from __future__ import annotations

import json
import math
import random
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
sys.path.insert(0, str(HERE))

import draft_behavior as DB  # noqa: E402  (build_rows, rosters_at, room_proxy — reused, unit-tested)

POSITIONS = DB.POSITIONS                  # ("QB","RB","WR","TE","K","DEF")
STARTERS = DB.STARTERS                    # dedicated slots; FLEX excluded on purpose

# ── the engine's shipped Layer-1 + drift constants, MIRRORED ────────────────
# Source: public/js/draft/survival.js CFG as of 2026-08-17 (ADP_SD_* shipped on
# Cory's ratchet ruling). Pinned by test_opponent_need.py::test_engine_mirror —
# the no-retype rule enforced by a test, not a comment.
ADP_SD_FLOOR, ADP_SD_RATE, ADP_SD_CAP = 2.0, 0.11, 15.0
DRIFT_MIN_PICKS = 15
DRIFT_DAMPING = 0.6
DRIFT_MAX_OFFSET = 12
DRIFT_MAX_SD_SCALE = 1.6
DRIFT_EXPECTED_MAD = 8.0

# ── the layer's own rules (declared, not searched) ──────────────────────────
COND_FLOOR = 5          # the work order's rule: no conditional from n < 5
EPS = 0.01              # division guard in the tendency/market ratio — a guard, not a weight
EVAL_PROXY_WINDOW = 40  # draft_behavior.py §2.1 preregistered eval window, reused
BOOT = 2000             # bootstrap resamples (same count as exp43)
SEED = 20260817
GRADED_SEASONS = ("2024", "2025")   # 2023 is ungradeable: no prior season on file


class FutureInfoTendency(ValueError):
    """A tendency table whose seasons_used touches the season being graded."""


# ═══════════════════════════ shared math ═══════════════════════════════════

def engine_sd(mu):
    return min(ADP_SD_CAP, max(ADP_SD_FLOOR, ADP_SD_RATE * mu))


def drift(pairs):
    """The engine's adpDrift, mirrored onto decision-index space.
    pairs: [(observed_decision_index, proxy)] for picks already made."""
    n = len(pairs)
    if n < DRIFT_MIN_PICKS:
        return {"n": n, "applied": False, "offset": 0.0, "sd_scale": 1.0}
    signed = [obs - mu for obs, mu in pairs]
    mean_signed = sum(signed) / n
    mad = sum(abs(d) for d in signed) / n
    offset = max(-DRIFT_MAX_OFFSET, min(DRIFT_MAX_OFFSET, mean_signed * DRIFT_DAMPING))
    sd_scale = max(1.0, min(DRIFT_MAX_SD_SCALE,
                            1 + ((mad / DRIFT_EXPECTED_MAD) - 1) * DRIFT_DAMPING))
    return {"n": n, "applied": True, "offset": offset, "sd_scale": sd_scale}


# ═══════════════════════════ 1. need state ═════════════════════════════════

def need_state(roster):
    """{pos: 'open'|'filled'} against dedicated starter slots.
    roster: {pos: count} — keepers + picks so far (rosters_at's shape)."""
    return {p: ("open" if (roster or {}).get(p, 0) < STARTERS[p] else "filled")
            for p in POSITIONS}


# ═══════════════════════════ 2. tendencies (as-of) ═════════════════════════

def build_tendencies(rows, target_season):
    """Measured position-rate table from seasons STRICTLY BEFORE target_season.

    Structure:
      {"target": Y, "seasons_used": [...],
       "owners": {owner: {bucket: {
           "_n": owner-bucket decision count,
           pos: {"uncond": {"take": k, "n": n_bucket},
                  "open":   {"take": k, "n": n_state},   # decisions where pos was open
                  "filled": {"take": k, "n": n_state}}}}},
       "league": {bucket: {"_n": n, pos: {"take": k, "n": n}}}}
    Every cell is a raw count; rates are derived at read time with the n beside
    them. Need bits are computed from each historical draft's own live state —
    fully historical, no leakage.
    """
    seasons_used = sorted({r["season"] for r in rows
                           if r["season"] < str(target_season)})
    owners, league = {}, {}
    for s in seasons_used:
        seq = DB.decisions(rows, (s,))
        seq.sort(key=lambda r: r["decision_index"])
        for r in seq:
            pos_taken = r["position"]
            if not pos_taken:
                continue
            b = DB.round_bucket(r["round"])
            roster = DB.rosters_at(rows, s, r["decision_index"]).get(r["owner"], {})
            state = need_state(roster)
            ob = owners.setdefault(r["owner"], {}).setdefault(b, {"_n": 0})
            ob["_n"] += 1
            lb = league.setdefault(b, {"_n": 0})
            lb["_n"] += 1
            for p in POSITIONS:
                cell = ob.setdefault(p, {"uncond": {"take": 0, "n": 0},
                                         "open": {"take": 0, "n": 0},
                                         "filled": {"take": 0, "n": 0}})
                cell["uncond"]["n"] += 1
                cell["uncond"]["take"] += 1 if p == pos_taken else 0
                sc = cell[state[p]]
                sc["n"] += 1
                sc["take"] += 1 if p == pos_taken else 0
                lc = lb.setdefault(p, {"take": 0, "n": 0})
                lc["n"] += 1
                lc["take"] += 1 if p == pos_taken else 0
    return {"target": str(target_season), "seasons_used": seasons_used,
            "owners": owners, "league": league}


def tendency_rate(tend, owner, bucket, pos, need_bit):
    """(rate, n, source) with the declared fallback chain:
    need-conditional (n >= COND_FLOOR) -> owner unconditioned bucket rate
    (n >= COND_FLOOR) -> league bucket rate. Never a conditional from n < 5."""
    ob = (tend.get("owners", {}).get(owner) or {}).get(bucket) or {}
    cell = ob.get(pos)
    if cell:
        cond = cell.get(need_bit) or {}
        if cond.get("n", 0) >= COND_FLOOR:
            return cond["take"] / cond["n"], cond["n"], f"owner_conditional_{need_bit}"
        unc = cell.get("uncond") or {}
        if unc.get("n", 0) >= COND_FLOOR:
            return unc["take"] / unc["n"], unc["n"], "owner_unconditioned"
    lb = tend.get("league", {}).get(bucket) or {}
    lc = lb.get(pos) or {}
    if lc.get("n", 0) > 0:
        return lc["take"] / lc["n"], lc["n"], "league_bucket"
    return 0.0, 0, "no_data"


def seat_position_dist(tend, owner, bucket, state, positions=POSITIONS):
    """Normalised {pos: p} over `positions` plus per-pos provenance rows."""
    raw, detail = {}, {}
    for p in positions:
        rate, n, src = tendency_rate(tend, owner, bucket, p, state.get(p, "open"))
        raw[p] = rate
        detail[p] = {"rate": round(rate, 4), "n": n, "source": src,
                     "need": state.get(p, "open")}
    tot = sum(raw.values())
    if tot <= 0:
        u = 1.0 / len(positions)
        return {p: u for p in positions}, detail
    return {p: v / tot for p, v in raw.items()}, detail


# ═══════════════════════════ 3. the walk-forward grade ═════════════════════

def _validate_tendencies(tend, target_season, allow_leak):
    used = tend.get("seasons_used") or []
    leaky = [s for s in used if str(s) >= str(target_season)]
    if leaky and not allow_leak:
        raise FutureInfoTendency(
            f"tendency table for season {target_season} was built on {used} — "
            f"{leaky} is not strictly before the graded season. A tendency that "
            "has seen the picks it grades is contamination, not skill.")
    return bool(leaky)


def backtest(rows, seasons=GRADED_SEASONS, tendencies_for=None, allow_leak=False,
             sd_override=None, boot=BOOT, seed=SEED):
    """Both arms, graded on every real pick gap of `seasons`. Pure.

    tendencies_for: {season: table} override (tests / diagnostics). Absent, the
    honest as-of table is built per season from `rows`. sd_override widens the
    shared baseline sd (robustness diagnostic only — both arms get it)."""
    gaps = []            # per-gap accumulators for the clustered bootstrap
    bins = {"base": [[0.0, 0.0, 0] for _ in range(10)],
            "need": [[0.0, 0.0, 0] for _ in range(10)]}
    per_season = {}
    src_counts = {}      # which fallback tier each queried rate actually came from
    leak_flag = False

    for season in seasons:
        tend = (tendencies_for or {}).get(season) or build_tendencies(rows, season)
        leak_flag |= _validate_tendencies(tend, season, allow_leak)
        prior = tuple(tend["seasons_used"]) or tuple(
            s for s in ("2023", "2024", "2025") if s < season)
        proxy = DB.room_proxy(rows, prior)
        seq = DB.decisions(rows, (season,))
        seq.sort(key=lambda r: r["decision_index"])
        if not seq or not proxy:
            continue
        taken_at = {r["player_id"]: r["decision_index"] for r in seq}
        kept = {r["player_id"] for r in rows
                if r["season"] == season and r["is_keeper"]}
        posmap = {r["player_id"]: r["position"] for r in rows if r["position"]}
        pool = [{"player_id": pid, "proxy": mu, "position": posmap.get(pid)}
                for pid, mu in proxy.items() if pid not in kept]
        pool = [p for p in pool if p["position"]]

        # seat -> its decisions in order
        by_seat = {}
        for r in seq:
            by_seat.setdefault(r["roster_id"], []).append(r)

        season_acc = {"n_gaps": 0, "n_obs": 0, "sq_base": 0.0, "sq_need": 0.0}
        for seat_rows in by_seat.values():
            for c_row, n_row in zip(seat_rows, seat_rows[1:]):
                c = c_row["decision_index"]
                n = n_row["decision_index"]
                intervening = seq[c: n - 1]        # decisions c+1 .. n-1
                if not intervening:
                    continue
                # room drift from the season's OWN picks so far — live
                # knowledge at the moment the wait-vs-take number is needed:
                # decisions 1..c-1 (decision c is the pick being decided)
                d = drift([(r["decision_index"], proxy[r["player_id"]])
                           for r in seq[:c - 1] if r["player_id"] in proxy])
                alive = [p for p in pool if taken_at.get(p["player_id"], 10**9) > c]
                eval_set = [p for p in alive if p["proxy"] <= c + EVAL_PROXY_WINDOW]
                if not eval_set:
                    continue

                mus = {p["player_id"]: p["proxy"] + d["offset"] for p in eval_set}
                sds = {p["player_id"]:
                       (sd_override if sd_override is not None
                        else engine_sd(p["proxy"])) * d["sd_scale"]
                       for p in eval_set}
                surv_base = {p["player_id"]: 1.0 for p in eval_set}
                surv_need = {p["player_id"]: 1.0 for p in eval_set}

                for step in intervening:
                    i = step["decision_index"]
                    hz = {}
                    for p in eval_set:
                        pid = p["player_id"]
                        f_prev = DB.normal_cdf(i - 1, mus[pid], sds[pid])
                        f_now = DB.normal_cdf(i, mus[pid], sds[pid])
                        denom = 1.0 - f_prev
                        hz[pid] = 1.0 if denom < 1e-9 else \
                            max(0.0, min(1.0, (f_now - f_prev) / denom))
                    # market-implied position mix at this decision
                    m_raw = {}
                    for p in eval_set:
                        m_raw[p["position"]] = m_raw.get(p["position"], 0.0) \
                            + hz[p["player_id"]] * surv_base[p["player_id"]]
                    present = sorted(m_raw)
                    m_tot = sum(m_raw.values())
                    market = {x: (m_raw[x] / m_tot if m_tot > 0 else 0.0)
                              for x in present}
                    # the seat's need-conditioned tendency mix
                    roster = DB.rosters_at(rows, season, i).get(step["owner"], {})
                    tdist, tdetail = seat_position_dist(
                        tend, step["owner"], DB.round_bucket(step["round"]),
                        need_state(roster), positions=present or POSITIONS)
                    for cell in tdetail.values():
                        src_counts[cell["source"]] = src_counts.get(cell["source"], 0) + 1
                    for p in eval_set:
                        pid = p["player_id"]
                        h = hz[pid]
                        surv_base[pid] *= (1.0 - h)
                        r_x = (tdist.get(p["position"], 0.0) + EPS) \
                            / (market.get(p["position"], 0.0) + EPS)
                        surv_need[pid] *= (1.0 - min(1.0, h * r_x))

                g = {"season": season, "owner": c_row["owner"], "c": c, "n": n,
                     "n_obs": 0, "sq_base": 0.0, "sq_need": 0.0}
                for p in eval_set:
                    pid = p["player_id"]
                    truth = 1.0 if c < taken_at.get(pid, 10**9) < n else 0.0
                    pb = 1.0 - surv_base[pid]
                    pn = 1.0 - surv_need[pid]
                    g["n_obs"] += 1
                    g["sq_base"] += (pb - truth) ** 2
                    g["sq_need"] += (pn - truth) ** 2
                    for arm, pv in (("base", pb), ("need", pn)):
                        b = min(9, int(pv * 10))
                        bins[arm][b][0] += pv
                        bins[arm][b][1] += truth
                        bins[arm][b][2] += 1
                gaps.append(g)
                season_acc["n_gaps"] += 1
                season_acc["n_obs"] += g["n_obs"]
                season_acc["sq_base"] += g["sq_base"]
                season_acc["sq_need"] += g["sq_need"]
        per_season[season] = _finish_season(season_acc, tend, boot, seed,
                                            [g for g in gaps
                                             if g["season"] == season])

    out = _finish(gaps, bins, per_season, leak_flag, boot, seed)
    out["tendency_source_mix"] = src_counts
    return out


def _brier(gs, key):
    n = sum(g["n_obs"] for g in gs)
    return (sum(g[key] for g in gs) / n) if n else None


def _boot_delta(gs, boot, seed):
    """Percentile CI on pooled Brier(need)-Brier(base), resampling GAPS."""
    if not gs:
        return None
    rng = random.Random(seed)
    deltas = []
    for _ in range(boot):
        sample = [gs[rng.randrange(len(gs))] for _ in range(len(gs))]
        n = sum(g["n_obs"] for g in sample)
        if not n:
            continue
        deltas.append((sum(g["sq_need"] for g in sample)
                       - sum(g["sq_base"] for g in sample)) / n)
    deltas.sort()
    lo = deltas[int(0.025 * len(deltas))]
    hi = deltas[min(len(deltas) - 1, int(0.975 * len(deltas)))]
    return {"lo": round(lo, 6), "hi": round(hi, 6), "resamples": len(deltas),
            "clustered_by": "gap"}


def _finish_season(acc, tend, boot, seed, gs):
    out = {
        "n_gaps": acc["n_gaps"], "n_obs": acc["n_obs"],
        "seasons_used_for_tendencies": tend["seasons_used"],
        "tendency_thinness": ("single prior season — every owner cell is at "
                              "most ~12 decisions per bucket; expect heavy "
                              "fallback to league rates"
                              if len(tend["seasons_used"]) < 2 else None),
        "brier_base": round(acc["sq_base"] / acc["n_obs"], 6) if acc["n_obs"] else None,
        "brier_need": round(acc["sq_need"] / acc["n_obs"], 6) if acc["n_obs"] else None,
    }
    if acc["n_obs"]:
        out["delta"] = round((acc["sq_need"] - acc["sq_base"]) / acc["n_obs"], 6)
        out["delta_ci95"] = _boot_delta(gs, boot, seed)
    return out


def _calibration(bins, arm):
    rows = []
    for i, b in enumerate(bins[arm]):
        rows.append({"band": f"{i / 10:.1f}-{(i + 1) / 10:.1f}",
                     "mean_pred": round(b[0] / b[2], 4) if b[2] else None,
                     "mean_actual": round(b[1] / b[2], 4) if b[2] else None,
                     "n": b[2]})
    return rows


def _ece(bins, arm):
    n_tot = sum(b[2] for b in bins[arm])
    if not n_tot:
        return None
    return round(sum(abs(b[0] / b[2] - b[1] / b[2]) * b[2]
                     for b in bins[arm] if b[2]) / n_tot, 6)


def _finish(gaps, bins, per_season, leak_flag, boot, seed):
    n_obs = sum(g["n_obs"] for g in gaps)
    bb, bn = _brier(gaps, "sq_base"), _brier(gaps, "sq_need")
    delta = (bn - bb) if (bb is not None and bn is not None) else None
    ci = _boot_delta(gaps, boot, seed)
    improved = (delta is not None and ci is not None
                and delta < 0 and ci["hi"] < 0)
    return {
        "n_gaps": len(gaps), "n_obs": n_obs,
        "brier_base": round(bb, 6) if bb is not None else None,
        "brier_need": round(bn, 6) if bn is not None else None,
        "delta_brier_need_minus_base": round(delta, 6) if delta is not None else None,
        "delta_ci95": ci,
        "verdict_rule": "improved iff delta < 0 AND ci95.hi < 0 (fixed pre-run)",
        "improved": improved,
        "per_season": per_season,
        "calibration": {"base": _calibration(bins, "base"),
                        "need": _calibration(bins, "need")},
        "ece": {"base": _ece(bins, "base"), "need": _ece(bins, "need")},
        "leak_arm": leak_flag,
    }


# ═══════════════════ per-opponent 2026 tendency + need block ═══════════════

def opponent_table_2026(rows, keepers_confirmed, keepers_predicted, roster_owner):
    """Per-opponent block for the artifact: 2026 need state from the keeper
    slate (confirmed where the slate is on file, predicted otherwise — labeled
    per seat, per the predicted_keepers provenance rule) + the owner's measured
    tendencies over ALL of 2023-25 (the as-of table for the 2026 draft)."""
    tend = build_tendencies(rows, "2026")
    out = {}
    for owner_id, handle, first in roster_owner:
        conf = keepers_confirmed.get(owner_id)
        pred = keepers_predicted.get(handle) or []
        slate = conf if conf is not None else pred
        provenance = "confirmed (draft/config/keepers.json)" if conf is not None \
            else "PREDICTED (draft/data/predicted_keepers.json) — not a fact"
        roster = {}
        for k in slate:
            roster[k["position"]] = roster.get(k["position"], 0) + 1
        state = need_state(roster)
        buckets = {}
        for b in ("early", "mid", "late"):
            dist, detail = seat_position_dist(tend, first, b, state)
            buckets[b] = {"p": {p: round(v, 4) for p, v in dist.items()},
                          "cells": detail,
                          "n_owner_bucket": ((tend["owners"].get(first) or {})
                                             .get(b) or {}).get("_n", 0)}
        out[first] = {
            "handle": handle, "owner_id": owner_id,
            "keeper_slate": [{"player_id": str(k["player_id"]),
                              "name": k.get("name"),
                              "position": k["position"]} for k in slate],
            "keeper_provenance": provenance,
            "need_state_at_draft_open": state,
            "tendency_by_bucket": buckets,
        }
    return out, tend


# ═══════════════════════════════ runner ════════════════════════════════════

def load_rows():
    history = json.loads((ROOT / "draft" / "data" / "league_history.json").read_text())
    posfile = json.loads((ROOT / "draft" / "data" / "player_positions.json").read_text())
    positions = dict(posfile.get("positions") or {})
    board = json.loads((ROOT / "public" / "draft_data.json").read_text())
    for p in board.get("players", []):
        positions.setdefault(str(p["player_id"]), p.get("position"))
    keepers_cfg = json.loads((ROOT / "draft" / "config" / "keepers.json").read_text())
    for t in keepers_cfg.get("teams", []):
        for k in t.get("keepers", []):
            positions.setdefault(str(k["player_id"]), k.get("position"))
    first_names = DB.parse_first_names(
        (ROOT / "src" / "routes" / "history-data.js").read_text())
    rows, unresolved = DB.build_rows(history, positions, first_names)
    return rows, unresolved, history, keepers_cfg, first_names


def build_artifact():
    """No-arg regeneration entry point — the artifact_registry.json contract
    (draft/audit/artifact_freshness_infra_2026-08-16.md): returns the full
    artifact dict, deterministically, from the committed inputs. Built even
    when the verdict is null (the dict carries `improved`), so a future
    regeneration that flips the verdict shows up as STALE rather than
    silently vanishing."""
    rows, unresolved, history, keepers_cfg, first_names = load_rows()
    result = backtest(rows)

    # robustness (post-verdict diagnostic, labeled): same grade for 2025 only,
    # both arms on the train-measured proxy dispersion (2023->2024 residual sd
    # — computed without touching 2025). Answers "does the delta's sign depend
    # on the engine-sd/proxy mismatch", changes no verdict on its own.
    res_sd = DB.proxy_residual_sd(rows, "2023", "2024")
    robust = backtest(rows, seasons=("2025",), sd_override=res_sd) if res_sd else None

    confirmed = {t["owner_id"]: t["keepers"] for t in keepers_cfg.get("teams", [])}
    predicted_raw = json.loads(
        (ROOT / "draft" / "data" / "predicted_keepers.json").read_text())
    predicted = {h: v.get("predicted_keepers") or []
                 for h, v in (predicted_raw.get("predictions") or {}).items()}
    season_2026 = next(s for s in history["seasons"] if s["season"] == "2026")
    roster_owner = []
    for rid, o in sorted(season_2026["owners"].items(), key=lambda kv: int(kv[0])):
        handle = o.get("display_name")
        roster_owner.append((o.get("user_id"), handle,
                             first_names.get(handle, handle)))
    opponents, tend_2026 = opponent_table_2026(
        rows, confirmed, predicted, roster_owner)
    artifact = {
        "_territory": "TERRITORY: E — produced by draft/backtest/opponent_need_model.py",
        "provenance": {
            "drafts": "draft/data/league_history.json seasons 2023-2025 (main drafts, "
                      "2023 keeper join via the parallel keeper draft — draft_behavior.build_rows reused)",
            "anchor": "ROOM PROXY (prior-season mean decision index) — NO era market ADP on file; "
                      "both arms share it, the delta is about the layer",
            "engine_constants": "survival.js CFG mirrored (sd 2.0/0.11/15.0, drift 15/0.6/12/1.6/8.0), "
                                "pinned by test_opponent_need.py",
            "rules": f"COND_FLOOR={COND_FLOOR} (no conditional from n<5), "
                     f"EVAL_PROXY_WINDOW={EVAL_PROXY_WINDOW}, BOOT={BOOT}, SEED={SEED}",
            "as_of": "tendencies for season Y counted on seasons < Y only; "
                     "2024 graded on 2023 alone (thin — stated per season), 2025 on 2023-24; "
                     "2026 table uses all of 2023-25",
            "unresolved_positions": unresolved,
        },
        "calibration_delta": {k: result[k] for k in
                              ("n_gaps", "n_obs", "brier_base", "brier_need",
                               "delta_brier_need_minus_base", "delta_ci95",
                               "verdict_rule", "improved", "per_season",
                               "calibration", "ece", "tendency_source_mix")},
        "robustness_wide_sd_2025": robust and {
            k: robust[k] for k in ("brier_base", "brier_need",
                                   "delta_brier_need_minus_base", "delta_ci95")},
        "league_tendencies_2026": tend_2026["league"],
        # RAW COUNTS, not baked distributions: a live consumer must apply
        # the fallback chain (conditional at n>=COND_FLOOR -> owner
        # unconditioned -> league bucket) against the seat's CURRENT
        # roster, because need states change with every pick. The
        # `opponents` blocks below bake the DRAFT-OPEN state only, for
        # reading, and say so.
        "owner_tendency_counts_2026": tend_2026["owners"],
        "cond_floor": COND_FLOOR,
        "opponents": opponents,
    }
    if robust is not None:
        artifact["robustness_wide_sd_2025"]["sd"] = round(res_sd, 2)
    return artifact


def main():
    artifact = build_artifact()
    result = artifact["calibration_delta"]
    robust = artifact["robustness_wide_sd_2025"]

    print(f"gaps={result['n_gaps']} obs={result['n_obs']}")
    print(f"Brier base={result['brier_base']} need={result['brier_need']} "
          f"delta={result['delta_brier_need_minus_base']} ci={result['delta_ci95']}")
    print(f"ECE base={result['ece']['base']} need={result['ece']['need']}")
    for s, blk in result["per_season"].items():
        print(f"  {s}: gaps={blk['n_gaps']} obs={blk['n_obs']} "
              f"base={blk['brier_base']} need={blk['brier_need']} "
              f"delta={blk.get('delta')} ci={blk.get('delta_ci95')}")
    if robust:
        print(f"robust(sd={robust['sd']}, 2025): base={robust['brier_base']} "
              f"need={robust['brier_need']} delta={robust['delta_brier_need_minus_base']} "
              f"ci={robust['delta_ci95']}")
    print(f"VERDICT: {'IMPROVED' if result['improved'] else 'NULL — no wiring'} "
          f"({result['verdict_rule']})")

    if result["improved"]:
        out = ROOT / "draft" / "data" / "opponent_need_2026.json"
        out.write_text(json.dumps(artifact, indent=1) + "\n")
        print(f"wrote {out}")
    return artifact


if __name__ == "__main__":
    main()
