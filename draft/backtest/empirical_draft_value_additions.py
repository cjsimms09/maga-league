# TERRITORY: A
"""ADDITIONS A AND B to the empirical draft-value study — availability, and
where this league's format mismatches the market's.

Preregistered in `draft/audit/empirical_draft_value_2026-08-16.md` §§12–14,
committed before this module produced a number. Everything in §2 of that
document (survivorship, season-clustered bootstraps, the stability rule, BH at
q = 0.10, the leakage rule) applies here unchanged and is imported, not
re-implemented, from `empirical_draft_value`.

⚠️ THE ONE THING TO READ BEFORE ANY NUMBER IN HERE. Games played are counted
from `component_stats_{Y}`, NOT from the weekly-points stores, because
`nflverse_weekly_points_2025.json` DROPS ZERO-POINT ROWS. Measured: row presence
in the two stores agrees exactly for 2023 (0 of 4775 player-weeks disagree) and
2024 (0 of 4770), and diverges by 884 player-weeks in 2025; the store carries
297 and 306 exactly-zero rows in 2023 and 2024 and SIX in 2025. Its row presence
measures "scored something", not "played". An availability study built on it
reports a 2025 injury spike that never happened. §12.1 has the full accounting
and the check that stage 2 is unaffected.

⚠️ AND THE SECOND THING. Injury, healthy scratch, depth-chart burial and not
being on a roster are INDISTINGUISHABLE in these stores — no injury or
snap-count store is committed to this repo. Every measure here is called
AVAILABILITY and nothing here is an injury finding.
"""
from __future__ import annotations

import json
import math
from collections import defaultdict
from pathlib import Path

import empirical_draft_value as E
from empirical_draft_value import (BOOTSTRAP, POSITIONS, ROUND_BANDS, SEASONS,
                                   STARTER_RANK, cluster_boot, mean, median,
                                   spearman, wilson)

HERE = Path(__file__).resolve().parent

# ── preregistered constants (§13.1, §14.2) ──────────────────────────────────
AVAIL_LOW = 0.75            # §13.2 "missed ~4 of 16" — the absence threshold
FULL_SEASON_GAMES = 16      # a bye is an absent row, so a perfect season is 16
MOVER_RANKS = 5             # §14.4 "moved >=5 ranks"
TOP_MOVER_WINDOW = 40       # §14.4 top-40 by MARKET rank
# §14.2 — MARKET differs from LEAGUE in exactly two keys and nothing else.
MARKET_SUBSTITUTIONS = {"rec": 1.0, "pass_td": 4.0}


# ── games, byes, availability (§13.1) ───────────────────────────────────────

def team_bye_weeks(season: int) -> dict:
    """{team: set of weeks 1-17 with NO scheduled game}, from the committed
    schedule lines. `historical_byes.json` covers only 2023-24, so the schedule
    is the source that reaches all three seasons — and it is exact, not a
    lookup table that can go stale."""
    doc = json.loads((HERE / "vegas_lines_2021_2026.json").read_text())
    rows = doc["seasons"][str(season)]
    played: dict[str, set] = defaultdict(set)
    weeks = set()
    for g in rows:
        w = int(g["week"])
        if not 1 <= w <= E.LAST_SCORED_WEEK:
            continue
        weeks.add(w)
        played[g["home"]].add(w)
        played[g["away"]].add(w)
    return {team: (weeks - w) for team, w in played.items()}


def games_and_teams(season: int) -> tuple[dict, dict]:
    """({pid: games from the COMPONENT store}, {pid: set of teams}) — see the
    module docstring for why the component store and not the points store."""
    comp = E.component_weeks(season)
    games: dict[str, int] = defaultdict(int)
    teams: dict[str, set] = defaultdict(set)
    for w, players in comp.items():
        if not 1 <= w <= E.LAST_SCORED_WEEK:
            continue
        for pid, row in players.items():
            games[pid] += 1
            if row.get("team"):
                teams[pid].add(row["team"])
    return dict(games), dict(teams)


def availability(season: int) -> dict:
    """{pid: {games, team_games, availability}}. `team_games` is the player's
    OWN schedule — a player who moved mid-season is credited against the union
    of his teams' schedules, because he could not have played a week neither
    team had."""
    byes = team_bye_weeks(season)
    games, teams = games_and_teams(season)
    out = {}
    for pid, g in games.items():
        ts = teams.get(pid) or set()
        if ts:
            off = set.intersection(*[byes.get(t, set()) for t in ts]) if len(ts) > 1 \
                else byes.get(next(iter(ts)), set())
        else:
            off = set()
        tg = max(1, E.LAST_SCORED_WEEK - len(off))
        out[pid] = {"games": g, "team_games": tg, "availability": min(1.0, g / tg)}
    return out


# ── Addition A ──────────────────────────────────────────────────────────────

def _pick_availability_rows(positions: dict) -> list:
    rows, _surv = E.pick_rows(positions)
    a = E._arm(rows, "E")
    out = []
    rank_of = {}
    for s in SEASONS:
        for pos, lst in E.universe(s, positions).items():
            for i, (pid, _) in enumerate(lst, 1):
                rank_of[(s, pid)] = (pos, i)
    avail = {s: availability(s) for s in SEASONS}
    for r in a:
        av = avail[r["season"]].get(r["pid"])
        if av is None or av["games"] <= 0:
            continue
        ppg = r["pts"] / av["games"]
        pr = rank_of.get((r["season"], r["pid"]))
        out.append(dict(r, games=av["games"], team_games=av["team_games"],
                        availability=av["availability"], ppg=ppg,
                        full_season_pts=ppg * FULL_SEASON_GAMES,
                        pos_rank=(pr[1] if pr else None),
                        starter=bool(pr and pr[1] <= STARTER_RANK[pr[0]])))
    return out


def _rank_if_full(season: int, positions: dict, pos: str, pts: float) -> int:
    """Where `pts` would rank at `pos` that season — the counterfactual rank."""
    curve = [v for _, v in E.universe(season, positions)[pos]]
    return sum(1 for v in curve if v > pts) + 1


def a1_bust_attribution(positions: dict) -> dict:
    rows = _pick_availability_rows(positions)
    labelled = []
    for r in rows:
        if r["starter"]:
            lab = "STARTER"
        else:
            full_rank = _rank_if_full(r["season"], positions, r["pos"],
                                      r["full_season_pts"])
            would = full_rank <= STARTER_RANK[r["pos"]]
            if r["availability"] > AVAIL_LOW:
                lab = "PRODUCTION"
            elif would:
                lab = "ABSENCE"
            else:
                lab = "BOTH"
        labelled.append(dict(r, attribution=lab))

    def summarize(sel):
        n = len(sel)
        if not n:
            return None
        out = {"n": n}
        for lab in ("STARTER", "PRODUCTION", "ABSENCE", "BOTH"):
            k = sum(1 for r in sel if r["attribution"] == lab)
            out[lab.lower() + "_rate"] = round(k / n, 3)
            out[lab.lower() + "_ci95"] = [round(x, 3) for x in wilson(k, n)]
            out[lab.lower() + "_n"] = k
        misses = [r for r in sel if r["attribution"] != "STARTER"]
        if misses:
            abs_n = sum(1 for r in misses if r["attribution"] == "ABSENCE")
            out["share_of_misses_that_are_pure_absence"] = round(abs_n / len(misses), 3)
            out["share_ci95"] = [round(x, 3) for x in wilson(abs_n, len(misses))]
        out["mean_availability"] = round(mean([r["availability"] for r in sel]), 3)
        return out

    by_pos = {p: summarize([r for r in labelled if r["pos"] == p]) for p in POSITIONS}
    by_band = {name: summarize([r for r in labelled if lo <= r["round"] <= hi])
               for name, lo, hi in ROUND_BANDS}
    by_band_pos = {name: {p: summarize([r for r in labelled
                                        if lo <= r["round"] <= hi and r["pos"] == p])
                          for p in POSITIONS}
                   for name, lo, hi in ROUND_BANDS}

    # the "if nobody got hurt" counterfactual — §13.2's headline
    cf = {}
    for name, lo, hi in ROUND_BANDS:
        sel = [r for r in labelled if lo <= r["round"] <= hi]
        real = sum(1 for r in sel if r["starter"])
        full = sum(1 for r in sel
                   if _rank_if_full(r["season"], positions, r["pos"],
                                    r["full_season_pts"]) <= STARTER_RANK[r["pos"]])
        per_season = {}
        for s in SEASONS:
            ss = [r for r in sel if r["season"] == s]
            if not ss:
                continue
            per_season[str(s)] = {
                "actual": round(sum(1 for r in ss if r["starter"]) / len(ss), 3),
                "if_16_games": round(sum(
                    1 for r in ss
                    if _rank_if_full(s, positions, r["pos"],
                                     r["full_season_pts"]) <= STARTER_RANK[r["pos"]]
                ) / len(ss), 3)}
        cf[name] = {"n": len(sel),
                    "actual_starter_rate": round(real / len(sel), 3),
                    "actual_ci95": [round(x, 3) for x in wilson(real, len(sel))],
                    "if_everyone_played_16": round(full / len(sel), 3),
                    "if_16_ci95": [round(x, 3) for x in wilson(full, len(sel))],
                    "lift": round((full - real) / len(sel), 3),
                    "per_season": per_season}

    # variance decomposition on log(points) = log(games) + log(ppg)
    dec = {}
    for pos in POSITIONS:
        sel = [r for r in rows if r["pos"] == pos and r["pts"] > 0]
        if len(sel) < 12:
            dec[pos] = {"n": len(sel), "verdict": "insufficient n"}
            continue

        def shares(items):
            lg = [math.log(r["games"]) for r in items]
            lp = [math.log(r["ppg"]) for r in items if r["ppg"] > 0]
            if len(lg) != len(lp) or len(lg) < 3:
                return None
            mg, mp = mean(lg), mean(lp)
            vg = sum((x - mg) ** 2 for x in lg) / (len(lg) - 1)
            vp = sum((x - mp) ** 2 for x in lp) / (len(lp) - 1)
            cov = sum((a_ - mg) * (b - mp) for a_, b in zip(lg, lp)) / (len(lg) - 1)
            tot = vg + vp + 2 * cov
            return (vg / tot) if tot > 0 else None

        g = defaultdict(list)
        for r in sel:
            g[r["season"]].append(r)
        lo, hi = cluster_boot(g, shares, reps=800)
        dec[pos] = {"n": len(sel), "games_share_of_log_variance": round(shares(sel), 3),
                    "ci95": [round(lo, 3), round(hi, 3)],
                    "mean_games": round(mean([r["games"] for r in sel]), 1),
                    "mean_ppg": round(mean([r["ppg"] for r in sel]), 1)}

    return {"by_position": by_pos, "by_round_band": by_band,
            "by_band_and_position": by_band_pos,
            "if_nobody_got_hurt": cf,
            "log_variance_decomposition": dec,
            "_note": ("ABSENCE = missed >=4 games AND his own per-game rate over "
                      "16 games would have made him a league starter. PRODUCTION = "
                      "played >75% and was not good enough. BOTH = missed games and "
                      "would have missed the cut anyway. AVAILABILITY, not injury — "
                      "these stores cannot tell injury from a healthy scratch.")}


def a2_persistence(positions: dict, established_only: bool = False) -> dict:
    """§13.3. `established_only` restricts to players who already had a real role
    (prior-season availability ≥ AVAIL_LOW).

    ⚠️ WHY THAT ARM EXISTS, and it is not optional. Over ALL skill players,
    "availability" is dominated by ROSTER STATUS, not durability: a fourth
    receiver who was inactive twelve weeks last year and twelve weeks this year
    contributes a huge positive correlation that has nothing to do with getting
    hurt. Mean availability over all skill players is 0.51–0.63 — that
    population is mostly depth. Restricting to players who were already
    available strips the role-persistence channel out and leaves something much
    closer to durability. If the correlation survives the restriction it is
    about staying healthy; if it collapses, the unrestricted number was
    measuring roster churn and would have been a fake finding.
    """
    out = {"availability_to_availability": {}, "availability_to_residual": {}}
    avail = {s: availability(s) for s in SEASONS + (2022,)}
    for pos in POSITIONS:
        pairs = defaultdict(list)
        for s in SEASONS:
            prev, cur = avail[s - 1], avail[s]
            for pid, v in cur.items():
                if positions.get(pid) != pos or pid not in prev:
                    continue
                if established_only and prev[pid]["availability"] < AVAIL_LOW:
                    continue
                pairs[s].append((prev[pid]["availability"], v["availability"]))
        flat = [p for v in pairs.values() for p in v]
        if len(flat) < 12:
            out["availability_to_availability"][pos] = {"n": len(flat),
                                                        "verdict": "insufficient n"}
        else:
            rho = spearman(flat)
            lo, hi = cluster_boot(pairs, spearman)
            per = {str(s): round(spearman(v), 3) for s, v in sorted(pairs.items())
                   if len(v) >= 6}
            signs = [v for v in per.values() if not math.isnan(v)]
            same = max(sum(1 for v in signs if v > 0), sum(1 for v in signs if v < 0))
            excl = (lo > 0 or hi < 0)
            out["availability_to_availability"][pos] = {
                "n": len(flat), "spearman": round(rho, 3),
                "ci95": [round(lo, 3), round(hi, 3)], "per_season": per,
                "same_sign_seasons": same,
                "verdict": ("FINDING" if excl and same >= 2 else
                            "one-season, not replicated" if excl else
                            "not distinguishable from noise")}

        # does last year's availability predict the residual above naive carry-forward
        pr = defaultdict(list)
        for s in SEASONS:
            tot, _gm = E.season_totals(s)
            ptot, _pg = E.season_totals(s - 1)
            prev = avail[s - 1]
            for pid in tot:
                if positions.get(pid) != pos or pid not in prev or pid not in ptot:
                    continue
                if established_only and prev[pid]["availability"] < AVAIL_LOW:
                    continue
                pr[s].append((prev[pid]["availability"], tot[pid] - ptot[pid]))
        flat = [p for v in pr.values() for p in v]
        if len(flat) < 12:
            out["availability_to_residual"][pos] = {"n": len(flat),
                                                    "verdict": "insufficient n"}
            continue
        rho = spearman(flat)
        lo, hi = cluster_boot(pr, spearman)
        per = {str(s): round(spearman(v), 3) for s, v in sorted(pr.items()) if len(v) >= 6}
        signs = [v for v in per.values() if not math.isnan(v)]
        same = max(sum(1 for v in signs if v > 0), sum(1 for v in signs if v < 0))
        excl = (lo > 0 or hi < 0)
        out["availability_to_residual"][pos] = {
            "n": len(flat), "spearman": round(rho, 3),
            "ci95": [round(lo, 3), round(hi, 3)], "per_season": per,
            "same_sign_seasons": same,
            "verdict": ("FINDING" if excl and same >= 2 else
                        "one-season, not replicated" if excl else
                        "not distinguishable from noise")}
    return out


def a3_by_position_and_age(positions: dict) -> dict:
    ages = E.board_ages()
    avail = {s: availability(s) for s in SEASONS}
    pops = {}
    for popname in ("all_skill_players", "drafted_picks_only"):
        drafted = set()
        if popname == "drafted_picks_only":
            for s, rs in E.league_drafts().items():
                for r in rs:
                    drafted.add((s, r["pid"]))
        per_pos = {}
        for pos in POSITIONS:
            groups = defaultdict(list)
            for s in SEASONS:
                for pid, v in avail[s].items():
                    if positions.get(pid) != pos:
                        continue
                    if popname == "drafted_picks_only" and (s, pid) not in drafted:
                        continue
                    groups[s].append(v["availability"])
            flat = [x for v in groups.values() for x in v]
            if not flat:
                per_pos[pos] = {"n": 0}
                continue
            low = sum(1 for x in flat if x <= AVAIL_LOW)
            lo, hi = cluster_boot(groups, mean)
            per_pos[pos] = {
                "n": len(flat), "mean_availability": round(mean(flat), 3),
                "ci95": [round(lo, 3), round(hi, 3)],
                "median_availability": round(median(flat), 3),
                "p_missed_4plus": round(low / len(flat), 3),
                "p_missed_4plus_ci95": [round(x, 3) for x in wilson(low, len(flat))],
                "per_season_mean": {str(s): round(mean(v), 3)
                                    for s, v in sorted(groups.items())}}
        # RB vs WR durability, the folk wisdom
        merged = defaultdict(list)
        for s in SEASONS:
            for pid, v in avail[s].items():
                p = positions.get(pid)
                if p not in ("RB", "WR"):
                    continue
                if popname == "drafted_picks_only" and (s, pid) not in drafted:
                    continue
                merged[s].append((p, v["availability"]))

        def diff(items):
            r = [v for t, v in items if t == "RB"]
            w = [v for t, v in items if t == "WR"]
            return (mean(r) - mean(w)) if r and w else None
        lo, hi = cluster_boot(merged, diff)
        per_season_diff = {str(s): round(diff(v), 3) for s, v in sorted(merged.items())
                           if diff(v) is not None}
        signs = [v for v in per_season_diff.values()]
        pops[popname] = {
            "by_position": per_pos,
            "rb_minus_wr_availability": {
                "diff": round(diff([x for v in merged.values() for x in v]), 3),
                "ci95": [round(lo, 3), round(hi, 3)],
                "per_season": per_season_diff,
                "same_sign_seasons": max(sum(1 for v in signs if v > 0),
                                         sum(1 for v in signs if v < 0)),
                "verdict": ("FINDING" if (lo > 0 or hi < 0) and
                            max(sum(1 for v in signs if v > 0),
                                sum(1 for v in signs if v < 0)) >= 2
                            else "not distinguishable from noise"
                            if not (lo > 0 or hi < 0) else
                            "one-season, not replicated")}}
    # age
    age_rows = {}
    for pos in POSITIONS:
        pairs = defaultdict(list)
        for s in SEASONS:
            for pid, v in avail[s].items():
                if positions.get(pid) != pos:
                    continue
                a26 = ages.get(pid)
                if a26 is None:
                    continue
                pairs[s].append((a26 - (2026 - s), v["availability"]))
        flat = [p for v in pairs.values() for p in v]
        if len(flat) < 12:
            age_rows[pos] = {"n": len(flat), "verdict": "insufficient n"}
            continue
        lo, hi = cluster_boot(pairs, spearman)
        per = {str(s): round(spearman(v), 3) for s, v in sorted(pairs.items())}
        signs = [v for v in per.values() if not math.isnan(v)]
        same = max(sum(1 for v in signs if v > 0), sum(1 for v in signs if v < 0))
        age_rows[pos] = {
            "n": len(flat), "spearman": round(spearman(flat), 3),
            "ci95": [round(lo, 3), round(hi, 3)], "per_season": per,
            "same_sign_seasons": same,
            "verdict": ("FINDING" if (lo > 0 or hi < 0) and same >= 2 else
                        "one-season, not replicated" if (lo > 0 or hi < 0) else
                        "not distinguishable from noise"),
            "_coverage_caveat": "GAP 3 — 2026-board ages only, survivorship-biased"}
    return {"populations": pops, "age_vs_availability": age_rows}


# ── Addition B ──────────────────────────────────────────────────────────────

def market_table() -> dict:
    """The frozen table with exactly two keys changed (§14.2)."""
    t = dict(E.frozen_table())
    t.update(MARKET_SUBSTITUTIONS)
    return t


def _scored(season: int, table: dict) -> dict:
    import sys
    sys.path.insert(0, str(HERE))
    import fetch_component_stats as FCS   # noqa: E402
    wk = FCS.scored_weekly_points(season, table, E.LAST_SCORED_WEEK)
    return {pid: sum(float(v) for v in r.values()) for pid, r in wk.items()}


def _ranked(totals: dict, positions: dict) -> dict:
    by_pos = defaultdict(list)
    for pid, v in totals.items():
        p = positions.get(pid)
        if p in POSITIONS:
            by_pos[p].append((pid, v))
    out = {}
    for p, lst in by_pos.items():
        lst.sort(key=lambda t: -t[1])
        out[p] = {"order": [pid for pid, _ in lst],
                  "pts": {pid: v for pid, v in lst},
                  "rank": {pid: i for i, (pid, _) in enumerate(lst, 1)}}
    return out


def b_format_delta(positions: dict) -> dict:
    import sys
    sys.path.insert(0, str(E.DRAFT / "tools"))
    import draft_replay_2025 as RP     # noqa: E402
    names = RP.name_map()
    league_tbl, mkt_tbl = E.frozen_table(), market_table()
    drafts = E.league_drafts()

    per_season, movers = {}, defaultdict(list)
    share_groups = defaultdict(lambda: defaultdict(list))
    turnover = defaultdict(dict)
    vor_shift = defaultdict(dict)
    tracking = {p: defaultdict(list) for p in POSITIONS}

    for season in SEASONS:
        L = _ranked(_scored(season, league_tbl), positions)
        M = _ranked(_scored(season, mkt_tbl), positions)
        pick_no = {r["pid"]: r["pick_no"] for r in drafts[season]}
        srow = {}
        for pos in POSITIONS:
            K = STARTER_RANK[pos]
            lo_, mo_ = L[pos], M[pos]
            window = mo_["order"][:TOP_MOVER_WINDOW]
            deltas = [lo_["rank"][pid] - mo_["rank"][pid] for pid in window
                      if pid in lo_["rank"]]
            up = sum(1 for d in deltas if d <= -MOVER_RANKS)
            down = sum(1 for d in deltas if d >= MOVER_RANKS)
            l_top, m_top = set(lo_["order"][:K]), set(mo_["order"][:K])
            srow[pos] = {
                "mean_signed_delta_rank_top40": round(mean(deltas), 2),
                "promoted_5plus": up, "demoted_5plus": down, "window_n": len(deltas),
                "starter_set_turnover": len(m_top - l_top),
                "starter_set_k": K,
                "league_top_k_points": round(sum(lo_["pts"][p] for p in l_top), 1),
                "market_top_k_points": round(sum(mo_["pts"][p] for p in m_top), 1),
                "league_replacement": round(lo_["pts"][lo_["order"][K - 1]], 1),
                "market_replacement": round(mo_["pts"][mo_["order"][K - 1]], 1)}
            srow[pos]["league_mean_vor"] = round(
                mean([lo_["pts"][p] for p in lo_["order"][:K]])
                - srow[pos]["league_replacement"], 1)
            srow[pos]["market_mean_vor"] = round(
                mean([mo_["pts"][p] for p in mo_["order"][:K]])
                - srow[pos]["market_replacement"], 1)
            share_groups[pos][season] = deltas
            turnover[pos][str(season)] = len(m_top - l_top)
            vor_shift[pos][str(season)] = round(
                srow[pos]["league_mean_vor"] - srow[pos]["market_mean_vor"], 1)
            for pid in window:
                if pid in lo_["rank"]:
                    movers[pos].append({
                        "season": season, "name": names.get(pid, pid),
                        "delta_rank": lo_["rank"][pid] - mo_["rank"][pid],
                        "market_rank": mo_["rank"][pid],
                        "league_rank": lo_["rank"][pid],
                        "league_pts": round(lo_["pts"][pid], 1),
                        "market_pts": round(mo_["pts"][pid], 1)})
            # which format did the room price?
            drafted = [pid for pid in pick_no if positions.get(pid) == pos
                       and pid in lo_["rank"] and pid in mo_["rank"]]
            if len(drafted) >= 8:
                sl = spearman([(-pick_no[p], -lo_["rank"][p]) for p in drafted])
                sm = spearman([(-pick_no[p], -mo_["rank"][p]) for p in drafted])
                tracking[pos][season] = [(p, pick_no[p], lo_["rank"][p], mo_["rank"][p])
                                         for p in drafted]
                srow[pos]["spearman_pick_vs_league_rank"] = round(sl, 3)
                srow[pos]["spearman_pick_vs_market_rank"] = round(sm, 3)
                srow[pos]["market_minus_league_tracking"] = round(sm - sl, 3)
        # positional share of the summed starter-set points
        lt = {p: srow[p]["league_top_k_points"] for p in POSITIONS}
        mt = {p: srow[p]["market_top_k_points"] for p in POSITIONS}
        sl, sm = sum(lt.values()), sum(mt.values())
        for p in POSITIONS:
            srow[p]["league_share_of_starter_points"] = round(lt[p] / sl, 3)
            srow[p]["market_share_of_starter_points"] = round(mt[p] / sm, 3)
        per_season[str(season)] = srow

    pooled = {}
    for pos in POSITIONS:
        lo, hi = cluster_boot(share_groups[pos], mean)
        d = [per_season[str(s)][pos].get("market_minus_league_tracking")
             for s in SEASONS]
        d = [x for x in d if x is not None]

        def _td(items):
            return mean([m - l for _p, _pk, l, m in items]) if items else None
        pooled[pos] = {
            "mean_signed_delta_rank_top40": round(
                mean([per_season[str(s)][pos]["mean_signed_delta_rank_top40"]
                      for s in SEASONS]), 2),
            "delta_rank_ci95": [round(lo, 2), round(hi, 2)],
            "starter_set_turnover_per_season": turnover[pos],
            "vor_shift_league_minus_market_per_season": vor_shift[pos],
            "vor_shift_mean": round(mean([float(v) for v in vor_shift[pos].values()]), 1),
            "share_of_starter_points": {
                "league": round(mean([per_season[str(s)][pos]
                                      ["league_share_of_starter_points"]
                                      for s in SEASONS]), 3),
                "market": round(mean([per_season[str(s)][pos]
                                      ["market_share_of_starter_points"]
                                      for s in SEASONS]), 3)},
            "room_tracking_market_minus_league": {
                "per_season": {str(s): per_season[str(s)][pos].get(
                    "market_minus_league_tracking") for s in SEASONS},
                "mean": round(mean(d), 3) if d else None,
                "same_sign_seasons": max(sum(1 for x in d if x > 0),
                                         sum(1 for x in d if x < 0)) if d else 0},
        }
        tg = {s: [(0, 0, l, m) for _p, _pk, l, m in v] for s, v in tracking[pos].items()}
        if tg:
            tlo, thi = cluster_boot(tg, _td, reps=800)
            pooled[pos]["room_tracking_market_minus_league"]["rank_gap_ci95"] = \
                [round(tlo, 2), round(thi, 2)]

    top_movers = {}
    for pos in POSITIONS:
        ms = sorted(movers[pos], key=lambda m: m["delta_rank"])
        top_movers[pos] = {"promoted_by_this_format": ms[:10],
                           "demoted_by_this_format": list(reversed(ms[-10:]))}
    return {"per_season": per_season, "pooled": pooled, "top_movers": top_movers,
            "market_table_substitutions": MARKET_SUBSTITUTIONS,
            "_note": ("LEAGUE = frozen table (0.5 PPR, 6-pt pass TD). MARKET = the "
                      "same table with rec 0.5->1.0 and pass_td 6.0->4.0 and NOTHING "
                      "else. Both scored from component_stats through one engine, so "
                      "the 2025 component-vs-committed divergence cancels inside "
                      "every comparison. Negative delta_rank = THIS FORMAT PROMOTES "
                      "HIM relative to the market's format.")}


# ── run ─────────────────────────────────────────────────────────────────────

def run() -> dict:
    E.frozen_table()
    positions = E.positions_record()
    return {
        "_territory": ("TERRITORY: A — produced by "
                       "draft/backtest/empirical_draft_value_additions.py"),
        "_note": ("Additions A (availability) and B (format mispricing) to the "
                  "empirical draft-value study. Preregistered in "
                  "draft/audit/empirical_draft_value_2026-08-16.md §§12-14. "
                  "GAMES ARE COUNTED FROM THE COMPONENT STORE, never from the "
                  "weekly-points stores — nflverse_weekly_points_2025.json drops "
                  "zero-point rows and its row presence means 'scored something', "
                  "not 'played'. AVAILABILITY, never injury: these stores cannot "
                  "tell an injury from a healthy scratch."),
        "a1_bust_attribution": a1_bust_attribution(positions),
        "a2_persistence": a2_persistence(positions),
        "a2_persistence_established_players_only": dict(
            a2_persistence(positions, established_only=True),
            _note=("restricted to players whose prior-season availability was >= "
                   "0.75 — strips the roster-status channel out of the "
                   "correlation. POST-HOC ROBUSTNESS ARM, added because the "
                   "unrestricted number is dominated by depth-chart churn; "
                   "labelled as post-hoc, not preregistered.")),
        "a3_position_and_age": a3_by_position_and_age(positions),
        "b_format_delta": b_format_delta(positions),
    }


def main() -> None:
    out = run()
    (HERE / "empirical_draft_value_additions.json").write_text(
        json.dumps(out, indent=1) + "\n")
    print("wrote empirical_draft_value_additions.json")


if __name__ == "__main__":
    main()
