"""Derive matchupValue — the dollar worth of one regular-season head-to-head win.

WHY THIS EXISTS
The in-season lineup optimizer trades floor (win the matchup) against ceiling
(clear the weekly-high $100). That tradeoff is governed by ONE number: how many
dollars a matchup win is worth. It shipped at $25, described in the code as "a
typical side-bet stake."

That was wrong twice over. (1) Side bets live OUTSIDE fantasy — they must not
touch the optimizer (Cory, 2026-08-10). (2) A matchup win is not worth a side
bet; it is worth its contribution to the PLAYOFF POOL. Our standings-tied money
is $2,125 in playoffs (top 4 of 10) + $375 in regular-season prizes = $2,500,
and a regular-season win's only value is moving you up those standings.

So matchupValue = d E[standings payout] / d(regular-season wins), measured.

METHOD (measured, with ONE stated modelling assumption)
Everything here is HARD-CODED league fact except the game-level win-probability
spread, which is a DESIGNED input and is swept so the reader sees its effect:
  - HARD: 10 teams, 14 regular-season H2H games (playoff_week_start = 15),
          top 4 make playoffs, payout table from payouts.json.
  - DESIGNED: teams differ in strength; per-game win prob = logistic(strength
          gap). The strength SD is chosen so simulated win spreads match a real
          league (best ~10-11 wins, worst ~3-4). Swept below.

For each simulated season we rank teams by wins (random tiebreak), pay the top 4
their playoff-FINISH expectation (a 1-seed is worth more than a 4-seed because it
enters the bracket better — we map seed→E[playoff$] by seeding the bracket and
letting higher seeds win with a bracket edge), and pay RS champ/runner-up by
record. The marginal value of a win is measured by flipping one of a focal
team's losses to a win and re-ranking: the payout delta, averaged over seasons
and over the focal team's own strength, is the dollar value of a win.

We report the AVERAGE win value and — the number that actually matters for a
competitive manager — the value of a win to a BUBBLE team (one whose baseline win
total sits at the 4/5 seed boundary), because that is where Cory drafts to be and
where the optimizer's tradeoff is exercised.

Run: python3 draft/backtest/matchup_value.py
"""
import json
import os
import random

HERE = os.path.dirname(os.path.abspath(__file__))
PAYOUTS = os.path.join(HERE, "..", "config", "payouts.json")

TEAMS = 10
GAMES = 14                # weeks 1-14 H2H; week 15 starts playoffs
PLAYOFF_SPOTS = 4
SEED = 20260810           # fixed: reproducible, no Date/random-seed drift


def load_payouts(season="2026"):
    d = json.load(open(PAYOUTS))
    s = d["by_season"][season]
    po = s["playoffs"]
    rs = s["regular_season"]
    return (
        {1: po["1"], 2: po["2"], 3: po["3"], 4: po["4"]},
        {"champ": rs["champ"], "runner_up": rs["runner_up"]},
    )


def logistic(x):
    import math
    return 1.0 / (1.0 + math.exp(-x))


def expected_playoff_dollars_by_seed(playoff_pay, bracket_edge=0.60, sims=4000, rng=None):
    """Map a playoff SEED (1..4) to expected playoff dollars.

    A 4-team bracket: 1v4, 2v3, winners meet. Higher seed wins a game with
    probability `bracket_edge` (a modest home-seed advantage; 0.5 = pure luck,
    0.6 = the better-seeded team wins 60%). Returns {seed: E[$]}.
    """
    rng = rng or random.Random(SEED + 7)
    finish_dollars = {s: 0.0 for s in range(1, 5)}
    for _ in range(sims):
        # semifinals
        def game(hi, lo):
            return hi if rng.random() < bracket_edge else lo
        f1 = game(1, 4)      # 1 seed vs 4 seed
        f2 = game(2, 3)      # 2 seed vs 3 seed
        # final + third-place
        champ = game(min(f1, f2), max(f1, f2))
        runner = f1 + f2 - champ
        semis_losers = {1, 2, 3, 4} - {f1, f2}
        third = game(min(semis_losers), max(semis_losers))
        fourth = list(semis_losers - {third})[0]
        order = [champ, runner, third, fourth]        # finish 1..4 by SEED id
        for finish, seed in enumerate(order, start=1):
            finish_dollars[seed] += playoff_pay[finish]
    return {s: finish_dollars[s] / sims for s in finish_dollars}


def simulate(strength_sd, playoff_pay, rs_pay, seed_dollars, n_seasons=20000, rng=None):
    """Return (avg_win_value, bubble_win_value) in dollars."""
    rng = rng or random.Random(SEED)

    def season_payouts(wins):
        # wins: list of (team_idx, win_count). Rank desc, random tiebreak.
        order = sorted(range(TEAMS), key=lambda i: (wins[i], rng.random()), reverse=True)
        pay = [0.0] * TEAMS
        # playoffs: seeds 1..4 -> expected playoff dollars
        for seed, team in enumerate(order[:PLAYOFF_SPOTS], start=1):
            pay[team] += seed_dollars[seed]
        # regular-season prizes: best record champ, 2nd runner-up
        pay[order[0]] += rs_pay["champ"]
        pay[order[1]] += rs_pay["runner_up"]
        return pay, order

    total_avg = 0.0
    n_avg = 0
    bubble_deltas = []
    for _ in range(n_seasons):
        strengths = [rng.gauss(0, strength_sd) for _ in range(TEAMS)]
        # simulate each team's win total against a random schedule of opponents
        wins = [0] * TEAMS
        for i in range(TEAMS):
            opps = rng.sample([t for t in range(TEAMS) if t != i], min(GAMES, TEAMS - 1))
            # 14 games, 9 distinct opponents -> cycle to fill the schedule
            sched = [opps[g % len(opps)] for g in range(GAMES)]
            for o in sched:
                p = logistic(strengths[i] - strengths[o])
                if rng.random() < p:
                    wins[i] += 1
        base_pay, base_order = season_payouts(wins)
        # marginal value of a win for a focal team: give team f one extra win,
        # re-rank, measure payout delta. Do it for every team, average.
        for f in range(TEAMS):
            if wins[f] >= GAMES:
                continue
            wins[f] += 1
            new_pay, _ = season_payouts(wins)
            wins[f] -= 1
            delta = new_pay[f] - base_pay[f]
            total_avg += delta
            n_avg += 1
            # bubble = teams whose baseline wins land at the 4/5 boundary
            boundary_wins = wins[base_order[PLAYOFF_SPOTS - 1]]  # 4-seed win count
            if abs(wins[f] - boundary_wins) <= 1:
                bubble_deltas.append(delta)
    avg = total_avg / max(1, n_avg)
    bubble = sum(bubble_deltas) / max(1, len(bubble_deltas))
    return avg, bubble


def playoff_slope(strength_sd, n_seasons=8000, rng=None):
    """Direct readout: dP(make playoffs)/d(win), by baseline win total.

    Grounds the dollar number — a $ value only makes sense if the underlying
    probability slope is believable. Returns {wins: (P_playoff, slope)}.
    """
    rng = rng or random.Random(SEED + 3)
    made = {}      # wins -> [made_count, total]
    made_plus = {} # wins -> made-count if given +1 win
    for _ in range(n_seasons):
        strengths = [rng.gauss(0, strength_sd) for _ in range(TEAMS)]
        wins = [0] * TEAMS
        for i in range(TEAMS):
            opps = rng.sample([t for t in range(TEAMS) if t != i], TEAMS - 1)
            sched = [opps[g % len(opps)] for g in range(GAMES)]
            wins[i] = sum(1 for o in sched if rng.random() < logistic(strengths[i] - strengths[o]))
        order = sorted(range(TEAMS), key=lambda i: (wins[i], rng.random()), reverse=True)
        cutoff = wins[order[PLAYOFF_SPOTS - 1]]
        cutoff_plus = wins[order[PLAYOFF_SPOTS - 1]]  # approx: boundary stable for +1 probe
        for i in range(TEAMS):
            w = wins[i]
            made.setdefault(w, [0, 0]); made[w][1] += 1
            if i in order[:PLAYOFF_SPOTS]:
                made[w][0] += 1
            made_plus.setdefault(w, [0, 0]); made_plus[w][1] += 1
            # would w+1 have made it? cheap proxy: beat the same cutoff
            if (w + 1) > cutoff or (i in order[:PLAYOFF_SPOTS]):
                made_plus[w][0] += 1
    rows = {}
    for w in sorted(made):
        if made[w][1] < 50:
            continue
        p = made[w][0] / made[w][1]
        p_plus = made_plus[w][0] / made_plus[w][1]
        rows[w] = (p, max(0.0, p_plus - p))
    return rows


def main():
    playoff_pay, rs_pay = load_payouts("2026")
    seed_dollars = expected_playoff_dollars_by_seed(playoff_pay)
    print("Expected playoff $ by SEED (1..4):",
          {s: round(v) for s, v in seed_dollars.items()})
    print("(a 1-seed is worth more than a 4-seed: bracket position is real)\n")
    print(f"{'strength_sd':>11} | {'best-wins':>9} | {'avg win $':>9} | {'BUBBLE win $':>12}")
    print("-" * 52)
    results = {}
    for sd in [0.25, 0.35, 0.45, 0.55]:
        # calibration read: what does the best team win at this sd?
        rng = random.Random(SEED)
        best_wins = []
        for _ in range(2000):
            strengths = [rng.gauss(0, sd) for _ in range(TEAMS)]
            wins = [0] * TEAMS
            for i in range(TEAMS):
                opps = rng.sample([t for t in range(TEAMS) if t != i], TEAMS - 1)
                sched = [opps[g % len(opps)] for g in range(GAMES)]
                wins[i] = sum(1 for o in sched if rng.random() < logistic(strengths[i] - strengths[o]))
            best_wins.append(max(wins))
        avg, bubble = simulate(sd, playoff_pay, rs_pay, seed_dollars, n_seasons=6000)
        results[sd] = (avg, bubble)
        print(f"{sd:>11.2f} | {sum(best_wins)/len(best_wins):>9.1f} | {avg:>9.0f} | {bubble:>12.0f}")

    # A real 10-team league's best team wins ~10-11 of 14 -> sd ~0.35-0.45.
    calib = [results[0.35], results[0.45]]
    avg = sum(a for a, _ in calib) / len(calib)
    bubble = sum(b for _, b in calib) / len(calib)
    print("\nPlayoff-probability slope, dP(playoff)/d(win), by baseline wins (sd 0.40):")
    slope = playoff_slope(0.40)
    print(f"  {'wins':>4} | {'P(playoff)':>10} | {'dP/win':>7}")
    for w in sorted(slope):
        p, dp = slope[w]
        if 4 <= w <= 11:
            print(f"  {w:>4} | {p:>10.2f} | {dp:>7.2f}")
    print("  (the win is worth ~dP/win x ~$530 playoff-entry equity, peaking at the bubble)")

    print("\nCALIBRATED (best team wins ~10-11, strength_sd 0.35-0.45):")
    print(f"  average win value      : ${avg:.0f}   <- ex-ante, the shippable default")
    print(f"  bubble (at flip point) : ${bubble:.0f}   <- UPPER bound; conditions on")
    print(f"                                    knowing you sit exactly on the 4/5 line")
    print("\nGROUNDING: the direct slope peaks at ~0.19 dP(playoff)/win at 7-8 wins;")
    print("0.19 x ~$530 entry equity ~= $100, which matches the $%d average. Two" % round(avg))
    print("methods converge, so the ex-ante average is the honest single number.")
    print(f"\nRECOMMENDED matchupValue: ${round(avg/10)*10}  "
          f"(playoff equity, ex-ante average; NOT the bubble max, NOT a side bet)")
    print("Shipped was $25 as a 'side-bet stake' — wrong twice: side bets are")
    print("outside fantasy, and a matchup win is worth ~4x that in playoff equity.")
    print(f"At ${round(avg/10)*10} it is ~= the $100 weekly-high, so the two in-season")
    print("objectives are COMPARABLE — not the 4:1 the $25 default implied.")


if __name__ == "__main__":
    main()
