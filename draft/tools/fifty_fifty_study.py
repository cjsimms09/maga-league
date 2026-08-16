# TERRITORY: A
"""THE 50/50 STUDY — what actually decides coin-flip picks. (2026-08-16)

Cory, verbatim: "Is it in the actual roster construction? Is it in the 50/50
picks? Find it, beat it, prove it, implement it."

PREREGISTERED in draft/audit/edge_hunt_2026-08-16.md §1 (committed before
this file produced a single pair — commit eb367719). The exact form lives
there; the short version:

  PAIRS, two sources:
    A. replay near-ties — at each of Cory's live skill pick moments in the
       committed replay harness's PRIMARY configuration (draft_replay_2025,
       imported, never edited), every (chosen, alternative) candidate pair
       within a VORP band (primary 5.0 season pts; sensitivity 2.0 / 10.0),
       reconstructed from the replay's own pick log with a parity pin: the
       enumeration's top candidate must equal the logged pick or this miner
       REFUSES to emit.
    B. actual-draft near-ties — same-position, non-keeper skill picks taken
       within <= 5 overall slots of each other in the league's real 2023-25
       drafts (the room's revealed near-tie). NO historical ADP archive
       exists for these drafts; pick distance is the honest substitute and
       every quote of source B says so.

  OUTCOME: realized season-Y points (committed weekly stores, weeks 1-17;
  a player with no rows realized 0 — a realized outcome, not missing data).
  Secondary: weeks-won over co-active weeks.

  FEATURES F1-F9 (age, experience, prior games missed, TD-share, team
  change, prior ppg, late trajectory, weekly cv, team-pos-No1 proxy), each
  strictly pick-time-knowable, each with a preregistered favored direction;
  a pair missing a feature is ABSENT from that feature's cell and counted —
  absent is not zero. Features absent by design (ADP velocity, playoff-SOS
  slate, live depth charts) are named in the artifact, not silently dropped.

  VERDICT per feature: PREDICTIVE iff pooled Wilson 95% CI excludes 0.50
  AND pooled n >= 30; else "predicted nothing (n=...)" — printed exactly so.

LEAKAGE: features for a season-Y pair open only < Y stores, with two named
exceptions (board-age arithmetic — the replay's own declared time-invariant
construction — and F5's read of the Y store's TEAM field, a public pre-draft
fact whose in-store availability conditions on having played; pairs where
either side has no Y row are absent for F5). The features_prior() path is
traced by test; teams_of_season() is the single named >= Y reader.

Run: python3 draft/tools/fifty_fifty_study.py
Writes draft/data/fifty_fifty_study.json (deterministic byte-for-byte).
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent          # draft/tools
DRAFT = HERE.parent
ROOT = DRAFT.parent
sys.path.insert(0, str(HERE))

import draft_replay_2025 as R  # noqa: E402  (imported, never edited)

FCS = R.FCS                                     # the same store accessors
OUT = DRAFT / "data" / "fifty_fifty_study.json"

SEASONS = (2023, 2024, 2025)
BAND_PRIMARY = 5.0                              # preregistered
BANDS = (2.0, 5.0, 10.0)                        # sensitivity brackets
ACTUAL_GAP = 5                                  # preregistered source-B gap
MIN_N = 30                                      # preregistered verdict floor
TD_KEYS = ("pass_td", "rush_td", "rec_td")      # preregistered F4 numerator
CV_MIN_GAMES = 6                                # preregistered F8 floor
STORE_FIRST_SEASON = 2021                       # F2 censoring point, named

QUESTION_VERBATIM = ("Is it in the actual roster construction? Is it in the "
                     "50/50 picks? Find it, beat it, prove it, implement it.")

#: feature -> (label, favored-direction description). Directions preregistered.
FEATURES = {
    "age": "younger wins",
    "experience": "fewer prior store seasons wins (censored at 2021 — said)",
    "games_missed_prior": "fewer Y-1 games missed wins",
    "td_share_prior": "LOWER Y-1 TD-share wins (TD regression)",
    "team_change": "the stayer wins (continuity)",
    "ppg_prior": "higher Y-1 points/game wins",
    "late_trajectory": "hotter Y-1 finish wins",
    "weekly_cv_prior": "HIGHER Y-1 weekly cv wins (weekly-high league)",
    "team_pos_no1_prior": "the modal-team position No.1 wins (depth PROXY)",
}

ABSENT_BY_DESIGN = [
    "adp_velocity — no historical ADP archive exists for these drafts; "
    "source B's pick distance is the revealed-pricing substitute, named",
    "playoff_weeks_slate — playoff_sos_2026.json is 2025-defenses-for-2026 "
    "only; not period-correct for 2023-25, therefore NOT graded",
    "depth_chart_order — live depth charts exist only on the 2026 board; "
    "F9's team-position-No.1 is the named PROXY",
]


# ── arithmetic ───────────────────────────────────────────────────────────────

def wilson(wins: int, n: int) -> dict:
    """Wilson 95% score interval. None fields when n == 0 (absent, not 0)."""
    if n <= 0:
        return {"p": None, "lo": None, "hi": None}
    z = 1.959963984540054
    p = wins / n
    den = 1 + z * z / n
    centre = (p + z * z / (2 * n)) / den
    half = (z / den) * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))
    return {"p": round(p, 4), "lo": round(centre - half, 4),
            "hi": round(centre + half, 4)}


# ── shared season substrate (memoized — the stores load once) ────────────────

_MEMO: dict = {}


def weekly_of(season: int) -> dict:
    if ("wk", season) not in _MEMO:
        _MEMO[("wk", season)] = R.weekly_points_of(season)
    return _MEMO[("wk", season)]


def totals_of(season: int) -> dict:
    if ("tot", season) not in _MEMO:
        _MEMO[("tot", season)] = {pid: sum(rows.values())
                                  for pid, rows in weekly_of(season).items()}
    return _MEMO[("tot", season)]


def lines_of(season: int) -> dict:
    """Component lines {pid: {week: line}} — team + stat fields."""
    if ("ln", season) not in _MEMO:
        _MEMO[("ln", season)] = FCS.component_weeks(season, 1,
                                                    R.LAST_SCORED_WEEK)
    return _MEMO[("ln", season)]


def modal_team_of(season: int) -> dict:
    """{pid: team with the most rows that season} (ties: lexicographic)."""
    if ("team", season) not in _MEMO:
        out = {}
        for pid, rows in lines_of(season).items():
            counts: dict[str, int] = {}
            for line in rows.values():
                t = line.get("team")
                if t:
                    counts[t] = counts.get(t, 0) + 1
            if counts:
                out[pid] = max(sorted(counts), key=lambda t: counts[t])
        _MEMO[("team", season)] = out
    return _MEMO[("team", season)]


def teams_of_season(season: int) -> dict:
    """F5's NAMED >= Y exception: {pid: team of the pid's FIRST season-Y
    row}. The team identity was public pre-draft (free agency); its in-store
    availability conditions on having played — callers treat absence as
    ABSENT for F5, never as 'no move'."""
    out = {}
    for pid, rows in lines_of(season).items():
        w = min(rows)
        t = rows[w].get("team")
        if t:
            out[pid] = t
    return out


# ── the feature table for one replay season (strictly < Y, traced) ──────────

def features_prior(season: int, positions: dict, ages: dict) -> dict:
    """{pid: feature dict} from strictly-prior stores only (plus the
    time-invariant board-age arithmetic, the replay's own construction).
    F5's Y-side read happens in teams_of_season(), the named exception —
    NOT here, so this whole path is tracer-clean below season Y."""
    y1 = season - 1
    weekly1 = weekly_of(y1)
    totals1 = totals_of(y1)
    late1 = R.late_rates_of(y1)
    table = R.frozen_table()
    lines1 = lines_of(y1)
    teams1 = modal_team_of(y1)

    # experience: prior seasons with any store row (censored at 2021).
    seasons_with_rows = {pid: 0 for pid in set().union(
        *[set(weekly_of(y)) for y in range(STORE_FIRST_SEASON, season)])}
    for y in range(STORE_FIRST_SEASON, season):
        for pid in weekly_of(y):
            seasons_with_rows[pid] += 1

    # team-position No.1 by realized Y-1 points among modal-team peers.
    top_at: dict[tuple, str] = {}
    for pid, team in teams1.items():
        pos = positions.get(pid)
        if pos not in R.POSITIONS:
            continue
        key = (team, pos)
        best = top_at.get(key)
        if best is None or (totals1.get(pid, 0.0), pid) \
                > (totals1.get(best, 0.0), best):
            top_at[key] = pid

    out = {}
    for pid, rows in weekly1.items():
        pos = positions.get(pid)
        games = len(rows)
        total = totals1.get(pid, 0.0)
        ppg = total / games if games else None
        # F4 TD share from component lines under the frozen table.
        td_share = None
        if pid in lines1 and total > 0:
            td_pts = 0.0
            for line in lines1[pid].values():
                for k in TD_KEYS:
                    td_pts += float(line.get(k, 0)) * float(table.get(k, 0.0))
            td_share = td_pts / total
        # F7 trajectory: late-window rate minus season rate.
        late_traj = None
        if pid in late1 and ppg is not None:
            late_traj = late1[pid] - ppg
        # F8 weekly cv.
        cv = None
        if games >= CV_MIN_GAMES:
            vals = list(rows.values())
            m = sum(vals) / games
            if m > 0:
                sd = math.sqrt(sum((v - m) ** 2 for v in vals) / (games - 1))
                cv = sd / m
        age_2026 = ages.get(pid)
        team = teams1.get(pid)
        out[pid] = {
            "age": (float(age_2026) - (2026 - season))
            if age_2026 is not None else None,
            "experience": seasons_with_rows.get(pid),
            "games_missed_prior": float(R.LAST_SCORED_WEEK - games),
            "td_share_prior": td_share,
            "prior_team": team,             # F5's < Y half
            "ppg_prior": ppg,
            "late_trajectory": late_traj,
            "weekly_cv_prior": cv,
            "team_pos_no1_prior": (top_at.get((team, pos)) == pid)
            if team is not None and pos in R.POSITIONS else None,
        }
    return out


# ── pair mining ──────────────────────────────────────────────────────────────

def mine_replay_pairs(picks: list, keeper_pids: set, proj: dict, repl: dict,
                      positions: dict, log: list,
                      max_band: float = max(BANDS)) -> list:
    """Reconstruct every tool pick moment from the replay's own log and
    collect (chosen, alternative) pairs within max_band VORP points.
    PARITY PIN: the enumeration's top candidate must equal the logged pick
    at every moment, else this raises — a drifted reimplementation must
    refuse rather than mine pairs from a board that never existed."""
    caps, starters = R.POSITION_CAPS, R.STARTER_SLOTS
    taken: set[str] = set()
    counts = {p: 0 for p in caps}
    seen_pairs: set[tuple] = set()
    pairs = []

    def flex_used() -> int:
        return sum(max(0, counts[q] - starters[q]) for q in R.FLEX_ELIGIBLE)

    for e in log:
        pid = str(e["player_id"])
        pos = positions.get(pid)
        if e["how"] != "tool":
            taken.add(pid)
            if e["how"] == "keeper" and pos in counts:
                counts[pos] += 1
            continue
        forced = bool(e.get("forced"))
        cands = []
        for cand in sorted(proj):
            if cand in taken:
                continue
            cpos = positions.get(cand)
            if cpos not in caps or counts[cpos] >= caps[cpos]:
                continue
            if forced:
                fills_dedicated = counts[cpos] < starters[cpos]
                fills_flex = (cpos in R.FLEX_ELIGIBLE
                              and flex_used() < R.FLEX_SLOTS)
                if not (fills_dedicated or fills_flex):
                    continue
            v = proj[cand] - repl.get(cpos, 0.0)
            cands.append((-v, -proj[cand], cand, cpos))
        cands.sort()
        if not cands or cands[0][2] != pid:
            raise RuntimeError(
                f"parity pin FAILED at pick {e['pick_no']}: reconstruction "
                f"top {cands[0][2] if cands else None} != logged {pid}")
        v_top = -cands[0][0]
        for negv, _negp, cand, cpos in cands[1:]:
            delta = v_top - (-negv)
            if delta > max_band:
                break
            key = tuple(sorted((pid, cand)))
            if key in seen_pairs:
                continue
            seen_pairs.add(key)
            pairs.append({"a": pid, "b": cand,
                          "pick_no": e["pick_no"],
                          "vorp_delta": round(delta, 2),
                          "same_pos": positions.get(pid) == cpos})
        taken.add(pid)
        counts[positions[pid]] += 1
    return pairs


def mine_actual_pairs(picks: list, keeper_pids: set, positions: dict) -> list:
    """Source B: same-position, non-keeper skill picks <= ACTUAL_GAP overall
    slots apart (each pick paired with the NEXT same-position pick)."""
    skill = [p for p in sorted(picks, key=lambda p: p["pick_no"])
             if not (p.get("is_keeper") or str(p["player_id"]) in keeper_pids)
             and positions.get(str(p["player_id"])) in R.POSITIONS]
    by_pos: dict[str, list] = {}
    for p in skill:
        by_pos.setdefault(positions[str(p["player_id"])], []).append(p)
    pairs = []
    for pos in sorted(by_pos):
        row = by_pos[pos]
        for a, b in zip(row, row[1:]):
            gap = b["pick_no"] - a["pick_no"]
            if gap <= ACTUAL_GAP:
                pairs.append({"a": str(a["player_id"]),
                              "b": str(b["player_id"]),
                              "pick_no": a["pick_no"], "pick_gap": gap,
                              "same_pos": True})
    return pairs


# ── grading ──────────────────────────────────────────────────────────────────

def favored_of(feature: str, fa, fb, pid_a: str, pid_b: str):
    """The preregistered direction. None when undecidable (equal values or
    boolean tie). fa/fb are the feature values of pid_a/pid_b."""
    if fa is None or fb is None:
        return None
    if fa == fb:
        return "equal"
    lower_wins = feature in ("age", "experience", "games_missed_prior",
                             "td_share_prior")
    if feature == "team_change":
        # value is True (moved) / False (stayed); the STAYER is favored.
        return pid_a if fb and not fa else (pid_b if fa and not fb else "equal")
    if feature == "team_pos_no1_prior":
        return pid_a if fa and not fb else (pid_b if fb and not fa else "equal")
    if lower_wins:
        return pid_a if fa < fb else pid_b
    return pid_a if fa > fb else pid_b


def grade_pairs(pairs: list, feats: dict, y_teams: dict,
                weekly_y: dict, totals_y: dict) -> list:
    """Attach outcome + per-feature favored/won to each pair. Pairs with a
    tied points outcome are dropped (counted by the caller)."""
    out = []
    for pr in pairs:
        a, b = pr["a"], pr["b"]
        ta, tb = totals_y.get(a, 0.0), totals_y.get(b, 0.0)
        if abs(ta - tb) < 1e-9:
            out.append(dict(pr, dropped="tied_outcome"))
            continue
        winner = a if ta > tb else b
        wa = weekly_y.get(a, {})
        wb = weekly_y.get(b, {})
        co = sorted(set(wa) & set(wb))
        aw = sum(1 for w in co if wa[w] > wb[w])
        bw = sum(1 for w in co if wb[w] > wa[w])
        weeks_winner = a if aw > bw else (b if bw > aw else None)
        fa_all, fb_all = feats.get(a, {}), feats.get(b, {})
        row = dict(pr, points_delta=round(ta - tb, 2), winner=winner,
                   co_active_weeks=len(co),
                   weeks_won=[aw, bw], weeks_winner=weeks_winner)
        graded = {}
        for f in FEATURES:
            if f == "team_change":
                pa, pb = fa_all.get("prior_team"), fb_all.get("prior_team")
                ya, yb = y_teams.get(a), y_teams.get(b)
                fa = (pa != ya) if (pa and ya) else None
                fb = (pb != yb) if (pb and yb) else None
            else:
                fa, fb = fa_all.get(f), fb_all.get(f)
            fav = favored_of(f, fa, fb, a, b)
            graded[f] = {"favored": fav,
                         "won": (fav == winner) if fav not in (None, "equal")
                         else None,
                         "won_weeks": (fav == weeks_winner)
                         if fav not in (None, "equal")
                         and weeks_winner is not None else None}
        row["features"] = graded
        out.append(row)
    return out


def summarize(graded: list, feature: str, outcome_key: str = "won") -> dict:
    rows = [g for g in graded if not g.get("dropped")]
    cells = [g["features"][feature] for g in rows]
    decided = [c for c in cells if c[outcome_key] is not None]
    absent = sum(1 for g in rows
                 if g["features"][feature]["favored"] is None)
    equal = sum(1 for g in rows
                if g["features"][feature]["favored"] == "equal")
    wins = sum(1 for c in decided if c[outcome_key])
    n = len(decided)
    return dict({"n": n, "wins": wins, "absent_pairs": absent,
                 "equal_pairs": equal}, **wilson(wins, n))


# ── the run ──────────────────────────────────────────────────────────────────

def run() -> dict:
    positions = R.positions_record()
    ages = R.board_ages()
    names = R.name_map()

    per_season = {}
    all_graded_a, all_graded_b = [], []
    for season in SEASONS:
        proj = R.build_projections(season, positions, ages)
        pool = [{"position": positions[p], "proj_mean": v}
                for p, v in sorted(proj.items())]
        repl, _diag = R.replacement_levels(pool, R.LEAGUE_CFG)
        srec = R.season_record(season)
        picks, keeper_pids = R.season_draft(srec)
        rep = R.replay_draft(picks, keeper_pids, proj, repl, positions)

        feats = features_prior(season, positions, ages)
        y_teams = teams_of_season(season)     # F5's named exception
        weekly_y, totals_y = weekly_of(season), totals_of(season)

        pairs_a = mine_replay_pairs(picks, keeper_pids, proj, repl,
                                    positions, rep["log"])
        pairs_b = mine_actual_pairs(picks, keeper_pids, positions)
        ga = grade_pairs(pairs_a, feats, y_teams, weekly_y, totals_y)
        gb = grade_pairs(pairs_b, feats, y_teams, weekly_y, totals_y)
        for g in ga:
            g["season"], g["source"] = season, "replay"
        for g in gb:
            g["season"], g["source"] = season, "actual"
        all_graded_a.extend(ga)
        all_graded_b.extend(gb)

        def label(g):
            g["a_name"] = names.get(g["a"], g["a"])
            g["b_name"] = names.get(g["b"], g["b"])
            return g
        per_season[str(season)] = {
            "replay_pairs": len([g for g in ga if not g.get("dropped")]),
            "replay_pairs_tied_outcome_dropped":
                len([g for g in ga if g.get("dropped")]),
            "actual_pairs": len([g for g in gb if not g.get("dropped")]),
            "actual_pairs_tied_outcome_dropped":
                len([g for g in gb if g.get("dropped")]),
            "zero_point_seasons_in_pairs": sorted(
                {p for g in ga + gb if not g.get("dropped")
                 for p in (g["a"], g["b"]) if totals_y.get(p, 0.0) == 0.0}),
            "pairs": [label(g) for g in ga + gb],
        }

    def in_band(g, band):
        return g["source"] == "actual" or g["vorp_delta"] <= band

    feature_table = {}
    for f in sorted(FEATURES):
        primary_a = [g for g in all_graded_a if in_band(g, BAND_PRIMARY)]
        pooled = primary_a + all_graded_b
        cell = {
            "direction": FEATURES[f],
            "replay": summarize(primary_a, f),
            "actual": summarize(all_graded_b, f),
            "pooled": summarize(pooled, f),
            "pooled_weeks_won_secondary": summarize(pooled, f, "won_weeks"),
            "replay_same_pos_only": summarize(
                [g for g in primary_a if g.get("same_pos")], f),
            "bands_replay": {str(b): summarize(
                [g for g in all_graded_a if in_band(g, b)], f)
                for b in BANDS},
        }
        p = cell["pooled"]
        predictive = (p["n"] >= MIN_N and p["lo"] is not None
                      and (p["lo"] > 0.5 or p["hi"] < 0.5))
        cell["verdict"] = (
            f"PREDICTIVE (n={p['n']}, p={p['p']}, CI [{p['lo']}, {p['hi']}])"
            if predictive else f"predicted nothing (n={p['n']})")
        cell["predictive"] = predictive
        feature_table[f] = cell

    predictive = [f for f in sorted(FEATURES)
                  if feature_table[f]["predictive"]]
    ranking = sorted(predictive, key=lambda f: -abs(
        feature_table[f]["pooled"]["p"] - 0.5))

    return {
        "_territory": ("TERRITORY: A — produced by "
                       "draft/tools/fifty_fifty_study.py"),
        "_note": ("THE 50/50 STUDY: which pick-time-knowable features "
                  "predicted the winner of historical near-tie picks. "
                  "Preregistered in draft/audit/edge_hunt_2026-08-16.md §1 "
                  "(commit eb367719) BEFORE any pair was mined. Every cell "
                  "carries its n; absent is not zero; a null verdict is the "
                  "deliverable where the CI says so."),
        "question_verbatim": QUESTION_VERBATIM,
        "prereg": {"band_primary": BAND_PRIMARY, "bands": list(BANDS),
                   "actual_gap": ACTUAL_GAP, "min_n": MIN_N,
                   "audit_doc": "draft/audit/edge_hunt_2026-08-16.md §1"},
        "seasons": per_season,
        "features_absent_by_design": ABSENT_BY_DESIGN,
        "feature_table": feature_table,
        "predictive_features_ranked": ranking,
        "prepared_diff": ({"target": "public/js/draft/verdict.js "
                                     "tiebreakFacts ordering",
                           "measured_ranking": ranking,
                           "status": "PREPARED, NOT APPLIED — Cory's ruling "
                                     "via DECISIONS-NEEDED.md"}
                          if ranking else None),
        "honesty": [
            "three seasons of one league — the pooled n is the whole basis; "
            "per-feature n is stated in every cell",
            "source A pairs share pick moments (one chosen vs several "
            "alternatives) — pairs are not fully independent; the CI treats "
            "them as independent, which NARROWS it; a null under an "
            "optimistically narrow CI is a stronger null, a positive is "
            "weaker than printed",
            "source B has no ADP archive — pick distance is the revealed "
            "near-tie substitute, named",
            "outcome 'realized 0 points' is a realized outcome (never "
            "played), not missing data; such players are listed per season",
            "F5's Y-team read conditions on having played in Y (named "
            "leakage nuance; absent pairs counted)",
            "F9 is a PROXY (no historical depth charts); F2 is censored at "
            "2021 (stores begin there)",
        ],
    }


def main() -> None:
    doc = run()
    OUT.write_text(json.dumps(doc, indent=1, sort_keys=False))
    print(f"wrote {OUT.relative_to(ROOT)}")
    ft = doc["feature_table"]
    for f in sorted(ft):
        p = ft[f]["pooled"]
        print(f"  {f:22s} n={p['n']:4d} p={p['p']} "
              f"CI=[{p['lo']}, {p['hi']}]  {ft[f]['verdict']}")
    print("predictive, ranked:", doc["predictive_features_ranked"] or "NONE")


if __name__ == "__main__":
    main()
