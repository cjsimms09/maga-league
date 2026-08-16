# TERRITORY: A
"""TEAM PACE OF PLAY — the first real measurement in this repo, 2026-08-16.

Preregistered in `draft/audit/pace_of_play_prereg_2026-08-16.md`, committed
before this file existed; every definition below is fixed there and none of
them is tuned here.

WHAT THIS IS NOT. `own_model_v5.py`'s `pace_lam` is a shrinkage coefficient on
prior-season team target/rush VOLUME (`E[team vol] = pace_lam·team_Y-1 +
(1-pace_lam)·league mean`, :68-69/:456-459). It is inert at QB and RB (`None`),
1.00 at WR (no regression at all) and 0.50 at TE. It has never been a measure of
how fast a team plays. `own_model_v6.py` contains the string zero times.

WHY IT IS A SEPARATE FILE. `fetch_component_stats.py` and its committed
`component_stats_*.json` bytes are what other agents' parity tests pin during
draft week. This module imports its `_download` READ-ONLY and never edits it —
same contract `fetch_advanced_stats.py` set on 2026-08-16.

AND THE PLAY FILTER IS C's, IMPORTED, NOT REWRITTEN. `nflverse_pace.py`
(TERRITORY: C) already argues and implements what counts as a scrimmage play and
why kneels and spikes must go. That reasoning is not re-litigated or duplicated
here: `SCRIMMAGE` and the kneel/spike rule come from that module by import. What
this file adds is the part C's module could never run — it says in its own
comment that "the pbp pull is egress-blocked from the sandbox so I cannot
measure it" — plus seconds-per-play, PROE, and a per-team-week grain.

THE THING THAT MAKES RAW PACE A TRAP, restated because the store must not be
read without it: a team that trails all season hurries and runs more plays; a
team that leads kneels the clock away. Rank offences by raw volume and you
partly rank them by how badly they were losing. So NEUTRAL script is measured
alongside raw and the two are stored SEPARATELY — never blended, because the GAP
between them is itself the interesting quantity.

NEUTRAL, exactly (prereg §2, and it is the repo's own three-day-old written
spec at `draft/audits/value_frameworks_2026-08-13.md:141`, adopted rather than
invented so the exclusion rule could not be fitted to the answer):

    qtr <= 3  AND  |score_differential| <= 7  AND  half_seconds_remaining > 120

The clock condition removes the two-minute drill and every end-of-half
kneel/spike/clock-kill sequence at the SOURCE, not merely by play type.
`nflverse_pace.py`'s laxer 14-point margin (no quarter or clock condition) is
computed too, as a declared robustness arm. Neither is tuned.

SECONDS PER PLAY is snap-to-snap and demands ADJACENCY IN THE RAW PBP: nothing
at all between the two rows — no timeout, no `no_play` penalty, no two-minute
warning, no change of possession. Without that requirement the number is
"elapsed time over plays", which silently prices stoppages as tempo.

THE CONTAMINATION IS NAMED IN THE STORE, not discovered later: an incompletion
stops the clock, so pass-heavy offences post shorter gaps for reasons that are
not tempo. `neutral_sec_per_play_clockrunning` restricts to pairs whose EARLIER
play left the clock running. Both are stored; neither is folded into the other.

ABSENT IS NOT ZERO. A team-season under MIN_GAMES, or a team-week under
MIN_WEEK_PLAYS, stores `status` and a `basis` string with `None` values — never
a zero, which would read as "this offence ran no plays".

Run: python draft/backtest/fetch_team_pace.py [--force]
Writes draft/backtest/team_pace_2021_2025.json.
Requires pandas + pyarrow at FETCH time only; every consumer reads the JSON.
"""
from __future__ import annotations

import datetime as _dt
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from fetch_component_stats import _download  # noqa: E402  (read-only import)
from nflverse_pace import SCRIMMAGE, MIN_GAMES, _truthy  # noqa: E402  (C's, read-only)

SEASONS = (2021, 2022, 2023, 2024, 2025)

URL_PBP = ("https://github.com/nflverse/nflverse-data/releases/download/"
           "pbp/play_by_play_{year}.parquet")

#: Prereg §2 — the PRIMARY neutral rule, the repo's own written spec.
NEUTRAL_MARGIN = 7
NEUTRAL_MAX_QTR = 3
NEUTRAL_MIN_HALF_SECONDS = 120

#: Prereg §2 — the robustness arm, C's margin, no quarter or clock condition.
LAX_MARGIN = 14

#: A snap-to-snap gap outside this window is a stoppage, not a pace observation.
SEC_MIN, SEC_MAX = 0.0, 60.0

#: Below this many qualifying neutral plays a team-WEEK reports a status.
MIN_WEEK_PLAYS = 10

#: Columns pulled from the 372-column pbp. Named so a schema drift is a loud
#: KeyError at fetch time rather than a silently absent filter.
COLUMNS = (
    "season", "week", "season_type", "game_id", "play_id", "posteam",
    "play_type", "qb_kneel", "qb_spike", "score_differential",
    "game_seconds_remaining", "half_seconds_remaining", "qtr", "fixed_drive",
    "timeout", "pass_oe", "incomplete_pass", "penalty", "sp", "out_of_bounds",
    "interception", "fumble_lost",
)

#: Flags on the EARLIER play of a pair that stop the game clock.
CLOCK_STOPPERS = ("incomplete_pass", "penalty", "sp", "out_of_bounds",
                  "interception", "fumble_lost", "timeout")

MISSING_VS_ZERO = (
    "a team-season below MIN_GAMES, or a team-week below MIN_WEEK_PLAYS, "
    "carries status + basis and None values — never a zero. A zero here would "
    "read as 'this offence ran no plays', which is a claim, not an absence. "
    "plays_per_game is RAW and is contaminated by game script BY DESIGN; it is "
    "the baseline the neutral figures must be read against, never a substitute "
    "for them."
)


def store_path() -> Path:
    return HERE / f"team_pace_{SEASONS[0]}_{SEASONS[-1]}.json"


# ── the pure half (no network, no filesystem) ────────────────────────────────

def _num(v):
    """A real finite number, or None. NaN is None — pbp writes NaN for 'this
    field does not apply to this row', and NaN silently passes every `>`
    comparison written as a negation."""
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return None if f != f else f


def is_neutral(row: dict, *, margin: int = NEUTRAL_MARGIN,
               max_qtr: int | None = NEUTRAL_MAX_QTR,
               min_half_seconds: int | None = NEUTRAL_MIN_HALF_SECONDS) -> bool:
    """Prereg §2's three conjunctive conditions. An UNKNOWN field is NOT
    neutral — the same rule `nflverse_pace` states: unknown script is not
    neutral, because defaulting the other way silently admits exactly the
    garbage-time plays the filter exists to remove."""
    # ⚠ THE COMPARISON IS WRITTEN AS AN INCLUSION, NEVER AS `not (exclusion)`.
    # `abs(nan) > margin` is False, so the negated form admits every NaN row as
    # NEUTRAL — a guard that exists and does not guard. Found by the test, not
    # by reading: score_differential happens to be non-null in all five
    # committed seasons, so this would have shipped silently and fired the day
    # nflverse changed a fill rule.
    d = _num(row.get("score_differential"))
    if d is None or not abs(d) <= float(margin):
        return False
    if max_qtr is not None:
        q = _num(row.get("qtr"))
        if q is None or not q <= float(max_qtr):
            return False
    if min_half_seconds is not None:
        h = _num(row.get("half_seconds_remaining"))
        if h is None or not h > float(min_half_seconds):
            return False
    return True


def is_scrimmage(row: dict) -> bool:
    """C's rule, imported: pass/run only, minus kneels and spikes. Checked BOTH
    by play_type (this schema types kneels/spikes separately) and by the truthy
    flag — belt and braces, because the two have disagreed across nflverse
    schema generations and a kneel counted as a play flatters exactly the
    offences that stopped playing."""
    if row.get("play_type") not in SCRIMMAGE:
        return False
    return not (_truthy(row.get("qb_kneel")) or _truthy(row.get("qb_spike")))


def _clock_ran(row: dict) -> bool:
    return not any(_truthy(row.get(f)) for f in CLOCK_STOPPERS)


def _mean(xs):
    return (sum(xs) / len(xs)) if xs else None


def _r(v, n=3):
    return None if v is None else round(float(v), n)


def accumulate(rows: list) -> dict:
    """`{(season, team): acc}` over REG rows given in pbp order.

    ONE pass, and the pair logic lives here rather than in a second pass so the
    adjacency requirement is exactly 'the previous ROW', which is what makes
    the seconds figure snap-to-snap rather than elapsed-time-over-plays.
    """
    acc: dict = {}
    prev = None                     # the immediately preceding row, any type

    def bucket(season, team):
        return acc.setdefault((int(season), str(team)), {
            "plays": 0, "passes": 0, "games": set(), "games_with_plays": set(),
            "n_plays": 0, "n_passes": 0, "lax_plays": 0,
            "proe": [], "gaps": [], "gaps_clockrunning": [],
            "week_plays": {}, "week_neutral": {}, "week_gaps": {},
            "pair_candidates": 0, "pair_rejected_window": 0,
        })

    for row in rows:
        if str(row.get("season_type")) != "REG":
            prev = row
            continue
        team = row.get("posteam")
        if not team or team != team:
            prev = row
            continue
        season = row.get("season")
        if season is None or season != season:
            prev = row
            continue
        a = bucket(season, team)
        gid = row.get("game_id")
        if gid is not None and gid == gid:
            a["games"].add(str(gid))

        if not is_scrimmage(row):
            prev = row
            continue

        wk = int(row["week"])
        a["plays"] += 1
        a["week_plays"][wk] = a["week_plays"].get(wk, 0) + 1
        if gid is not None and gid == gid:
            a["games_with_plays"].add(str(gid))
        if row.get("play_type") == "pass":
            a["passes"] += 1

        if is_neutral(row, margin=LAX_MARGIN, max_qtr=None, min_half_seconds=None):
            a["lax_plays"] += 1

        neutral = is_neutral(row)
        if neutral:
            a["n_plays"] += 1
            a["week_neutral"][wk] = a["week_neutral"].get(wk, 0) + 1
            if row.get("play_type") == "pass":
                a["n_passes"] += 1
            oe = row.get("pass_oe")
            try:
                f = float(oe)
                if f == f:
                    a["proe"].append(f / 100.0)
            except (TypeError, ValueError):
                pass                       # absent PROE is absent, not zero

            # ── the snap-to-snap pair ──────────────────────────────────────
            if (prev is not None
                    and is_scrimmage(prev)
                    and is_neutral(prev)
                    and str(prev.get("posteam")) == str(team)
                    and str(prev.get("game_id")) == str(gid)
                    and prev.get("fixed_drive") == row.get("fixed_drive")
                    and prev.get("qtr") == row.get("qtr")):
                a["pair_candidates"] += 1
                try:
                    gap = (float(prev["game_seconds_remaining"])
                           - float(row["game_seconds_remaining"]))
                except (TypeError, ValueError, KeyError):
                    gap = None
                if gap is not None and SEC_MIN < gap <= SEC_MAX:
                    a["gaps"].append(gap)
                    a["week_gaps"].setdefault(wk, []).append(gap)
                    if _clock_ran(prev):
                        a["gaps_clockrunning"].append(gap)
                else:
                    a["pair_rejected_window"] += 1
        prev = row
    return acc


def summarise(acc: dict, *, min_games: int = MIN_GAMES,
              min_week_plays: int = MIN_WEEK_PLAYS) -> tuple[dict, dict]:
    """`(seasons, coverage)` — `seasons[str(year)][team]` is the stored row."""
    seasons: dict = {}
    unmeasurable = 0
    for (season, team), a in sorted(acc.items()):
        g = len(a["games"])
        row: dict = {
            "games": g,
            "games_with_plays": len(a["games_with_plays"]),
            "games_without_plays": g - len(a["games_with_plays"]),
            "plays": a["plays"],
            "neutral_plays": a["n_plays"],
        }
        if g < int(min_games) or not a["plays"]:
            unmeasurable += 1
            row.update({
                "status": "unmeasurable",
                "basis": "only %d game(s); min_games is %d" % (g, min_games),
                "plays_per_game": None, "neutral_plays_per_game": None,
                "neutral_share": None, "pass_rate": None,
                "neutral_pass_rate": None, "proe": None,
                "neutral_sec_per_play": None,
                "neutral_sec_per_play_clockrunning": None,
                "lax_plays_per_game": None, "weeks": {},
            })
            seasons.setdefault(str(season), {})[team] = row
            continue
        weeks = {}
        for wk in sorted(set(a["week_plays"]) | set(a["week_neutral"])):
            n = a["week_neutral"].get(wk, 0)
            if n < int(min_week_plays):
                weeks[str(wk)] = {
                    "status": "unmeasurable", "neutral_plays": n,
                    "basis": "%d neutral play(s); min_week_plays is %d"
                             % (n, min_week_plays),
                    "plays": a["week_plays"].get(wk, 0),
                    "neutral_plays_per_game": None, "neutral_sec_per_play": None,
                }
                continue
            weeks[str(wk)] = {
                "status": "measured",
                "plays": a["week_plays"].get(wk, 0),
                "neutral_plays": n,
                "neutral_plays_per_game": float(n),   # one game per team-week
                "neutral_sec_per_play": _r(_mean(a["week_gaps"].get(wk, []))),
                "sec_pairs": len(a["week_gaps"].get(wk, [])),
            }
        row.update({
            "status": "measured",
            "basis": "%d scrimmage plays over %d games; %d neutral; %d snap pairs"
                     % (a["plays"], g, a["n_plays"], len(a["gaps"])),
            "plays_per_game": _r(a["plays"] / g),
            "neutral_plays_per_game": _r(a["n_plays"] / g),
            "lax_plays_per_game": _r(a["lax_plays"] / g),
            "neutral_share": _r(a["n_plays"] / a["plays"], 4),
            "pass_rate": _r(a["passes"] / a["plays"], 4),
            "neutral_pass_rate": (_r(a["n_passes"] / a["n_plays"], 4)
                                  if a["n_plays"] else None),
            "proe": _r(_mean(a["proe"]), 4),
            "neutral_sec_per_play": _r(_mean(a["gaps"])),
            "neutral_sec_per_play_clockrunning": _r(_mean(a["gaps_clockrunning"])),
            "sec_pairs": len(a["gaps"]),
            "sec_pairs_clockrunning": len(a["gaps_clockrunning"]),
            "pair_candidates": a["pair_candidates"],
            "pair_rejected_window": a["pair_rejected_window"],
            "weeks": weeks,
        })
        seasons.setdefault(str(season), {})[team] = row

    coverage = {}
    for y, teams in seasons.items():
        measured = [t for t, r in teams.items() if r["status"] == "measured"]
        wk_all = sum(len(r.get("weeks") or {}) for r in teams.values())
        wk_ok = sum(1 for r in teams.values()
                    for w in (r.get("weeks") or {}).values()
                    if w["status"] == "measured")
        coverage[y] = {
            "teams": len(teams), "teams_measured": len(measured),
            "teams_unmeasurable": len(teams) - len(measured),
            "team_weeks": wk_all, "team_weeks_measured": wk_ok,
            "plays": sum(r["plays"] for r in teams.values()),
            "neutral_plays": sum(r["neutral_plays"] for r in teams.values()),
            "sec_pairs": sum(r.get("sec_pairs") or 0 for r in teams.values()),
            "games_without_plays": sum(r["games_without_plays"]
                                       for r in teams.values()),
        }
    coverage["_unmeasurable_team_seasons"] = unmeasurable
    return seasons, coverage


# ── the I/O half ─────────────────────────────────────────────────────────────

def _read_season(path: Path) -> list:
    import pyarrow.parquet as pq
    names = set(pq.ParquetFile(str(path)).schema.names)
    missing = [c for c in COLUMNS if c not in names]
    if missing:
        raise KeyError(
            "pbp schema is missing %s — refusing to compute pace from a frame "
            "that cannot express the filters (an absent filter column silently "
            "admits every row it was meant to exclude)" % (missing,))
    df = pq.read_table(str(path), columns=list(COLUMNS)).to_pandas()
    return df.to_dict("records")


def fetch(workdir: Path, force: bool = False, seasons=SEASONS) -> dict:
    tried, rows = [], []
    for y in seasons:
        url = URL_PBP.format(year=y)
        dest = workdir / f"pbp_{y}.parquet"
        ok = dest.exists() and dest.stat().st_size > 1000
        if not ok:
            ok = _download(url, dest)
        tried.append({"season": y, "url": url, "ok": bool(ok)})
        if not ok:
            return {"store": "team_pace", "status": "unreachable", "tried": tried}
        rows.extend(_read_season(dest))

    seasons_out, coverage = summarise(accumulate(rows))
    path = store_path()
    if path.exists() and not force:
        try:
            old = json.loads(path.read_text())
        except ValueError:
            old = {}
        if old.get("seasons") == seasons_out:
            return {"store": "team_pace", "status": "unchanged",
                    "path": path.name, "coverage": coverage}
    doc = {
        "_territory": "TERRITORY: A — produced by draft/backtest/fetch_team_pace.py",
        "_note": (
            "TEAM PACE OF PLAY, %d-%d, regular season, from nflverse play-by-play. "
            "The FIRST real pace measurement in this repo: own_model_v5.py's "
            "`pace_lam` is a shrinkage coefficient on prior-season team target/rush "
            "VOLUME, not pace, and is inert at QB and RB. Preregistered in "
            "draft/audit/pace_of_play_prereg_2026-08-16.md, committed first. "
            "NEUTRAL = qtr<=%d AND |score_differential|<=%d AND "
            "half_seconds_remaining>%d — the repo's own spec from "
            "draft/audits/value_frameworks_2026-08-13.md:141, adopted rather than "
            "invented so the exclusion rule could not be fitted to the answer. "
            "`lax_plays_per_game` uses nflverse_pace.py's |diff|<=%d with no "
            "quarter or clock condition, as a declared robustness arm. "
            "neutral_sec_per_play is SNAP-TO-SNAP and requires the two plays to be "
            "ADJACENT ROWS in the raw pbp — nothing in between, no timeout, no "
            "no_play penalty, no two-minute warning — with the gap in (%g, %g] "
            "seconds. KNOWN CONTAMINATION, named here rather than discovered "
            "later: an incompletion stops the clock, so pass-heavy offences post "
            "shorter gaps for reasons that are not tempo; "
            "neutral_sec_per_play_clockrunning restricts to pairs whose EARLIER "
            "play left the clock running. The two are stored separately and "
            "NEVER blended — a single adjusted number hides which half does the "
            "work. LEAKAGE: this store is descriptive and holds every season; a "
            "consumer projecting season Y must read pace from Y-1 only."
            % (seasons[0], seasons[-1], NEUTRAL_MAX_QTR, NEUTRAL_MARGIN,
               NEUTRAL_MIN_HALF_SECONDS, LAX_MARGIN, SEC_MIN, SEC_MAX)),
        "missing_vs_zero": MISSING_VS_ZERO,
        "definitions": {
            "neutral_margin": NEUTRAL_MARGIN,
            "neutral_max_qtr": NEUTRAL_MAX_QTR,
            "neutral_min_half_seconds": NEUTRAL_MIN_HALF_SECONDS,
            "lax_margin": LAX_MARGIN,
            "sec_window": [SEC_MIN, SEC_MAX],
            "min_games": MIN_GAMES,
            "min_week_plays": MIN_WEEK_PLAYS,
            "scrimmage": list(SCRIMMAGE),
            "team_field": "posteam (the offence) — never home_team",
            "clock_stoppers": list(CLOCK_STOPPERS),
        },
        "provenance": {
            "url": URL_PBP, "tried": tried,
            "fetched": _dt.date.today().isoformat(),
            "season_type": "REG",
            "play_filter_source": ("draft/backtest/nflverse_pace.py (TERRITORY: C) "
                                   "— SCRIMMAGE and the kneel/spike rule imported "
                                   "read-only, not reimplemented"),
        },
        "coverage": coverage,
        "seasons": seasons_out,
    }
    path.write_text(json.dumps(doc, indent=1))
    return {"store": "team_pace", "status": "written", "path": path.name,
            "coverage": coverage}


def load_store() -> dict:
    return json.loads(store_path().read_text())


def team_pace(season: int, metric: str = "neutral_plays_per_game") -> dict:
    """`{team: value}` for one season — MEASURED teams only. A team whose
    season is unmeasurable, or whose metric is absent, is ABSENT from the
    mapping, never zero."""
    doc = load_store()
    out = {}
    for team, row in (doc["seasons"].get(str(int(season))) or {}).items():
        if row.get("status") != "measured":
            continue
        v = row.get(metric)
        if v is None:
            continue
        out[team] = float(v)
    return dict(sorted(out.items()))


def main() -> None:
    import tempfile
    force = "--force" in sys.argv
    # --workdir lets a caller point at an already-downloaded parquet cache so a
    # re-run is a re-COMPUTE rather than five more 20MB pulls. The parity check
    # is unaffected: same bytes in, same bytes out.
    wd = None
    for i, a in enumerate(sys.argv):
        if a == "--workdir" and i + 1 < len(sys.argv):
            wd = Path(sys.argv[i + 1])
    if wd is not None:
        wd.mkdir(parents=True, exist_ok=True)
        rep = fetch(wd, force=force)
    else:
        with tempfile.TemporaryDirectory() as td:
            rep = fetch(Path(td), force=force)
    print(json.dumps(rep, indent=1))


if __name__ == "__main__":
    main()
