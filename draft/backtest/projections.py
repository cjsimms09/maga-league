"""Walk-forward projections — what we could honestly have believed at the time.

THE PROBLEM, STATED PLAINLY

We have no archived preseason projections for 2023, 2024 or 2025. Using today's
projections to replay a 2024 draft would be the purest form of the leak the
AsOf store exists to prevent: every player who broke out is already priced as a
breakout, and the composite would look clairvoyant.

So we build the projection ourselves, from data that existed before each draft,
and we say which method produced each season's numbers in the report. That
makes the backtest a test of the DECISION MACHINERY — VONA, survival, tiers,
keeper logic — running on era-appropriate inputs, which is the honest version
of the question. It is not a test of projection accuracy, and the report must
not be read as one.

TWO METHODS, IN ORDER OF PREFERENCE

  A. WALK-FORWARD. Prior seasons' production, scored under the replayed
     season's config, aged, regressed to the positional mean, and multiplied by
     expected games. Fit strictly on seasons before the replay season.

  B. ADP-IMPLIED. Fit a curve from draft position to realised points on OTHER
     seasons only, then read the replayed season's ADP through it.

B is the fallback when A fails its sanity checks. It is weaker for our purpose:
it makes the projection a function of ADP, and one of the baselines we are
grading against IS ADP, so a backtest run on B is closer to a self-comparison.
The report states which season used which, every time, without exception.

WHY REGRESSION TO THE MEAN IS NOT OPTIONAL

Last season's points are a biased estimate of next season's: the top of the
list is disproportionately players who got lucky, the bottom disproportionately
players who got hurt. A projection that is just "last year again" systematically
overvalues last year's leaders — and would hand the backtest a fake edge over
ADP, since the market already regresses. REGRESSION_WEIGHT is the correction,
and it is the single most consequential constant here.
"""
from __future__ import annotations

# --- config, every threshold named and commented ---------------------------
CFG = {
    # Weight on each prior season, most recent first. Two years of signal with
    # the older one discounted; a third adds little and excludes young players.
    "SEASON_WEIGHTS": [0.7, 0.3],
    # How far toward the positional mean a player's own rate is pulled. 0 = take
    # last year at face value (overvalues the leaders), 1 = everyone is average.
    "REGRESSION_WEIGHT": 0.35,
    # Games a healthy player is projected to play. Deliberately below 17 —
    # projecting a full season for everyone overvalues the injury-prone.
    "EXPECTED_GAMES": 15.5,
    # A player must have this many prior games before his own rate is trusted at
    # all; below it he is priced almost entirely at the positional baseline.
    "MIN_GAMES_FOR_RATE": 4,
    # Age curve. Applied to RB hardest, since the RB cliff is the best
    # documented ageing effect in fantasy.
    "AGE_PEAK": {"RB": 25, "WR": 26, "TE": 26, "QB": 29},
    "AGE_DECAY_PER_YEAR": {"RB": 0.055, "WR": 0.025, "TE": 0.02, "QB": 0.012},
    # Sanity gates for method A. Failing any one drops the season to method B.
    "SANITY_MIN_PLAYERS": 120,      # enough of a board to draft from
    "SANITY_MIN_SPEARMAN": 0.30,    # projections must rank-correlate with ADP;
                                    # near-zero means we built noise
}


def _positional_baseline(rates: dict, positions: dict) -> dict:
    """Mean per-game points by position, over players with a trusted rate."""
    buckets: dict[str, list] = {}
    for pid, r in rates.items():
        pos = positions.get(pid)
        if pos:
            buckets.setdefault(pos, []).append(r)
    return {p: (sum(v) / len(v) if v else 0.0) for p, v in buckets.items()}


def _age_multiplier(pos: str, age) -> float:
    if age is None:
        return 1.0
    peak = CFG["AGE_PEAK"].get(pos)
    decay = CFG["AGE_DECAY_PER_YEAR"].get(pos)
    if peak is None or decay is None:
        return 1.0
    years_past = max(0.0, float(age) - peak)
    return max(0.55, 1.0 - decay * years_past)


def walk_forward(season: int, prior_seasons_points: dict, games: dict,
                 positions: dict, ages: dict | None = None) -> dict:
    """Project per-season points for `season` from strictly prior production.

    `prior_seasons_points[year][player_id]` -> fantasy points that year, ALREADY
    scored under the replayed season's config by our own scoring engine. Never a
    provider's points: a provider's number encodes a different league's rules,
    and the whole point of this project is that the board is built for OUR
    scoring.
    """
    years = sorted((y for y in prior_seasons_points if int(y) < int(season)), reverse=True)
    if not years:
        return {}
    weights = CFG["SEASON_WEIGHTS"]
    ages = ages or {}

    # Per-game rate for each player, recency-weighted across prior seasons.
    rates, seen_games = {}, {}
    for pid in {p for y in years for p in prior_seasons_points[y]}:
        num = den = tot_games = 0.0
        for i, y in enumerate(years[:len(weights)]):
            pts = prior_seasons_points[y].get(pid)
            g = (games.get(y) or {}).get(pid, 0) or 0
            if pts is None or g <= 0:
                continue
            w = weights[i]
            num += w * (pts / g)
            den += w
            tot_games += g
        if den > 0:
            rates[pid] = num / den
            seen_games[pid] = tot_games

    baseline = _positional_baseline(
        {k: v for k, v in rates.items() if seen_games.get(k, 0) >= CFG["MIN_GAMES_FOR_RATE"]},
        positions)

    out = {}
    for pid, rate in rates.items():
        pos = positions.get(pid)
        base = baseline.get(pos, 0.0)
        g = seen_games.get(pid, 0)
        # Shrink hard for small samples, then apply the standing regression. A
        # four-game rookie sample is not evidence of a rate.
        trust = min(1.0, g / max(1.0, CFG["MIN_GAMES_FOR_RATE"] * 2.0))
        own = trust * rate + (1 - trust) * base
        regressed = (1 - CFG["REGRESSION_WEIGHT"]) * own + CFG["REGRESSION_WEIGHT"] * base
        out[pid] = round(regressed * _age_multiplier(pos, ages.get(pid))
                         * CFG["EXPECTED_GAMES"], 2)
    return out


def spearman(a: list, b: list) -> float:
    """Rank correlation, with no scipy dependency."""
    def ranks(v):
        order = sorted(range(len(v)), key=lambda i: v[i])
        r = [0.0] * len(v)
        for pos, i in enumerate(order):
            r[i] = pos
        return r
    if len(a) < 3:
        return 0.0
    ra, rb = ranks(a), ranks(b)
    n = len(a)
    ma, mb = sum(ra) / n, sum(rb) / n
    num = sum((ra[i] - ma) * (rb[i] - mb) for i in range(n))
    da = sum((ra[i] - ma) ** 2 for i in range(n)) ** 0.5
    db = sum((rb[i] - mb) ** 2 for i in range(n)) ** 0.5
    return 0.0 if da == 0 or db == 0 else num / (da * db)


def sanity_check(projection: dict, adp: dict) -> dict:
    """Is this projection fit to draft off, or is it noise wearing a number?

    Returns a verdict dict; the caller decides. Failing means the season falls
    back to the ADP-implied method, and the REPORT SAYS SO — an undisclosed
    fallback would make the backtest's headline incomparable across seasons.
    """
    common = [p for p in projection if p in adp]
    xs = [projection[p] for p in common]
    ys = [-float(adp[p]) for p in common]          # better ADP = lower number
    rho = spearman(xs, ys)
    enough = len(projection) >= CFG["SANITY_MIN_PLAYERS"]
    correlated = rho >= CFG["SANITY_MIN_SPEARMAN"]
    return {
        "players": len(projection),
        "overlap_with_adp": len(common),
        "spearman_vs_adp": round(rho, 4),
        "enough_players": enough,
        "correlated_with_market": correlated,
        "passes": bool(enough and correlated),
        # Stated so a reader knows what "passes" was measured against.
        "thresholds": {"min_players": CFG["SANITY_MIN_PLAYERS"],
                       "min_spearman": CFG["SANITY_MIN_SPEARMAN"]},
    }


def adp_implied(adp: dict, fitted_curve: list) -> dict:
    """Method B: read ADP through a curve fitted on OTHER seasons only.

    `fitted_curve` is [(adp_bucket_start, mean_points)] ascending, built by the
    caller from seasons excluding the replayed one. Linear interpolation between
    buckets; flat outside them.
    """
    if not fitted_curve:
        return {}
    pts = sorted(fitted_curve)
    out = {}
    for pid, a in adp.items():
        a = float(a)
        if a <= pts[0][0]:
            out[pid] = round(pts[0][1], 2)
            continue
        if a >= pts[-1][0]:
            out[pid] = round(pts[-1][1], 2)
            continue
        for i in range(1, len(pts)):
            if a <= pts[i][0]:
                x0, y0 = pts[i - 1]
                x1, y1 = pts[i]
                t = 0.0 if x1 == x0 else (a - x0) / (x1 - x0)
                out[pid] = round(y0 + t * (y1 - y0), 2)
                break
    return out
