# TERRITORY: A
"""CONDITIONAL VALUE — stacks + handcuffs, measured. (Cory, 2026-08-16)

The mandate (docs/queued/conditional-value-program.md, verbatim): "Joe burrow
probably worth more to me than other since I have chase but how much more...
is Derrick Henry's backup worth more to me than someone else? How much more?
Our model needs to take all these things into account when deciding value.
Because the question is value to me, in this league, under these
circumstances."

TWO measurements, both from the committed component stores (2021-2025 weekly
rows, scored under the frozen league table via fetch_component_stats — the
same points basis the whole backtest program grades on):

  1. STACK CORRELATION. Same-team QB<->WR/TE weekly-score correlation, per
     named pair and pooled per pair class (QB-WR1, QB-WR2, QB-TE1, WR1-WR2),
     with n stated everywhere — five seasons of weekly rows is a NOISY basis
     for a correlation and the n is part of the number. The correlation
     converts to a covariance increment on the team's weekly score
     (2·rho·sd_a·sd_b); the weekly-high pricing of that increment happens in
     draft/tools/conditional_value_sim.js (champodds machinery: same
     generators, same WEEKLY_SD 21.3, seeded MC) — this module only MEASURES.

  2. HANDCUFF CONDITIONALS. P(starter misses games) from the stores'
     games-played distributions (row-presence = "was on a field", the stores'
     own rule — the same games basis own_model_v4's qb_active_games layer
     uses), and the backup's measured production in exactly the weeks his
     starter was absent while the team played (team+week join inside one
     store). Premium arithmetic: expected missed starts x max(0, elevated
     points/week - replacement), where replacement is the measured wire level
     (draft/data/wire_level.json) for the OWNER of the starter and the
     startable-bar for the FIELD — the asymmetry IS the premium.

MISSING-VS-ZERO, inherited from the stores and enforced here: a player-week
absent from a store is missing data, never a zero; a player with no measurable
history yields None (absent), never 0.0 — the tests pin this.

GATED BY CONSTRUCTION: nothing in this module writes to the board, proj_mean,
the composite, or any recommendation surface. It emits ONE artifact
(draft/data/conditional_value_2026.json, _territory first) and the evidence
doc reads it. The layer ships OFF; wiring it into any surface is Cory's
ruling (the queued doc's rule).

Run:  python3 draft/backtest/conditional_value.py            # rebuild artifact
      python3 draft/backtest/conditional_value.py --print    # measurements only
"""
from __future__ import annotations

import json
import math
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))

import fetch_component_stats as FCS  # noqa: E402

SEASONS = (2021, 2022, 2023, 2024, 2025)
FANTASY_WEEKS = 15          # weeks 1-15 pay the weekly $100 (playoff_week_start 16)
NFL_LAST_WEEK = 17          # the stores' scored span, same as the backtest program
MIN_PAIR_WEEKS = 8          # a correlation on fewer shared weeks is noise, excluded
TOP_RB1 = 24                # "startable RB1" class: top-24 RBs by season points
CATCHER_MIN_GAMES = 6       # a WR1/WR2/TE1 rank needs a real season behind it

ARTIFACT = HERE.parent / "data" / "conditional_value_2026.json"
BOARD = HERE.parent.parent / "public" / "draft_data.json"
KEEPERS = HERE.parent / "config" / "keepers.json"
WIRE = HERE.parent / "data" / "wire_level.json"
SIM = HERE.parent / "tools" / "conditional_value_sim.js"


# ── pure arithmetic ──────────────────────────────────────────────────────────

def pearson(xs, ys):
    """Plain Pearson r. None (absent, not zero) when n < 3 or either series
    is constant — a correlation nobody can compute is missing, never 0."""
    n = len(xs)
    if n != len(ys) or n < 3:
        return None
    mx = sum(xs) / n
    my = sum(ys) / n
    sxx = sum((x - mx) ** 2 for x in xs)
    syy = sum((y - my) ** 2 for y in ys)
    if sxx <= 0 or syy <= 0:
        return None
    sxy = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    return sxy / math.sqrt(sxx * syy)


def mean_sd(xs):
    """(mean, sample sd). sd None when n < 2 — absent, not zero."""
    n = len(xs)
    if n == 0:
        return None, None
    m = sum(xs) / n
    if n < 2:
        return m, None
    return m, math.sqrt(sum((x - m) ** 2 for x in xs) / (n - 1))


def fisher_pool(pairs):
    """Pooled correlation from [(r, n), ...] via Fisher z weighted by n-3.
    Returns (r_pooled, n_pairs, n_weeks) — None pooled r if nothing poolable.
    |r|=1 pairs are clamped epsilon-inside to keep atanh finite."""
    zs, ws, n_weeks = [], [], 0
    for r, n in pairs:
        if r is None or n < 4:
            continue
        r = max(-0.999999, min(0.999999, r))
        zs.append(math.atanh(r) * (n - 3))
        ws.append(n - 3)
        n_weeks += n
    if not ws:
        return None, 0, 0
    return math.tanh(sum(zs) / sum(ws)), len(ws), n_weeks


def covariance_increment(legs):
    """Extra team-score variance from correlated legs vs independence:
    sum of 2*rho*sd_a*sd_b over pairs. legs = [(rho, sd_a, sd_b), ...].
    None if any input is None — a premium built on a missing correlation
    would be a manufactured number."""
    total = 0.0
    for rho, sa, sb in legs:
        if rho is None or sa is None or sb is None:
            return None
        total += 2.0 * rho * sa * sb
    return total


def handcuff_premium(expected_missed_starts, elevated_ppw, replacement_ppw):
    """Expected season points a handcuff returns over replacement to whoever
    owns the starter: E[missed starts] x max(0, elevated pts/wk - replacement).
    None (absent) if any input is None — no history is not zero premium."""
    if expected_missed_starts is None or elevated_ppw is None \
            or replacement_ppw is None:
        return None
    return expected_missed_starts * max(0.0, elevated_ppw - replacement_ppw)


# ── store access (one load per season, shared by every measurement) ─────────

_CACHE: dict = {}


def season_data(season: int):
    """(week_rows, points) for a season: week_rows = {pid: {week: line}},
    points = {pid: {week: scored pts}} under the frozen league table."""
    if season not in _CACHE:
        table = _CACHE.setdefault("_table", FCS.frozen_scoring_table())
        _CACHE[season] = (FCS.component_weeks(season, 1, NFL_LAST_WEEK),
                          FCS.scored_weekly_points(season, table, NFL_LAST_WEEK))
    return _CACHE[season]


def team_game_weeks(week_rows):
    """{team: set(weeks the team had any offensive row)} — the store's own
    'this team played' signal (a bye/cancelled week has no rows)."""
    out: dict[str, set] = {}
    for rows in week_rows.values():
        for w, line in rows.items():
            t = line.get("team")
            if t:
                out.setdefault(t, set()).add(w)
    return out


def player_team_weeks(week_rows, pid, team):
    """Weeks pid has a row FOR that team (mid-season trades stay honest)."""
    return {w for w, line in week_rows.get(pid, {}).items()
            if line.get("team") == team}


# ── stack measurement ────────────────────────────────────────────────────────

def primary_qb(week_rows, team):
    """The team-season's QB1 = most pass attempts for that team. None if no
    QB threw a pass for the team (absent, not zero)."""
    att: dict[str, float] = {}
    for pid, rows in week_rows.items():
        for line in rows.values():
            if line.get("pos") == "QB" and line.get("team") == team:
                att[pid] = att.get(pid, 0.0) + line.get("pass_att", 0)
    if not att:
        return None
    return max(sorted(att), key=lambda p: att[p])


def ranked_catchers(week_rows, points, team, pos):
    """Team's WRs or TEs ranked by season points scored FOR that team,
    minimum CATCHER_MIN_GAMES games — a 2-game cameo is not a WR1."""
    totals: dict[str, tuple] = {}
    for pid, rows in week_rows.items():
        weeks = [w for w, line in rows.items()
                 if line.get("pos") == pos and line.get("team") == team]
        if len(weeks) < CATCHER_MIN_GAMES:
            continue
        totals[pid] = (sum(points.get(pid, {}).get(w, 0.0) for w in weeks),
                       len(weeks))
    return sorted(totals, key=lambda p: (-totals[p][0], p))


def pair_series(week_rows, points, team, pid_a, pid_b):
    """Aligned weekly scores over weeks BOTH have rows for the team."""
    common = sorted(player_team_weeks(week_rows, pid_a, team)
                    & player_team_weeks(week_rows, pid_b, team))
    return ([points.get(pid_a, {}).get(w, 0.0) for w in common],
            [points.get(pid_b, {}).get(w, 0.0) for w in common])


def stack_pairs_for_season(season: int):
    """Every same-team pair in the measured classes with >= MIN_PAIR_WEEKS
    shared weeks: [{season, team, cls, a, b, n_weeks, r}]."""
    week_rows, points = season_data(season)
    teams = sorted(team_game_weeks(week_rows))
    out = []
    for team in teams:
        qb = primary_qb(week_rows, team)
        wrs = ranked_catchers(week_rows, points, team, "WR")
        tes = ranked_catchers(week_rows, points, team, "TE")
        pairs = []
        if qb:
            if len(wrs) >= 1:
                pairs.append(("QB-WR1", qb, wrs[0]))
            if len(wrs) >= 2:
                pairs.append(("QB-WR2", qb, wrs[1]))
            if len(tes) >= 1:
                pairs.append(("QB-TE1", qb, tes[0]))
        if len(wrs) >= 2:
            pairs.append(("WR1-WR2", wrs[0], wrs[1]))
        for cls, a, b in pairs:
            xs, ys = pair_series(week_rows, points, team, a, b)
            if len(xs) < MIN_PAIR_WEEKS:
                continue
            r = pearson(xs, ys)
            if r is None:
                continue
            out.append({"season": season, "team": team, "cls": cls,
                        "a": a, "b": b, "n_weeks": len(xs),
                        "r": round(r, 4)})
    return out


def stack_correlation_classes(seasons=SEASONS):
    """Pooled per-class correlation over all team-seasons. Each class carries
    its n (pairs and weeks) — the honesty the doc demands."""
    by_cls: dict[str, list] = {}
    for season in seasons:
        for row in stack_pairs_for_season(season):
            by_cls.setdefault(row["cls"], []).append(row)
    out = {}
    for cls in sorted(by_cls):
        rows = by_cls[cls]
        pooled, n_pairs, n_weeks = fisher_pool(
            [(row["r"], row["n_weeks"]) for row in rows])
        rs = [row["r"] for row in rows]
        _, spread = mean_sd(rs)
        out[cls] = {"r_pooled": None if pooled is None else round(pooled, 4),
                    "r_mean": round(sum(rs) / len(rs), 4),
                    "r_sd_across_pairs": None if spread is None else round(spread, 4),
                    "n_pairs": n_pairs, "n_weeks": n_weeks}
    return out


def named_pair_history(pid_a, pid_b, seasons=SEASONS):
    """One named pair (e.g. Burrow-Chase) across seasons: per-season r,
    pooled r, each side's weekly mean/sd over shared active weeks, and the
    co-active rate (shared weeks / team game weeks) that scales the premium
    to a 15-week fantasy season."""
    per_season, all_a, all_b = [], [], []
    shared, team_weeks_n = 0, 0
    for season in seasons:
        week_rows, points = season_data(season)
        teams_a = {line.get("team") for line in week_rows.get(pid_a, {}).values()}
        teams_b = {line.get("team") for line in week_rows.get(pid_b, {}).values()}
        both = {t for t in teams_a & teams_b if t}
        for team in sorted(both):
            xs, ys = pair_series(week_rows, points, team, pid_a, pid_b)
            if not xs:
                continue
            tg = len(team_game_weeks(week_rows).get(team, ()))
            r = pearson(xs, ys)
            per_season.append({"season": season, "team": team,
                               "n_weeks": len(xs),
                               "r": None if r is None else round(r, 4)})
            all_a.extend(xs)
            all_b.extend(ys)
            shared += len(xs)
            team_weeks_n += tg
    pooled, n_seasons, n_weeks = fisher_pool(
        [(p["r"], p["n_weeks"]) for p in per_season])
    ma, sa = mean_sd(all_a)
    mb, sb = mean_sd(all_b)
    if not per_season:
        return None                      # no shared history — absent, not zero
    return {"per_season": per_season,
            "r_pooled": None if pooled is None else round(pooled, 4),
            "n_seasons_pooled": n_seasons, "n_weeks": n_weeks,
            "a_ppw": None if ma is None else round(ma, 2),
            "a_sd": None if sa is None else round(sa, 2),
            "b_ppw": None if mb is None else round(mb, 2),
            "b_sd": None if sb is None else round(sb, 2),
            "co_active_rate": None if not team_weeks_n
            else round(shared / team_weeks_n, 3)}


# ── handcuff measurement ─────────────────────────────────────────────────────

def top_rbs(season: int, top_n: int = TOP_RB1):
    """[(pid, team, season_pts, games)] — the season's top-N RBs by points,
    each with the team he logged the most weeks for."""
    week_rows, points = season_data(season)
    totals = []
    for pid, rows in week_rows.items():
        team_counts: dict[str, int] = {}
        for line in rows.values():
            if line.get("pos") == "RB" and line.get("team"):
                team_counts[line["team"]] = team_counts.get(line["team"], 0) + 1
        if not team_counts:
            continue
        team = max(sorted(team_counts), key=lambda t: team_counts[t])
        pts = sum(points.get(pid, {}).values())
        totals.append((pid, team, pts, sum(team_counts.values())))
    totals.sort(key=lambda t: -t[2])
    return totals[:top_n]


def starter_missed_weeks(week_rows, team, starter):
    """(missed, played, team_games): weeks the TEAM played but the starter has
    no row — the stores' 'inactive' signal — vs weeks he does."""
    tg = team_game_weeks(week_rows).get(team, set())
    active = player_team_weeks(week_rows, starter, team)
    return sorted(tg - active), sorted(active & tg), sorted(tg)


def rb1_availability(seasons=SEASONS, top_n: int = TOP_RB1):
    """Games-played distribution for the startable-RB1 class: per RB1-season
    missed/team-games, pooled P(miss >= 1) and mean missed, scaled to the
    15-week fantasy season."""
    rows = []
    for season in seasons:
        week_rows, _ = season_data(season)
        for pid, team, pts, _g in top_rbs(season, top_n):
            missed, played, tg = starter_missed_weeks(week_rows, team, pid)
            if not tg:
                continue
            rows.append({"season": season, "pid": pid, "team": team,
                         "missed": len(missed), "team_games": len(tg)})
    if not rows:
        return None
    total_missed = sum(r["missed"] for r in rows)
    total_games = sum(r["team_games"] for r in rows)
    miss_rate = total_missed / total_games
    n_miss1 = sum(1 for r in rows if r["missed"] >= 1)
    dist: dict[str, int] = {}
    for r in rows:
        dist[str(r["missed"])] = dist.get(str(r["missed"]), 0) + 1
    return {"n_rb1_seasons": len(rows),
            "p_miss_ge1": round(n_miss1 / len(rows), 3),
            "mean_missed_per_season": round(total_missed / len(rows), 2),
            "miss_rate_per_team_game": round(miss_rate, 4),
            "expected_missed_starts_15wk": round(miss_rate * FANTASY_WEEKS, 2),
            "missed_games_distribution": dict(sorted(dist.items(),
                                                     key=lambda kv: int(kv[0])))}


def player_availability(pid, seasons=SEASONS):
    """One named player's own missed-games record: [(season, team, missed,
    team_games)] + totals. None if he has no store history."""
    rows = []
    for season in seasons:
        week_rows, _ = season_data(season)
        team_counts: dict[str, int] = {}
        for line in week_rows.get(pid, {}).values():
            if line.get("team"):
                team_counts[line["team"]] = team_counts.get(line["team"], 0) + 1
        if not team_counts:
            continue
        team = max(sorted(team_counts), key=lambda t: team_counts[t])
        missed, played, tg = starter_missed_weeks(week_rows, team, pid)
        rows.append({"season": season, "team": team,
                     "missed": len(missed), "team_games": len(tg)})
    if not rows:
        return None
    tm = sum(r["missed"] for r in rows)
    tg = sum(r["team_games"] for r in rows)
    return {"per_season": rows, "missed_total": tm, "team_games_total": tg,
            "miss_rate": round(tm / tg, 4) if tg else None,
            "expected_missed_starts_15wk":
                round(tm / tg * FANTASY_WEEKS, 2) if tg else None}


def backup_conditional_production(seasons=SEASONS, top_n: int = TOP_RB1,
                                  pos: str = "RB"):
    """The class measurement behind every handcuff number: for each season's
    top-N {pos}1s, the same team's {pos}2 (next by season points, same store),
    scored in the exact weeks the starter was ABSENT while the team played,
    vs the weeks he was present. Pooled: elevated mean/sd/n vs present
    mean/n. The delta is the conditional production a handcuff buys."""
    elevated, present = [], []
    pairs = 0
    for season in seasons:
        week_rows, points = season_data(season)
        if pos == "RB":
            starters = [(pid, team) for pid, team, _p, _g
                        in top_rbs(season, top_n)]
        else:
            starters = []
            for team in sorted(team_game_weeks(week_rows)):
                ranked = ranked_catchers(week_rows, points, team, pos)
                if ranked:
                    starters.append((ranked[0], team))
            # keep the class comparable: top-N starters by season points
            starters.sort(key=lambda pt: -sum(
                points.get(pt[0], {}).get(w, 0.0)
                for w in player_team_weeks(week_rows, pt[0], pt[1])))
            starters = starters[:top_n]
        for starter, team in starters:
            backup = _next_at_position(week_rows, points, team, pos, starter)
            if backup is None:
                continue
            pairs += 1
            missed, played, _tg = starter_missed_weeks(week_rows, team, starter)
            bk_weeks = player_team_weeks(week_rows, backup, team)
            elevated.extend(points.get(backup, {}).get(w, 0.0)
                            for w in missed if w in bk_weeks)
            present.extend(points.get(backup, {}).get(w, 0.0)
                           for w in played if w in bk_weeks)
    em, es = mean_sd(elevated)
    pm, _ = mean_sd(present)
    if em is None:
        return None
    return {"pos": pos, "n_starter_seasons": pairs,
            "elevated_ppw": round(em, 2),
            "elevated_sd": None if es is None else round(es, 2),
            "n_elevated_weeks": len(elevated),
            "present_ppw": None if pm is None else round(pm, 2),
            "n_present_weeks": len(present)}


def _next_at_position(week_rows, points, team, pos, starter):
    """The team's next player at pos by season points for the team (min 3
    games). None when the depth chart has nobody measurable."""
    totals = {}
    for pid, rows in week_rows.items():
        if pid == starter:
            continue
        weeks = [w for w, line in rows.items()
                 if line.get("pos") == pos and line.get("team") == team]
        if len(weeks) < 3:
            continue
        totals[pid] = sum(points.get(pid, {}).get(w, 0.0) for w in weeks)
    if not totals:
        return None
    return max(sorted(totals), key=lambda p: totals[p])


def named_backup_elevated_history(backup_pid, starter_pid, seasons=SEASONS):
    """A named backup's OWN elevated weeks behind a named starter: seasons
    they shared a team, the backup's points in each week the starter sat.
    None if they never shared a team in the stores — absent, not zero."""
    rows = []
    for season in seasons:
        week_rows, points = season_data(season)
        teams_b = {line.get("team")
                   for line in week_rows.get(backup_pid, {}).values()}
        teams_s = {line.get("team")
                   for line in week_rows.get(starter_pid, {}).values()}
        for team in sorted(t for t in teams_b & teams_s if t):
            missed, _pl, _tg = starter_missed_weeks(week_rows, team, starter_pid)
            bk = player_team_weeks(week_rows, backup_pid, team)
            pts = [round(points.get(backup_pid, {}).get(w, 0.0), 2)
                   for w in missed if w in bk]
            if missed:
                rows.append({"season": season, "team": team,
                             "starter_missed": len(missed),
                             "backup_elevated_pts": pts})
    if not rows:
        return None
    all_pts = [p for r in rows for p in r["backup_elevated_pts"]]
    m, s = mean_sd(all_pts)
    return {"per_season": rows, "n_elevated_weeks": len(all_pts),
            "elevated_ppw": None if m is None else round(m, 2),
            "elevated_sd": None if s is None else round(s, 2)}


# ── artifact assembly ────────────────────────────────────────────────────────

def _board():
    return json.loads(BOARD.read_text())


def _board_player(board, pid):
    for p in board.get("kept_players", []):
        if p.get("player_id") == pid:
            return p
    for p in board.get("players", []):
        if p.get("player_id") == pid:
            return p
    return None


def _team_rbs_by_market(board, team):
    rbs = [p for p in board.get("players", [])
           if p.get("team") == team and p.get("position") == "RB"]
    return sorted(rbs, key=lambda p: p.get("adp") or 9999)


def run_sim(payload: dict) -> dict:
    """Drive the champodds-machinery sim (node). The sim is the pricing arm;
    this module is the measuring arm — the split keeps each testable pure."""
    proc = subprocess.run(
        ["node", str(SIM), "--json", json.dumps(payload)],
        capture_output=True, text=True, check=True)
    return json.loads(proc.stdout)


def build_artifact(seasons=SEASONS, sims=20000, write=True):
    board = _board()
    keepers = json.loads(KEEPERS.read_text())
    wire = json.loads(WIRE.read_text())["per_week"]

    cory = next(t for t in keepers["teams"] if t["draft_slot"] == 8
                and not t["slot_provisional"])
    classes = stack_correlation_classes(seasons)
    rb_avail = rb1_availability(seasons)
    rb_cond = backup_conditional_production(seasons, pos="RB")
    wr_cond = backup_conditional_production(seasons, pos="WR")

    # ── stack: every QB/pass-catcher partner priced for Cory's keepers ──────
    chase = "7564"
    burrow_chase = named_pair_history("6770", chase, seasons)
    higgins_chase = named_pair_history("6801", chase, seasons)
    burrow_higgins = named_pair_history("6770", "6801", seasons)

    stacks = []
    for label, pair_hist, cls, legs_note in (
        ("Joe Burrow + Ja'Marr Chase (kept)", burrow_chase, "QB-WR1",
         "the pair Cory owns half of"),
        ("Tee Higgins + Ja'Marr Chase (kept)", higgins_chase, "WR1-WR2",
         "same-team WR pair, no QB leg"),
        ("Tee Higgins given Burrow drafted", burrow_higgins, "QB-WR2",
         "the second leg of a double stack — only live if Burrow is on the roster"),
    ):
        if pair_hist is None:
            stacks.append({"label": label, "cls": cls, "history": None,
                           "note": "no shared store history — premium is "
                                   "ABSENT, not zero"})
            continue
        rho = pair_hist["r_pooled"]
        if rho is None or pair_hist["a_sd"] is None or pair_hist["b_sd"] is None:
            stacks.append({"label": label, "cls": cls, "history": pair_hist,
                           "note": "correlation not computable — absent"})
            continue
        dv = covariance_increment([(rho, pair_hist["a_sd"], pair_hist["b_sd"])])
        dv_cls = covariance_increment([(classes[cls]["r_pooled"],
                                        pair_hist["a_sd"], pair_hist["b_sd"])])
        sim = run_sim({"op": "stack", "covIncrement": dv, "sims": sims})
        sim_cls = run_sim({"op": "stack", "covIncrement": dv_cls, "sims": sims})
        # rounded ONCE, then used everywhere below — the printed dollars must
        # reproduce from the printed inputs by eye
        co15 = round((pair_hist["co_active_rate"] or 0) * FANTASY_WEEKS, 1)
        stacks.append({
            "label": label, "cls": cls, "history": pair_hist,
            "class_baseline": classes[cls],
            "cov_increment_pair": round(dv, 2),
            "cov_increment_class_rho": None if dv_cls is None else round(dv_cls, 2),
            "sim_pair_rho": sim, "sim_class_rho": sim_cls,
            "co_active_weeks_15": co15,
            "premium_dollars_season": round(
                sim["dHigh"] * 100 * co15, 2),
            "premium_dollars_season_class_rho": round(
                sim_cls["dHigh"] * 100 * co15, 2),
            "composite_pts_equiv_season": round(
                sim["pointEquivalentWeekly"] * co15, 1),
            "bust_tail": {"dLow": sim["dLow"], "dBelow1Sd": sim["dBelow1Sd"]},
            "note": legs_note})

    # ── handcuffs: Cory's RB starters vs the market's next man ──────────────
    handcuffs = []
    for starter_pid, starter_name in (("3198", "Derrick Henry"),
                                      ("8151", "Kenneth Walker")):
        srow = _board_player(board, starter_pid)
        team = srow.get("team") if srow else None
        cands = [p for p in _team_rbs_by_market(board, team)
                 if p["player_id"] != starter_pid][:2] if team else []
        savail = player_availability(starter_pid, seasons)
        exp_missed_class = rb_avail["expected_missed_starts_15wk"]
        entry = {"starter": {"pid": starter_pid, "name": starter_name,
                             "team": team,
                             "own_availability": savail,
                             "class_availability": rb_avail},
                 "backups": []}
        exp_missed_own = (savail or {}).get("expected_missed_starts_15wk")
        for cand in cands:
            own_hist = named_backup_elevated_history(cand["player_id"],
                                                     starter_pid, seasons)
            elevated = rb_cond["elevated_ppw"]
            prem_cory = handcuff_premium(exp_missed_class, elevated,
                                         wire["RB"])
            prem_cory_own = handcuff_premium(exp_missed_own, elevated,
                                             wire["RB"])
            # to the field the elevated weeks displace a startable RB, not
            # the wire — the bar is the class present-week RB2 level plus
            # the wire gap is gone; use the measured startable bar below.
            prem_field = handcuff_premium(exp_missed_class, elevated,
                                          _startable_rb_bar(board))
            entry["backups"].append({
                "pid": cand["player_id"], "name": cand["name"],
                "adp": cand.get("adp"),
                "depth_chart_order": cand.get("depth_chart_order"),
                "proj_mean": cand.get("proj_mean"),
                "own_elevated_history": own_hist,
                "class_elevated_ppw": elevated,
                "class_elevated_sd": rb_cond["elevated_sd"],
                "class_n_elevated_weeks": rb_cond["n_elevated_weeks"],
                "premium_pts_to_cory": None if prem_cory is None
                else round(prem_cory, 1),
                "premium_pts_to_cory_own_availability":
                    None if prem_cory_own is None else round(prem_cory_own, 1),
                "premium_pts_to_field": None if prem_field is None
                else round(prem_field, 1)})
        handcuffs.append(entry)

    doc = {
        "_territory": "TERRITORY: A — produced by draft/backtest/"
                      "conditional_value.py; gated OFF, no board/composite/"
                      "recommendation surface reads this (Cory rules on wiring)",
        "generated_at_note": "rebuild: python3 draft/backtest/conditional_value.py",
        "mandate": "docs/queued/conditional-value-program.md",
        "seasons": list(seasons),
        "league": {"weekly_high_dollars": 100, "fantasy_weeks": FANTASY_WEEKS,
                   "teams": 10, "weekly_sd_source":
                       "src/routes/champodds.js CFG.WEEKLY_SD = 21.3"},
        "stack_correlation_classes": classes,
        "stacks_for_cory": stacks,
        "handcuffs_for_cory": handcuffs,
        "wr_conditional_class": wr_cond,
        "rb_conditional_class": rb_cond,
        "replacement": {"wire_per_week": wire,
                        "startable_rb_bar_ppw": _startable_rb_bar(board)},
        "caveats": [
            "correlations come from 5 seasons of weekly rows and are NOISY — "
            "every class and pair above carries its n; pair-level r moves "
            "season to season (see per_season blocks) and the class-pooled "
            "rho is the stabler number",
            "row-presence = 'was on a field' (the stores' rule): a healthy "
            "scratch and an injury read the same; for top-24 RB1s absence "
            "is overwhelmingly injury, but the availability numbers cannot "
            "distinguish",
            "the stack premium prices VARIANCE into a 10-team equal-mean "
            "weekly-high contest at the champodds constant sd 21.3; a team "
            "whose mean is already above the field gains slightly less from "
            "variance than this prices, a below-mean team slightly more",
            "the correlation raises BOTH tails: dLow and dBelow1Sd are the "
            "bust side and are reported, not netted away",
            "handcuff class numbers pool ALL top-24-RB1 backups; a specific "
            "backup's talent/role can sit anywhere in that spread (the "
            "elevated_sd is the spread)",
        ],
    }
    if write:
        ARTIFACT.write_text(json.dumps(doc, indent=1) + "\n")
    return doc


def _startable_rb_bar(board):
    """The field's bar for an elevated backup: the weekly level of the last
    STARTABLE RB in a 10-team 2-RB+flex league (~RB28 by proj). An elevated
    handcuff only pays a non-owner what he beats this bar by."""
    rbs = sorted((p for p in board.get("players", [])
                  if p.get("position") == "RB" and p.get("proj_mean")),
                 key=lambda p: -p["proj_mean"])
    kept = sorted((p for p in board.get("kept_players", [])
                   if p.get("position") == "RB" and p.get("proj_mean")),
                  key=lambda p: -p["proj_mean"])
    pool = sorted(rbs + kept, key=lambda p: -p["proj_mean"])
    if len(pool) < 28:
        return None
    p = pool[27]
    games = p.get("games_expected") or 16.0
    return round(p["proj_mean"] / games, 2)


def main():
    if "--print" in sys.argv:
        print(json.dumps({"classes": stack_correlation_classes(),
                          "rb_availability": rb1_availability(),
                          "rb_conditional": backup_conditional_production(),
                          "wr_conditional":
                              backup_conditional_production(pos="WR")},
                         indent=1))
        return
    doc = build_artifact()
    print(f"wrote {ARTIFACT} "
          f"({len(doc['stacks_for_cory'])} stacks, "
          f"{len(doc['handcuffs_for_cory'])} handcuff starters)")


if __name__ == "__main__":
    main()
