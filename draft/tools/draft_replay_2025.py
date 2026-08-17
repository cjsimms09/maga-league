# TERRITORY: A
"""DRAFT REPLAY — the tool in Cory's real seat, against the drafts that
actually happened. Built 2026-08-16.

CORY'S QUESTION, VERBATIM (2026-08-16): "Have we tested our draft model vs
previous year? Would it have drafted a better or worse team for me?"
The honest answer before this file existed: NO. This file is the test.
Cory's follow-up ruling the same day ("Do 1, 2, 3, 6!!" — item 3 = the
multi-year replay) extends it to 2023 and 2024 under the same discipline.

── THE REPLAY, DEFINED ────────────────────────────────────────────────────────

For each replay season Y in {2023, 2024, 2025}: the league's REAL draft is
read from the committed `draft/data/league_history.json`. The tool sits in
Cory's actual seat (roster_id 1 in every season). At each of Cory's real
NON-KEEPER pick slots the tool chooses the best available player by its own
logic; every OTHER owner's actual pick stays exactly as history recorded it.
Cory's keepers that season apply exactly as they actually were (2025: Chase/
Nabers/Henry; 2024: Chase; 2023: Chase/Cooper-slot/Waddle-slot — read from
the season's keeper records, incl. 2023's separate 30-pick keeper ledger
draft, whose picks all carry is_keeper).

FIXED-OPPONENTS COUNTERFACTUAL — NAMED PROMINENTLY: opponents never react.
If the tool takes a player an opponent actually drafted later, history does
not cascade — that later historical pick is counted as SHADOWED and reported.
No butterfly effects of any kind are modeled. Only two rosters are ever
graded (the tool's and Cory's actual drafted roster), so shadowing cannot
contaminate the verdict.

── THE PICK POLICY (which arm is tested, said plainly) ────────────────────────

The full shipped engine (VONA wire, KOV, survival, live board fields) CANNOT
run period-correct — it is wired to the 2026 board and 2026 market fields.
What is tested instead is the VALUE-POLICY CORE the roster-construction pass
(draft/audit/roster_construction_2026-08-16.md) measured as the dominant
family: BPA-by-VORP with needs rails —

  · candidates: every player with a walk-forward projection (see below);
  · VORP = projection − replacement, replacement from the repo's own
    `draft/vorp.py replacement_levels` under the season's real league config
    (10 teams, QB1/RB2/WR2/TE1/FLEX1/K1/DEF1), computed once pre-draft;
  · rails, PRIMARY: position caps QB≤2 RB≤7 WR≤7 TE≤2 and a feasibility rail
    that forces a starter-filling position when remaining picks equal
    unfilled starter slots; deterministic tie-break (VORP desc, projection
    desc, pid asc). The onesie caps are derived A PRIORI from the lineup
    structure — QB and TE have one starting slot and no flex path, so a
    third can never start; a rail that lets raw VORP buy a never-startable
    third onesie (the exact §5 pathology the roster-construction audit
    documented for raw VORP in this 6-pt-pass-TD league) is not a needs
    rail. The looser measured ROOM caps (QB≤3/TE≤3) run as a sensitivity
    arm so nothing rests on this choice unseen;
  · K/DEF are MIRRORED: at the slots where Cory actually took a K or DEF the
    tool takes the same player. No period-correct K/DEF projections exist on
    committed stores, and the roster-construction audit measured K/DEF
    timing as free. K/DEF therefore cancel exactly in every tool-vs-actual
    comparison.

── LEAKAGE DISCIPLINE (what the tool is allowed to know) ──────────────────────

The tool may know only what was knowable pre-Y-draft. Projections are built
walk-forward by the GRADED own_v6 construction (model_accuracy_v5/v6:
v4's QB arm = recency blend × availability correction; v5's component
RB/WR/TE arms under the frozen V5_CONFIG), refit per season on the one
strictly-prior transition exactly as v6 does for 2025 (fit Y−2 → Y−1,
predict Y with (Y−2, Y−1) priors):

    replay 2025: fit 2023→2024, priors (2023, 2024)   — v6's own shape
    replay 2024: fit 2022→2023, priors (2022, 2023)
    replay 2023: fit 2021→2022, priors (2021, 2022)

2021/2022 season points come from the committed component stores scored
under the frozen table (`fetch_component_stats.scored_weekly_points`) — the
parity-pinned construction. NOTHING from season Y or later enters any
feature: no Y actuals, no Y-informed ADP, no current-board fields.
`own_model_v2._assert_no_leak` guards every feature build, and the leakage
test traces every file open on the projection path.

ONE DELIBERATE, NAMED DEVIATION FROM GRADED v6 — THE MARKET ARM IS REMOVED
(`own_v6_nomarket`): v5/v6's RB/WR/TE arms carry a marker-gated market
opinion read from THE SEASON-Y LEAGUE DRAFT — the exact event being
replayed. Feeding the tool the room's own picks would be circular, so the
ensemble runs with the market weight renormalized away (build_v5's own
declared fallback path). This WEAKENS the tested arm relative to graded v6
(the ablation ladder priced the market arm at ~+1..+2.6 MAE at RB/WR/TE);
the verdict tests the weaker, honest arm and says so.

TWO NAMED EDGES OF THE INFORMATION SET, kept from the graded construction:
  · Vegas WEEK-1 lines (v5's declared feature) close in early September —
    AFTER a late-August draft. They are kept because the graded construction
    carries them, as a proxy for the preseason team-strength market that did
    exist at draft time. Named, not hidden.
  · ages come from the 2026 board back-projected arithmetically (v2's
    declared, time-invariant construction). Only the age field is consumed.

STRUCTURAL LIMIT, NAMED LOUDLY — NO ROOKIES ON THE TOOL'S BOARD: a
walk-forward projection needs a prior NFL season, so season-Y rookies do not
exist for the tool. Real drafters took rookies (Cory's actual 2024 draft
spent five picks on them, including Nabers and Daniels). Every rookie pick
the tool could not see is counted per season in the artifact.

SECOND STRUCTURAL LIMIT, NAMED LOUDLY — NO NEWS ON THE TOOL'S BOARD: the
committed stores carry no roster-status news, so a player who retired or
sat unsigned before the season-Y draft still carries a projection (2023:
the unfiltered board prices Tom Brady off his 2021-22 seasons; Fournette
was unsigned). That knowledge WAS public pre-draft — real drafters had it,
the walk-forward board does not. Bracketed, not hidden: the primary arm
runs the honest unfiltered board; a ROOM-DRAFTABLE sensitivity arm
restricts candidates to players somebody actually drafted in the season-Y
league draft. The filter's leak direction is named: it imports the room's
curation of the exact event being replayed (it removes the room's genuine
news knowledge AND its mere value opinions), so it is a bracket edge, not
the primary number.

── SCORING THE VERDICT (reality, not projections) ─────────────────────────────

Both rosters — the tool's and Cory's actual drafted roster, both FROZEN as
drafted (no waivers, no trades: the question is about the DRAFT) — are
graded on ACTUAL season-Y weekly points from the committed weekly stores
(weeks 1–17), two ways:

  (a) WEEKLY OPTIMAL lineup (hindsight-best legal lineup each week) — the
      roster-quality measure, and the primary number;
  (b) REALISTIC lineup under start-of-week information: each week, start the
      highest-ranked legal lineup where rank = season-to-date points/game
      through week t−1 (week 1: walk-forward projection ÷ 17), and a player
      with no scored row in week t is treated as known-inactive and benched.
      Named approximations: row-presence stands in for the inactive report
      (in-game exits count as if foreseen), and the same rule is applied to
      BOTH rosters, so the bias cancels to first order.

Skill slots only (QB/RB/RB/WR/WR/TE/FLEX) — K/DEF are identical on both
rosters by construction and are excluded from lineup scoring. One 2025
Cory pick (pid 12530, pick 64) is missing from the committed positions
record (the repo's own draft_behavior.json names it as the league's single
position-less decision); he is excluded from lineups in the base arms and
a SENSITIVITY arm re-scores Cory's roster with him FLEX-eligible — the
verdict must survive the bound, and both numbers are in the artifact.

RECORD REPLAY: the counterfactual weekly scores (skill-7 + the shared
mirrored K/DEF's actual weekly points from league data) are replayed
against Cory's REAL schedule and his REAL opponents' actual full-season
scores (waivers and all), weeks 1..playoff start. Reported for the tool
roster AND for Cory's frozen drafted roster (same treatment), beside his
actual record. The champodds machinery is deliberately NOT run — it is
built around 2026 inputs; the record replay from the real schedule is the
honest substitute and is labeled as informational (frozen roster vs managed
opponents is biased low for BOTH counterfactual arms equally).

── HONESTY RULES CARRIED INTO THE ARTIFACT ────────────────────────────────────

One year is one sample and three years are three. Fixed opponents = no
butterfly effects. The projections are the SEASON-VINTAGE construction
(what the model could have been that August), minus the market arm — this
tests the construction as it would have been, not 2026's tuned version.
If Cory's actual team wins any comparison, that is the finding and it is
published exactly as loudly.

Run: python draft/tools/draft_replay_2025.py
Writes draft/data/draft_replay_2025.json (deterministic byte-for-byte).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent          # draft/tools
DRAFT = HERE.parent
ROOT = DRAFT.parent
BT = DRAFT / "backtest"
sys.path.insert(0, str(BT))
sys.path.insert(0, str(DRAFT))

import fetch_component_stats as FCS  # noqa: E402
import own_model_v5 as V5  # noqa: E402
from model_accuracy_backtest import positions_record  # noqa: E402
from own_model_v2 import (  # noqa: E402
    EXPECTED_GAMES,
    LATE_FROM,
    LATE_MIN_GAMES,
    POSITIONS,
    RECENCY_WEIGHTS,
    _age_mult,
    _assert_no_leak,
    board_ages,
    fit_transition,
    predict,
)
from own_model_v3 import build_v3  # noqa: E402
from own_model_v4 import (  # noqa: E402
    build_v4,
    qb_active_games,
    qb_availability_correction,
)
from vorp import replacement_levels  # noqa: E402

LEAGUE_HISTORY = DRAFT / "data" / "league_history.json"
OUT = DRAFT / "data" / "draft_replay_2025.json"

REPLAY_SEASONS = (2025, 2024, 2023)   # 2025 first — the question as asked
CORY_ROSTER_ID = 1                    # coryjsimms in every recorded season
LAST_SCORED_WEEK = 17
# PRIMARY caps: onesie positions (one starting slot, no flex path) cap at 2 —
# a third QB/TE can never start, so a needs rail must refuse it (the raw-VORP
# onesie-hoarding pathology is documented in roster_construction_2026-08-16 §5).
POSITION_CAPS = {"QB": 2, "RB": 7, "WR": 7, "TE": 2}
# Sensitivity: the measured three-season ROOM rails (rooms do occasionally
# carry a third onesie) — reported beside the primary, never headline.
ROOM_CAPS = {"QB": 3, "RB": 7, "WR": 7, "TE": 3}
STARTER_SLOTS = {"QB": 1, "RB": 2, "WR": 2, "TE": 1}
FLEX_SLOTS = 1
FLEX_ELIGIBLE = ("RB", "WR", "TE")
LEAGUE_CFG = {"teams": 10,
              "starters": {"QB": 1, "RB": 2, "WR": 2, "TE": 1,
                           "FLEX": 1, "K": 1, "DEF": 1}}

QUESTION_VERBATIM = ("Have we tested our draft model vs previous year? "
                     "Would it have drafted a better or worse team for me?")

# The frozen scoring table lives in the 2023 weekly store (one fingerprint
# across every committed store, pinned by test_component_stats). It is league
# CONFIGURATION, not player outcomes — but so the PROJECTION path never has to
# open a ≥2023 store file to read it, it is fetched once and memoized here.
_FROZEN_TABLE: dict = {}
_frozen_table_orig = FCS.frozen_scoring_table


def frozen_table() -> dict:
    if not _FROZEN_TABLE:
        _FROZEN_TABLE.update(_frozen_table_orig())
    return _FROZEN_TABLE


FCS.frozen_scoring_table = frozen_table   # memoized for V5.season_profiles too


# ── season points, generalized to 2021+ (the walk-forward substrate) ─────────

def weekly_points_of(season: int) -> dict:
    """{pid: {week: pts}}, weeks 1..17. 2023+ come from the committed weekly
    stores (the direct scored record); 2021/2022 from the component stores
    scored under the frozen table — the parity-pinned construction."""
    if season >= 2023:
        store = json.loads(
            (BT / f"nflverse_weekly_points_{season}.json").read_text())
        out: dict[str, dict[int, float]] = {}
        for w in store["weeks"]:
            if not (1 <= w["week"] <= LAST_SCORED_WEEK):
                continue
            for pid, v in w["points"].items():
                out.setdefault(str(pid), {})[int(w["week"])] = float(v)
        return out
    return {pid: {int(w): float(v) for w, v in rows.items()}
            for pid, rows in FCS.scored_weekly_points(
                season, frozen_table(), LAST_SCORED_WEEK).items()}


def season_totals_of(season: int) -> tuple[dict, dict]:
    # NO rounding here — the graded modules sum raw floats, and the parity
    # test pins this function to their output bit for bit.
    wk = weekly_points_of(season)
    totals = {pid: sum(rows.values()) for pid, rows in wk.items()}
    games = {pid: len(rows) for pid, rows in wk.items()}
    return totals, games


def late_rates_of(season: int) -> dict:
    """v2's trend window (weeks LATE_FROM..17, ≥ LATE_MIN_GAMES rows)."""
    wk = weekly_points_of(season)
    out = {}
    for pid, rows in wk.items():
        late = [v for w, v in rows.items() if LATE_FROM <= w <= LAST_SCORED_WEEK]
        if len(late) >= LATE_MIN_GAMES:
            out[pid] = sum(late) / len(late)
    return out


def features_of(target_season: int, prior_seasons: tuple, positions: dict,
                ages_2026: dict) -> dict:
    """own_model_v2.features_for's exact math over the generalized point
    source (pinned equal to the original on store-backed seasons by test)."""
    _assert_no_leak(prior_seasons, target_season)
    y1 = max(prior_seasons)
    y2 = min(prior_seasons) if len(prior_seasons) > 1 else None
    tot1, games1 = season_totals_of(y1)
    tot2 = season_totals_of(y2)[0] if y2 is not None else {}
    late = late_rates_of(y1)
    w1, w2 = RECENCY_WEIGHTS
    out = {}
    for pid, t1 in tot1.items():
        pos = positions.get(pid)
        if pos not in POSITIONS:
            continue
        g1 = games1.get(pid, 0)
        if g1 <= 0:
            continue
        rate1 = t1 / g1
        lr = late.get(pid, rate1)
        t2 = tot2.get(pid)
        blend = (w1 * t1 + w2 * t2) if t2 is not None else t1
        age_2026 = ages_2026.get(pid)
        age_y = (float(age_2026) - (2026 - target_season)) \
            if age_2026 is not None else None
        am = _age_mult(pos, age_y)
        out[pid] = {"pos": pos, "x": am * blend,
                    "t": am * lr * EXPECTED_GAMES[pos], "g": float(g1),
                    "age_known": age_2026 is not None}
    return out


def baselines_of(target_season: int, prior_seasons: tuple) -> dict:
    y1, y2 = max(prior_seasons), min(prior_seasons)
    tot1 = season_totals_of(y1)[0]
    tot2 = season_totals_of(y2)[0]
    w1, w2 = RECENCY_WEIGHTS
    return {pid: (w1 * v + w2 * tot2[pid]) if pid in tot2 else v
            for pid, v in tot1.items()}


def build_projections(replay_season: int, positions: dict,
                      ages: dict) -> dict:
    """own_v6-vintage-Y, market arm removed. Pure walk-forward: nothing from
    season Y or later on this path (the leakage test traces it)."""
    priors = (replay_season - 2, replay_season - 1)
    _assert_no_leak(priors, replay_season)
    y1 = max(priors)
    # v2 arm: fit the one strictly-prior transition (Y−2 → Y−1), v6's shape.
    feat_fit = features_of(y1, (min(priors),), positions, ages)
    fits = fit_transition(feat_fit, season_totals_of(y1)[0])
    v2p = predict(features_of(replay_season, priors, positions, ages), fits)
    blend = baselines_of(replay_season, priors)
    # v3 with NO market (mrank {} → declared renormalized fallback).
    v3nm = build_v3(v2p, blend, {}, {}, positions)
    # v4's QB arm: blend × availability correction from Y−1 weekly rows.
    corr, _mu = qb_availability_correction(
        qb_active_games(weekly_points_of(y1), positions))
    v4nm = build_v4(v3nm, blend, corr, positions)
    # v5's component arms, market weight renormalized away (mrank {}).
    comp = V5.comp_opinion(replay_season, priors, positions, ages,
                           FCS.implied_team_totals(replay_season, 1, 1))
    v5nm = V5.build_v5(v3nm, comp, blend, corr, {}, {}, positions)
    # v6 composition: QB from the v4 arm, RB/WR/TE from the v5 arm.
    return {pid: (v4nm[pid] if positions.get(pid) == "QB" else v5nm[pid])
            for pid in sorted(v5nm)}


# ── deterministic roster-status filter (2026-08-17, the live-edge order) ─────
#
# THE BLINDNESS THIS CORRECTS, named in the second STRUCTURAL LIMIT above: the
# walk-forward board prices a player off his prior seasons even when his
# career was already over before season Y's draft (Brady 2023 at 323 projected
# points). That knowledge was public pre-draft and the LIVE board verifiably
# carries it (replay_all_seats.roster_status_verification), so leaving such
# players on the replay board is a HARNESS information gap, not a model
# property. The filter below removes exactly the players COMMITTED data can
# prove never played again — zero fitted parameters, one deterministic rule.

LAST_COMMITTED_SEASON = 2025   # newest committed weekly store


def team_2026_map() -> dict:
    """{pid: team-or-None} from the committed 2026 live board. 'FA'/empty
    count as teamless. Reporting/corroboration only — never a projection
    input."""
    d = json.loads((ROOT / "public" / "draft_data.json").read_text())
    out = {}
    for p in d["players"]:
        team = p.get("team")
        out[str(p["player_id"])] = team if team and team != "FA" else None
    return out


def roster_status_exclusions(season: int, proj: dict) -> tuple[dict, list]:
    """(excluded, kept_indeterminate) for season Y's walk-forward board.

    THE RULE, verbatim: a projected player is excluded iff he has ZERO
    recorded games in EVERY committed season Y..2025, AND — when Y is 2025,
    where no later season exists to corroborate — he is also absent from or
    teamless on the committed 2026 live board. A player whose status cannot
    be determined this way STAYS on the board and is returned in
    `kept_indeterminate` (zero games Y..2025 but a 2026 team recorded).

    BOTH ERROR DIRECTIONS, named:
      · over-exclusion (flatters the tool): a player lost for season Y AFTER
        Y's draft who never returned in any committed season is excluded even
        though his absence was not knowable at draft time. Every excluded
        player is listed by name in the artifact so this is auditable.
      · under-exclusion (flatters the human): a player publicly retired,
        unsigned or out-for-season at Y's draft who nonetheless logged any
        later committed game (the Fournette-2023 pattern), or whose 2026
        board row carries a team (the kept_indeterminate list), stays on the
        board — the original status blindness persists for him and is
        recorded rather than guessed at. NO new network fetches; committed
        stores only.
    """
    played: set[str] = set()
    for s in range(season, LAST_COMMITTED_SEASON + 1):
        played |= set(weekly_points_of(s))
    zero = [pid for pid in proj if pid not in played]
    excluded, kept = {}, []
    t26 = team_2026_map() if season == LAST_COMMITTED_SEASON else None
    for pid in sorted(zero):
        if t26 is not None and t26.get(pid):
            kept.append(pid)
            continue
        excluded[pid] = {
            "zero_game_seasons": list(range(season,
                                            LAST_COMMITTED_SEASON + 1)),
            "team_2026": (t26 or {}).get(pid) if t26 is not None else None,
        }
    return excluded, kept


FIRST_COMMITTED_SEASON = 2021  # oldest committed store a board can price from


def roster_status_exclusions_all(season: int) -> tuple[dict, list]:
    """The SAME rule as roster_status_exclusions, over the BOARD-AGNOSTIC
    population: every player with at least one recorded game in a committed
    season strictly before Y. Needed because different walk-forward boards
    price different populations — the proxy board requires a Y-1 season, but
    the backtest bundle board projects off Y-2 as well, so a 2023 bundle
    carries players (Gronkowski, retired after 2021) the proxy board never
    saw and the board-scoped exclusion list therefore missed. Same sources,
    same corroboration, same both-directions honesty."""
    prior: set[str] = set()
    for s in range(FIRST_COMMITTED_SEASON, season):
        prior |= set(weekly_points_of(s))
    return roster_status_exclusions(season, {p: 0.0 for p in prior})


# ── the season's real draft, from league history ─────────────────────────────

def season_record(season: int) -> dict:
    doc = json.loads(LEAGUE_HISTORY.read_text())
    for s in doc["seasons"]:
        if str(s.get("season")) == str(season):
            return s
    raise ValueError(f"season {season} not in league history")


def season_draft(srec: dict) -> tuple[list, set]:
    """(picks of the real draft, keeper pids across ALL the season's draft
    records). 2023 keeps its keepers in a separate 30-pick ledger draft whose
    picks all carry is_keeper — the union covers both shapes."""
    drafts = [d for d in srec.get("drafts", []) if d.get("status") == "complete"]
    if not drafts:
        raise ValueError(f"no completed draft for season {srec.get('season')}")
    main = max(drafts, key=lambda d: len(d.get("picks", [])))
    keepers = {str(p["player_id"])
               for d in drafts for p in d.get("picks", [])
               if p.get("is_keeper")}
    picks = sorted(main["picks"], key=lambda p: p["pick_no"])
    return picks, keepers


# ── the replay (pure function of its inputs — fixture-testable) ──────────────

def replay_draft(picks: list, keeper_pids: set, proj: dict, repl: dict,
                 positions: dict, cory_roster_id: int = CORY_ROSTER_ID,
                 caps: dict = POSITION_CAPS, starters: dict = STARTER_SLOTS,
                 flex_slots: int = FLEX_SLOTS,
                 allowed_pids: set | None = None) -> dict:
    """Runs the fixed-opponents counterfactual. Returns the pick log, the
    tool's roster, and the counters. Deterministic. `allowed_pids` is the
    room-draftable sensitivity filter (None = the honest unfiltered board)."""
    taken: set[str] = set()
    tool_pids: set[str] = set()
    counts = {p: 0 for p in caps}
    log = []
    shadowed = []
    forced_picks = 0

    cory_live = [p for p in picks
                 if p["roster_id"] == cory_roster_id
                 and not (p.get("is_keeper") or str(p["player_id"]) in keeper_pids)]
    skill_left = sum(1 for p in cory_live
                     if positions.get(str(p["player_id"])) not in ("K", "DEF"))

    def flex_used() -> int:
        return sum(max(0, counts[q] - starters[q]) for q in FLEX_ELIGIBLE)

    def unfilled_starters() -> int:
        need = sum(max(0, n - counts[p]) for p, n in starters.items())
        return need + max(0, flex_slots - flex_used())

    for p in picks:
        pid = str(p["player_id"])
        pos = positions.get(pid)
        if p["roster_id"] != cory_roster_id:
            taken.add(pid)
            if pid in tool_pids:
                shadowed.append({"pick_no": p["pick_no"], "player_id": pid})
            log.append({"pick_no": p["pick_no"], "roster_id": p["roster_id"],
                        "player_id": pid, "how": "history"})
            continue
        if p.get("is_keeper") or pid in keeper_pids:
            taken.add(pid)
            tool_pids.add(pid)
            if pos in counts:
                counts[pos] += 1
            log.append({"pick_no": p["pick_no"], "roster_id": p["roster_id"],
                        "player_id": pid, "how": "keeper"})
            continue
        if pos in ("K", "DEF"):
            taken.add(pid)
            tool_pids.add(pid)
            log.append({"pick_no": p["pick_no"], "roster_id": p["roster_id"],
                        "player_id": pid, "how": f"mirror_{pos}"})
            continue
        # the tool's pick: BPA-by-VORP with the rails.
        forced = skill_left <= unfilled_starters()
        best = None
        for cand in sorted(proj):
            if cand in taken:
                continue
            if allowed_pids is not None and cand not in allowed_pids:
                continue
            cpos = positions.get(cand)
            if cpos not in caps or counts[cpos] >= caps[cpos]:
                continue
            if forced:
                fills_dedicated = counts[cpos] < starters[cpos]
                fills_flex = cpos in FLEX_ELIGIBLE and flex_used() < flex_slots
                if not (fills_dedicated or fills_flex):
                    continue
            v = proj[cand] - repl.get(cpos, 0.0)
            key = (-v, -proj[cand], cand)
            if best is None or key < best[0]:
                best = (key, cand, cpos)
        if best is None:
            raise RuntimeError("no legal candidate — board exhausted")
        _, chosen, cpos = best
        taken.add(chosen)
        tool_pids.add(chosen)
        counts[cpos] += 1
        skill_left -= 1
        if forced:
            forced_picks += 1
        log.append({"pick_no": p["pick_no"], "roster_id": p["roster_id"],
                    "player_id": chosen, "how": "tool",
                    "replaces": pid, "forced": forced,
                    "vorp": round(proj[chosen] - repl.get(cpos, 0.0), 2)})

    return {"log": log, "tool_roster": sorted(tool_pids),
            "position_counts": counts, "shadowed_picks": shadowed,
            "forced_picks": forced_picks}


# ── lineup arms ──────────────────────────────────────────────────────────────

def optimal_week_points(roster: list, positions: dict, week_pts: dict,
                        unknown_flex: bool = False) -> float:
    """Hindsight-best legal lineup for one week: greedy dedicated slots then
    best remaining flex — exact for this slot structure. Unknown-position
    players are excluded unless unknown_flex (the sensitivity bound)."""
    pts = {p: week_pts.get(p, 0.0) for p in roster}
    used: set[str] = set()
    total = 0.0
    for pos, n in STARTER_SLOTS.items():
        ranked = sorted(((pts[p], p) for p in roster
                         if positions.get(p) == pos and p not in used),
                        key=lambda t: (-t[0], t[1]))
        for v, p in ranked[:n]:
            used.add(p)
            total += v
    flex_pool = [p for p in roster if p not in used
                 and (positions.get(p) in FLEX_ELIGIBLE
                      or (unknown_flex and positions.get(p) is None
                          and not p.isalpha()))]
    ranked = sorted(((pts[p], p) for p in flex_pool),
                    key=lambda t: (-t[0], t[1]))
    for v, p in ranked[:FLEX_SLOTS]:
        total += v
    return round(total, 2)


def realistic_week_points(roster: list, positions: dict, weekly: dict,
                          week: int, proj: dict,
                          unknown_flex: bool = False) -> float:
    """Start-of-week lineup: rank by season-to-date pts/game through week−1
    (week 1: projection ÷ 17; never-yet-played: projection ÷ 17); a player
    with no scored row THIS week is treated as known-inactive and benched.
    The rank uses no information from week t or later."""
    def rank(p: str) -> float:
        rows = [v for w, v in weekly.get(p, {}).items() if w < week]
        if rows:
            return sum(rows) / len(rows)
        return proj.get(p, 0.0) / 17.0

    active = [p for p in roster if week in weekly.get(p, {})]
    used: set[str] = set()
    total = 0.0
    for pos, n in STARTER_SLOTS.items():
        ranked = sorted(((rank(p), p) for p in active
                         if positions.get(p) == pos and p not in used),
                        key=lambda t: (-t[0], t[1]))
        for _v, p in ranked[:n]:
            used.add(p)
            total += weekly[p][week]
    flex_pool = [p for p in active if p not in used
                 and (positions.get(p) in FLEX_ELIGIBLE
                      or (unknown_flex and positions.get(p) is None
                          and not p.isalpha()))]
    ranked = sorted(((rank(p), p) for p in flex_pool),
                    key=lambda t: (-t[0], t[1]))
    for _v, p in ranked[:FLEX_SLOTS]:
        total += weekly[p][week]
    return round(total, 2)


def season_series(roster: list, positions: dict, weekly: dict, proj: dict,
                  arm: str, unknown_flex: bool = False) -> list:
    out = []
    for w in range(1, LAST_SCORED_WEEK + 1):
        wp = {p: weekly.get(p, {}).get(w, 0.0) for p in roster}
        if arm == "optimal":
            out.append(optimal_week_points(roster, positions, wp, unknown_flex))
        else:
            out.append(realistic_week_points(roster, positions, weekly, w,
                                             proj, unknown_flex))
    return out


# ── names (reporting only — never on the projection path) ────────────────────

def name_map() -> dict:
    names: dict[str, str] = {}

    def walk(o):
        if isinstance(o, dict):
            pid, nm = o.get("player_id"), o.get("name")
            if pid and nm and isinstance(nm, str):
                names.setdefault(str(pid), nm)
            for v in o.values():
                walk(v)
        elif isinstance(o, list):
            for v in o:
                walk(v)

    for path in (ROOT / "public" / "draft_data.json",
                 DRAFT / "data" / "pre_draft_freeze_2026.json",
                 DRAFT / "data" / "unprojected_snapshot.json",
                 DRAFT / "data" / "predicted_keepers.json"):
        try:
            walk(json.loads(path.read_text()))
        except (OSError, ValueError):
            continue
    return names


# ── one season's verdict ─────────────────────────────────────────────────────

def _pick_story(log: list, proj: dict, totals: dict, positions: dict,
                names: dict) -> list:
    rows = []
    for e in log:
        if e["how"] != "tool":
            continue
        t, a = e["player_id"], e["replaces"]
        rows.append({
            "pick_no": e["pick_no"],
            "round": (e["pick_no"] - 1) // 10 + 1,
            "tool": {"player_id": t, "name": names.get(t, t),
                     "pos": positions.get(t),
                     "proj": proj.get(t),
                     "actual": totals.get(t, 0.0)},
            "actual": {"player_id": a, "name": names.get(a, a),
                       "pos": positions.get(a),
                       "proj": proj.get(a),
                       "actual": totals.get(a, 0.0)},
            "actual_points_delta": round(totals.get(t, 0.0)
                                         - totals.get(a, 0.0), 2),
        })
    return rows


def _h2h(tool_series: list, cory_series: list) -> dict:
    tw = sum(1 for a, b in zip(tool_series, cory_series) if a > b)
    cw = sum(1 for a, b in zip(tool_series, cory_series) if b > a)
    return {"tool_weeks_won": tw, "cory_weeks_won": cw,
            "ties": len(tool_series) - tw - cw}


def _summary(series: list) -> dict:
    return {"season_total": round(sum(series), 2),
            "weekly_mean": round(sum(series) / len(series), 2)}


def record_replay(srec: dict, tool_series: list, cory_series: list,
                  kdef_pids: list) -> dict:
    """The counterfactual rosters against Cory's REAL schedule and his REAL
    opponents' actual scores (waivers and all). Informational: both frozen
    rosters carry the same no-waivers bias, so the tool-vs-drafted delta is
    the meaningful part. Shared mirrored K/DEF weekly points are added to
    both sides identically (missing league rows count 0 and are counted)."""
    last = int(srec["settings"].get("playoff_week_start", 16)) - 1
    weeks = srec["weeks"]
    kdef_missing = 0
    rows = []
    rec = {"tool": [0, 0, 0], "cory_drafted": [0, 0, 0], "cory_actual": [0, 0, 0]}
    for w in range(1, last + 1):
        ms = weeks.get(str(w)) or []
        mine = [m for m in ms if m["roster_id"] == CORY_ROSTER_ID]
        if not mine:
            continue
        me = mine[0]
        opp = [m for m in ms if m.get("matchup_id") == me.get("matchup_id")
               and m["roster_id"] != CORY_ROSTER_ID]
        if not opp:
            continue
        opp_pts = float(opp[0]["points"])
        kdef = 0.0
        for pid in kdef_pids:
            found = None
            for m in ms:
                pp = m.get("players_points") or {}
                if pid in pp:
                    found = float(pp[pid])
                    break
            if found is None:
                kdef_missing += 1
            else:
                kdef += found
        entries = {
            "tool": round(tool_series[w - 1] + kdef, 2),
            "cory_drafted": round(cory_series[w - 1] + kdef, 2),
            "cory_actual": float(me["points"]),
        }
        for k, v in entries.items():
            i = 0 if v > opp_pts else (1 if v < opp_pts else 2)
            rec[k][i] += 1
        rows.append({"week": w, "opponent_roster_id": opp[0]["roster_id"],
                     "opponent_points": opp_pts, **entries})
    return {"regular_season_weeks": last,
            "records_w_l_t": {k: v for k, v in rec.items()},
            "kdef_week_rows_missing_counted_zero": kdef_missing,
            "weeks": rows}


def replay_season(season: int, positions: dict, ages: dict,
                  names: dict) -> dict:
    proj = build_projections(season, positions, ages)
    pool = [{"position": positions[p], "proj_mean": v}
            for p, v in sorted(proj.items())]
    repl, repl_diag = replacement_levels(pool, LEAGUE_CFG)

    srec = season_record(season)
    picks, keeper_pids = season_draft(srec)
    rep = replay_draft(picks, keeper_pids, proj, repl, positions)

    weekly = weekly_points_of(season)
    totals = {pid: round(sum(rows.values()), 2) for pid, rows in weekly.items()}

    cory_picks = [p for p in picks if p["roster_id"] == CORY_ROSTER_ID]
    cory_all = [str(p["player_id"]) for p in cory_picks]
    kdef = [p for p in cory_all if positions.get(p) in ("K", "DEF")]

    def skill(pids):
        return sorted(p for p in pids if positions.get(p) not in ("K", "DEF"))

    tool_skill = skill(rep["tool_roster"])
    cory_skill = skill(cory_all)

    # sensitivity grid: caps {primary onesie-2, measured room-3} × candidate
    # pool {unfiltered walk-forward board, room-draftable}. The primary cell
    # (onesie caps × unfiltered) is `rep` above; the other three run here and
    # report the optimal-arm delta only — brackets, never headlines.
    room_pool = {str(p["player_id"]) for p in picks}
    sensitivity = {}
    for cell, (caps, pool) in {
        "room_caps": (ROOM_CAPS, None),
        "room_draftable_pool": (POSITION_CAPS, room_pool),
        "room_caps_and_pool": (ROOM_CAPS, room_pool),
    }.items():
        srep = replay_draft(picks, keeper_pids, proj, repl, positions,
                            caps=caps, allowed_pids=pool)
        s_skill = skill(srep["tool_roster"])
        ts = season_series(s_skill, positions, weekly, proj, "optimal")
        cs = season_series(cory_skill, positions, weekly, proj, "optimal")
        sensitivity[cell] = {
            "tool_optimal_total": round(sum(ts), 2),
            "delta_tool_minus_cory": round(sum(ts) - sum(cs), 2),
            "head_to_head": _h2h(ts, cs),
            "tool_roster": [{"player_id": p, "name": names.get(p, p),
                             "actual": totals.get(p, 0.0)} for p in s_skill],
        }
    unknown_pos = sorted(p for p in set(tool_skill) | set(cory_skill)
                         if positions.get(p) is None)

    # rookies invisible to the tool: Cory's actual skill picks with no
    # walk-forward projection (no prior-season profile).
    invisible = sorted(p for p in cory_skill if p not in proj)

    arms = {}
    for arm in ("optimal", "realistic"):
        ts = season_series(tool_skill, positions, weekly, proj, arm)
        cs = season_series(cory_skill, positions, weekly, proj, arm)
        arms[arm] = {
            "tool": dict(_summary(ts), weekly=ts),
            "cory_drafted": dict(_summary(cs), weekly=cs),
            "delta_tool_minus_cory": round(sum(ts) - sum(cs), 2),
            "delta_weekly_mean": round((sum(ts) - sum(cs)) / len(ts), 2),
            "head_to_head": _h2h(ts, cs),
        }
    # sensitivity bound: unknown-position players FLEX-eligible (2025's 12530)
    if unknown_pos:
        ts = season_series(tool_skill, positions, weekly, proj, "optimal", True)
        cs = season_series(cory_skill, positions, weekly, proj, "optimal", True)
        arms["optimal_unknown_flex_bound"] = {
            "tool": _summary(ts), "cory_drafted": _summary(cs),
            "delta_tool_minus_cory": round(sum(ts) - sum(cs), 2),
            "head_to_head": _h2h(ts, cs),
        }

    per_pos = {}
    for pos in POSITIONS:
        per_pos[pos] = {
            "tool_rostered_actual_pts": round(sum(
                totals.get(p, 0.0) for p in tool_skill
                if positions.get(p) == pos), 2),
            "cory_rostered_actual_pts": round(sum(
                totals.get(p, 0.0) for p in cory_skill
                if positions.get(p) == pos), 2),
        }

    rr = record_replay(srec, arms["realistic"]["tool"]["weekly"],
                       arms["realistic"]["cory_drafted"]["weekly"], kdef)

    def roster_rows(pids):
        return [{"player_id": p, "name": names.get(p, p),
                 "pos": positions.get(p), "proj": proj.get(p),
                 "actual": totals.get(p, 0.0)} for p in pids]

    return {
        "season": season,
        "league_name": srec.get("name"),
        "prior_seasons": [season - 2, season - 1],
        "cory_keepers_applied": sorted(k for k in keeper_pids
                                       if k in cory_all),
        "replacement_points": {k: round(v, 2) for k, v in sorted(repl.items())},
        "replacement_diagnostics": {"starter_counts":
                                    repl_diag["starter_counts"]},
        "projection_coverage": len(proj),
        "replay": rep,
        "pick_story": _pick_story(rep["log"], proj, totals, positions, names),
        "tool_roster": roster_rows(sorted(rep["tool_roster"])),
        "cory_drafted_roster": roster_rows(sorted(cory_all)),
        "rookies_invisible_to_tool": [
            {"player_id": p, "name": names.get(p, p),
             "actual": totals.get(p, 0.0)} for p in invisible],
        "unknown_position_players": unknown_pos,
        "arms": arms,
        "sensitivity_grid_optimal_arm": sensitivity,
        "per_position_actual_points": per_pos,
        "record_replay_informational": rr,
    }


# ── the run ──────────────────────────────────────────────────────────────────

def run() -> dict:
    positions = positions_record()
    ages = board_ages()
    names = name_map()

    years = {}
    for season in REPLAY_SEASONS:
        years[str(season)] = replay_season(season, positions, ages, names)

    deltas_opt = [years[str(s)]["arms"]["optimal"]["delta_tool_minus_cory"]
                  for s in REPLAY_SEASONS]
    deltas_real = [years[str(s)]["arms"]["realistic"]["delta_tool_minus_cory"]
                   for s in REPLAY_SEASONS]
    h2h_tool = sum(years[str(s)]["arms"]["optimal"]["head_to_head"]
                   ["tool_weeks_won"] for s in REPLAY_SEASONS)
    h2h_cory = sum(years[str(s)]["arms"]["optimal"]["head_to_head"]
                   ["cory_weeks_won"] for s in REPLAY_SEASONS)

    def pooled(deltas):
        m = sum(deltas) / len(deltas)
        return {"per_year": {str(s): d for s, d
                             in zip(REPLAY_SEASONS, deltas)},
                "mean_delta": round(m, 2),
                "mean_weekly_delta": round(m / LAST_SCORED_WEEK, 2),
                "min": min(deltas), "max": max(deltas)}

    return {
        "_territory": ("TERRITORY: A — produced by "
                       "draft/tools/draft_replay_2025.py"),
        "_note": ("Draft replay: the value-policy core (BPA-VORP with needs "
                  "rails) in Cory's real seat for 2023/2024/2025, opponents' "
                  "actual picks fixed, that year's real keepers, walk-forward "
                  "own_v6-vintage projections (market arm removed — it IS the "
                  "event replayed), graded on actual weekly points. "
                  "SIMULATION of one alternative history per year — three "
                  "samples total, no butterfly effects, no rookies on the "
                  "tool's board. Read the docstring of the producing tool "
                  "for every named limitation before quoting any number."),
        "question_verbatim": QUESTION_VERBATIM,
        "policy_tested": ("BPA-by-VORP with needs rails (primary caps "
                          "QB2/RB7/WR7/TE2 — a third onesie can never start; "
                          "starter-feasibility rail; K/DEF mirrored) over "
                          "own_v6_nomarket walk-forward projections — the "
                          "value-policy core, NOT the full shipped engine "
                          "(which cannot run period-correct). Sensitivity "
                          "grid per year: room caps QB3/TE3 and a "
                          "room-draftable candidate filter."),
        "years": years,
        "pooled": {
            "headline": ("mean tool-minus-Cory season delta across the three "
                         "replays, weekly-optimal arm — one alternative "
                         "history per year, spread reported, not a "
                         "population"),
            "optimal": pooled(deltas_opt),
            "realistic": pooled(deltas_real),
            "optimal_h2h_weeks_pooled": {"tool": h2h_tool, "cory": h2h_cory,
                                         "of": LAST_SCORED_WEEK
                                         * len(REPLAY_SEASONS)},
        },
        "honesty": [
            "one year is one sample; three years are three samples, not a distribution",
            "fixed opponents: no butterfly effects — opponents never react to the tool's picks (shadowed picks counted per year)",
            "projections are the season-vintage construction minus the market arm — this tests the construction as it would have been, not 2026's tuned engine",
            "no rookies exist on the tool's board (walk-forward needs a prior season); every invisible rookie Cory actually drafted is listed per year",
            "no roster-status news exists on the tool's board: a pre-draft retirement (Brady 2023) or unsigned free agent still carries a projection — real drafters knew, the stores do not; the room-draftable sensitivity arm brackets this and its leak direction (the room's curation of the replayed event) is named",
            "Vegas week-1 lines close after a late-August draft; kept because the graded v6 construction carries them (proxy for the preseason market), named not hidden",
            "both rosters are frozen as drafted — no waivers, no trades; the record replay pits frozen rosters against fully-managed opponents (biased low for both counterfactual arms equally)",
            "K/DEF are mirrored from Cory's actual picks and excluded from lineup scoring — they cancel exactly",
            "the realistic arm treats row-absence as the inactive report (in-game exits count as foreseen) — applied to both rosters identically",
            "champodds is deliberately not run (2026-shaped inputs); the record replay over the real schedule is the substitute",
        ],
    }


def main() -> None:
    doc = run()
    OUT.write_text(json.dumps(doc, indent=1))
    print(f"wrote {OUT.relative_to(ROOT)}")
    for s in REPLAY_SEASONS:
        y = doc["years"][str(s)]
        o, r = y["arms"]["optimal"], y["arms"]["realistic"]
        print(f"{s}: optimal Δ {o['delta_tool_minus_cory']:+.1f} "
              f"(h2h {o['head_to_head']['tool_weeks_won']}-"
              f"{o['head_to_head']['cory_weeks_won']}), "
              f"realistic Δ {r['delta_tool_minus_cory']:+.1f} "
              f"(h2h {r['head_to_head']['tool_weeks_won']}-"
              f"{r['head_to_head']['cory_weeks_won']})")
    p = doc["pooled"]
    print(f"pooled: optimal mean Δ {p['optimal']['mean_delta']:+.1f}/season, "
          f"realistic mean Δ {p['realistic']['mean_delta']:+.1f}/season")


if __name__ == "__main__":
    main()
