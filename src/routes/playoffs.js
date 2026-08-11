// ─────────────────────────────────────────────────────────────────────────────
// THE FOLDED COLUMNS — the playoff picture, folded into the standings instead of
// living on a page of its own:
//   • a playoff-odds column with week-over-week MOVEMENT (▲/▼),
//   • CLINCH and ELIMINATION markers (exact, bound-based — "can't possibly"),
//   • and, for the matchup screen, ONE line on what this week's game is worth
//     (how much your odds swing on a win vs a loss).
//
// Odds are DERIVED, not declared: a Monte-Carlo of the rest of the season off
// each team's record and points-for strength. It is LABELLED as B's estimate and
// swaps cleanly for A's championship-probability model when that lands (the same
// placeholder→real pattern the pool advisor uses) — the surfaces read `odds`
// either way. The simulation is SEEDED from the standings themselves, so the
// number only moves when the standings move, which is exactly what makes the
// week-over-week arrow honest rather than RNG jitter.
//
// Everything is league-visible (it describes the race, a RESULT-in-progress —
// ACCESS-RULE.md) and dormant until the season produces records, so it renders
// nothing pre-season and lights up on its own.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const CFG = {
  ITERS: 4000,                 // enough for ±~1% on a 10-team league; deterministic seed
  MIN_P: 0.15, MAX_P: 0.85,    // no team is a lock or a zero in a single game
  STRENGTH_K: 0.9,             // how hard points-for tilts a game's win prob
};

// A tiny seeded PRNG (LCG). Seeded from the standings so identical standings
// always yield identical odds — the arrow then reflects a real change, not noise.
function lcg(seed) {
  let s = (seed >>> 0) || 1;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}
function seedFrom(rows, gamesLeft) {
  let h = 2166136261 >>> 0;
  const push = n => { h ^= (Number(n) || 0) & 0xffff; h = Math.imul(h, 16777619) >>> 0; };
  for (const r of rows) { push(r.wins); push(r.losses); push(Math.round((r.pf || 0) * 10)); }
  push(gamesLeft);
  return h;
}

/** Regular-season games each team has left. Never negative. */
function gamesRemaining(week, regularSeasonWeeks) {
  const played = Math.max(0, (Number(week) || 1) - 1);
  return Math.max(0, (Number(regularSeasonWeeks) || 14) - played);
}

/** Per-game win probability from points-for strength, relative to the field. */
function winProb(row, meanPF, spreadPF) {
  if (!spreadPF) return 0.5;
  const z = (row.pf - meanPF) / spreadPF;
  const p = 0.5 + CFG.STRENGTH_K * 0.5 * Math.tanh(z);
  return Math.max(CFG.MIN_P, Math.min(CFG.MAX_P, p));
}

/**
 * CLINCH / ELIMINATION — exact, schedule-agnostic bounds. A team is:
 *   • ELIMINATED if even winning out it can't catch `cut` teams' current wins,
 *   • CLINCHED if fewer than `cut` teams can reach it even losing out,
 *   • otherwise ALIVE.
 *
 * THE TIEBREAK IS NOT A DETAIL. This counted only teams whose best case was
 * STRICTLY GREATER than a team's current wins, so anyone who could merely draw
 * LEVEL was ignored — and level is settled on points-for, which a team can
 * lose. A 9–4 team in the final week with the worst points-for in the league,
 * with five 8–5 teams behind it, was badged "🔒 IN — clinched a playoff spot"
 * on a table where a perfectly ordinary set of results leaves it TENTH.
 * "Clinched" is the one word here that claims certainty, and it was the one
 * that wasn't.
 *
 * And with the season over this still worked in bounds, so a team that finished
 * FIFTH on the points tiebreak — a real, common finish — was badged clinched
 * while the odds column beside it, which does break ties on points, read 0%.
 * Two derivations of the same fact, disagreeing on the page. Once there are no
 * games left the table IS the answer, so it is read directly, ordered exactly
 * the way simOdds orders it.
 *
 * @param rows      [{owner_id, wins, losses, pf}]
 * @param gamesLeft games each team has remaining
 * @param cut       playoff spots (top `cut` make it)
 * @returns { [owner_id]: { status: 'clinched'|'eliminated'|'alive', rank } }
 */
function clinchElim(rows, gamesLeft, cut) {
  const out = {};
  if (!rows.length || !cut || cut >= rows.length) {
    for (const r of rows) out[r.owner_id] = { status: 'alive', rank: null };
    return out;
  }
  // The same order simOdds finishes on — wins, then points-for.
  const sorted = [...rows].sort((a, b) => b.wins - a.wins || b.pf - a.pf);

  // No games left: nothing is a bound any more, it is a result.
  if (!gamesLeft) {
    sorted.forEach((r, i) => { out[r.owner_id] = { status: i < cut ? 'clinched' : 'eliminated', rank: i + 1 }; });
    return out;
  }

  const bestCase = r => r.wins + gamesLeft;                 // wins if it wins out
  for (let i = 0; i < sorted.length; i++) {
    const r = sorted[i];
    // Guaranteed to finish ahead: current wins this team cannot reach even
    // winning out. Strict, because a team it can draw level with might lose the
    // tiebreak — declaring someone OUT has to stay the conservative call.
    const cantCatch = sorted.filter(o => o.owner_id !== r.owner_id && o.wins > bestCase(r)).length;
    // Could still finish above it: >= , not >. Drawing level is enough, because
    // level is decided on points-for and that is not in this team's hands.
    const couldPass = sorted.filter(o => o.owner_id !== r.owner_id && bestCase(o) >= r.wins).length;
    let status = 'alive';
    if (cantCatch >= cut) status = 'eliminated';           // cut or more locked ahead
    else if (couldPass < cut) status = 'clinched';         // fewer than `cut` can reach it → safe
    out[r.owner_id] = { status, rank: i + 1 };
  }
  return out;
}

/**
 * Playoff odds by Monte-Carlo. Deterministic given the standings (seeded), so it
 * is stable enough that a change in the odds means a change in the race.
 * @returns { [owner_id]: probability 0..1 }
 */
function simOdds(rows, gamesLeft, cut, opts = {}) {
  const out = {};
  for (const r of rows) out[r.owner_id] = 0;
  if (!rows.length || !cut) return out;
  if (cut >= rows.length) { for (const r of rows) out[r.owner_id] = 1; return out; }
  if (gamesLeft === 0) {
    // Season over — the current top `cut` are in, no simulation needed.
    const fin = [...rows].sort((a, b) => b.wins - a.wins || b.pf - a.pf);
    fin.forEach((r, i) => { out[r.owner_id] = i < cut ? 1 : 0; });
    return out;
  }
  const meanPF = rows.reduce((s, r) => s + (r.pf || 0), 0) / rows.length;
  const spreadPF = Math.sqrt(rows.reduce((s, r) => s + Math.pow((r.pf || 0) - meanPF, 2), 0) / rows.length) || 1;
  const p = {}; for (const r of rows) p[r.owner_id] = winProb(r, meanPF, spreadPF);
  const iters = opts.iters || CFG.ITERS;
  const rand = lcg(opts.seed || seedFrom(rows, gamesLeft));
  const tmp = new Array(rows.length);
  for (let it = 0; it < iters; it++) {
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      let w = r.wins;
      for (let g = 0; g < gamesLeft; g++) if (rand() < p[r.owner_id]) w++;
      // Small PF jitter breaks ties the way points-for does, without a schedule.
      tmp[i] = { id: r.owner_id, w, tie: (r.pf || 0) + rand() * 0.001 };
    }
    tmp.sort((a, b) => b.w - a.w || b.tie - a.tie);
    for (let i = 0; i < cut; i++) out[tmp[i].id]++;
  }
  for (const r of rows) out[r.owner_id] = out[r.owner_id] / iters;
  return out;
}

/**
 * What THIS week's game is worth to one owner: the swing in their playoff odds
 * between winning and losing it, holding everyone else's simulation identical.
 * Returns null when there's nothing at stake (no games left / not in the field).
 *
 * `exact` says whether a 0 or a 1 in here is a FACT or a sampling artifact, and
 * only this function knows. With one game left the inner simOdds runs its
 * season-over branch and the answers are the final table — exact. Any earlier
 * week, they are counts out of CFG.ITERS, so 0 means "none of 4,000", not
 * "eliminated": a 2–10 team with eight games left scored a true 0 here and
 * /matchup told it "a win puts you at 0% to make the playoffs". Consumers must
 * not print a bare 0%/100% off an inexact value — see routes/oddstext.js.
 *
 * @returns { win, lose, swing, exact } probabilities, or null
 */
/* HOW MANY TEAMS MAKE THE PLAYOFFS — THE ONE DEFINITION.
 *
 * This rule was written out SIX times across the site (`settings.playoff_teams
 * || 4`) and, in the weekly recap, an outright hardcoded 6. Six copies that
 * happened to agree and one that did not, with nothing comparing them: the
 * email told nine people a playoff picture computed on a six-team cut while
 * every page they could check it against used four.
 *
 * The default of 4 is not a guess — it is what every other surface has always
 * used, so the recap was the outlier and this makes the agreement structural
 * rather than coincidental.
 */
function playoffCut(leagueOrSettings) {
  const s = (leagueOrSettings && leagueOrSettings.settings) || leagueOrSettings || {};
  return Number(s.playoff_teams) || 4;
}

function matchupLeverage(rows, gamesLeft, cut, ownerId) {
  if (!gamesLeft || cut >= rows.length) return null;
  const seed = seedFrom(rows, gamesLeft);
  // Force this owner's result for THIS game: +1 win & one fewer game left, vs
  // a loss & one fewer game left. The rest simulate over the remaining games.
  const bump = (delta) => rows.map(r => r.owner_id === ownerId
    ? { ...r, wins: r.wins + delta } : { ...r });
  const winOdds = simOdds(bump(1), gamesLeft - 1, cut, { seed })[ownerId];
  const loseOdds = simOdds(bump(0), gamesLeft - 1, cut, { seed })[ownerId];
  if (winOdds == null || loseOdds == null) return null;
  return { win: winOdds, lose: loseOdds, swing: winOdds - loseOdds, exact: gamesLeft - 1 === 0 };
}

/** Combine odds + movement + clinch/elim into one per-owner picture for a view.
 *
 *  `magic` and `tragic` used to ride along here. Nothing has ever read them —
 *  not a view, not a route, not a test — and both were computed by the same
 *  tie-blind arithmetic that made "clinched" wrong above, so they were two more
 *  numbers that would have been quietly false the day something rendered them.
 *  Deleted rather than fixed: the fix would have had no consumer either. */
function picture(rows, gamesLeft, cut, prevOdds = null) {
  const odds = simOdds(rows, gamesLeft, cut);
  const ce = clinchElim(rows, gamesLeft, cut);
  const out = {};
  for (const r of rows) {
    const o = odds[r.owner_id];
    const prev = prevOdds && prevOdds[r.owner_id] != null ? prevOdds[r.owner_id] : null;
    out[r.owner_id] = {
      odds: o,
      delta: prev == null ? null : o - prev,
      status: (ce[r.owner_id] || {}).status || 'alive',
    };
  }
  return out;
}

module.exports = { CFG, gamesRemaining, playoffCut, winProb, clinchElim, simOdds, matchupLeverage, picture, seedFrom };
