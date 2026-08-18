# TERRITORY: A
"""THE 6-POINT-PASSING-TD ARBITRAGE, TAKEN ALL THE WAY TO A PICK NUMBER.

THE THING THAT LOOKS LIKE AN EDGE. `provenance.projections.scoring_gap_vs_adp_market`
on the shipped board records that the ADP feed pricing this draft is built on a
4-point passing touchdown and a −1 interception, while this league pays 6 and −2:

    top-12 QB   n=12   mean_gap_points 43.67   mean_ours 354.89
    RB WR TE K DEF     mean_gap 0.0 at every position

Forty-four points of value on every startable quarterback that the market pricing
our board does not see, and nothing else on the board affected. Read as points, it
is the largest single mispricing anywhere in this artifact.

WHY IT IS NOT AN EDGE, AND WHY THAT IS ARITHMETIC RATHER THAN AN OPINION. A pick
does not buy points, it buys points ABOVE THE PLAYER YOU COULD HAVE HAD INSTEAD.
Replacement level is a function of the scoring table and must be recomputed under
each — the replacement quarterback throws touchdowns too. So:

    VORP_ours(q) − VORP_market(q) = [pts_ours(q) − R_ours] − [pts_mkt(q) − R_mkt]
                                  = gap(q) − gap(R)

The 43.67 is the LEVEL of gap(·). VORP subtracts the level. What survives is only
the DISPERSION — how much more this quarterback's passing-touchdown volume exceeds
the replacement quarterback's — and dispersion across starting QBs is small.

    THE HEADLINE NUMBER IS THE ONE QUANTITY THAT CANNOT MOVE A PICK.
    Any measurement of this gap that does not subtract gap(R) is measuring a
    level shift and reporting it as an edge.

THE IDENTITY, so the whole thing is checkable by hand. Only two scoring terms
differ, so for any stat line:

    gap = (6−4)·pass_td + (−2−(−1))·pass_int = 2·pass_td − 1·pass_int

`gap_identity` asserts this against the shipped scorer on the committed raw rows
rather than trusting it.

WHAT IS AND IS NOT RECOVERABLE HERE, stated up front because it bounds every
per-player claim below. `lab_scoring_gap`'s docstring is right: a built board
carries only already-scored points, so per-player gaps are NOT recoverable from
`public/draft_data.json`. Exactly two 2026 quarterbacks have their raw provider
stat line committed anywhere on this branch — `draft/audit/rule12_statlines.json`,
captured for a different audit — and by luck they are the two that matter most:

    Josh Allen      27 pass_td, 10 int → gap 44.0   proj 405.50  (QB1)
    Trevor Lawrence 26 pass_td, 12 int → gap 40.0   proj 343.42  (QB9)

The QB replacement line on the shipped board is 341.72. **Lawrence sits 1.70
points above it** — he is, to within a rounding error, the replacement
quarterback. So gap(R) ≈ 40.0 is not an assumption, it is a measurement, and

    dVORP(Josh Allen) = 44.0 − 40.0 = +4.0 points, against a VORP of 63.78.

Every other quarterback's gap is UNMEASURED on this branch. This module therefore
refuses to publish a per-QB point estimate it cannot source, and inverts the
question instead into one the board CAN answer without any unavailable input:

    `breakeven_table` — for each QB, how large would his dVORP have to be to
    justify moving him one round earlier, and how many passing touchdowns over
    the replacement QB that implies.

That is a break-even, not a forecast. It needs no per-player projection, it is
computed entirely from the shipped board, and a reader can compare it against any
passing-TD estimate they trust.

WHICH SHIPPED MACHINERY IS REUSED, AND WHERE. The 2026 arm is pure algebra on the
already-built board — `gap(q) − gap(R)` needs no VORP solver, because the board's
`replacement_points["QB"]` IS the solved replacement level and re-solving it would
only re-derive a number already published. The HISTORICAL arm does need a solver,
and calls `vorp.replacement_levels` — the shipped one, with the league's own
starter counts and FLEX allocation — rather than a private re-implementation.
`lab_scoring_gap.market_scoring` is imported for the market table so the two
studies cannot drift apart on what "the market's scoring" means.

PRIOR ART, ACKNOWLEDGED RATHER THAN REDISCOVERED. This is not new ground.
`lab_scoring_gap.py` is the measurement that produced the provenance line above.
`nflverse_qb_scoring.py` already names this exact trap in its own docstring
("most of the naive version of this measurement is that omission: it hands back
the raw scoring difference wearing a VORP label"). On the unmerged relay branch,
`exp_scoring_gap_correction.py` and `draft/audit/scoring_gap_correction_backtest_
2026-08-15.md` already backtested a VORP-based correction and priced every
decision it would have flipped at $0.00. What this file adds is the check that
record asked for and could not do: it uses EXACTLY MEASURED raw stat lines
instead of a `share × proj_mean` approximation, and it converts the answer into a
break-even a drafter can hold at the table.

Run: python draft/backtest/qb_scoring_arbitrage.py
     python -m pytest draft/tests/test_qb_scoring_arbitrage.py -q
Writes draft/backtest/qb_scoring_arbitrage.json.
Verdict: draft/audit/qb_scoring_arbitrage_2026-08-16.md

Historical arm is PRE-REGISTERED in draft/backtest/QB-ARBITRAGE-PREREG.md, in an
earlier commit. Read it before reading the `historical` block of the output.
"""
from __future__ import annotations

import json
import math
import random
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
for _p in (str(HERE), str(HERE.parent)):
    if _p not in sys.path:
        sys.path.insert(0, _p)

from scoring import score_stat_line  # noqa: E402
from vorp import replacement_levels  # noqa: E402
from backtest.lab_scoring_gap import MARKET_OVERRIDES, market_scoring  # noqa: E402

BOARD = ROOT / "public" / "draft_data.json"
RULE12 = ROOT / "draft" / "audit" / "rule12_statlines.json"
HISTORY = ROOT / "draft" / "data" / "league_history.json"
POSITIONS = ROOT / "draft" / "data" / "player_positions.json"
WEEKLY = ROOT / "draft" / "backtest" / "nflverse_weekly_points_{season}.json"
OUT = HERE / "qb_scoring_arbitrage.json"

#: NFL weeks 19–22 exist in the weekly store (postseason) and score no fantasy
#: points in this league. Summing them would credit four teams' quarterbacks with
#: a month of production nobody could start.
REG_SEASON_WEEKS = range(1, 19)

SEASONS = (2023, 2024, 2025)

#: A round in this league. Used only to express slot movement in the unit Cory
#: reads at the table; nothing downstream depends on it.
TEAMS = 10


# ── PART 0 · the identity everything else rests on ───────────────────────────

def gap_identity(pass_td: float, pass_int: float) -> float:
    """Points our scoring adds to a stat line versus the market's, in closed form.

    Only two terms differ between the tables, so the gap is linear in exactly two
    stats and independent of everything else a quarterback does. That is WHY a
    rushing quarterback gains least: his rushing yards and rushing touchdowns are
    scored identically in both worlds and contribute nothing to this number.
    """
    return 2.0 * float(pass_td) - 1.0 * float(pass_int)


def gap_from_stat_line(stats: dict, scoring: dict) -> float:
    """The same gap, computed the slow way — through the SHIPPED scorer, twice.

    Kept beside `gap_identity` so the closed form is checked against the tool it
    claims to summarise instead of being asserted. A private re-derivation that
    silently disagrees with `score_stat_line` is the failure mode this pair exists
    to make impossible.
    """
    return round(score_stat_line(stats, scoring)
                 - score_stat_line(stats, market_scoring(scoring)), 2)


# ── PART 1 · restating the board under both scorings ─────────────────────────

def measured_qb_gaps(rule12: dict) -> list[dict]:
    """Every 2026 quarterback whose RAW projected stat line is committed anywhere.

    There are two. This function does not estimate, interpolate or fill; a
    quarterback with no committed raw row is absent from the result and counted by
    the caller, because a gap inferred from a position-level average is exactly the
    quantity this whole module is arguing against.
    """
    out = []
    for pid, row in (rule12.get("players") or {}).items():
        pr = row.get("projection_row") or {}
        if "pass_td" not in pr:
            continue
        out.append({
            "player_id": str(pid),
            "name": row.get("name"),
            "pass_td": pr.get("pass_td"),
            "pass_int": pr.get("pass_int", 0.0),
            "gap": gap_identity(pr.get("pass_td"), pr.get("pass_int", 0.0)),
        })
    return sorted(out, key=lambda r: -r["gap"])


def qb_board(board: dict) -> list[dict]:
    """Board quarterbacks, best projection first, with the fields a pick needs."""
    qbs = [p for p in board["players"] if p.get("position") == "QB"
           and p.get("proj_mean") is not None]
    qbs.sort(key=lambda p: -p["proj_mean"])
    return qbs


def replacement_qb_proxy(board: dict, measurable_ids=None) -> dict:
    """The QB replacement line, and the nearest quarterback we can actually measure.

    The replacement QB is a POINTS LEVEL, not a person — `replacement_points["QB"]`
    is the projection of the next quarterback off the board once every team has
    started one, and on this board it sits exactly on QB10 by construction. To use
    a MEASURED gap as gap(R) we need a real player at that level whose raw stat line
    is committed, and `measurable_ids` restricts the search to those.

    The distance is reported, not hidden, because the whole substitution rests on it:
    a proxy 1.7 points off the line is a measurement, a proxy 40 points off is a
    guess wearing a measurement's name, and the reader has to be able to tell which
    one they were handed.
    """
    level = board["replacement"]["replacement_points"]["QB"]
    qbs = qb_board(board)
    on_the_line = min(qbs, key=lambda p: abs(p["proj_mean"] - level))
    pool = qbs
    if measurable_ids is not None:
        want = {str(x) for x in measurable_ids}
        pool = [q for q in qbs if str(q["player_id"]) in want] or qbs
    nearest = min(pool, key=lambda p: abs(p["proj_mean"] - level))
    return {"replacement_points": level,
            "qb_on_the_line": on_the_line["name"],
            "qb_on_the_line_proj": on_the_line["proj_mean"],
            "nearest_qb": nearest["name"],
            "nearest_qb_id": str(nearest["player_id"]),
            "nearest_proj_mean": nearest["proj_mean"],
            "distance_points": round(nearest["proj_mean"] - level, 2),
            "restricted_to_measured_raw_rows": measurable_ids is not None}


# ── PART 2/3 · the survival test, and points turned into picks ───────────────

def dvorp(gap_player: float, gap_replacement: float) -> float:
    """What the arbitrage is worth AFTER replacement — the only number that pays.

    This is the whole of question 3 in one line. If it is near zero the edge is an
    illusion of looking at raw points, and no amount of care downstream recovers it.
    """
    return round(float(gap_player) - float(gap_replacement), 2)


def ranks_after_qb_bonus(board: dict, bonus: float) -> dict:
    """Overall rank of every player when EVERY quarterback gains `bonus` VORP.

    Ranks are recomputed over the whole board, not just the quarterbacks: moving a
    QB up means moving somebody else down, and a table that showed only the QB side
    would be describing a board that does not exist.
    """
    rows = [dict(p) for p in board["players"] if p.get("vorp") is not None]
    for p in rows:
        if p["position"] == "QB":
            p["vorp"] = p["vorp"] + bonus
    # Sort under the ordering convention THE BOARD ITSELF USES, detected from
    # the artifact rather than assumed. Boards built after Cory's 2026-08-17
    # ruling demote K/DEF below every skill position (vorp.py's
    # ONESIE_POSITIONS sort); boards built before it rank raw -vorp. A raw
    # sort against a demoted board fails the zero-bonus identity by one at
    # every player straddling a demoted onesie (run 32035071758: Mike Evans
    # 36 vs the board's 35 — the LA Rams DEF sat between them), and a
    # demoted sort against a pre-ruling board fails the same way in reverse,
    # so the convention must come from the data being reproduced.
    onesie = ("K", "DEF")
    ranked = [p for p in rows if p.get("overall_rank")]
    onesie_ranks = [p["overall_rank"] for p in ranked if p["position"] in onesie]
    skill_ranks = [p["overall_rank"] for p in ranked if p["position"] not in onesie]
    demoted = (bool(onesie_ranks) and bool(skill_ranks)
               and min(onesie_ranks) > max(skill_ranks))
    if demoted:
        rows.sort(key=lambda p: (p.get("position") in onesie, -p["vorp"]))
    else:
        rows.sort(key=lambda p: -p["vorp"])
    return {str(p["player_id"]): i for i, p in enumerate(rows, 1)}


def slots_moved(board: dict, bonus: float, player_ids=None) -> list[dict]:
    """How many picks earlier each quarterback is worth taking, given `bonus`.

    POSITIVE means earlier. Expressed in picks and in rounds, because a number of
    picks is what a drafter compares against his own next selection and a number of
    rounds is what he remembers.
    """
    base = {str(p["player_id"]): p["overall_rank"]
            for p in board["players"] if p.get("overall_rank")}
    moved = ranks_after_qb_bonus(board, bonus)
    qbs = qb_board(board)
    if player_ids is not None:
        want = {str(x) for x in player_ids}
        qbs = [q for q in qbs if str(q["player_id"]) in want]
    out = []
    for q in qbs:
        pid = str(q["player_id"])
        if pid not in base or pid not in moved:
            continue
        d = base[pid] - moved[pid]
        out.append({"player_id": pid, "name": q["name"], "adp": q.get("adp"),
                    "proj_mean": q["proj_mean"], "vorp": q.get("vorp"),
                    "rank_before": base[pid], "rank_after": moved[pid],
                    "slots_earlier": d, "rounds_earlier": round(d / TEAMS, 2)})
    return out


def breakeven_bonus(board: dict, player_id: str, want_slots: int,
                    hi: float = 200.0, tol: float = 0.01) -> float | None:
    """Smallest uniform QB VORP bonus that moves this quarterback `want_slots` up.

    Bisection on a monotone step function: adding VORP to every quarterback can
    only move a given quarterback up or leave him, never down, so the smallest
    sufficient bonus is well defined. Returns None if `hi` does not reach the
    target — a refusal, not a clamp, because a clamped break-even reads as an
    achievable one.
    """
    pid = str(player_id)
    base = {str(p["player_id"]): p["overall_rank"]
            for p in board["players"] if p.get("overall_rank")}
    if pid not in base:
        return None
    target = base[pid] - int(want_slots)

    def reaches(b):
        return ranks_after_qb_bonus(board, b).get(pid, 10 ** 6) <= target

    if not reaches(hi):
        return None
    lo = 0.0
    if reaches(lo):
        return 0.0
    while hi - lo > tol:
        mid = (lo + hi) / 2.0
        if reaches(mid):
            hi = mid
        else:
            lo = mid
    # ROUND UP, NOT TO NEAREST. `hi` is the smallest bonus known to clear the bar;
    # `round(hi, 2)` can land BELOW it and quote a break-even that does not in fact
    # break even. Caught by test_BREAKEVEN_ACTUALLY_ACHIEVES_THE_MOVE_IT_QUOTES,
    # which found Josh Allen's quoted figure moving him 9 slots against the 10 it
    # promised. A break-even reported a cent light is a wrong number, not a tight one.
    return math.ceil(hi * 100.0) / 100.0


def breakeven_table(board: dict, top: int = 12, want_slots: int = TEAMS) -> list[dict]:
    """The deliverable that needs no unavailable input.

    For each of the top quarterbacks: the dVORP required to justify taking him one
    round earlier than the board already says, and — through the identity — the
    passing-touchdown edge over the replacement quarterback that would produce it.
    `pass_td_edge_needed` assumes interceptions equal at replacement, which is the
    ASSUMPTION-FREE direction: a quarterback who throws FEWER interceptions than
    replacement needs even fewer extra touchdowns, so this figure is if anything
    generous to the arbitrage thesis.
    """
    rows = []
    for q in qb_board(board)[:top]:
        need = breakeven_bonus(board, q["player_id"], want_slots)
        rows.append({
            "name": q["name"],
            "pos_rank": q.get("pos_rank"),
            "adp": q.get("adp"),
            "proj_mean": q["proj_mean"],
            "vorp": q.get("vorp"),
            "overall_rank": q.get("overall_rank"),
            "dvorp_needed_for_one_round": need,
            "pass_td_edge_needed_over_replacement": (
                round(need / 2.0, 1) if need is not None else None),
        })
    return rows


# ── PART 5 · the historical arm (pre-registered; see QB-ARBITRAGE-PREREG.md) ──

def _load_weekly_totals(season: int) -> tuple[dict, dict]:
    """{player_id: realized regular-season points} for one season, plus the table.

    Weeks are filtered to REG_SEASON_WEEKS. The store's own scoring stamp is
    returned beside the totals so the caller can assert what these points were
    scored under instead of assuming it.
    """
    doc = json.loads((Path(str(WEEKLY).format(season=season))).read_text())
    totals: dict[str, float] = {}
    weeks_used = []
    for wk in doc["weeks"]:
        if wk["week"] not in REG_SEASON_WEEKS:
            continue
        weeks_used.append(wk["week"])
        for pid, pts in (wk.get("points") or {}).items():
            totals[str(pid)] = totals.get(str(pid), 0.0) + float(pts)
    return totals, {"scoring": doc["weeks"][0]["scoring"],
                    "weeks_used": sorted(weeks_used),
                    "players_with_any_week": len(totals)}


def _isotonic(xs: list[float], ys: list[float]) -> list[float]:
    """Pool-adjacent-violators fit of y on x, NON-INCREASING in x.

    Later picks cannot be worth more than earlier ones in a well-priced board, so
    the price→return curve is fitted monotone rather than linear: a straight line
    through a curve that is steep early and flat late manufactures residuals whose
    sign is a function of where a position sits on the pick axis. That artefact
    would land squarely on quarterbacks, who cluster in the middle rounds.
    """
    order = sorted(range(len(xs)), key=lambda i: xs[i])
    vals = [ys[i] for i in order]
    weights = [1.0] * len(vals)
    blocks = [[v, w] for v, w in zip(vals, weights)]
    i = 0
    while i < len(blocks) - 1:
        if blocks[i][0] < blocks[i + 1][0]:          # violates non-increasing
            v0, w0 = blocks[i]
            v1, w1 = blocks[i + 1]
            merged = [(v0 * w0 + v1 * w1) / (w0 + w1), w0 + w1]
            blocks[i:i + 2] = [merged]
            i = max(i - 1, 0)
        else:
            i += 1
    fitted_sorted = []
    for v, w in blocks:
        fitted_sorted.extend([v] * int(w))
    out = [0.0] * len(xs)
    for pos, idx in enumerate(order):
        out[idx] = fitted_sorted[pos]
    return out


def _boot_ci(values: list[float], n: int = 2000, seed: int = 20260816) -> dict:
    """Percentile bootstrap. Returns nulls rather than a fake interval under n<2."""
    if len(values) < 2:
        return {"mean": round(values[0], 2) if values else None,
                "lo": None, "hi": None, "n": len(values),
                "why": "n<2 — no interval is computable and none is invented"}
    rng = random.Random(seed)
    means = []
    for _ in range(n):
        s = [values[rng.randrange(len(values))] for _ in values]
        means.append(sum(s) / len(s))
    means.sort()
    return {"mean": round(sum(values) / len(values), 2),
            "lo": round(means[int(0.025 * n)], 2),
            "hi": round(means[int(0.975 * n)], 2),
            "n": len(values)}


def season_residuals(season: int, history: dict, positions: dict,
                     cfg: dict, unmatched_as_zero: bool = False) -> dict:
    """One season: live picks priced at pick_no, returned at realized VORP.

    The exclusions are counted, never zeroed — a drafted player with no offensive
    row that season is missing data about a return, and the sensitivity arm
    (`unmatched_as_zero`) exists precisely because that exclusion is not neutral.
    """
    totals, stamp = _load_weekly_totals(season)
    pos_map = positions["positions"]
    sdoc = next((s for s in history["seasons"] if str(s["season"]) == str(season)), None)
    picks = (sdoc["drafts"][0]["picks"] if sdoc and sdoc.get("drafts") else [])

    # Realized replacement, from the season that happened, on the same machinery
    # the live board uses. Every scored offensive player is in the pool: replacement
    # is about who was AVAILABLE, not about who was drafted.
    pool = [{"player_id": pid, "position": pos_map.get(pid), "proj_mean": pts}
            for pid, pts in totals.items() if pos_map.get(pid) in ("QB", "RB", "WR", "TE")]
    replacement, diag = replacement_levels(pool, cfg)

    rows, excluded = [], {"keeper": 0, "no_position": 0, "not_graded_position": 0,
                          "no_realized_row": 0}
    for pk in picks:
        pid = str(pk.get("player_id"))
        if pk.get("is_keeper"):
            excluded["keeper"] += 1
            continue
        pos = pos_map.get(pid)
        if pos is None:
            excluded["no_position"] += 1
            continue
        if pos not in ("QB", "RB", "WR", "TE"):
            excluded["not_graded_position"] += 1
            continue
        if pid not in totals:
            excluded["no_realized_row"] += 1
            if not unmatched_as_zero:
                continue
            pts = 0.0
        else:
            pts = totals[pid]
        rows.append({"player_id": pid, "position": pos, "pick_no": pk["pick_no"],
                     "points": round(pts, 2),
                     "vorp": round(pts - replacement.get(pos, 0.0), 2)})

    if not rows:
        return {"season": season, "n": 0, "why": "no gradable live picks"}

    fitted = _isotonic([r["pick_no"] for r in rows], [r["vorp"] for r in rows])
    for r, f in zip(rows, fitted):
        r["fitted"] = round(f, 2)
        r["residual"] = round(r["vorp"] - f, 2)

    by_pos = {}
    for pos in ("QB", "RB", "WR", "TE"):
        vals = [r["residual"] for r in rows if r["position"] == pos]
        by_pos[pos] = _boot_ci(vals)
    return {"season": season, "n": len(rows),
            "unmatched_as_zero": unmatched_as_zero,
            "excluded_counted": excluded,
            "realized_replacement": diag["replacement_points"],
            "scoring_stamp": {"pass_td": stamp["scoring"].get("pass_td"),
                              "pass_int": stamp["scoring"].get("pass_int")},
            "weeks_used": stamp["weeks_used"],
            "residual_by_position": by_pos,
            "picks": rows}


def dvorp_sensitivity(board: dict, gap_player: float,
                      gap_r_range=(24.0, 28.0, 32.0, 36.0, 40.0, 44.0)) -> list[dict]:
    """dVORP for the board's QB1 across a range of replacement-QB gaps.

    THE ADVERSARIAL CHECK, AND IT RUNS IN THE DIRECTION THAT WOULD HELP THE THESIS.
    `gap(R) = 40.0` is measured off Trevor Lawrence, who sits 1.70 points above the
    replacement line — but the quarterback exactly ON the line is Jayden Daniels, a
    RUSHING quarterback. Rushing contributes nothing to this gap, so a rushing
    replacement plausibly carries a LOWER gap than Lawrence's, which would make
    every pocket passer's dVORP LARGER than the headline finding says.

    Rather than assert that this does not matter, the range is swept and the slot
    movement reported at each point, so a reader can see how far gap(R) would have
    to fall before the conclusion changes.
    """
    qb1 = qb_board(board)[0]
    out = []
    for g in gap_r_range:
        d = dvorp(gap_player, g)
        mv = slots_moved(board, d, [qb1["player_id"]])[0]
        out.append({"gap_at_replacement": g,
                    "implied_replacement_pass_td_if_10_int": round((g + 10) / 2.0, 1),
                    "dvorp_qb1": d,
                    "qb1_slots_earlier": mv["slots_earlier"],
                    "qb1_rounds_earlier": mv["rounds_earlier"]})
    return out


def permutation_null(seasons: list[dict], position: str = "QB",
                     draws: int = 4000, seed: int = 20260816) -> dict:
    """Where the observed position residual sits in a null that knows no positions.

    A bootstrap interval says how precisely the QB mean is estimated. It does NOT
    say whether a mean that size is unusual for a group of that size drawn from
    this board — and with n=45 against n=138, the QB group is small enough that
    the two questions have different answers. So the position labels are shuffled
    WITHIN season (preserving each season's residual distribution and each
    position's count exactly) and the observed mean is placed in that null.

    Reported as a two-sided fraction, not as a p-value with a threshold attached:
    nothing here is being accepted or rejected on it.
    """
    pools = [[r["residual"] for r in s.get("picks", [])] for s in seasons
             if s.get("picks")]
    counts = [sum(1 for r in s.get("picks", []) if r["position"] == position)
              for s in seasons if s.get("picks")]
    obs_vals = [r["residual"] for s in seasons for r in s.get("picks", [])
                if r["position"] == position]
    if not obs_vals:
        return {"why": f"no {position} picks — nothing to place in a null"}
    observed = sum(obs_vals) / len(obs_vals)
    rng = random.Random(seed)
    hits = 0
    for _ in range(draws):
        drawn = []
        for pool, k in zip(pools, counts):
            if k:
                drawn.extend(rng.sample(pool, k))
        m = sum(drawn) / len(drawn) if drawn else 0.0
        if abs(m) >= abs(observed):
            hits += 1
    return {"position": position, "observed_mean_residual": round(observed, 2),
            "draws": draws, "two_sided_fraction_at_least_as_extreme":
                round(hits / draws, 4),
            "reading": ("the observed mean is ordinary under a null that assigns "
                        "positions at random" if hits / draws > 0.10 else
                        "the observed mean is unusual under a position-blind null")}


# ── the run ──────────────────────────────────────────────────────────────────

def run() -> dict:
    board = json.loads(BOARD.read_text())
    rule12 = json.loads(RULE12.read_text())
    scoring = rule12["scoring_settings"]

    measured = measured_qb_gaps(rule12)
    for m in measured:                       # identity vs the shipped scorer
        row = rule12["players"][m["player_id"]]["projection_row"]
        m["gap_via_shipped_scorer"] = gap_from_stat_line(row, scoring)

    rep = replacement_qb_proxy(board, [m["player_id"] for m in measured])
    gap_R = next((m["gap"] for m in measured
                  if m["player_id"] == rep["nearest_qb_id"]), None)

    prov = board["provenance"]["projections"]["scoring_gap_vs_adp_market"]
    headline = prov["top12_qb"]["mean_gap_points"]

    qbs = qb_board(board)
    survived = None
    if gap_R is not None:
        survived = [{**m, "dvorp": dvorp(m["gap"], gap_R)} for m in measured]

    naive = slots_moved(board, headline, [q["player_id"] for q in qbs[:12]])
    honest = (slots_moved(board, dvorp(measured[0]["gap"], gap_R),
                          [q["player_id"] for q in qbs[:12]])
              if gap_R is not None else None)

    cfg = json.loads((ROOT / "draft" / "config" / "league_config.json").read_text())
    history = json.loads(HISTORY.read_text())
    positions = json.loads(POSITIONS.read_text())
    hist = {"primary": [season_residuals(s, history, positions, cfg) for s in SEASONS],
            "sensitivity_unmatched_as_zero": [
                season_residuals(s, history, positions, cfg, unmatched_as_zero=True)
                for s in SEASONS]}
    for arm in hist.values():
        pooled, perms = {}, {}
        for pos in ("QB", "RB", "WR", "TE"):
            vals = [r["residual"] for s in arm for r in s.get("picks", [])
                    if r["position"] == pos]
            pooled[pos] = _boot_ci(vals)
            perms[pos] = permutation_null(arm, pos)
        arm.append({"season": "POOLED", "residual_by_position": pooled,
                    "permutation_null": perms,
                    "multiple_comparisons_note": (
                        "four positions were tested; at 95% one crossing by chance "
                        "is expected roughly one time in five. Only the QB row was "
                        "pre-registered — every other row here is exploratory and "
                        "is reported as such.")})

    return {
        "_territory": "A",
        "_what": "the 6-point-passing-TD gap taken through replacement to a pick number",
        "market_overrides": MARKET_OVERRIDES,
        "board_built_at": board["built_at"],
        "headline_gap_top12": headline,
        "raw_gaps_measured": measured,
        "replacement_qb": rep,
        "gap_at_replacement": gap_R,
        "survives_replacement": survived,
        "naive_slots_raw_gap_as_vorp": naive,
        "honest_slots_dvorp": honest,
        "dvorp_sensitivity_to_replacement_gap": (
            dvorp_sensitivity(board, measured[0]["gap"]) if measured else None),
        "breakeven_one_round": breakeven_table(board),
        "historical": hist,
    }


def main() -> None:
    res = run()
    OUT.write_text(json.dumps(res, indent=1, sort_keys=False) + "\n")
    print(f"wrote {OUT}")
    print(f"  headline top-12 gap      {res['headline_gap_top12']:+.2f} points")
    print(f"  gap at replacement       {res['gap_at_replacement']:+.2f} points "
          f"({res['replacement_qb']['nearest_qb']}, "
          f"{res['replacement_qb']['distance_points']:+.2f} from the line)")
    for s in res["survives_replacement"] or []:
        print(f"  {s['name']:<18} raw gap {s['gap']:+6.2f}  dVORP {s['dvorp']:+6.2f}")


if __name__ == "__main__":
    main()
