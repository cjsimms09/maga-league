# TERRITORY: A
# TERRITORY-GRANT: C register 80 norm_name nickname NICKNAMES adp rule 11 unmatched Joshua Palmer Chig Okonkwo Chigoziem Marquise Hollywood Brown sys path root import ADP get 2026-08-19
"""SCORE THE ffanalytics ROWS UNDER *OUR* RULES, JOIN THEM TO THE BOARD, AND
CHECK THEM BEFORE ANY OF IT REACHES A NUMBER CORY DRAFTS ON.

Cory, 2026-08-19: *"get this data, make sure it's right, switch to mean
projections, fix ceiling and floors"*.

── WHY THE SITE'S OWN POINTS ARE IGNORED ─────────────────────────────────────
Every row carries `site_pts`, and using it would be the easy path and the wrong
one. A provider's points encode THAT PROVIDER'S league rules — half-PPR vs PPR,
4pt vs 6pt passing TDs, their own kicker table. `build_bundle.py` states the
standing rule outright: *"always our engine, never a provider's"*. So every row
is re-priced from its RAW STAT LINE through `scoring.py` and this league's own
44-key table. That is the only thing that makes CBS, ESPN, FFToday and Sleeper
comparable to each other at all.

── THE JOIN, AND THE TRAP IN IT ──────────────────────────────────────────────
The rows carry an `id` column of 4-5 digit integers that LOOKS like a Sleeper
id. It is not: exactly 14 of 531 distinct ids collide with a board sleeper_id,
which is coincidence. The join is by normalised name + position, with team as a
disambiguator, and every unmatched row is COUNTED AND NAMED rather than dropped
silently (register 46 is exactly the defect where a correct drop was invisible
because nothing reported it).

── WHAT THIS DOES NOT DO ─────────────────────────────────────────────────────
It does not write `proj_mean`, touch the board, or ship anything. It produces a
store plus a validation report, and the validation is the point: a source whose
scored output disagrees wildly with three others is a scraper defect wearing a
projection's clothes, and shipping a mean over it would launder that into
Cory's board.

Run: python3 draft/tools/multisource_projections.py
"""
from __future__ import annotations

import csv
import json
import re
import statistics as st
import sys
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
DRAFT = HERE.parent
ROOT = DRAFT.parent
sys.path.insert(0, str(DRAFT))

import scoring as SC  # noqa: E402

RAW = DRAFT / "data" / "ffanalytics_raw_projections.csv"
BOARD = ROOT / "public" / "draft_data.json"
OUT = DRAFT / "data" / "multisource_projections.json"

# Sources whose row counts show a real projection set. FantasyPros and
# Walterfootball return EXACTLY TEN PER POSITION — a truncated leaderboard, not
# a projection set — and are excluded by name with the reason stated, not
# silently filtered by a row-count threshold that would also catch a real
# source having a thin year.
USABLE = {"CBS", "ESPN", "FFToday"}
EXCLUDED = {
    "FantasyPros": "exactly 10 rows per position — a top-10 leaderboard page, "
                   "not a projection set. We already hold 426 real FP players "
                   "on the board via a different path.",
    "Walterfootball": "exactly 10 per position and no DST at all — same "
                      "truncation.",
}

# ffanalytics stat column -> our scoring key. Anything not mapped is IGNORED
# rather than guessed: a wrong mapping is worse than a missing one, because it
# produces a plausible number instead of an obvious hole.
STAT_MAP = {
    "pass_yds": "pass_yd", "pass_tds": "pass_td", "pass_int": "pass_int",
    "rush_yds": "rush_yd", "rush_tds": "rush_td",
    "rec": "rec", "rec_yds": "rec_yd", "rec_tds": "rec_td",
    "fumbles_lost": "fum_lost",
    # KICKERS — DISTANCE-SPLIT, WHICH IS THE WHOLE POINT AND WHICH I MISSED ON
    # THE FIRST PASS. My first map had `"fg": None` with the comment "needs a
    # distance split we do not get", and kickers scored on extra points alone.
    # The rows carry the split: fg_0019 / fg_2029 / fg_3039 / fg_4049 / fg_50,
    # which lands EXACTLY on this league's fgm_* keys. nflverse never gave us
    # this — it is a real capability the component pipeline does not have.
    "fg_0019": "fgm_0_19", "fg_2029": "fgm_20_29", "fg_3039": "fgm_30_39",
    "fg_4049": "fgm_40_49", "fg_50": "fgm_50p", "xp": "xpm",
    # ⚠️ ESPN PUBLISHES A COMBINED 0-39 BUCKET, and omitting it undercounted
    # every ESPN kicker by roughly half his field goals (19 of 35 for Aubrey).
    # Mapping it to `fgm_30_39` is EXACT, not an approximation: this league pays
    # 3.0 for each of fgm_0_19, fgm_20_29 and fgm_30_39, so which sub-bucket a
    # 0-39 kick lands in cannot change the score. If those rates ever diverge,
    # this mapping becomes an approximation and must be revisited.
    "fg_0039": "fgm_30_39",
    # TEAM DEFENCES — the `dst_` prefix, also missed on the first pass, which is
    # why DEF joined ZERO players and 32-44 rows per source scored a flat 0.
    "dst_sacks": "sack", "dst_int": "int", "dst_fum_rec": "fum_rec",
    "dst_td": "def_td", "dst_safety": "safe",
}


def norm_name(s: str) -> str:
    s = (s or "").lower()
    s = re.sub(r"[.'`]", "", s)
    s = re.sub(r"\b(jr|sr|ii|iii|iv|v)\b", "", s)
    s = re.sub(r"[^a-z ]", " ", s).strip()
    # register 80's own "read the unmatched list" ask, followed: real starting
    # players were silently absent from the blend for a NAME reason, not a
    # data reason -- Josh Palmer (board: "Joshua Palmer"), Chig Okonkwo
    # (board: "Chigoziem Okonkwo"), Hollywood Brown (board: "Marquise Brown"),
    # each confirmed against the live board before concluding it was the
    # nickname table's job, not a genuine absence. `adp.NICKNAMES` already
    # solves exactly this for every other source that joins to the board
    # (rule 11 -- imported, not re-declared, so a future addition to that
    # table reaches this join too rather than drifting from it). Applied
    # AFTER normalisation since its keys are already lowercased/depunctuated,
    # and to every name on both sides (board index and source rows alike,
    # since both paths call this same function) -- a table entry can only
    # ever relabel a key, never break a pair that already matched.
    import sys as _sys
    from pathlib import Path as _Path
    _root = _Path(__file__).resolve().parent.parent
    if str(_root) not in _sys.path:
        _sys.path.insert(0, str(_root))
    import adp as _ADP
    return _ADP.NICKNAMES.get(s, s)


def num(v):
    try:
        f = float(v)
        return f
    except (TypeError, ValueError):
        return None


def league_scoring() -> dict:
    """The league's own table, taken from the committed weekly store's
    fingerprint rather than re-declared here — one source of truth."""
    p = DRAFT / "backtest" / "nflverse_weekly_points_2024.json"
    doc = json.loads(p.read_text())
    return doc["weeks"][0]["scoring"]


def main() -> None:
    if not RAW.exists():
        raise SystemExit(f"no {RAW} — dispatch ffanalytics-probe.yml first")
    scoring = league_scoring()
    rows = list(csv.DictReader(RAW.open()))
    board = json.loads(BOARD.read_text())
    by_name = defaultdict(list)
    by_team_def = defaultdict(list)
    # KEEPERS ARE NOT IN `players` AND THAT SILENTLY EXCLUDED CORY'S WHOLE
    # KEEPER SLATE (register 80, A 2026-08-19).
    #
    # `build.py` moves kept players OUT of `players` and into `kept_players`,
    # so a join over `board["players"]` alone can never match one. The result:
    # Derrick Henry, Ja'Marr Chase and Kenneth Walker — the only three keepers
    # on the board, all Cory's — were absent from the store, kept Sleeper-only
    # projections while the rest of the board was blended, and had their VORP
    # computed against a replacement level that HAD moved. The capture's own
    # `unmatched` diagnostic named "Derrick Henry (RB)" and "Kenneth Walker III
    # (RB)" the whole time and nobody read it.
    #
    # The join universe is now BOTH lists. Kept players are still excluded from
    # the draftable board by build.py; that is a separate and correct thing.
    for p in list(board["players"]) + list(board.get("kept_players") or []):
        if p.get("position"):
            by_name[(norm_name(p.get("name")), p["position"])].append(p)
        if p.get("position") == "DEF":
            # A board defence is named "Los Angeles Rams" and carries `team`;
            # the source rows carry only the abbreviation, so index BOTH.
            for k in filter(None, [norm_name(p.get("team")), norm_name(p.get("name"))]):
                by_team_def[k].append(p)

    scored = defaultdict(dict)          # (name,pos) -> {source: points}
    diag = {"rows": len(rows), "by_source": defaultdict(lambda: {
        "rows": 0, "scored": 0, "zero_points": 0, "joined": 0, "unmatched": []})}

    for r in rows:
        src = r.get("source")
        if src not in USABLE:
            continue
        d = diag["by_source"][src]
        d["rows"] += 1
        pos = (r.get("pos") or r.get("position_asked") or "").upper()
        if pos == "DST":
            pos = "DEF"
        # ⚠️ FFToday PUBLISHES NO FIELD-GOAL DISTANCE SPLIT — only a total `fg`
        # — and this league pays 3/3/3/3 by distance up to 49 and 5 beyond it.
        # Pricing a bare total would mean inventing a distance mix, so FFToday
        # KICKERS ARE EXCLUDED rather than approximated. Absent stays absent.
        # This is why FFToday's kicker median came out at 40 against CBS's 139:
        # its kickers were scoring on extra points alone, and a mean taken over
        # that would have quietly dragged every kicker down by a third.
        if pos == "K" and src == "FFToday":
            d["excluded_no_fg_split"] = d.get("excluded_no_fg_split", 0) + 1
            continue
        stats = {}
        for col, key in STAT_MAP.items():
            if key is None:
                continue
            v = num(r.get(col))
            if v is not None:
                stats[key] = v
        # DST POINTS-ALLOWED is a BUCKETED, NON-LINEAR payout and the rows give
        # a season average, so this is an APPROXIMATION and is labelled one:
        # bucket the per-game average, pay that bucket every game. It gets the
        # central value right and understates the variance a real week-by-week
        # distribution would show. Stated here rather than buried, because a
        # defence's whole fantasy value lives in this term.
        if pos == "DEF":
            ppg = num(r.get("dst_pts_allowed_g"))
            if ppg is None:
                tot = num(r.get("dst_pts_allowed"))
                ppg = (tot / 17.0) if tot else None
            if ppg is not None:
                key = ("pts_allow_0" if ppg < 0.5 else
                       "pts_allow_1_6" if ppg <= 6 else
                       "pts_allow_7_13" if ppg <= 13 else
                       "pts_allow_14_20" if ppg <= 20 else
                       "pts_allow_21_27" if ppg <= 27 else
                       "pts_allow_28_34" if ppg <= 34 else "pts_allow_35p")
                if key in scoring:
                    stats[key] = 17.0
        pts = SC.score_stat_line(stats, scoring)
        d["scored"] += 1
        if pts == 0:
            d["zero_points"] += 1
        # ⚠️ DEFENCES JOIN ON TEAM, NOT NAME. Every DST row's `player` field is
        # the literal string 'NA' — which is why the first pass joined ZERO
        # defences while happily reporting 32 rows per source as "captured".
        if pos == "DEF":
            key = (norm_name(r.get("team")), "DEF")
            cands = by_team_def.get(norm_name(r.get("team"))) or []
        else:
            key = (norm_name(r.get("player")), pos)
            cands = by_name.get(key) or []
        if not cands:
            if len(d["unmatched"]) < 25:
                d["unmatched"].append(f"{r.get('player')} ({pos})")
            continue
        d["joined"] += 1
        scored[(cands[0]["player_id"], cands[0].get("name"), pos)][src] = pts

    # ---- the store -------------------------------------------------------
    players = {}
    for (pid, name, pos), per_src in scored.items():
        vals = [v for v in per_src.values() if v is not None]
        if not vals:
            continue
        players[str(pid)] = {
            "name": name, "position": pos,
            "by_source": {k: round(v, 2) for k, v in per_src.items()},
            "n_sources": len(vals),
            "mean": round(st.mean(vals), 2),
            "sd": round(st.pstdev(vals), 2) if len(vals) > 1 else None,
            "min": round(min(vals), 2), "max": round(max(vals), 2),
        }

    # ---- VALIDATION: is this data right? ---------------------------------
    # A source is only trustworthy if its SCORED output agrees with the others
    # in ORDER. Absolute level can differ legitimately (different games-played
    # assumptions); ordering cannot, and a scraper that grabbed the wrong column
    # shows up here as a rank correlation near zero.
    def spearman(pairs):
        if len(pairs) < 10:
            return None
        def ranks(v):
            order = sorted(range(len(v)), key=lambda i: v[i])
            out = [0.0] * len(v)
            for r, i in enumerate(order):
                out[i] = r + 1
            return out
        a, b = ranks([x for x, _ in pairs]), ranks([y for _, y in pairs])
        ma, mb = st.mean(a), st.mean(b)
        na = sum((x - ma) * (y - mb) for x, y in zip(a, b))
        da = (sum((x - ma) ** 2 for x in a) ** 0.5) * (sum((y - mb) ** 2 for y in b) ** 0.5)
        return None if da == 0 else round(na / da, 4)

    srcs = sorted(USABLE)
    agree = {}
    for i, s1 in enumerate(srcs):
        for s2 in srcs[i + 1:]:
            pairs = [(p["by_source"][s1], p["by_source"][s2]) for p in players.values()
                     if s1 in p["by_source"] and s2 in p["by_source"]]
            agree[f"{s1} vs {s2}"] = {"n": len(pairs), "spearman": spearman(pairs)}
    # And against the board's incumbent Sleeper number — the champion.
    sleeper = {str(p["player_id"]): p.get("proj_mean")
               for p in list(board["players"]) + list(board.get("kept_players") or [])}
    for s in srcs:
        pairs = [(p["by_source"][s], sleeper[pid]) for pid, p in players.items()
                 if s in p["by_source"] and sleeper.get(pid) is not None]
        agree[f"{s} vs Sleeper"] = {"n": len(pairs), "spearman": spearman(pairs)}

    doc = {
        "_territory": "TERRITORY: A — draft/tools/multisource_projections.py",
        "_note": "Scored under THIS LEAGUE'S table from raw stat lines. The "
                 "providers' own site_pts is deliberately ignored — it encodes "
                 "their league's rules, not ours. Writes NO board field.",
        "sources_used": sorted(USABLE),
        "sources_excluded": EXCLUDED,
        "scoring_source": "draft/backtest/nflverse_weekly_points_2024.json fingerprint",
        "players": players,
        "coverage": {
            "players_with_at_least_one_source": len(players),
            "players_with_2plus": sum(1 for p in players.values() if p["n_sources"] >= 2),
            "players_with_all_3": sum(1 for p in players.values() if p["n_sources"] == 3),
            "by_position": {pos: sum(1 for p in players.values() if p["position"] == pos)
                            for pos in ("QB", "RB", "WR", "TE", "K", "DEF")},
        },
        "diagnostics": {k: dict(v) for k, v in diag["by_source"].items()},
        "agreement_spearman": agree,
    }
    OUT.write_text(json.dumps(doc, indent=1))

    print("MULTI-SOURCE PROJECTIONS — scored under OUR table\n")
    for s in srcs:
        d = doc["diagnostics"][s]
        print(f"  {s:10} rows {d['rows']:4}  scored {d['scored']:4}  "
              f"joined {d['joined']:4}  zero-point rows {d['zero_points']:4}")
    c = doc["coverage"]
    print(f"\n  joined players: {c['players_with_at_least_one_source']}  "
          f"(2+ sources {c['players_with_2plus']}, all 3 {c['players_with_all_3']})")
    print(f"  by position: {c['by_position']}")
    print("\n  AGREEMENT (Spearman on scored points — order, not level):")
    for k, v in agree.items():
        print(f"    {k:24} n={v['n']:4}  rho={v['spearman']}")
    print(f"\n  wrote {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
