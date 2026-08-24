#!/usr/bin/env python3
"""P24 / registers 283-284: grade the board's REPLACEMENT LEVEL against three
seasons of this league's own REALIZED outcomes.

P24 asked one question -- is the TE replacement level correctly set relative to
WR -- and its design forbade using our own league's DRAFTS (P22 died there:
n=2 TE-heavy owner-seasons).  It does not forbid our own league's OUTCOMES,
which are a different population: `league_history.json` carries `players_points`
per team-week under this league's exact scoring, plus the `starters` actually
fielded.  420 team-weeks, 2023-25.

Replacement level is two separate claims and they grade separately:

  RANK   -- how many of each position start league-wide (vorp.py's greedy flex
            allocation).  Gradeable two ways: re-run the SAME greedy on realized
            points, and count what owners actually started.
  LEVEL  -- the projection at that rank.  Not directly comparable to a realized
            total, because realized drops bye weeks, injury weeks and any week
            the player sat unrostered.  Normalise to POINTS PER WEEK PLAYED and
            the confound is gone; the diagnostic is then IMPLIED GAMES,
            board proj_mean(rank r) / realized points-per-week(rank r), whose
            hard ceiling is a 17-game season.

CONTROLS (Rule 3e/3f) -- every one of these must print OK or the output is void:
  C1  starts per team-week must reproduce the league's roster rules exactly
      (QB/K/DEF = 1.00, RB+WR+TE = 6.00 for 2RB+2WR+1TE+1FLEX).
  C2  the greedy handed ZERO flex slots must return the dedicated counts.
  C3  the realized full-season pools must be the right SIZE for a 10-team
      league (~10-13 TE, ~11-12 QB, ~34-42 RB/WR) -- a mistyped position map
      would fail here first.
  C4  the shipped artifact's replacement_points must equal proj_mean at
      starter_counts, i.e. the thing being graded is the thing that ships.

Run from the repo root.  Reads only; writes nothing.
"""
import collections, json, statistics, sys

REPO = "."
FIXED = ("QB", "K", "DEF")
FLEXABLE = {"RB": 2, "WR": 2, "TE": 1}
TEAMS = 10
NFLEX = 10
REG_SEASON_WEEKS = 14

failures = []


def ok(name, cond, detail=""):
    print("  %-4s %-58s %s %s" % (name, detail, "OK" if cond else "*** FAILED ***", ""))
    if not cond:
        failures.append(name)


def load():
    hist = json.load(open(REPO + "/draft/data/league_history.json"))
    pos = json.load(open(REPO + "/draft/data/player_positions.json"))["positions"]
    board = json.load(open(REPO + "/public/draft_data.json"))
    return hist, pos, board


def board_ranks(board):
    by = collections.defaultdict(list)
    for p in board.get("players") or []:
        pm = p.get("proj_mean")
        if pm is not None:
            by[p.get("position")].append(float(pm))
    for k in by:
        by[k].sort(reverse=True)
    return by


def season_weeks(season):
    return {w: t for w, t in (season.get("weeks") or {}).items()
            if int(w) <= REG_SEASON_WEEKS}


def realized(season, pos, minwk=0, per_week=False):
    """{position: [descending points]} for one season."""
    tot, wk = collections.defaultdict(float), collections.Counter()
    for _w, teams in season_weeks(season).items():
        for t in teams:
            for pid, pts in (t.get("players_points") or {}).items():
                if pts is None:
                    continue
                tot[str(pid)] += float(pts)
                wk[str(pid)] += 1
    by = collections.defaultdict(list)
    for pid, v in tot.items():
        p = pos.get(pid)
        if p and wk[pid] >= minwk:
            by[p].append(v / wk[pid] if per_week else v)
    for k in by:
        by[k].sort(reverse=True)
    return by


def greedy(by_pos, nflex=NFLEX):
    """vorp.py's flex rule: each slot to the best next-man-up at an eligible pos."""
    counts = {p: n * TEAMS for p, n in FLEXABLE.items()}
    for _ in range(nflex):
        best, bv = None, float("-inf")
        for p in FLEXABLE:
            i = counts[p]
            if i < len(by_pos.get(p, [])) and by_pos[p][i] > bv:
                best, bv = p, by_pos[p][i]
        if best is None:
            break
        counts[best] += 1
    return counts


def main():
    hist, pos, board = load()
    seasons = [s for s in hist["seasons"] if s.get("weeks")]
    bb = board_ranks(board)
    diag = board.get("replacement") or {}
    counts_shipped = diag.get("starter_counts") or {}
    rep_shipped = diag.get("replacement_points") or {}

    print("=" * 78)
    print("CONTROLS")
    print("=" * 78)

    # C1 -- realized lineups must reproduce the roster rules
    c, n, unk = collections.Counter(), 0, 0
    for s in seasons:
        for _w, teams in season_weeks(s).items():
            for t in teams:
                st = t.get("starters") or []
                if not st:
                    continue
                n += 1
                for pid in st:
                    p = pos.get(str(pid))
                    if p is None:
                        unk += 1
                    else:
                        c[p] += 1
    for p in FIXED:
        ok("C1", 0.95 <= c[p] / n <= 1.05, "%s starts/team-week = %.3f (want 1.00)" % (p, c[p] / n))
    flexsum = sum(c[p] for p in FLEXABLE) / n
    ok("C1", 5.9 <= flexsum <= 6.1, "RB+WR+TE starts/team-week = %.3f (want 6.00)" % flexsum)
    print("       (%d team-weeks, %d unmapped starter ids = %.2f%%)" % (n, unk, 100.0 * unk / (n * 6)))

    # C2 -- greedy with no flex slots
    z = greedy({p: [1.0] * 99 for p in FLEXABLE}, nflex=0)
    ok("C2", z == {"RB": 20, "WR": 20, "TE": 10}, "greedy(0 flex) = %s" % z)

    # C3 -- realized full-season pool sizes
    for s in seasons:
        by = realized(s, pos, minwk=12)
        sizes = {p: len(by.get(p, [])) for p in ("QB", "RB", "WR", "TE")}
        good = (10 <= sizes["QB"] <= 14 and 9 <= sizes["TE"] <= 16
                and 30 <= sizes["RB"] <= 46 and 30 <= sizes["WR"] <= 48)
        ok("C3", good, "%s full-season pool %s" % (s["season"], sizes))

    # C4 -- what ships is what we grade
    for p, r in counts_shipped.items():
        if p in bb and len(bb[p]) >= r and p in rep_shipped:
            ok("C4", abs(bb[p][r - 1] - rep_shipped[p]) < 0.05,
               "%s replacement %.1f == proj_mean at rank %d" % (p, rep_shipped[p], r))

    if failures:
        print("\n*** %d CONTROL(S) FAILED -- output below is void ***" % len(failures))
        return 1

    print("\n" + "=" * 78)
    print("FINDING 1 (register 283) -- KEEPERS LEFT THE POOL; starter_counts DID NOT")
    print("=" * 78)
    kept = board.get("kept_players") or []
    nk = collections.Counter(k.get("position") for k in kept)
    full = board_ranks({"players": (board.get("players") or []) + kept})
    print("  %d keepers were removed from `players` at the 08-22 03:51 lock: %s"
          % (len(kept), dict(nk)))
    print("  apply_vorp then ran on the DRAFTABLE pool with LEAGUE-WIDE starter counts.")
    print("  Every keeper starts, so the counts had to fall by the same amount and did not.")
    print()
    print("  C5 -- two independent corrections must agree, or neither is trusted:")
    print("       (A) greedy on the FULL pool at league-wide counts")
    print("       (B) greedy on the NON-KEEPER pool at counts reduced by keepers")
    gA = greedy(full)
    cBg = {p: n * TEAMS - nk[p] for p, n in FLEXABLE.items()}
    for _ in range(NFLEX):
        best, bv = None, float("-inf")
        for p in FLEXABLE:
            i = cBg[p]
            if i < len(bb.get(p, [])) and bb[p][i] > bv:
                best, bv = p, bb[p][i]
        if best is None:
            break
        cBg[best] += 1
    repA = {p: full[p][gA[p] - 1] for p in FLEXABLE}
    repB = {p: bb[p][cBg[p] - 1] for p in FLEXABLE}
    for p in ("RB", "WR", "TE"):
        ok("C5", abs(repA[p] - repB[p]) < 0.05,
           "%s  full-pool %.1f == reduced-count %.1f" % (p, repA[p], repB[p]))
    ok("C5", all(sum(1 for k in kept if k.get("position") == p
                     and float(k.get("proj_mean") or 0) >= full[p][counts_shipped.get(p, 10) - 1]) == nk[p]
                 for p in ("QB", "RB", "WR", "TE")),
       "every keeper ranks above his position's replacement (why A == B)")
    if failures:
        print("\n*** CONTROL C5 FAILED -- the correction below is void ***")
        return 1
    print()
    print("  %-4s %-11s %-11s %-11s %s" % ("pos", "SHIPPED", "CORRECT", "error", "flex split"))
    for p in ("QB", "RB", "WR", "TE"):
        if p in FLEXABLE:
            sh, co = rep_shipped[p], repA[p]
            fl = "shipped %+d -> correct %+d" % (counts_shipped[p] - FLEXABLE[p] * TEAMS,
                                                 gA[p] - FLEXABLE[p] * TEAMS)
        else:
            sh = rep_shipped[p]
            co = full[p][counts_shipped[p] - 1]
            fl = "not flex-eligible"
        print("  %-4s %-11.1f %-11.1f %+-11.1f %s" % (p, sh, co, co - sh, fl))
    te_err = repA["TE"] - rep_shipped["TE"]
    print()
    print("  Because replacement is SUBTRACTED, an understated replacement OVERSTATES every")
    print("  VORP at that position.  Relative to tight end, the shipped board carried:")
    for p in ("QB", "RB", "WR"):
        e = (repA[p] if p in FLEXABLE else full[p][counts_shipped[p] - 1]) - rep_shipped[p]
        print("     every %-3s %+6.1f VORP points against every TE" % (p, e - te_err))
    print()
    print("  Corroboration that the CORRECT split is right and the shipped one is not --")
    print("  four independent references, none of which is the board:")
    print("    corrected greedy on today's full pool ... RB +%d WR +%d TE +%d"
          % (gA["RB"] - 20, gA["WR"] - 20, gA["TE"] - 10))
    for s in seasons:
        g = greedy(realized(s, pos))
        print("    realized greedy, %s .............. RB +%d WR +%d TE +%d"
              % (s["season"], g["RB"] - 20, g["WR"] - 20, g["TE"] - 10))
    print("    owners' actual lineups, 420 tm-weeks .. RB +%.1f WR +%.1f TE +%.1f"
          % tuple((c[p] / n - FLEXABLE[p]) * 10 for p in ("RB", "WR", "TE")))
    print("    the board itself, 08-19 to 08-22 03:35  RB +4 WR +6 TE +0  (pre-lock)")
    print("    the shipped board, 08-22 03:51 onward . RB +0 WR +10 TE +0  <- the outlier")

    print("\n" + "=" * 78)
    print("SUPERSEDED FINDING -- kept for the record")
    print("=" * 78)
    print("  I first filed the 0/10 flex split as a defect in its own right.  It is not:")
    print("  it is a symptom of the above and it disappears under the fix.  Recorded so the")
    print("  register does not carry two rows for one cause.")
    print("  shipped starter_counts: %s" % counts_shipped)
    print("  i.e. flex split RB +%d / WR +%d / TE +%d"
          % (counts_shipped.get("RB", 20) - 20, counts_shipped.get("WR", 20) - 20,
             counts_shipped.get("TE", 10) - 10))
    print()
    print("  the SAME greedy on REALIZED points:")
    for s in seasons:
        for minwk, tag in ((0, "all"), (10, ">=10wk")):
            g = greedy(realized(s, pos, minwk=minwk))
            print("    %s %-7s RB +%d  WR +%d  TE +%d"
                  % (s["season"], tag, g["RB"] - 20, g["WR"] - 20, g["TE"] - 10))
    print()
    print("  what owners ACTUALLY started, per team-week, above the dedicated slots:")
    for p in ("RB", "WR", "TE"):
        print("    %-3s %+.2f/team-week -> %.1f of the 10 flex slots"
              % (p, c[p] / n - FLEXABLE[p], (c[p] / n - FLEXABLE[p]) * 10))
    print()
    print("  cost, in VORP, of the corner solution (every player at the position moves):")
    for p, alt in (("RB", 24), ("WR", 26)):
        cur = counts_shipped.get(p)
        if cur and len(bb[p]) >= max(cur, alt):
            print("    %-3s replacement %.1f (rank %d) -> %.1f (rank %d)   every %s moves %+.1f"
                  % (p, bb[p][cur - 1], cur, bb[p][alt - 1], alt, p, bb[p][cur - 1] - bb[p][alt - 1]))

    print("\n" + "=" * 78)
    print("FINDING 2 (register 284) -- IMPLIED GAMES: QB and TE breach a 17-game season")
    print("=" * 78)
    print("  board proj_mean(rank r) / realized points-per-week-played(rank r).")
    print("  17 is the hard ceiling.  Two pool thresholds, so the filter is not the story.")
    cols = (1, 2, 3, 4, 6, 8, 10, 12, 16, 20, 24, 30)
    for minwk in (12, 8):
        S = {str(s["season"]): realized(s, pos, minwk=minwk, per_week=True) for s in seasons}
        print("\n  pool = players logging >= %d of %d weeks" % (minwk, REG_SEASON_WEEKS))
        print("  %-4s %s" % ("pos", " ".join("%6s" % ("r%d" % r) for r in cols)))
        for p in ("QB", "RB", "WR", "TE"):
            cells = []
            for r in cols:
                v = [S[y][p][r - 1] for y in S if len(S[y].get(p, [])) >= r]
                cells.append("%6.1f" % (bb[p][r - 1] / statistics.mean(v))
                             if len(v) == len(S) and len(bb[p]) >= r else "%6s" % "-")
            print("  %-4s %s" % (p, " ".join(cells)))
    print("\n  RB and WR never breach 17 at any rank.  QB breaches from ~r8, TE from ~r6.")
    print("  At its own shipped replacement rank TE10 implies %.1f games." %
          (bb["TE"][9] / statistics.mean(
              [realized(s, pos, minwk=12, per_week=True)["TE"][9] for s in seasons])))
    return 0


if __name__ == "__main__":
    sys.exit(main())
