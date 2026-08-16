# TERRITORY: A
#!/usr/bin/env python3
"""LEAGUE DRAFT-ROOM BEHAVIOR — signatures, stability, and a preregistered forward test.

The survival model prices "will he still be there at my pick" off market ADP plus
noise. This room is ten specific people with 377 real non-keeper decisions on file
(2023-25), and nobody had measured whether THEIR behavior, fit on two seasons,
predicts the third better than the ADP-plus-noise form the engine already uses.
This is that measurement. Preregistration: draft/audit/draft_behavior_2026-08-15.md
section 2 — every constant, metric and the decision rule were fixed there before
this file produced a validation number, and nothing here is tuned to 2025.

THE 2023 KEEPER TRAP (found by looking, not assumed): the 2023 main draft carries
ZERO is_keeper flags, but the season's SECOND draft (30 picks, all keepers, rounds
1-3) names the same (roster_id, player_id) pairs that occupy the main draft's first
three rounds. A flag-only filter counts 30 keeper placements as decisions —
opponent_profiles.json and opponent_persistence.js both did. Here a 2023 pick is a
keeper iff its pair appears in the parallel keeper draft.

SCALES: all survival math runs on the DECISION INDEX — non-keeper picks numbered
1..D in board order. Keepers consume board slots, never decision indices; this is
the same conversion survival.js liveIndexOf performs live, done natively instead
of retrofitted.

NO ERA ADP ON FILE (audit doc section 1 walks every archive): the baseline anchor
for both arms is the ROOM PROXY — a player's mean decision index across the PRIOR
seasons only. Symmetric information cutoff, same construction as
opponent_persistence.js. It is not market ADP and nothing here claims it is.

Pure core (no I/O below main) unit-tested in draft/tests/test_draft_behavior.py.
No egress. Writes draft/data/draft_behavior.json, _territory first.

Run: python3 draft/backtest/draft_behavior.py
"""
from __future__ import annotations

import json
import math
import random
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent

POSITIONS = ("QB", "RB", "WR", "TE", "K", "DEF")
STARTERS = {"QB": 1, "RB": 2, "WR": 2, "TE": 1, "K": 1, "DEF": 1}  # dedicated slots; FLEX excluded on purpose

# ── preregistered constants (audit doc §2.1) — not tuned after ─────────────
HORIZONS = (6, 12, 18, 24)
EVAL_PROXY_WINDOW = 40      # eval set: proxy <= picks-made + 40
MIX_PSEUDO = 8.0            # pseudo-count m blending owner bucket mix toward league
NEED_FULL_MULT = 0.35       # engine's needWeight when starters are full
WITHIN_TOP = 8              # within-position candidates
WITHIN_DECAY = 2.0          # geometric weight exp(-(rank-1)/WITHIN_DECAY)
TAIL_BUDGET = 0.01          # shared mass outside the candidate pool (a budget, not a per-player constant)
LOGLOSS_CLIP = 1e-3
# the engine's Layer-1 dispersion (survival.js CFG — mirrored, with the source named)
ADP_SD_FLOOR, ADP_SD_RATE, ADP_SD_CAP = 3.0, 0.15, 15.0


def round_bucket(rnd):
    """survival.js / opponent_predict.js ROUND_BUCKET — one definition, mirrored."""
    return "early" if rnd <= 3 else ("mid" if rnd <= 9 else "late")


def adp_sd(mu):
    return min(ADP_SD_CAP, max(ADP_SD_FLOOR, ADP_SD_RATE * mu))


def normal_cdf(x, mu, sigma):
    if sigma <= 0:
        return 1.0 if x >= mu else 0.0
    return 0.5 * (1 + math.erf((x - mu) / (sigma * math.sqrt(2))))


# ═══════════════════════════════ data assembly ═══════════════════════════════

def keeper_pairs_2023(season_2023):
    """The parallel keeper draft's (roster_id, player_id) pairs — the flags 2023
    never got. Identified structurally (a sub-100-pick all-keeper draft), not by
    draft_id, so a re-harvest cannot silently break the join."""
    for d in season_2023.get("drafts", []):
        picks = d.get("picks") or []
        if picks and len(picks) < 100 and all(p.get("is_keeper") for p in picks):
            return {(p["roster_id"], str(p["player_id"])) for p in picks}
    return set()


def build_rows(history, positions, first_names=None):
    """league_history -> flat decision/keeper rows with owner, position and the
    DECISION INDEX (non-keeper picks numbered 1..D in board order; keepers consume
    board slots only — the liveIndexOf conversion, native)."""
    rows = []
    unresolved = []
    for season in history.get("seasons", []):
        yr = str(season.get("season"))
        if yr not in ("2023", "2024", "2025"):
            continue
        main = None
        for d in season.get("drafts", []):
            if len(d.get("picks") or []) > 100:
                main = d
        if main is None:
            continue
        kp = keeper_pairs_2023(season) if yr == "2023" else set()
        owners = season.get("owners", {})
        picks = sorted(main["picks"], key=lambda p: p["pick_no"])
        di = 0
        for p in picks:
            pid = str(p["player_id"])
            is_keeper = bool(p.get("is_keeper")) or (p["roster_id"], pid) in kp
            if not is_keeper:
                di += 1
            handle = (owners.get(str(p["roster_id"])) or {}).get("display_name")
            owner = (first_names or {}).get(handle, handle)
            pos = positions.get(pid)
            if pos is None and not is_keeper:
                unresolved.append({"season": yr, "player_id": pid, "pick_no": p["pick_no"]})
            rows.append({
                "season": yr, "round": p["round"], "pick_no": p["pick_no"],
                "roster_id": p["roster_id"], "owner": owner, "player_id": pid,
                "position": pos, "is_keeper": is_keeper,
                "decision_index": None if is_keeper else di,
            })
    return rows, unresolved


def decisions(rows, seasons=None):
    return [r for r in rows if not r["is_keeper"]
            and (seasons is None or r["season"] in seasons)]


def room_proxy(rows, prior_seasons):
    """player -> mean DECISION INDEX across the prior seasons' non-keeper picks.
    The stand-in for era ADP this repo does not hold (labeled everywhere)."""
    acc = {}
    for r in decisions(rows, prior_seasons):
        acc.setdefault(r["player_id"], []).append(r["decision_index"])
    return {pid: sum(v) / len(v) for pid, v in acc.items()}


# ═══════════════════════════════ signatures ═══════════════════════════════

def bucket_mix_counts(rows, seasons):
    """(owner -> bucket -> pos -> n) and (bucket -> pos -> n) for the league."""
    by_owner, league = {}, {}
    for r in decisions(rows, seasons):
        if not r["position"]:
            continue
        b = round_bucket(r["round"])
        by_owner.setdefault(r["owner"], {}).setdefault(b, {})
        by_owner[r["owner"]][b][r["position"]] = by_owner[r["owner"]][b].get(r["position"], 0) + 1
        league.setdefault(b, {})
        league[b][r["position"]] = league[b].get(r["position"], 0) + 1
    return by_owner, league


def first_pos_round(rows, seasons, owner, pos, never=16):
    """Mean over seasons of the round of the owner's FIRST non-keeper pick at pos.
    A season where he never drafts it contributes `never` (=16, one past the last
    round) so 'streams K off waivers' is a value, not a hole."""
    vals = []
    for s in seasons:
        rounds = [r["round"] for r in decisions(rows, (s,))
                  if r["owner"] == owner and r["position"] == pos]
        vals.append(min(rounds) if rounds else never)
    return sum(vals) / len(vals) if vals else None


def run_events(rows, season):
    """Preregistered run rule: at decision t (>=3), a run of p is active iff
    decisions t-1 and t-2 were both p. Returns [(owner, run_pos, followed)]."""
    seq = [r for r in decisions(rows, (season,)) if r["position"]]
    seq.sort(key=lambda r: r["decision_index"])
    out = []
    for i in range(2, len(seq)):
        a, b, cur = seq[i - 2], seq[i - 1], seq[i]
        if a["position"] == b["position"]:
            out.append((cur["owner"], a["position"], cur["position"] == a["position"]))
    return out


def rosters_at(rows, season, upto_decision):
    """owner -> pos -> count of players held (keepers + decisions with index <
    upto_decision). Live draft state — legitimate knowledge at every pick."""
    out = {}
    for r in rows:
        if r["season"] != season or not r["position"]:
            continue
        if r["is_keeper"] or (r["decision_index"] is not None and r["decision_index"] < upto_decision):
            out.setdefault(r["owner"], {})
            out[r["owner"]][r["position"]] = out[r["owner"]].get(r["position"], 0) + 1
    return out


def need_positions(roster):
    """Dedicated starter slots still unfilled. FLEX deliberately excluded — the
    signature question is 'does he fill mandatory holes', not flex accounting."""
    return {p for p, n in STARTERS.items() if roster.get(p, 0) < n}


def need_fill_rate(rows, seasons, owner=None):
    """P(pick fills an unfilled dedicated starter slot | at least one exists).
    K/DEF holes only count in the final 3 rounds — before that no one calls a
    kicker a need, and counting him would flatter everyone equally."""
    hit = tot = 0
    for s in seasons:
        for r in decisions(rows, (s,)):
            if owner is not None and r["owner"] != owner:
                continue
            if not r["position"]:
                continue
            roster = rosters_at(rows, s, r["decision_index"]).get(r["owner"], {})
            needs = need_positions(roster)
            if r["round"] < 13:
                needs -= {"K", "DEF"}
            if not needs:
                continue
            tot += 1
            hit += 1 if r["position"] in needs else 0
    return (hit / tot if tot else None), tot


def owner_signature(rows, seasons, owner):
    ds = [r for r in decisions(rows, seasons) if r["owner"] == owner and r["position"]]
    n = len(ds)
    share = {}
    for p in POSITIONS:
        share[p] = round(sum(1 for r in ds if r["position"] == p) / n, 4) if n else None
    events = [e for s in seasons for e in run_events(rows, s)]
    mine = [e for e in events if e[0] == owner]
    follow = round(sum(1 for e in mine if e[2]) / len(mine), 4) if mine else None
    nfr, nfr_n = need_fill_rate(rows, seasons, owner)
    return {
        "n_decisions": n,
        "position_share": share,
        "first_round": {p: first_pos_round(rows, seasons, owner, p) for p in POSITIONS},
        "run_follow": {"rate": follow, "n_run_moments": len(mine)},
        "need_fill": {"rate": round(nfr, 4) if nfr is not None else None, "n": nfr_n},
    }


# ─────────────────────────── reach vs room proxy ───────────────────────────

def reach_by_owner(rows, target_season, prior_seasons):
    """delta = decision_index - room_proxy, per owner, CENTERED on the season's
    field mean so shared drift (career trajectory the proxy cannot see) cancels
    to first order. Room-relative, never market-relative — no era ADP on file."""
    proxy = room_proxy(rows, prior_seasons)
    deltas = {}
    for r in decisions(rows, (target_season,)):
        if r["player_id"] in proxy:
            deltas.setdefault(r["owner"], []).append(r["decision_index"] - proxy[r["player_id"]])
    all_d = [d for v in deltas.values() for d in v]
    field = sum(all_d) / len(all_d) if all_d else 0.0
    out = {}
    for o, v in deltas.items():
        m = sum(v) / len(v)
        sd = (sum((x - m) ** 2 for x in v) / len(v)) ** 0.5 if len(v) > 1 else None
        out[o] = {"mean_centered": round(m - field, 2),
                  "sd": round(sd, 2) if sd is not None else None, "n": len(v)}
    return out, round(field, 2), len(all_d)


# ═══════════════════════ stability across seasons ═══════════════════════

def spearman(xs, ys):
    """Spearman rho with average ranks for ties. None if degenerate."""
    n = len(xs)
    if n < 3:
        return None

    def ranks(v):
        order = sorted(range(n), key=lambda i: v[i])
        rk = [0.0] * n
        i = 0
        while i < n:
            j = i
            while j + 1 < n and v[order[j + 1]] == v[order[i]]:
                j += 1
            avg = (i + j) / 2 + 1
            for k in range(i, j + 1):
                rk[order[k]] = avg
            i = j + 1
        return rk
    rx, ry = ranks(xs), ranks(ys)
    mx, my = sum(rx) / n, sum(ry) / n
    num = sum((rx[i] - mx) * (ry[i] - my) for i in range(n))
    dx = math.sqrt(sum((r - mx) ** 2 for r in rx))
    dy = math.sqrt(sum((r - my) ** 2 for r in ry))
    if dx == 0 or dy == 0:
        return None
    return num / (dx * dy)


def season_features(rows, season, owners):
    """The seven preregistered stability features, per owner, one season."""
    out = {}
    for o in owners:
        ds = [r for r in decisions(rows, (season,)) if r["owner"] == o and r["position"]]
        n = len(ds) or 1
        events = [e for e in run_events(rows, season) if e[0] == o]
        nfr, _ = need_fill_rate(rows, (season,), o)
        out[o] = {
            "f1_rb_share": sum(1 for r in ds if r["position"] == "RB") / n,
            "f2_wr_share": sum(1 for r in ds if r["position"] == "WR") / n,
            "f3_first_qb": first_pos_round(rows, (season,), o, "QB"),
            "f4_first_te": first_pos_round(rows, (season,), o, "TE"),
            "f5_first_k": first_pos_round(rows, (season,), o, "K"),
            "f6_run_follow": (sum(1 for e in events if e[2]) / len(events)) if events else None,
            "f7_need_fill": nfr,
        }
    return out


def stability(rows, owners, n_perm=1000, seed=20260815):
    feats = {s: season_features(rows, s, owners) for s in ("2023", "2024", "2025")}
    fnames = ["f1_rb_share", "f2_wr_share", "f3_first_qb", "f4_first_te",
              "f5_first_k", "f6_run_follow", "f7_need_fill"]
    pairs = [("2023", "2024"), ("2024", "2025"), ("2023", "2025")]

    def pair_rhos(a, b, perm=None):
        rhos = {}
        for f in fnames:
            pts = [(feats[a][o][f], feats[b][perm[o] if perm else o][f])
                   for o in owners
                   if feats[a][o][f] is not None and feats[b][perm[o] if perm else o][f] is not None]
            rhos[f] = spearman([p[0] for p in pts], [p[1] for p in pts]) if len(pts) >= 5 else None
        return rhos

    out = {"pairs": {}, "permutation": None}
    for a, b in pairs:
        rhos = pair_rhos(a, b)
        usable = [v for v in rhos.values() if v is not None]
        out["pairs"][f"{a}->{b}"] = {
            "per_feature": {k: (round(v, 3) if v is not None else None) for k, v in rhos.items()},
            "mean_rho": round(sum(usable) / len(usable), 3) if usable else None,
            "n_features_usable": len(usable),
        }
    # permutation test on the (2024,2025) mean rho — the pair 2026 resembles
    obs = out["pairs"]["2024->2025"]["mean_rho"]
    if obs is not None:
        rng = random.Random(seed)
        ge = 0
        for _ in range(n_perm):
            shuffled = list(owners)
            rng.shuffle(shuffled)
            perm = dict(zip(owners, shuffled))
            rhos = pair_rhos("2024", "2025", perm)
            usable = [v for v in rhos.values() if v is not None]
            if usable and abs(sum(usable) / len(usable)) >= abs(obs):
                ge += 1
        out["permutation"] = {"pair": "2024->2025", "mean_rho": obs,
                              "p_two_sided": round(ge / n_perm, 4), "n_perm": n_perm}
    return out


# ═══════════════════════ the preregistered forward test ═══════════════════════

def _mix_for(owner, bucket, by_owner, league):
    """Blended position distribution: (n_o,b(pos) + m·league_share) / (n_o,b + m)."""
    lg = league.get(bucket, {})
    lg_tot = sum(lg.values()) or 1
    own = by_owner.get(owner, {}).get(bucket, {})
    own_tot = sum(own.values())
    out = {}
    for p in POSITIONS:
        share = lg.get(p, 0) / lg_tot
        out[p] = (own.get(p, 0) + MIX_PSEUDO * share) / (own_tot + MIX_PSEUDO)
    tot = sum(out.values()) or 1
    return {p: v / tot for p, v in out.items()}


def _need_damp(mix, roster):
    out = {}
    for p, v in mix.items():
        out[p] = v * (NEED_FULL_MULT if roster.get(p, 0) >= STARTERS[p] else 1.0)
    tot = sum(out.values()) or 1
    return {p: v / tot for p, v in out.items()}


def _within_weights(pool_size):
    """Geometric weights over the top-WITHIN_TOP by proxy; the tail SHARES
    TAIL_BUDGET (a budget, not a per-player constant — survival.js's own
    conservation fix, mirrored)."""
    k = min(pool_size, WITHIN_TOP)
    raw = [math.exp(-(i) / WITHIN_DECAY) for i in range(k)]
    s = sum(raw)
    head = [(1 - TAIL_BUDGET) * w / s for w in raw] if pool_size > k else [w / s for w in raw]
    tail_n = pool_size - k
    return head, (TAIL_BUDGET / tail_n if tail_n else 0.0)


def proxy_residual_sd(rows, from_season="2023", to_season="2024"):
    """TRAIN-ONLY dispersion of the room proxy: sd of (actual decision index in
    to_season − proxy from from_season). This is what the proxy's real noise
    looks like, measured without touching the target season. Feeds only the
    POST-PREREG robust-baseline diagnostic, never the preregistered arms."""
    proxy = room_proxy(rows, (from_season,))
    res = [r["decision_index"] - proxy[r["player_id"]]
           for r in decisions(rows, (to_season,)) if r["player_id"] in proxy]
    if len(res) < 2:
        return None
    m = sum(res) / len(res)
    return (sum((x - m) ** 2 for x in res) / len(res)) ** 0.5


def forward_test(rows, train_seasons=("2023", "2024"), target="2025",
                 use_owner=True, use_need=True, sd_override=None):
    """Fit on train_seasons, predict `target` pick-by-pick. Returns the full
    result block. Leakage discipline: the target season contributes only its
    live state — board structure, keeper slate, picks already made.

    use_owner / use_need / sd_override exist ONLY for the post-preregistration
    ablation diagnostics (owner term off = league mix; need off; baseline sd
    widened to the train-measured proxy dispersion). The preregistered run is
    the default call — all three untouched."""
    proxy = room_proxy(rows, train_seasons)
    by_owner, league = bucket_mix_counts(rows, train_seasons)
    if not use_owner:
        by_owner = {}

    seq = decisions(rows, (target,))          # in decision_index order already
    seq.sort(key=lambda r: r["decision_index"])
    D = len(seq)
    taken_at = {r["player_id"]: r["decision_index"] for r in seq}
    kept = {r["player_id"] for r in rows if r["season"] == target and r["is_keeper"]}

    # players both arms can see: proxied, not kept this season
    pool_all = [{"player_id": pid, "proxy": mu, "position": None}
                for pid, mu in proxy.items() if pid not in kept]
    posmap = {r["player_id"]: r["position"] for r in rows if r["position"]}
    pool_all = [dict(p, position=posmap.get(p["player_id"])) for p in pool_all]
    pool_all = [p for p in pool_all if p["position"]]

    brier = {"model": {h: [0.0, 0] for h in HORIZONS}, "baseline": {h: [0.0, 0] for h in HORIZONS}}
    bins = {"model": [[0.0, 0.0, 0] for _ in range(10)],
            "baseline": [[0.0, 0.0, 0] for _ in range(10)]}
    pos_ll = {"model": 0.0, "base": 0.0}
    pos_hit = {"model": 0, "base": 0}
    exact_hit = {"model": 0, "baseline": 0}
    n_pos = 0
    n_excluded_no_proxy = sum(1 for r in seq if r["player_id"] not in proxy)

    for t_row in seq:
        t = t_row["decision_index"]           # 1-based; evaluated BEFORE this pick
        c = t - 1                             # decisions already made
        alive = [p for p in pool_all if (taken_at.get(p["player_id"], 10 ** 9)) >= t]
        eval_set = [p for p in alive if p["proxy"] <= c + EVAL_PROXY_WINDOW]
        if not eval_set:
            continue

        # ---- model arm: walk the next 24 known decision steps -------------
        steps = seq[t - 1: t - 1 + max(HORIZONS)]
        roster_state = rosters_at(rows, target, t)
        by_pos = {}
        for p in eval_set:
            by_pos.setdefault(p["position"], []).append(p)
        for pos in by_pos:
            by_pos[pos].sort(key=lambda p: p["proxy"])
        avail = {p["player_id"]: 1.0 for p in eval_set}
        step1_mix = None
        for i, srow in enumerate(steps):
            mix = _mix_for(srow["owner"], round_bucket(srow["round"]), by_owner, league)
            if use_need:
                mix = _need_damp(mix, roster_state.get(srow["owner"], {}))
            if i == 0:
                step1_mix = mix
            for pos, plist in by_pos.items():
                live = [p for p in plist if avail[p["player_id"]] > 1e-4]
                if not live:
                    continue
                head, tail_w = _within_weights(len(live))
                for j, p in enumerate(live):
                    w = head[j] if j < len(head) else tail_w
                    p_take = mix.get(pos, 0.0) * w * avail[p["player_id"]]
                    p_take = max(0.0, min(1.0, p_take))
                    avail[p["player_id"]] *= (1 - p_take)
            if (i + 1) in HORIZONS and t + i <= D:
                h = i + 1
                for p in eval_set:
                    pid = p["player_id"]
                    pm = 1 - avail[pid]
                    truth = 1.0 if t <= taken_at.get(pid, 10 ** 9) <= t + h - 1 else 0.0
                    brier["model"][h][0] += (pm - truth) ** 2
                    brier["model"][h][1] += 1
                    b = min(9, int(pm * 10))
                    bins["model"][b][0] += pm
                    bins["model"][b][1] += truth
                    bins["model"][b][2] += 1
                    # baseline arm at the same (t, h, player)
                    mu = p["proxy"]
                    sd = sd_override if sd_override is not None else adp_sd(mu)
                    fc = normal_cdf(c, mu, sd)
                    fN = normal_cdf(t + h - 1, mu, sd)
                    pb = 1.0 if fc >= 0.999 else max(0.0, min(1.0, (fN - fc) / (1 - fc)))
                    brier["baseline"][h][0] += (pb - truth) ** 2
                    brier["baseline"][h][1] += 1
                    b = min(9, int(pb * 10))
                    bins["baseline"][b][0] += pb
                    bins["baseline"][b][1] += truth
                    bins["baseline"][b][2] += 1

        # ---- next-pick position + exact player ---------------------------
        actual_pos = t_row["position"]
        if actual_pos and step1_mix:
            n_pos += 1
            lg_mix = _mix_for("__nobody__", round_bucket(t_row["round"]), {}, league)
            for arm, mx in (("model", step1_mix), ("base", lg_mix)):
                p = max(LOGLOSS_CLIP, min(1 - LOGLOSS_CLIP, mx.get(actual_pos, 0.0)))
                pos_ll[arm] += -math.log(p)
            if max(step1_mix, key=step1_mix.get) == actual_pos:
                pos_hit["model"] += 1
            if max(lg_mix, key=lg_mix.get) == actual_pos:
                pos_hit["base"] += 1
            # exact player, harsh rule (continuity with opponent_persistence)
            if eval_set:
                base_pick = min(eval_set, key=lambda p: p["proxy"])
                if base_pick["player_id"] == t_row["player_id"]:
                    exact_hit["baseline"] += 1
                mix_now = step1_mix
                best, best_score = None, -1.0
                for pos, plist in by_pos.items():
                    live = [p for p in plist if taken_at.get(p["player_id"], 10 ** 9) >= t]
                    if not live:
                        continue
                    cand = min(live, key=lambda p: p["proxy"])
                    score = mix_now.get(pos, 0.0)
                    if score > best_score:
                        best, best_score = cand, score
                if best and best["player_id"] == t_row["player_id"]:
                    exact_hit["model"] += 1

    def finish(side):
        per_h, num, den = {}, 0.0, 0
        for h in HORIZONS:
            s, n = brier[side][h]
            per_h[str(h)] = round(s / n, 5) if n else None
            num += s
            den += n
        return per_h, (round(num / den, 5) if den else None), den

    mh, mp, n_obs = finish("model")
    bh, bp, _ = finish("baseline")

    def cal(side):
        return [{"bin": f"{i / 10:.1f}-{(i + 1) / 10:.1f}",
                 "mean_pred": round(b[0] / b[2], 3) if b[2] else None,
                 "mean_actual": round(b[1] / b[2], 3) if b[2] else None,
                 "n": b[2]} for i, b in enumerate(bins[side])]

    return {
        "train_seasons": list(train_seasons), "target": target,
        "n_decisions_target": D, "n_survival_observations": n_obs,
        "n_target_picks_without_proxy": n_excluded_no_proxy,
        "survival_brier": {
            "model": {"pooled": mp, "per_horizon": mh},
            "baseline": {"pooled": bp, "per_horizon": bh},
            "model_beats_baseline": (mp is not None and bp is not None and mp < bp),
        },
        "calibration": {"model": cal("model"), "baseline": cal("baseline")},
        "next_pick_position": {
            "n": n_pos,
            "model": {"top1_hit": round(pos_hit["model"] / n_pos, 4) if n_pos else None,
                      "logloss": round(pos_ll["model"] / n_pos, 4) if n_pos else None},
            "league_base": {"top1_hit": round(pos_hit["base"] / n_pos, 4) if n_pos else None,
                            "logloss": round(pos_ll["base"] / n_pos, 4) if n_pos else None},
            "model_beats_base_logloss": (n_pos > 0 and pos_ll["model"] < pos_ll["base"]),
        },
        "exact_player_top1": {
            "n": n_pos,
            "model": round(exact_hit["model"] / n_pos, 4) if n_pos else None,
            "baseline_room_proxy_bpa": round(exact_hit["baseline"] / n_pos, 4) if n_pos else None,
        },
    }


# ═══════════════════════ keeper-informed need ═══════════════════════

def keeper_need(rows):
    """2024+2025 owner-seasons: decision share at pos in rounds 4-6 grouped by
    how many of pos the owner kept (0 / 1 / 2+). 2023 excluded — everyone kept
    exactly 3, no variation to measure."""
    groups = {}
    counts = {p: {} for p in POSITIONS}
    for s in ("2024", "2025"):
        keeps = {}
        for r in rows:
            if r["season"] == s and r["is_keeper"] and r["position"]:
                keeps.setdefault(r["owner"], {})
                keeps[r["owner"]][r["position"]] = keeps[r["owner"]].get(r["position"], 0) + 1
        early = [r for r in decisions(rows, (s,)) if 4 <= r["round"] <= 6 and r["position"]]
        by_owner = {}
        for r in early:
            by_owner.setdefault(r["owner"], []).append(r["position"])
        for o, plist in by_owner.items():
            n = len(plist)
            for pos in ("RB", "WR", "QB", "TE"):
                k = keeps.get(o, {}).get(pos, 0)
                g = "0" if k == 0 else ("1" if k == 1 else "2+")
                share = sum(1 for p in plist if p == pos) / n
                groups.setdefault(pos, {}).setdefault(g, []).append(share)
                counts[pos][g] = counts[pos].get(g, 0) + 1
    out = {}
    for pos, gs in groups.items():
        out[pos] = {g: {"mean_share_r4_6": round(sum(v) / len(v), 4),
                        "n_owner_seasons": len(v)} for g, v in sorted(gs.items())}
    return out


# ═══════════════ league mass vs the CURRENT market board (era-mismatched, labeled) ═══════════════

def league_vs_market_mass(rows, market_adp, positions):
    """Room's mean positional counts per round band (2023-25, keepers INCLUDED —
    board composition is what survival sees) vs what the latest HOME ADP snapshot
    (Sleeper-keyed) implies for picks 1-150. The market side is 2026; the room
    side is 2023-25. That era mismatch is the price of having no archived market
    ADP, and it is labeled, not hidden."""
    bands = (("r1_3", 1, 3), ("r4_7", 4, 7), ("r8_11", 8, 11), ("r12_15", 12, 15))
    room = {b[0]: {p: 0 for p in POSITIONS} for b in bands}
    n_seasons = 3
    for r in rows:
        if not r["position"]:
            continue
        for name, lo, hi in bands:
            if lo <= r["round"] <= hi:
                room[name][r["position"]] += 1
    ranked = sorted(market_adp.items(), key=lambda kv: kv[1])[:150]
    market = {b[0]: {p: 0 for p in POSITIONS} for b in bands}
    unmapped = 0
    for i, (pid, _adp) in enumerate(ranked):
        rnd = i // 10 + 1
        pos = positions.get(str(pid))
        if pos not in POSITIONS:
            unmapped += 1
            continue
        for name, lo, hi in bands:
            if lo <= rnd <= hi:
                market[name][pos] += 1
    return {
        "note": ("room = mean picks/season 2023-25 (keepers included: board composition); "
                 "market = latest home ADP snapshot (Sleeper ids) top-150 laid onto a "
                 "10-team board. ERA MISMATCH on the market side — no archived market "
                 "ADP exists in this repo."),
        "bands": {name: {
            "room_mean_per_season": {p: round(room[name][p] / n_seasons, 1) for p in POSITIONS},
            "market_implied": {p: market[name][p] for p in POSITIONS},
        } for name, _lo, _hi in bands},
        "market_rows_unmapped": unmapped,
    }


# ═══════════════════════════════ runner ═══════════════════════════════

def parse_first_names(js_text):
    """The FIRST_NAME table from src/routes/history-data.js, read rather than
    retyped (the no-retype rule). Returns {} if the shape ever changes, and the
    artifact's provenance says which happened."""
    m = re.search(r"const FIRST_NAME = \{(.*?)\};", js_text, re.S)
    if not m:
        return {}
    return dict(re.findall(r"(\w+):\s*'([^']+)'", m.group(1)))


def latest_market_adp(adp_series):
    """Latest snapshot of the HOME adp series (draft/data/adp_series.json) —
    SLEEPER ids, joinable to league history. The D3 external archive
    (external_adp_series.json) is MFL-keyed and does NOT join; discovered by the
    all-zero market column it produced, not assumed."""
    rows = (adp_series or {}).get("series") or []
    if not rows:
        return {}
    latest = max(rows, key=lambda r: r.get("date", ""))
    return latest.get("adp") or {}


def main():
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
    first_names = parse_first_names(
        (ROOT / "src" / "routes" / "history-data.js").read_text())
    adp_home = json.loads((ROOT / "draft" / "data" / "adp_series.json").read_text())

    rows, unresolved = build_rows(history, positions, first_names)
    owners = sorted({r["owner"] for r in rows if r["owner"]})

    all_seasons = ("2023", "2024", "2025")
    signatures = {o: owner_signature(rows, all_seasons, o) for o in owners}
    reach_25, field_25, reach_n25 = reach_by_owner(rows, "2025", ("2023", "2024"))
    reach_24, field_24, reach_n24 = reach_by_owner(rows, "2024", ("2023",))
    for o in owners:
        signatures[o]["reach_room_relative"] = {
            "2024_vs_2023_proxy": reach_24.get(o),
            "2025_vs_2023_24_proxy": reach_25.get(o),
            "label": "room-relative (prior-season pick order), NOT market ADP — none archived",
        }

    # league bucket mix over ALL seasons — the shipped prior the gated engine
    # switch consumes (the owner term measured null; this is the league-level
    # correction the evidence supports). Shares per bucket, n alongside.
    _, league_counts = bucket_mix_counts(rows, all_seasons)
    league_bucket_mix = {}
    for b in ("early", "mid", "late"):
        tot = sum(league_counts.get(b, {}).values())
        league_bucket_mix[b] = {
            "share": {p: round(league_counts.get(b, {}).get(p, 0) / tot, 4) if tot else None
                      for p in POSITIONS},
            "n": tot,
        }

    events = [e for s in all_seasons for e in run_events(rows, s)]
    followed = sum(1 for e in events if e[2])
    # base rate: P(pick == p) unconditional, position-matched to the runs seen
    seq_all = [r for r in decisions(rows) if r["position"]]
    base_by_pos = {p: sum(1 for r in seq_all if r["position"] == p) / len(seq_all)
                   for p in POSITIONS}
    exp_follow = sum(base_by_pos.get(e[1], 0) for e in events)

    result = {
        "_territory": "TERRITORY: A — produced by draft/backtest/draft_behavior.py",
        "_prereg": "draft/audit/draft_behavior_2026-08-15.md §2 — fixed before any validation number",
        "provenance": {
            "source": "draft/data/league_history.json (seasons 2023-2025, main drafts)",
            "keeper_rule": ("is_keeper flag, PLUS the 2023 parallel keeper draft joined by "
                            "(roster_id, player_id) — 2023's main draft carries zero flags"),
            "n_decisions": {s: len(decisions(rows, (s,))) for s in all_seasons},
            "n_keepers": {s: sum(1 for r in rows if r["season"] == s and r["is_keeper"])
                          for s in all_seasons},
            "decisions_without_position": unresolved,
            "adp_note": ("NO era-correct market ADP on file (audit doc §1 walks every archive). "
                         "Baselines use the room's prior-season pick order, labeled."),
        },
        "owners": owners,
        "league_bucket_mix": league_bucket_mix,
        "signatures": signatures,
        "run_chasing_league": {
            "n_run_moments": len(events),
            "followed": followed,
            "follow_rate": round(followed / len(events), 4) if events else None,
            "expected_by_base_rate": round(exp_follow / len(events), 4) if events else None,
        },
        "keeper_need": keeper_need(rows),
        "league_vs_market_mass": league_vs_market_mass(
            rows, latest_market_adp(adp_home), positions),
        "stability": stability(rows, owners),
        "forward_test": forward_test(rows),
    }

    # ── POST-PREREGISTRATION DIAGNOSTICS, labeled as such ───────────────────
    # The preregistered baseline pairs the engine's market-calibrated sd
    # (0.15·adp, clamped [3,15]) with a room-proxy anchor whose real dispersion
    # is far wider — measured train-only below. That mismatch, not owner
    # modeling, could carry the headline Brier gap. These arms decompose it:
    #   robust_baseline : same truncated normal, sd = train-measured proxy sd
    #   league_mix      : the model walk with NO owner term and NO need term
    #   league_mix_need : league mix + need damping (owner term still off)
    # The owner term's true contribution = full model − league_mix_need.
    res_sd = proxy_residual_sd(rows, "2023", "2024")

    def pooled(ft_run):
        return {"survival_brier_model": ft_run["survival_brier"]["model"]["pooled"],
                "survival_brier_baseline": ft_run["survival_brier"]["baseline"]["pooled"],
                "pos_logloss_model": ft_run["next_pick_position"]["model"]["logloss"],
                "pos_top1_model": ft_run["next_pick_position"]["model"]["top1_hit"]}

    diag_robust = forward_test(rows, sd_override=res_sd)
    diag_league = forward_test(rows, use_owner=False, use_need=False)
    diag_league_need = forward_test(rows, use_owner=False, use_need=True)
    result["forward_test_diagnostics"] = {
        "_label": ("POST-PREREG, exploratory — decomposes the preregistered win; "
                   "gates nothing on its own, but the doc reads the honest story from it"),
        "train_proxy_residual_sd_2023_to_2024": round(res_sd, 2) if res_sd else None,
        "robust_baseline_sd_widened": {
            "survival_brier_baseline": diag_robust["survival_brier"]["baseline"]["pooled"],
            "model_beats_it": diag_robust["survival_brier"]["model"]["pooled"]
            < diag_robust["survival_brier"]["baseline"]["pooled"],
        },
        "ablation_league_mix_only": pooled(diag_league),
        "ablation_league_mix_plus_need": pooled(diag_league_need),
        "full_model": pooled(result["forward_test"]),
    }

    out = ROOT / "draft" / "data" / "draft_behavior.json"
    out.write_text(json.dumps(result, indent=1) + "\n")
    ft = result["forward_test"]
    st = result["stability"]
    print(f"decisions: {result['provenance']['n_decisions']}")
    print(f"survival Brier — model {ft['survival_brier']['model']['pooled']}"
          f"  baseline {ft['survival_brier']['baseline']['pooled']}"
          f"  model_beats_baseline={ft['survival_brier']['model_beats_baseline']}")
    print(f"next-pick position — model ll {ft['next_pick_position']['model']['logloss']}"
          f" hit {ft['next_pick_position']['model']['top1_hit']}"
          f"  base ll {ft['next_pick_position']['league_base']['logloss']}"
          f" hit {ft['next_pick_position']['league_base']['top1_hit']}"
          f"  wins={ft['next_pick_position']['model_beats_base_logloss']}")
    print(f"stability 2024->2025 mean rho: {st['pairs']['2024->2025']['mean_rho']}"
          f"  perm p={st['permutation']['p_two_sided'] if st['permutation'] else None}")
    print(f"wrote {out}")
    return result


if __name__ == "__main__":
    main()
