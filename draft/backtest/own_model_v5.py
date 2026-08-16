# TERRITORY: A
"""OWN MODEL v5 — the first candidate built on COMPONENT data, against the
FantasyPros bar Cory set. Built 2026-08-16, beside v2/v3/v4 (never replacing
them); promotion stays a written decision for Cory either way.

WHY v5 EXISTS — CORY'S MANDATE, VERBATIM (2026-08-16): "If V4 is still
inferior to fantasy pros projections why are we using it for anything. We need
it to be better or it's of no use? ... really dig into player projection and
different data that has been proven to work and let's keep improving it.
Player projection is the most important part of making a good model, good
draft tool, good league analyzer, good waiver tool, etc!! It's everything."
And his scope addendum, same day: "I really think we need to look at
integrating betting and things into projections ... Also pace of play is
something we should look into. Target share maybe.. let's find an edge here."

THE DATA THAT CHANGED. v2/v3/v4 read points-only stores and their autopsies
named the same absences every time: usage volume, TD counts, team history,
pre-2023 seasons. The component stores (fetch_component_stats.py, committed
2026-08-16 with provenance and parity pinned by test) close all four at once:
per-player weekly pass att/yd/TD/INT, carries/rush yd/TD, targets/rec/rec
yd/TD, team, target share — 2021 THROUGH 2025 — plus per-game Vegas closing
lines (spread/total). Component rows scored under the frozen table reproduce
the committed 2023/2024 weekly points EXACTLY, so 2021/2022 points are
computable under the same rules: the tuning basis grows from ONE usable
transition to TWO (2023 and 2024), with 2025 still held out and touched
exactly once, below.

════════════════════════════════════════════════════════════════════════════════
PREREGISTRATION — structure, constants, gates and evaluation FIXED IN THIS FILE
BEFORE THE 2025 COMPARISON WAS RUN. The commit that adds this file carries no
results artifact; model_accuracy_v5.json lands in a later commit. Commit order
is the proof — the discipline v2/v3/v4 established, unchanged.
════════════════════════════════════════════════════════════════════════════════

── INFORMATION SET, PER PREDICTION (season Y = 2025) ─────────────────────────

  · component stores of seasons ≤ Y−1 (2023, 2024): per-game volume
    (pass_att/rush_att/tgt), component sub-points (pass/rush/rec points under
    the frozen scoring table), games (row-presence), team, per-week share of
    team volume;
  · the committed weekly points stores ≤ Y−1 (the same numbers, pinned equal);
  · league position-level efficiency of Y−1 (points per attempt / carry /
    target — LEAGUE aggregates of Y−1, known before Y);
  · v4's QB availability correction, imported unchanged (weekly store ≤ Y−1);
  · the 0.7/0.3 recency blend (the baseline's own declared value);
  · the marker-gated preseason season-Y league draft + Y−1 rank→points curve
    (v3's machinery, imported — RB/WR/TE arms only);
  · season-Y WEEK 1 Vegas closing lines (they close before any season-Y game
    is played — zero realized-Y information; deeper weeks are FORBIDDEN here);
  · board ages (v2's arithmetic back-projection), the positions record.

Nothing from any season-Y game enters any feature. own_model_v2._assert_no_leak
still guards the stat side; v3's marker gate still guards the draft side.
NO FANTASY-PROVIDER INPUT: no Sleeper number, no FantasyPros number, anywhere
— v5 is the independent cross-check candidate (Arm A). The league's own draft
and public betting lines are markets, not providers, and both are
preseason-frozen on committed disk.

── v5, DEFINED ───────────────────────────────────────────────────────────────

Coverage: exactly v3's (= v2's = v4's), so the shared-population denominator
is identical to every prior artifact.

Per position, the COMPONENT OPINION (comp):

    volume/g    raw per-game Y−1 volume (pass_att_g, rush_att_g, tgt_g), OR
                share mode: mean weekly share of team volume × expected team
                volume, E[team vol] = pace_lam·team_Y−1 + (1−pace_lam)·league
                mean (pace regression; pace_lam=1 is share-at-face-value)
    xfp/g       volume/g × league Y−1 efficiency (pts/att, pts/carry, pts/tgt
                by position) — efficiency regressed to league mean, TD luck out
    rate        BETA·xfp/g + (1−BETA)·actual pts/g  (BETA=0 ⇒ pure rate)
    rate2       same from Y−2 where present; rate ← 0.7·rate + 0.3·rate2
    E[G]        GLAM·games_Y−1 + (1−GLAM)·mu_pos (mean games over position
                players with ≥ MU_MIN_GAMES games), capped at 17; QB guard:
                games < QB_MIN_G ⇒ E[G] = games (a bench profile is never
                inflated — v4's lesson, kept)
    comp        age_mult (v2's curve) · rate · E[G], then the VEGAS tilt:
                × (1 + VG·(implied_team_total_wk1 − league mean)/league mean)
                with the player's team as of his LAST Y−1 week (offseason
                movers get last year's team — a named, measured limitation)

Then the ENSEMBLE, per position — opinions (comp, anchor, market):

    anchor      QB: recency blend × v4's availability correction (imported);
                RB/WR/TE: the recency blend
    market      v3's marker-gated league-draft market (RB/WR/TE only; QB
                market stays REMOVED — v3's standing negative honored)
    drafted     W_C·comp + W_B·anchor + W_M·market
    undrafted   (W_C·comp + W_B·anchor)/(W_C+W_B)

Clamp at 0, round 2dp. Frozen constants (tuned as described below):

    pos  BETA  GLAM  volume  pace_lam  VG    (W_C, W_B, W_M)
    QB   0.00  0.50  raw     —         0.50  (0.75, 0.25, 0.00)
    RB   0.50  0.50  raw     —         0.50  (0.50, 0.00, 0.50)
    WR   0.50  0.70  share   1.00      0.50  (0.75, 0.00, 0.25)
    TE   0.25  0.70  share   0.50      0.00  (0.25, 0.25, 0.50)

    MU_MIN_GAMES 4 · QB_MIN_G 2 · rate recency 0.7/0.3 (declared, = blend's)

── HOW THE CONSTANTS WERE CHOSEN (tuning discipline, stated honestly) ────────

Grid-searched on the TWO transitions the component stores make leak-free:

    fold 2023: features 2021+2022 → realized 2023 totals
    fold 2024: features 2022+2023 → realized 2024 totals

No 2025 value was read at any point during design. Selection rule, fixed
before the search ran: a configuration QUALIFIES only if it beats BOTH
baselines (naive_prev, recency_blend) on BOTH metrics in BOTH folds, strict;
among qualifiers, maximize the minimum-across-folds MAE gain, tie-break on
minimum Spearman gain. Grids: BETA {0,.25,.5,.75,1}, GLAM {.3,.5,.7,.85,1},
volume {raw, share×pace_lam .5/.75/1}, VG {0,.25,.5}, weights on a 0.25 mesh;
QB additionally searched a started-games rate basis (weeks ≥ 8 pts), a
split-rushing-equity rate (regress passing efficiency only, rushing points at
face value), and blend-vs-blend×corr anchors. Winners re-verified under the
production definitions in this file:

    fold cells (MAE/ρ), winner vs best baseline (best of naive_prev and the
    recency blend per metric), re-verified through THIS file's code:
    QB   2023: 87.05/0.5516 vs 89.65/0.5268   2024: 72.38/0.6534 vs 72.60/0.6528
    RB   2023: 46.74/0.6265 vs 49.29/0.6226   2024: 41.87/0.7539 vs 44.58/0.7475
    WR   2023: 33.42/0.7626 vs 34.39/0.7501   2024: 37.53/0.7209 vs 40.43/0.7201
    TE   2023: 25.25/0.7478 vs 26.01/0.7340   2024: 25.76/0.7219 vs 26.73/0.7215

    (The search harness's cells differ from these in the 4th digit at RB/WR/TE
    — it pooled league efficiency over players missing from the positions
    record; production pools over the record only. Constants were frozen
    before the re-verification and did not move. Every cell above still
    qualifies under the selection rule; the thinnest margins are WR 2024 ρ
    +0.0008 and TE 2024 ρ +0.0004.)

FEATURE-ABLATION LADDER (same rule, restricted grids, FOLDS ONLY, search
harness's cells — what each data source measurably buys; min-across-folds
gains vs best baseline):

    row (cumulative)             QB              RB              WR              TE
    availability (E[G])         +0.19/−0.0170*  +0.70/−0.0107*  +0.60/+0.0025   +0.56/+0.0002
    + xFP efficiency regression  (no change)     (no change)     (no change)     (no change)
    + rushing equity/started-G   (no change)      —               —               —
    + target-share-of-team       —               (no change)     (no change)     (no change)
    + pace regression            —               (no change)    +0.67/+0.0016   (no change)
    + Vegas week-1 lines        +0.22/+0.0006   +0.28/+0.0007   +0.74/+0.0003   (no change)
    + league-draft market        —              +2.59/+0.0039   +1.02/+0.0011   +0.77/+0.0004
    (* = did not qualify: rho below the bar. "no change" = the added feature
    produced no better QUALIFYING configuration than the row above; several
    features pay only in combination — beta>0 qualifies at RB/WR/TE only once
    share/vegas/market are in the mix. QB qualifies ONLY once Vegas enters:
    exactly one qualifying configuration in the whole QB family.)

Read honestly: availability + market carry most of the fold gains; the
component-volume features pay mainly at WR (share mode) and RB (beta 0.5
inside the winner); Vegas week-1 is the difference between "no QB candidate"
and "one QB candidate", worth ~+0.2..0.7 MAE elsewhere. Pace-of-play NOTE:
the old NULL (pace, team WEEKLY scores from league history) is a different
question and is NOT re-litigated here — this is player-level volume
opportunity, tested for the first time; measured contribution at the season
grain: +0.07 MAE at WR over share-at-face, nothing elsewhere. Cory's
target-share ask has its own row: at face value it bought nothing alone at
this grain; inside the WR/TE winners share mode IS selected. The
EXP-WEEKLY-ENV context stands: perfect-foresight team game totals were worth
only ~+0.23 weekly MAE, tail-shaped — the season-grain Vegas gains above are
consistent with a small, real, non-magical signal.

Named residual risk, same class as v4's: two folds is thin; the QB fold
margins (+0.22 MAE, +0.0006 ρ) are of the same order as the noise they must
beat, and the QB qualifier is UNIQUE in its family — a one-configuration
result is fragile evidence. The 2025 arm below is one honest shot, not a
search.

── THE ≤2024 ARMS ARE DELIBERATELY ABSENT ────────────────────────────────────

Both folds were consumed by tuning, so any ≤2024 grade of v5 is in-sample.
v5's verdict rests on the single held-out season (2025), and says so.

── EVALUATION (v2's harness, v4's protocol, imported, stated again) ──────────

    graded season   2025, weeks 1-17
    population      per position, ≥1 weekly row in 2025 AND a forecast;
                    MIN_N = 10; coverage constructed equal to v3's, so the
                    shared denominator is IDENTICAL to every prior artifact
    metrics         MAE, mean signed bias, Spearman within position
    models          own_v5, own_v4, own_v3, own_v2, walk_forward_v1,
                    naive_prev, recency_blend — head-to-head, shared population
    bar 1 (REC-3)   own_v5 beats BOTH baselines at ALL FOUR positions on BOTH
                    metrics, strict. Cory-ratified; not weakened.
    bar 2 (v4)      own_v5 vs own_v4 per cell — the promotion-relevant
                    question is whether v5 beats the PROMOTED model
                    meaningfully, not only the naive baselines
    bar 3 (FP)      the REAL bar Cory named. Graded at the only granularity
                    committed FP data supports: position-level cells from
                    exp_fp_hist_proj.json (2025 h2h vs the same baseline
                    constructions, n=57/88/141/83) vs v5's cells on OUR shared
                    population (n=58/99/150/84). DIFFERENT denominators —
                    margins vs the common blend anchor are compared, absolute
                    MAEs are not, and the artifact says so. Per-player FP
                    comparison stays impossible: the archive rows were never
                    committed and api.fantasypros.com is unreachable from this
                    sandbox (probed 2026-08-16, no route).
    reproduction    every non-v5 cell must equal model_accuracy_v4.json bit
                    for bit; own_v5's cells must differ from own_v4's at every
                    position (all four arms are new constructions here —
                    identical cells would mean the build never ran)

POST-GRADE ANALYSIS carried by the artifact (never features): the
short-season-QB block — Cory's live catch on v4 was that injury-shortened
elite QBs (Lamar 8 active games, Daniels 6, Burrow 6 in 2025's data) rank
below full-season mid-tier QBs under points-only pricing; the artifact prices
every 2024-short-season QB (≤10 games, ≥15 pts/g) under v4 and v5 side by
side against realized 2025, so the mechanism's effect is inspectable player
by player.

ARM B — THE COMPOSITION CANDIDATE — IS NAMED, NOT FAKED. Providers-as-features
(Sleeper/FP columns beside these features) cannot be graded on ANY past
season from committed disk: proj_series.json begins 2026-08-09 (13 snapshots,
2026 only), the FP-archive experiment committed only position-level summaries
(per-player rows were fetched under exp33's leak rules and deliberately not
committed), and both provider APIs are unreachable from this sandbox. Its bar
(beat FP alone) first becomes measurable when the frozen 2026 proj_series is
graded in January 2027 — that grade prices Sleeper, FP, AND own_v5 on the
same 2026 season, and only then can a mixing weight be fit on evidence.

Run: python draft/backtest/own_model_v5.py
Writes draft/backtest/model_accuracy_v5.json.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))

import fetch_component_stats as FCS  # noqa: E402
from lab_projections import walk_forward  # noqa: E402
from model_accuracy_backtest import season_totals, positions_record  # noqa: E402
from own_model_v2 import (  # noqa: E402
    POSITIONS,
    _age_mult,
    _assert_no_leak,
    _baselines,
    _grade_models,
    board_ages,
    features_for,
    fit_transition,
    predict,
)
from own_model_v3 import (  # noqa: E402
    build_v3,
    draft_marker_gate,
    league_draft_picks,
    market_points,
    market_ranks,
    promotion_verdict,
    rank_curve,
)
from own_model_v4 import (  # noqa: E402
    build_v4,
    qb_active_games,
    qb_availability_correction,
    weekly_points,
)

GRADED_SEASON = 2025
PRIOR_SEASONS = (2023, 2024)
LAST_SCORED_WEEK = 17

# ── the frozen v5 configuration — see prereg above; never touched since ──────
V5_CONFIG = {
    #      beta  glam  volume   pace_lam  vg    (w_comp, w_anchor, w_market)
    "QB": {"beta": 0.00, "glam": 0.50, "volume": "raw", "pace_lam": None,
           "vg": 0.50, "weights": (0.75, 0.25, 0.00), "anchor": "blend_x_v4corr"},
    "RB": {"beta": 0.50, "glam": 0.50, "volume": "raw", "pace_lam": None,
           "vg": 0.50, "weights": (0.50, 0.00, 0.50), "anchor": "blend"},
    "WR": {"beta": 0.50, "glam": 0.70, "volume": "share", "pace_lam": 1.00,
           "vg": 0.50, "weights": (0.75, 0.00, 0.25), "anchor": "blend"},
    "TE": {"beta": 0.25, "glam": 0.70, "volume": "share", "pace_lam": 0.50,
           "vg": 0.00, "weights": (0.25, 0.25, 0.50), "anchor": "blend"},
}
MU_MIN_GAMES = 4        # availability mean is over players with ≥ this many games
QB_MIN_G = 2            # below this a QB's E[G] is his games — never inflated
RATE_RECENCY = (0.7, 0.3)   # declared — the blend's own weights, not refit
MU_G_FALLBACK = 12.0    # no eligible player at a position ⇒ declared fallback

OUT = HERE / "model_accuracy_v5.json"


# ── component features (one access path: the committed stores) ───────────────

def _sub_pts(line: dict, cfg: dict) -> tuple:
    """(pass_pts, rush_pts, rec_pts, fum_pts) of one component line under the
    frozen table — the same arithmetic the parity test pins against the
    committed weekly points."""
    p = (line.get("pass_yd", 0) * cfg.get("pass_yd", 0)
         + line.get("pass_td", 0) * cfg.get("pass_td", 0)
         + line.get("pass_int", 0) * cfg.get("pass_int", 0)
         + line.get("pass_2pt", 0) * cfg.get("pass_2pt", 0))
    r = (line.get("rush_yd", 0) * cfg.get("rush_yd", 0)
         + line.get("rush_td", 0) * cfg.get("rush_td", 0)
         + line.get("rush_2pt", 0) * cfg.get("rush_2pt", 0))
    c = (line.get("rec", 0) * cfg.get("rec", 0)
         + line.get("rec_yd", 0) * cfg.get("rec_yd", 0)
         + line.get("rec_td", 0) * cfg.get("rec_td", 0)
         + line.get("rec_2pt", 0) * cfg.get("rec_2pt", 0))
    f = line.get("fum_lost", 0) * cfg.get("fum_lost", 0)
    return p, r, c, f


def season_profiles(season: int) -> tuple[dict, dict]:
    """({pid: per-game profile}, {team: per-game volume means}) from the
    season's component store, weeks 1..17. Row-presence is the games basis —
    the store's missing-vs-zero rule."""
    cfg = FCS.frozen_scoring_table()
    cw = FCS.component_weeks(season, 1, LAST_SCORED_WEEK)
    team_wk: dict[tuple, dict] = {}
    for pid, rows in cw.items():
        for wk, line in rows.items():
            t = line.get("team")
            if not t:
                continue
            d = team_wk.setdefault((t, wk), {"tgt": 0, "rush_att": 0, "pass_att": 0})
            for k in ("tgt", "rush_att", "pass_att"):
                d[k] += line.get(k, 0)
    team_g: dict[str, dict] = {}
    for (t, _wk), d in team_wk.items():
        a = team_g.setdefault(t, {"tgt": 0.0, "rush_att": 0.0, "pass_att": 0.0, "n": 0})
        for k in ("tgt", "rush_att", "pass_att"):
            a[k] += d[k]
        a["n"] += 1
    for a in team_g.values():
        for k in ("tgt", "rush_att", "pass_att"):
            a[k] /= a["n"]

    out = {}
    for pid in sorted(cw):
        rows = cw[pid]
        g = len(rows)
        agg = {"pass_att": 0.0, "rush_att": 0.0, "tgt": 0.0,
               "pass_pts": 0.0, "rush_pts": 0.0, "rec_pts": 0.0, "fum_pts": 0.0}
        shares = {"tgt": [], "rush_att": []}
        team = None
        for wk in sorted(rows):
            line = rows[wk]
            pp, rp, cp, fp = _sub_pts(line, cfg)
            agg["pass_pts"] += pp
            agg["rush_pts"] += rp
            agg["rec_pts"] += cp
            agg["fum_pts"] += fp
            for k in ("pass_att", "rush_att", "tgt"):
                agg[k] += line.get(k, 0)
            t = line.get("team")
            if t and (t, wk) in team_wk:
                for k in ("tgt", "rush_att"):
                    tv = team_wk[(t, wk)][k]
                    if tv > 0:
                        shares[k].append(line.get(k, 0) / tv)
            team = t or team
        out[pid] = {
            "games": g, "team": team,
            "pass_att_g": agg["pass_att"] / g, "rush_att_g": agg["rush_att"] / g,
            "tgt_g": agg["tgt"] / g,
            "pts_g": (agg["pass_pts"] + agg["rush_pts"] + agg["rec_pts"]
                      + agg["fum_pts"]) / g,
            "share_tgt": (sum(shares["tgt"]) / len(shares["tgt"])
                          if shares["tgt"] else 0.0),
            "share_rush": (sum(shares["rush_att"]) / len(shares["rush_att"])
                           if shares["rush_att"] else 0.0),
        }
    return out, team_g


def league_efficiency(profiles: dict, positions: dict) -> dict:
    """{pos: {eff_pass, eff_rush, eff_tgt}} — LEAGUE totals, per position.
    Regressing a player's efficiency toward these is the xFP move: volume is
    the player's, points-per-unit start from everybody's."""
    cfg = FCS.frozen_scoring_table()  # noqa: F841 — profiles already priced
    acc = {p: {"pp": 0.0, "pa": 0.0, "rp": 0.0, "ra": 0.0, "cp": 0.0, "tg": 0.0}
           for p in POSITIONS}
    for pid, f in profiles.items():
        pos = positions.get(pid)
        if pos not in POSITIONS:
            continue
        g = f["games"]
        acc[pos]["pa"] += f["pass_att_g"] * g
        acc[pos]["ra"] += f["rush_att_g"] * g
        acc[pos]["tg"] += f["tgt_g"] * g
    # sub-point pools need a second pass at the weekly grain — cheaper to
    # reconstruct from profiles: pts split is not stored per player, so pool
    # via the sub-point per-game fields
    for pid, f in profiles.items():
        pos = positions.get(pid)
        if pos not in POSITIONS:
            continue
        g = f["games"]
        acc[pos]["pp"] += f.get("pass_pts_g", 0.0) * g
        acc[pos]["rp"] += f.get("rush_pts_g", 0.0) * g
        acc[pos]["cp"] += f.get("rec_pts_g", 0.0) * g
    out = {}
    for p, a in acc.items():
        out[p] = {"eff_pass": a["pp"] / a["pa"] if a["pa"] else 0.0,
                  "eff_rush": a["rp"] / a["ra"] if a["ra"] else 0.0,
                  "eff_tgt": a["cp"] / a["tg"] if a["tg"] else 0.0}
    return out


def league_team_means(team_g: dict) -> dict:
    n = len(team_g)
    return {k: sum(t[k] for t in team_g.values()) / n
            for k in ("tgt", "rush_att", "pass_att")}


def _availability_mean(profiles: dict, positions: dict) -> dict:
    mu = {}
    for p in POSITIONS:
        el = [f["games"] for pid, f in profiles.items()
              if positions.get(pid) == p and f["games"] >= MU_MIN_GAMES]
        mu[p] = sum(el) / len(el) if el else MU_G_FALLBACK
    return mu


def expected_games(pos: str, games: int, mu: float) -> float:
    """E[G] under the frozen config: availability regressed toward the
    position mean, capped at 17; a short-bench QB (games < QB_MIN_G) keeps his
    own games — a bench profile is never inflated (v4's lesson, kept)."""
    if pos == "QB" and games < QB_MIN_G:
        return float(games)
    c = V5_CONFIG[pos]
    return min(17.0, c["glam"] * games + (1 - c["glam"]) * mu)


def comp_opinion(target_season: int, prior_seasons: tuple, positions: dict,
                 ages_2026: dict, vegas_imp: dict) -> dict:
    """The component opinion for every QB/RB/WR/TE with a Y−1 profile, under
    the frozen V5_CONFIG. Floats (rounding happens at the ensemble)."""
    _assert_no_leak(prior_seasons, target_season)
    y1 = max(prior_seasons)
    y2 = min(prior_seasons) if len(prior_seasons) > 1 else None
    f1, team_g1 = season_profiles(y1)
    f2 = season_profiles(y2)[0] if y2 is not None else {}
    # sub-point per-game fields for efficiency pooling
    _attach_sub_rates(y1, f1)
    if f2:
        _attach_sub_rates(y2, f2)
    eff = league_efficiency(f1, positions)
    tmeans = league_team_means(team_g1)
    mu_g = _availability_mean(f1, positions)
    mean_imp = (sum(vegas_imp.values()) / len(vegas_imp)) if vegas_imp else None

    def rate(f: dict, pos: str) -> float:
        c = V5_CONFIG[pos]
        e = eff[pos]
        if c["volume"] == "share":
            pl = c["pace_lam"]
            tg = team_g1.get(f["team"]) if f["team"] else None
            et = (pl * tg["tgt"] + (1 - pl) * tmeans["tgt"]) if tg else tmeans["tgt"]
            er = (pl * tg["rush_att"] + (1 - pl) * tmeans["rush_att"]) if tg else tmeans["rush_att"]
            tgt_g, rush_g = f["share_tgt"] * et, f["share_rush"] * er
        else:
            tgt_g, rush_g = f["tgt_g"], f["rush_att_g"]
        xfp = (f["pass_att_g"] * e["eff_pass"] + rush_g * e["eff_rush"]
               + tgt_g * e["eff_tgt"])
        return c["beta"] * xfp + (1 - c["beta"]) * f["pts_g"]

    out = {}
    for pid in sorted(f1):
        pos = positions.get(pid)
        if pos not in POSITIONS:
            continue
        c = V5_CONFIG[pos]
        f = f1[pid]
        r = rate(f, pos)
        f2p = f2.get(pid)
        if f2p:
            r = RATE_RECENCY[0] * r + RATE_RECENCY[1] * rate(f2p, pos)
        eg = expected_games(pos, f["games"], mu_g[pos])
        age = ages_2026.get(pid)
        age_y = (float(age) - (2026 - target_season)) if age is not None else None
        v = _age_mult(pos, age_y) * r * eg
        if c["vg"] and mean_imp and f["team"] in vegas_imp:
            v *= 1.0 + c["vg"] * (vegas_imp[f["team"]] - mean_imp) / mean_imp
        out[pid] = max(0.0, v)
    return out


def _attach_sub_rates(season: int, profiles: dict) -> None:
    """Adds pass_pts_g / rush_pts_g / rec_pts_g to profiles in place (needed
    for efficiency pooling; kept out of season_profiles' return contract)."""
    cfg = FCS.frozen_scoring_table()
    cw = FCS.component_weeks(season, 1, LAST_SCORED_WEEK)
    for pid, f in profiles.items():
        rows = cw.get(pid) or {}
        pp = rp = cp = 0.0
        for line in rows.values():
            a, b, c, _ = _sub_pts(line, cfg)
            pp += a
            rp += b
            cp += c
        g = f["games"] or 1
        f["pass_pts_g"], f["rush_pts_g"], f["rec_pts_g"] = pp / g, rp / g, cp / g


# ── the ensemble ─────────────────────────────────────────────────────────────

def build_v5(coverage: dict, comp: dict, blend: dict, corr: dict, mrank: dict,
             curve: dict, positions: dict) -> dict:
    """v5 over exactly `coverage`'s keys (v3's coverage — the shared
    denominator). A pid without a component profile prices through the anchor
    at full weight (declared fallback; measured zero such pids on the real
    stores). Deterministic order, clamp 0, round 2dp."""
    out = {}
    for pid in sorted(coverage):
        pos = positions.get(pid)
        if pos not in POSITIONS:
            continue
        c = V5_CONFIG[pos]
        wc, wb, wm = c["weights"]
        b = blend.get(pid, coverage[pid])
        if c["anchor"] == "blend_x_v4corr":
            b = b * corr.get(pid, 1.0)
        cv = comp.get(pid)
        entry = mrank.get(pid)
        if entry is not None and entry[0] == pos and wm > 0:
            if cv is None:
                s = wb + wm
                v = (wb * b + wm * market_points(curve, pos, entry[1])) / s if s \
                    else market_points(curve, pos, entry[1])
            else:
                v = wc * cv + wb * b + wm * market_points(curve, pos, entry[1])
        else:
            if cv is None:
                v = b
            else:
                s = wc + wb
                v = (wc * cv + wb * b) / s if s else cv
        out[pid] = round(max(0.0, v), 2)
    return out


# ── post-grade analysis (never features) ─────────────────────────────────────

def short_season_qb_block(v4_pred: dict, v5_pred: dict, positions: dict,
                          actual: dict) -> list:
    """Cory's live catch, made inspectable: every QB whose 2024 was short
    (≤10 games) but elite-rate (≥15 pts/g), priced by v4 and v5 against
    realized 2025."""
    f1, _ = season_profiles(max(PRIOR_SEASONS))
    rows = []
    for pid in sorted(f1):
        if positions.get(pid) != "QB":
            continue
        f = f1[pid]
        if f["games"] <= 10 and f["pts_g"] >= 15.0:
            rows.append({
                "player_id": pid, "games_2024": f["games"],
                "pts_per_game_2024": round(f["pts_g"], 2),
                "own_v4": v4_pred.get(pid), "own_v5": v5_pred.get(pid),
                "realized_2025": actual.get(pid),
            })
    return rows


def fp_context_block() -> dict:
    """The FP bar at the only committed granularity — position-level 2025
    cells from exp_fp_hist_proj.json, quoted with the population caveat."""
    doc = json.loads((HERE / "exp_fp_hist_proj.json").read_text())
    h2h = doc["years"]["2025"]["metrics"]["head_to_head_shared_population"]
    return {
        "caveat": ("FP cells are graded on FP's OWN shared population "
                   "(n=57/88/141/83 — players FP projected AND both baselines "
                   "cover), v5's on OURS (n=58/99/150/84). Absolute MAEs are "
                   "not comparable across the two; margins vs the common "
                   "recency-blend anchor are the honest comparison, and even "
                   "those carry a population caveat. Per-player FP comparison "
                   "is impossible from committed disk: the archive rows were "
                   "never committed and api.fantasypros.com is unreachable "
                   "from this sandbox (probed 2026-08-16)."),
        "fp_2025_cells": {pos: h2h[pos] for pos in POSITIONS},
    }


def provider_history_audit() -> dict:
    """Arm B's blocker, measured not asserted: what per-player provider data
    exists on committed disk for past seasons."""
    ps = json.loads((HERE.parent / "data" / "proj_series.json").read_text())
    dates = sorted({e.get("date") for e in ps.get("series", [])})
    return {
        "proj_series": {"snapshots": len(ps.get("series", [])),
                        "first_date": dates[0] if dates else None,
                        "last_date": dates[-1] if dates else None,
                        "seasons_covered": "2026 only"},
        "fp_archive": ("exp_fp_hist_proj.json committed position-level summary "
                       "cells only; per-player rows were fetched under exp33's "
                       "leak rules and deliberately not committed"),
        "api_reachability_2026_08_16": {"api.fantasypros.com": "no route",
                                        "api.sleeper.app": "no route"},
        "consequence": ("Arm B (providers as features) is ungradeable on any "
                        "past season; its bar — beat FP alone — first becomes "
                        "measurable at the January 2027 grade of the frozen "
                        "2026 proj_series, which prices Sleeper, FP and own_v5 "
                        "on the same season"),
    }


# ── the run ──────────────────────────────────────────────────────────────────

def run() -> dict:
    positions = positions_record()
    ages = board_ages()

    # v2 → v3 → v4, through their own unchanged code paths (v4's run(), inlined
    # so the intermediate predictions are reusable here).
    feat_fit = features_for(2024, (2023,), positions, ages)
    fits = fit_transition(feat_fit, season_totals(2024)[0])
    feat_2025 = features_for(GRADED_SEASON, PRIOR_SEASONS, positions, ages)
    v2_2025 = predict(feat_2025, fits)

    base = _baselines(GRADED_SEASON, PRIOR_SEASONS)
    blend = base["recency_blend"]

    _assert_no_leak(PRIOR_SEASONS, GRADED_SEASON)
    picks = league_draft_picks(GRADED_SEASON)
    curve = rank_curve(max(PRIOR_SEASONS), positions)
    mrank = market_ranks(picks, positions)

    actual_2025 = season_totals(GRADED_SEASON)[0]
    gate = draft_marker_gate(picks, actual_2025, positions)
    if gate["status"] != "ok":
        doc = {
            "_territory": "TERRITORY: A — produced by draft/backtest/own_model_v5.py",
            "status": "no_markers",
            "why": ("the season-2025 league draft shows no dead top pick — "
                    "cannot prove it is preseason-frozen, and v5 carries "
                    "market-bearing RB/WR/TE arms, so nothing is graded. "
                    "Refusal is the artifact."),
            "gate": gate,
        }
        OUT.write_text(json.dumps(doc, indent=1))
        return doc

    v3_2025 = build_v3(v2_2025, blend, mrank, curve, positions)

    wk_y1 = weekly_points(max(PRIOR_SEASONS))
    acts = qb_active_games(wk_y1, positions)
    corr, mu_g_v4 = qb_availability_correction(acts)
    v4_2025 = build_v4(v3_2025, blend, corr, positions)

    # ── the v5 construction ──────────────────────────────────────────────────
    vegas_imp = FCS.implied_team_totals(GRADED_SEASON, 1, 1)
    comp = comp_opinion(GRADED_SEASON, PRIOR_SEASONS, positions, ages, vegas_imp)
    v5_2025 = build_v5(v3_2025, comp, blend, corr, mrank, curve, positions)
    comp_missing = sorted(set(v3_2025) - set(comp))

    prior_pts, prior_games = {}, {}
    for y in PRIOR_SEASONS:
        prior_pts[y], prior_games[y] = season_totals(y)
    v1_2025 = walk_forward(GRADED_SEASON, prior_pts, prior_games, positions, ages={})

    models = {"own_v5": v5_2025, "own_v4": v4_2025, "own_v3": v3_2025,
              "own_v2": v2_2025, "walk_forward_v1": v1_2025,
              "naive_prev": base["naive_prev"], "recency_blend": blend}
    arm = _grade_models(models, GRADED_SEASON, positions)
    h2h = arm["head_to_head_shared_population"]
    verdict = promotion_verdict(h2h, candidate="own_v5")

    vs_v4 = {}
    for pos in POSITIONS:
        row = h2h.get(pos) or {}
        if row.get("status") != "measured":
            vs_v4[pos] = {"status": "unmeasurable"}
            continue
        vs_v4[pos] = {
            "own_v5": row["own_v5"], "own_v4": row["own_v4"],
            "mae_delta_vs_v4": round(row["own_v5"]["mae"] - row["own_v4"]["mae"], 2),
            "spearman_delta_vs_v4": round(row["own_v5"]["spearman"]
                                          - row["own_v4"]["spearman"], 4),
            "beats_v4_both_metrics": bool(
                row["own_v5"]["mae"] < row["own_v4"]["mae"]
                and row["own_v5"]["spearman"] > row["own_v4"]["spearman"]),
        }

    return {
        "_territory": "TERRITORY: A — produced by draft/backtest/own_model_v5.py",
        "_note": ("Own-model v5 (component-data candidate: usage volume, xFP "
                  "efficiency regression, share-of-team volume, availability "
                  "regression, Vegas week-1 tilt, marker-gated league market) "
                  "vs v4, v3, v2, v1 and both naive baselines, leak-free, "
                  "under the exact v2-v4 protocol. Structure, constants, gates "
                  "and evaluation were PREREGISTERED in own_model_v5.py and "
                  "committed before this artifact existed — commit order is "
                  "the proof. Promotion stays gated regardless of the verdict."),
        "preregistration": "own_model_v5.py module docstring (committed first)",
        "status": "graded",
        "graded_season": GRADED_SEASON,
        "prior_seasons": list(PRIOR_SEASONS),
        "information_set": ("component stores ≤2024 (volume, sub-points, team, "
                            "shares), weekly points stores ≤2024, league "
                            "efficiency of 2024, v4's QB availability "
                            "correction, the 0.7/0.3 blend, the marker-gated "
                            "2025 league draft + 2024 curve (RB/WR/TE), 2025 "
                            "WEEK-1 Vegas closing lines, board ages, the "
                            "positions record. No fantasy-provider input. "
                            "Nothing from any 2025 game."),
        "marker_gate": gate,
        "v5_config": {pos: dict(V5_CONFIG[pos],
                                weights=list(V5_CONFIG[pos]["weights"]))
                      for pos in POSITIONS},
        "v5_constants": {"mu_min_games": MU_MIN_GAMES, "qb_min_g": QB_MIN_G,
                         "rate_recency": list(RATE_RECENCY),
                         "mu_g_fallback": MU_G_FALLBACK,
                         "v4_corr_mu_g_2024": round(mu_g_v4, 4)
                         if mu_g_v4 is not None else None},
        "coverage": {"v5_forecasts": len(v5_2025),
                     "identical_to_v3": sorted(v5_2025) == sorted(v3_2025),
                     "component_profile_missing": comp_missing},
        "arms_2023_2024": ("deliberately absent: both folds were consumed by "
                           "tuning (the grid search and the ablation ladder in "
                           "the prereg), so any ≤2024 grade of v5 is in-sample "
                           "— reporting one would manufacture a flattering "
                           "second sample"),
        "fp_bar": fp_context_block(),
        "arm_b_provider_history": provider_history_audit(),
        "short_season_qb_2024": short_season_qb_block(v4_2025, v5_2025,
                                                      positions, actual_2025),
        "arm_2025": dict(arm, graded_season=GRADED_SEASON,
                         prior_seasons=list(PRIOR_SEASONS),
                         mode="component ensemble (frozen V5_CONFIG)"),
        "promotion_bar": verdict,
        "vs_own_v4": vs_v4,
    }


def main() -> None:
    doc = run()
    OUT.write_text(json.dumps(doc, indent=1))
    print(f"wrote {OUT.name}")
    if doc.get("status") != "graded":
        print(f"status: {doc.get('status')} — refused, nothing graded")
        return
    h = doc["arm_2025"]["head_to_head_shared_population"]
    print("2025 arm, shared population (MAE / Spearman):")
    for pos in POSITIONS:
        row = h.get(pos) or {}
        if row.get("status") != "measured":
            print(f"  {pos}: unmeasurable")
            continue
        cells = "  ".join(
            f"{m}={row[m]['mae']}/{row[m]['spearman']}"
            for m in ("own_v5", "own_v4", "naive_prev", "recency_blend"))
        print(f"  {pos} (n={row['n']}): {cells}")
    print(f"REC-3 bar clears: {doc['promotion_bar']['clears']}")
    print("vs own_v4:", {p: doc["vs_own_v4"][p].get("beats_v4_both_metrics")
                         for p in POSITIONS})


if __name__ == "__main__":
    main()
