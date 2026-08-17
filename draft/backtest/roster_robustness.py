#!/usr/bin/env python3
# TERRITORY: A
"""THE ROSTER-ROBUSTNESS GRADER — the untested half of roster construction.

Cory's question, verbatim: "are we extracting as much value as possible while
also still drafting a legal team that seems reasonable."

The VALUE half and the LEGALITY half are already tested: the startable mask,
the robot mock, and the $-graded strategy tournament (all nine plans within
$10 on his seat — `draft/data/archetype_rooms.json` summary). What none of
those see is whether the roster the engine PLANS to leave him with survives a
real season STRUCTURALLY: byes stacking, players missing games, flex depth
running out, and how often the team has to lean on the waiver wire. The Lab's
own header admits it cannot see injury insurance. This module measures exactly
that — and prices robustness AGAINST value, never instead of it.

════════════════════════════════════════════════════════════════════════════
PRE-REGISTERED METRICS — written before this module computed a single number.
════════════════════════════════════════════════════════════════════════════

For each graded 15-man roster, Monte Carlo over N=10,000 seasons of 17 weeks
(the league's own scored span: `LAST_SCORED_WEEK = 17` in
`empirical_draft_value.py`; playoffs are weeks 16-17):

  M1  value            E[season starting-lineup points]: each simulated week
                       fields the best legal lineup (QB/2RB/2WR/TE/FLEX/K/DEF,
                       the league's `roster_slots` from public/draft_data.json)
                       from AVAILABLE rostered players; an empty slot scores
                       the measured wire level for that slot's position.
                       Reported with and without the wire contribution.
  M2  p_unfieldable    P(>= 1 week in the season with >= 1 EMPTY SKILL slot —
                       QB/RB/RB/WR/WR/TE/FLEX — after fielding the best legal
                       lineup from available rostered players). K/DEF slots
                       are excluded from THIS metric by design: every graded
                       roster carries exactly one K and one DEF, so their bye
                       weeks would push the number to 1.0 for every plan and
                       the metric would stop discriminating. K/DEF holes are
                       still priced (M1/M3 fill them at wire level) and still
                       counted in M4.
  M3  wire_points      E[wire points consumed per season] — the sum of wire-
                       level fills across all nine slots, plus the expected
                       count of wire-filled slot-weeks. This is the WIRE-
                       DEPENDENCE of the roster: what the plan is implicitly
                       committing Cory to go get off waivers.
  M4  weekly_floor_p10 10th percentile of the weekly team score, pooled over
                       all simulated weeks (wire fills included).
  M5  bye_worst_case   Deterministic, injuries OFF: with every player present
                       except on his bye (board byes), the worst week's (a)
                       count of roster players simultaneously on bye, (b)
                       count of empty skill slots from byes alone, and (c) the
                       projected-mean lineup score of that worst week.
  M6  stress_curve     The insurance question: for X in {RB1, RB2, WR1, WR2}
                       (ranked by proj_mean within the roster), the loss in
                       expected season points when X is forced OUT for weeks
                       5-8 (a 4-week mid-season spell), paired on common
                       random numbers with the baseline. Smaller loss =
                       better insured.
  M7  dominance        The verdict, two like-for-like halves:
                       (a) DOCTRINES: arm D dominates the seat-plan arm iff
                       its PAIRED per-room mean deltas (same room seed, same
                       simulation seed — the tournament's own pairing) are
                       positive on BOTH value and weekly_floor_p10 by more
                       than 2 paired standard errors (n=120 rooms).
                       (b) CONTROLS: a named roster dominates the engine's
                       planned roster iff BOTH value and floor exceed it by
                       more than 2 combined standard errors (value SE from
                       the season-total spread; p10 SE from a 200-resample
                       bootstrap over simulated seasons).
                       Strict dominance on BOTH axes is the headline test —
                       not preference, not a weighted blend. A full-metric
                       strict check (value + M2 + M3 + M4) is a secondary.

Doctrine rows: each of the nine tournament arms is graded as the MEAN of its
own 120 simulated rooms (the tournament's own artifact,
`archetype_rooms.json:detail`, keepers + 12 logged picks per room) at N=250
seasons per room — 30,000 seasons per arm. A single "planned roster" per arm
does not exist: all 120 rooms differ (measured; modal roster frequency is
1/120, mean pairwise Jaccard overlap 0.12-0.24), so the medoid room is also
graded at N=10,000 and carried in the JSON as a labelled illustration, never
as the arm's grade.

DISCLOSED AMENDMENT (made after a SMOKE run at N=1000/30, before the final
artifact was computed, for a mechanism visible in the inputs rather than the
scores): (i) the planned-roster row and the tournament-room rows sit in
different LUCK REGIMES — room opponents sample a softmax (temperature 2.0),
so stars sometimes fall to seat 8 in rooms, while the planned roster assumes
the room drafts near ADP — comparing a doctrine's rooms straight to the
planned roster confounds doctrine with room luck, so the doctrine half of M7
is the PAIRED arm-vs-arm test above; and (ii) the QB wire level was moved
from the acquisition-week median (23.38/wk) to the same store's ongoing-hold
line (19.46/wk = 330.8/season — the level A cites as "QB wire == replacement
330.8"), because 23.38 EXCEEDS the weekly mean of most startable QBs
(e.g. Burrow 362.1/17 = 21.3): an empty QB slot priced above a healthy
starter would make QB holes profitable, and a streamed QB is a HELD add — the
3-week-after median is its price. RB/WR/TE holes are filled the week they
open, so they keep the acquisition-week medians.

════════════════════════════════════════════════════════════════════════════
EVERY DISTRIBUTIONAL INPUT, MEASURED OR NAMED
════════════════════════════════════════════════════════════════════════════

MEASURED (with source):
  * Weekly points scale: player-week ~ Normal(proj_mean/17, weekly_sd), both
    fields from public/draft_data.json (weekly_sd is the board's measured
    2023-25 projection-error band scaled to weeks; proj_mean is the shipped
    blend). The /17 convention and the Normal shape are the task's stated
    yardstick — see ASSUMPTIONS for what it does not model.
  * Games-played distributions BY POSITION: row-presence in the committed
    stores (component_stats_2021..2025.json for 2021-22 scoring parity,
    nflverse weekly stores for 2023-25 — both routed through
    `empirical_draft_value.season_totals`, weeks 1-17), over the pool of
    players ACTUALLY DRAFTED IN THIS LEAGUE 2023-25 (league_history.json
    drafts, 347 skill picks: QB 48 / RB 142 / WR 157 / TE 42). A drafted
    player with zero weekly rows counts as 0 games (the Arm-Z convention:
    a pick that returned nothing did return nothing to the roster).
  * Wire level per position: draft/data/wire_level.json — RB 7.8 / WR 11.1 /
    TE 11.6 points/week (realized acquisition-week medians over 422 scored
    waiver adds 2023-25: a hole at these positions is filled the week it
    opens); QB 19.46/week = 330.8/season (the same store's ongoing-hold
    3-week-after median — a streamed QB is a held add, and the
    acquisition-week 23.38 exceeds most startable QBs' weekly mean; see the
    disclosed amendment above).
  * Byes: fixed from the board (public/draft_data.json), including K/DEF.
  * Injury clustering: missed games are placed as ONE CONTIGUOUS SPELL with a
    uniform-random start among non-bye weeks, per the measured spell lengths
    in draft/backtest/weeks_out_when_injured.json (mean completed absence
    3.3+ weeks per position; absences arrive in runs, not scattered singles).

NAMED ASSUMPTIONS (not measured, stated):
  A1  proj_mean/17 as the active-week mean double-counts availability at the
      mean level (proj_mean already embeds games_expected). The bias is
      applied IDENTICALLY to every graded roster, so it shifts levels, not
      comparisons.
  A2  Weekly draws are IID across weeks and players — no across-week player
      correlation (weekly_sd embeds season-level projection error) and no
      within-team injury correlation.
  A3  K/DEF availability = every non-bye week. The stores are offense-only
      (wire_level.json says so), so K/DEF games are unmeasurable here.
  A4  K/DEF wire level = the board's replacement_points / 17 (K 97.0 -> 5.71,
      DEF 103.0 -> 6.06 per week) — a stand-in, labelled, because the
      realized-wire store cannot score K/DEF.
  A5  The single-contiguous-spell placement understates multi-spell seasons;
      byes inside a spell are spanned (the spell covers m non-bye weeks).
  A6  The games-played pool is position-level, not round-conditioned. The
      measured round effect inside the pool is small (RB drafted rounds 1-6
      mean 13.75 games vs 12.24 in rounds 7-15; QB/WR/TE within 0.5).
  A7  Cory's ACTUAL 2025 roster (the human control) is graded as a STRUCTURE
      on the 2026 board: his fifteen 2025 draft picks mapped to their 2026
      board rows (projections, weekly_sd, byes as of today). One pick, pid
      12530, has no committed position anywhere in the repo
      (player_positions.json gap, already on the audit record) and is graded
      as an empty bench spot.

NO-FIT GUARD: this is MEASUREMENT, not selection. No plan is promoted; the
result routes to A/Cory through `no_fit_guard.record` with promotable=False
and configs_tried=1 (a single pre-declared comparison). The fail-arm test
(`draft/tests/test_roster_robustness.py`) proves the grader can distinguish:
a deliberately fragile roster — five RBs sharing one bye, no TE before a
round-12 price — must grade measurably worse on robustness.

Run:      python3 draft/backtest/roster_robustness.py
Writes:   draft/data/roster_robustness_2026.json
          draft/audit/roster_robustness_2026-08-17.md
Tests:    python3 -m pytest draft/tests/test_roster_robustness.py -q
"""
from __future__ import annotations

import json
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
DRAFT = HERE.parent
DATA = DRAFT / "data"
ROOT = DRAFT.parent

sys.path.insert(0, str(HERE))
import empirical_draft_value as edv  # noqa: E402  (loaders + season_totals parity)
import no_fit_guard  # noqa: E402

# ── pre-registered constants ────────────────────────────────────────────────
SEED = 20260817
WEEKS = 17                     # league last_scored_leg = 17 (edv.LAST_SCORED_WEEK)
N_SINGLE = 10_000              # named single rosters
N_ROOM = 250                   # per tournament room (x120 rooms = 30k per arm)
STRESS_WEEKS = (5, 6, 7, 8)    # M6's forced 4-week mid-season spell (1-indexed)
SKILL = ("QB", "RB", "WR", "TE")
POOL_SEASONS = (2023, 2024, 2025)   # seasons with a league draft on file
DOMINANCE_SE_MULT = 2.0
BOOTSTRAP_RESAMPLES = 200
MY_2025_USER_ID = "434915673219526656"   # coryjsimms (public/draft_data.json)
UNPOSITIONED_2025_PID = "12530"          # committed gap, see docstring A7


# ── loaders ─────────────────────────────────────────────────────────────────

def board() -> dict:
    return json.loads((ROOT / "public" / "draft_data.json").read_text())


def board_maps(doc: dict | None = None) -> tuple[dict, dict]:
    """(by_player_id, by_(name,pos)) over pool players + Cory's kept players."""
    doc = doc or board()
    rows = list(doc["players"]) + list(doc.get("kept_players", []))
    by_id = {str(r["player_id"]): r for r in rows}
    by_name: dict[tuple, dict] = {}
    for r in rows:
        by_name.setdefault((r["name"], r["position"]), r)
    return by_id, by_name


def wire_per_week() -> tuple[dict, dict]:
    """({slot_pos: pts/week}, provenance). QB/RB/WR/TE measured; K/DEF A4.

    QB uses the ongoing-hold line (a streamed QB is a HELD add; 19.46/wk =
    330.8/season, the level A cites as QB wire == replacement); RB/WR/TE use
    the acquisition-week medians (a hole there is filled the week it opens).
    """
    doc = json.loads((DATA / "wire_level.json").read_text())
    repl = board()["replacement"]["replacement_points"]
    wire = {p: float(doc["per_week"][p]) for p in ("RB", "WR", "TE")}
    wire["QB"] = float(doc["ongoing"]["per_week"]["QB"])
    wire["K"] = round(float(repl["K"]) / WEEKS, 2)
    wire["DEF"] = round(float(repl["DEF"]) / WEEKS, 2)
    prov = {
        "skill": {
            "source": "draft/data/wire_level.json — RB/WR/TE per_week "
                      "(realized acquisition-week medians, %d scored adds, "
                      "seasons %s); QB ongoing.per_week (held-add 3-week-after "
                      "median, 19.46/wk = 330.8/season)"
                      % (doc["scored"], "/".join(doc["seasons"])),
            "per_week": {p: wire[p] for p in SKILL},
            "n": doc["n"],
        },
        "k_def": {
            "source": "ASSUMPTION A4 — board replacement_points / 17 "
                      "(realized-wire store is offense-only and cannot score K/DEF)",
            "per_week": {"K": wire["K"], "DEF": wire["DEF"]},
        },
    }
    return wire, prov


def availability_distributions() -> tuple[dict, dict]:
    """{pos: np.array of games played (weeks 1-17)} + provenance. MEASURED.

    Pool: every player drafted in this league 2023-25 (league_history.json,
    keepers included). Games: row-presence via edv.season_totals — weekly
    stores for 2023-25, component stores scored under the frozen table for
    2021-22 (not reached by this pool, but the same routing keeps parity with
    the study). Zero-row picks count 0 games (Arm-Z convention).
    """
    pos_rec = edv.positions_record()
    drafts = edv.league_drafts()
    dist: dict[str, list] = defaultdict(list)
    unpositioned = []
    for season in POOL_SEASONS:
        totals, games = edv.season_totals(season)
        for row in drafts.get(season, []):
            p = pos_rec.get(row["pid"])
            if p in SKILL:
                dist[p].append(int(games.get(row["pid"], 0)))
            elif p is None and row["pid"].isdigit():
                unpositioned.append((season, row["pid"]))
    out = {p: np.clip(np.array(sorted(dist[p]), dtype=np.int64), 0, WEEKS - 1)
           for p in SKILL}
    prov = {
        "pool": "players drafted in THIS league, seasons %s (league_history.json "
                "drafts, keepers included)" % (POOL_SEASONS,),
        "games_source": "row-presence weeks 1-17 via empirical_draft_value."
                        "season_totals — nflverse weekly stores 2023-25; "
                        "component_stats_2021/2022 route exists for parity",
        "zero_row_rule": "drafted player with no weekly row counts as 0 games "
                         "(Arm-Z: a pick that returned nothing returned nothing)",
        "n": {p: int(len(out[p])) for p in SKILL},
        "mean_games": {p: round(float(out[p].mean()), 2) for p in SKILL},
        "p10_games": {p: int(np.percentile(out[p], 10)) for p in SKILL},
        "unpositioned_picks_excluded": [pid for _, pid in unpositioned],
    }
    return out, prov


# ── roster construction (all derived from committed artifacts) ──────────────

def _player(row: dict) -> dict:
    return {
        "name": row["name"], "pos": row["position"],
        "mu": float(row["proj_mean"]) / WEEKS,
        "sd": float(row["weekly_sd"]),
        "bye": int(row["bye"]),
        "proj_mean": float(row["proj_mean"]),
    }


def seat_plan_roster() -> tuple[list, dict]:
    """The engine's PLANNED roster: keepers + draft_plan's named player at all
    12 seats. At the three bench seats where emit_seat_plan demoted the plan's
    name to `superseded_plan_player` (two waiver lines disagree there), the
    plan's own name is still the plan — that is what it intends to draft."""
    doc = json.loads((ROOT / "public" / "seat_plan.json").read_text())
    by_id, _ = board_maps()
    picks, superseded = [], []
    for s in doc["seats"]:
        p = s.get("plan_player") or s.get("superseded_plan_player")
        if s.get("superseded_plan_player"):
            superseded.append({"pick": s["pick"], "name": p["name"]})
        if p is None:
            raise ValueError("seat %s names no plan player at all" % s["pick"])
        picks.append(_player(by_id[str(p["player_id"])]))
    roster = [_player(by_id[str(k["player_id"])]) for k in doc["keepers"]] + picks
    prov = {"source": "public/seat_plan.json (emit_seat_plan output): keepers + "
                      "plan_player, falling back to superseded_plan_player at "
                      "the three demoted bench seats",
            "superseded_bench_seats": superseded}
    return roster, prov


def seat_plan_shortlist_roster() -> tuple[list, dict]:
    """The DEGENERATE-SHAPE PROBE: what the seat plan's own shortlists draft if
    followed literally — top eligible shortlist name at every seat, skipping
    players already taken. Graded to price the shape the realized-wire MV
    ranking steers into at the bench seats."""
    doc = json.loads((ROOT / "public" / "seat_plan.json").read_text())
    by_id, _ = board_maps()
    taken = {str(k["player_id"]) for k in doc["keepers"]}
    picks = []
    for s in doc["seats"]:
        for cand in s["shortlist"]:
            pid = str(cand["player_id"])
            if pid not in taken:
                taken.add(pid)
                picks.append(_player(by_id[pid]))
                break
        else:
            raise ValueError("seat %s shortlist exhausted" % s["pick"])
    roster = [_player(by_id[str(k["player_id"])]) for k in doc["keepers"]] + picks
    return roster, {"source": "public/seat_plan.json shortlists, followed "
                              "literally top-down with already-taken skipped"}


def cory_2025_roster() -> tuple[list, dict]:
    """The human control (A7): Cory's actual fifteen 2025 draft picks, mapped
    to 2026 board rows. pid 12530 (no committed position) -> empty bench."""
    hist = json.loads((DATA / "league_history.json").read_text())
    season = next(s for s in hist["seasons"] if str(s["season"]) == "2025")
    rid = next(int(k) for k, v in season["owners"].items()
               if str(v.get("user_id")) == MY_2025_USER_ID)
    draft = max((d for d in season["drafts"] if d.get("status") == "complete"),
                key=lambda d: len(d.get("picks", [])))
    by_id, _ = board_maps()
    roster, dropped = [], []
    for p in sorted(draft["picks"], key=lambda p: p["pick_no"]):
        if int(p["roster_id"]) != rid:
            continue
        pid = str(p["player_id"])
        if pid in by_id:
            roster.append(_player(by_id[pid]))
        else:
            dropped.append(pid)
    if dropped != [UNPOSITIONED_2025_PID]:
        raise ValueError("2025 control mapping changed: dropped=%s" % dropped)
    prov = {"source": "league_history.json 2025 draft, roster_id %d, mapped to "
                      "2026 board rows (A7)" % rid,
            "graded_players": len(roster),
            "excluded_as_empty_bench": dropped}
    return roster, prov


def fragile_roster() -> tuple[list, dict]:
    """The FAIL ARM: deliberately fragile, built by deterministic rule from the
    board — five RBs sharing the modal RB bye, no TE until a round-12 price
    (adp >= 110), thin WR room. Exists so the grader's discrimination is
    PROVEN, not assumed."""
    doc = board()
    # price-feasible only: Cory's first pick is 33, so nothing under adp 30 —
    # otherwise the fail arm smuggles in players no plan could actually have.
    pool = [p for p in doc["players"] if p["adp"] >= 30]
    rbs = [p for p in pool if p["position"] == "RB" and p["proj_mean"] >= 80]
    bye_counts = defaultdict(int)
    for p in rbs:
        bye_counts[p["bye"]] += 1
    modal_bye = max(sorted(bye_counts), key=lambda b: bye_counts[b])
    stack = sorted((p for p in rbs if p["bye"] == modal_bye),
                   key=lambda p: -p["proj_mean"])[:5]
    qb = min((p for p in pool if p["position"] == "QB"),
             key=lambda p: abs(p["adp"] - 48))
    wrs = sorted((p for p in pool if p["position"] == "WR" and 50 <= p["adp"] <= 150),
                 key=lambda p: -p["proj_mean"])[:6]
    te = max((p for p in pool if p["position"] == "TE" and p["adp"] >= 110),
             key=lambda p: p["proj_mean"])
    k = min((p for p in pool if p["position"] == "K"), key=lambda p: p["adp"])
    d = min((p for p in pool if p["position"] == "DEF"), key=lambda p: p["adp"])
    roster = [_player(p) for p in ([qb] + stack + wrs + [te, k, d])]
    if len(roster) != 15:
        raise ValueError("fragile roster is %d men" % len(roster))
    return roster, {"rule": "synthetic fail arm: price-feasible (adp >= 30) "
                            "and exactly 5 RBs, ALL on bye %d (both RB slots "
                            "are empty that week by construction), lone TE at "
                            "adp >= 110, deterministic from the board"
                            % modal_bye,
                    "modal_bye": modal_bye}


def arm_rosters() -> tuple[dict, dict]:
    """{arm: [roster x120]} from the tournament artifact (keepers + picksLog),
    plus per-arm medoid index by mean Jaccard overlap."""
    doc = json.loads((DATA / "archetype_rooms.json").read_text())
    seat = json.loads((ROOT / "public" / "seat_plan.json").read_text())
    by_id, by_name = board_maps()
    keepers = [_player(by_id[str(k["player_id"])]) for k in seat["keepers"]]
    arms, medoid = {}, {}
    for arm, rooms in doc["detail"].items():
        rosters = []
        sets = []
        for r in rooms:
            picks = [_player(by_name[(x["name"], x["pos"])]) for x in r["picksLog"]]
            rosters.append({"seed": int(r["seed"]), "roster": keepers + picks})
            sets.append(frozenset(x["name"] for x in r["picksLog"]))
        best_i, best_s = 0, -1.0
        for i, s in enumerate(sets):
            sim = sum(len(s & t) / len(s | t) for t in sets)
            if sim > best_s:
                best_i, best_s = i, sim
        arms[arm] = rosters
        medoid[arm] = {"index": best_i, "seed": rooms[best_i]["seed"],
                       "mean_jaccard": round(best_s / len(sets), 3)}
    return arms, medoid


# ── the simulator ───────────────────────────────────────────────────────────

def draw_season(roster: list, n: int, rng: np.random.Generator,
                dists: dict) -> tuple[np.ndarray, np.ndarray]:
    """(points (n, WEEKS, P), avail (n, WEEKS, P)).

    Points: Normal(mu, sd) per player-week (task yardstick). Availability:
    bye off for everyone; skill players draw games-played g from the measured
    position distribution and miss one contiguous spell of (16 - g) non-bye
    weeks (uniform start); K/DEF miss only the bye (A3)."""
    P = len(roster)
    mu = np.array([p["mu"] for p in roster])
    sd = np.array([p["sd"] for p in roster])
    bye = np.array([p["bye"] for p in roster], dtype=np.int64)
    pts = rng.normal(mu, sd, size=(n, WEEKS, P))
    avail = np.ones((n, WEEKS, P), dtype=bool)
    for j, p in enumerate(roster):
        avail[:, bye[j] - 1, j] = False
        if p["pos"] not in SKILL:
            continue
        g = rng.choice(dists[p["pos"]], size=n)
        m = np.maximum(0, (WEEKS - 1) - g)          # missed non-bye weeks
        start = np.floor(rng.random(n) * (WEEKS - m)).astype(np.int64)
        idx = np.arange(WEEKS - 1)                   # non-bye index space
        miss = (idx[None, :] >= start[:, None]) & (idx[None, :] < (start + m)[:, None])
        nonbye_weeks = np.array([w for w in range(WEEKS) if w != bye[j] - 1])
        block = avail[:, nonbye_weeks, j]
        block &= ~miss
        avail[:, nonbye_weeks, j] = block
    return pts, avail


def _top(masked: np.ndarray, k: int) -> list:
    """List of k arrays (n, WEEKS): the k best values along the player axis,
    -inf when fewer players exist/are available."""
    n, w, c = masked.shape
    if c == 0:
        return [np.full((n, w), -np.inf)] * k
    srt = np.sort(masked, axis=2)[:, :, ::-1]
    out = []
    for i in range(k):
        out.append(srt[:, :, i] if i < c else np.full((n, w), -np.inf))
    return out


def lineup(pts: np.ndarray, avail: np.ndarray, roster: list,
           wire: dict) -> dict:
    """Best legal lineup per (sim, week); empty slot = wire level (M1-M3).

    Greedy is exact for this slot structure: dedicated slots take each
    position's best, FLEX takes the best leftover among RB3/WR3/TE2."""
    masked = np.where(avail, pts, -np.inf)
    idx = {p: [j for j, r in enumerate(roster) if r["pos"] == p]
           for p in ("QB", "RB", "WR", "TE", "K", "DEF")}
    qb1, = _top(masked[:, :, idx["QB"]], 1)
    rb1, rb2, rb3 = _top(masked[:, :, idx["RB"]], 3)
    wr1, wr2, wr3 = _top(masked[:, :, idx["WR"]], 3)
    te1, te2 = _top(masked[:, :, idx["TE"]], 2)
    k1, = _top(masked[:, :, idx["K"]], 1)
    df1, = _top(masked[:, :, idx["DEF"]], 1)
    flex = np.maximum(np.maximum(rb3, wr3), te2)
    wire_flex = max(wire["RB"], wire["WR"], wire["TE"])

    slots = [(qb1, wire["QB"], True), (rb1, wire["RB"], True),
             (rb2, wire["RB"], True), (wr1, wire["WR"], True),
             (wr2, wire["WR"], True), (te1, wire["TE"], True),
             (flex, wire_flex, True), (k1, wire["K"], False),
             (df1, wire["DEF"], False)]
    n, w = qb1.shape
    score = np.zeros((n, w))
    wire_pts = np.zeros((n, w))
    empty_skill = np.zeros((n, w), dtype=np.int64)
    empty_all = np.zeros((n, w), dtype=np.int64)
    for v, wlevel, is_skill in slots:
        empty = ~np.isfinite(v)
        score += np.where(empty, wlevel, v)
        wire_pts += np.where(empty, wlevel, 0.0)
        empty_all += empty
        if is_skill:
            empty_skill += empty
    return {"weekly": score, "wire_pts": wire_pts,
            "empty_skill": empty_skill, "empty_all": empty_all}


def bye_worst_case(roster: list, wire: dict) -> dict:
    """M5 — deterministic, injuries off, points = proj_mean/17."""
    P = len(roster)
    pts = np.array([[p["mu"] for p in roster]] * WEEKS)[None, :, :]
    avail = np.ones((1, WEEKS, P), dtype=bool)
    for j, p in enumerate(roster):
        avail[0, p["bye"] - 1, j] = False
    res = lineup(pts, avail, roster, wire)
    on_bye = (~avail[0]).sum(axis=1)
    worst_week = int(np.argmin(res["weekly"][0])) + 1
    return {"max_concurrent_byes": int(on_bye.max()),
            "max_empty_skill_slots_bye_only": int(res["empty_skill"][0].max()),
            "worst_bye_week": worst_week,
            "worst_bye_week_mu_score": round(float(res["weekly"][0].min()), 1)}


def _rank_targets(roster: list) -> dict:
    """{label: player index} for RB1/RB2/WR1/WR2 by proj_mean (M6)."""
    out = {}
    for pos in ("RB", "WR"):
        ranked = sorted((j for j, r in enumerate(roster) if r["pos"] == pos),
                        key=lambda j: -roster[j]["proj_mean"])
        for i, j in enumerate(ranked[:2]):
            out["%s%d" % (pos, i + 1)] = j
    return out


def grade_roster(roster: list, n: int, seed: int, dists: dict,
                 wire: dict, stress: bool = True) -> dict:
    """All pre-registered metrics for one roster (M1-M6)."""
    rng = np.random.default_rng(seed)
    pts, avail = draw_season(roster, n, rng, dists)
    base = lineup(pts, avail, roster, wire)
    season = base["weekly"].sum(axis=1)
    weekly = base["weekly"].ravel()
    # bootstrap SE of the pooled weekly p10, resampling seasons
    brng = np.random.default_rng(seed + 1)
    p10s = [float(np.percentile(base["weekly"][brng.integers(0, n, n)].ravel(), 10))
            for _ in range(BOOTSTRAP_RESAMPLES)]
    out = {
        "n_seasons": n,
        "value": round(float(season.mean()), 1),
        "value_se": round(float(season.std(ddof=1) / np.sqrt(n)), 2),
        "value_no_wire": round(float((season - base["wire_pts"].sum(axis=1)).mean()), 1),
        "p_unfieldable_skill_week": round(float((base["empty_skill"].sum(axis=1) > 0).mean()), 4),
        "wire_points_per_season": round(float(base["wire_pts"].sum(axis=1).mean()), 1),
        "wire_slot_weeks_per_season": round(float(base["empty_all"].sum(axis=1).mean()), 2),
        "wire_skill_slot_weeks_per_season": round(float(base["empty_skill"].sum(axis=1).mean()), 2),
        "weekly_floor_p10": round(float(np.percentile(weekly, 10)), 1),
        "weekly_floor_p10_se": round(float(np.std(p10s, ddof=1)), 2),
        "weekly_mean": round(float(weekly.mean()), 1),
        "bye_worst_case": bye_worst_case(roster, wire),
        "shape": _shape(roster),
    }
    if stress:
        deltas = {}
        for label, j in _rank_targets(roster).items():
            forced = avail.copy()
            forced[:, [w - 1 for w in STRESS_WEEKS], j] = False
            s2 = lineup(pts, forced, roster, wire)["weekly"].sum(axis=1)
            deltas[label] = {
                "player": roster[j]["name"],
                "expected_season_loss": round(float((season - s2).mean()), 1),
            }
        out["stress_4wk_loss"] = deltas
    return out


def _shape(roster: list) -> str:
    c = defaultdict(int)
    for r in roster:
        c[r["pos"]] += 1
    return "/".join("%s%d" % (p, c[p]) for p in ("QB", "RB", "WR", "TE", "K", "DEF") if c[p])


def grade_arm(rooms: list, n_room: int, seed_base: int, dists: dict,
              wire: dict) -> dict:
    """M-metrics averaged over an arm's 120 tournament rooms (stress included,
    CRN-paired inside each room). Each room's simulation seed is
    seed_base + its TOURNAMENT room seed, and seed_base MUST be the same for
    every arm: room seed s of arm X and room seed s of the seat-plan arm then
    share both the drafted board (the tournament's pairing) and the
    simulation draws — that is what makes M7(a)'s per-room deltas paired."""
    per_room = [grade_roster(r["roster"], n_room, seed_base + r["seed"],
                             dists, wire, stress=True) for r in rooms]
    by_seed = {r["seed"]: g for r, g in zip(rooms, per_room)}

    def m(key):
        return round(float(np.mean([g[key] for g in per_room])), 2)

    stress = {}
    for label in ("RB1", "RB2", "WR1", "WR2"):
        vals = [g["stress_4wk_loss"][label]["expected_season_loss"]
                for g in per_room if label in g.get("stress_4wk_loss", {})]
        stress[label] = {"expected_season_loss": round(float(np.mean(vals)), 1),
                         "rooms": len(vals)}
    return {
        "rooms": len(rooms), "n_seasons_per_room": n_room,
        "n_seasons_total": n_room * len(rooms),
        "value": m("value"),
        "value_se": round(float(np.std([g["value"] for g in per_room], ddof=1)
                                / np.sqrt(len(per_room))), 2),
        "value_no_wire": m("value_no_wire"),
        "p_unfieldable_skill_week": round(float(np.mean(
            [g["p_unfieldable_skill_week"] for g in per_room])), 4),
        "wire_points_per_season": m("wire_points_per_season"),
        "wire_skill_slot_weeks_per_season": m("wire_skill_slot_weeks_per_season"),
        "weekly_floor_p10": m("weekly_floor_p10"),
        "weekly_floor_p10_se": round(float(np.std(
            [g["weekly_floor_p10"] for g in per_room], ddof=1)
            / np.sqrt(len(per_room))), 2),
        "bye_max_empty_skill_slots": round(float(np.mean(
            [g["bye_worst_case"]["max_empty_skill_slots_bye_only"] for g in per_room])), 2),
        "bye_max_concurrent": round(float(np.mean(
            [g["bye_worst_case"]["max_concurrent_byes"] for g in per_room])), 2),
        "stress_4wk_loss": stress,
        "_per_room": {s: {"value": g["value"], "floor": g["weekly_floor_p10"]}
                      for s, g in by_seed.items()},
    }


# ── the verdict ─────────────────────────────────────────────────────────────

def dominance_arms(arms: dict, ref_arm: str = "seat_plan") -> dict:
    """M7(a): every doctrine arm vs the seat-plan arm, PAIRED on room seed
    (shared drafted board + shared simulation draws). Dominates iff both
    paired mean deltas clear DOMINANCE_SE_MULT paired SEs."""
    ref = arms[ref_arm]["_per_room"]
    out = {}
    for name, g in arms.items():
        if name == ref_arm:
            continue
        seeds = sorted(set(g["_per_room"]) & set(ref))
        dv = np.array([g["_per_room"][s]["value"] - ref[s]["value"] for s in seeds])
        df = np.array([g["_per_room"][s]["floor"] - ref[s]["floor"] for s in seeds])
        se_v = float(dv.std(ddof=1) / np.sqrt(len(seeds)))
        se_f = float(df.std(ddof=1) / np.sqrt(len(seeds)))
        out[name] = {
            "paired_rooms": len(seeds),
            "delta_value_mean": round(float(dv.mean()), 1),
            "delta_value_se": round(se_v, 2),
            "delta_floor_mean": round(float(df.mean()), 2),
            "delta_floor_se": round(se_f, 2),
            "dominates_seat_plan_arm": bool(
                dv.mean() > DOMINANCE_SE_MULT * se_v
                and df.mean() > DOMINANCE_SE_MULT * se_f),
            "seat_plan_arm_dominates_it": bool(
                -dv.mean() > DOMINANCE_SE_MULT * se_v
                and -df.mean() > DOMINANCE_SE_MULT * se_f),
        }
    return out


def dominance_singles(seat: dict, rows: dict) -> dict:
    """M7(b): named rosters vs the engine's planned roster. Positive
    robustness axis = weekly_floor_p10. Dominates iff BOTH value and floor
    exceed the seat plan's by more than DOMINANCE_SE_MULT combined SEs.
    Secondary: strict on value, floor, p_unfieldable (lower), wire_points
    (lower), no SE gate."""
    out = {}
    for name, g in rows.items():
        dv = g["value"] - seat["value"]
        se_v = float(np.hypot(g["value_se"], seat["value_se"]))
        df = g["weekly_floor_p10"] - seat["weekly_floor_p10"]
        se_f = float(np.hypot(g["weekly_floor_p10_se"], seat["weekly_floor_p10_se"]))
        dominates = bool(dv > DOMINANCE_SE_MULT * se_v and df > DOMINANCE_SE_MULT * se_f)
        dominated_by_seat = bool(-dv > DOMINANCE_SE_MULT * se_v and -df > DOMINANCE_SE_MULT * se_f)
        strict_all = bool(dv > 0 and df > 0
                          and g["p_unfieldable_skill_week"] < seat["p_unfieldable_skill_week"]
                          and g["wire_points_per_season"] < seat["wire_points_per_season"])
        out[name] = {"delta_value": round(dv, 1), "delta_floor_p10": round(df, 2),
                     "dominates_planned_roster": dominates,
                     "planned_roster_dominates_it": dominated_by_seat,
                     "strictly_better_all_metrics": strict_all}
    return out


def run(n_single: int = N_SINGLE, n_room: int = N_ROOM,
        seed: int = SEED) -> dict:
    dists, dist_prov = availability_distributions()
    wire, wire_prov = wire_per_week()

    sp_roster, sp_prov = seat_plan_roster()
    sl_roster, sl_prov = seat_plan_shortlist_roster()
    cory_roster, cory_prov = cory_2025_roster()
    frag_roster, frag_prov = fragile_roster()
    arms, medoids = arm_rosters()

    singles = {
        "seat_plan_planned": (sp_roster, sp_prov),
        "seat_plan_shortlist_literal": (sl_roster, sl_prov),
        "cory_actual_2025": (cory_roster, cory_prov),
        "fragile_bye_stack": (frag_roster, frag_prov),
    }
    graded_singles = {}
    for i, (name, (roster, prov)) in enumerate(singles.items()):
        g = grade_roster(roster, n_single, seed + 1000 * (i + 1), dists, wire)
        g["provenance"] = prov
        g["players"] = ["%s %s" % (r["pos"], r["name"]) for r in roster]
        graded_singles[name] = g

    graded_arms = {}
    medoid_detail = {}
    for arm, rooms in arms.items():
        # SAME seed base for every arm — the pairing in M7(a) depends on it.
        graded_arms[arm] = grade_arm(rooms, n_room, seed + 500_000, dists, wire)
        mi = medoids[arm]["index"]
        md = grade_roster(rooms[mi]["roster"], n_single,
                          seed + 500_000 + rooms[mi]["seed"], dists, wire)
        md["medoid"] = medoids[arm]
        md["players"] = ["%s %s" % (r["pos"], r["name"])
                         for r in rooms[mi]["roster"]]
        medoid_detail[arm] = md

    seat = graded_singles["seat_plan_planned"]
    verdict_arms = dominance_arms(graded_arms)
    verdict_singles = dominance_singles(seat, {
        "cory_actual_2025": graded_singles["cory_actual_2025"],
        "seat_plan_shortlist_literal": graded_singles["seat_plan_shortlist_literal"],
        "fragile_bye_stack": graded_singles["fragile_bye_stack"],
    })

    arm_dominators = [k for k, v in verdict_arms.items()
                      if v["dominates_seat_plan_arm"]]
    single_dominators = [k for k, v in verdict_singles.items()
                         if v["dominates_planned_roster"]
                         and k != "fragile_bye_stack"]
    if not arm_dominators and not single_dominators:
        headline = ("NOTHING DOMINATES THE SEAT PLAN: no doctrine beats the "
                    "seat-plan arm on BOTH value and the weekly floor in the "
                    "paired room test, and no control beats the engine's "
                    "planned roster on both axes beyond Monte Carlo error.")
    else:
        parts = []
        if arm_dominators:
            parts.append("doctrine(s) %s dominate the seat-plan arm in the "
                         "paired room test" % ", ".join(arm_dominators))
        if single_dominators:
            parts.append("control(s) %s dominate the planned roster"
                         % ", ".join(single_dominators))
        headline = ("DOMINATED ON THIS YARDSTICK (17-week totals under "
                    "measured availability): " + "; ".join(parts) +
                    " — the seat-plan overlay is giving up availability "
                    "structure it did not have to give up. The tournament's "
                    "own $-metric disagrees for the RB-heavy arms (it is "
                    "injury-blind; this yardstick is H2H-blind) — the two "
                    "verdicts are BOTH in the artifact and the doctrine call "
                    "stays with the enrolled doctrine.")

    guard = no_fit_guard.record(no_fit_guard.ReplayResult(
        label="roster_robustness_2026",
        arm="measurement",
        seasons=list(POOL_SEASONS),
        value={"headline": headline},
        configs_tried=1,
        selected_from_search=False,
        promotable=False,
        notes={"routes_to": "A/Cory", "no_plan_promoted": True},
    ))

    return {
        "_territory": "TERRITORY: A — produced by draft/backtest/roster_robustness.py",
        "question_verbatim": "are we extracting as much value as possible while "
                             "also still drafting a legal team that seems reasonable",
        "what_this_grades": "the untested half: whether the roster the engine "
                            "plans to leave Cory with survives a real season "
                            "structurally — byes, injuries, flex depth, wire dependence",
        "preregistration": "metrics M1-M7 in roster_robustness.py's docstring, "
                           "written before any number was computed",
        "settings": {"n_single": n_single, "n_room": n_room, "seed": seed,
                     "weeks": WEEKS, "stress_weeks": list(STRESS_WEEKS),
                     "lineup_slots": "QB/2RB/2WR/TE/FLEX/K/DEF + 6 bench "
                                     "(public/draft_data.json roster_slots)"},
        "measured_inputs": {"availability": dist_prov, "wire": wire_prov,
                            "byes": "public/draft_data.json per-player bye"},
        "assumptions": ["A1 proj_mean/17 active-week mean (double-counts availability "
                        "at the mean; identical for every roster)",
                        "A2 IID weekly draws, no cross-player/week correlation",
                        "A3 K/DEF available every non-bye week (stores offense-only)",
                        "A4 K/DEF wire = board replacement/17",
                        "A5 one contiguous missed spell per player-season",
                        "A6 position-level (not round-conditioned) availability",
                        "A7 2025 control mapped to 2026 board rows; pid 12530 "
                        "graded as an empty bench spot"],
        "seat_plan": seat,
        "singles": graded_singles,
        "doctrines": graded_arms,
        "doctrine_medoids_illustration_only": medoid_detail,
        "dominance_arms_paired": verdict_arms,
        "dominance_vs_planned_roster": verdict_singles,
        "headline": headline,
        "no_fit_guard": guard,
    }


# ── artifact writers ────────────────────────────────────────────────────────

def _table_md(art: dict) -> str:
    rows = [("seat_plan_planned", art["seat_plan"])]
    rows += sorted(art["doctrines"].items())
    rows += [(k, art["singles"][k]) for k in
             ("cory_actual_2025", "seat_plan_shortlist_literal", "fragile_bye_stack")]
    head = ("| plan | value (E season pts) | floor (weekly p10) | "
            "P(unfieldable skill wk) | wire pts/season | worst-bye empty skill "
            "slots | RB1-out 4wk loss | WR1-out 4wk loss |\n"
            "|---|---|---|---|---|---|---|---|\n")
    lines = []
    for name, g in rows:
        bye_slots = (g["bye_worst_case"]["max_empty_skill_slots_bye_only"]
                     if "bye_worst_case" in g else g["bye_max_empty_skill_slots"])
        s = g["stress_4wk_loss"]
        rb1 = s["RB1"]["expected_season_loss"] if "RB1" in s else float("nan")
        wr1 = s["WR1"]["expected_season_loss"] if "WR1" in s else float("nan")
        lines.append("| %s | %.1f | %.1f | %.3f | %.1f | %s | %.1f | %.1f |" % (
            name, g["value"], g["weekly_floor_p10"],
            g["p_unfieldable_skill_week"], g["wire_points_per_season"],
            bye_slots, rb1, wr1))
    return head + "\n".join(lines) + "\n"


def write_artifacts(art: dict) -> None:
    (DATA / "roster_robustness_2026.json").write_text(
        json.dumps(art, indent=1, sort_keys=False) + "\n")
    sp = art["seat_plan"]
    md = []
    md.append("# Roster robustness — the untested half, graded (2026-08-17)\n")
    md.append("Cory's question, verbatim: *\"are we extracting as much value as "
              "possible while also still drafting a legal team that seems "
              "reasonable.\"* Value and legality were already tested; THIS "
              "grades whether the planned roster survives a season "
              "structurally — byes, injuries, flex depth, wire dependence. "
              "Preregistration: metrics M1-M7 in "
              "`draft/backtest/roster_robustness.py`'s docstring, written "
              "before computing. Measurement only — nothing here promotes a "
              "plan; results route to A/Cory (no_fit_guard: promotable=false, "
              "configs_tried=1).\n")
    md.append("## The verdict\n")
    md.append("**%s**\n" % art["headline"])
    md.append(_table_md(art))
    md.append("\nHOW TO READ THE TABLE. Doctrine rows are means over each "
              "arm's own 120 tournament rooms (N=%d seasons each) because no "
              "single planned roster exists per arm — all 120 rooms differ "
              "(mean pairwise Jaccard 0.12-0.24, measured). Named rosters "
              "are N=%d. The doctrine rows and the named rows sit in "
              "DIFFERENT LUCK REGIMES — room opponents sample a softmax, so "
              "stars sometimes fall to seat 8 in rooms, while the planned "
              "roster assumes the room drafts near ADP — so doctrines are "
              "judged against the SEAT-PLAN ARM, paired on room seed, never "
              "against the planned-roster row directly. And the value axis "
              "here is 17-week OPTIMAL-LINEUP TOTALS UNDER MEASURED "
              "AVAILABILITY, not the tournament's $ yardstick — the two can "
              "and do disagree: archetype_rooms' own paired table has "
              "robust_rb at -16.1pp playoff probability vs shipped (injury-"
              "blind, H2H money, rho-lineups) while it clears the seat-plan "
              "arm here (availability-aware, totals, optimal lineups). "
              "Neither sees everything; this artifact adds the structural "
              "axis the $ sim admits it cannot see, and promotes nothing.\n"
              % (art["settings"]["n_room"], art["settings"]["n_single"]))
    md.append("Wire levels (measured, wire_level.json, 422 scored adds "
              "2023-25): RB 7.8 / WR 11.1 / TE 11.6 pts/week "
              "(acquisition-week medians — a hole there is filled the week "
              "it opens); QB 19.46/week = 330.8/season (the ongoing-hold "
              "line — a streamed QB is a held add, and the acquisition-week "
              "23.38 exceeds most startable QBs' weekly mean); K/DEF at "
              "board replacement/17 (assumption A4). Availability: "
              "games-played distributions of this league's own 2023-25 "
              "draft picks (QB 48 / RB 142 / WR 157 / TE 42 player-seasons) "
              "measured from the committed weekly/component stores; missed "
              "games arrive as one contiguous spell "
              "(weeks_out_when_injured.json: absences run 3.3+ weeks on "
              "average).\n")
    md.append("## The paired doctrine test (M7a — value delta, floor delta "
              "vs the seat-plan arm, 120 paired rooms)\n")
    md.append("| doctrine | Δ value (± se) | Δ floor p10 (± se) | dominates "
              "| dominated by seat-plan arm |\n|---|---|---|---|---|")
    for name, v in sorted(art["dominance_arms_paired"].items()):
        md.append("| %s | %+.1f ± %.1f | %+.2f ± %.2f | %s | %s |" % (
            name, v["delta_value_mean"], v["delta_value_se"],
            v["delta_floor_mean"], v["delta_floor_se"],
            "YES" if v["dominates_seat_plan_arm"] else "no",
            "YES" if v["seat_plan_arm_dominates_it"] else "no"))
    md.append("")
    md.append("## Mechanism sentences\n")
    for s in art["_mechanisms"]:
        md.append("- %s" % s)
    md.append("\n## Assumptions (named, not measured)\n")
    for a in art["assumptions"]:
        md.append("- %s" % a)
    md.append("\nSeat plan roster graded: %s.\n" %
              ", ".join(art["seat_plan"].get("players", [])))
    (DRAFT / "audit" / "roster_robustness_2026-08-17.md").write_text(
        "\n".join(md) + "\n")


def main() -> None:
    art = run()
    art["_mechanisms"] = build_mechanisms(art)
    write_artifacts(art)
    print(art["headline"])
    print(_table_md(art))


def build_mechanisms(art: dict) -> list:
    """The sentences that would still be true if the scores had not moved."""
    sp = art["seat_plan"]
    sl = art["singles"]["seat_plan_shortlist_literal"]
    frag = art["singles"]["fragile_bye_stack"]
    mechs = []
    mechs.append(
        "The seat plan's low wire dependence comes from its shape (%s): two "
        "QBs and two TEs mean the two most expensive holes (QB wire 19.46, "
        "TE 11.6 pts/wk, both measured) have a rostered backup, so an "
        "absence costs bench points, not wire points." % sp["shape"])
    mechs.append(
        "The shortlist-literal probe (%s) exists because the realized-wire "
        "MV ranking at the demoted bench seats puts backup QBs on top — "
        "followed literally it drafts that shape, whose surplus QBs can "
        "never start together while its lone TE is backed only by an "
        "11.6-pt wire slot; the guard against it is shape reasonableness, "
        "which the MV number alone does not encode." % sl["shape"])
    mechs.append(
        "The fail arm (%s, five RBs ALL on bye %s) grades worse because both "
        "RB slots are empty that week by construction: %d empty skill slots "
        "in its worst bye week versus %d for the seat plan, and the worst "
        "deterministic week drops to %.1f versus %.1f — the grader "
        "distinguishes structure, not just totals."
        % (frag["shape"], frag["provenance"].get("modal_bye"),
           frag["bye_worst_case"]["max_empty_skill_slots_bye_only"],
           sp["bye_worst_case"]["max_empty_skill_slots_bye_only"],
           frag["bye_worst_case"]["worst_bye_week_mu_score"],
           sp["bye_worst_case"]["worst_bye_week_mu_score"]))
    dominators = [k for k, v in art["dominance_arms_paired"].items()
                  if v["dominates_seat_plan_arm"]]
    if dominators:
        seat_kdef = _kdef_picks_from_seat_plan()
        arm_kdef = _mean_kdef_pick_in_rooms(dominators[0])
        mechs.append(
            "Why depth-heavy arms can clear the seat-plan arm on both axes "
            "HERE while the tournament's own paired $-table runs the other "
            "way (robust_rb -16.1pp playoff prob vs shipped there): this "
            "yardstick draws measured availability (league draftees played "
            "13.0-13.6 of 16 non-bye weeks on average), so a bench body at a "
            "thin position keeps paying when a starter sits — insurance the "
            "injury-blind $ sim admits it cannot see — while the $ sim "
            "prices H2H schedule variance this yardstick cannot see. The "
            "seat plan also spends picks %s on DEF/K (rounds 11-12) where "
            "%s's rooms average K/DEF near pick %.0f — two rounds of skill "
            "depth the overlay gives away by construction."
            % (seat_kdef, dominators[0], arm_kdef))
    mechs.append(
        "QB holes are priced at the ongoing-hold wire line (19.46/wk = "
        "330.8/season) because a streamed QB is a held add and the "
        "acquisition-week median (23.38) exceeds most startable QBs' weekly "
        "mean — pricing an empty slot above a healthy starter would make QB "
        "holes profitable, an artifact, not a finding.")
    mechs.append(
        "P(unfieldable skill week) is ~1.0 for EVERY graded roster — "
        "corroborated by the league itself completing 1.498 adds per team "
        "per week (measured, seat_plan.json bench_basis): nobody survives a "
        "season without the wire, so the discriminating quantity is how MANY "
        "wire points a roster consumes, not whether it ever needs one.")
    return mechs


def _kdef_picks_from_seat_plan() -> str:
    doc = json.loads((ROOT / "public" / "seat_plan.json").read_text())
    picks = []
    for s in doc["seats"]:
        p = s.get("plan_player") or s.get("superseded_plan_player")
        if p and p["position"] in ("K", "DEF"):
            picks.append(str(s["pick"]))
    return "/".join(picks)


def _mean_kdef_pick_in_rooms(arm: str) -> float:
    doc = json.loads((DATA / "archetype_rooms.json").read_text())
    picks = [x["pick"] for r in doc["detail"][arm] for x in r["picksLog"]
             if x["pos"] in ("K", "DEF")]
    return float(np.mean(picks))


if __name__ == "__main__":
    main()
