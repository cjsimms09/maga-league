"""F3 — THE REALIZED WEEKLY SERIES for an external league, under THAT league's rules.

The prerequisite `ingest_run.run()` pre-declared before it ever ran: F4 excludes a
league missing weekly outcomes, there was no weekly-outcomes ingest, so every
league was destined for `F4.no_weekly_outcomes`. This is that ingest.

WHAT IS NEW HERE AND WHAT IS DELIBERATELY NOT
---------------------------------------------
Not new, and must not be: the scorer and the stat-line translation. `scoring.
score_stat_line` is the shipped engine and `grade.nflverse_weekly_to_scoring` is
the shipped nflverse-column translation — both are imported, neither is
re-implemented. A second scorer would be the multi-derivation failure rule 11
exists for, and it would hide perfectly: two scorers that agree on 95% of players
produce a plausible number for the other 5% and never error.

New: MFL's per-position scoring rules become one flat scoring table PER POSITION,
so an external league is graded under its own rules rather than under ours.

THE TRAP THIS FILE IS BUILT AROUND: A TERM WE CANNOT TRANSLATE IS NOT A TERM
WORTH ZERO. If a league scores -2 per interception and we silently drop the term,
every QB scores HIGH — the omission is not a floor, it is a bias with no stated
direction. So the vocabulary is closed to what the shipped stat-line translator
actually emits, and any scoring rule outside it makes the LEAGUE unscoreable and
counted, never a league scored with a hole in it.

D5 (registered 2026-08-11, before any external league had been scored):

  D5a  Weekly outcomes are computed by the SHIPPED scorer under the league's OWN
       per-position rules, translated from MFL event codes via the committed
       153-code dictionary (`mfl_schema_probe.json`), never inferred from letters.
  D5b  The scoreable vocabulary is exactly the key set
       `grade.nflverse_weekly_to_scoring` emits. Any rule on any GRADED position
       whose event falls outside it makes the league unscoreable:
       `F4.scoring_untranslatable`. Rules on positions we do not grade (Def, K,
       Coach, ...) are recorded as ignored, not as failures.
  D5c  A rule is a linear per-unit multiplier only if it is the SOLE rule for its
       (position, event) pair and its range starts at 0. Two rules for one pair is
       banded scoring; a range starting above 0 is a threshold bonus. Neither is a
       multiplier over a weekly total, and both are untranslatable.
       (This is also where `reception_points_by_position`'s known `max()` flattening
       of banded rules is NOT repeated — see the note in that function.)
  D5d  A range's upper bound is CHECKED AGAINST THE DATA, not assumed. If any
       scored player-week exceeds `hi` for a bounded rule, the league is
       untranslatable and the exceeding value is named. An assumption about what
       "0-99" covers becomes a measurement of what the season actually contained.
  D5e  A drafted player with NO weekly rows is DROPPED AND COUNTED (F3), never
       scored as zero. A player with weekly rows summing to exactly 0.0 is KEPT —
       he played and scored nothing, which is an outcome.

WHAT TOUCHES THE NETWORK: `fetch_weekly` only. Everything above it is pure and is
tested offline, including the range-exceedance check and the coverage report.
"""
from __future__ import annotations

import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))
_DRAFT = HERE.parent
if str(_DRAFT) not in sys.path:
    sys.path.insert(0, str(_DRAFT))

import scoring  # noqa: E402  (draft/scoring.py — THE scorer, not a copy)

import grade as GR  # noqa: E402  (draft/backtest/grade.py — THE stat-line translation)
from mfl_adapter import listify, t  # noqa: E402

# The positions an external draft's outcomes are graded for. A league's rules for
# Def/K/Coach are real rules, but they price players our board does not carry and
# our replay never drafts, so a rule we cannot translate for them costs nothing.
GRADED_POSITIONS = ("QB", "RB", "WR", "TE")

# THE CLOSED VOCABULARY, DERIVED rather than restated. `_OUR_KEYS` is the exact
# set `nflverse_weekly_to_scoring` can emit; writing the list out again here would
# let this file and the translator drift apart silently, which is the same defect
# in miniature as writing a second scorer.
SCOREABLE_KEYS = frozenset(GR._OUR_KEYS)

# MFL event code -> our scoring key. Every entry is quoted from MFL's own
# `TYPE=allRules` dictionary as captured by the committed probe (153 codes), so a
# wrong mapping is a misreading of a sentence rather than a guess about letters.
EVENT_TO_KEY = {
    "PY": "pass_yd",     # "the total passing yardage in a game"
    "#P": "pass_td",     # "the total number of Passing TDs in a game by a player"
    "IN": "pass_int",    # "the number of pass interceptions thrown by a player"
    "P2": "pass_2pt",    # "successful two point conversion passes in a game"
    "RY": "rush_yd",     # "the total rushing yardage in a game"
    "#R": "rush_td",     # "the total number of Rushing TDs in a game by a player"
    "R2": "rush_2pt",    # "successful two point conversion rushes in a game"
    "CC": "rec",         # "the number of receptions in a game"
    "CY": "rec_yd",      # "the total receiving yardage in a game"
    "#C": "rec_td",      # "the total number of Receiving TDs in a game by a player"
    "C2": "rec_2pt",     # "successful two point conversion receptions in a game"
    "FL": "fum_lost",    # "fumbles by a player that end up being recovered by the [opponent]"
    "FLO": "fum_lost",   # "anytime a player fumbles (and the opposing team recovers) on offense"
}

# Codes deliberately NOT mapped even though a mapping looks available, each for a
# reason that would otherwise produce a confidently wrong number:
#   PS / RS / RC   per-TD YARDAGE ("evaluated for EACH passing TD") — distance
#                  scoring, not a multiplier on a TD count.
#   #TD            all TDs together; expanding it into three keys would double-count
#                  against a league that ALSO scores #P/#R/#C.
#   PRY/RCY/TY/TYS combined-yardage terms that overlap the keys above.
#   PA/PC/RA/TGT/1C/1P/1R/C20/C40/R20/R40/P20..P50
#                  real scoring in some leagues, and nflverse weekly DOES carry the
#                  underlying columns — but `nflverse_weekly_to_scoring` does not
#                  emit them, and widening it is `grade.py`, which is not this
#                  lane's file. Measured cost is reported so the request to widen
#                  it can be made with a number attached rather than a guess.


# A fantasy season is the REGULAR season. Postseason rows are dropped and counted.
REGULAR_SEASON = "REG"


class Untranslatable(Exception):
    """Raised only by callers that want the failure loud; the API returns reasons."""


def emittable_keys(rows) -> set:
    """Which of our scoring keys THIS DATA can actually produce.

    D5f, and it is not a hypothetical: measured 2026-08-11 against both loaders,
    `nfl_data_py.import_weekly_data` 404s for 2025 and `nflreadpy.load_player_stats`
    serves it — with `interceptions` RENAMED to `passing_interceptions`. The shipped
    translator maps the old name, so under nflreadpy `pass_int` is never emitted,
    and a league scoring -2 per interception scores every QB about two points per
    interception TOO HIGH. Silently: `score_stat_line` skips a key the stat line
    does not carry, which is correct behaviour for an optional bonus and is exactly
    wrong for a term the league actually scores.

    Defined by RUNNING the shipped translator rather than by comparing column
    names, so it catches three failures with one measurement: a renamed column, an
    absent one, and one present but never populated. And it cannot drift from the
    translator, because it IS the translator.
    """
    out: set = set()
    for row in rows or []:
        out |= set(GR.nflverse_weekly_to_scoring(row))
    return out


def schema_gap(rows, tables) -> dict:
    """{POS: [keys the league scores that this data cannot produce]}.

    Empty means every term in every graded position's table is backed by a column
    the loader actually serves. Anything else means a term would be scored as
    absent — which `score_stat_line` treats as no contribution, i.e. as zero.
    """
    have = emittable_keys(rows)
    gap = {}
    for pos, table in (tables or {}).items():
        missing = sorted(k for k in table if k not in have)
        if missing:
            gap[pos] = missing
    return gap


def _range(expr: str):
    """MFL rule range -> (lo, hi). `hi` may be None for unbounded.

    Returns None when the range is present but unreadable — which is NOT the same
    as unbounded, and must not collapse into it: an unreadable band read as
    "applies to everything" would silently score a threshold bonus on every week.
    """
    e = (expr or "").strip()
    if not e:
        return (0.0, None)
    parts = e.replace("+", "-").split("-")
    try:
        lo = float(parts[0])
    except (ValueError, IndexError):
        return None
    if len(parts) == 1 or not parts[1].strip():
        return (lo, None)
    try:
        return (lo, float(parts[1]))
    except ValueError:
        return None


def _points(expr: str):
    """Shared with the adapter's reading of MFL points expressions ("*0.5", "=3")."""
    from mfl_adapter import _points_per_event
    return _points_per_event(expr)


def scoring_tables(rules_json, positions=GRADED_POSITIONS) -> tuple:
    """(tables, untranslatable, ignored, bounds) for one league's TYPE=rules export.

    `tables`        {POS: {our_key: points_per_unit}} — a flat scoring table per
                    graded position, ready for `scoring.score_stat_line`.
    `untranslatable` {POS: [reason dicts]} — why this position cannot be scored.
                    STRUCTURED, not prose: the whole value of this report is the
                    census of WHICH EVENT CODES cost us leagues, and re-parsing a
                    string we formatted ourselves to recover the code would be a
                    second derivation of a fact we already had.
    `ignored`       [POS] — positions carrying rules we did not try to translate
                    because we do not grade them. Reported so "no untranslatable
                    terms" cannot mean "we never looked".
    `bounds`        {POS: {our_key: hi}} — the upper bound of every rule this
                    function ACCEPTED. Returned rather than recomputed by the
                    caller so the bound checked against the data and the bound the
                    table was built from cannot be two different numbers.

    D5c is enforced by collecting rules per (pos, event) FIRST and judging the
    group, because the defect is invisible one rule at a time: each of a banded
    pair is a perfectly readable multiplier on its own.
    """
    import json as _json
    d = _json.loads(rules_json) if isinstance(rules_json, str) else (rules_json or {})
    if d.get("error") or (d.get("rules") or {}).get("positionRules") is None:
        return {}, {p: [{"why": "no_scoring_rules"}] for p in positions}, [], {}, []

    graded = {p.upper() for p in positions}
    # (POS, EVENT) -> [(points_expr, range_expr)]
    grouped: dict = {}
    ignored: list = []
    seen_blocks: list = []
    for pr in listify((d.get("rules") or {}).get("positionRules")):
        raw_block = t(pr.get("positions")).strip()
        if raw_block and raw_block not in seen_blocks:
            seen_blocks.append(raw_block)
        names = [p.strip().upper() for p in
                 raw_block.replace(",", "|").split("|") if p.strip()]
        rules = listify(pr.get("rule"))
        for n in names:
            if n not in graded:
                if n not in ignored and rules:
                    ignored.append(n)
                continue
            for rule in rules:
                ev = t(rule.get("event")).strip().upper()
                grouped.setdefault((n, ev), []).append(
                    (t(rule.get("points")), t(rule.get("range"))))

    tables: dict = {}
    bad: dict = {}
    bounds: dict = {}
    for (pos, ev), rules in sorted(grouped.items()):
        key = EVENT_TO_KEY.get(ev)
        if key is None:
            bad.setdefault(pos, []).append({"why": "event_untranslatable", "event": ev})
            continue
        if key not in SCOREABLE_KEYS:       # belt and braces; EVENT_TO_KEY is closed
            bad.setdefault(pos, []).append({"why": "key_not_emitted", "event": ev,
                                            "key": key})
            continue
        if len(rules) > 1:
            # D5c: banded scoring. NOT flattened by max() — that is the known
            # weakness in `reception_points_by_position`, which is a FILTER (where
            # the conservative read excludes) and not a SCORER (where it invents
            # points nobody scored).
            bad.setdefault(pos, []).append({"why": "banded", "event": ev,
                                            "n": len(rules)})
            continue
        pts_expr, rng_expr = rules[0]
        pts = _points(pts_expr)
        if pts is None:
            bad.setdefault(pos, []).append({"why": "unreadable_points", "event": ev,
                                            "expr": pts_expr})
            continue
        rng = _range(rng_expr)
        if rng is None:
            bad.setdefault(pos, []).append({"why": "unreadable_range", "event": ev,
                                            "expr": rng_expr})
            continue
        lo, hi = rng
        if lo != 0.0:
            bad.setdefault(pos, []).append({"why": "threshold", "event": ev, "lo": lo})
            continue
        tables.setdefault(pos, {})[key] = pts
        if hi is not None:
            bounds.setdefault(pos, {})[key] = hi

    for p in graded:
        if p not in tables and p not in bad:
            bad.setdefault(p, []).append({"why": "no_rules_for_position"})
    # A position with ANY untranslatable term keeps no table at all. A partial
    # table is the exact object D5b exists to refuse.
    for p in list(bad):
        tables.pop(p, None)
        bounds.pop(p, None)
    return tables, bad, sorted(ignored), bounds, seen_blocks


def weekly_points(rows, season, tables, positions, id_map=None, bounds=None) -> dict:
    """{our_player_id: {week: points}} plus the range exceedances D5d measures.

    Returns {"series": ..., "exceeded": [...], "unknown_position": [...],
             "no_table": [...]}.

    `rows`      nflverse weekly records (dicts). Filtered to `season` here.
    `tables`    {POS: flat scoring table} from `scoring_tables`.
    `positions` {our_player_id: POS}.
    `id_map`    {row player_id: our_player_id}; identity when None.
    `bounds`    {POS: {key: hi}} — the upper bounds to check against the data.
    """
    series: dict = {}
    exceeded: list = []
    unknown_pos: set = set()
    no_table: set = set()
    postseason = unknown_type = 0
    bounds = bounds or {}
    for row in rows or []:
        if season is not None and "season" in row and int(row["season"]) != int(season):
            continue
        # D5g: A FANTASY SEASON IS THE REGULAR SEASON. Both loaders serve REG and
        # POST in one table (2024: 5,340 REG + 257 POST; 2025: 18,539 + 882) and
        # weeks run to 22. Pooling them inflates exactly the players on playoff
        # teams — a bias correlated with team quality, which is correlated with
        # what a draft policy is being graded on. Caught by the leaderboard's
        # `weeks` column showing 19-21 for a season that has at most 18.
        st = row.get("season_type")
        if st is None:
            # NOT assumed REG. A row we cannot place in the season is dropped and
            # counted, the same as every other absent value in this file.
            unknown_type += 1
            continue
        if str(st).upper() != REGULAR_SEASON:
            postseason += 1
            continue
        raw = str(row.get("player_id") if "player_id" in row else row.get("gsis_id"))
        pid = str(id_map.get(raw)) if id_map is not None else raw
        if id_map is not None and raw not in id_map:
            continue                      # not a player this league drafted; not our business
        pos = (positions or {}).get(pid)
        if not pos:
            unknown_pos.add(pid)
            continue
        table = tables.get(str(pos).upper())
        if not table:
            no_table.add(pid)
            continue
        line = GR.nflverse_weekly_to_scoring(row)
        for key, hi in (bounds.get(str(pos).upper()) or {}).items():
            v = line.get(key)
            if v is not None and float(v) > float(hi):
                exceeded.append({"player_id": pid, "position": str(pos).upper(),
                                 "key": key, "value": float(v), "hi": float(hi),
                                 "week": row.get("week")})
        wk = row.get("week")
        wk = int(wk) if wk is not None else None
        bucket = series.setdefault(pid, {})
        bucket[wk] = round(bucket.get(wk, 0.0) + scoring.score_stat_line(line, table), 2)
    return {"series": series, "exceeded": exceeded, "postseason_rows_dropped": postseason,
            "unknown_season_type_rows_dropped": unknown_type,
            "unknown_position": sorted(unknown_pos), "no_table": sorted(no_table)}


def f3_report(drafted_ids, series, reachable=None) -> dict:
    """F3: kept vs dropped — and WHICH KIND of dropped, which is the whole seam.

    THREE OUTCOMES, NOT TWO, and the third was missing until the real join was
    measured (2026-08-11). `import_ids()` yields 6,160 gsis->sleeper pairs and
    covers **78.9% of our 1,763-player board**, so more than a fifth of it cannot
    be looked up in weekly data AT ALL. A drafted player from that fifth has no
    series — exactly like a player who never took a snap — and folding the two
    together reports a gap in OUR ID MAP as a fact about the player:

      drafted_with_outcomes   he played, and we have his weeks
      drafted_no_weekly_rows  he is reachable in the id map and has no rows —
                              he did not play. Evidence about the WORLD.
      drafted_unmappable      no gsis id maps to him, so we never looked.
                              Evidence about THIS PIPELINE.

    `reachable` is the set of OUR ids the id map can actually reach. Passing None
    means the caller did not supply one, and then the split cannot be made — so it
    is reported as unknown rather than silently collapsed into "did not play".

    A player with weekly rows summing to exactly 0.0 PLAYED AND SCORED NOTHING and
    is KEPT, in every case above.
    """
    kept, no_rows, unmappable = [], [], []
    reach = None if reachable is None else {str(x) for x in reachable}
    for pid in drafted_ids or []:
        sid = str(pid)
        wk = (series or {}).get(sid)
        if wk:
            kept.append(sid)
        elif reach is not None and sid not in reach:
            unmappable.append(sid)
        else:
            no_rows.append(sid)
    n = len(kept) + len(no_rows) + len(unmappable)
    rep = {
        "drafted_with_outcomes": len(kept),
        "drafted_no_weekly_rows": len(no_rows),
        "drafted_unmappable": len(unmappable) if reach is not None else None,
        "split_available": reach is not None,
        # Retained under its old name so nothing downstream silently changes
        # meaning: it is still "drafted and not scored", now with the causes beside it.
        "drafted_without_outcomes": len(no_rows) + len(unmappable),
        "dropped_ids": (no_rows + unmappable)[:50],
        "unmappable_ids": unmappable[:50],
        "examined": n,
        "coverage": round(len(kept) / n, 4) if n else None,
        # Stated so a reader cannot take `coverage` for a scoring rate: a player
        # who was never on an NFL field is missing data, not a zero.
        "absent_policy": "a drafted player with no weekly rows is DROPPED AND "
                         "COUNTED; a player whose weeks sum to 0.0 is KEPT",
    }
    rep["verdict"] = _f3_verdict(rep)
    return rep


def _f3_verdict(rep: dict) -> str:
    """Rule 8: the half that is OUR fault leads."""
    if not rep["examined"]:
        return "no drafted players examined"
    head = ""
    if not rep["split_available"]:
        head = ("NO REACHABILITY SET SUPPLIED — %d drafted players have no outcomes and "
                "it is NOT KNOWN how many of those are unmappable (our id map) versus "
                "players who did not take a snap (the world); "
                % rep["drafted_without_outcomes"])
    elif rep["drafted_unmappable"]:
        head = ("%d of %d drafted players are UNMAPPABLE — no gsis id reaches them, so we "
                "never looked. That is evidence about THIS PIPELINE'S id map, not about "
                "whether they played; "
                % (rep["drafted_unmappable"], rep["examined"]))
    return head + ("%d of %d drafted players scored (%s); %d were reachable and had no "
                   "weekly rows"
                   % (rep["drafted_with_outcomes"], rep["examined"],
                      rep["coverage"], rep["drafted_no_weekly_rows"]))


def _fmt(r: dict) -> str:
    ev = r.get("event")
    why = r.get("why")
    if why == "banded":
        return "%s_banded_%d_rules" % (ev, r.get("n"))
    if why == "threshold":
        return "%s_threshold_from_%g" % (ev, r.get("lo"))
    if why in ("unreadable_points", "unreadable_range"):
        return "%s_%s:%s" % (ev, why, r.get("expr"))
    if why == "key_not_emitted":
        return "%s_key_%s_not_emitted" % (ev, r.get("key"))
    return "%s_%s" % (ev, why) if ev else str(why)


def untranslatable_reason(bad: dict) -> str:
    """The F4 detail string, formatted from the structured reasons in ONE place.

    One direction only — structure to string, never back. Everything that needs to
    COUNT event codes reads the structure (`untranslatable_census`); this exists so
    the attrition report has something a human can read on the line.
    """
    return "F4.scoring_untranslatable:" + ";".join(
        "%s=%s" % (p, ",".join(_fmt(r) for r in v)) for p, v in sorted(bad.items()))


def untranslatable_census(outcomes) -> dict:
    """WHICH EVENT CODES COST US LEAGUES, with counts. The number for the request.

    D5b says a rule outside the shipped translator's vocabulary fails the league.
    That is the right call and it is also, potentially, most of the pool — so the
    run must say WHAT it cost rather than only THAT it cost something. A request to
    widen `grade.nflverse_weekly_to_scoring` (not this lane's file) is worth making
    only with this table attached; without it, it is a guess about a codebase
    somebody else owns.

    Counts leagues, not rules: one league scoring TGT for three positions is ONE
    league lost to TGT, and counting the rules would triple it.
    """
    from collections import Counter
    codes = Counter()
    whys = Counter()
    lost = 0
    samples: dict = {}
    blocks = Counter()
    for o in outcomes or []:
        for b in ((o or {}).get("position_blocks") or []):
            blocks[b] += 1
        bad = (o or {}).get("untranslatable") or {}
        if not bad:
            continue
        lost += 1
        seen_codes, seen_whys = set(), set()
        for reasons in bad.values():
            for r in reasons:
                if r.get("event"):
                    seen_codes.add(r["event"])
                seen_whys.add(r.get("why"))
                # THE RAW EXPRESSION, KEPT. The 2025 run reported RY/CY/PY —
                # rushing, receiving and passing yards, all of them MAPPED codes —
                # as untranslatable in 33 of 36 leagues, on `unreadable_range` and
                # `unreadable_points`. A count cannot say whether that is the
                # leagues or this parser, and 33 of 36 failing on RUSHING YARDS is
                # not plausible as a fact about the leagues (rule 13: a failed
                # parse against a format I invented is evidence about my parser).
                # So the census keeps the STRING that would not parse, the same way
                # the crosswalk keeps both sides of a match.
                bucket = samples.setdefault(str(r.get("why")), [])
                if len(bucket) < 12:
                    ex = {"event": r.get("event")}
                    for k in ("expr", "n", "lo", "key"):
                        if r.get(k) is not None:
                            ex[k] = r[k]
                    if ex not in bucket:
                        bucket.append(ex)
        codes.update(seen_codes)
        whys.update(seen_whys)
    return {"leagues_unscoreable": lost,
            "leagues_examined": len(outcomes or []),
            "by_event_code": dict(codes.most_common()),
            "by_reason": dict(whys.most_common()),
            # The evidence, not just the tally.
            "unparsed_samples": samples,
            # And the POSITION BLOCKS as MFL wrote them. If kicker events (EP, FG)
            # and return events (#KT, #UT) are failing GRADED positions, the blocks
            # must be combined ("QB|RB|WR|TE|PK|Def"), and a term a quarterback can
            # never accrue is a different problem from one he can.
            "position_blocks": dict(blocks.most_common(20)),
            "verdict": _census_verdict(lost, len(outcomes or []), codes)}


def _census_verdict(lost, examined, codes) -> str:
    if not examined:
        return "no leagues examined"
    if not lost:
        return "%d of %d leagues scoreable under their own rules" % (examined, examined)
    top = ", ".join("%s (%d)" % kv for kv in codes.most_common(8))
    return ("%d of %d LEAGUES ARE UNSCOREABLE under D5b — the scoring vocabulary is "
            "the binding constraint, not the format filters. Costliest event codes: %s. "
            "Each is a term nflverse weekly CARRIES and `grade.nflverse_weekly_to_scoring` "
            "does not emit; widening it is a change in another lane, and this table is "
            "what that request is worth making with"
            % (lost, examined, top or "(none — all failures are structural, not vocabulary)"))


def league_outcomes(rules_json, drafted_ids, weekly_rows, season, positions,
                    id_map) -> dict:
    """The whole F3 answer for one league, and the F4 flag `screen()` reads.

    `has_weekly_outcomes` is decided HERE and nowhere else. Every path that sets
    it False also sets `reason` to a declared code, because a False with no reason
    is the attrition seam collapsing again one layer down.

    `id_map` HAS NO DEFAULT, on purpose. Weekly rows are keyed by GSIS id and our
    board is keyed by Sleeper id, so without the map nothing joins — and the shape
    of "nothing joined" is every drafted player reported absent, which reads as a
    season in which none of them played. An empty map is refused by name rather
    than allowed to produce a 0% coverage figure that looks like a finding.
    """
    tables, bad, ignored, bounds, blocks = scoring_tables(rules_json)
    out = {"season": season, "scoring_tables": tables, "untranslatable": bad,
           "ignored_positions": ignored, "position_blocks": blocks,
           "series": {}, "f3": None,
           "has_weekly_outcomes": False, "reason": None}
    if bad:
        out["reason"] = untranslatable_reason(bad)
        return out
    if not weekly_rows:
        # NOT "this league has no outcomes". We fetched nothing for the season, and
        # that is a statement about the fetch.
        out["reason"] = "F4.no_weekly_data:%s" % season
        return out
    if not id_map:
        out["reason"] = "F4.no_gsis_crosswalk"
        return out
    if not any("season_type" in (r or {}) for r in weekly_rows):
        # D5g. Without it we cannot tell a REG week from a playoff week, and
        # assuming REG would pool the postseason into every season total.
        out["reason"] = "F4.no_season_type"
        return out
    gap = schema_gap(weekly_rows, tables)
    if gap:
        # D5f. The league's rules translated fine; the DATA cannot serve a term
        # they use. Scoring anyway would silently drop it — and the sign of the
        # dropped term sets the direction of the error.
        out["schema_gap"] = gap
        out["reason"] = "F4.stat_columns_absent:" + ";".join(
            "%s=%s" % (p, ",".join(v)) for p, v in sorted(gap.items()))
        return out
    got = weekly_points(weekly_rows, season, tables, positions, id_map, bounds)
    if got["exceeded"]:
        first = got["exceeded"][0]
        out["reason"] = ("F4.scoring_range_exceeded:%s.%s=%g>%g"
                         % (first["position"], first["key"], first["value"], first["hi"]))
        out["exceeded"] = got["exceeded"][:20]
        return out
    out["series"] = got["series"]
    out["unknown_position"] = got["unknown_position"]
    out["no_table"] = got["no_table"]
    # The reachable set is the id map's VALUES — the ids a weekly row could ever
    # land on. Without it the F3 split cannot tell "we never looked" from "he did
    # not play", and both look like a player with no outcomes.
    out["f3"] = f3_report(drafted_ids, got["series"], set(map(str, id_map.values())))
    out["has_weekly_outcomes"] = True
    out["reason"] = "ok"
    return out


def reg_weeks(rows) -> list:
    """The REG weeks present in a season's rows. The season's own length, measured.

    Not a constant. The NFL went from 17 REG weeks to 18 in 2021 and could again,
    and a hardcoded slate length would silently call a full season partial.
    """
    return sorted({int(r["week"]) for r in (rows or [])
                   if r.get("week") is not None
                   and str(r.get("season_type") or "").upper() == REGULAR_SEASON})


def season_readiness(year, rows, error, control_year, control_rows, control_error) -> dict:
    """UNPLAYED vs UNFETCHABLE vs PARTIAL vs COMPLETE — and why they need a CONTROL.

    D5h. Measured 2026-08-11: `fetch_weekly(2026)` 404s from BOTH loaders. So does
    a season whose data we simply cannot reach. **The two produce an identical
    signal**, and a run that reports `F4.no_weekly_data:2026` and stops has said
    nothing about which one happened — a zero from the calendar and a zero from a
    broken fetch are the same green.

    The discriminator is a CONTROL SEASON fetched in the SAME RUN. If the control
    serves and the target does not, the fetch works and the season has not been
    played. If neither serves, the fetch is the story. There is no way to tell from
    the target alone, which is exactly why the control is not optional.

    PARTIAL matters separately: an in-season year serves rows for the weeks played
    so far, and grading a draft on a third of a season is a real number about a
    different question. It is named rather than folded into COMPLETE.
    """
    weeks = reg_weeks(rows)
    ctrl_weeks = reg_weeks(control_rows)
    ctrl_ok = not control_error and bool(ctrl_weeks)
    if error or not weeks:
        if not ctrl_ok:
            state = "UNFETCHABLE"
            why = ("neither %s NOR the control season %s served weekly data — this is "
                   "evidence about THIS PIPELINE, not about the calendar, and a run "
                   "reporting zero matched leagues here has measured nothing"
                   % (year, control_year))
        else:
            state = "UNPLAYED"
            why = ("%s served no weekly data while the control season %s served %d REG "
                   "weeks — the fetch works and the season has not been played. Zero "
                   "matched leagues here is the CALENDAR, and the same zero from a "
                   "broken fetch would look identical without this control"
                   % (year, control_year, len(ctrl_weeks)))
        return {"season": year, "state": state, "reg_weeks": 0, "control_season": control_year,
                "control_reg_weeks": len(ctrl_weeks), "control_ok": ctrl_ok, "why": why}
    full = len(ctrl_weeks) if ctrl_ok else None
    if full is not None and len(weeks) < full:
        return {"season": year, "state": "PARTIAL", "reg_weeks": len(weeks),
                "control_season": control_year, "control_reg_weeks": full, "control_ok": True,
                "why": ("%s has %d of the control season's %d REG weeks — IN SEASON. Any "
                        "outcome total here is a partial season, which is a real number "
                        "about a different question than the one F3 asks"
                        % (year, len(weeks), full))}
    return {"season": year, "state": "COMPLETE", "reg_weeks": len(weeks),
            "control_season": control_year, "control_reg_weeks": full, "control_ok": ctrl_ok,
            "why": "%s served %d REG weeks" % (year, len(weeks))}


def sanity_top(rows, season, table, n=20) -> list:
    """Top `n` player-SEASONS under one flat table, with names. Rule 12's eyeball.

    A translation that scores 5,597 rows without error and produces a leaderboard
    of nobody is broken in a way no unit test built from my own fixtures can see —
    my fixtures use the column names I already believe in. This scores REAL rows
    under the shipped half-PPR reference and prints who came out on top, which is
    the one check a human can run against knowledge the pipeline does not have.

    Pure, so the ranking is tested offline; only the rows come from the network.
    """
    totals: dict = {}
    for row in rows or []:
        if season is not None and "season" in row and int(row["season"]) != int(season):
            continue
        pid = str(row.get("player_id") or row.get("gsis_id"))
        rec = totals.setdefault(pid, {"player_id": pid, "points": 0.0, "weeks": 0,
                                      "name": row.get("player_display_name")
                                      or row.get("player_name"),
                                      "position": row.get("position")})
        rec["points"] = round(rec["points"] + scoring.score_stat_line(
            GR.nflverse_weekly_to_scoring(row), table), 2)
        rec["weeks"] += 1
        rec["name"] = rec["name"] or row.get("player_display_name")
        rec["position"] = rec["position"] or row.get("position")
    return sorted(totals.values(), key=lambda r: -r["points"])[:n]


# ── the fetch, CI only ──────────────────────────────────────────────────────
def fetch_weekly(season, loaders=None):  # pragma: no cover  (egress; CI only)
    """Weekly rows for one season, from whichever loader ANSWERS, and says which.

    Rule 13, and it is not hypothetical here: `cli.py` records that
    `import_weekly_data` 404s for some seasons that `import_pbp_data` serves — a
    stale URL in the library, not missing data in the world. DATA-INVENTORY.md
    (probed 2026-08-08 in CI) records `import_weekly_data[2024]` REACHABLE at 5,597
    rows and `nflreadpy` INSTALLED but NEVER PROBED FOR WEEKLY. So neither is
    assumed: both are tried, the answer names the one that worked, and a season
    nothing serves comes back as an error rather than as an empty season.
    """
    tried = []

    def _nfl_data_py():
        import nfl_data_py as nfl
        df = nfl.import_weekly_data([int(season)])
        return df.to_dict("records")

    def _nflreadpy():
        import nflreadpy as nr
        df = nr.load_player_stats(seasons=[int(season)])
        return df.to_dicts() if hasattr(df, "to_dicts") else df.to_dict("records")

    for name, fn in (loaders or (("nfl_data_py.import_weekly_data", _nfl_data_py),
                                 ("nflreadpy.load_player_stats", _nflreadpy))):
        try:
            rows = fn()
        except Exception as e:                                   # noqa: BLE001
            tried.append({"loader": name, "status": "UNREACHABLE",
                          "detail": "%s: %s" % (type(e).__name__, e)})
            continue
        if not rows:
            # An empty answer is NOT a working loader. A season served as zero rows
            # would make every drafted player "absent" and the league unscoreable
            # for a reason that names the league instead of the fetch.
            tried.append({"loader": name, "status": "EMPTY", "detail": "0 rows"})
            continue
        tried.append({"loader": name, "status": "REACHABLE", "detail": "%d rows" % len(rows)})
        return {"rows": rows, "loader": name, "tried": tried}
    return {"error": "no loader served weekly data for %s" % season, "tried": tried}
