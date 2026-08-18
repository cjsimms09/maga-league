# TERRITORY: C
"""A PER-PLAYER CEILING, FROM DATA ALREADY ON DISK — no fetch, no key, no credits.

Cory: "different players have different ceilings based on age, team, position,
opportunity" — and, in the FFDP discussion, "Projected points is already a
value we have, along with floor. Find it."

WHAT I FOUND. FantasyFootballDataPros' public ceiling/floor content is not an
API field — it is a documented TUTORIAL technique on their own blog
("Ceiling/Floor Rankings ... using Python"): take a player's own weekly
fantasy points, resample/percentile them, and report a range. The RAW
INGREDIENT that technique runs on is exactly what `nflverse_weekly_store.py`
already holds — realized weekly points, scored under OUR OWN table (not
ESPN's, which is what FFDP's numbers are built on) — for five real seasons,
already committed, already this lane's, already reachable from this sandbox.
There is nothing to fetch. The technique was the thing worth finding, not a
field on someone else's server.

WHY THIS IS A DIFFERENT SIGNAL FROM `projection_error.py`, NOT A DUPLICATE.
That module measures ESTIMATION ERROR pooled by (position, projection-rank
band) — every player in a band shares one ratio, which is exactly register
4q's defect (935 of 1,304 graded players sharing ONE cell). This module
measures ONE PLAYER'S OWN week-to-week shape: a bell-cow back and a
committee back can sit in the same rank band with the same proj_mean and
still have completely different weekly variance, and that difference is
real, already captured in the box score, and currently invisible to the
board. The two are complementary — a per-player empirical range where a
player has enough of his own history, the measured band as the fallback
where he does not (a rookie, a new starter, a player who changed teams).

THE LIMIT, NAMED RATHER THAN HIDDEN. This is realized IN-SEASON WEEKLY
VOLATILITY, the same risk category `projection_error.py`'s own docstring
already distinguishes from PRESEASON ESTIMATION ERROR ("they are different
risks and only one is the drafter's"). It answers "given this player gets a
game like his typical one, how much does he swing" — not "how wrong could
our whole-season number be." A rookie or a player in a genuinely new role
has no own-history series at all and MUST fall back, same as any
player-specific historical method; that fallback is exactly what
`projection_error.py` already provides. Nothing here proposes replacing it.

NOT WIRED TO THE BOARD. This file computes and reports; it does not change
`proj_ceiling`/`proj_floor` or touch `projections.py`. Whether/how to combine
this with the measured-band calibration is a design and blast-radius
question for Cory/A, the same as register 4q.

Run: python3 draft/backtest/nflverse_player_ceiling.py
"""
from __future__ import annotations

from pathlib import Path

import nflverse_weekly_store as WS

HERE = Path(__file__).resolve().parent

#: The seasons actually committed on disk, checked against real files rather
#: than assumed — pinned by a test the same way `projection_error.
#: CALIBRATION_SEASONS` is pinned against `league_history.json`.
WEEKLY_SEASONS = (2021, 2022, 2023, 2024, 2025)

#: Below this many of a player's OWN weeks, a range is noise wearing a
#: measurement's clothes — same threshold and same reasoning as
#: `projection_error.MIN_N`, applied to one player's series instead of a
#: pooled cell.
MIN_N = 8

OUT = HERE / "nflverse_player_ceiling.json"


def _store_path(season: int) -> Path:
    return HERE / ("nflverse_weekly_points_%d.json" % season)


def load_player_weeks(seasons=WEEKLY_SEASONS, *, exclude_season=None) -> dict:
    """{pid: [points, ...]} — every realized weekly total across `seasons`,
    for every player who appears at least once, read through
    `nflverse_weekly_store.load` rather than re-parsing JSON here (rule 14:
    the reader ships with the writer, so this does not become a second
    definition of what a stored week means).

    `exclude_season` REFUSES one season's weeks — the same leave-one-out
    shape `projection_error.calibrate`'s `exclude_season` uses, so this can
    be backtested without reading the season it would be applied to.
    """
    out: dict[str, list] = {}
    for season in seasons:
        if exclude_season is not None and int(season) == int(exclude_season):
            continue
        weeks = WS.load(path=_store_path(season))
        for wk in weeks:
            for pid, pts in (wk.get("points") or {}).items():
                out.setdefault(str(pid), []).append(float(pts))
    return out


def _percentile(sorted_vals: list, q: float):
    """Linear-interpolated quantile, refusing an empty series rather than
    returning 0.0.

    NOT `lab_stats.percentile` — that function is nearest-rank (not
    interpolated) and returns `0.0` on an empty list, which would read a
    player with no data as a player who is guaranteed to score zero. This
    module needs "absent, not zero" the same way every other measurement in
    this repo does. NOT `projection_error._q` either — leading-underscore
    private helper in another module; reaching into it couples this file to
    an implementation detail rather than a declared interface. Same method
    as `projection_error._q` on purpose (both are small, both are tested),
    kept local rather than shared because the two callers measure different
    things (a ratio pooled across many players vs. one player's own series)
    and a shared helper would tempt a future edit to one to assume it also
    covers the other.
    """
    if not sorted_vals:
        return None
    if len(sorted_vals) == 1:
        return sorted_vals[0]
    i = q * (len(sorted_vals) - 1)
    lo = int(i)
    hi = min(lo + 1, len(sorted_vals) - 1)
    frac = i - lo
    return sorted_vals[lo] * (1 - frac) + sorted_vals[hi] * frac


def player_ceiling_floor(series: list, *, min_n: int = MIN_N) -> dict:
    """One player's own weekly points -> {status, n, p10, p50, p90}.

    `status: "unmeasurable"` below `min_n`, same refusal shape as
    `projection_error.calibrate`'s thin cells — a range fitted on three
    games is not a range, and reporting one would tell a consumer this
    player's variance is known when it is not.
    """
    vs = sorted(float(v) for v in (series or []))
    n = len(vs)
    if n < int(min_n):
        return {"status": "unmeasurable", "n": n, "p10": None, "p50": None,
                "p90": None,
                "basis": "only %d of this player's own weeks; min_n is %d" % (n, min_n)}
    return {"status": "measured", "n": n,
           "p10": round(_percentile(vs, 0.10), 2),
           "p50": round(_percentile(vs, 0.50), 2),
           "p90": round(_percentile(vs, 0.90), 2),
           "basis": "%d of this player's own realized weeks" % n}


def all_players_ceiling_floor(player_weeks: dict, *, min_n: int = MIN_N) -> dict:
    """{pid: player_ceiling_floor(...)} for every player in `player_weeks`."""
    return {pid: player_ceiling_floor(series, min_n=min_n)
           for pid, series in (player_weeks or {}).items()}


def summarize(results: dict) -> dict:
    """How much of the pool this can actually speak to, reported rather than
    implied. The same "coverage travels with the number" rule
    `projection_error.report` already follows for its own pooled cells."""
    n = len(results or {})
    measured = sum(1 for r in results.values() if r["status"] == "measured")
    return {"players": n, "measured": measured, "unmeasurable": n - measured,
           "measured_fraction": round(measured / n, 4) if n else None}


def main() -> int:
    import json

    player_weeks = load_player_weeks()
    results = all_players_ceiling_floor(player_weeks)
    summary = summarize(results)
    doc = {
        "_territory": "TERRITORY: C — produced by nflverse_player_ceiling.py",
        "_note": ("Per-player empirical p10/p50/p90 of realized weekly "
                 "points, scored under OUR table, across %s. Complementary "
                 "to projection_error.py's pooled (position, rank-band) "
                 "calibration, not a replacement — see module docstring for "
                 "the risk-category distinction. NOT wired to the board." %
                 (WEEKLY_SEASONS,)),
        "seasons": list(WEEKLY_SEASONS), "min_n": MIN_N,
        "summary": summary, "players": results,
    }
    OUT.write_text(json.dumps(doc, indent=1) + "\n")
    print("measured %d/%d players (%.1f%%); wrote %s"
         % (summary["measured"], summary["players"],
            100 * (summary["measured_fraction"] or 0), OUT.name))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
