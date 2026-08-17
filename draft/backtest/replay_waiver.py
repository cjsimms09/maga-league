#!/usr/bin/env python3
# TERRITORY: A
"""THE WAIVER ARM of the three-season replay — the second of the three arms.

See draft/backtest/PRE-REGISTRATION-three-season-replay.md, §2a and §13. The
lineup arm (replay_lineup.py) measures sit/start with the roster FROZEN as the
human had it. This arm lets the roster MOVE — by waiver claims — and measures
whether the moves helped, holding the lineup layer fixed so the two skills do
not smear into one number.

── THE CONTRACT (§13) ─────────────────────────────────────────────────────────

Every arm produces `{week: score}` for one seat.
`money_grade.grade_substituted` does ALL grading. No dollars are computed here.

── THE ARMS ───────────────────────────────────────────────────────────────────

    ACTUAL        the human's recorded starters on the human's recorded roster
                  -> MUST reproduce Sleeper's own weekly `points` (control)
    LINEUP_ONLY   this module's naive lineup policy on the human's recorded
                  roster — the lineup-only counterpart every waiver arm is
                  differenced against, so the WAIVER SLICE is isolated
    NAIVE_WAIVER  §2a's naive waiver rule, verbatim, on top of the same naive
                  lineup policy, roster evolving from the week-1 roster
    TOOL_WAIVER   src/routes/waivers.js's REAL decision logic (evaluateClaims +
                  the shared valuation's claimStoppingRule), driven walk-forward
                  through a node bridge (waiver_tool_runner.js). NEVER
                  re-implemented in Python — a re-implementation graded instead
                  of the real tool is this repository's most-caught defect.
    PLANTED_LEAK  a deliberately cheating arm (decides on week N's own scores).
                  Exists ONLY to prove the leak detector fires. Never graded as
                  a result.

── THE WAIVER SLICE ───────────────────────────────────────────────────────────

    slice(arm) = arm − LINEUP_ONLY,   same lineup policy on both sides,

so the difference is roster EVOLUTION alone: the arm's claims against the
human's real adds/drops/trades. That is the comparison the §4 headline needs —
"did the tool's waiver logic beat the human's actual moves" — with lineup skill
held out of the number.

── THE AS-OF RULE (§3), at the places it bites ────────────────────────────────

    the DECISION reads weeks 1..N−1   (walk-forward per-game means; the §3e
                                       substitute for projections that cannot
                                       honestly exist for 2023-25)
    the SCORE     reads week N

`_decide_naive` and the tool bridge receive a means map built strictly from
weeks < N, plus the week's availability pool. They are never handed week N's
points. Enforced by signature, tested in test_replay_waiver.py.

ONE STATED CONCESSION, confined to a boolean: the naive rule's trigger is "a
starter who is injured-out or on bye". Historical weekly injury REPORTS are not
archived anywhere in this repository; realized PARTICIPATION (did he record a
game log that week, from the nflverse store) stands in for the flag an
attentive manager reads on Wednesday. Byes are schedule facts and genuinely
decision-time-knowable; late scratches are the residue where this proxy exceeds
Wednesday knowledge. It gates WHO IS FLAGGED OUT only — never a projection,
never a score — and the lineup policy applies it identically to every
counterfactual arm and to LINEUP_ONLY, so no arm gains it over another (§7.2).

── WHAT THE POOL IS (§8) ──────────────────────────────────────────────────────

Free agents in week N = players on NO recorded roster in week N (the seat's own
recorded players are released to the pool, because the seat is counterfactual),
minus the arm's current roster. K and DEF are EXCLUDED from the claimable pool
AND carried PASS-THROUGH — every arm holds the seat's RECORDED K/DEF each week —
because the nflverse store scores no K/DEF weeks: a claimed (or even a merely
HELD) K/DEF who ends up on no recorded roster would be scored 0.0 from a data
gap, which punishes an arm for a number that does not exist. Pass-through keeps
every arm's K/DEF weeks on the league's own ledger, and it means the waiver
comparison is a SKILL-POSITION comparison (QB/RB/WR/TE), stated rather than
smoothed. The room is fixed: opponents keep their real rosters and real moves,
claims always succeed (no contention model), one claim per week per seat —
optimism that applies equally to NAIVE_WAIVER and TOOL_WAIVER and is stated in
the artifact rather than smoothed over.

── THE LEAK DETECTOR ──────────────────────────────────────────────────────────

replay_lineup's docstring draws the line: the per-week ceiling bounds a
LINEUP-only arm; the SEASON-POOL ceiling (lab._season_players — hindsight-best
lineup over everyone the seat held all season, acquisition timing included)
bounds LINEUP+WAIVER. Every honest arm here must stay at or under the
season-pool ceiling in season-total points; PLANTED_LEAK must exceed it
somewhere or the detector is decorative. Both are asserted in tests and
recorded in the artifact.

── §3b, SO THE DECOMPOSITION IS NOT OVER-READ ─────────────────────────────────

src/routes/waivers.js prices claims through the SAME shared valuation the
draft engine uses (contract C1). TOOL arms are not independent models: a
valuation error appears in the draft arm AND this arm, and differencing them
cannot isolate it. The artifact carries this caveat next to every headline.

Run: python3 draft/backtest/replay_waiver.py           (table)
     python3 draft/backtest/replay_waiver.py --write   (build the artifact)
"""
from __future__ import annotations

import json
import pathlib
import subprocess
import sys

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import lab                    # noqa: E402  (season-pool ceiling pool)
import money_grade as MG      # noqa: E402  (ALL grading)
import no_fit_guard as NFG    # noqa: E402  (every emitted result routes through this)
import replay_lineup as RL    # noqa: E402  (certified positions_map / assign / FLEX_ONLY)
import roster_sim as RS       # noqa: E402  (season-pool ceiling scorer)

SEASONS = ("2023", "2024", "2025")
SKILL = ("QB", "RB", "WR", "TE")
# Claims are skill-position only — the nflverse store scores no K/DEF weeks, so
# a K/DEF claim would be graded on a number that does not exist. Stated, not
# smoothed (§8).
CLAIMABLE = set(SKILL)
# Positional replacement ranks for the tool's walk-forward VORP — the same
# shape waiver_live_check.js uses (~last startable at each position in a
# 10-team room). Replacement is computed over the FULL universe, never the FA
# pool: recomputing over the thin pool inflates VORP and violates C1 (the
# defect waiver_live_check found on real data).
REPL_RANK = {"QB": 10, "RB": 30, "WR": 30, "TE": 10, "K": 10, "DEF": 10}
RUNNER = HERE / "waiver_tool_runner.js"
ARTIFACT = HERE.parent / "data" / "replay_waiver_2023_25.json"

ARMS = ("ACTUAL", "LINEUP_ONLY", "NAIVE_WAIVER", "TOOL_WAIVER")


# ── data plumbing ─────────────────────────────────────────────────────────────

def load_nflverse(season: str) -> dict:
    """{week: {pid: pts}} from the certified nflverse store for one season.

    The store is scored under OUR scoring table and fingerprinted; where it
    overlaps the league's own players_points it agrees to the cent for ~99.7%
    of rows (the residue is stat corrections, counted in the artifact's
    provenance). It exists because §3d's line holds: outcomes can be fetched
    retroactively, forecasts cannot.
    """
    p = HERE / f"nflverse_weekly_points_{season}.json"
    raw = json.loads(p.read_text())
    out: dict = {}
    for row in raw.get("weeks") or []:
        w = int(row["week"])
        if w <= 18:
            out[w] = {str(k): float(v) for k, v in (row.get("points") or {}).items()}
    return out


class SeasonCtx:
    """Everything one season's walk needs, precomputed and read-only."""

    def __init__(self, history: dict, season_key: str, pos_of: dict):
        self.season_key = str(season_key)
        self.s = MG.season_of(history, season_key)
        if self.s is None:
            raise SystemExit("no such season: %r" % (season_key,))
        self.pos_of = pos_of
        self.slots = RL.starting_slots(self.s)
        self.nfl = load_nflverse(self.season_key)
        # League-recorded points, global across all rosters — the ledger money
        # was actually paid on, so it wins wherever both sources have a row.
        self.league_pts = {int(w): {str(p): float(v) for p, v in pts.items()}
                           for w, pts in RS.global_player_points(self.s).items()}
        # Recorded rostered set per week, and each seat's recorded players.
        self.rostered: dict[int, set] = {}
        self.seat_players: dict[int, dict[int, list]] = {}
        for wk, rows in (self.s.get("weeks") or {}).items():
            w = int(wk)
            self.rostered[w] = set()
            self.seat_players[w] = {}
            for r in rows or []:
                pl = [str(p) for p in (r.get("players") or [])]
                self.rostered[w].update(pl)
                self.seat_players[w][int(r["roster_id"])] = pl
        pw = int((self.s.get("settings") or {}).get("playoff_week_start") or 16)
        self.graded_weeks = [w for w in sorted(self.rostered) if w <= pw + 1]

    # -- score reads (week N, the graded side) --
    def point(self, pid: str, week: int) -> float:
        v = self.league_pts.get(week, {}).get(pid)
        if v is not None:
            return v
        return self.nfl.get(week, {}).get(pid, 0.0)

    def played(self, pid: str, week: int) -> bool:
        """Skill players: a game-log row that week. K/DEF have no nflverse rows
        and are never flagged out (stated limitation)."""
        return pid in self.nfl.get(week, {})

    def seat_row(self, week: int, rid: int) -> dict | None:
        return RL.seat_row(self.s, week, rid)

    def future_points(self, pid: str, week: int) -> float:
        """Sum of a player's points weeks N..end — FUTURE INFORMATION. Exists
        ONLY for the PLANTED_LEAK arm; no honest arm may touch it."""
        if not hasattr(self, "_suffix"):
            self._suffix = {}
            acc: dict[str, float] = {}
            for w in sorted(self.graded_weeks, reverse=True):
                pts = {**self.nfl.get(w, {}), **self.league_pts.get(w, {})}
                for p, v in pts.items():
                    acc[str(p)] = acc.get(str(p), 0.0) + float(v)
                self._suffix[w] = dict(acc)
        return self._suffix.get(week, {}).get(str(pid), 0.0)


class AsOfMeans:
    """Walk-forward per-game means, weeks 1..N−1 ONLY — §3e's substitute for
    the projections that cannot honestly exist for 2023-25.

    A week counts toward a skill player's mean only if he PLAYED it (nflverse
    row present), so rostered players and free agents are averaged over the
    same denominator — per game played — instead of the roster-only ledger
    quietly including 0-point bye rows for one group and not the other. K/DEF
    count every league-recorded week (participation is unknowable for them).

    `advance(week)` folds week N in AFTER the week has been decided and scored;
    until then reads see strictly earlier weeks. A player with no counted weeks
    has NO mean — absent and scored-zero are different states (the same rule
    replay_lineup._history_means enforces).
    """

    def __init__(self, ctx: SeasonCtx):
        self.ctx = ctx
        self._sum: dict[str, float] = {}
        self._n: dict[str, int] = {}
        self.week_folded = 0

    def advance(self, week: int) -> None:
        assert week == self.week_folded + 1, "weeks must fold in order"
        ctx = self.ctx
        pids = set(ctx.league_pts.get(week, {})) | set(ctx.nfl.get(week, {}))
        for pid in pids:
            pos = ctx.pos_of.get(pid)
            if pos in CLAIMABLE or pos == RL.FLEX_ONLY:
                if not ctx.played(pid, week):
                    continue      # a bye/DNP week is not a game
            elif pid not in ctx.league_pts.get(week, {}):
                continue          # K/DEF only count league-recorded weeks
            self._sum[pid] = self._sum.get(pid, 0.0) + ctx.point(pid, week)
            self._n[pid] = self._n.get(pid, 0) + 1
        self.week_folded = week

    def mean(self, pid: str) -> float | None:
        n = self._n.get(pid)
        return None if not n else self._sum[pid] / n

    def value_map(self, pids) -> dict[str, float]:
        out = {}
        for pid in pids:
            m = self.mean(str(pid))
            if m is not None:
                out[str(pid)] = m
        return out


# ── the shared naive lineup policy ────────────────────────────────────────────

def assign_with_slots(ctx: SeasonCtx, roster: list, value: dict) -> list:
    """[(slot, pid)] — RL.assign's choice (the certified pattern), with the slot
    labels re-walked in the same ded-then-flex order assign fills them."""
    chosen = RL.assign(ctx.slots, [str(p) for p in roster], value, ctx.pos_of)
    ded = [sl for sl in ctx.slots if sl not in RL.FLEX_OK]
    flex = [sl for sl in ctx.slots if sl in RL.FLEX_OK]
    pairs, used = [], set()
    for sl in ded:
        pick = next((p for p in chosen if p not in used and ctx.pos_of.get(p) == sl), None)
        if pick:
            used.add(pick)
            pairs.append((sl, pick))
    for sl in flex:
        ok = tuple(RL.FLEX_OK[sl]) + (RL.FLEX_ONLY,)
        pick = next((p for p in chosen if p not in used and ctx.pos_of.get(p) in ok), None)
        if pick:
            used.add(pick)
            pairs.append((sl, pick))
    return pairs


def naive_lineup(ctx: SeasonCtx, roster: list, means: AsOfMeans, week: int) -> dict:
    """The one lineup policy every counterfactual arm shares.

    nominal  — starters by walk-forward mean alone ("who are my starters")
    gameday  — the same, with this week's out/bye players valued 0 (the
               attentive-manager bench, per the stated participation proxy)
    """
    vals = means.value_map(roster)
    nominal = assign_with_slots(ctx, roster, vals)
    gameday_vals = dict(vals)
    for pid in roster:
        pid = str(pid)
        pos = ctx.pos_of.get(pid)
        if (pos in CLAIMABLE or pos == RL.FLEX_ONLY) and not ctx.played(pid, week):
            gameday_vals[pid] = 0.0
    gameday = assign_with_slots(ctx, roster, gameday_vals)
    return {"nominal": nominal, "gameday": gameday, "values": vals}


def score_week(ctx: SeasonCtx, starters: list, week: int) -> float:
    return round(sum(ctx.point(str(p), week) for p in starters), 2)


# ── the free-agent pool (as-of, §3) ──────────────────────────────────────────

def fa_pool(ctx: SeasonCtx, week: int, rid: int, my_roster: list,
            means: AsOfMeans) -> list:
    """Players on NO recorded roster in week N (the counterfactual seat's own
    recorded players count as released), claimable position, with at least one
    counted game before week N. Sorted by walk-forward mean, descending."""
    others = ctx.rostered.get(week, set()) - set(ctx.seat_players.get(week, {}).get(rid, []))
    mine = {str(p) for p in my_roster}
    out = []
    for pid, m in means._sum.items():
        pid = str(pid)
        if pid in others or pid in mine:
            continue
        if ctx.pos_of.get(pid) not in CLAIMABLE:
            continue
        mu = means.mean(pid)
        if mu is None:
            continue
        out.append((pid, mu))
    out.sort(key=lambda t: (-t[1], t[0]))
    return out


# ── the naive waiver rule (§2a, verbatim) ────────────────────────────────────

def _claimable_slot(slot: str) -> bool:
    """Slots a skill-position claim could ever fill. K/DEF slots are outside
    the waiver machinery (see the pass-through rule in the module docstring):
    treating the K or DEF as 'the weakest starter' would stall branch 2 forever
    on a displacement no claim is allowed to make."""
    if slot in CLAIMABLE:
        return True
    return bool(set(RL.FLEX_OK.get(slot, ())) & CLAIMABLE)


def _drop_candidate(droppable: list, nominal_pids: set, means: AsOfMeans) -> str | None:
    """The weakest bench body among the DROPPABLE (skill, non-pass-through)
    players: lowest walk-forward mean outside the nominal lineup. A player with
    no mean drops first (a stash the naive rule explicitly refuses to hold)."""
    bench = [str(p) for p in droppable if str(p) not in nominal_pids]
    if not bench:
        return None
    return min(bench, key=lambda p: (means.mean(p) if means.mean(p) is not None else -1.0, p))


def _decide_naive(ctx: SeasonCtx, week: int, roster: list, droppable: list,
                  means: AsOfMeans, pool: list) -> dict:
    """§2a's rule. Receives the as-of means and the pool — NEVER week N points.

    1. a nominal starter is out/bye this week -> claim the highest-mean FA who
       fills that slot (and himself plays this week — an attentive manager does
       not replace a bye with a bye); no improvement threshold: the slot is empty;
    2. otherwise -> claim the highest-mean FA who would DISPLACE the weakest
       nominal starter at a claimable slot (checked by re-running the
       assignment, so a flex cascade counts as displacement), and only if the
       improvement exceeds zero.
    One claim per week; the drop is the weakest bench body. No streaming, no
    speculative stashes.
    """
    lu = naive_lineup(ctx, roster, means, week)
    nominal = lu["nominal"]
    nominal_pids = {p for _sl, p in nominal}
    vals = lu["values"]

    def eligible(slot, must_play):
        ok = RL.FLEX_OK.get(slot, (slot,))
        return [(pid, m) for pid, m in pool
                if ctx.pos_of.get(pid) in ok
                and (not must_play or ctx.played(pid, week))]

    # -- branch 1: an out/bye starter --
    outs = [(sl, p) for sl, p in nominal
            if ctx.pos_of.get(p) in CLAIMABLE and not ctx.played(p, week)]
    if outs:
        # the biggest hole first: the out starter with the highest mean
        sl, out_pid = max(outs, key=lambda t: vals.get(t[1], 0.0))
        cands = eligible(sl, must_play=True)
        drop = _drop_candidate(droppable, nominal_pids, means)
        if cands and drop:
            add, add_mean = cands[0]
            return {"action": "claim", "branch": "out_replacement", "add": add,
                    "drop": drop, "why": (
                        f"nominal {sl} starter {out_pid} "
                        f"(mean {vals.get(out_pid, 0.0):.1f}) has no game log this week "
                        f"(out/bye); claimed highest-mean eligible FA {add} "
                        f"({add_mean:.1f}) who plays this week; dropped weakest "
                        f"bench body {drop}")}
        return {"action": "none", "branch": "out_replacement",
                "why": f"{sl} starter {out_pid} out/bye but "
                       + ("no eligible FA with an as-of mean plays this week"
                          if not cands else "no bench body to drop")}

    # -- branch 2: strict improvement over the weakest starter --
    contest = [(sl, p) for sl, p in nominal if _claimable_slot(sl)]
    if not contest:
        return {"action": "none", "branch": "upgrade",
                "why": "no claimable starting slot filled"}
    weak_sl, weak_pid = min(contest, key=lambda t: vals.get(t[1], 0.0))
    weak_mean = vals.get(weak_pid, 0.0)
    drop = _drop_candidate(droppable, nominal_pids, means)
    if drop is None:
        return {"action": "none", "branch": "upgrade", "why": "no bench body to drop"}
    best_per_pos = {}
    for pid, m in pool:
        pos = ctx.pos_of.get(pid)
        if pos not in best_per_pos:
            best_per_pos[pos] = (pid, m)   # pool is sorted descending
    for pid, m in sorted(best_per_pos.values(), key=lambda t: -t[1]):
        if m <= weak_mean:
            break   # nobody weaker can displace with positive improvement
        trial = [str(p) for p in roster if str(p) != drop] + [pid]
        trial_nominal = {q for _sl, q in
                         assign_with_slots(ctx, trial, means.value_map(trial))}
        if pid in trial_nominal and weak_pid not in trial_nominal:
            return {"action": "claim", "branch": "upgrade", "add": pid, "drop": drop,
                    "why": (f"FA {pid} (mean {m:.1f}) displaces weakest starter "
                            f"{weak_pid} ({weak_sl}, mean {weak_mean:.1f}); "
                            f"improvement +{m - weak_mean:.1f} > 0; dropped weakest "
                            f"bench body {drop}")}
    return {"action": "none", "branch": "upgrade",
            "why": f"no FA displaces weakest starter {weak_pid} "
                   f"({weak_sl}, mean {weak_mean:.1f}) with improvement > 0"}


# ── the tool bridge (the REAL waivers.js, never re-implemented) ──────────────

class ToolRunner:
    """Persistent node process running waiver_tool_runner.js."""

    def __init__(self):
        self.proc = subprocess.Popen(
            ["node", str(RUNNER)], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
            stderr=subprocess.PIPE, text=True, bufsize=1)
        self._id = 0

    def ask(self, payload: dict) -> dict:
        self._id += 1
        payload = dict(payload, id=self._id)
        self.proc.stdin.write(json.dumps(payload) + "\n")
        self.proc.stdin.flush()
        line = self.proc.stdout.readline()
        if not line:
            err = self.proc.stderr.read()
            raise RuntimeError("waiver_tool_runner died: %s" % err[:2000])
        out = json.loads(line)
        if out.get("error"):
            raise RuntimeError("waiver tool error: %s" % out["error"])
        return out

    def close(self):
        try:
            self.proc.stdin.close()
            self.proc.terminate()
        except OSError:
            pass


def _league_cfg(ctx: SeasonCtx) -> dict:
    starters: dict = {}
    for sl in ctx.slots:
        starters[sl] = starters.get(sl, 0) + 1
    # teams = ACTUAL rosters counted, not settings.num_teams — the registry
    # files that key as a duplicate and sleeper_import already counts rosters.
    return {"teams": len(ctx.seat_players.get(1, {})) or 10,
            "starters": starters}


def _enrich_for_tool(ctx: SeasonCtx, pids, means: AsOfMeans, repl: dict) -> list:
    out = []
    for pid in pids:
        pid = str(pid)
        pos = ctx.pos_of.get(pid)
        if pos == RL.FLEX_ONLY or not pos:
            continue   # the tool needs a real position; FLEX_ONLY is a refusal, not a guess
        m = means.mean(pid)
        out.append({"player_id": pid, "name": pid, "position": pos,
                    "proj_mean": m,
                    "vorp": (None if m is None else m - repl.get(pos, 0.0))})
    return out


def _replacement_levels(ctx: SeasonCtx, means: AsOfMeans) -> dict:
    """Full-universe positional replacement at this as-of week (C1: never the
    FA pool alone)."""
    by_pos: dict[str, list] = {}
    for pid in means._n:
        pos = ctx.pos_of.get(str(pid))
        m = means.mean(str(pid))
        if pos in REPL_RANK and m is not None:
            by_pos.setdefault(pos, []).append(m)
    repl = {}
    for pos, vals in by_pos.items():
        vals.sort(reverse=True)
        k = min(REPL_RANK[pos], len(vals)) - 1
        repl[pos] = vals[k] if k >= 0 else 0.0
    return repl


def _decide_tool(ctx: SeasonCtx, week: int, rid: int, roster: list,
                 means: AsOfMeans, pool: list, runner: ToolRunner) -> dict:
    """One week of the REAL tool: evaluateClaims ranks the pool, the live
    claimStoppingRule (under the season's real waiver_type) says claim or hold,
    and the harness executes exactly that — the tool's claim, the tool's drop."""
    repl = _replacement_levels(ctx, means)
    my = _enrich_for_tool(ctx, roster, means, repl)
    fas = _enrich_for_tool(ctx, [pid for pid, _m in pool], means, repl)
    fas = [f for f in fas if f["proj_mean"] is not None]
    league_rosters = {str(orid): [{"position": ctx.pos_of.get(str(p))}
                                  for p in pl if ctx.pos_of.get(str(p))]
                      for orid, pl in ctx.seat_players.get(week, {}).items()
                      if int(orid) != int(rid)}
    wtype = (ctx.s.get("settings") or {}).get("waiver_type")
    res = runner.ask({"myRoster": my, "freeAgents": fas,
                      "league": _league_cfg(ctx),
                      "ctx": {"leagueRosters": league_rosters},
                      "waiverType": wtype})
    top = (res.get("top") or [None])[0] if res.get("top") else None
    stopping = res.get("stopping")
    if res.get("depletes") is None:
        return {"action": "none", "why": "waiverPriorityDepletes returned null "
                "(FAAB/unknown regime) — refusing to guess", "tool": res}
    if not top or not stopping or not stopping.get("claim"):
        return {"action": "none",
                "why": "tool holds: " + str((stopping or {}).get("reason",
                        "no claims ranked")),
                "tool_top": top}
    drop = (top.get("drop") or {}).get("player_id")
    if not drop:
        return {"action": "none", "why": "tool claimed but offered no drop "
                "(dropCandidate returned null) — cannot execute at a full roster",
                "tool_top": top}
    return {"action": "claim", "add": str(top["player_id"]), "drop": str(drop),
            "why": ("tool: net_value %+0.2f (%s); stopping: %s"
                    % (top.get("net_value") or 0.0, top.get("why") or top.get("fills"),
                       stopping.get("reason"))),
            "tool_top": {k: top.get(k) for k in
                         ("player_id", "position", "net_value", "startable_value",
                          "fills", "contested")}}


# ── the planted leak (harness falsifier) ─────────────────────────────────────

PLANTED_CLAIMS_PER_WEEK = 2


def _decide_planted(ctx: SeasonCtx, week: int, rid: int, skill_roster: list) -> list:
    """CHEATS ON PURPOSE, twice over: claims the free agents with the highest
    REST-OF-SEASON future points (weeks N..end — information no manager has),
    dropping the bodies with the least future value. Its lineup is then set on
    week N's own scores. Exists so the season-pool ceiling detector can be
    shown to fire; if this arm does not trip it, the detector is decorative."""
    others = ctx.rostered.get(week, set()) - set(ctx.seat_players.get(week, {}).get(rid, []))
    roster = list(skill_roster)
    moves = []
    for _k in range(PLANTED_CLAIMS_PER_WEEK):
        mine = {str(p) for p in roster}
        pool_pids = {str(p) for p in
                     {**ctx.nfl.get(week, {}), **ctx.league_pts.get(week, {})}}
        # SAME-POSITION swaps only, so the cheat cannot destroy its own lineup
        # mix by stockpiling the highest-scoring position: for each skill
        # position, best-future FA in for worst-future body out, take the
        # biggest positive gain.
        best_swap, best_gain = None, 0.0
        for pos in SKILL:
            here = [p for p in roster if ctx.pos_of.get(str(p)) == pos]
            if not here:
                continue
            drop = min(here, key=lambda p: ctx.future_points(str(p), week))
            add, add_fut = None, -1.0
            for pid in pool_pids:
                if pid in others or pid in mine or ctx.pos_of.get(pid) != pos:
                    continue
                fut = ctx.future_points(pid, week)
                if fut > add_fut:
                    add, add_fut = pid, fut
            if add is None:
                continue
            gain = add_fut - ctx.future_points(str(drop), week)
            if gain > best_gain:
                best_swap, best_gain = (pos, add, add_fut, str(drop)), gain
        if best_swap is None:
            break   # even with full future knowledge nothing on the wire helps
        pos, add, add_fut, drop = best_swap
        roster = [p for p in roster if str(p) != drop] + [add]
        moves.append({"action": "claim", "add": add, "drop": drop,
                      "why": f"PLANTED FUTURE INFO: claimed {pos} {add} for his "
                             f"rest-of-season total {add_fut:.0f} (weeks "
                             f"{week}..end — knowledge no manager has)"})
    return moves


# ── the walks ────────────────────────────────────────────────────────────────

def replay(history: dict, season_key, roster_id: int, arm: str,
           pos_of: dict | None = None, runner: ToolRunner | None = None,
           ctx: SeasonCtx | None = None) -> dict:
    """-> {"weekly": {week: score}, "decisions": [...]} for one seat, one arm.

    The §13 contract plus the §3f WHY log. `weekly` alone feeds
    money_grade.grade_substituted.
    """
    pos_of = pos_of or RL.positions_map(history)
    ctx = ctx or SeasonCtx(history, season_key, pos_of)
    rid = int(roster_id)
    means = AsOfMeans(ctx)
    weekly: dict[int, float] = {}
    decisions: list = []

    def is_kdef(pid):
        return ctx.pos_of.get(str(pid)) in ("K", "DEF")

    def kdef_passthrough(week):
        """K/DEF are never claimed and never scored off-ledger: every arm
        carries the seat's RECORDED K/DEF each week (module docstring)."""
        return [str(p) for p in ctx.seat_players.get(week, {}).get(rid, [])
                if is_kdef(p)]

    # the evolving part of a counterfactual roster: everything but K/DEF
    skill_roster = [str(p) for p in ctx.seat_players.get(1, {}).get(rid, [])
                    if not is_kdef(p)]

    own_runner = None
    if arm == "TOOL_WAIVER" and runner is None:
        runner = own_runner = ToolRunner()
    try:
        for w in ctx.graded_weeks:
            row = ctx.seat_row(w, rid)
            if row is None:
                continue
            if arm == "ACTUAL":
                starters = [str(p) for p in (row.get("starters") or [])]
                weekly[w] = score_week(ctx, starters, w)
                acts = _recorded_moves(ctx, w, rid)
                decisions.append({"week": w, "action": "as_recorded",
                                  "moves": acts,
                                  "why": "the human's real starters and real moves"})
            elif arm == "LINEUP_ONLY":
                recorded = [str(p) for p in (row.get("players") or [])]
                lu = naive_lineup(ctx, recorded, means, w)
                weekly[w] = score_week(ctx, [p for _sl, p in lu["gameday"]], w)
                decisions.append({"week": w, "action": "no_waiver_decision",
                                  "why": "roster exactly as the human evolved it; "
                                         "naive lineup policy on top"})
            elif arm in ("NAIVE_WAIVER", "TOOL_WAIVER"):
                roster = skill_roster + kdef_passthrough(w)
                pool = fa_pool(ctx, w, rid, roster, means)
                if means.week_folded == 0:
                    d = {"action": "none", "why": "week 1: no as-of history, "
                         "no walk-forward mean exists yet (§3e)"}
                elif arm == "NAIVE_WAIVER":
                    d = _decide_naive(ctx, w, roster, skill_roster, means, pool)
                else:
                    d = _decide_tool(ctx, w, rid, roster, means, pool, runner)
                    if d.get("action") == "claim" and is_kdef(d["drop"]):
                        d = {"action": "none", "why": (
                            "tool's claim not executed: its drop candidate "
                            f"{d['drop']} is a pass-through K/DEF, a class this "
                            "replay cannot move (no K/DEF scoring source); "
                            "recorded rather than substituted"),
                            "tool_top": d.get("tool_top")}
                if d.get("action") == "claim":
                    skill_roster = [p for p in skill_roster if p != d["drop"]] \
                        + [d["add"]]
                    roster = skill_roster + kdef_passthrough(w)
                d = dict(d, week=w)
                decisions.append(d)
                lu = naive_lineup(ctx, roster, means, w)
                weekly[w] = score_week(ctx, [p for _sl, p in lu["gameday"]], w)
            elif arm == "PLANTED_LEAK":
                for d in _decide_planted(ctx, w, rid, skill_roster):
                    skill_roster = [p for p in skill_roster if p != d["drop"]] \
                        + [d["add"]]
                    decisions.append(dict(d, week=w))
                roster = skill_roster + kdef_passthrough(w)
                hindsight = {str(p): ctx.point(str(p), w) for p in roster}
                chosen = {p for _sl, p in assign_with_slots(ctx, roster, hindsight)}
                weekly[w] = score_week(ctx, list(chosen), w)
            else:
                raise SystemExit("unknown arm %r" % arm)
            means.advance(w)
    finally:
        if own_runner:
            own_runner.close()
    return {"weekly": weekly, "decisions": decisions}


def _recorded_moves(ctx: SeasonCtx, week: int, rid: int) -> list:
    out = []
    for t in (ctx.s.get("transactions") or {}).get(str(week), []) or []:
        if t.get("status") != "complete":
            continue
        adds = {p: r for p, r in (t.get("adds") or {}).items() if int(r) == rid}
        drops = {p: r for p, r in (t.get("drops") or {}).items() if int(r) == rid}
        if adds or drops:
            out.append({"type": t.get("type"), "adds": sorted(adds),
                        "drops": sorted(drops)})
    return out


# ── controls ─────────────────────────────────────────────────────────────────

def season_pool_ceiling(ctx: SeasonCtx, rid: int) -> dict:
    """The L0 season-pool ceiling: hindsight-best lineup each week over every
    player the seat held ALL season — acquisition timing included. The bound
    for LINEUP+WAIVER arms (replay_lineup's docstring draws the line)."""
    pool = lab._season_players(ctx.s, rid)
    lpos = RS.infer_positions(ctx.s)
    scores = RS.roster_weekly_scores(ctx.s, pool, lpos)
    return {w: v for w, v in scores.items() if w in set(ctx.graded_weeks)}


def leak_check(arm_weekly: dict, ceiling_weekly: dict) -> dict:
    """Season-total points, arm vs ceiling. An honest as-of arm exceeding a
    hindsight ceiling that includes acquisition timing is evidence of a leak."""
    weeks = sorted(set(arm_weekly) & set(ceiling_weekly))
    a = round(sum(arm_weekly[w] for w in weeks), 2)
    c = round(sum(ceiling_weekly[w] for w in weeks), 2)
    return {"arm_total": a, "ceiling_total": c,
            "margin": round(c - a, 2), "tripped": a > c + 1e-6}


def actual_reproduces_recorded(history: dict, ctx: SeasonCtx, rid: int) -> bool:
    got = replay(history, ctx.season_key, rid, "ACTUAL", ctx.pos_of, ctx=ctx)["weekly"]
    want = {}
    for w in ctx.graded_weeks:
        row = ctx.seat_row(w, rid)
        if row and row.get("points") is not None:
            want[w] = round(float(row["points"]), 2)
    return {w: got.get(w) for w in want} == want


def tx_explains_roster_adds(ctx: SeasonCtx) -> dict:
    """Every observed week-to-week roster ADD must be explained by a completed
    transaction in the adjacent legs. Validates that the transaction record and
    the weekly roster snapshots — the two sources this arm's pool and ACTUAL
    arm rest on — agree with each other."""
    tx = ctx.s.get("transactions") or {}
    n_adds = n_expl = 0
    unexplained = []
    weeks = sorted(ctx.seat_players)
    for w in weeks:
        if w + 1 not in ctx.seat_players or w + 1 > 17:
            continue   # leg 18 transactions are outside the harvested span
        for rid, now in ctx.seat_players[w].items():
            nxt = ctx.seat_players[w + 1].get(rid)
            if nxt is None:
                continue
            for pid in set(nxt) - set(now):
                n_adds += 1
                ok = any(str((t.get("adds") or {}).get(pid)) == str(rid)
                         for L in (str(w), str(w + 1))
                         for t in (tx.get(L) or [])
                         if t.get("status") == "complete")
                if ok:
                    n_expl += 1
                else:
                    unexplained.append({"week": w + 1, "roster_id": rid, "player": pid})
    return {"observed_adds": n_adds, "explained": n_expl,
            "unexplained": unexplained, "ok": n_expl == n_adds}


def scoring_source_crosscheck(ctx: SeasonCtx) -> dict:
    """Where the league ledger and the nflverse store both score a (player,
    week), they must agree — the residue bounds the fidelity of grading claims
    on players the league never rostered."""
    match = mismatch = missing = 0
    for w, pts in ctx.league_pts.items():
        nv = ctx.nfl.get(w, {})
        for pid, v in pts.items():
            got = nv.get(pid)
            if got is None:
                missing += 1
            elif abs(got - v) <= 0.011:
                match += 1
            else:
                mismatch += 1
    return {"both_sources_agree": match, "disagree": mismatch,
            "league_only_rows": missing,
            "note": "league ledger wins wherever both exist; nflverse is used "
                    "only for players on no recorded roster that week"}


# ── the full run and the artifact ────────────────────────────────────────────

CAVEAT_3B = (
    "§3b SHARED-VALUATION CAVEAT: src/routes/waivers.js prices claims through "
    "the SAME shared valuation the draft engine uses (contract C1). The TOOL "
    "waiver arm and the TOOL draft arm are not independent models — a valuation "
    "error appears in both, and differencing the arms cannot isolate it. This "
    "decomposition must not be over-read.")

PARTICIPATION_NOTE = (
    "Historical weekly injury reports are not archived; realized participation "
    "(a game-log row in the nflverse store) stands in for the out/bye flag an "
    "attentive manager reads before waivers clear. It gates only WHO IS FLAGGED "
    "OUT — never a projection, never a score — and applies identically to every "
    "counterfactual arm and to LINEUP_ONLY. Byes are schedule facts and are "
    "genuinely decision-time-knowable; late scratches are the residue where "
    "this proxy exceeds Wednesday knowledge.")


def _seats(ctx: SeasonCtx) -> list:
    return sorted(ctx.seat_players.get(1, {}))


def _grade(history, payouts, season, rid, weekly):
    g = MG.grade_substituted(history, payouts, season, rid, weekly)
    return g


def run_all(write: bool = False, seasons=SEASONS, verbose: bool = True) -> dict:
    history = MG.load_history()
    payouts = MG.load_payouts()
    pos_of = RL.positions_map(history)
    missing = RL.unmapped_starters(history, pos_of)
    if missing:
        raise SystemExit("REFUSING: %d starters have no position: %s"
                         % (len(missing), missing[:10]))
    runner = ToolRunner()
    seat_seasons = []
    controls = {"actual_reproduction": [], "tx_coverage": {},
                "scoring_crosscheck": {}, "ceiling_checks": [],
                "planted_leak_trips": []}
    try:
        for season in seasons:
            ctx = SeasonCtx(history, season, pos_of)
            controls["tx_coverage"][season] = tx_explains_roster_adds(ctx)
            controls["scoring_crosscheck"][season] = scoring_source_crosscheck(ctx)
            for rid in _seats(ctx):
                ceiling = season_pool_ceiling(ctx, rid)
                rec = {"season": season, "roster_id": rid, "arms": {}}
                ok = actual_reproduces_recorded(history, ctx, rid)
                controls["actual_reproduction"].append(
                    {"season": season, "roster_id": rid, "ok": bool(ok)})
                for arm in ARMS:
                    r = replay(history, season, rid, arm, pos_of,
                               runner=runner, ctx=ctx)
                    g = _grade(history, payouts, season, rid, r["weekly"])
                    lc = leak_check(r["weekly"], ceiling)
                    controls["ceiling_checks"].append(
                        {"season": season, "roster_id": rid, "arm": arm, **lc})
                    rec["arms"][arm] = {
                        "weekly": {str(w): v for w, v in sorted(r["weekly"].items())},
                        "total_points": round(sum(r["weekly"].values()), 2),
                        "dollars": {
                            "weekly_high": g.get("weekly_high"),
                            "regular_season": g.get("regular_season"),
                            "playoff": g.get("playoff"),
                            "total": g.get("graded_total",
                                           g.get("graded_total_partial")),
                            "note": g.get("substituted_playoff_note"),
                        },
                        "standings_rank": g.get("standings_rank"),
                        "made_playoffs": g.get("made_playoffs"),
                        "n_claims": sum(1 for d in r["decisions"]
                                        if d.get("action") == "claim"),
                        "decisions": r["decisions"],
                        "why": _arm_why(arm),
                    }
                planted = replay(history, season, rid, "PLANTED_LEAK", pos_of, ctx=ctx)
                plc = leak_check(planted["weekly"], ceiling)
                controls["planted_leak_trips"].append(
                    {"season": season, "roster_id": rid, **plc})
                # the waiver slice: arm − lineup-only counterpart (§ artifact)
                base = rec["arms"]["LINEUP_ONLY"]
                for arm in ("NAIVE_WAIVER", "TOOL_WAIVER", "ACTUAL"):
                    a = rec["arms"][arm]
                    slice_d = None
                    if a["dollars"]["total"] is not None and base["dollars"]["total"] is not None:
                        slice_d = round(a["dollars"]["total"] - base["dollars"]["total"], 2)
                    a["waiver_slice"] = {
                        "vs": "LINEUP_ONLY (naive lineup on the human's recorded rosters)",
                        "points": round(a["total_points"] - base["total_points"], 2),
                        "dollars": slice_d,
                        "reading": ("roster-evolution contribution only; the lineup "
                                    "policy is identical on both sides"
                                    if arm != "ACTUAL" else
                                    "ACTUAL differs from LINEUP_ONLY in LINEUP policy "
                                    "(human starts vs naive rule) on the SAME rosters — "
                                    "it is the lineup slice of the human, not a waiver "
                                    "slice, and is labeled to prevent that misreading"),
                    }
                seat_seasons.append(rec)
                if verbose:
                    print("%s seat %-2d " % (season, rid) + "  ".join(
                        "%s %6.0fpt $%s" % (arm[:6], rec["arms"][arm]["total_points"],
                                            rec["arms"][arm]["dollars"]["total"])
                        for arm in ARMS))
    finally:
        runner.close()

    artifact = _build_artifact(seat_seasons, controls, seasons)
    if write:
        ARTIFACT.write_text(json.dumps(artifact, indent=1))
        if verbose:
            print("\nwrote %s" % ARTIFACT)
    return artifact


def _arm_why(arm: str) -> str:
    return {
        "ACTUAL": "control + honest baseline: the human's recorded starters on the "
                  "human's recorded roster; must reproduce Sleeper's weekly points",
        "LINEUP_ONLY": "the lineup-only counterpart: naive lineup policy on the "
                       "human's recorded (human-evolved) rosters, so every waiver "
                       "arm minus this isolates roster evolution",
        "NAIVE_WAIVER": "§2a's naive rule verbatim on top of the same naive lineup "
                        "— the attentive no-tools manager (Cory's correction: the "
                        "baseline must play waivers)",
        "TOOL_WAIVER": "the LIVE tool: src/routes/waivers.js evaluateClaims + the "
                       "shared valuation's claimStoppingRule under the season's "
                       "real waiver_type, driven walk-forward via the node bridge; "
                       "the harness executes the tool's own claim and drop, "
                       "nothing else",
    }[arm]


def _season_headline(seat_seasons: list, season: str) -> dict:
    rows = [r for r in seat_seasons if r["season"] == season]

    def total(rec, arm):
        return rec["arms"][arm]["dollars"]["total"] or 0.0

    def s(arm):
        return round(sum(total(r, arm) for r in rows), 2)

    tool_gt_naive = sum(1 for r in rows if total(r, "TOOL_WAIVER") > total(r, "NAIVE_WAIVER"))
    tool_lt_naive = sum(1 for r in rows if total(r, "TOOL_WAIVER") < total(r, "NAIVE_WAIVER"))
    tool_gt_human = sum(1 for r in rows if total(r, "TOOL_WAIVER") > total(r, "LINEUP_ONLY"))
    tool_lt_human = sum(1 for r in rows if total(r, "TOOL_WAIVER") < total(r, "LINEUP_ONLY"))
    return {
        "season": season, "seats": len(rows),
        "dollars": {arm: s(arm) for arm in ARMS},
        "seats_tool_beats_naive": tool_gt_naive,
        "seats_tool_loses_to_naive": tool_lt_naive,
        "seats_tool_beats_human_rosters": tool_gt_human,
        "seats_tool_loses_to_human_rosters": tool_lt_human,
    }


def _build_artifact(seat_seasons: list, controls: dict, seasons) -> dict:
    headlines = [_season_headline(seat_seasons, s) for s in seasons]
    results = []
    for label, a, b in (
            ("TOOL-WAIVER vs NAIVE-WAIVER (same lineup layer)",
             "TOOL_WAIVER", "NAIVE_WAIVER"),
            ("TOOL-WAIVER vs HUMAN ROSTER MOVES (lineup held fixed)",
             "TOOL_WAIVER", "LINEUP_ONLY"),
            ("NAIVE-WAIVER vs HUMAN ROSTER MOVES (lineup held fixed)",
             "NAIVE_WAIVER", "LINEUP_ONLY")):
        per_season = {}
        for h in headlines:
            per_season[h["season"]] = round(h["dollars"][a] - h["dollars"][b], 2)
        wins = sum(1 for v in per_season.values() if v > 0)
        results.append(NFG.record(NFG.ReplayResult(
            label=label, arm="waiver", seasons=list(seasons),
            value={"per_season_dollar_delta_summed_over_10_seats": per_season,
                   "seasons_won": wins, "n_seasons": len(per_season)},
            configs_tried=1, promotable=False,
            notes={"unit": "the SEASON (§5) — 10 seats share a schedule and a "
                           "player pool, so seats are not independent draws; "
                           "n is 3 seasons, which supports a SIGN, not an interval",
                   "caveat": CAVEAT_3B})))
    ceiling_ok = all(not c["tripped"] for c in controls["ceiling_checks"])
    planted_trip_count = sum(1 for c in controls["planted_leak_trips"] if c["tripped"])
    return {
        "artifact": "replay_waiver_2023_25",
        "territory": "A",
        "pre_registration": "draft/backtest/PRE-REGISTRATION-three-season-replay.md §2a",
        "question": ("does the live waiver tool's decision logic beat the naive "
                     "§2a rule and the humans' actual roster moves, in dollars, "
                     "per season, all ten seats — lineup layer held fixed"),
        "shared_valuation_caveat": CAVEAT_3B,
        "participation_proxy_note": PARTICIPATION_NOTE,
        "results": results,
        "season_headlines": headlines,
        "live_tool_defects_observed": [
            {"defect": "no injury/bye input anywhere in the decision path",
             "mechanism": "evaluateClaims and claimValue never read "
                          "injury_status or bye, even though "
                          "waiverInputsFromBundle collects both fields — "
                          "produced and never consumed — so the tool will claim "
                          "(and its lineupPoints will price as starting) a "
                          "player who does not play this week",
             "observed": "replayed claims include players on bye/out in the "
                         "claim week; the naive rule's branch 1 filters these "
                         "and the tool cannot"},
            {"defect": "no horizon on the claim marginal; churn is free",
             "mechanism": "under reverse standings waiverPriorityDepletes "
                          "returns false, so claimStoppingRule approves EVERY "
                          "claim with net_value > 0; net_value is a ONE-WEEK "
                          "lineup marginal and the drop side is priced only by "
                          "startableValue's bench-discounted marginal, so a "
                          "fraction-of-a-point weekly upgrade justifies "
                          "dropping a bench player with a season of future "
                          "value",
             "observed": "the tool executed claims at net_value +0.03 and "
                         "+0.14 and repeatedly dropped bodies with 50-150 "
                         "rest-of-season points for players who scored ~0 "
                         "afterward; ~8-16 claims per seat-season vs the "
                         "humans' ~7"},
            {"defect": "dropCandidate can offer a starter when no bench body "
                       "exists",
             "mechanism": "dropCandidate falls back from the bench-only pool "
                          "to ALL scored players when the bench filter comes "
                          "back empty, so the returned drop can fill a "
                          "starting slot",
             "observed": "did not fire in this replay (rosters always carried "
                         "a bench); noted from reading the branch"},
            {"defect": "scale mixing in the LIVE dollar figure (not in this "
                       "replay)",
             "mechanism": "in the live wiring proj_mean is a SEASON-TOTAL "
                          "projection from the draft artifact, while "
                          "dollarsPerPoint prices ONE WEEKLY marginal point "
                          "against the weekly-high band (mean ~120); "
                          "net_value x perPoint therefore multiplies a "
                          "season-scale quantity by a weekly-scale price. "
                          "Ranking is unaffected (monotone in net_value); the "
                          "printed dollar figure is not trustworthy. This "
                          "replay fed weekly-scale means, so its numbers are "
                          "internally consistent",
             "observed": "reported from reading src/routes/waivers.js; "
                         "REPORT-ONLY per the arm's charter — no scoring code "
                         "was changed"},
        ],
        "controls": {
            "actual_reproduces_recorded": {
                "pass": all(c["ok"] for c in controls["actual_reproduction"]),
                "checked": len(controls["actual_reproduction"]),
                "failures": [c for c in controls["actual_reproduction"] if not c["ok"]],
                "why": "if ACTUAL does not equal Sleeper's recorded points, the "
                       "scoring/lineup plumbing is wrong and nothing else here "
                       "can be trusted"},
            "transactions_explain_roster_adds": controls["tx_coverage"],
            "scoring_source_crosscheck": controls["scoring_crosscheck"],
            "season_pool_ceiling": {
                "pass": ceiling_ok,
                "why": "no honest arm may exceed the hindsight season-pool "
                       "ceiling (lab._season_players) in season-total points — "
                       "the LINEUP+WAIVER bound per replay_lineup's docstring; "
                       "the per-week ceiling bounds lineup-only and would be "
                       "too tight for an arm that moves the roster",
                "checks": controls["ceiling_checks"]},
            "planted_future_info_arm": {
                "tripped_seat_seasons": planted_trip_count,
                "of": len(controls["planted_leak_trips"]),
                "pass": planted_trip_count > 0,
                "why": "an arm that decides on week N's own scores MUST trip the "
                       "detector, or the detector is decorative",
                "checks": controls["planted_leak_trips"]},
        },
        "limits": {
            "n": "3 seasons, 1 league, 10 seats per season; the season is the "
                 "unit (§5); a sign, not an interval",
            "fixed_room": "opponents keep their recorded rosters and moves; "
                          "counterfactual claims always succeed (no contention "
                          "model, one claim per week); optimism applies equally "
                          "to NAIVE_WAIVER and TOOL_WAIVER and less to ACTUAL, "
                          "whose failed claims really failed",
            "k_def": "K/DEF are unclaimable AND pass-through: every arm carries "
                     "the seat's recorded K/DEF each week, because the nflverse "
                     "store scores no K/DEF weeks — a held-or-claimed K/DEF on "
                     "no recorded roster would score 0.0 from a data gap, not "
                     "from football. The waiver comparison is therefore a "
                     "skill-position (QB/RB/WR/TE) comparison (UNAVAILABLE "
                     "rather than estimated)",
            "trades": "counterfactual arms do not trade; ACTUAL and LINEUP_ONLY "
                      "rosters include the humans' real trades (6 across three "
                      "seasons league-wide)",
            "walk_forward_projection": "both NAIVE and TOOL see the SAME "
                     "walk-forward per-game means (§3e); this tests decision "
                     "logic, not projection sources, and a win here is a "
                     "DECISIONS claim, not an inputs claim",
        },
        "seat_seasons": seat_seasons,
        "provenance": {
            "league_history": "draft/data/league_history.json (provenance."
                              "complete: true; outcomes, transactions, rosters)",
            "nflverse_weekly_points": ["draft/backtest/nflverse_weekly_points_%s"
                                       ".json" % s for s in seasons],
            "grader": "draft/backtest/money_grade.grade_substituted (certified "
                      "to the dollar, 8 checks)",
            "tool_driven": ["src/routes/waivers.js",
                            "public/js/draft/valuation.js (claimStoppingRule)",
                            "via draft/backtest/waiver_tool_runner.js"],
            "no_python_reimplementation": "the TOOL arm's decisions come from "
                                          "the real JS through the node bridge",
        },
    }


def main() -> int:
    write = "--write" in sys.argv
    art = run_all(write=write)
    print("\nHEADLINES (dollars summed over 10 seats; unit of evidence = season, n=3)")
    for h in art["season_headlines"]:
        print(" %s  ACTUAL $%-7s LINEUP_ONLY $%-7s NAIVE $%-7s TOOL $%-7s "
              "tool>naive %d/10, tool>human-rosters %d/10"
              % (h["season"], h["dollars"]["ACTUAL"], h["dollars"]["LINEUP_ONLY"],
                 h["dollars"]["NAIVE_WAIVER"], h["dollars"]["TOOL_WAIVER"],
                 h["seats_tool_beats_naive"], h["seats_tool_beats_human_rosters"]))
    print("\n" + CAVEAT_3B)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
