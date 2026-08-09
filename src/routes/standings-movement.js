'use strict';
//
// STANDINGS RANK-MOVEMENT — week-over-week arrows, computed, not stored.
//
// Sleeper's standings are cumulative-through-now. To know who CLIMBED, subtract
// the most recent completed week's result from the cumulative totals, re-rank
// that "as of last week" table, and diff the ranks. Pure over (current
// standings, that week's box scores) — no history file, no snapshot to keep in
// sync. It stays dormant (returns {}) until there are enough completed weeks for
// a previous ranking to mean anything, then lights up on its own.
//
// This describes WHAT HAPPENED in the standings — a RESULT — so it is league-
// visible, not a commissioner tool.

// Standings sort, identical to sleeper.standings(): wins, then points-for.
function rankBy(rows) {
  const sorted = [...rows].sort((a, b) => b.wins - a.wins || b.pf - a.pf);
  const rank = {};
  sorted.forEach((r, i) => { rank[r.roster_id] = i + 1; });
  return rank;
}

/**
 * @param curStandings  sleeper.standings() rows — { roster_id, owner_id, wins, losses, ties, pf, rank }
 * @param weekMatchups  the MOST RECENT completed week's matchups — [{ roster_id, matchup_id, points }]
 * @returns { [owner_id]: { delta, prevRank, curRank } }  delta>0 climbed, <0 fell, 0 held
 *          Empty object when movement can't be established (no week data, or the
 *          subtracted week would leave a meaningless all-zero prior).
 */
function rankMovement(curStandings, weekMatchups) {
  if (!Array.isArray(curStandings) || curStandings.length < 2) return {};
  if (!Array.isArray(weekMatchups) || !weekMatchups.length) return {};

  // Per-roster result IN the most recent week: points, and W/L/T from the pairing.
  const byMatch = {};
  for (const m of weekMatchups) {
    if (m.roster_id == null) continue;
    (byMatch[m.matchup_id != null ? m.matchup_id : `solo:${m.roster_id}`] ??= []).push(m);
  }
  const weekResult = {};   // roster_id -> { pts, w, l, t }
  for (const pair of Object.values(byMatch)) {
    if (pair.length === 2) {
      const [x, y] = pair;
      const xp = Number(x.points) || 0, yp = Number(y.points) || 0;
      const tie = xp === yp;
      weekResult[x.roster_id] = { pts: xp, w: !tie && xp > yp ? 1 : 0, l: !tie && xp < yp ? 1 : 0, t: tie ? 1 : 0 };
      weekResult[y.roster_id] = { pts: yp, w: !tie && yp > xp ? 1 : 0, l: !tie && yp < xp ? 1 : 0, t: tie ? 1 : 0 };
    } else {
      // Bye / unpaired: count points only, no W/L attributed.
      for (const m of pair) weekResult[m.roster_id] = { pts: Number(m.points) || 0, w: 0, l: 0, t: 0 };
    }
  }

  // Reconstruct "as of last week" by removing this week's contribution.
  const prevRows = curStandings.map(r => {
    const wr = weekResult[r.roster_id] || { pts: 0, w: 0, l: 0, t: 0 };
    return {
      roster_id: r.roster_id,
      wins: Math.max(0, (r.wins || 0) - wr.w),
      losses: Math.max(0, (r.losses || 0) - wr.l),
      ties: Math.max(0, (r.ties || 0) - wr.t),
      pf: Math.max(0, (r.pf || 0) - wr.pts),
    };
  });

  // If nobody had a game before this week (the prior is all-zero), a rank diff is
  // noise off a flat start — stay dormant.
  const priorGames = prevRows.some(r => r.wins + r.losses + r.ties > 0);
  if (!priorGames) return {};

  const prevRank = rankBy(prevRows);
  const curRank = {};
  curStandings.forEach(r => { curRank[r.roster_id] = r.rank != null ? r.rank : null; });
  // Fall back to computing current rank if rows didn't carry one.
  if (curStandings.some(r => curRank[r.roster_id] == null)) {
    const cr = rankBy(curStandings.map(r => ({ roster_id: r.roster_id, wins: r.wins || 0, pf: r.pf || 0 })));
    for (const r of curStandings) curRank[r.roster_id] = cr[r.roster_id];
  }

  const out = {};
  for (const r of curStandings) {
    if (r.owner_id == null) continue;
    const pr = prevRank[r.roster_id], cur = curRank[r.roster_id];
    if (pr == null || cur == null) continue;
    out[r.owner_id] = { delta: pr - cur, prevRank: pr, curRank: cur };
  }
  return out;
}

module.exports = { rankMovement, rankBy };
