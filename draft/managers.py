"""A1 — league-mate behavioural models.

Builds a per-manager profile from every prior draft in league history. These
feed the Layer-2 survival model (A2) and the Monte Carlo opponents (A4): knowing
that one guy always takes a QB two rounds early changes what survives to my next
pick far more than a better projection does.

ON ADP HONESTY
--------------
Sleeper does not publish historical ADP, and no free source does either. Two of
the six metrics need a value ordering to measure "reached above market":
`reach_delta` and `bpa_vs_need`. We proxy it with the player's *current*
consensus rank, which is biased — a player who busted ranks low today, so the
manager who drafted him looks like a reacher in hindsight.

As of the real-ADP work, Fantasy Football Calculator publishes historical ADP
by year, so when `historical_adp` is supplied and covers a manager's picks,
these two metrics stop being proxies: `proxy` goes false, `adp_coverage`
records the share priced by real ADP, and the extra shrinkage comes off. The
description below applies only to the fallback path.

That bias is handled three ways, never hidden:
  1. Both affected metrics are marked `proxy: true` in the output.
  2. They are shrunk harder than the ADP-free metrics.
  3. The ADP-free metrics (positional timing, homer, rookie affinity) carry the
     profile when sample size is thin, because they need no market baseline.

⚠ RULED BROKEN, ONE OF THE THREE (A, 2026-08-18, register E13 — E's audit
`rookie_affinity_cannot_vary_2026-08-17.md`): `rookie_affinity` is pinned at
0.0 for all ten managers BY CONSTRUCTION — `years_exp` is read from TODAY'S
Sleeper payload with no contemporaneous fallback, so a 2023 rookie carries
years_exp 3 and is never counted, and the "chases rookies" clause
(`rate > league_rate * 1.5 and rate > 0.08`) is unsatisfiable with both
terms 0.0. Until the fix lands (derive rookie status as draft season minus
first NFL season — Sleeper metadata carries NO years_exp field, so a meta
fallback would change nothing), the stool has two legs: positional timing
and homer. The fix is POST-08-22 by E's own filing (feeds opponent
summaries, not the board's ranking). Note the tension E named: the drafter
study's rookie prior cleared its prereg (+25.1) via a different path
(drafter_skill.py) — that study is the trusted one; this module's zero is
arithmetic, not measurement.
"""
from __future__ import annotations
import json
import statistics
from pathlib import Path

# Shrinkage: with n prior drafts, weight on the manager's own numbers is
# n / (n + PRIOR_STRENGTH). One draft therefore lands at 1/3 of the way from the
# league average to the observed value — a single draft never drives a strong read.
PRIOR_STRENGTH = 2.0
PROXY_PRIOR_STRENGTH = 4.0   # ADP-proxy metrics are shrunk twice as hard

# Share of a manager's ranked picks that must be priced by contemporaneous ADP
# before the market metrics stop being treated as proxies. Below this the
# hindsight bias is still doing real damage and the harder shrinkage stays.
ADP_REAL_THRESHOLD = 0.80

# How far a best-available rate away from the league average swings the Layer-2
# softmax. At 1.0, a manager drafting BPA twice as often as the league lands at
# alpha 0.0 / beta 2.0 before clamping — enough to matter, bounded so it cannot
# switch either term off entirely.
SOFTMAX_TILT = 1.0

SKILL = {"QB", "RB", "WR", "TE"}
LATE = {"K", "DEF"}


def _shrink(observed: float, league_avg: float, n: int, strength: float = PRIOR_STRENGTH) -> float:
    if n <= 0:
        return league_avg
    w = n / (n + strength)
    return w * observed + (1 - w) * league_avg


def _pick_owner(pick: dict) -> str | None:
    return str(pick.get("picked_by") or pick.get("roster_id") or "") or None


def build_profiles(drafts: list[dict], players_db: dict, *, season_now: int | None = None,
                   historical_adp: dict | None = None) -> dict:
    """drafts: output of sleeper_import.all_drafts(). Returns manager_profiles dict."""
    if not drafts:
        return {"managers": {}, "league_average": {}, "drafts_analysed": 0,
                "note": "no prior drafts found — every manager falls back to league average"}

    # --- per-pick enrichment -------------------------------------------------
    rows = []          # one row per pick, enriched
    names = {}         # manager id -> display name
    for d in drafts:
        by_user = {u["user_id"]: u for u in d.get("users", [])}
        roster_owner = {str(r["roster_id"]): str(r.get("owner_id") or "")
                        for r in d.get("rosters", [])}
        picks = sorted(d["picks"], key=lambda p: p.get("pick_no") or 0)
        # Historical picks come back with draft_slot null — only roster_id is
        # populated — so counting slots yields 1 and reads as a one-team league.
        # Count distinct seats instead, and fall back to the roster count.
        seats = {p.get("draft_slot") or p.get("roster_id") for p in picks}
        seats.discard(None)
        n_teams = len(seats) or len(d.get("rosters") or []) or 10

        # Value ordering *within this draft*. Contemporaneous ADP if we have it
        # for that season — that is ground truth, not a proxy. Otherwise fall
        # back to today's consensus rank and keep the hindsight-bias handling.
        season_adp = (historical_adp or {}).get(str(d.get("season"))) or {}
        for p in picks:
            pid = str(p.get("player_id") or "")
            meta = p.get("metadata") or {}
            info = players_db.get(pid) or {}
            real = season_adp.get(pid)
            if real and real.get("adp"):
                rank = float(real["adp"])
            else:
                rank = info.get("search_rank")
                rank = None if rank is None or rank >= 9_999_999 else float(rank)
            owner = _pick_owner(p)
            if owner and owner in roster_owner:
                owner = roster_owner[owner] or owner
            if owner and owner in by_user:
                names[owner] = (by_user[owner].get("display_name")
                                or (by_user[owner].get("metadata") or {}).get("team_name")
                                or owner)
            rows.append({
                "season": d.get("season"),
                "manager": owner,
                "pick_no": p.get("pick_no") or 0,
                "round": p.get("round") or 1,
                "player_id": pid,
                "name": (meta.get("first_name", "") + " " + meta.get("last_name", "")).strip()
                        or info.get("full_name") or pid,
                "position": (meta.get("position") or info.get("position") or "?").upper(),
                "team": (meta.get("team") or info.get("team") or "").upper(),
                "market_rank": rank,
                # True when the ordering came from contemporaneous ADP rather
                # than today's consensus rank standing in for it.
                "market_rank_real": bool(real and real.get("adp")),
                "years_exp": info.get("years_exp"),
                "n_teams": n_teams,
                # A KEPT PLAYER IS NOT A DRAFT DECISION. See KEEPERS below.
                "is_keeper": bool(p.get("is_keeper")),
            })

    managers = sorted({r["manager"] for r in rows if r["manager"]})
    if not managers:
        return {"managers": {}, "league_average": {}, "drafts_analysed": len(drafts),
                "note": "picks carried no manager attribution"}

    # --- league-average baselines -------------------------------------------
    # Keepers are excluded from the baselines as well. Measuring a manager's
    # real picks against an average that includes everybody's keepers would just
    # move the error rather than remove it.
    real_rows = [r for r in rows if not r["is_keeper"]] or rows

    # POSITION COVERAGE. Historical picks carry no metadata — position comes
    # entirely from the Sleeper player DB — so a failed or empty player fetch
    # leaves every row at "?" and every positional metric computes happily on a
    # single fake position. Run-following in particular reads 1.0 for all ten
    # managers, which is not an error message, it is a confident wrong answer.
    #
    # So "?" is treated as MISSING everywhere below, and the coverage is
    # reported. A caller must be able to tell "he has no tendency" from "we
    # could not see his picks".
    pos_known = sum(1 for r in rows if r["position"] != "?")
    pos_coverage = pos_known / len(rows) if rows else 0.0
    positioned = [r for r in real_rows if r["position"] != "?"]
    league_first_round = _first_round_by_position(positioned)
    league_reach = _reach_stats(real_rows)
    # Only rows whose rookie status is DERIVABLE count toward the rate; the rest
    # are absent rather than silently false. The coverage rides in the output so
    # a reader can tell a low rate from a thin one.
    rookie_known = [r for r in real_rows if _was_rookie(r, season_now) is not None]
    rookie_coverage = (len(rookie_known) / len(real_rows)) if real_rows else 0.0
    league_rookie = _rate(rookie_known, lambda r: _was_rookie(r, season_now))
    league_bpa = _bpa_rate(real_rows)
    league_runs = _run_following(positioned, positioned)

    out_managers = {}
    for m in managers:
        every = [r for r in rows if r["manager"] == m]
        # A KEPT PLAYER IS NOT A DRAFT DECISION. It is last year's decision,
        # charged to a round by the keeper cost model rather than chosen against
        # a board. In a 3-keeper league that is 30 of 150 picks — 20% of every
        # profile was being read as behaviour when it was accounting.
        #
        # The damage was not uniform, which is worse than if it had been: a man
        # who keeps a QB at his round-2 cost was recorded as "takes a QB in
        # round 2", and reach_delta compared that assigned round against the
        # player's market ADP, so every keeper read as an enormous reach or an
        # enormous steal depending only on how the cost model priced him.
        mine = [r for r in every if not r["is_keeper"]]
        kept = [r for r in every if r["is_keeper"]]
        if not mine:
            mine = every            # a manager with nothing but keepers: use what there is
            kept = []
        seasons = sorted({r["season"] for r in mine})
        n = len(seasons)
        mine_pos = [r for r in mine if r["position"] != "?"]

        first_round = _first_round_by_position(mine_pos)
        timing = {}
        # RB and WR were missing here. They are the two positions a draft is
        # actually made of, and "when does he take his first RB" is the single
        # most useful thing to know about an opponent.
        for pos in ("QB", "RB", "WR", "TE", "K", "DEF"):
            obs, avg = first_round.get(pos), league_first_round.get(pos)
            if obs is None or avg is None:
                continue
            timing[pos] = {
                "mean_round": round(_shrink(obs, avg, n), 2),
                "vs_league": round(_shrink(obs, avg, n) - avg, 2),
                "raw_mean_round": round(obs, 2),
            }

        # Share of this manager's picks measured against real historical ADP.
        # Above ADP_REAL_THRESHOLD the two market metrics stop being proxies:
        # the hindsight bias is gone, so the extra shrinkage comes off too.
        ranked = [r for r in mine if r.get("market_rank") is not None]
        adp_cov = (sum(1 for r in ranked if r.get("market_rank_real")) / len(ranked)) if ranked else 0.0
        is_proxy = adp_cov < ADP_REAL_THRESHOLD
        market_strength = PROXY_PRIOR_STRENGTH if is_proxy else PRIOR_STRENGTH

        reach = _reach_stats(mine)
        homer_team, homer_rate = _homer(mine)
        mine_rookie_known = [r for r in mine if _was_rookie(r, season_now) is not None]
        rookie = _rate(mine_rookie_known, lambda r: _was_rookie(r, season_now))
        bpa = _bpa_rate(mine, real_rows)

        profile = {
            "name": names.get(m, m),
            "manager_id": m,
            "sample_size": n,
            "picks_analysed": len(mine),
            "shrinkage_weight": round(n / (n + PRIOR_STRENGTH), 3),
            "reach_delta": {
                # RELATIVE TO THIS LEAGUE, not to raw ADP.
                #
                # Keepers are removed from the board but ADP still ranks them,
                # so in a 3-keeper league every real pick lands ~30 places
                # "ahead of market" by construction. Reported absolute, that put
                # a "reaches N picks above market" tell on all ten managers —
                # a systematic offset dressed up as ten separate findings.
                #
                # Subtracting the league mean cancels the offset and leaves the
                # only part that was ever about him: how he reaches compared to
                # the people he actually drafts against.
                "mean": round(_shrink(reach["mean"], league_reach["mean"], n, market_strength)
                              - league_reach["mean"], 2),
                "mean_vs_adp": round(_shrink(reach["mean"], league_reach["mean"], n, market_strength), 2),
                "league_mean_vs_adp": round(league_reach["mean"], 2),
                "sd": round(reach["sd"] if reach["sd"] else league_reach["sd"], 2),
                "raw_mean": round(reach["mean"], 2),
                "proxy": is_proxy,
                "adp_coverage": round(adp_cov, 3),
            },
            "positional_timing": timing,
            "homer_index": {
                "team": homer_team,
                "rate": round(_shrink(homer_rate, 1.0 / 32, n), 3),
                "raw_rate": round(homer_rate, 3),
            },
            "rookie_affinity": {
                "rate": round(_shrink(rookie, league_rookie, n), 3),
                "league_rate": round(league_rookie, 3),
                # A rate over 4 derivable picks and a rate over 45 are different
                # claims. Absent rows are excluded rather than counted false, so
                # the denominator has to travel with the number.
                "derivable_picks": len(mine_rookie_known),
                "picks": len(mine),
            },
            "bpa_vs_need": {
                "bpa_rate": round(_shrink(bpa, league_bpa, n, market_strength), 3),
                "league_rate": round(league_bpa, 3),
                "proxy": is_proxy,
                "adp_coverage": round(adp_cov, 3),
            },
            "positional_mix": _positional_mix(mine_pos),
            # --- sequence, not aggregate ------------------------------------
            # Everything above is a mean or a rate, and a mean is exactly what
            # hides a pattern: "takes a QB in round 4 on average" is the same
            # number whether he goes 4-4-4 or 1-4-7, and those are two different
            # opponents. These read the draft in order instead.
            "draft_patterns": {
                # Share of his picks whose position is actually known. Below 1.0
                # every positional figure here is computed on a subset.
                "position_coverage": round(
                    len(mine_pos) / len(mine), 3) if mine else 0.0,
                "openings": _openings(mine_pos),
                "consistency": _consistency(mine_pos),
                "run_following": {
                    # The whole draft is the universe: a run is made of OTHER
                    # people's picks. Passing only his own leaves the window
                    # short and scores every manager a flat zero.
                    "rate": round(_run_following(mine_pos, positioned), 3),
                    "league_rate": round(league_runs, 3),
                },
                "by_round_bucket": _round_buckets(mine_pos),
                "repeat_targets": _repeat_targets(mine),
                "stack_rate": round(_stack_rate(mine_pos), 3),
            },
            "keepers": {
                "excluded_from_metrics": len(kept),
                "picks_kept": [{"season": r["season"], "round": r["round"],
                                "name": r["name"], "position": r["position"]}
                               for r in sorted(kept, key=lambda r: (r["season"], r["round"]))],
            },
        }
        # α/β for the Layer-2 softmax (A2): a BPA drafter weights value, a needs
        # drafter weights empty slots. Centred so league-average lands at 1.0/1.0.
        bpa_rate = profile["bpa_vs_need"]["bpa_rate"]
        ref = max(0.05, league_bpa)
        # THE BUG THIS FIXES: the comment above has always said "centred so
        # league-average lands at 1.0/1.0", and the arithmetic did not. At a
        # ratio of exactly 1.0 the old form gave alpha 0.5 and beta 2.0 — a
        # perfectly average manager modelled as weighting value four times need,
        # in every survival calculation, for every seat.
        #
        # Now genuinely symmetric about 1.0: a manager who drafts best-available
        # more than the league leans to value, less than the league leans to
        # need, and exactly at the league leans neither way.
        tilt = SOFTMAX_TILT * ((bpa_rate / ref) - 1.0)
        profile["softmax"] = {
            "alpha_need": round(min(2.5, max(0.2, 1.0 - tilt)), 3),
            "beta_value": round(min(2.5, max(0.2, 1.0 + tilt)), 3),
        }
        profile["summary"] = _plain_language(profile)
        out_managers[m] = profile

    return {
        "managers": out_managers,
        "league_average": {
            "first_round_by_position": {k: round(v, 2) for k, v in league_first_round.items()},
            "reach_delta_mean": round(league_reach["mean"], 2),
            "rookie_rate": round(league_rookie, 3),
            # Derived from (season_now - draft season) against years_exp, so it
            # answers "was he a rookie THEN". Coverage rides beside it because a
            # 0.0 from "nobody drafted a rookie" and a 0.0 from "we could not
            # tell" are different facts and used to be indistinguishable.
            "rookie_rate_coverage": round(rookie_coverage, 3),
            "rookie_rate_basis": ("years_exp == season_now - draft_season"
                                  if season_now else "UNDERIVABLE — season_now not supplied"),
            "bpa_rate": round(league_bpa, 3),
        },
        "drafts_analysed": len(drafts),
        # Which drafts this was built from. A completed draft never changes, so
        # this is the whole basis for skipping the rebuild — and for noticing
        # when a NEW draft appears and the profiles genuinely are stale.
        "draft_ids": sorted(str(d.get("draft_id")) for d in drafts if d.get("draft_id")),
        "picks_total": len(rows),
        "picks_kept_excluded": sum(1 for r in rows if r["is_keeper"]),
        "position_coverage": round(pos_coverage, 3),
        "seasons": sorted({d.get("season") for d in drafts if d.get("season")}),
        "editable": "Hand-edit any value here; the build never overwrites a file "
                    "whose `locked` flag is true.",
    }


# --- metric helpers ----------------------------------------------------------

def _first_round_by_position(rows: list[dict]) -> dict[str, float]:
    """Mean round of a manager's *first* pick at each position, per season."""
    firsts: dict[str, list[int]] = {}
    by_key: dict[tuple, dict[str, int]] = {}
    for r in rows:
        key = (r["manager"], r["season"])
        seen = by_key.setdefault(key, {})
        pos = r["position"]
        if pos not in seen:
            seen[pos] = r["round"]
    for seen in by_key.values():
        for pos, rnd in seen.items():
            firsts.setdefault(pos, []).append(rnd)
    return {pos: statistics.fmean(v) for pos, v in firsts.items() if v}


def _reach_stats(rows: list[dict]) -> dict:
    """(market rank − pick number): positive means they took him early."""
    deltas = [r["market_rank"] - r["pick_no"] for r in rows
              if r.get("market_rank") is not None and r.get("pick_no")]
    if not deltas:
        return {"mean": 0.0, "sd": 0.0, "n": 0}
    return {
        "mean": statistics.fmean(deltas),
        "sd": statistics.pstdev(deltas) if len(deltas) > 1 else 0.0,
        "n": len(deltas),
    }


def _rate(rows: list[dict], pred) -> float:
    if not rows:
        return 0.0
    return sum(1 for r in rows if pred(r)) / len(rows)


def _was_rookie(r: dict, season_now: int | None):
    """Was this player a rookie AT THE DRAFT — not "is he a rookie today".

    THE DEFECT THIS REPLACES (session E, 2026-08-17, register E13). This used to
    be `r.get("years_exp") == 0`, and `years_exp` comes from TODAY'S Sleeper
    payload while the row describes a draft from 2023-25. A player taken as a
    rookie in 2023 carries `years_exp` 3 now, so he was never counted; the only
    rows that could qualify were players who are rookies TODAY, and none of them
    appear in a past draft. **The rate was pinned at 0.0 by construction** —
    0.0 for the league and 0.0 for all ten managers across ~450 picks — and the
    `"chases rookies"` line it feeds was unsatisfiable and had never once fired.

    THE DERIVATION NEEDS NOTHING NEW. `years_exp` counts seasons since debut, so
    a player who debuted in the draft's own season satisfies
    `years_exp == season_now - draft_season`. Both terms were already here:
    the row has carried `season` since it was written, and `season_now` has been
    a `build_profiles` parameter all along — declared, never read, and never
    passed. The fix that was missing was sitting in the signature.

    RETURNS None, NOT False, WHEN IT CANNOT BE DERIVED, and that distinction is
    the point. `position` already gets this treatment via its `"?"` sentinel so
    a caller *"must be able to tell 'he has no tendency' from 'we could not see
    his picks'"*. A missing `years_exp` counted as False is exactly how the old
    behaviour laundered "unknown" into "no rookies drafted".
    """
    ye, ds = r.get("years_exp"), r.get("season")
    if ye is None or not ds or not season_now:
        return None
    try:
        gap = int(season_now) - int(ds)
    except (TypeError, ValueError):
        return None
    if gap < 0:
        return None          # a draft from the future is not a rookie question
    return int(ye) == gap


def _homer(rows: list[dict]) -> tuple[str | None, float]:
    """Most-drafted NFL team and the share of picks it accounts for."""
    counts: dict[str, int] = {}
    for r in rows:
        if r["team"]:
            counts[r["team"]] = counts.get(r["team"], 0) + 1
    if not counts:
        return None, 0.0
    team = max(counts, key=counts.get)
    return team, counts[team] / max(1, len(rows))


# A pick counts as best-available if at most this many better-ranked players
# were still on the board when it was made.
BPA_SLACK = 2


def _bpa_rate(rows: list[dict], universe: list[dict] | None = None) -> float:
    """How often the pick was (near) the best player available by market rank.

    THE BUG THIS FIXES. The board has to be reconstructed from EVERY pick in
    the draft, and only the rows being measured are scored against it. The old
    version reconstructed the board from whatever rows it was handed — so a
    manager was measured against a board containing only his own 40 picks,
    where almost nothing better is ever "still available", while the league was
    measured against all 150. The two numbers were computed over different
    universes and were never comparable.

    It showed: every manager came out at 62-71% "best available" against a
    league average of 31%. All ten above average, which is not a finding, it is
    an arithmetic error.

    And it was not cosmetic. bpa_rate drives softmax alpha_need/beta_value, so
    a ratio of ~2.2 drove alpha to its 0.2 floor and beta to 3.8 for EVERY
    manager — the need term was effectively switched off for all ten seats in
    every survival calculation the tool has ever run.
    """
    universe = universe if universe is not None else rows
    measure = {(str(r["season"]), r["pick_no"]) for r in rows}

    by_draft: dict[str, list[dict]] = {}
    for r in universe:
        by_draft.setdefault(str(r["season"]), []).append(r)

    hits = total = 0
    for group in by_draft.values():
        ordered = sorted(group, key=lambda r: r["pick_no"])
        ranked = sorted([r for r in ordered if r.get("market_rank") is not None],
                        key=lambda r: r["market_rank"])
        rank_pos = {r["player_id"]: i for i, r in enumerate(ranked)}
        # Walk the whole draft so the board thins correctly, but only score the
        # picks we were asked about.
        gone: set[str] = set()
        for r in ordered:
            if r.get("market_rank") is None:
                continue
            if (str(r["season"]), r["pick_no"]) in measure:
                better_available = sum(
                    1 for q in ranked
                    if q["player_id"] not in gone
                    and rank_pos[q["player_id"]] < rank_pos[r["player_id"]]
                )
                total += 1
                if better_available <= BPA_SLACK:
                    hits += 1
            gone.add(r["player_id"])
    return hits / total if total else 0.0


def _positional_mix(rows: list[dict]) -> dict:
    """Share of picks by position within the first 6 rounds — the shape of their build."""
    early = [r for r in rows if r["round"] <= 6]
    if not early:
        return {}
    counts: dict[str, int] = {}
    for r in early:
        counts[r["position"]] = counts.get(r["position"], 0) + 1
    return {k: round(v / len(early), 3) for k, v in sorted(counts.items())}


def _plain_language(p: dict) -> str:
    """The 'Know Your League' card text. Plain English, no jargon."""
    bits = []
    reach = p["reach_delta"]["mean"]
    if reach > 6:
        bits.append(f"Reaches ~{reach:.0f} picks early")
    elif reach < -6:
        bits.append(f"Waits — lets value fall ~{abs(reach):.0f} picks")
    else:
        bits.append("Drafts near market value")

    for pos in ("QB", "TE"):
        t = p["positional_timing"].get(pos)
        if not t:
            continue
        if t["vs_league"] <= -1.0:
            bits.append(f"takes {pos} early (round {t['mean_round']:.0f} on average, "
                        f"{abs(t['vs_league']):.1f} rounds before the league)")
        elif t["vs_league"] >= 1.0:
            bits.append(f"waits on {pos} (round {t['mean_round']:.0f})")

    h = p["homer_index"]
    if h["team"] and h["rate"] > 0.14:
        bits.append(f"loves {h['team']} ({h['rate'] * 100:.0f}% of picks)")

    r = p["rookie_affinity"]
    if r["rate"] > r["league_rate"] * 1.5 and r["rate"] > 0.08:
        bits.append("chases rookies")

    b = p["bpa_vs_need"]
    if b["bpa_rate"] > b["league_rate"] * 1.15:
        bits.append("takes best available")
    elif b["bpa_rate"] < b["league_rate"] * 0.85:
        bits.append("drafts for need")

    if p["sample_size"] < 2:
        bits.append(f"⚠ only {p['sample_size']} prior draft — read regressed to league average")
    return ". ".join(x[0].upper() + x[1:] for x in bits) + "."


# --- persistence -------------------------------------------------------------

def save(profiles: dict, path: str | Path) -> None:
    path = Path(path)
    # Never clobber hand edits.
    if path.exists():
        try:
            existing = json.loads(path.read_text())
            if existing.get("locked"):
                print(f"  {path.name} is locked — keeping hand-edited profiles")
                return
            for mid, prof in (existing.get("managers") or {}).items():
                if prof.get("locked") and mid in profiles.get("managers", {}):
                    profiles["managers"][mid] = prof
        except (json.JSONDecodeError, OSError):
            pass
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(profiles, indent=2, sort_keys=True))


# --- evaluation (acceptance test support) ------------------------------------

def predict_position(profile: dict | None, league_avg: dict, round_no: int,
                     available_positions: set[str]) -> dict[str, float]:
    """P(position) for a manager's next pick — the thing profiles must predict better."""
    scores = {}
    for pos in available_positions:
        base = 1.0
        avg_round = (league_avg.get("first_round_by_position") or {}).get(pos)
        if avg_round:
            # Closer to a manager's typical round for that position -> likelier.
            target = avg_round
            if profile:
                t = (profile.get("positional_timing") or {}).get(pos)
                if t:
                    target = t["mean_round"]
            base = 1.0 / (1.0 + abs(round_no - target))
        if profile:
            mix = profile.get("positional_mix") or {}
            base *= (0.35 + mix.get(pos, 0.0) * 3.0)
        scores[pos] = max(1e-6, base)
    total = sum(scores.values())
    return {k: v / total for k, v in scores.items()}


# --- sequence-aware patterns -------------------------------------------------
#
# The metrics above are all means and rates over a bag of picks. They are useful
# and they are also exactly what conceals a tendency, because a mean throws away
# the order the picks happened in — and the order IS the strategy.

# How many of a manager's opening picks to record. Four covers the shape of a
# build (which two positions he anchors, and whether he takes a TE or QB early)
# without running so long that no two seasons ever match.
OPENING_DEPTH = 4
# A run is this many picks of the same position inside the preceding window.
RUN_WINDOW = 5
RUN_THRESHOLD = 2
# Round boundaries for the early/mid/late shape. Early is the anchor, mid is
# where a strategy shows, late is streamers and lottery tickets.
BUCKETS = (("early", 1, 3), ("mid", 4, 8), ("late", 9, 99))


def _openings(rows: list[dict]) -> dict:
    """The literal positional sequence of each season's first picks.

    "RB-RB-WR-TE, all three years" is a sentence you can act on. "RB share 0.42"
    is not. Where a manager repeats a shape, that repetition is the finding.
    """
    by_season: dict[str, list[dict]] = {}
    for r in rows:
        by_season.setdefault(str(r["season"]), []).append(r)
    seqs = {}
    for season, picks in by_season.items():
        ordered = sorted(picks, key=lambda r: r["pick_no"])[:OPENING_DEPTH]
        seqs[season] = [r["position"] for r in ordered]
    shapes: dict[str, int] = {}
    for seq in seqs.values():
        shapes["-".join(seq)] = shapes.get("-".join(seq), 0) + 1

    # The first two picks are where repetition actually shows up; four-pick
    # sequences almost never repeat exactly, so reporting only those would
    # report "no pattern" for a man with an obvious one.
    pairs: dict[str, int] = {}
    for seq in seqs.values():
        if len(seq) >= 2:
            key = "-".join(seq[:2])
            pairs[key] = pairs.get(key, 0) + 1
    best_pair, best_n = (max(pairs.items(), key=lambda kv: kv[1]) if pairs else (None, 0))
    return {
        "by_season": seqs,
        "seasons": len(seqs),
        "most_common_open": best_pair,
        "most_common_open_count": best_n,
        # Only a repeat is evidence. One season is a sequence, not a habit.
        "repeats": best_n >= 2,
    }


def _consistency(rows: list[dict]) -> dict:
    """Does he do the same thing every year, or is the mean hiding a spread?

    Reported per position as the spread of the round he first takes it. A low
    spread means the mean is a real prediction; a high one means the mean is an
    artefact and you should not plan around it.
    """
    by_season: dict[str, dict[str, int]] = {}
    for r in sorted(rows, key=lambda r: r["pick_no"]):
        seen = by_season.setdefault(str(r["season"]), {})
        seen.setdefault(r["position"], r["round"])
    out = {}
    for pos in ("QB", "RB", "WR", "TE", "K", "DEF"):
        rounds = [s[pos] for s in by_season.values() if pos in s]
        if len(rounds) < 2:
            continue
        spread = max(rounds) - min(rounds)
        out[pos] = {
            "rounds": rounds,
            "spread": spread,
            "sd": round(statistics.pstdev(rounds), 2),
            # Two rounds of drift across seasons is still a plan. More than that
            # and "he takes a QB in round 4" is a number, not a tendency.
            "predictable": spread <= 2,
        }
    return out


def _run_following(rows: list[dict], all_rows: list[dict] | None = None) -> float:
    """How often he takes a position that the picks just before him piled into.

    Herd behaviour is directly exploitable: a follower is predictable the moment
    a run starts, and a contrarian is the reason your run-detection is wrong
    about one seat. Measured against the whole draft's pick sequence, so it needs
    every manager's picks, not just his.
    """
    universe = all_rows if all_rows is not None else rows
    ordered = sorted(universe, key=lambda r: (str(r["season"]), r["pick_no"]))
    by_key = {(str(r["season"]), r["pick_no"]): r for r in ordered}
    mine = {(str(r["season"]), r["pick_no"]) for r in rows}
    hits = total = 0
    for r in ordered:
        key = (str(r["season"]), r["pick_no"])
        if key not in mine:
            continue
        window = [by_key[(key[0], n)] for n in range(r["pick_no"] - RUN_WINDOW, r["pick_no"])
                  if (key[0], n) in by_key]
        if len(window) < RUN_WINDOW:
            continue            # too early in the draft for a run to exist yet
        same = sum(1 for w in window if w["position"] == r["position"])
        total += 1
        if same >= RUN_THRESHOLD:
            hits += 1
    return hits / total if total else 0.0


def _round_buckets(rows: list[dict]) -> dict:
    """Positional shape early / mid / late, rather than one blended mix."""
    out = {}
    for name, lo, hi in BUCKETS:
        block = [r for r in rows if lo <= r["round"] <= hi]
        if not block:
            continue
        counts: dict[str, int] = {}
        for r in block:
            counts[r["position"]] = counts.get(r["position"], 0) + 1
        out[name] = {"picks": len(block),
                     "mix": {k: round(v / len(block), 3)
                             for k, v in sorted(counts.items(), key=lambda kv: -kv[1])}}
    return out


def _repeat_targets(rows: list[dict]) -> list[dict]:
    """Players he has drafted in more than one season.

    The most human pattern there is, and the easiest to use: if he has taken the
    same man three years running, he will pay above market for him again.
    """
    by_player: dict[str, list[dict]] = {}
    for r in rows:
        by_player.setdefault(r["player_id"], []).append(r)
    out = []
    for pid, picks in by_player.items():
        seasons = sorted({str(p["season"]) for p in picks})
        if len(seasons) < 2:
            continue
        out.append({
            "player_id": pid,
            "name": picks[0]["name"],
            "position": picks[0]["position"],
            "seasons": seasons,
            "times": len(seasons),
            "rounds": [p["round"] for p in sorted(picks, key=lambda x: str(x["season"]))],
        })
    out.sort(key=lambda x: (-x["times"], x["name"]))
    return out


def _stack_rate(rows: list[dict]) -> float:
    """Share of his QBs paired with a pass-catcher from the same NFL team.

    Zero across three seasons is as much a tell as a high rate: it means a run
    on a QB's receivers tells you nothing about whether he is next.
    """
    by_season: dict[str, list[dict]] = {}
    for r in rows:
        by_season.setdefault(str(r["season"]), []).append(r)
    qbs = stacked = 0
    for picks in by_season.values():
        catchers = {(p["team"], p["position"]) for p in picks if p["position"] in ("WR", "TE")}
        for q in [p for p in picks if p["position"] == "QB"]:
            qbs += 1
            if q["team"] and any(t == q["team"] for t, _ in catchers):
                stacked += 1
    return stacked / qbs if qbs else 0.0
