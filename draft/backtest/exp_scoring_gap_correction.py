#!/usr/bin/env python3
# TERRITORY: A
"""EXP SG-1 — WOULD CORRECTING THE ADP FEED'S 4-POINT-TD ASSUMPTION HAVE HELPED?

THE QUESTION. `lab_scoring_gap.py` measures that our ADP feed prices a
4-point-passing-TD / -1-INT market while this league pays 6 / -2, and its own
docstring stops at the measurement: "nothing here changes a price." The room
takes quarterbacks earlier than market at every slot (18 of 18 real
observations), which a 4-pt ADP in a 6-pt league predicts from first
principles. Nobody has tested whether CORRECTING the ADP for the gap would
have produced better draft outcomes on our three real seasons. This is that
test. It is an experiment under `draft/backtest/`; it installs nothing and
touches no live pipeline.

THE CORRECTION UNDER TEST (constructed, not fitted to the outcomes it is
graded on):

  1. gap(q)   = points our scoring adds to QB q's SAME projected stat line
                versus the market's table. Exactly 2*pass_td - 1*pass_int by
                arithmetic. Measured for real on the two committed raw 2026
                stat rows (draft/audit/rule12_statlines.json): Josh Allen
                +44.0 on 405.5 (share .1085), Trevor Lawrence +40.0 on 343.42
                (share .1165). Per-QB gap is estimated as share * proj_mean
                with that measured band carried, because the full raw payload
                only exists inside a CI build (the lab module's own finding).
  2. dvorp(q) = gap(q) - gap(replacement QB). THE STEP THE NAIVE VERSION
                SKIPS: raising every QB's score raises the replacement QB's
                score too (test_nflverse_qb_scoring.py's founding defect).
                Handing the raw gap to the price axis over-corrects several
                times over; both versions are computed here so the report can
                SHOW that, but only the VORP-correct one is "the correction".
  3. shift(q) = dvorp(q) pushed through the board's own price curve — an
                isotonic (monotone-decreasing) fit of vorp against adp across
                the whole priced board — inverted to answer "how many ADP
                slots earlier does that much extra value place him?".

THE THREE ARMS, all on real historical data:

  B. MAGNITUDE vs THE ROOM (3 real drafts, slot level, identity-free).
     Where the room really took its Nth quarterback versus where the raw and
     the corrected market ladders say the Nth quarterback goes. Paired |error|
     per (season x slot). A leave-one-season-out ROOM-FITTED shift is run
     beside it as the ceiling any correction could reach on this data.
  C. WINDOW SURVIVAL (every seat's consecutive live picks, 3 seasons,
     n = hundreds of windows). The quantity VONA actually consumes: how many
     QBs leave the board between a seat's pick and its next one. Predicted
     departures (raw vs corrected ladder) against real departures, MAE,
     paired. Non-QB positions are untouched by construction (the correction
     only moves QB prices), so they are the structural placebo.
  D. DOLLARS (2024 + 2025, every seat; certified grader). The correction can
     only earn where it FLIPS a decision: a seat still without its QB whose
     next-QB market price says "safe to wait past your next pick" under the
     raw ladder and "gone" under the corrected one. At each seat-season's
     first flip, the counterfactual takes the best walk-forward-projected QB
     available at that pick instead of the real pick, room held fixed
     (exp34_dollars' single-swap convention), and the roster is graded
     through roster_sim + money_grade.grade_substituted against the seat's
     real drafted roster graded identically. 2023 is excluded from D because
     no strictly-prior season exists on disk to build its walk-forward
     projection (same rule as exp_inverse_adjuster).

PRE-REGISTERED EXPECTATIONS (written before the numbers):
  * The naive raw-gap shift will overshoot the room badly; the VORP-correct
    shift is expected to be SMALL at the top (a few slots) and may undershoot
    the room's observed earliness, whose spread (4-15 picks) plausibly
    contains herding the scoring rule alone does not explain.
  * Arm C's raw ladder should UNDER-predict early QB departures (the 18/18
    direction); the corrected ladder should cut the bias without hurting
    non-QB accuracy (structurally guaranteed) — the open question is size.
  * Arm D flips are expected to be RARE (prior tournaments put contested
    decisions at ~2/draft and the QB window at ~0.5/draft). Few or zero
    flips, or dollars inside noise, is a reportable negative result, not a
    failure of the experiment.

LEAK AUDIT. Decision inputs are: the 2026 board's prices and projections
(pre-draft artifacts), scoring arithmetic, and walk-forward projections built
from strictly-prior seasons' points. Realized 2023-25 outcomes are used ONLY
to grade (room behavior in B/C is the outcome being predicted; season points
enter only the dollar grading in D). The one confound that cannot be removed
in-sandbox: the market ladder is the CURRENT (2026) board's ADP applied to
2023-25 drafts at SLOT level, because no historical ADP series exists locally
(FFC is CI-egress only; VONA-ROOM-VS-MARKET carries the same confound and
documents why slot-level QB1-QB6 partially survives it). Both arms share the
confounded baseline, so the PAIRED comparison cancels it to first order; the
absolute errors do not, and the report says so.

Run: python3 draft/backtest/exp_scoring_gap_correction.py
Writes: draft/backtest/exp_scoring_gap_correction.json
"""
from __future__ import annotations

import json
from pathlib import Path
import sys

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
for _p in (str(HERE), str(HERE.parent)):
    if _p not in sys.path:
        sys.path.insert(0, _p)

from scoring import score_stat_line                      # noqa: E402
from lab_scoring_gap import market_scoring               # noqa: E402
import roster_sim as RS                                  # noqa: E402
import money_grade as MG                                 # noqa: E402
from lab_projections import walk_forward                 # noqa: E402

BOARD = ROOT / "public" / "draft_data.json"
HISTORY = ROOT / "draft" / "data" / "league_history.json"
STATLINES = ROOT / "draft" / "audit" / "rule12_statlines.json"
POSITIONS = ROOT / "draft" / "data" / "player_positions.json"
LEAGUE_CFG = ROOT / "draft" / "config" / "league_config.json"
OUT = HERE / "exp_scoring_gap_correction.json"

SEASONS = ("2023", "2024", "2025")
DOLLAR_SEASONS = ("2024", "2025")     # 2023 has no strictly-prior points on disk
TOP_SLOTS = 6                         # primary slot comparison, matching prior art
STARTABLE_QB = 12                     # the dozen being priced (lab_scoring_gap frame)
DRAFT_PICKS = 150


# ── the measured gap share (real committed stat rows, never a constant) ──────
def measured_gap_share(statlines_path=STATLINES, cfg_path=LEAGUE_CFG) -> dict:
    """gap/value share for every QB with a committed raw 2026 stat row.

    Recomputed from the raw rows through score_stat_line + market_scoring on
    every run — a hand-copied share could silently drift from its source.
    Refuses (measured: False) rather than inventing a share when no QB rows
    exist; the caller must not fall back to a guess.
    """
    scoring = json.loads(Path(cfg_path).read_text())["scoring"]
    rows = json.loads(Path(statlines_path).read_text()).get("players", {})
    mkt = market_scoring(scoring)
    shares = []
    for pid, entry in rows.items():
        line = (entry or {}).get("projection_row")
        if not isinstance(line, dict) or not line.get("pass_att"):
            continue                    # not a quarterback row
        ours = score_stat_line(line, scoring)
        theirs = score_stat_line(line, mkt)
        if ours > 0:
            shares.append({"player_id": pid, "name": entry.get("name"),
                           "ours": ours, "gap": round(ours - theirs, 2),
                           "share": round((ours - theirs) / ours, 4)})
    if not shares:
        return {"measured": False,
                "why": "no committed raw QB stat rows — refuse rather than guess"}
    lo = min(s["share"] for s in shares)
    hi = max(s["share"] for s in shares)
    return {"measured": True, "rows": shares, "share_lo": lo, "share_hi": hi,
            "share_mid": round((lo + hi) / 2, 4),
            "caveat": ("n=%d committed rows; rushing-heavy QBs earn less of their "
                       "value from passing, so their true share sits below this "
                       "band — the band is carried through every number downstream"
                       % len(shares))}


# ── the board's own price curve (isotonic vorp-vs-adp), and its inverse ──────
def _pava_decreasing(xs: list, ys: list) -> list:
    """Pool-adjacent-violators fit of a NON-INCREASING sequence ys over xs.

    xs must already be sorted ascending. Returns fitted ys, same length.
    """
    blocks = [[y, 1.0] for y in ys]     # [mean, weight]
    merged = []
    for b in blocks:
        merged.append(b)
        while len(merged) > 1 and merged[-2][0] < merged[-1][0]:
            m2, m1 = merged.pop(), merged.pop()
            w = m1[1] + m2[1]
            merged.append([(m1[0] * m1[1] + m2[0] * m2[1]) / w, w])
    out = []
    for mean, w in merged:
        out.extend([mean] * int(round(w)))
    return out[:len(ys)]


def price_curve(players: list) -> dict:
    """Monotone value-of-a-slot curve from the live board: adp -> fitted vorp.

    Uses every priced player with a vorp, ALL positions — the ADP axis is the
    market's cross-position price of value, which is the axis a slot shift
    happens on. Raw points would re-introduce the confound lab_scoring_gap's
    docstring warns about (every QB outscores every RB); vorp is the axis the
    engine actually decides on (format_offset.json learned this the hard way).
    """
    pts = sorted(((float(p["adp"]), float(p["vorp"])) for p in players
                  if p.get("adp") is not None and p.get("vorp") is not None),
                 key=lambda t: t[0])
    if len(pts) < 20:
        return {"ok": False, "why": f"only {len(pts)} priced players with vorp"}
    xs = [a for a, _ in pts]
    ys = _pava_decreasing(xs, [v for _, v in pts])
    return {"ok": True, "adp": xs, "vorp": ys}


def curve_value_at(curve: dict, adp: float) -> float:
    """Fitted vorp at an adp (step interpolation on the isotonic fit)."""
    xs, ys = curve["adp"], curve["vorp"]
    lo = 0
    for i, x in enumerate(xs):
        if x <= adp:
            lo = i
        else:
            break
    return ys[lo]


def corrected_adp_for(curve: dict, adp: float, dvorp: float) -> float:
    """Earliest slot whose fitted value covers this player's value + dvorp.

    Walks the curve from the front; a dvorp of 0 returns the original adp
    (never a *better* slot — the correction may only move a player EARLIER by
    the value it adds, not re-litigate his current price).
    """
    if dvorp <= 0:
        return adp
    target = curve_value_at(curve, adp) + dvorp
    xs, ys = curve["adp"], curve["vorp"]
    for x, y in zip(xs, ys):
        if x >= adp:
            break
        if y <= target:
            return x
    return adp


# ── ladders: where the market / the room takes the Nth QB ────────────────────
def market_qb_ladder(players: list, kept: list, share: float,
                     repl_qb: float, curve: dict, *, naive: bool = False) -> dict:
    """Raw + corrected market QB ladders (overall-slot prices, ascending).

    naive=True applies the WRONG correction on purpose — the raw gap with no
    replacement subtraction — so the report can show what skipping the
    replacement step does. It is never used as "the correction".
    """
    pool = list(players) + list(kept or [])
    qbs = [p for p in pool if p.get("position") == "QB" and p.get("adp") is not None]
    qbs.sort(key=lambda p: float(p["adp"]))
    raw, cor, detail = [], [], []
    for q in qbs:
        adp = float(q["adp"])
        proj = q.get("proj_mean")
        gap = (share * float(proj)) if proj is not None else 0.0
        dvorp = gap if naive else max(0.0, share * (float(proj) - repl_qb)) if proj is not None else 0.0
        cadp = corrected_adp_for(curve, adp, dvorp)
        raw.append(adp)
        cor.append(cadp)
        detail.append({"name": q.get("name"), "adp": adp,
                       "proj_mean": proj, "gap_points_est": round(gap, 1),
                       "dvorp_est": round(dvorp, 1),
                       "corrected_adp": round(cadp, 1),
                       "shift_slots": round(adp - cadp, 1)})
    return {"raw": raw, "corrected": sorted(cor), "detail": detail}


def real_draft(season: dict) -> list:
    for d in season.get("drafts") or []:
        picks = d.get("picks") or []
        if len(picks) >= 100:
            return sorted(picks, key=lambda p: p.get("pick_no") or 0)
    return []


def room_qb_picks(picks: list, positions: dict, *, include_keepers: bool) -> list:
    """pick_no of each QB the room took, ascending. Keepers deplete the pool
    but are not market decisions; both views are computed and reported."""
    out = []
    for p in picks:
        if positions.get(str(p.get("player_id"))) != "QB":
            continue
        if not include_keepers and p.get("is_keeper"):
            continue
        out.append(int(p.get("pick_no") or 0))
    return sorted(out)


# ── Arm B: slot errors ───────────────────────────────────────────────────────
def slot_errors(room: list, ladder: list, n_slots: int) -> list:
    """Signed error per slot: model price minus room pick (positive = model
    prices him LATER than the room took him — the 18/18 direction)."""
    out = []
    for i in range(min(n_slots, len(room), len(ladder))):
        out.append(round(ladder[i] - room[i], 1))
    return out


def loso_fitted_ladders(room_by_season: dict, base_ladder: list, n_slots: int) -> dict:
    """Leave-one-season-out ROOM-FITTED correction: per slot, the mean gap on
    the two training seasons applied to the held-out one. The ceiling any
    per-slot correction could reach without leaking the test season."""
    out = {}
    seasons = list(room_by_season)
    for held in seasons:
        train = [s for s in seasons if s != held]
        fitted = []
        for i in range(n_slots):
            gaps = [room_by_season[s][i] - base_ladder[i]
                    for s in train if i < len(room_by_season[s]) and i < len(base_ladder)]
            shift = sum(gaps) / len(gaps) if gaps else 0.0
            if i < len(base_ladder):
                fitted.append(round(base_ladder[i] + shift, 1))
        out[held] = fitted
    return out


# ── Arm C: window survival ───────────────────────────────────────────────────
def seat_windows(picks: list, rid: int) -> list:
    """(pick, next_pick) pairs over one seat's LIVE (non-keeper) picks."""
    own = sorted(int(p["pick_no"]) for p in picks
                 if p.get("roster_id") == rid and not p.get("is_keeper"))
    return list(zip(own, own[1:]))


def departures_in(window: tuple, events: list) -> int:
    k, k2 = window
    return sum(1 for e in events if k < e <= k2)


def window_survival_table(history: dict, positions: dict, ladders: dict) -> dict:
    """Predicted vs actual QB departures per (seat, window), all seasons.

    `ladders` = {"raw": [...], "corrected": [...]} in overall-slot units.
    Departure events INCLUDE keeper picks: the ladder prices every QB and a
    kept QB still leaves the pool at his slot, so counting only live picks
    would compare a full-market ladder against a depleted room and misread
    the depletion as model error (the live-picks slice of Arm B shows exactly
    that artifact).

    BOTH sides are truncated to the top STARTABLE_QB (12) departures: the
    market prices 30+ QBs inside 150 slots for rooms that draft backup QBs,
    while this 1-QB 10-team room stops near nine — beyond the priced dozen
    the ladder over-predicts departures for a structural reason that has
    nothing to do with the scoring gap, and leaving it in would swamp the
    quantity under test (the lab module's own top-12 frame, same reason).
    """
    rows = []
    ladders = {name: list(ladder[:STARTABLE_QB]) for name, ladder in ladders.items()}
    for s in history["seasons"]:
        season = str(s.get("season"))
        if season not in SEASONS:
            continue
        picks = real_draft(s)
        if not picks:
            continue
        actual_events = room_qb_picks(picks, positions,
                                      include_keepers=True)[:STARTABLE_QB]
        rids = sorted({p.get("roster_id") for p in picks if p.get("roster_id")})
        for rid in rids:
            for w in seat_windows(picks, rid):
                row = {"season": season, "roster_id": rid, "window": list(w),
                       "actual": departures_in(w, actual_events)}
                for name, ladder in ladders.items():
                    row[name] = departures_in(w, ladder)
                rows.append(row)
    return {"rows": rows}


def window_metrics(rows: list, arms: tuple) -> dict:
    out = {}
    for arm in arms:
        errs = [r[arm] - r["actual"] for r in rows]
        aerrs = [abs(e) for e in errs]
        out[arm] = {"n_windows": len(rows),
                    "mae": round(sum(aerrs) / len(aerrs), 4) if aerrs else None,
                    "bias": round(sum(errs) / len(errs), 4) if errs else None}
    if all(a in out for a in ("raw", "corrected")) and rows:
        paired = [abs(r["raw"] - r["actual"]) - abs(r["corrected"] - r["actual"])
                  for r in rows]
        out["paired_mae_raw_minus_corrected"] = round(sum(paired) / len(paired), 4)
        out["windows_where_corrected_better"] = sum(1 for d in paired if d > 0)
        out["windows_where_raw_better"] = sum(1 for d in paired if d < 0)
        out["windows_tied"] = sum(1 for d in paired if d == 0)
    return out


# ── Arm D: decision flips and dollars ────────────────────────────────────────
def prior_points_from_weekly(store_path: Path) -> tuple:
    """Season totals + games from a committed nflverse weekly store (our
    scoring, fingerprint-guarded at append time)."""
    j = json.loads(store_path.read_text())
    tot, games = {}, {}
    for wk in j["weeks"]:
        if int(wk["week"]) > 18:        # draft-relevant production only
            continue
        for pid, v in (wk.get("points") or {}).items():
            if not v:
                continue
            tot[pid] = tot.get(pid, 0.0) + float(v)
            games[pid] = games.get(pid, 0) + 1
    return tot, games


def flips_for_season(picks: list, positions: dict, raw: list, cor: list) -> list:
    """Every live decision where the raw ladder says the next startable QB
    survives past the seat's next pick and the corrected ladder says he does
    not. One row per (seat, window) BEFORE the seat has any QB."""
    out = []
    # Pool-depletion frame, same as Arm B/C: a kept QB is off the board too.
    qb_events = room_qb_picks(picks, positions, include_keepers=True)
    rids = sorted({p.get("roster_id") for p in picks if p.get("roster_id")})
    for rid in rids:
        own = sorted((int(p["pick_no"]), str(p["player_id"])) for p in picks
                     if p.get("roster_id") == rid and not p.get("is_keeper"))
        has_kept_qb = any(positions.get(str(p["player_id"])) == "QB"
                          for p in picks
                          if p.get("roster_id") == rid and p.get("is_keeper"))
        if has_kept_qb:
            continue                    # the wait-on-QB decision never arises
        first_qb_at = next((pn for pn, pid in own if positions.get(pid) == "QB"), None)
        for (k, _pid), (k2, _pid2) in zip(own, own[1:]):
            if first_qb_at is not None and k >= first_qb_at:
                break                   # seat already has its QB
            j = sum(1 for e in qb_events if e < k)   # QBs gone before this pick
            if j >= STARTABLE_QB:
                break                   # the priced dozen is exhausted
            price_raw = raw[j] if j < len(raw) else None
            price_cor = cor[j] if j < len(cor) else None
            if price_raw is None or price_cor is None:
                continue
            advice_raw_wait = price_raw > k2
            advice_cor_wait = price_cor > k2
            if advice_raw_wait and not advice_cor_wait:
                next_qb_real = next((e for e in qb_events if e > k), None)
                out.append({"roster_id": rid, "pick_no": k, "next_pick": k2,
                            "qbs_gone_before": j,
                            "price_raw": round(price_raw, 1),
                            "price_corrected": round(price_cor, 1),
                            "reality_next_qb_taken_at": next_qb_real,
                            "wait_would_have_failed": (
                                next_qb_real is not None and next_qb_real <= k2)})
    return out


def dollar_for_flip(history: dict, payouts: dict, season_num: str, flip: dict,
                    picks: list, positions: dict, proj: dict) -> dict:
    """Single-swap counterfactual for one flip, exp34_dollars convention.

    The seat takes the best walk-forward-projected QB available at the flip
    pick instead of its real pick there; the room is held fixed; the drafted
    roster (keepers + picks) is graded through the certified pipeline both
    ways. If the projected-best QB is a player the seat drafted later anyway,
    the roster is unchanged and the delta is an honest zero.
    """
    rid = flip["roster_id"]
    k = flip["pick_no"]
    taken_before = {str(p["player_id"]) for p in picks if int(p["pick_no"]) < k}
    avail_qbs = [(proj.get(pid, 0.0), pid) for pid, pos in positions.items()
                 if pos == "QB" and pid not in taken_before and proj.get(pid)]
    if not avail_qbs:
        return {"graded": False, "why": "no projectable QB available"}
    qstar = max(avail_qbs)[1]
    seat_picks = [str(p["player_id"]) for p in picks if p.get("roster_id") == rid]
    real_at_k = next(str(p["player_id"]) for p in picks
                     if p.get("roster_id") == rid and int(p["pick_no"]) == k)
    cf = [pid for pid in seat_picks if pid != real_at_k]
    unchanged = qstar in seat_picks
    if not unchanged:
        cf.append(qstar)
    else:
        cf.append(real_at_k)            # same QB earlier — roster identical

    s = MG.season_of(history, season_num)
    real_weekly = RS.roster_weekly_scores(s, seat_picks, positions)
    cf_weekly = RS.roster_weekly_scores(s, cf, positions)
    g_real = MG.grade_substituted(history, payouts, season_num, rid, real_weekly)
    g_cf = MG.grade_substituted(history, payouts, season_num, rid, cf_weekly)

    def total(g):
        t = g.get("graded_total")
        return t if t is not None else g.get("graded_total_partial")

    tr, tc = total(g_real), total(g_cf)
    return {"graded": True, "roster_id": rid, "pick_no": k,
            "qb_taken_instead": qstar, "real_pick_displaced": real_at_k,
            "roster_unchanged": unchanged,
            "real_total": tr, "cf_total": tc,
            "delta_dollars": (round(tc - tr, 2)
                              if tr is not None and tc is not None else None),
            "playoff_withheld": (g_real.get("playoff") is None
                                 or g_cf.get("playoff") is None)}


# ── main ─────────────────────────────────────────────────────────────────────
def run() -> dict:
    board = json.loads(BOARD.read_text())
    history = json.loads(HISTORY.read_text())
    payouts = MG.load_payouts()
    pos = dict(json.loads(POSITIONS.read_text())["positions"])
    for p in board.get("players", []):
        if p.get("player_id") and p.get("position"):
            pos.setdefault(str(p["player_id"]), p["position"])

    share = measured_gap_share()
    if not share.get("measured"):
        return {"experiment": "scoring-gap-correction", "ran": False, "why": share.get("why")}

    curve = price_curve(board["players"])
    if not curve.get("ok"):
        return {"experiment": "scoring-gap-correction", "ran": False, "why": curve.get("why")}

    repl_qb = float(board["replacement"]["replacement_points"]["QB"])
    kept = board.get("kept_players") or []

    ladders = {}
    for label, sh in (("lo", share["share_lo"]), ("mid", share["share_mid"]),
                      ("hi", share["share_hi"])):
        ladders[label] = market_qb_ladder(board["players"], kept, sh, repl_qb, curve)
    naive = market_qb_ladder(board["players"], kept, share["share_mid"], repl_qb,
                             curve, naive=True)
    mid = ladders["mid"]

    # ── Arm B ──
    room_by_season, room_by_season_all = {}, {}
    for s in history["seasons"]:
        season = str(s.get("season"))
        if season not in SEASONS:
            continue
        picks = real_draft(s)
        if not picks:
            continue
        room_by_season[season] = room_qb_picks(picks, pos, include_keepers=False)
        room_by_season_all[season] = room_qb_picks(picks, pos, include_keepers=True)

    def arm_b(room_map: dict) -> dict:
        per_season = {}
        for season, room in room_map.items():
            per_season[season] = {
                "room_qb_picks": room[:TOP_SLOTS + 2],
                "err_raw": slot_errors(room, mid["raw"], TOP_SLOTS),
                "err_corrected": slot_errors(room, mid["corrected"], TOP_SLOTS),
                "err_naive": slot_errors(room, naive["corrected"], TOP_SLOTS),
            }
        loso = loso_fitted_ladders(room_map, mid["raw"], TOP_SLOTS)
        for season in per_season:
            per_season[season]["err_room_fitted_loso"] = slot_errors(
                room_map[season], loso[season], TOP_SLOTS)

        def agg(key):
            errs = [e for v in per_season.values() for e in v[key]]
            aerrs = [abs(e) for e in errs]
            return {"n": len(errs),
                    "mean_abs_err": round(sum(aerrs) / len(aerrs), 2) if aerrs else None,
                    "mean_signed_err": round(sum(errs) / len(errs), 2) if errs else None,
                    "all_positive": all(e > 0 for e in errs) if errs else None}
        return {"per_season": per_season,
                "aggregate": {k: agg("err_" + k)
                              for k in ("raw", "corrected", "naive", "room_fitted_loso")}}

    b_live = arm_b(room_by_season)
    b_all = arm_b(room_by_season_all)

    # Share-band sensitivity for the headline (keepers-included) frame: the
    # calibration claim must hold across the measured band, not at one point.
    def band_mae(ladder):
        errs = [abs(e) for room in room_by_season_all.values()
                for e in slot_errors(room, ladder["corrected"], TOP_SLOTS)]
        return round(sum(errs) / len(errs), 2) if errs else None
    b_sensitivity = {label: band_mae(lad) for label, lad in ladders.items()}

    # ── Arm C ──
    table = window_survival_table(
        history, pos, {"raw": mid["raw"], "corrected": mid["corrected"],
                       "naive": naive["corrected"]})
    c_metrics = window_metrics(table["rows"], ("raw", "corrected", "naive"))
    c_by_season = {}
    for season in SEASONS:
        rows = [r for r in table["rows"] if r["season"] == season]
        if rows:
            c_by_season[season] = window_metrics(rows, ("raw", "corrected"))

    # ── Arm D ──
    weekly_paths = {y: HERE / f"nflverse_weekly_points_{y}.json" for y in (2023, 2024)}
    d_out = {"seasons": {}, "note": (
        "2023 excluded: no strictly-prior season on disk for a walk-forward "
        "projection (exp_inverse_adjuster's rule). Flips use the mid-band "
        "correction; the seat's counterfactual QB is chosen by walk-forward "
        "projection only (decision-time legal).")}
    for season in DOLLAR_SEASONS:
        yr = int(season)
        priors, games = {}, {}
        for py in (yr - 2, yr - 1):
            path = weekly_paths.get(py)
            if path and path.exists():
                t, g = prior_points_from_weekly(path)
                priors[py], games[py] = t, g
        if not priors:
            d_out["seasons"][season] = {"ran": False, "why": "no prior-season points"}
            continue
        proj = walk_forward(yr, priors, games, pos)
        s = MG.season_of(history, season)
        picks = real_draft(s)
        flips = flips_for_season(picks, pos, mid["raw"], mid["corrected"])
        graded, seen = [], set()
        for f in flips:
            if f["roster_id"] in seen:
                continue                # first flip per seat-season only
            seen.add(f["roster_id"])
            graded.append({**f, "dollars": dollar_for_flip(
                history, payouts, season, f, picks, pos, proj)})
        deltas = [g["dollars"]["delta_dollars"] for g in graded
                  if g["dollars"].get("graded") and g["dollars"].get("delta_dollars") is not None]
        d_out["seasons"][season] = {
            "ran": True, "n_flip_windows": len(flips),
            "n_seats_with_flip": len(seen),
            "flips_where_wait_would_have_failed": sum(
                1 for f in flips if f["wait_would_have_failed"]),
            "graded_first_flips": graded,
            "delta_dollars_sum": round(sum(deltas), 2) if deltas else None,
            "delta_dollars_mean": round(sum(deltas) / len(deltas), 2) if deltas else None,
            "prior_seasons_used": sorted(priors),
        }

    return {
        "experiment": "scoring-gap-correction (SG-1)",
        "ran": True,
        "installs": "nothing — measurement + backtest only, per the standing policy",
        "gap_share": share,
        "replacement_qb": repl_qb,
        "correction_ladder_mid": mid["detail"][:STARTABLE_QB],
        "naive_ladder_top4": naive["detail"][:4],
        "arm_b_slot_errors": {"live_picks_only": b_live, "keepers_included": b_all,
                              "corrected_mae_by_share_band": b_sensitivity,
                              "frame_note": (
                                  "keepers_included is the survival-relevant frame "
                                  "(a kept QB depletes the pool at his slot exactly "
                                  "like a drafted one); live_picks_only is reported "
                                  "to show the artifact keeper depletion introduces "
                                  "when only one side of the comparison excludes it")},
        "arm_c_window_survival": {"metrics": c_metrics, "by_season": c_by_season,
                                  "n_windows": len(table["rows"])},
        "arm_d_dollars": d_out,
        "confounds": [
            "market ladder is the 2026 board's ADP applied to 2023-25 drafts at "
            "slot level — no historical ADP exists locally (CI-only egress); the "
            "paired raw-vs-corrected comparison shares and largely cancels it, "
            "the absolute errors do not",
            "per-QB gap estimated as share x proj_mean from a 2-row measured "
            "band, pending the per-player measurement the next board build "
            "carries in provenance",
            "arm D is a single-swap, room-held-fixed counterfactual on the "
            "drafted-roster hindsight-ceiling denominator (exp34_dollars' "
            "stated limits apply)",
        ],
    }


if __name__ == "__main__":
    result = run()
    OUT.write_text(json.dumps(result, indent=1))
    print(f"wrote {OUT}")
    if result.get("ran"):
        b = result["arm_b_slot_errors"]["live_picks_only"]["aggregate"]
        print("ARM B (slot |err| vs room, live picks): "
              f"raw {b['raw']['mean_abs_err']} -> corrected {b['corrected']['mean_abs_err']} "
              f"(naive {b['naive']['mean_abs_err']}, room-fitted LOSO "
              f"{b['room_fitted_loso']['mean_abs_err']})")
        c = result["arm_c_window_survival"]["metrics"]
        print("ARM C (window MAE): "
              f"raw {c['raw']['mae']} (bias {c['raw']['bias']}) -> "
              f"corrected {c['corrected']['mae']} (bias {c['corrected']['bias']}); "
              f"paired raw-minus-corrected {c['paired_mae_raw_minus_corrected']}")
        for season, d in result["arm_d_dollars"]["seasons"].items():
            print(f"ARM D {season}: flips={d.get('n_flip_windows')} "
                  f"seats={d.get('n_seats_with_flip')} "
                  f"sum$={d.get('delta_dollars_sum')}")
